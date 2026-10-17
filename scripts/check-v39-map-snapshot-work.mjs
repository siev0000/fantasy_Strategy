import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/map-snapshot-work';
mkdirSync(out,{recursive:true});
const baseline=process.env.V39_RENDER_BASELINE==='1';
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
  });
  await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const reports=[];
  for(const world of ['large-surface','cave']) {
    const setup=await page.evaluate(async world=>{
      if(world==='large-surface') {
        const data=window.generateV39TestFieldWithSeed({w:100,h:100,patternId:'realistic'},'snapshot-work-100');
        while(window.getV39ActiveFactionState().villagePlacementMode) {
          let tile=null;
          for(let y=1;y<data.h-1&&!tile;y++) for(let x=1;x<data.w-1;x++) {
            const candidate={x,y,terrain:data.grid[y][x]};
            if(window.canPlaceV39InitialBase(candidate)){tile=candidate;break;}
          }
          if(!tile||!window.placeV39InitialBase(tile))throw new Error('native initial placement failed');
        }
        const faction=window.getV39ActiveFactionState(),template=faction.units[0];
        const positions=[];
        for(let y=1;y<data.h-1;y++) for(let x=1;x<data.w-1;x++) if(!['海','湖','火山'].includes(data.grid[y][x])) positions.push({x,y});
        assertPositions(positions);
        const units=positions.slice(0,40).map((p,index)=>({...template,...p,id:`snapshot-work-${index}`,worldId:'surface'}));
        window.updateV39ActiveFactionState({units:[...units,...faction.units.filter(u=>u.worldId&&u.worldId!=='surface')],selectedUnitId:units[0].id},{reason:'snapshot-work-setup'});
        // Measure rendering, not the random population produced by initial placement.
        window.setV39GameState({enemies:[],enemyNests:[],neutralVillages:[]},{reason:'snapshot-work-population'});
      } else window.viewV39ExpeditionTestWorld('cave:expedition-test:1');
      await new Promise(resolve=>setTimeout(resolve,700));
      const state=window.getV39GameState(),data=window.__v39FieldRuntime.mapData;
      return {w:data.w,h:data.h,worldId:state.activeWorldId,units:window.getV39ActiveFactionState().units.length,
        savedWorlds:Object.keys(state.explorationWorlds)};
      function assertPositions(positions){if(positions.length<40)throw new Error('insufficient generated land');}
    },world);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
    const report=await page.evaluate(async()=>{
      const stateGetter=window.getV39GameState,factionGetter=window.getV39ActiveFactionState;
      let reads=0,worldCopies=0,factions=0,stateMs=0;
      window.getV39GameState=(options)=>{reads++;if(options?.includeWorlds!==false)worldCopies++;const t=performance.now();const value=stateGetter(options);stateMs+=performance.now()-t;return value;};
      window.getV39ActiveFactionState=(...args)=>{factions++;return factionGetter(...args);};
      try {
        const current=factionGetter(),ids=current.units.filter(u=>(u.worldId||'surface')===(stateGetter({includeWorlds:false}).activeWorldId||'surface')).map(u=>u.id);
        if(!ids.length)throw new Error('no units in measured world');
        const markers=()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
          .find(node=>node.name==='v39-unit-layer').list.filter(node=>node.name==='v39-specialty-marker');
        const previousMarkers=new Map(markers().map(marker=>[marker.getData('tileKey'),marker]));
        const values=[];
        // HP changes also invalidate one-unit cave selections, so all samples rebuild markers.
        for(let index=0;index<3;index++) {
          window.updateV39ActiveFactionState({selectedUnitId:ids[index%ids.length],
            units:current.units.map(u=>u.id===ids[0]?{...u,hp:u.hp-index-1}:u)},{silent:true});
          reads=0;worldCopies=0;factions=0;stateMs=0;
          const started=performance.now();
          window.refreshV39MapEntities();
          values.push({ms:performance.now()-started,stateMs,reads,worldCopies,factions});
        }
        const active=stateGetter({includeWorlds:false}).activeWorldId;
        const visibleIds=current.units.filter(u=>(u.worldId||'surface')===active).map(u=>u.id);
        const state=stateGetter({includeWorlds:false});
        reads=0;worldCopies=0;
        window.renderV39Visibility();
        const visibility={reads,worldCopies};
        return {samples:values,specialties:Object.keys(state.specialtiesByTile).length,settlements:state.settlements.length,
          retainedSpecialtyMarkers:markers().filter(marker=>previousMarkers.get(marker.getData('tileKey'))===marker).length,
          expectedSpecialtyMarkers:previousMarkers.size,visibility,
          renderedUnits:visibleIds.filter(id=>window.getV39MapEntityMarker(id)).length,
          expectedUnits:visibleIds.length};
      } finally {window.getV39GameState=stateGetter;window.getV39ActiveFactionState=factionGetter;}
    });
    const {profile}=await cdp.send('Profiler.stop');await cdp.detach();
    writeFileSync(`${out}/${baseline?'before':'after'}-${world}.cpuprofile`,JSON.stringify(profile));
    if(!baseline) for(const sample of report.samples) {
      assert.equal(sample.reads,1,'marker render shares one detached state snapshot');
      assert.equal(sample.worldCopies,0,'marker render excludes saved maps');
      assert.equal(sample.factions,0,'active faction comes from that same snapshot');
    }
    assert.equal(report.renderedUnits,report.expectedUnits,'all active-world friendly markers remain available');
    if(!baseline) {
      assert.equal(report.retainedSpecialtyMarkers,report.expectedSpecialtyMarkers,'HP updates reuse specialty textures');
      assert.equal(report.visibility.worldCopies,0,'visibility does not clone saved maps');
    }
    if(process.env.V39_PROFILE_TURN==='1') {
      report.turn=await page.evaluate(async()=>{
        const original=window.getV39GameState,before=original({includeWorlds:false}).timeline.turnNumber;
        let reads=0,worldCopies=0,readMs=0;const byCaller={};
        window.getV39GameState=(options)=>{
          reads++;if(options?.includeWorlds!==false)worldCopies++;
          const caller=new Error().stack.split('\n')[2]?.trim()||'unknown';
          const started=performance.now();const result=original(options),ms=performance.now()-started;readMs+=ms;
          const row=byCaller[caller]||={reads:0,worldCopies:0,ms:0};row.reads++;row.ms+=ms;
          if(options?.includeWorlds!==false)row.worldCopies++;
          return result;
        };
        const started=performance.now();
        try {
          await window.advanceV39Turn({skipUnactedFocus:true});
          await window.waitForV39MapRenderSettled();
          return {elapsedMs:performance.now()-started,reads,worldCopies,readMs,byCaller,before,
            after:original({includeWorlds:false}).timeline.turnNumber,stages:window.getV39LastTurnPerformance()};
        } finally {window.getV39GameState=original;}
      });
      assert.equal(report.turn.after,report.turn.before+1,'profile advances one actual world turn');
    }
    reports.push({world,...setup,...report});
    await page.screenshot({path:`${out}/${baseline?'before':'after'}-${world}.png`});
  }
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}/${baseline?'before':'after'}.json`,JSON.stringify(reports,null,2));
  console.log(JSON.stringify(reports,null,2));
} finally {await browser.close();}
