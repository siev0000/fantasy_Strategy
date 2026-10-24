import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/village-plans',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const rules=await import('/src/lib/v39-neutral-village-rules.js');
  const plans=await import('/src/lib/v39-village-plans.js');
  const {getHexNeighborCoords}=await import('/src/lib/hex-grid.js');
  const {facilityDefinitions,FOOD_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest(false,{silentBanner:true});await window.waitForV39MapRenderSettled();
  const original=window.getV39GameState(),map={...window.__v39FieldRuntime.mapData,w:20,h:20,worldWrapEnabled:false,grid:Array.from({length:20},()=>Array(20).fill('平地')),lavaMap:[]};
  const keys=['6,6',...getHexNeighborCoords(20,20,6,6,false).map(tile=>`${tile.x},${tile.y}`)];
  let village=rules.normalizeV39NeutralVillage({...original.neutralVillages[0],x:6,y:6,population:50,populationByRace:undefined,
   abandoned:false,incidentTest:false,vassalPlayerId:'',hadDefenseUnits:false,defenseRosterInitialized:false,defenseUnits:[],
   territoryTileKeys:keys,territoryTileModeMap:Object.fromEntries(keys.map(key=>[key,key==='6,6'?'居住地':'資源地'])),
   foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),materialStockByType:{木材:0,石材:0,鉄:0,金:100},buildings:[],constructionQueue:[],tileFacilityMap:{},
   researchLevels:{信仰Lv:1},lastProcessedTurn:0},map);
  const corpse={...village.defenseUnits[0],id:'plan-corpse',x:6,y:6,hp:0,currentHp:0,state:'死亡'};
  village={...village,defenseUnits:[...village.defenseUnits,corpse]};
  const player=original.players[0],faction={...player.factionState,settlements:player.factionState.settlements.map(base=>({...base,materialStockByType:{...base.materialStockByType,木材:1000,石材:1000,鉄:1000}}))};
  delete faction.village;
  let state={...original,players:[{...player,factionState:faction}],enemies:[],neutralVillages:[village],settlements:[village],
   timeline:{...original.timeline,turnNumber:2},territoryOwnerByTile:{...original.territoryOwnerByTile,...Object.fromEntries(keys.map(key=>[key,village.id]))}};
  state=rules.advanceV39NeutralVillages(state,map,2).state;
  const first=state.neutralVillages[0],candidate=rules.listV39NeutralVillageQuests(state,player.id,village.id,map).find(row=>row.eventId==='TPL_VILLAGE_SUPPLY');
  if(!candidate)throw Error(JSON.stringify({schedule:first.planSchedule,plans:plans.inspectV39VillagePlans(state,first,map)}));
  const accepted=rules.acceptV39NeutralVillageQuest(state,player.id,village.id,map,candidate.eventId);if(!accepted.ok)throw Error(accepted.reason);
  const completed=rules.completeV39NeutralVillageQuest(accepted.state,player.id,village.id);if(!completed.ok)throw Error(completed.reason);
  const donated=completed.state.neutralVillages[0];
  const donation=donated.materialStockByType[candidate.resourceKey]-first.materialStockByType[candidate.resourceKey];
  const duplicate=rules.completeV39NeutralVillageQuest(completed.state,player.id,village.id);
  state={...completed.state,neutralVillages:[{...donated,materialStockByType:{...donated.materialStockByType,木材:1000,石材:1000,鉄:1000}}]};
  state=rules.advanceV39NeutralVillages(state,map,3).state;
  const building=state.neutralVillages[0],queue=building.constructionQueue.find(item=>item.facilityName==='墓地');
  if(!queue)throw Error(JSON.stringify({schedule:building.planSchedule,stock:building.materialStockByType}));
  const same=rules.advanceV39NeutralVillages(state,map,3).state.neutralVillages[0].constructionQueue[0].remainingTurns;
  window.setV39GameState({...state,timeline:{...state.timeline,turnNumber:3}});window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
  state=window.getV39GameState();const saved=state.neutralVillages[0].constructionQueue[0].remainingTurns===queue.remainingTurns;
  const started=queue.remainingTurns;
  for(let turn=4;turn<=3+started;turn++)state=rules.advanceV39NeutralVillages(state,map,turn).state;
  const finished=state.neutralVillages[0],facility=state.facilitiesByTile[queue.tileKey]?.includes('墓地');
  const threat={id:'actual-threat',race:'ウルフ',x:6,y:7,aggressive:true,hp:100,currentHp:100,status:{攻撃:10000},worldId:'surface'};
  const riskState={...state,enemies:[threat],timeline:{...state.timeline,turnNumber:20}};
  const hunt=rules.listV39NeutralVillageQuests(riskState,player.id,village.id,map).find(row=>row.eventId==='TPL_VILLAGE_HUNT');
  const weakState={...riskState,enemies:[{...threat,status:{攻撃:0},level:1}]};
  const noUnnecessaryHunt=!rules.listV39NeutralVillageQuests(weakState,player.id,village.id,map).some(row=>row.eventId==='TPL_VILLAGE_HUNT');
  const acceptedHunt=rules.acceptV39NeutralVillageQuest(riskState,player.id,village.id,map,'TPL_VILLAGE_HUNT');
  const deadState={...acceptedHunt.state,enemies:[{...threat,hp:0,currentHp:0,state:'死亡'}]};
  const huntDone=rules.completeV39NeutralVillageQuest(deadState,player.id,village.id).ok;
  const supplyUI={...first,x:original.neutralVillages[0].x,y:original.neutralVillages[0].y};
  window.setV39GameState({...original,neutralVillages:[supplyUI],settlements:original.settlements.map(row=>row.id===supplyUI.id?supplyUI:row),timeline:{...original.timeline,turnNumber:2}});
  window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:supplyUI.x,y:supplyUI.y}}));window.activateV39FooterTab('interaction');await window.waitForV39MapRenderSettled();
  return {plan:first.planSchedule.active.name,stage:first.planSchedule.active.stage,required:candidate.required,donation,
   duplicateBlocked:!duplicate.ok,relation:donated.relationsByPlayerId[player.id],started,same,saved,
   built:finished.buildings.includes('墓地'),facility,hunt:hunt?.targetEnemyIds,noUnnecessaryHunt,huntDone,
   costs:facilityDefinitions().find(row=>row.name==='墓地').cost};
 });
 console.log(result);assert.equal(result.stage,'資材確保');assert.equal(result.required,result.donation);assert.equal(result.relation,10);
 assert(result.duplicateBlocked&&result.saved&&result.built&&result.facility&&result.noUnnecessaryHunt&&result.huntDone);
 assert.equal(result.same,result.started);assert.deepEqual(result.hunt,['actual-threat']);assert.deepEqual(errors,[]);
 await page.screenshot({path:'output/web-game/village-plans/plans-390.png'});
}finally{await browser.close();}
