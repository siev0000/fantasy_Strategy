import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/npc-growth-commerce';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
    const growth=await import('/src/lib/v39-npc-growth.js'),commerce=await import('/src/lib/v39-npc-commerce.js');
    const equipment=await import('/src/lib/v39-equipment-rules.js'),promotion=await import('/src/lib/v39-class-progression.js');
    const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
    const {normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
    const {researchTreeData}=await import('/src/lib/research-tree-config.js');
    const {normalizeResearchState}=await import('/src/lib/research-progress.js');
    const {advanceV39ExplorationTurn}=await import('/src/lib/v39-exploration-rules.js');
    const {advanceV39SpecialResourceHarvest}=await import('/src/lib/v39-specialty-rules.js');
    const {inspectV39NpcResourceExpansion}=await import('/src/lib/v39-npc-resource-expansion.js');
    const {createPlayerFactionState}=await import('/src/lib/player-state.js');
    const {getGameDataRows}=await import('/src/lib/game-data-registry.js');
    const trades=await import('/src/lib/v39-trade-state.js');
    const diagnostic=await import('/src/v39/dev/v39-npc-diagnostics.js');
    const checks=[],check=(condition,message)=>{if(!condition)throw Error(message);checks.push(message);};
    const original=window.getV39GameState(),human=original.players[0];
    const map={...window.__v39FieldRuntime.mapData,grid:Array.from({length:20},()=>Array(20).fill('平地')),heightLevelMap:Array.from({length:20},()=>Array(20).fill(0)),w:20,h:20,
      specialMap:[],lavaMap:[],hazardZones:[],worldWrapEnabled:false};
    const base=normalizeV39Village({...human.factionState.settlements[0],id:'growth-home',settlementId:'growth-home',ownerPlayerId:'growth-npc',name:'検証拠点',placed:true,x:4,y:4,
      population:100,populationByRace:{只人:100},foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,1000])),
      materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,1000])),buildings:[],constructionQueue:[],tileFacilityMap:{},landExpansionProjects:[],
      territoryResidentialCenterMap:{},territoryTileModeMap:{},cityLevels:{鍛冶Lv:2,経済Lv:3,軍事Lv:3,信仰Lv:3}},'只人');
    const weaponName=getGameDataRows('クラス').find(row=>row.名前==='ファイター').武器1;
    const weapon=equipment.createV39EquipmentEntry(weaponName,equipment.V39_EQUIPMENT_RARITIES[0].key,'武器1');
    const hero={...derive({id:'growth-hero',name:'検証英雄',race:'只人',className:'ファイター',level:5,hp:100,currentHp:100,x:4,y:4,worldId:'surface',ap:100,isNamed:true}),
      hp:100,currentHp:100,ap:100,currentAp:100,squadId:'solo',equipment:[weapon],settlementId:base.id};
    const npc={...human,id:'growth-npc',isPlayer:false,race:'只人',factionState:{...human.factionState,units:[hero],squads:[{id:'solo',unitIds:[hero.id],cargoByUnitId:{}}],settlements:[base],selectedSettlementId:base.id,
      research:normalizeResearchState(),aiState:{},exploration:{surveyedTileKeys:[],discoveredSpecialtiesByTile:{}},visibility:{exploredTileKeys:['4,4','5,4']}}};
    const initial={...original,players:[human,npc],activeWorldId:'surface',activePlayerId:human.id,timeline:{...original.timeline,phase:'resolution',turnNumber:20},
      neutralVillages:[],settlements:[],enemies:[],enemyNests:[],groundLootByTile:{},specialtiesByTile:{},purificationByTile:{},fogByTile:{},disasterAreas:[],
      territoryOwnerByTile:{'4,4':npc.id},territoryStateByTile:{'4,4':{settlementId:base.id,hp:100}}};
    const development={resourceGoals:[],foodBalances:[],supplyBudgetBySettlement:{[base.id]:{}}};
    const snapshot=JSON.stringify(initial),plan=growth.inspectV39NpcEquipmentPlan(npc,development);
    check(plan&&plan.researchReady&&!plan.shortages.length,'equipment plan uses real rarity and costs');
    const upgraded=growth.advanceV39NpcGrowth(initial,npc.id,map,20,development);
    const updated=upgraded.state.players[1],newWeapon=updated.factionState.units[0].equipment[0];
    check(newWeapon.quality===plan.rarity,'hero equips crafted upgrade');
    check(Object.entries(plan.cost).every(([key,amount])=>Math.abs(updated.factionState.settlements[0].materialStockByType[key]-(base.materialStockByType[key]-amount))<.01),'equipment materials charged exactly');
    check(JSON.stringify(initial)===snapshot,'planning and actions do not mutate source state');
    const protectedPlan=growth.inspectV39NpcEquipmentPlan(npc,{...development,supplyBudgetBySettlement:{[base.id]:{...base.materialStockByType}}});
    check(protectedPlan.shortages.length>0,'construction reserves block luxury spending');
    const again=growth.advanceV39NpcGrowth(upgraded.state,npc.id,map,21,development);
    check(!again.commands.some(command=>command.startsWith('装備更新:')),'equipment cooldown persisted');
    check(createPlayerFactionState(updated.factionState,npc.id).aiState.lastEquipmentTurn===20,'growth cooldown survives state normalization');
    const mobNpc={...npc,factionState:{...npc.factionState,units:[{...hero,isNamed:false,isSovereign:false,unitType:'軍隊'}]}};
    const mobResult=growth.advanceV39NpcGrowth({...initial,players:[human,mobNpc]},npc.id,map,20,development);
    check(mobResult.commands.some(command=>command.includes('固定装備一新'))&&mobResult.state.players[1].factionState.units[0].equipment.every(item=>item.quality===plan.rarity),'mob army uses paid fixed-equipment reroll');
    const inventoryBase={...base,equipmentInventory:[{key:`${weapon.name}::${plan.rarity}`,name:weapon.name,quality:plan.rarity,count:1,item:equipment.createV39EquipmentEntry(weapon.name,plan.rarity,weapon.slot)}]};
    const inventoryNpc={...npc,factionState:{...npc.factionState,settlements:[inventoryBase]}};
    const inventoryResult=growth.advanceV39NpcGrowth({...initial,players:[human,inventoryNpc]},npc.id,map,20,development);
    check(JSON.stringify(inventoryResult.state.players[1].factionState.settlements[0].materialStockByType)===JSON.stringify(base.materialStockByType),'available upgrade inventory avoids duplicate crafting cost');
    const high={...hero,...derive({...hero,level:13}),hp:100,currentHp:100,equipment:[]};
    const promotionState={...initial,players:[human,{...npc,factionState:{...npc.factionState,units:[high]}}]};
    const acquired=promotion.acquireV39UpperClass(promotionState,npc.id,hero.id,'ウォーリアー',{aiTurn:true});
    check(acquired.ok,'NPC promotes during resolution using shared rule');
    const advanced=acquired.state.players[1].factionState.units[0];
    check(advanced.level===13&&advanced.prerequisiteClassLevels.ファイター===10&&advanced.derivedCharacter.classLevels===3,'surplus levels transferred without free levels');
    check(!promotion.acquireV39UpperClass({...promotionState,players:[human,{...npc,isPlayer:true,factionState:{...npc.factionState,units:[high]}}]},npc.id,hero.id,'ウォーリアー',{aiTurn:true}).ok,'AI context cannot bypass human turn');
    const low={...promotionState,players:[human,{...npc,factionState:{...npc.factionState,units:[{...high,level:10}]}}]};
    check(!promotion.acquireV39UpperClass(low,npc.id,hero.id,'ウォーリアー',{aiTurn:true}).ok,'surplus level still required');
    const rareGoal={name:'銀鉄',missing:2,stock:0,required:2,settlementId:base.id,purpose:'装備更新'};
    check(growth.inspectV39NpcRareResourcePlan(initial,npc,map,[rareGoal]).status==='研究待ち','rare resources require completed discovery research');
    const priority=growth.selectV39NpcRequiredResearch(npc.factionState.research,[{category:'地質調査',level:2}],hero);
    check(Object.values(priority.research.selection).some(id=>id.startsWith('地質調査Lv:1:')),'discovery prerequisite selected from data graph');
    const completed=normalizeResearchState();
    for(const [category,entry] of Object.entries(researchTreeData.categories))for(const level of entry.levels){completed.progress.completedByCategoryLevel[category]||={};completed.progress.completedByCategoryLevel[category][level.level]=level.items.map(item=>item.id);}
    const explorer={...hero,equipment:[]},trained={...npc,factionState:{...npc.factionState,units:[explorer],research:completed}};
    map.grid[4][5]='山岳';
    const ready={...initial,players:[human,trained],specialtiesByTile:{'5,4':{key:'5,4',name:'銀鉄',category:'特殊資源',x:5,y:4}}};
    const revealed=growth.inspectV39NpcRareResourcePlan(ready,trained,map,[rareGoal]);
    check(revealed.status==='調査候補あり','known suitable terrain creates survey candidate');
    const hiddenElsewhere={...ready,specialtiesByTile:{'19,19':{name:'銀鉄',x:19,y:19}}};
    check(JSON.stringify(growth.inspectV39NpcRareResourcePlan(hiddenElsewhere,trained,map,[rareGoal]))===JSON.stringify(revealed),'survey planner does not read hidden resource coordinates');
    const surveyed=growth.advanceV39NpcGrowth(ready,npc.id,map,20,{...development,resourceGoals:[rareGoal]});
    check(surveyed.state.players[1].factionState.units[0].surveyTask?.progressAp===100,'survey charges normal 100 AP');
    const partialInitial={...ready,players:[human,{...trained,factionState:{...trained.factionState,units:[{...explorer,ap:30,currentAp:30}]}}]};
    let partial=growth.advanceV39NpcGrowth(partialInitial,npc.id,map,20,{...development,resourceGoals:[rareGoal]}).state;
    check(partial.players[1].factionState.units[0].surveyTask?.progressAp===30,'partial survey does not grant missing AP');
    partial={...partial,timeline:{...partial.timeline,turnNumber:21},players:partial.players.map(row=>row.id!==npc.id?row:{...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})};
    partial=growth.advanceV39NpcGrowth(partial,npc.id,map,21,{...development,resourceGoals:[rareGoal]}).state;
    check(partial.players[1].factionState.units[0].surveyTask.progressAp===100&&partial.players[1].factionState.units[0].ap===30,'next survey spends remaining 70 AP');
    const discovered=advanceV39ExplorationTurn(surveyed.state,21,map).state;
    check(discovered.players[1].factionState.exploration.discoveredSpecialtiesByTile['5,4']?.name==='銀鉄','actual survey resolves hidden special resource');
    const expansion=inspectV39NpcResourceExpansion(discovered,discovered.players[1],map,[rareGoal]);
    check(expansion.some(row=>row.tileKey==='5,4'&&row.gains.銀鉄>0),'rare periodic income is scored for land acquisition');
    const owned={...discovered,territoryOwnerByTile:{...discovered.territoryOwnerByTile,'5,4':npc.id},territoryStateByTile:{...discovered.territoryStateByTile,'5,4':{settlementId:base.id,hp:100}}};
    let harvestBase={...base};let harvested=0;
    for(let turn=21;turn<26;turn++){const result=advanceV39SpecialResourceHarvest(owned,owned.players[1],harvestBase,turn,map);harvested+=result.income.銀鉄||0;harvestBase={...harvestBase,specialResourceHarvestByTile:result.progressByTile};}
    check(harvested>=1,'special resource follows real periodic harvest rather than instant grant');
    const village={...original.neutralVillages[0],id:'commerce-village',name:'取引村',x:7,y:4,abandoned:false,vassalPlayerId:'',population:20,
      foodStockByType:{穀物:1000,野菜:1000,肉:1000,魚:1000},materialStockByType:{鉄:1000},relationsByPlayerId:{[npc.id]:50},
      contactedByPlayerIds:[npc.id],hostilePlayerIds:[],defenseUnits:[],questsByPlayerId:{},territoryTileKeys:['7,4']};
    const tradeNpc={...npc,factionState:{...npc.factionState,units:[{...hero,equipment:[],skillLevels:{交渉:100},ap:100,currentAp:100}]}};
    let trading={...initial,players:[human,tradeNpc],neutralVillages:[village],settlements:[village]};
    const budgets={...base.foodStockByType,...base.materialStockByType,木材:900};
    const tradePlan={...development,resourceGoals:[{name:'鉄',stock:0,required:20,missing:20,settlementId:base.id}],supplyBudgetBySettlement:{[base.id]:budgets}};
    const initiated=commerce.advanceV39NpcCommerce(trading,npc.id,map,20,tradePlan,()=>0);trading=initiated.state;
    check(trades.listV39Trades(trading).length===1&&trades.listV39Trades(trading)[0].status==='active','NPC negotiates real village exchange');
    check(trading.players[1].factionState.units[0].ap===80,'negotiation costs AP20');
    check(trading.players[1].factionState.settlements[0].materialStockByType.鉄===base.materialStockByType.鉄,'no requested goods teleported at acceptance');
    for(let turn=21;turn<=35;turn++){
      trading={...trading,timeline:{...trading.timeline,turnNumber:turn},players:trading.players.map(player=>({...player,factionState:{...player.factionState,units:player.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}}))};
      trading=commerce.advanceV39NpcCommerce(trading,npc.id,map,turn,tradePlan,()=>0).state;
      if(trades.listV39Trades(trading).some(row=>row.status==='complete'))break;
    }
    const contract=trades.listV39Trades(trading)[0];
    check(contract.status==='complete'&&contract.completedCycles===1,'courier physically exchanges and returns');
    check(trading.players[1].factionState.settlements[0].materialStockByType.鉄===base.materialStockByType.鉄+20,'returned goods deposited into own base');
    check(trading.neutralVillages[0].materialStockByType.鉄===980&&trading.neutralVillages[0].materialStockByType.木材===20,'village paid and received actual resources');
    const unknown={...initial,players:[human,tradeNpc],neutralVillages:[{...village,x:19,y:19,contactedByPlayerIds:[]}]};
    check(!trades.listV39Trades(commerce.advanceV39NpcCommerce(unknown,npc.id,map,20,tradePlan,()=>0).state).length,'undiscovered villages are not trade targets');
    const rejected=commerce.advanceV39NpcCommerce({...initial,players:[human,tradeNpc],neutralVillages:[village]},npc.id,map,20,tradePlan,()=>1).state;
    check(trades.listV39Trades(rejected)[0]?.status==='rejected'&&rejected.players[1].factionState.units[0].ap===80,'rejection spends AP without reserving stock');
    check(rejected.players[1].factionState.settlements[0].materialStockByType.木材===1000,'rejected offer does not lose materials');
    const interrupted=trades.updateV39Trade(initiated.state,{...trades.listV39Trades(initiated.state)[0],status:'interrupted'});
    check(trades.listV39Trades(commerce.advanceV39NpcCommerce(interrupted,npc.id,map,30,tradePlan,()=>0).state).length===1,'interrupted trade requires manual restart');
    const starving={...village,foodStockByType:{},population:100,populationByRace:{只人:100}};
    const aidPlan={...development,supplyBudgetBySettlement:{[base.id]:{...budgets,穀物:980,木材:1000}}};
    const aid=commerce.advanceV39NpcCommerce({...initial,players:[human,tradeNpc],neutralVillages:[starving]},npc.id,map,20,aidPlan,()=>0);
    const aidContract=trades.listV39Trades(aid.state)[0];
    check(aidContract?.method==='mail'&&aidContract.sides[0].goods.穀物>0,'village shortage generates physical aid shipment');
    check(aid.state.neutralVillages[0].foodStockByType.穀物==null,'aid is not teleported before delivery');
    let aidState=aid.state;
    for(let turn=21;turn<30;turn++){
      aidState={...aidState,timeline:{...aidState.timeline,turnNumber:turn},players:aidState.players.map(row=>({...row,factionState:{...row.factionState,units:row.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}}))};
      aidState=commerce.advanceV39NpcCommerce(aidState,npc.id,map,turn,aidPlan,()=>0).state;
      if(trades.listV39Trades(aidState)[0].status==='complete')break;
    }
    check(trades.listV39Trades(aidState)[0].status==='complete'&&aidState.neutralVillages[0].foodStockByType.穀物===aidContract.sides[0].goods.穀物,'physical aid reaches village stock exactly once');
    diagnostic.npcDiagnosticSelection.factionId=npc.id;diagnostic.npcDiagnosticSelection.view='research';
    const html=diagnostic.renderV39NpcDiagnostics(upgraded.state,' open');
    check(html.includes('研究・成長')&&html.includes('装備更新'),'research and growth diagnostic is read-only rendered');
    const final={...trading,players:trading.players.map(row=>row.id!==npc.id?row:{...row,factionState:{...row.factionState,aiState:{...row.factionState.aiState,growthPlan:updated.factionState.aiState.growthPlan}}})};
    window.setV39GameState(final,{reason:'npc-growth-commerce-test'});window.openV39TestTools();
    return {checks,contract:{status:contract.status,history:contract.history},harvested};
  });
  await page.locator('[data-test-tab="diagnostics"]').click();
  await page.locator('[data-test-section="npc-ai"]').evaluate(element=>element.open=true);
  await page.locator('[data-npc-diagnostic-view="research"]').click();
  await page.screenshot({path:`${out}/research-1100.png`});
  await page.setViewportSize({width:390,height:850});await page.screenshot({path:`${out}/research-390.png`});
  assert.deepEqual(errors,[]);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
