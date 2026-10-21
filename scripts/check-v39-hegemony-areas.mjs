import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const url=process.env.V39_TEST_URL||'http://127.0.0.1:3024';
mkdirSync('output/web-game/hegemony',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39HegemonyAreaTest();});
  await page.waitForFunction(()=>window.__v39FieldRuntime?.game?.scene.getScenes(true)[0]?.children.list
    .find(child=>child.name==='v39-victory-landmark-overlay')?.list.filter(child=>child.name==='v39-victory-landmark-image').length===4);
  const hub=await page.evaluate(()=>{const state=window.getV39GameState();return {world:state.activeWorldId,entries:window.__v39FieldRuntime.mapData.hegemonyEntrances,
    markers:Object.values(state.victoryLandmarksByTile).map(marker=>({name:marker.name,count:marker.occupiedTileKeys.length})),
    units:state.players[0].factionState.units.map(unit=>({level:unit.level,movement:unit.status.移動,
      ordinaryMovement:window.applyV39DerivedCharacterData({...unit,testOnly:false}).status.移動})),
    seaWalkable:window.canUnitEnterV39Tile(window.__v39FieldRuntime.mapData,11,9,state.players[0].factionState.units[0])};});
  assert.equal(hub.world,'surface');assert.equal(hub.entries.length,4);
  assert.equal(hub.markers.length,4);assert(hub.markers.every(marker=>marker.count===7));
  assert(hub.units.every(unit=>unit.level===30&&unit.movement>=120));
  assert(hub.units.every(unit=>unit.ordinaryMovement<120));assert(hub.seaWalkable);
  await page.screenshot({path:`output/web-game/hegemony/hub-${width}.png`});
  for(const id of ['sun','tree','crater','sea']){
   const report=await page.evaluate(async id=>{
    const before=window.getV39GameState(),entry=window.__v39FieldRuntime.mapData.hegemonyEntrances.find(row=>row.areaId===id);
    window.setV39GameState({players:before.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:entry.x,y:entry.y}:u)}}))});
    window.refreshV39SquadDerivedUI();
    const action=document.getElementById('v39-cave-enter-action');
    if(action.hidden||!action.textContent.includes(entry.name))throw Error('Missing entrance action '+id);
    action.click();await window.waitForV39MapRenderSettled();
    const started={ok:window.getV39GameState().activeWorldId===`hegemony-test:${id}`};
    const runtime=window.__v39FieldRuntime,map=runtime.mapData,state=window.getV39GameState();
    const original=JSON.stringify(map.grid);map.hegemonyVisitMarker=id;
    const player=state.players[0],unit=player.factionState.units[0],world=state.activeWorldId;
    const key=map.hegemonyZoneKeys.find(key=>{const [x,y]=key.split(',').map(Number);return map.grid[y][x]!=='海';}),[x,y]=key.split(',').map(Number);
    let mechanics={};
    // Import the pure implementation only on the source server; production tests still cover world/renderer/save.
    if(location.port==='3024'){
     const {tickV39HegemonyArea}=await import('/src/lib/v39-hegemony-area-effects.js');
     const {hegemonyLightMultiplier}=await import('/src/lib/v39-hegemony-areas.js');
     const {findV39CavePath}=await import('/src/lib/v39-cave-generator.js');
     const {inspectV39EnvironmentEffectsAt}=await import('/src/lib/v39-atmosphere-display.js');
     const {computeAttackDamage}=await import('/src/lib/v39-combat-engine.js');
     const test={...unit,x,y,hp:50,currentHp:50,maxHp:100,status:{防御:0,精神:0,炎耐性:0},hegemonyTick:null};
     const enemy={...test,id:'area-enemy',name:'確認用敵'};
     const input={...state,enemies:[enemy],players:[{...player,factionState:{...player.factionState,units:[test,{...test,id:'other-world',worldId:'surface'}]}}]};
     const first=tickV39HegemonyArea(input,map,100),second=tickV39HegemonyArea({...input,...first},map,100),third=tickV39HegemonyArea({...input,...first},map,101);
     const hp=first.players[0].factionState.units[0].hp;
     mechanics={hp,enemyHp:first.enemies[0].hp,secondHp:second.players[0].factionState.units[0].hp,thirdHp:third.players[0].factionState.units[0].hp,
      otherHp:first.players[0].factionState.units[1].hp,light:hegemonyLightMultiplier(map,test,'光',world),noLight:hegemonyLightMultiplier(map,test,'炎',world),
      path:findV39CavePath(map,map.entrances[0],map.entryTarget).length,details:inspectV39EnvironmentEffectsAt(map,state,x,y),
      wall:window.canUnitEnterV39Tile(map,0,0,test)};
     if(id==='sun'){
      const target={...test,level:1,status:{防御:0,精神:0,光耐性:0}},skill={装備攻撃:true,効果:'必中',全威力:100,光:100};
      mechanics.lightPower=computeAttackDamage({attacker:test,target,skillRow:skill,random:()=>.5}).detail.power;
     }
     if(['tree','crater'].includes(id)){
      const {runV39NaturalEvents}=await import('/src/v39/world/v39-natural-events.js');
      window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===unit.id?{...u,x,y,hp:u.maxHp-20,currentHp:u.maxHp-20}:u)}}))});
      const before=window.getV39GameState().players[0].factionState.units[0].hp;
      const result=runV39NaturalEvents({turnNumber:state.timeline.turnNumber,force:true});
      const after=window.getV39GameState().players[0].factionState.units[0].hp;
      runV39NaturalEvents({turnNumber:state.timeline.turnNumber,force:true});
      const again=window.getV39GameState().players[0].factionState.units[0].hp;
      mechanics.runtime={before,after,again,ok:result.ok};
     }
    }
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    const saved=window.__v39FieldRuntime.mapData;
    if(!window.getV39GameState().players[0].factionState.units.every(unit=>unit.level===30&&unit.status.移動>=120))throw Error('Lost test level/movement after save');
    await new Promise(resolve=>setTimeout(resolve,400));
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    if(scene){scene.cameras.main.setZoom(scene.v39FitZoom);scene.game.v39InvalidateRender?.();}
    return {started,w:map.w,h:map.h,id:saved.hegemonyAreaId,stable:JSON.stringify(saved.grid)===original,
     units:state.players[0].factionState.units.length,stairs:!!map.stairsDown,mine:!!map.caveMine,zones:map.hegemonyZoneKeys.length,
     overlay:!!scene?.v39HegemonyZones,herbs:scene?.children.list.find(child=>child.name==='v39-terrain-icon-overlay')?.list.filter(child=>child.getData?.('terrain')==='薬草の群生地').length||0,
     lava:map.lavaFlowData?.nodeKeys?.length||0,mechanics};
   },id);
   assert(report.started.ok);assert.equal(report.w,12);assert.equal(report.h,12);assert.equal(report.id,id);
   assert(report.stable);assert.equal(report.units,2);assert(!report.stairs&&!report.mine);assert(report.zones>0);assert(report.overlay);
   if(id==='tree')assert.equal(report.herbs,report.zones);
   if(id==='crater')assert.equal(report.lava,report.zones);
   const m=report.mechanics;
   if(Object.keys(m).length){assert(m.path>1);assert(!m.wall);assert(m.details.length>0);assert.equal(m.secondHp,m.hp);assert.equal(m.otherHp,50);assert.equal(m.noLight,1);
    if(id==='tree'){assert.equal(m.hp,55);assert.equal(m.enemyHp,55);assert.equal(m.thirdHp,60);}
    if(id==='crater'){assert(m.hp<50);assert(m.enemyHp<50);assert(m.thirdHp<m.hp);}
    if(id==='sun'){assert.equal(m.light,1.2);assert.equal(m.lightPower,120);}
    if(m.runtime){assert(m.runtime.ok);assert.equal(m.runtime.again,m.runtime.after);if(id==='tree')assert(m.runtime.after>m.runtime.before);else assert(m.runtime.after<m.runtime.before);}
   }
   await page.waitForTimeout(200);
   await page.screenshot({path:`output/web-game/hegemony/${id}-${width}.png`});
   const exit=await page.evaluate(async()=>{const state=window.getV39GameState(),entry=window.__v39FieldRuntime.mapData.entrances[0];window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:entry.x,y:entry.y}:u)}}))});window.leaveV39Cave();if(window.getV39GameState().activeWorldId==='surface')throw Error('Exited immediately');await window.advanceV39Turn({skipUnactedFocus:true});return window.getV39GameState().activeWorldId;});
   assert.equal(exit,'surface');
   const revisited=await page.evaluate(async id=>{
    const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,entry=map.hegemonyEntrances.find(e=>e.areaId===id),unit=window.getV39SelectedSquadUnit();
    if(unit.x!==entry.x||unit.y!==entry.y)throw Error('Returned to wrong entrance');
    window.enterV39Cave();await window.waitForV39MapRenderSettled();
    const marker=window.__v39FieldRuntime.mapData.hegemonyVisitMarker;
    const current=window.getV39GameState(),exit=window.__v39FieldRuntime.mapData.entrances[0];
    window.setV39GameState({players:current.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:exit.x,y:exit.y}:u)}}))});
    window.leaveV39Cave();await window.advanceV39Turn({skipUnactedFocus:true});await window.waitForV39MapRenderSettled();return marker;
   },id);assert.equal(revisited,id);
   console.log(width,id,JSON.stringify(report));
  }
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
