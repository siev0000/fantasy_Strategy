import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const definitions=JSON.parse(readFileSync('data/source/export/json/イベント会話.json','utf8'));
mkdirSync('output/web-game/village-campaign',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const report=await page.evaluate(async definitions=>{
  const {normalizeV39NeutralVillage,advanceV39NeutralVillages}=await import('/src/lib/v39-neutral-village-rules.js');
  const {resettleV39AbandonedVillage}=await import('/src/lib/v39-abandoned-villages.js');
  const {openV39VillageDialogue,chooseV39VillageDialogue}=await import('/src/lib/v39-village-dialogue.js');
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest(false,{silentBanner:true});await window.waitForV39MapRenderSettled();
  const original=window.getV39GameState(),map=window.__v39FieldRuntime.mapData,player=original.players[0],village=original.neutralVillages[0];
  const defended=normalizeV39NeutralVillage({...village,population:50},map);
  const dead={...defended,defenseUnits:defended.defenseUnits.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}))};
  const abandoned=normalizeV39NeutralVillage({...dead,population:0},map),repeated=normalizeV39NeutralVillage(abandoned,map);
  const state={...original,neutralVillages:[abandoned],settlements:[abandoned],players:[{...player,factionState:{...player.factionState,
    units:player.factionState.units.map((u,i)=>i===0?{...u,x:village.x,y:village.y}:u)}}]};
  const resettled=resettleV39AbandonedVillage(state,player.id,village.id);
  const beforePop=player.factionState.settlements.reduce((n,s)=>n+s.population,0),afterPop=resettled.state.players[0].factionState.settlements.reduce((n,s)=>n+s.population,0);
  const results=[];
  for(const definition of definitions){
    const material={...village.materialStockByType,金:100},live={...village,materialStockByType:material,soulStock:10,
      questsByPlayerId:{},relationsByPlayerId:{},eventCompletedTurnByPlayerId:{}};
    const faction={...player.factionState,eventDialogueById:{},units:player.factionState.units.map((u,i)=>i===0?{...u,x:village.x,y:village.y}:u)};
    let working={...original,players:[{...player,race:definition.ID==='DEMON_REPAIR_SUPPLY'?'悪魔':player.race,factionState:faction}],neutralVillages:[live],settlements:[live]};
    if(definition.ID==='VILLAGE_WOLF_HUNT')working.enemies=Array.from({length:3},(_,i)=>({id:'quest-wolf-'+i,race:'ウルフ',name:'ウルフ',hp:10,currentHp:10,x:village.x+1+i,y:village.y,aggressive:true,worldId:'surface'}));
    const opened=openV39VillageDialogue(working,definition,village.id,map);if(!opened.ok)throw Error(definition.ID+': '+opened.reason);
    const accepted=chooseV39VillageDialogue(opened.state,opened.session.instanceId,'1',map);if(!accepted.ok)throw Error('accept '+definition.ID+': '+accepted.reason);
    working=accepted.state;
    if(definition.ID==='VILLAGE_WOLF_HUNT')working={...working,enemies:working.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}))};
    window.setV39GameState(working,{reason:'formal-event-save-test'});window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    working=window.getV39GameState();
    const completed=chooseV39VillageDialogue(working,opened.session.instanceId,'1-1',map);if(!completed.ok)throw Error('complete '+definition.ID+': '+completed.reason);
    const duplicate=chooseV39VillageDialogue(completed.state,opened.session.instanceId,'1-1',map);
    const v=completed.state.neutralVillages[0];
    results.push({id:definition.ID,relation:v.relationsByPlayerId[player.id],completed:v.questsByPlayerId[player.id].completed,duplicateBlocked:!duplicate.ok});
  }
  return {defenses:defended.defenseUnits.length,abandoned:abandoned.abandoned,deadRemain:repeated.defenseUnits.every(u=>u.hp===0),
    resettled:resettled.ok,neutralRemoved:resettled.state.neutralVillages.length===0,beforePop,afterPop,events:results};
 },definitions);
 assert(report.defenses>0);assert(report.abandoned&&report.deadRemain&&report.resettled&&report.neutralRemoved);assert.equal(report.afterPop,report.beforePop);
 assert.equal(report.events.length,definitions.length);assert(report.events.every(e=>e.relation===10&&e.completed&&e.duplicateBlocked));
 assert.deepEqual(errors,[]);await page.screenshot({path:'output/web-game/village-campaign/formal.png'});console.log(report);
}finally{await browser.close();}
