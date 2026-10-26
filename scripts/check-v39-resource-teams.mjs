import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
  const teams=await import('/src/lib/v39-npc-resource-teams.js');
  const {depositV39FactionCargo}=await import('/src/lib/v39-cargo-deposit.js');
  const {advanceV39VillageResourceTeams}=await import('/src/lib/v39-village-resource-teams.js');
  const {inspectV39Gather}=await import('/src/lib/v39-gather-rules.js');
  const {editV39Squad}=await import('/src/lib/v39-squad-edit-rules.js');
  const {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const s=window.getV39GameState(),human={...s.players[0],factionState:{...s.players[0].factionState,units:s.players[0].factionState.units.map((unit,i)=>({...unit,x:0,y:i}))}},source=s.neutralVillages[0],map={...window.__v39FieldRuntime.mapData,grid:window.__v39FieldRuntime.mapData.grid.map(row=>row.map(()=> '平地')),lavaMap:[]};
  const base={...human.factionState.settlements[0],placed:true,x:4,y:4,settlementId:'resource-base',population:100,populationByRace:{只人:100},
   cityLevels:{軍事Lv:3,経済Lv:3,信仰Lv:3,魔法Lv:3,鍛冶Lv:3},
   foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),
   materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,100000])),buildings:['墓地'],constructionQueue:[],territoryTileModeMap:{'4,5':'resource'}};
  const template=source.defenseUnits[0]||human.factionState.units[0];
  const units=Array.from({length:6},(_,i)=>({...template,id:`worker-${i}`,name:`資源軍${i}`,race:'ヒューマン',className:'ファイター',
   isSovereign:i===0,isNamed:i===0,summon:null,squadId:'solo',squadMoveMode:'follow',surveyTask:null,transportAssignment:null,tradeAssignment:null,caveDuty:null,
   hp:100,maxHp:100,currentHp:100,ap:100,currentAp:100,maxAp:100,worldId:'surface',x:i===0?3:4+i%3,y:4+Math.floor(i/3),status:{...template.status,SIZ:170,移動:100},
   combatProfile:{...template.combatProfile,mode:'army',memberCount:3},waitTurnNumber:0}));
  const npc={...human,id:'resource-npc',isPlayer:false,race:'只人',factionState:{...human.factionState,units,
   squads:[{id:'solo',unitIds:units.map(unit=>unit.id),cargoByUnitId:{}}],settlements:[base],selectedSettlementId:base.settlementId,unitTrainingQueue:[],
   aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'},visibility:{exploredTileKeys:[]},exploration:{}}};
  const state={...s,players:[human,npc],enemies:[],enemyNests:[],neutralVillages:[],settlements:[],groundLootByTile:{},activeWorldId:'surface',
   territoryOwnerByTile:{'4,4':npc.id,'4,5':npc.id},territoryStateByTile:{},facilitiesByTile:{},timeline:{...s.timeline,phase:'enemy',turnNumber:10}};
  const goals=[{name:'木材',missing:50,settlementId:base.settlementId},{name:'石材',missing:250,settlementId:base.settlementId}];
  const workforce=teams.inspectV39NpcResourceWorkforce(goals,npc);
  ok(workforce.jobs.length===3,'deficit amount not reflected in worker count');
  ok(teams.inspectV39NpcResourceWorkforce([...goals,goals[0]],npc).jobs.length===3,'duplicate purposes doubled workers');
  const assigned=teams.assignV39NpcResourceTeams(state,npc.id,goals,map),current=assigned.state.players[1];
  const ids=current.factionState.aiState.resourceTeams.flatMap(row=>row.unitIds);
  ok(new Set(ids).size===ids.length&&ids.length<=4&&!ids.includes('worker-0'),'reserve/unique/sovereign restriction');
  ok(current.factionState.aiState.resourceTeams.every(row=>row.actorId),'available armies not assigned');
  ok(current.factionState.squads.some(row=>row.id!=='solo'&&row.unitIds.length===2),'spare armies not formed into squad');
  const managed=current.factionState.squads.find(row=>row.npcResourceTeam);
  const released=teams.assignV39NpcResourceTeams(assigned.state,npc.id,[],map).state;
  const rerouted=teams.assignV39NpcResourceTeams(released,npc.id,[{name:'木材',missing:50,settlementId:base.settlementId}],map);
  ok(managed.unitIds.every(id=>rerouted.teams[0].unitIds.includes(id)),'idle resource squad was not reused');
  ok(teams.assignV39NpcResourceTeams(state,human.id,goals,map).state===state,'human faction automated');
  const team={...workforce.jobs[0],resource:'木材',unitIds:['worker-1'],actorId:'worker-1'};
  const harvest=structuredClone(state),p=harvest.players[1];
  p.factionState.units=p.factionState.units.map(unit=>unit.id==='worker-1'?{...unit,x:7,y:4}:unit);
  p.factionState.aiState.resourceTeams=[team];p.factionState.visibility.exploredTileKeys=['7,4'];map.grid[4][7]='森';
  const hidden=structuredClone(harvest);hidden.players[1].factionState.units=hidden.players[1].factionState.units.map(unit=>({...unit,x:1,y:1}));
  hidden.players[1].factionState.settlements[0]={...base,x:1,y:1};hidden.players[1].factionState.visibility.exploredTileKeys=[];
  ok(teams.selectV39NpcTeamResourceObjective(hidden,hidden.players[1],team,map).type==='resource-team-search','hidden supply position leaked');
  const check=inspectV39Gather(harvest,npc.id,'worker-1',map,{aiTurn:true,resource:'木材'});
  ok(check.available&&check.yields.木材>0,'AI gather rejected: '+check.reasons.join('/'));
  ok(!inspectV39Gather({...harvest,players:harvest.players.map(row=>row.id===npc.id?{...row,isPlayer:true}:row)},npc.id,'worker-1',map,{aiTurn:true}).available,'AI bypass applied to human');
  const acted=teams.advanceV39NpcResourceTeams(harvest,npc.id,map,10);
  ok(acted.commands.some(command=>command.startsWith('資源取得:木材')),'did not gather');
  const cargo=teams.getV39NpcUnitCargo(acted.state.players[1],acted.state.players[1].factionState.units.find(unit=>unit.id==='worker-1'));
  ok(cargo.resourcesByType.木材>0,'gather did not create real cargo');
  let returned=acted.state;
  for(let turn=11;turn<15;turn++){
   returned={...returned,timeline:{...returned.timeline,turnNumber:turn},players:returned.players.map(row=>row.id!==npc.id?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})};
   returned=teams.advanceV39NpcResourceTeams(returned,npc.id,map,turn).state;
   const deposited=depositV39FactionCargo(returned,npc.id);returned=deposited.state;
   if(deposited.reports.length)break;
  }
  ok(returned.players[1].factionState.settlements[0].materialStockByType.木材>base.materialStockByType.木材,'cargo never delivered');
  const noCargo=teams.assignV39NpcResourceTeams(returned,npc.id,[],map).state;
  ok(noCargo.players[1].factionState.aiState.resourceTeams.length===0,'completed needs retained assignments');
  const village={...source,race:'只人',population:100,populationByRace:{只人:100},incidentTest:false,buildings:['墓地'],constructionQueue:[],tileFacilityMap:{},
   foodStockByType:base.foodStockByType,materialStockByType:{...base.materialStockByType,木材:0},researchLevels:base.cityLevels,
   defenseUnits:units.map((unit,i)=>({...unit,isSovereign:false,isNamed:false,x:i===0?source.x+3:source.x+i%3,y:source.y+Math.floor(i/3),id:`vworker-${i}`,lastDefenseTurn:0}))};
  const villageMap={...map,grid:map.grid.map(row=>row.slice())};villageMap.grid[source.y][source.x+3]='森';
  const villageState={...s,enemies:[],players:[human],neutralVillages:[village],settlements:[village],activeWorldId:'surface',groundLootByTile:{},
   territoryOwnerByTile:Object.fromEntries(village.territoryTileKeys.map(tile=>[tile,village.id])),territoryStateByTile:{},timeline:{...s.timeline,turnNumber:20}};
  const vbefore=JSON.stringify(villageState.players);
  const vresult=advanceV39VillageResourceTeams(villageState,village,villageMap,20);
  ok(vresult.village.resourceOperations?.aiState?.resourceTeams.length>0,'village has no resource jobs');
  ok(JSON.stringify(vresult.state.players)===vbefore,'village shadow changed player faction');
  ok(vresult.state.players.length===1,'village became victory faction');
  ok(vresult.village.resourceOperations.aiState.resourceTeams.flatMap(row=>row.unitIds).length<=4,'village defenders not reserved');
  ok(advanceV39VillageResourceTeams(vresult.state,vresult.village,villageMap,20).village===vresult.village,'village double-processed');
  let progressing=vresult,obtained=vresult.reports.some(row=>row.message?.startsWith('資源取得:'));
  for(let turn=21;turn<=30&&!(progressing.village.materialStockByType.木材>0);turn++){
   const next=advanceV39VillageResourceTeams({...progressing.state,neutralVillages:[progressing.village],settlements:[progressing.village]},progressing.village,villageMap,turn);
   obtained ||= next.reports.some(row=>row.message?.startsWith('資源取得:'));progressing=next;
  }
  ok(obtained&&progressing.village.materialStockByType.木材>0,'village did not gather and deliver actual resources');
  const trainingVillage={...village,defenseUnits:village.defenseUnits.slice(0,2),materialStockByType:{...base.materialStockByType,木材:25},resourceOperations:undefined};
  const training=advanceV39VillageResourceTeams({...villageState,neutralVillages:[trainingVillage]},trainingVillage,villageMap,20);
  ok(training.village.resourceOperations.unitTrainingQueue?.length===1,'village did not queue paid army training');
  ok(training.village.materialStockByType.木材<25&&training.village.defenseUnits.length===2,'training was free or immediate');
  let trained=training;
  for(let turn=21;turn<=35&&trained.village.defenseUnits.length===2;turn++)trained=advanceV39VillageResourceTeams({...trained.state,neutralVillages:[trained.village]},trained.village,villageMap,turn);
  ok(trained.village.defenseUnits.length>2,'paid village training never completed');
  const held={...training.village,resourceOperations:{...training.village.resourceOperations,lastProcessedTurn:20,
   unitTrainingQueue:training.village.resourceOperations.unitTrainingQueue.map(entry=>({...entry,requiredExp:1,progressExp:0,lastProcessedTurn:0}))}};
  const {getHexNeighborCoords}=await import('/src/lib/hex-grid.js');
  const blockedUnits=[{x:held.x,y:held.y},...getHexNeighborCoords(map.w,map.h,held.x,held.y,false)].map((tile,i)=>({...units[0],...tile,id:`block-${i}`}));
  const blocked=advanceV39VillageResourceTeams({...villageState,players:[human,{id:'blockers',isPlayer:true,factionState:{units:blockedUnits}}],neutralVillages:[held]},held,villageMap,30).village;
  ok(blocked.defenseUnits.length===2&&blocked.resourceOperations.unitTrainingQueue[0]?.progressExp===1,'completed recruit overlaps or vanishes when deployment blocked');
  const live=window.runV39FactionAiTurn({...state,timeline:{...state.timeline,phase:'player'},players:[human,{...npc,factionState:{...npc.factionState,settlements:[{...base,materialStockByType:{...base.materialStockByType,木材:0}}]}}]},10,map);
  ok(live.state.players[1].factionState.aiState.resourceTeams.length>0,'live faction AI missing jobs');
  const repeated=window.runV39FactionAiTurn(live.state,10,map);ok(JSON.stringify(repeated.state)===JSON.stringify(live.state),'same turn repeated');
  window.setV39GameState({...live.state,neutralVillages:[vresult.village],settlements:[vresult.village]});
  window.importV39SaveJson(window.exportV39SaveJson(0));
  ok(window.getV39GameState().neutralVillages[0].resourceOperations.aiState.resourceTeams.length>0,'village jobs lost on save');
  window.openV39TestTools();
  return {workforce,assigned:current.factionState.aiState.resourceTeams,harvest:acted.commands,village:vresult.reports,live:live.reports};
 });
 await page.locator('[data-test-tab=diagnostics]').click();const diagnostic=page.locator('[data-test-section=npc-ai]');
 if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
 await diagnostic.locator('[data-npc-diagnostic-view=actions]').click();
 assert.match(await diagnostic.locator('[data-npc-resource-teams]').innerText(),/木材/);
 await mkdir('output/web-game/resource-teams',{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await diagnostic.locator('[data-npc-resource-teams]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/resource-teams/diagnostic-${width}.png`});}
 await page.evaluate(async()=>{
  window.closeV39TestTools();const s=window.getV39GameState(),v=s.neutralVillages[0];
  window.setV39GameState({players:s.players.map(player=>player.isPlayer===false?player:{...player,factionState:{...player.factionState,
   units:player.factionState.units.map(unit=>unit.id==='plan-visitor-cemetery'?{...unit,x:v.x,y:v.y+1}:unit)}})});
  window.focusV39VillagePlanTest('cemetery');await window.waitForV39MapRenderSettled();
 });
 await page.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-info').click();
 assert.match(await page.locator('[data-village-resource-teams]').innerText(),/木材/);
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await page.locator('[data-village-resource-teams]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/resource-teams/village-${width}.png`});}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
