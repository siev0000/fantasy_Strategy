import balance from '../../../config/v39-npc-faction-ai.json';
import { getSelectedSettlement,territorySettlementId } from './settlement-state.js';
import { facilityDefinitions, inspectV39Construction, inspectV39NeutralVillageEconomy, FOOD_RESOURCE_KEYS,NORMAL_FOOD_RESOURCE_KEYS } from './v39-economy-rules.js';
import {inspectV39NpcFoodBalance,inspectV39NpcFoodFacilityGain} from './v39-npc-food-priority.js';
import { hasV39FacilityPrerequisites } from './v39-facility-development-rules.js';
import { getV39UnitCreationOptions, inspectV39UnitCreation } from './v39-unit-creation-rules.js';
import { inspectV39NpcResourceNeeds } from './v39-npc-resource-policy.js';
import {getV39RaceRecommendations} from './v39-race-definitions.js';
import {inspectV39NpcCitySpecializations} from './v39-npc-city-specialization.js';
import {inspectV39NpcResourceWorkforce} from './v39-npc-resource-teams.js';
import {inspectV39NpcResourceExpansion} from './v39-npc-resource-expansion.js';
import {resolveV39ConstructionMaterials} from './v39-construction-materials.js';

const n = value => Number(value) || 0;
const alive = unit => n(unit?.hp ?? unit?.currentHp) > 0 && unit.state !== '死亡';
const shortage = (cost, stock) => Object.entries(cost || {}).filter(([key, amount]) => n(amount) > n(stock?.[key]))
  .map(([name, required]) => ({ name, required:n(required), stock:n(stock?.[name]), missing:Math.ceil((n(required)-n(stock?.[name]))*100)/100 }));

export function inspectV39NpcConstructionPlan(state, player, mapData,foodBalances) {
  const village = getSelectedSettlement(player.factionState);
  if (!village?.placed) return { status:'blocked', reasons:['拠点未配置'], shortages:[] };
  const queued = village.constructionQueue?.[0];
  if (queued) return { status:'building', name:queued.facilityName, tileKey:queued.tileKey,
    remainingTurns:queued.remainingTurns, shortages:[], reasons:[] };
  const food=player.isPlayer===false?(foodBalances||inspectV39NpcFoodBalance(state,player,mapData))
    .find(row=>row.settlementId===(village.settlementId||village.id)&&row.active):null;
  const foodShortage = inspectV39NeutralVillageEconomy({ ...village, race:player.race }, mapData, state).shortageTotal > 0;
  const priority = definition => n(definition.row.自動建設優先度) + n(balance.constructionPurposeBonus[definition.row.建設目的])
    + (foodShortage && (n(definition.row.農業) > 0 || definition.gatheringResource === '魚' || definition.name === '墓地') ? balance.foodShortageBonus : 0);
  const allDefinitions=facilityDefinitions();
  const isFoodDefinition=definition=>n(definition.effects.農業)>0||n(definition.effects.漁業)>0||n(definition.effects.食料産出補正)>0
    ||NORMAL_FOOD_RESOURCE_KEYS.includes(definition.gatheringResource);
  const foodPrerequisites=new Map();
  if(food){
    const byName=new Map(allDefinitions.map(definition=>[definition.name,definition]));
    const visit=(definition,target,seen=new Set())=>{
      if(seen.has(definition.name))return;
      const path=new Set([...seen,definition.name]);
      for(const name of String(definition.row.前提施設||'').split('/').map(name=>name.trim()).filter(Boolean)){
        if(hasV39FacilityPrerequisites(village,{前提施設:name}))continue;
        const prerequisite=byName.get(name);if(!prerequisite)continue;
        foodPrerequisites.set(name,[...new Set([...(foodPrerequisites.get(name)||[]),target])]);
        visit(prerequisite,target,path);
      }
    };
    for(const definition of allDefinitions.filter(isFoodDefinition))visit(definition,definition.name);
  }
  const definitions = allDefinitions.filter(definition => hasV39FacilityPrerequisites(village, definition.row)
    && !(village.buildings || []).includes(definition.name)).sort((a,b) => priority(b)-priority(a) || a.name.localeCompare(b.name));
  const keys = Object.entries(state.territoryOwnerByTile || {}).filter(([key,owner]) => owner === player.id
    &&(!territorySettlementId(state.territoryStateByTile?.[key])||territorySettlementId(state.territoryStateByTile[key])===(village.settlementId||village.id)))
    .map(([key])=>key).sort();
  let blocked = null,foodCandidates=[],foodChecks=0;
  for (const definition of definitions) for (const key of keys) {
    const [x,y] = key.split(',').map(Number), tile = {x,y};
    const check = inspectV39Construction(state, player, definition, tile, mapData);
    const reasons = [...check.reasons, ...(check.replacesResidential ? ['居住地の施設転用は未承認'] : [])];
    const shortages = shortage(check.materialPayment?.cost, check.village.materialStockByType);
    const candidate = { status:!reasons.length?'ready':'blocked', name:definition.name, tileKey:key,
      purpose:definition.row.建設目的, reasons, shortages, definition, tile };
    if(food){
      const structural=reasons.filter(reason=>!reason.startsWith('資材不足:'));
      const potential=isFoodDefinition(definition);
      const supportFor=foodPrerequisites.get(definition.name);
      if(!structural.length&&supportFor)foodCandidates.push({...candidate,foodPriority:true,foodGain:0,foodSupportFor:supportFor,
        reasons:[...candidate.reasons,`食料施設の前提整備: ${supportFor.join(' / ')}`]});
      if(!structural.length&&potential&&foodChecks++<balance.foodPriority.constructionCandidateLimit){
        const foodGain=inspectV39NpcFoodFacilityGain(state,player,village,definition,tile,mapData,food);
        if(foodGain>0)foodCandidates.push({...candidate,foodGain,foodPriority:true});
      }
      continue;
    }
    if (candidate.status === 'ready') return candidate;
    const blockers = reasons.filter(reason=>!reason.startsWith('資材不足:')).length;
    if (!blocked || blockers < blocked.blockers) blocked = {...candidate, blockers};
  }
  if(food){
    // Once a productive facility is reachable, reserve materials for it instead of opening other prerequisite chains.
    const direct=foodCandidates.filter(candidate=>!candidate.foodSupportFor);
    return (direct.length?direct:foodCandidates).sort((a,b)=>Number(b.status==='ready')-Number(a.status==='ready')||b.foodGain-a.foodGain||a.name.localeCompare(b.name)||a.tileKey.localeCompare(b.tileKey))[0]
      ||{status:'blocked',reasons:['食料優先: 食料を増やせる建設候補がありません。開拓・調達を待ちます'],shortages:[],foodPriority:true};
  }
  return blocked || {status:'blocked', reasons:[keys.length?'前提を満たす建設候補がありません':'自領の建設候補地がありません'], shortages:[]};
}

export function inspectV39NpcReinforcementPlan(state, player, {target:requestedTarget,foodPolicy=true,foodBalances,mapData}={}) {
  const living = (player.factionState.units || []).filter(alive).length;
  const queued = (player.factionState.unitTrainingQueue || []).length;
  const target = Math.max(0, n(requestedTarget??player.factionState.aiState?.resourceUnitTarget??balance.unitTarget)), remaining = Math.max(0,target-living-queued);
  const base = {living, queued, target, remaining, shortages:[], reasons:[]};
  if (!remaining) return {...base, status:'satisfied'};
  const food=foodPolicy&&player.isPlayer===false?(foodBalances||inspectV39NpcFoodBalance(state,player,mapData||window.__v39FieldRuntime?.mapData)):[];
  if(living+queued>=balance.foodPriority.minimumDefenseUnits&&food.some(row=>row.active))
    return {...base,status:'blocked',foodPaused:true,reasons:['食料確保を優先するため新規の軍備増強を停止']};
  const options = getV39UnitCreationOptions(player);
  const affinity=balance.recruitmentAffinity;
  const classCounts={};
  for(const unit of player.factionState.units||[])if(alive(unit))classCounts[unit.className]=(classCounts[unit.className]||0)+1;
  const preferences=new Map((options.races||[]).map(race=>[race,getV39RaceRecommendations(race).classes]));
  const combinations=(options.classes||[]).flatMap(classRow=>(options.races||[]).map(race=>({classRow,race,
    preference:preferences.get(race).includes(classRow.名前),
    score:(preferences.get(race).includes(classRow.名前)?affinity.preferredClassBonus:0)
      -(classCounts[classRow.名前]||0)*affinity.duplicateClassPenalty})))
    .sort((a,b)=>b.score-a.score||a.classRow.名前.localeCompare(b.classRow.名前)||a.race.localeCompare(b.race));
  let blocked = null;
  const modes=living+queued>=balance.unitTarget&&target>balance.unitTarget?['army']:['army','normal'];
  for (const mode of modes) for (const {classRow,race,preference,score} of combinations) {
    const request = {mode, className:classRow.名前, race, count:1};
    const check = inspectV39UnitCreation(state, player, request);
    const stock = Object.fromEntries(Object.keys(check.cost).map(key => [key,FOOD_RESOURCE_KEYS.includes(key)
      ?check.village.foodStockByType?.[key]:check.village.materialStockByType?.[key]]));
    const shortages = shortage(check.cost,stock);
    const candidate = {...base, status:check.available?'ready':'blocked', className:classRow.名前, race,
      unitType:check.mode.unitTypeLabel, level:check.initialLevel, shortages, reasons:check.reasons, request,preference,affinityScore:score};
    if (check.available) return candidate;
    const blockers = check.reasons.filter(reason=>!shortages.some(row=>reason===`${row.name}不足`)).length;
    if (!blocked || blockers < blocked.blockers) blocked = {...candidate,blockers};
  }
  return blocked || {...base, status:'blocked', reasons:['作成可能な種族・職業がありません']};
}

// Persist only the decision summary, not definitions, checks, or copies of game state.
export function inspectV39NpcDevelopmentPlan(state, player, mapData) {
  const foodBalances=inspectV39NpcFoodBalance(state,player,mapData);
  const selectedConstruction=inspectV39NpcConstructionPlan(state,player,mapData,foodBalances);
  const {definition,tile,blockers,...construction} = selectedConstruction;
  const village=getSelectedSettlement(player.factionState),settlementId=village?.settlementId||village?.id;
  const supplyBudgetBySettlement={};
  const goals = [
    ...construction.shortages.map(row=>({...row,purpose:`建設: ${construction.name || '施設'}`,settlementId,priority:construction.foodPriority?1:0})),
    ...inspectV39NpcResourceNeeds(player).map(row=>({name:row.resource,required:row.required,stock:row.stock,
      missing:Math.ceil((row.required-row.stock)*100)/100,purpose:'人口増加',settlementId:row.settlementId}))
  ];
  for(const base of player.factionState.settlements||[]){
    if(!base.placed||(base.worldId||'surface')!==(state.activeWorldId||'surface'))continue;
    const id=base.settlementId||base.id;
    const localPlayer={...player,factionState:{...player.factionState,selectedSettlementId:id}};
    const local=id===settlementId?selectedConstruction:inspectV39NpcConstructionPlan(state,localPlayer,mapData,foodBalances);
    const reserves=local.definition?{...resolveV39ConstructionMaterials(local.definition.cost,base.materialStockByType).cost}:{};
    if(id!==settlementId)goals.push(...local.shortages.map(row=>({...row,purpose:`建設: ${local.name||'施設'}`,settlementId:id,priority:local.foodPriority?1:0})));
    const defenseUnits=(player.factionState.units||[]).filter(unit=>alive(unit)&&(unit.settlementId||settlementId)===id);
    const economy=inspectV39NeutralVillageEconomy({...base,race:player.race,defenseUnits},mapData,state);
    const food=foodBalances.find(row=>row.settlementId===id);
    for(const name of FOOD_RESOURCE_KEYS){
      const required=n(economy.maintenance[name])*balance.resourceTeams.stockReserveTurns,stock=n(base.foodStockByType?.[name]);
      reserves[name]=Math.max(n(reserves[name]),Math.max(n(economy.maintenance[name]),n(food?.maintenance[name]))*Math.max(balance.internalSupply.foodReserveTurns,balance.resourceTeams.stockReserveTurns));
      if(NORMAL_FOOD_RESOURCE_KEYS.includes(name)){
        const missing=n(food?.reserveDeficit[name]);
        if(missing>0)goals.push({name,required:stock+Math.ceil(missing),stock,missing:Math.ceil(missing),settlementId:id,purpose:food.status==='deficit'?'食料収支改善':'食料備蓄',priority:food.active?2:0});
      }else if(required>stock)goals.push({name,required,stock,missing:Math.ceil(required-stock),settlementId:id,purpose:'食料備蓄'});
    }
    supplyBudgetBySettlement[id]=reserves;
  }
  for(const need of inspectV39NpcResourceNeeds(player,balance,{includeSatisfied:true})){
    const budget=supplyBudgetBySettlement[need.settlementId];if(budget)budget[need.resource]=Math.max(n(budget[need.resource]),need.required);
  }
  const initial=inspectV39NpcReinforcementPlan(state,player,{target:balance.unitTarget,foodBalances});
  const workforce=inspectV39NpcResourceWorkforce([...goals,...initial.shortages.map(row=>({...row,settlementId}))],player);
  const {request,blockers:ignored,...reinforcement}=inspectV39NpcReinforcementPlan(state,player,{target:workforce.targetUnits,foodBalances});
  if(request&&supplyBudgetBySettlement[settlementId]){
    const cost=inspectV39UnitCreation(state,player,request).cost;
    for(const [name,amount] of Object.entries(cost))supplyBudgetBySettlement[settlementId][name]=n(supplyBudgetBySettlement[settlementId][name])+n(amount);
  }
  const resourceGoals=[...goals,...reinforcement.shortages.map(row=>({...row,purpose:'戦力増強',settlementId}))];
  const citySpecializations=inspectV39NpcCitySpecializations(state,player,mapData,{materialShortage:construction.shortages.length>0,
    materialSettlementId:village?.settlementId||village?.id,reinforcementNeeded:reinforcement.remaining>0&&!reinforcement.foodPaused,foodBalances});
  const resourceExpansion=inspectV39NpcResourceExpansion(state,player,mapData,resourceGoals,undefined,{foodBalances}).map(({tile,...summary})=>summary);
  return {construction,reinforcement,resourceGoals,foodBalances,citySpecializations,resourceExpansion,supplyBudgetBySettlement,resourceWorkforce:workforce,resourceTeams:player.factionState.aiState?.resourceTeams||[]};
}
