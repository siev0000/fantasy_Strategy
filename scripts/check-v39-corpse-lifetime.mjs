import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/corpse-lifetime';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  if(!process.env.V39_PRODUCTION_CHECK){
    const pure=await page.evaluate(async()=>{
      const {expireV39GroundCorpses:expire,resolveV39CorpseExpiry:expiry}=await import('/src/lib/v39-corpse-lifetime.js');
      const {normalizeV39GroundLootByTile:normalize}=await import('/src/lib/v39-logistics-state.js');
      let loot={'1,1':{cargo:{resourcesByType:{死体:100,木材:7},equipmentInventory:[{id:'gear'}]}}};
      loot=expire(normalize(loot),1).groundLootByTile;
      loot['1,1'].cargo.resourcesByType.死体+=100;
      loot=expire(normalize(loot),5).groundLootByTile;
      const deadlines=loot['1,1'].corpseResourceBatches.map(r=>r.expiresAtTurn);
      const saved=normalize(JSON.parse(JSON.stringify(loot)));
      const at11=expire(saved,11),at15=expire(at11.groundLootByTile,15);
      const consumed=structuredClone(saved);consumed['1,1'].cargo.resourcesByType.死体=50;
      const afterConsumption=expire(normalize(consumed),11).groundLootByTile['1,1'];
      return {deadlines,at11:at11.groundLootByTile['1,1'],at15:at15.groundLootByTile['1,1'],afterConsumption,
        organic:expiry({race:'ウルフ',deathTurn:1,deadExpireTurn:31},2),
        undead:expiry({race:'ゾンビ',deathTurn:1,deadExpireTurn:31},2),
        released:expiry({race:'ウルフ',deathTurn:1,deadExpireTurn:80,corpseLifetimeVersion:1},75)};
    });
    assert.deepEqual(pure.deadlines,[11,15]);assert.equal(pure.at11.cargo.resourcesByType.死体,100);
    assert.equal(pure.at15.cargo.resourcesByType.死体,undefined);assert.equal(pure.at15.cargo.resourcesByType.木材,7);
    assert.equal(pure.at15.cargo.equipmentInventory.length,1);assert.equal(pure.afterConsumption.cargo.resourcesByType.死体,50);
    assert.equal(pure.organic,11);assert.equal(pure.undead,6);assert.equal(pure.released,80);
  }
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),t=s.timeline.turnNumber;
    const body=(id,race,x)=>({...window.applyV39DerivedCharacterData({id,name:id,race,className:race,level:10,x,y:20,worldId:'surface'}),
      hp:0,currentHp:0,state:'死亡',deathTurn:t,deadExpireTurn:t+30,equipment:[{id:`gear-${id}`,name:'剣',slot:'武器1'}],
      corpseCargo:{resourcesByType:{木材:4,穀物:3},equipmentInventory:[]}});
    const organic=body('lifetime-organic','ウルフ',18),undead=body('lifetime-undead','ゾンビ',19),guard=body('lifetime-guard','ウルフ',20),
      player=body('lifetime-player','ウルフ',21),other={...body('lifetime-other','ウルフ',22),worldId:'other-cave'};
    window.setV39GameState({enemies:[organic,undead,other],enemySquads:[],enemyNests:[],
      neutralVillages:s.neutralVillages.map((v,i)=>i===0?{...v,defenseUnits:[guard]}:v),
      players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:[...f.units,player]}}:p),
      groundLootByTile:{'17,20':{cargo:{resourcesByType:{死体:100,鉄:6},equipmentInventory:[]}}}});
    window.runV39DeathLifecycle(t);
    const first=window.getV39GameState();
    window.runV39DeathLifecycle(t+4);
    const beforeUndead=window.getV39GameState().enemies.some(u=>u.id===undead.id);
    window.runV39DeathLifecycle(t+5);
    const at5=window.getV39GameState();
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    window.runV39DeathLifecycle(t+9);
    const beforeOrganic=window.getV39GameState().enemies.some(u=>u.id===organic.id);
    window.runV39DeathLifecycle(t+10);
    const end=window.getV39GameState();window.runV39DeathLifecycle(t+10);
    const repeat=window.getV39GameState();
    return {rules:window.getV39DeathRules(),first:first.enemies.map(u=>({id:u.id,deadline:u.deadExpireTurn})),
      beforeUndead,beforeOrganic,at5:at5.enemies.map(u=>u.id),end:end.enemies.map(u=>u.id),
      playerRemoved:!end.players.flatMap(p=>p.factionState.units).some(u=>u.id===player.id),
      guardRemoved:!end.neutralVillages.some(v=>v.defenseUnits.some(u=>u.id===guard.id)),villageCount:s.neutralVillages.length,
      drops:end.groundLootByTile,once:JSON.stringify(end.groundLootByTile)===JSON.stringify(repeat.groundLootByTile),t};
  });
  assert.equal(report.rules.organicTurns,10);assert.equal(report.rules.remainsTurns,5);
  assert(report.beforeUndead&&report.beforeOrganic&&report.playerRemoved&&report.guardRemoved&&report.once);
  assert(report.villageCount>0);assert(!report.at5.includes('lifetime-undead'));assert(!report.end.includes('lifetime-organic'));
  assert(report.end.includes('lifetime-other'));
  for(const key of ['18,20','19,20','20,20','21,20']){
    assert.equal(report.drops[key].cargo.equipmentInventory.length,1,key);
    assert.equal(report.drops[key].cargo.resourcesByType.木材,4,key);assert.equal(report.drops[key].cargo.resourcesByType.穀物,3,key);
  }
  assert.equal(report.drops['17,20'].cargo.resourcesByType.死体,undefined);assert.equal(report.drops['17,20'].cargo.resourcesByType.鉄,6);
  await page.screenshot({path:`${out}/field-390.png`});assert.deepEqual(errors,[]);
  console.log('Corpse lifetime: organic 10T / remains 5T, resource batches, consumption, legacy save, loot retention, neutral/player/enemy/world isolation and idempotence passed');
}finally{await browser.close();}
