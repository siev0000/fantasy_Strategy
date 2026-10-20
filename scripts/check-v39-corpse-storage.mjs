import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/corpse-storage',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();
    });
    await page.locator('[data-settlement-page-select="production"]').click();
    await page.locator('[data-settlement-fold="facility"] summary').click();
    await page.locator('[data-storage-open="5,5"][data-storage-name="霊廟"]').click();
    await page.locator('[data-storage-tab="deposit"]').click();
    const before=await page.evaluate(()=>window.getV39GameState().enemies.find(u=>u.id==='mausoleum-test-corpse'));
    await page.locator('[data-storage-deposit="mausoleum-test-corpse"]').click();
    await page.locator('[data-storage-tab="stored"]').click();
    assert.equal(await page.locator('[data-storage-row="mausoleum-test-corpse"]').count(),1);
    await page.screenshot({path:`output/web-game/corpse-storage/stored-${width}.png`});
    const checks=await page.evaluate(async()=>{
      const rules=await import('/src/lib/v39-corpse-storage.js');
      const storage=await import('/src/lib/v39-facility-storage.js');
      const {advanceV39Purification}=await import('/src/lib/v39-purification-rules.js');
      const {convertV39CorpsesInDeathFog}=await import('/src/lib/v39-corpse-undead-rules.js');
      const {runV39DeathLifecycle}=await import('/src/v39/combat/v39-death-lifecycle.js');
      const s=window.getV39GameState(),id=s.activePlayerId,f=s.players.find(p=>p.id===id).factionState;
      const facility=storage.getV39StorageFacilities(s,id).find(f=>f.type==='corpse'),entry=f.deadUnitReserve.find(e=>e.unitId==='mausoleum-test-corpse');
      const snapshot=JSON.stringify(s),duplicate=rules.recoverV39CorpseToFacility(s,id,facility,entry.unitId);
      const far={...s,enemies:[...s.enemies,{...entry.unit,id:'far',x:99,y:99}]};
      const foreign={...s,territoryOwnerByTile:{...s.territoryOwnerByTile,'5,5':'other'}};
      const blocked=rules.releaseV39StoredCorpse(foreign,id,facility,entry.unitId);
      const pureState={...s,enemies:[],players:s.players.map(p=>({...p,factionState:{...p.factionState,units:[]}})),neutralVillages:[],groundLootByTile:{}};
      const map={w:10,h:10,grid:Array.from({length:10},()=>Array(10).fill('平地')),purificationByTile:{},fogMap:[]};
      advanceV39Purification(map,pureState,s.timeline.turnNumber+1,()=>1);
      map.fogMap=map.grid.map(row=>row.map(()=>({kind:'death',createdAtTurn:0})));let spawned=0;
      convertV39CorpsesInDeathFog(pureState,map,s.timeline.turnNumber+1,{random:()=>0,createEnemy:r=>{spawned++;return r;}});
      runV39DeathLifecycle(s.timeline.turnNumber+50);
      const remains=window.getV39ActiveFactionState().deadUnitReserve.some(e=>e.unitId===entry.unitId);
      return {unit:entry.unit,notField:!f.units.some(u=>u.id===entry.unitId)&&!s.enemies.some(u=>u.id===entry.unitId),
        immutable:snapshot===JSON.stringify(s),duplicate:!duplicate.ok,blocked:!blocked.ok,remains,
        far:!rules.getV39CorpseStorageCandidates(far,id,facility).some(u=>u.id==='far'),noDecay:Object.keys(map.purificationByTile).length===0,noConversion:spawned===0};
    });
    for(const key of ['notField','immutable','duplicate','blocked','remains','far','noDecay','noConversion'])assert.equal(checks[key],true,key);
    assert.equal(checks.unit.level,before.level);assert.equal(checks.unit.race,before.race);assert.deepEqual(checks.unit.equipment,before.equipment);
    await page.locator('[data-storage-close]').click();
    const saved=await page.evaluate(()=>{
      const before=window.getV39ActiveFactionState().deadUnitReserve.find(e=>e.unitId==='mausoleum-test-corpse');
      window.importV39SaveJson(window.exportV39SaveJson());
      const after=window.getV39ActiveFactionState().deadUnitReserve.find(e=>e.unitId==='mausoleum-test-corpse');
      const snapshot=window.getV39GameState(),row=snapshot.players.find(p=>p.id===snapshot.activePlayerId).factionState.deadUnitReserve.find(e=>e.unitId===before.unitId);
      row.unit.name='mutated';row.corpseStorage.remainingTurns=999;
      const actual=window.getV39ActiveFactionState().deadUnitReserve.find(e=>e.unitId===before.unitId);
      return {before,after,isolated:actual.unit.name!=='mutated'&&actual.corpseStorage.remainingTurns!==999};
    });
    assert.deepEqual(JSON.parse(JSON.stringify(saved.after)),JSON.parse(JSON.stringify(saved.before)));assert(saved.isolated);
    await page.evaluate(()=>{
      const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+50}});
      window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();
    });
    await page.locator('[data-settlement-page-select="production"]').click();
    const fold=page.locator('[data-settlement-fold="facility"]');if(await fold.getAttribute('open')===null)await fold.locator('summary').click();
    await page.locator('[data-storage-open="5,5"][data-storage-name="霊廟"]').click();
    await page.locator('[data-storage-withdraw="mausoleum-test-corpse"]').click();
    const released=await page.evaluate(async()=>{
      const {runV39DeathLifecycle}=await import('/src/v39/combat/v39-death-lifecycle.js');
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id==='mausoleum-test-corpse');
      runV39DeathLifecycle(s.timeline.turnNumber);
      return {u,turn:s.timeline.turnNumber,reserved:f.deadUnitReserve.some(e=>e.unitId===u?.id),stillField:window.getV39ActiveFactionState().units.some(v=>v.id===u?.id)};
    });
    assert.equal(released.u.hp,0);assert.equal(released.u.state,'死亡');assert.equal(released.u.deadExpireTurn,released.turn+10);assert(!released.reserved);assert(released.stillField);
    assert.deepEqual(errors,[]);console.log(`${width}: explicit recovery, preservation, save, guards, decay/conversion exclusion and dead withdrawal passed`);
    await page.close();
  }
}finally{await browser.close();}
