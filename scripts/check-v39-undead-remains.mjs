import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/undead-remains';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  if(!process.env.V39_PRODUCTION_CHECK){
    const pure=await page.evaluate(async()=>{
      const {resolveV39CorpseKind:kind,isV39Undead}=await import('/src/lib/v39-corpse-types.js');
      const {advanceV39Purification}=await import('/src/lib/v39-purification-rules.js');
      const {findV39NewUnitDeaths}=await import('/src/lib/v39-death-purification.js');
      const {convertV39CorpsesInDeathFog:convert}=await import('/src/lib/v39-corpse-undead-rules.js');
      const {buildV39UndeadInheritance:inherit}=await import('/src/lib/v39-undead-inheritance.js');
      const rows=[{race:'ウルフ',className:'ウルフ'},{race:'ウルフ',className:'ゾンビ'},
        {race:'スケルトン',className:'スケルトン'},{race:'ゴースト',className:'ゴースト'},
        {race:'レイス',className:'レイス'},{race:'只人',className:'ファイター',prerequisiteClassLevels:{ヴァンパイア:2}}]
        .map((u,i)=>({...u,id:`body-${i}`,level:10,x:i+1,y:1,hp:0,currentHp:0,state:'死亡',equipment:[]}));
      const state={activeWorldId:'surface',timeline:{turnNumber:3},players:[],enemies:rows,worldEnvironment:{},groundLootByTile:{}};
      const map={w:8,h:5,grid:Array.from({length:5},()=>Array(8).fill('平地'))};
      advanceV39Purification(map,state,3,()=>1);
      const fog={...map,purificationByTile:Object.fromEntries(rows.map(u=>[`${u.x},${u.y}`,-5])),
        fogMap:Array.from({length:5},()=>Array(8).fill({kind:'death',createdAtTurn:1}))};
      const natural=convert(state,fog,3,{createEnemy:u=>u,random:()=>0});
      const magic=convert(state,fog,3,{createEnemy:u=>u,random:()=>0,corpseIds:new Set(rows.slice(1).map(u=>u.id)),undeadClass:'ゾンビ'});
      return {kinds:rows.map(kind),decay:map.purificationByTile,
        deaths:findV39NewUnitDeaths({...state,enemies:rows.map(u=>({...u,hp:1,currentHp:1,state:'生存'}))},state).map(u=>u.id),
        natural:natural.spawned.map(row=>row.origin.corpseId),magic:magic.spawned.length,
        inheritance:inherit(rows[1],'ゾンビ'),fusion:isV39Undead({race:'ウルフ',className:'ゴースト',fusionGrowth:{recipeName:'ディスプレイサービースト',levelsByClass:{ウルフ:8,ゴースト:2}}})};
    });
    assert.deepEqual(pure.kinds,['organic','remains','remains','none','none','remains']);
    assert.deepEqual(pure.decay,{'1,1':-1});assert.deepEqual(pure.deaths,['body-0']);
    assert.deepEqual(pure.natural,['body-0']);assert.equal(pure.magic,0);assert.equal(pure.inheritance,null);assert.equal(pure.fusion,false);
  }
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),turn=s.timeline.turnNumber;
    const dead=(id,race,className,x)=>({...window.applyV39DerivedCharacterData({id,name:id,race,className,level:10,x,y:2,worldId:'surface'}),
      hp:0,currentHp:0,state:'死亡',deathTurn:turn,deadExpireTurn:turn+30,equipment:[{id:`gear-${id}`,name:'剣',slot:'武器1',quality:'common'}],
      corpseCargo:{resourcesByType:{木材:3,死体:100},equipmentInventory:[]}});
    const playerGhost=dead('remains-player-ghost','ゴースト','ゴースト',18),enemyGhost=dead('remains-enemy-ghost','レイス','レイス',19),
      zombie=dead('remains-zombie','ウルフ','ゾンビ',20),villageGhost=dead('remains-village-ghost','ゴースト','ゴースト',22);
    window.setV39GameState({players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,selectedUnitId:playerGhost.id,
      units:[...f.units,playerGhost],squads:f.squads.map(squad=>squad.id==='solo'?{...squad,unitIds:[...squad.unitIds,playerGhost.id]}:squad)}}:p),
      enemies:[...s.enemies,enemyGhost,zombie],enemySquads:[...s.enemySquads,{id:'remains-ghost-squad',unitIds:[enemyGhost.id],cargo:{resourcesByType:{鉄:7},equipmentInventory:[]}}],
      neutralVillages:s.neutralVillages.map((v,i)=>i===0?{...v,defenseUnits:[...v.defenseUnits,villageGhost]}:v)});
    window.runV39DeathLifecycle(turn);
    const after=window.getV39GameState(),active=window.getV39ActiveFactionState();
    const drops=Object.fromEntries(['18,2','19,2','22,2'].map(key=>[key,after.groundLootByTile[key]?.cargo]));
    const remains=after.enemies.find(u=>u.id===zombie.id),beforeRepeat=JSON.stringify(drops);
    window.runV39DeathLifecycle(turn);
    const repeated=window.getV39GameState();
    const once=beforeRepeat===JSON.stringify(Object.fromEntries(Object.keys(drops).map(key=>[key,repeated.groundLootByTile[key]?.cargo])));
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    return {drops,remains,once,playerRemoved:!active.units.some(u=>u.id===playerGhost.id),enemyRemoved:!after.enemies.some(u=>u.id===enemyGhost.id),
      villageCount:s.neutralVillages.length,villageRemoved:!after.neutralVillages.some(v=>v.defenseUnits.some(u=>u.id===villageGhost.id)),
      selected:active.selectedUnitId,saved:window.getV39GameState().enemies.find(u=>u.id===zombie.id)?.corpseKind};
  });
  assert(report.playerRemoved&&report.enemyRemoved&&report.villageRemoved&&report.once);assert(report.villageCount>0);
  assert.notEqual(report.selected,'remains-player-ghost');assert.equal(report.remains.corpseKind,'remains');assert.equal(report.remains.equipment.length,0);
  assert.equal(report.remains.corpseCargo.equipmentInventory.length,1);assert.equal(report.saved,'remains');
  for(const drop of Object.values(report.drops)){assert(drop);assert.equal(drop.equipmentInventory.length,1);assert.equal(drop.resourcesByType.木材,3);assert.equal(drop.resourcesByType.死体,100);}
  assert.equal(report.drops['19,2'].resourcesByType.鉄,7);
  await page.screenshot({path:`${out}/field-390.png`});assert.deepEqual(errors,[]);console.log('Organic corpses vs undead remains; no natural/magic recycling, purification, ghost dissolution, equipment/cargo, village/player/enemy, repeat and save/load passed');
}finally{await browser.close();}
