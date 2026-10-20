import assert from 'node:assert/strict';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disasters';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);});
    await page.evaluate(()=>window.activateV39FooterTab('test'));
    await page.locator('[data-test-section="expedition"]').evaluate(n=>n.open=true);
    await page.locator('[data-test-action="disaster-test-start"]').click();
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    await page.waitForFunction(count=>window.inspectV39NaturalEvents?.().activeDisasters.length===count,fixture.events.length+1);
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
      .find(c=>c.name==='v39-disaster-icon-overlay')?.list.some(c=>c.type==='Image'));
    const initial=await page.evaluate(async()=>{
      const {resolveV39DisasterRule:rule}=await import('/src/lib/v39-disaster-rules.js');
      const {resolveV39HazardYieldMultiplier:yieldAt}=await import('/src/lib/v39-economy-rules.js');
      const state=window.getV39GameState(),f=window.getV39ActiveFactionState();
      const first=f.units[0];
      window.updateV39ActiveFactionState({units:[...f.units,{...first,id:'other-world-probe',name:'地下の比較用',worldId:'cave:expedition-test:1',hp:200,currentHp:200,maxHp:200}]});
      const data=window.inspectV39NaturalEvents();
      const custom=rule({ID:'災害:山火事',基本発生率:0,影響半径:0,効果継続ターン:1,周囲産出倍率:0,
        最大HP割合ダメージ:0,敵生成:false,アンデッド発生補正:false,有効:false,同一マス待機ターン:0});
      const blank=rule({ID:'災害:山火事',基本発生率:null});
      const envBefore=JSON.stringify(state.worldEnvironment);
      const invalid=window.forceV39Disaster('invalid',{x:4,y:4});
      const outside=window.forceV39Disaster('災害:山火事',{x:-1,y:4});
      const repeat=window.forceV39Disaster('災害:山火事',{x:4,y:4});
      return {events:data.activeDisasters,rules:data.rules,custom,blank,invalid,outside,repeat,
        unchanged:envBefore===JSON.stringify(window.getV39GameState().worldEnvironment),
        fireYield:yieldAt(state,'4,4',1),floodYield:yieldAt(state,'10,5',1),
        hp:f.units.map(u=>({id:u.id,hp:u.hp,max:u.maxHp,world:u.worldId}))};
    });
    assert.equal(initial.rules.length,24);assert(initial.rules.every(r=>r.enabled&&r.chance>=0&&r.duration>=1));
    assert.equal(initial.fireYield,0.5);assert.equal(initial.floodYield,0.5);
    assert(initial.hp[0].hp<initial.hp[0].max);assert.equal(initial.events.find(e=>e.name==='山火事').damagePower,20);
    for(const field of ['chance','radius','yieldMultiplier','unitDamageRate','cooldown'])assert.equal(initial.custom[field],0);
    assert.equal(initial.custom.enabled,false);assert.equal(initial.custom.spawnEnemy,false);assert(initial.blank.chance>0);
    assert(!initial.invalid.ok&&!initial.outside.ok&&!initial.repeat.ok&&initial.unchanged);
    const retained=await page.evaluate(()=>{
      const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);
      return window.inspectV39NaturalEvents().activeDisasters;
    });
    assert.deepEqual(retained,initial.events);
    await page.evaluate(()=>window.activateV39FooterTab('squad'));
    await page.screenshot({path:`${out}/fixture-${width}.png`});
    const ticks=await page.evaluate(async()=>{
      const {runV39NaturalEvents:tick}=await import('/src/v39/world/v39-natural-events.js');
      const {resolveV39HazardYieldMultiplier:yieldAt}=await import('/src/lib/v39-economy-rules.js');
      const results=[];
      for(const turn of [2,3,4]){
        const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:turn}},{reason:'disaster-test-turn'});
        const run=tick({turnNumber:turn,skipNaturalDisasters:true});
        const next=window.getV39GameState(),f=window.getV39ActiveFactionState();
        results.push({turn,ok:run.ok,events:next.worldEnvironment.activeDisasters.map(e=>e.name),
          hp:f.units[0].hp,other:f.units.find(u=>u.id==='other-world-probe').hp,
          yield:yieldAt(next,'4,4',turn),repeat:tick({turnNumber:turn}).reason});
      }
      return results;
    });
    assert(ticks.every(t=>t.ok&&t.other===200&&t.repeat==='already-processed'));
    assert(ticks[0].events.includes('山火事'));assert(!ticks[1].events.includes('山火事'));
    assert.equal(ticks[1].yield,1);assert.deepEqual(ticks[2].events,['落雷嵐']);assert.equal(ticks[0].hp,ticks[1].hp);
    const slots=await page.evaluate(async()=>{
      const {resolveV39DisasterIcon:art}=await import('/src/lib/disaster-icon-artwork.js');
      const {disasterData}=await import('/src/lib/game-data-registry.js');
      const rows=disasterData.filter(row=>row.画像番号>0);
      const result=rows.map(row=>({id:row.ID,slot:art({disasterId:row.ID})?.slot,expected:row.画像番号}));
      // All common disaster images must also reach actual Phaser frames.
      const names=rows.filter(row=>row.ID!=='災害:火山噴火');
      for(const row of names){
        window.setV39GameState({worldEnvironment:{}},{reason:'disaster-icon-test'});window.forceV39Disaster(row.ID,{x:4,y:4});
        window.renderV39DisasterIcons();
        const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
        result.find(item=>item.id===row.ID).nativeSlot=scene.children.list.find(c=>c.name==='v39-disaster-icon-overlay')?.list
          .find(c=>c.type==='Image')?.getData('disasterImageSlot');
      }
      return result;
    });
    assert.equal(slots.length,12);for(const row of slots){assert.equal(row.slot,row.expected);if(row.id!=='災害:火山噴火')assert.equal(row.nativeSlot,row.expected);}
    // Verify current image marker and visibility refresh do not disclose hidden events.
    const visibility=await page.evaluate(async()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const oldMode=window.isV39TestMode,oldVisible=window.isV39TileInCurrentVision;
      window.isV39TestMode=()=>false;window.isV39TileInCurrentVision=()=>false;window.renderV39DisasterIcons();
      const hidden=window.getV39DisasterIconStatus().markerCount;
      window.isV39TestMode=()=>true;window.renderV39DisasterIcons();
      const overlay=scene.children.list.find(c=>c.name==='v39-disaster-icon-overlay');
      const shown=overlay.list.some(c=>c.type==='Image'&&c.alpha===0.6);
      window.isV39TestMode=oldMode;window.isV39TileInCurrentVision=oldVisible;window.renderV39DisasterIcons();
      return {hidden,shown};
    });
    assert.deepEqual(visibility,{hidden:0,shown:true});
    const natural=await page.evaluate(async()=>{
      const {disasterData}=await import('/src/lib/game-data-registry.js');
      const {runV39NaturalEvents:tick}=await import('/src/v39/world/v39-natural-events.js');
      const backup=disasterData.map(row=>({...row}));
      const rows=disasterData.filter(row=>row.ID!=='災害:火山噴火'),fire=rows.find(row=>row.ID==='災害:山火事');
      try{
        for(const row of rows)row.基本発生率=0;
        window.setV39GameState({worldEnvironment:{}},{reason:'disaster-zero-test'});
        const zero=tick({turnNumber:40}).disasters.length;
        fire.基本発生率=1;fire.対象地形='';fire.発生方法='自然';fire.発生条件='';
        const certain=tick({turnNumber:41}).disasters;
        fire.有効=false;const disabled=window.forceV39Disaster(fire.ID,{x:4,y:4});
        return {zero,certain:certain.map(e=>e.disasterId),disabled:disabled.reason};
      }finally{for(let i=0;i<disasterData.length;i++)Object.assign(disasterData[i],backup[i]);}
    });
    assert.deepEqual(natural,{zero:0,certain:['災害:山火事'],disabled:'invalid-disaster'});
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/report-${width}.json`,JSON.stringify({initial,ticks,slots,visibility,natural},null,2));
    console.log(`${width}: native fixture, sheet rules/zeros, HP/yield, isolated worlds, save, expiry, icons and hidden visibility passed`);
    await page.close();
  }
}finally{await browser.close();}
