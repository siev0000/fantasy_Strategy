import {collectV39TerritoryIncome,buildV39ResourceSnapshot,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS,NORMAL_FOOD_RESOURCE_KEYS} from './v39-economy-rules.js';
import {advanceV39PopulationEconomy} from './v39-population-economy.js';
import {resolveV39CivicProductionMultiplier} from './v39-civic-rules.js';
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';
import {advanceV39SpecialResourceHarvest} from './v39-specialty-rules.js';
import {divertV39TradeIncome} from './v39-trade-state.js';
import {getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';
import {buildV39ResourceFlowRecord} from './v39-resource-delta-view.js';

const n=value=>Number(value)||0,round=value=>Math.round(value*10)/10;
export function buildV39HeaderResourceSnapshot(state,player,base,map){
  const flow=state&&player&&base?.placed&&map&&!base.lastEconomyDelta
    ?inspectV39SettlementResourceFlow(state,player,base,map):null;
  return buildV39ResourceSnapshot(base||{},flow);
}
export function inspectV39SettlementResourceFlow(state,player,base,map){
  const turn=Math.max(n(state.timeline?.turnNumber),n(base.lastEconomyDelta?.turn)+1,1);
  const id=base.settlementId||base.id,fallback=getSelectedSettlement(player.factionState)?.settlementId;
  const scoped={...player,factionState:replaceFactionSettlement(player.factionState,base,{ownerPlayerId:player.id})};
  const raw=collectV39TerritoryIncome(state,scoped,map),civic=resolveV39CivicProductionMultiplier(base);
  const specialization=resolveV39CitySpecializationModifiers(base);
  const production=Object.fromEntries([
    ...FOOD_RESOURCE_KEYS.map(key=>[key,round(n(raw.food[key])*civic*specialization.foodMultiplier)]),
    ...MATERIAL_RESOURCE_KEYS.map(key=>[key,round(n(raw.material[key])*civic*specialization.materialMultiplier)])
  ]);
  for(const [key,value] of Object.entries(raw.specialtyFood?.fixedIncome||{}))production[key]=round(n(production[key])+value);
  for(const [key,value] of Object.entries(raw.facilityFixedIncome||{}))production[key]=round(n(production[key])+value);
  const harvest=advanceV39SpecialResourceHarvest(state,player,base,turn,map);
  for(const [key,value] of Object.entries(harvest.income))production[key]=round(n(production[key])+value);
  // Trade projection returns new state; never commit it while viewing the production page.
  const trade=divertV39TradeIncome(state,'player',player.id,id,production,turn);
  const units=(player.factionState.units||[]).filter(unit=>n(unit.hp??unit.currentHp)>0&&(unit.settlementId||fallback)===id);
  const population=advanceV39PopulationEconomy({village:base,units,income:trade.income,
    resourceKeys:FOOD_RESOURCE_KEYS,normalFoodKeys:NORMAL_FOOD_RESOURCE_KEYS,populationCapacity:raw.populationCapacity});
  const before={...base.foodStockByType,...base.materialStockByType};
  const after={...population.foodStockByType,...Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,round(n(before[key])+n(trade.income[key]))]))};
  return {...buildV39ResourceFlowRecord({production,before,after,maintenance:population.consumedByType,reserved:trade.reserved}),
    turn,shortage:population.shortageTotal,specialtyFoodFixedIncome:raw.specialtyFood?.fixedIncome||{},facilityFixedIncome:raw.facilityFixedIncome||{}};
}
