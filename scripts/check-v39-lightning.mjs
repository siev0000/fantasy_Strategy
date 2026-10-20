import assert from 'node:assert/strict';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/lightning';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
    await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.activateV39FooterTab('test');});
    await page.locator('[data-test-section="expedition"]').evaluate(n=>n.open=true);
    assert.equal(await page.locator('[data-test-action="lightning-test-start"]').count(),0);
    await page.locator('[data-test-action="disaster-test-start"]').click();
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().units.filter(u=>u.id.startsWith('lightning-observer-')).length===7&&!window.isV39MapInputLocked());
    await page.evaluate(async(expectedCount)=>{
      const {HEX_TILE_CONFIG:c}=await import('/src/lib/phaser-map-panel-config.js');
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState();
      if(s.worldEnvironment.activeDisasters.length!==expectedCount||!f.units.some(u=>u.name==='山火事観察者'))throw new Error('other disasters lost');
      window.activateV39FooterTab('squad');
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      scene.cameras.main.setZoom(1);scene.v39RequestedZoom=1;scene.cameras.main.centerOn(12*c.width+c.width/2,10*c.rowStep+c.height/2);
    },fixture.events.length+1);
    const first=await page.evaluate(async()=>{
      const {resolveV39DisasterDamageTiles:tiles}=await import('/src/lib/v39-disaster-strikes.js');
      const {resolveV39DisasterRule:rule}=await import('/src/lib/v39-disaster-rules.js');
      const {applyV39DisasterDamage:damage,resolveV39DisasterDamage:spec,applyV39DisasterMovementDamage:move}=await import('/src/lib/v39-disaster-damage.js');
      const s=window.getV39GameState(),event=s.worldEnvironment.activeDisasters.find(e=>e.disasterId==='災害:落雷嵐'),unit={id:'probe',hp:1000,maxHp:1000,x:12,y:10,status:{},worldId:'surface'};
      const bins=Object.fromEntries(event.tileKeys.map(key=>[key,0]));
      for(let i=0;i<1000;i++)for(const key of tiles({...event,damageTickTurn:0,id:`sample-${i}`},2))bins[key]++;
      const density=[1,2,3,7,8,19,37].map(size=>{
        const keys=Array.from({length:size},(_,i)=>`${i},0`),counts=[];
        for(let i=0;i<1500;i++){
          const result=tiles({...event,id:`density-${size}-${i}`,damageTickTurn:0,tileKeys:keys},2);
          counts.push(result.length);if(new Set(result).size!==result.length)throw new Error('duplicate strike');
        }
        return {size,min:Math.min(...counts),max:Math.max(...counts),mean:counts.reduce((a,b)=>a+b,0)/counts.length};
      });
      const ids=['洪水','地震','落雷嵐','土砂崩れ','聖光暴発','魂嵐','瘴気','流星落下'];
      const powers=ids.map(name=>{const r=rule(`災害:${name}`);return {name,rule:r,damage:damage(unit,spec({disasterId:r.id}),1,'災害',()=>.5).entry?.damage};});
      return {event,bins,density,powers,units:window.getV39ActiveFactionState().units.filter(u=>u.id.startsWith('lightning-observer-')).map(u=>({x:u.x,y:u.y,hp:u.hp,max:u.maxHp})),
        multi:tiles({...event,damageTickTurn:0,randomDamageTilesPerHit:0,randomDamageTileCount:3},2),zero:tiles({...event,damageTickTurn:0,randomDamageTilesPerHit:0,randomDamageTileCount:0},2),
        deterministic:JSON.stringify(tiles({...event,damageTickTurn:0},2))===JSON.stringify(tiles({...event,damageTickTurn:0},2)),
        immune:damage({...unit,status:{雷耐性:100}},spec(event),1).unit.hp,
        mental:damage({...unit,status:{精神耐性:100}},spec({disasterId:'災害:魂嵐'}),1).unit.hp,
        move:move(unit,[{x:13,y:10}],s).unit.hp};
    });
    assert.equal(first.event.damagePower,100);assert.equal(first.event.damagePattern,'ランダム');assert.equal(first.event.randomDamageTilesPerHit,3);
    assert([2,3].includes(first.event.damageTileKeys.length));
    assert.equal(first.units.filter(u=>u.hp<u.max).length,first.event.damageTileKeys.length);
    for(const key of first.event.damageTileKeys)assert(first.units.find(u=>`${u.x},${u.y}`===key).hp<first.units[0].max);
    assert(Object.values(first.bins).every(count=>count>280&&count<390));assert(first.deterministic);
    for(const d of first.density){assert.equal(d.min,Math.floor(d.size/3));assert.equal(d.max,Math.ceil(d.size/3));assert(Math.abs(d.mean-d.size/3)<.05,JSON.stringify(d));}
    assert.equal(new Set(first.multi).size,3);assert.deepEqual(first.zero,[]);assert.equal(first.immune,1000);assert.equal(first.mental,1000);assert.equal(first.move,1000);
    for(const p of first.powers){assert.equal(p.rule.unitDamageRate,0);assert(p.rule.damagePower>0&&p.damage>0,p.name);}
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(c=>c.name==='v39-disaster-strike-overlay')?.list.some(c=>c.name?.startsWith('v39-disaster-strike:')));
    await page.screenshot({path:`${out}/strike-${width}.png`});
    await page.locator('#v39-turn-toggle').click();await page.locator('#v39-turn-test-next').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!document.querySelector('#v39-turn-test-next').disabled);
    const later=await page.evaluate(async()=>{
      const {runV39NaturalEvents:tick}=await import('/src/v39/world/v39-natural-events.js');
      const {resolveV39DisasterDamageTiles:tiles}=await import('/src/lib/v39-disaster-strikes.js');
      let s=window.getV39GameState(),event=s.worldEnvironment.activeDisasters.find(e=>e.disasterId==='災害:落雷嵐');
      const second={turn:event.damageTickTurn,keys:[...event.damageTileKeys]};
      window.importV39SaveJson(window.exportV39SaveJson());
      const loaded=window.getV39GameState().worldEnvironment.activeDisasters.find(e=>e.disasterId==='災害:落雷嵐');
      const repeated=tick({turnNumber:2,force:true,skipNaturalDisasters:true});
      s=window.getV39GameState();const nextKeys=tiles({...event,damageTickTurn:0},3);
      const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({units:f.units.filter(u=>!nextKeys.includes(`${u.x},${u.y}`))});
      window.setV39GameState({timeline:{...s.timeline,turnNumber:3}});
      const empty=tick({turnNumber:3,skipNaturalDisasters:true}),emptyEvent=window.getV39GameState().worldEnvironment.activeDisasters.find(e=>e.disasterId==='災害:落雷嵐');
      s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:6}});
      tick({turnNumber:6,skipNaturalDisasters:true});
      return {second,loaded:loaded.damageTileKeys,repeated:repeated.damageEntries.length,empty:empty.damageEntries.length,
        emptyKeys:emptyEvent.damageTileKeys,nextKeys,expired:window.getV39GameState().worldEnvironment.activeDisasters.length};
    });
    assert.equal(later.second.turn,2);assert.deepEqual(later.loaded,later.second.keys);assert.equal(later.repeated,0);
    assert.equal(later.empty,0);assert.deepEqual(later.emptyKeys,later.nextKeys);assert.equal(later.expired,0);
    assert.deepEqual(errors,[]);
    console.log(`${width}: native lightning fixture/1T, random empty tiles, power/resistance, no movement hit, replay/save/expiry and markers passed`);
    await page.close();
  }
}finally{await browser.close();}
