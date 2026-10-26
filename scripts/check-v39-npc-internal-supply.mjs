import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
  const teams=await import('/src/lib/v39-npc-resource-teams.js');
  const {inspectV39NpcDevelopmentPlan}=await import('/src/lib/v39-npc-development-plan.js');
  const {depositV39FactionCargo}=await import('/src/lib/v39-cargo-deposit.js');
  const {loadV39SettlementResource}=await import('/src/lib/v39-transport-rules.js');
  const {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS,normalizeV39Village}=await import('/src/lib/v39-economy-rules.js');
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const s=window.getV39GameState(),source=s.neutralVillages[0],human={...s.players[0],factionState:{...s.players[0].factionState,units:[]}};
  const map={...window.__v39FieldRuntime.mapData,grid:window.__v39FieldRuntime.mapData.grid.map(row=>row.map(()=> '平地')),lavaMap:[],hazardZones:[],worldWrapEnabled:false};
  const base=normalizeV39Village({...s.players[0].factionState.settlements[0],id:'home',settlementId:'home',ownerPlayerId:'npc-supply',name:'不足拠点',placed:true,x:4,y:4,
   population:100,populationByRace:{只人:100},foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),
   materialStockByType:{...Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,1000])),木材:0},
   territoryTileModeMap:{'4,5':'resource','10,5':'resource'},cityLevels:{軍事Lv:3,信仰Lv:3,魔法Lv:3,経済Lv:3,鍛冶Lv:3},buildings:['墓地'],constructionQueue:[],tileFacilityMap:{}},'只人');
  const donor={...base,id:'donor',settlementId:'donor',name:'余剰拠点',x:10,y:4,materialStockByType:{...base.materialStockByType,木材:200}};
  const units=Array.from({length:6},(_,i)=>({...source.defenseUnits[0],id:`supply-${i}`,name:`運搬軍${i}`,isNamed:i===0,isSovereign:i===0,summon:null,
   squadId:'solo',squadMoveMode:'follow',surveyTask:null,transportAssignment:null,tradeAssignment:null,caveDuty:null,worldId:'surface',
   x:i===1?10:3+i%3,y:i===1?4:5+Math.floor(i/3),hp:100,currentHp:100,maxHp:100,ap:100,currentAp:100,maxAp:100,waitTurnNumber:0,
   settlementId:i===1?'donor':'home',status:{SIZ:170,移動:100},combatProfile:{...source.defenseUnits[0].combatProfile,mode:'army',memberCount:3}}));
  const npc={...human,id:'npc-supply',race:'只人',isPlayer:false,factionState:{...human.factionState,units,settlements:[base,donor],selectedSettlementId:'home',
   squads:[{id:'solo',unitIds:units.map(unit=>unit.id),cargoByUnitId:{}}],unitTrainingQueue:[],visibility:{exploredTileKeys:[]},aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'}}};
  const state={...s,players:[human,npc],enemies:[],neutralVillages:[],settlements:[],enemyNests:[],groundLootByTile:{},activeWorldId:'surface',
   timeline:{...s.timeline,turnNumber:10,phase:'enemy'},territoryOwnerByTile:{'4,4':npc.id,'4,5':npc.id,'10,4':npc.id,'10,5':npc.id},
   territoryStateByTile:{'4,4':{settlementId:'home',hp:100},'4,5':{settlementId:'home',hp:100},'10,4':{settlementId:'donor',hp:100},'10,5':{settlementId:'donor',hp:100}},facilitiesByTile:{},victoryLandmarksByTile:{}};
  const plan=inspectV39NpcDevelopmentPlan(state,npc,map),budgets=plan.supplyBudgetBySettlement;
  const urgent=structuredClone(state),urgentPlayer=urgent.players[1];
  urgentPlayer.factionState.units=urgentPlayer.factionState.units.slice(0,2);
  urgentPlayer.factionState.squads=[{id:'solo',unitIds:urgentPlayer.factionState.units.map(unit=>unit.id),cargoByUnitId:{}}];
  urgentPlayer.factionState.settlements[0].materialStockByType.鉄=0;
  urgentPlayer.factionState.settlements[0].materialStockByType.木材=100;
  urgentPlayer.factionState.settlements[0].buildings=[];
  urgentPlayer.factionState.settlements[0].population=500;
  urgentPlayer.factionState.settlements[0].populationByRace={只人:500};
  urgentPlayer.factionState.settlements[1].foodStockByType={};
  urgentPlayer.factionState.settlements[1].population=0;
  urgentPlayer.factionState.settlements[1].populationByRace={};
  urgentPlayer.factionState.units=urgentPlayer.factionState.units.map(unit=>({...unit,settlementId:'home'}));
  const urgentGoals=[...['穀物','野菜','肉','魚'].map(name=>({name,missing:1000,priority:2,settlementId:'home'})),{name:'鉄',missing:50,priority:1,settlementId:'home'}];
  const urgentAssigned=teams.assignV39NpcResourceTeams(urgent,npc.id,urgentGoals,map,{supplyBudgetBySettlement:budgets}),urgentTeams=urgentAssigned.teams;
  ok(urgentTeams.length<=6&&urgentTeams[0]?.resource==='鉄'&&urgentTeams[0].actorId==='supply-1','known construction supply lost to unknown food or reserves');
  const ironObjective=teams.selectV39NpcTeamResourceObjective(urgentAssigned.state,urgentAssigned.state.players[1],urgentTeams[0],map);
  const ironLoad=teams.executeV39NpcTeamResourceAction(urgentAssigned.state,npc.id,ironObjective,map,urgentTeams[0]);
  ok(ironLoad?.state.players[1].factionState.settlements[1].materialStockByType.鉄===950,'iron was not loaded from real stock');
  let ironTrip=ironLoad.state;
  for(let turn=11;turn<=20;turn++){
   ironTrip={...ironTrip,timeline:{...ironTrip.timeline,turnNumber:turn},players:ironTrip.players.map(player=>player.id!==npc.id?player:{...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})};
   ironTrip=depositV39FactionCargo(teams.advanceV39NpcResourceTeams(ironTrip,npc.id,map,turn).state,npc.id).state;
   if(ironTrip.players[1].factionState.settlements[0].materialStockByType.鉄===50)break;
  }
  ok(ironTrip.players[1].factionState.settlements[0].materialStockByType.鉄===50,'iron did not reach the construction base');
  const enabledBuild=window.runV39FactionAiTurn(ironTrip,25,map);
  ok(enabledBuild.reports[0].commands.some(command=>command.startsWith('建設:墓地@')),'delivered iron did not unlock real construction: '+JSON.stringify({commands:enabledBuild.reports[0].commands,plan:enabledBuild.state.players[1].factionState.aiState.developmentPlan.construction}));
  ok(budgets.donor.穀物>0,'food reserves not generated');
  // The food-first planner may defer construction; retain an explicit donor material reserve for logistics checks.
  budgets.donor.木材=50;
  const goal={name:'木材',missing:50,settlementId:'home'},assigned=teams.assignV39NpcResourceTeams(state,npc.id,[goal],map,{supplyBudgetBySettlement:budgets});
  const team=assigned.teams[0],player=assigned.state.players[1],original=JSON.stringify(assigned.state);
  ok(team.actorId==='supply-1','unexpected worker');
  const objective=teams.selectV39NpcTeamResourceObjective(assigned.state,player,team,map);
  ok(objective.type==='resource-team-supply'&&objective.sourceSettlementId==='donor','surplus not preferred');
  ok(JSON.stringify(assigned.state)===original,'inspection mutated stock');
  const distant=structuredClone(assigned.state);distant.players[1].factionState.units.find(unit=>unit.id===team.actorId).x=9;
  ok(!teams.executeV39NpcTeamResourceAction(distant,npc.id,objective,map,team),'remote loading allowed');
  const wrongWorld={...player,factionState:{...player.factionState,settlements:[base,{...donor,worldId:'cave:one'}]}};
  ok(!teams.selectV39NpcInternalSupply(wrongWorld,team),'cross-world source allowed');
  ok(!teams.inspectV39NpcResourceWorkforce([{name:'木材',missing:50,settlementId:'donor'}],wrongWorld).jobs.length,'surface worker assigned to cave destination');
  const foreign={...player,factionState:{...player.factionState,settlements:[base,{...donor,ownerPlayerId:human.id}]}};
  ok(!teams.selectV39NpcInternalSupply(foreign,team),'foreign source allowed');
  const humanActor={...player,isPlayer:true};ok(!teams.selectV39NpcInternalSupply(humanActor,team),'human automated');
  const protectedSource={...player,factionState:{...player.factionState,settlements:[base,{...donor,materialStockByType:{...donor.materialStockByType,木材:budgets.donor.木材}}]}};
  ok(!teams.selectV39NpcInternalSupply(protectedSource,team),'source reserve consumed');
  const protectedFood={...player,factionState:{...player.factionState,settlements:[base,{...donor,foodStockByType:{...donor.foodStockByType,穀物:budgets.donor.穀物}}]}};
  ok(!teams.selectV39NpcInternalSupply(protectedFood,{...team,resource:'穀物',missing:5}),'food reserve consumed');
  const low=loadV39SettlementResource(donor,npc.race,'木材',{resourcesByType:{石材:90}},100,{maxAmount:50,minimumStock:100});
  ok(low.amount===10&&low.settlement.materialStockByType.木材===190,'capacity/stock boundary');
  ok(loadV39SettlementResource(donor,npc.race,'未登録',{},100).amount===0,'unregistered resource loaded');
  ok(loadV39SettlementResource(donor,npc.race,'木材',{},100,{maxAmount:0.3-0.2}).amount===0.1,'fractional remainder lost');
  const loaded=teams.executeV39NpcTeamResourceAction(assigned.state,npc.id,objective,map,team);ok(loaded,'load failed');
  const loadedPlayer=loaded.state.players[1],cargo=teams.getV39NpcUnitCargo(loadedPlayer,loadedPlayer.factionState.units.find(unit=>unit.id===team.actorId));
  ok(cargo.resourcesByType.木材===50&&loadedPlayer.factionState.settlements[1].materialStockByType.木材===150,'stock not transferred into real cargo');
  ok(depositV39FactionCargo(loaded.state,npc.id).reports.length===0,'cargo immediately returned to donor');
  ok(!teams.executeV39NpcTeamResourceAction(loaded.state,npc.id,objective,map,team),'same cargo loaded twice');
  const shared=structuredClone(assigned.state),sharedPlayer=shared.players[1],sharedTeam={...team,missing:250,unitIds:[team.actorId,'supply-2']};
  sharedPlayer.factionState.units=sharedPlayer.factionState.units.map(unit=>unit.id===team.actorId||unit.id==='supply-2'
   ?{...unit,squadId:'supply-team',x:10,y:unit.id===team.actorId?4:5}:unit);
  sharedPlayer.factionState.squads=[{id:'supply-team',unitIds:sharedTeam.unitIds,movementLeaderId:team.actorId,cargo:{resourcesByType:{}}},
   {id:'solo',unitIds:units.filter(unit=>!sharedTeam.unitIds.includes(unit.id)).map(unit=>unit.id),cargoByUnitId:{}}];
  sharedPlayer.factionState.aiState.resourceTeams=[sharedTeam];
  const sharedObjective=teams.selectV39NpcTeamResourceObjective(shared,sharedPlayer,sharedTeam,map);
  const sharedLoaded=teams.executeV39NpcTeamResourceAction(shared,npc.id,sharedObjective,map,sharedTeam);
  ok(sharedLoaded?.state.players[1].factionState.squads[0].cargo.resourcesByType.木材===150,'shared crew capacity or donor reserve wrong');
  ok(sharedLoaded.state.players[1].factionState.squads[0].cargoDeliveryTargetSettlementId==='home'
   &&depositV39FactionCargo(sharedLoaded.state,npc.id).reports.length===0,'shared delivery target missing');
  const reassign=teams.assignV39NpcResourceTeams(loaded.state,npc.id,[goal],map,{supplyBudgetBySettlement:budgets});
  ok(reassign.teams[0].unitIds.length===1,'loaded cargo regrouped and lost delivery target');
  const second={...team,id:'other',actorId:'supply-2',unitIds:['supply-2']};
  const concurrent={...loadedPlayer,factionState:{...loadedPlayer.factionState,aiState:{...loadedPlayer.factionState.aiState,resourceTeams:[team,second]}}};
  ok(teams.selectV39NpcTeamResourceObjective({...loaded.state,players:[human,concurrent]},concurrent,second,map).type==='resource-team-supply-wait','in-transit resources not counted');
  const more={...concurrent,factionState:{...concurrent.factionState,aiState:{...concurrent.factionState.aiState,resourceTeams:[{...team,missing:70},{...second,missing:70}]}}};
  ok(teams.selectV39NpcInternalSupply(more,{...second,missing:70}).maxAmount===20,'partial incoming quantity wrong');
  let returned=loaded.state;const deliveries=[];
  for(let turn=11;turn<=18;turn++){
   returned={...returned,timeline:{...returned.timeline,turnNumber:turn},players:returned.players.map(row=>row.id!==npc.id?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})};
   returned=teams.advanceV39NpcResourceTeams(returned,npc.id,map,turn).state;
   const deposit=depositV39FactionCargo(returned,npc.id);returned=deposit.state;deliveries.push(...deposit.reports);
   if(deposit.reports.length)break;
  }
  const home=returned.players[1].factionState.settlements.find(row=>row.settlementId==='home'),from=returned.players[1].factionState.settlements.find(row=>row.settlementId==='donor');
  ok(home.materialStockByType.木材===50&&from.materialStockByType.木材===150,'delivery changed total material or wrong destination');
  ok(deliveries[0]?.settlementId==='home','wrong delivery report');
  const live=window.runV39FactionAiTurn(state,10,map);
  ok(live.reports[0].commands.some(command=>command.startsWith('拠点間調達:')),'live AI not connected');
  window.setV39GameState(loaded.state);window.importV39SaveJson(window.exportV39SaveJson(0));
  const saved=window.getV39GameState();ok(saved.players[1].factionState.squads[0].cargoDeliveryTargetByUnitId[team.actorId]==='home','delivery target lost on save');
  ok(saved.players[1].factionState.aiState.supplyBudgetBySettlement.donor.木材===budgets.donor.木材,'reserve lost on save');
  ok(saved.players[1].factionState.aiState.resourceTeams[0].actorId===team.actorId,'worker assignment lost on save');
  const {createPlayerFactionState}=await import('/src/lib/player-state.js');
  const legacy=createPlayerFactionState({...loadedPlayer.factionState,aiState:{developmentPlan:{resourceTeams:[team],supplyBudgetBySettlement:budgets,reinforcement:{target:6}}}},npc.id);
  ok(legacy.aiState.resourceTeams[0].actorId===team.actorId&&legacy.aiState.supplyBudgetBySettlement.donor.木材===budgets.donor.木材,'legacy diagnostic snapshot not recovered');
  let resumed=saved,resumeReports=[];
  for(let turn=11;turn<=18&&!resumeReports.length;turn++){
   resumed={...resumed,timeline:{...resumed.timeline,turnNumber:turn},players:resumed.players.map(row=>row.id!==npc.id?row:{...row,factionState:{...row.factionState,
    units:row.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})};
   const next=teams.advanceV39NpcResourceTeams(resumed,npc.id,map,turn),delivery=depositV39FactionCargo(next.state,npc.id);
   resumed=delivery.state;resumeReports=delivery.reports;
  }
  ok(resumeReports[0]?.settlementId==='home'&&resumed.players[1].factionState.settlements[0].materialStockByType.木材===50,'saved delivery did not resume');
  window.setV39GameState(live.state);window.openV39TestTools();
  return {budgets,objective,load:loaded.command,deliveries,commands:live.reports[0].commands};
 });
 await page.locator('[data-test-tab=diagnostics]').click();const section=page.locator('[data-test-section=npc-ai]');
 if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
 await section.locator('[data-npc-diagnostic-view=actions]').click();
 assert.match(await section.locator('[data-npc-resource-teams]').innerText(),/余剰拠点|不足拠点|運搬/);
 await mkdir('output/web-game/npc-internal-supply',{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await section.locator('[data-npc-resource-teams]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/npc-internal-supply/diagnostic-${width}.png`});}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
