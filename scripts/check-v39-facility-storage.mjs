import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/facility-storage',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39FusionTest==='function');
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),f=p.factionState;
      const horse=f.units.find(u=>u.id==='fusion-test-horse');
      window.setV39GameState({facilitiesByTile:{...s.facilitiesByTile,'3,3':['魔獣研究所']},players:s.players.map(row=>row.id===p.id?{...row,factionState:{...f,units:f.units.map(u=>u.id===horse.id?{...u,x:3,y:3,position:[3,3]}:u),combatRuntime:{...f.combatRuntime,cooldownsByUnitId:{...f.combatRuntime.cooldownsByUnitId,[horse.id]:{test:s.timeline.turnNumber+5}}}}}:row)});
      window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();
    });
    await page.locator('[data-settlement-page-select="facility"]').click();
    await page.locator('[data-settlement-facility]').filter({hasText:'魔獣研究所'}).click();
    const open=page.locator('[data-storage-open="3,3"][data-storage-name="魔獣研究所"]');
    assert(await open.isVisible(),'storage entry in actual settlement panel');await open.click();
    await page.locator('[data-storage-tab="deposit"]').click();
    const deposit=page.locator('[data-storage-deposit="fusion-test-horse"]');
    const initialStoredCount=await page.evaluate(()=>window.getV39ActiveFactionState().facilityStorage.length);
    assert(!await deposit.isDisabled(),await page.locator('[data-storage-row="fusion-test-horse"]').innerText());await deposit.click();
    await page.locator('[data-storage-tab="stored"]').click();
    assert.equal(await page.locator('[data-storage-row="fusion-test-horse"]').count(),1);
    await page.screenshot({path:`output/web-game/facility-storage/stored-${width}.png`});
    const stored=await page.evaluate(async()=>{
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),e=f.facilityStorage.find(e=>e.unit.id==='fusion-test-horse');
      const rules=await import('/src/lib/v39-facility-storage.js'),fusion=await import('/src/lib/v39-monster-fusion.js');
      const facility=rules.getV39StorageFacilities(s,s.activePlayerId).find(f=>f.name==='魔獣研究所'&&f.tileKey==='3,3');
      const sovereign=f.units.find(u=>u.isSovereign);
      const guarded=!!rules.inspectV39FacilityDeposit(s,s.activePlayerId,facility,sovereign);
      const snapshot=JSON.stringify(s),blocked=rules.withdrawV39FacilityUnit(s,s.activePlayerId,facility,e.unit.id,{grid:[]});
      const immutable=JSON.stringify(s)===snapshot;
      const recipe=fusion.getV39FusionRecipes(s).find(r=>r.合成結果==='バイコーン');
      const request={playerId:s.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,materialIds:['fusion-test-horse','fusion-test-devil'],mode:'skill'};
      const preview=fusion.inspectV39MonsterFusion(s,request),made=fusion.executeV39MonsterFusion(s,request);
      await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const nodes=scene.children.list.flatMap(node=>[node,...(node.list||[])]);
      const badge=nodes.some(node=>node.name==='v39-facility-storage-count'&&node.getData('tileKey')==='3,3'&&Number(node.getData('label'))===f.facilityStorage.length);
      return {absent:!f.units.some(u=>u.id===e.unit.id),detached:f.squads.every(s=>!s.unitIds.includes(e.unit.id)),guarded,blocked:!blocked.ok,immutable,preview:preview.available,reasons:preview.reasons,fused:made.ok,consumed:made.ok&&!made.state.players.find(p=>p.id===s.activePlayerId).factionState.facilityStorage.some(e=>e.unit.id==='fusion-test-horse'),badge};
    });
    for(const key of ['absent','detached','guarded','blocked','immutable','preview','fused','consumed','badge'])assert.equal(stored[key],true,`${key}: ${JSON.stringify(stored)}`);
    await page.locator('[data-storage-close]').click();
    await page.screenshot({path:`output/web-game/facility-storage/field-${width}.png`});
    const saved=await page.evaluate(()=>{
      const before=window.getV39ActiveFactionState().facilityStorage.find(e=>e.unit.id==='fusion-test-horse');window.importV39SaveJson(window.exportV39SaveJson());
      const after=window.getV39ActiveFactionState().facilityStorage.find(e=>e.unit.id==='fusion-test-horse');return {before,after};
    });
    assert.equal(saved.after.unit.id,saved.before.unit.id);assert.equal(saved.after.unit.hp,saved.before.unit.hp);assert.deepEqual(saved.after.runtimeByKey,saved.before.runtimeByKey);
    assert(await page.evaluate(()=>{
      const snapshot=window.getV39GameState(),entry=snapshot.players.find(p=>p.id===snapshot.activePlayerId).factionState.facilityStorage.find(e=>e.unit.id==='fusion-test-horse');
      entry.unit.name='snapshot-mutation';entry.runtimeByKey.cooldownsByUnitId.test=-100;
      const stored=window.getV39ActiveFactionState().facilityStorage.find(e=>e.unit.id==='fusion-test-horse');return stored.unit.name!=='snapshot-mutation'&&stored.runtimeByKey.cooldownsByUnitId.test>0;
    }),'stored identity/runtime snapshots are detached');
    await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
    await page.locator('[data-settlement-page-select="facility"]').click();
    await page.locator('[data-settlement-facility]').filter({hasText:'魔獣研究所'}).click();
    await open.click();await page.locator('[data-storage-withdraw="fusion-test-horse"]').click();
    const released=await page.evaluate(()=>{const f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id==='fusion-test-horse');return {ap:u.ap,count:f.facilityStorage.length,cooldown:f.combatRuntime.cooldownsByUnitId[u.id].test,turn:window.getV39GameState().timeline.turnNumber};});
    assert.equal(released.ap,0);assert.equal(released.count,initialStoredCount);assert.equal(released.cooldown,released.turn+5);
    await page.locator('[data-storage-close]').click();
    await page.evaluate(async()=>{
      const s=window.getV39GameState(),corpse=s.enemies.find(u=>u.soulTestCorpse);
      const {collectV39Soul}=await import('/src/lib/v39-soul-storage.js');
      const result=collectV39Soul(s,s.activePlayerId,corpse);if(!result.ok)throw new Error(result.reason);
      window.setV39GameState({players:result.state.players,enemies:result.state.enemies});
    });
    await page.locator('[data-settlement-facility]').filter({hasText:'魂の保管庫'}).click();
    await page.locator('[data-storage-open="3,4"][data-storage-name="魂の保管庫"]').click();
    assert.equal(await page.locator('[data-storage-row]').count(),3,'two seeded souls and the collected soul are visible');
    assert.equal(await page.locator('[data-storage-tab="deposit"]').count(),0);
    assert.equal(await page.locator('[data-storage-withdraw]').count(),0);
    await page.locator('[data-storage-close]').click();
    const guards=await page.evaluate(async()=>{
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id==='fusion-test-horse');
      const rules=await import('/src/lib/v39-facility-storage.js'),facility=rules.getV39StorageFacilities(s,s.activePlayerId).find(f=>f.name==='魔獣研究所'&&f.tileKey==='3,3');
      const patch=unit=>({...s,players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:f.units.map(v=>v.id===u.id?unit:v)}}:p)});
      const tasked=patch({...u,autoTransport:{enabled:true}}),far=patch({...u,x:99,y:99});
      const armed=patch({...u,x:facility.x,y:facility.y,equipment:[{slot:'武器1',name:'格納試験剣'}]});
      const result=rules.depositV39FacilityUnit(armed,s.activePlayerId,facility,u.id),entry=result.state.players.find(p=>p.id===s.activePlayerId).factionState.facilityStorage.find(e=>e.unit.id==='fusion-test-horse');
      const lost={...result.state,facilitiesByTile:{...s.facilitiesByTile,'3,3':[]}};
      const barracks=rules.getV39StorageFacilities(s,s.activePlayerId).find(f=>f.name==='兵舎'&&f.tileKey==='2,4');
      const allowed=['只人','人間','ヒューマン','森人','エルフ','土人','ドワーフ'].every(race=>{
        const unit={...u,race,x:2,y:4};return !rules.inspectV39FacilityDeposit(patch(unit),s.activePlayerId,barracks,unit);
      });
      const monster={...u,race:'ホース',x:2,y:4};
      return {task:!rules.depositV39FacilityUnit(tasked,s.activePlayerId,facility,u.id).ok,far:!rules.depositV39FacilityUnit(far,s.activePlayerId,facility,u.id).ok,gear:entry?.unit.equipment[0].name==='格納試験剣',lost:!rules.withdrawV39FacilityUnit(lost,s.activePlayerId,facility,u.id,window.__v39FieldRuntime.mapData).ok,playerAllowed:allowed,monsterRejected:!rules.depositV39FacilityUnit(patch(monster),s.activePlayerId,barracks,u.id).ok};
    });
    for(const [key,value] of Object.entries(guards))assert.equal(value,true,key);
    assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false);
    assert.deepEqual(errors,[]);console.log(`${width}: facility UI deposit/withdraw, map count, soul view, guards, storage fusion, save/load and cooldown retention passed`);
    await page.close();
  }
}finally{await browser.close();}
