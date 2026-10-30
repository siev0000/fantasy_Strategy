import config from '../../../config/v39-quest-rewards.json';
import {FOOD_RESOURCE_KEYS,facilityDefinitions} from './v39-economy-rules.js';
import {buildV39PopulationMaintenanceStock} from './v39-population-economy.js';
import {resolveV39ConstructionMaterials} from './v39-construction-materials.js';
import {getV39VillageQuests} from './v39-village-quest-log.js';

const n=value=>Number(value)||0;
const field=name=>FOOD_RESOURCE_KEYS.includes(name)?'foodStockByType':'materialStockByType';

export function resolveV39AutomaticQuestRewards(village,quest,{balance=config.automatic}={}) {
  const reserve=buildV39PopulationMaintenanceStock(village.populationByRace||{[village.race]:n(village.population)},village.defenseUnits||[],FOOD_RESOURCE_KEYS,balance.foodReserveTurns);
  for(const resource of balance.resources)if(!FOOD_RESOURCE_KEYS.includes(resource))reserve[resource]=balance.materialReserve;
  reserve.金=balance.goldReserve;
  const requested=new Set([quest.resourceKey,...(village.planSchedule?.active?.needs||[]).map(row=>row.resource)].filter(Boolean));
  const facilityNames=new Set([village.planSchedule?.active?.facilityName,...(quest.supportGoals||[]).map(row=>row.facilityName)].filter(Boolean));
  for(const name of facilityNames){
    if(village.buildings?.includes(name)||village.constructionQueue?.some(row=>row.facilityName===name))continue;
    const definition=facilityDefinitions().find(row=>row.name===name);
    if(definition)for(const [resource,cost] of Object.entries(resolveV39ConstructionMaterials(definition.cost,village.materialStockByType).cost))reserve[resource]=Math.max(n(reserve[resource]),n(cost));
  }
  const playerIds=new Set([...Object.keys(village.questsByPlayerId||{}),...Object.keys(village.questLogByPlayerId||{})]);
  for(const playerId of playerIds)for(const pending of getV39VillageQuests(village,playerId)){
    if(!pending.accepted||pending.completed||pending.rewardEscrow?.status==='held')continue;
    const terms=pending.rewardTerms?(Array.isArray(pending.rewardTerms)?pending.rewardTerms:[pending.rewardTerms])
      :pending.rewardResourceKey?[{kind:'resource',name:pending.rewardResourceKey,amount:pending.rewardAmount}]:[];
    for(const item of terms)if(item.kind==='resource')reserve[item.name]=n(reserve[item.name])+Math.max(0,n(item.amount));
  }
  const quantity=quest.type==='contract'?n(quest.amountPerPeriod)*n(quest.required):n(quest.required);
  let budget=Math.floor(Math.min(balance.maximumBudget,Math.max(balance.minimumBudget,quantity*n(balance.valuePerObjective[quest.type]))));
  const available=resource=>requested.has(resource)?0:Math.max(0,Math.floor((n(village[field(resource)]?.[resource])-n(reserve[resource]))*balance.surplusShare));
  const rewards=[];
  const gold=Math.min(available('金'),Math.ceil(budget*balance.goldBudgetShare));
  if(gold>0){rewards.push({kind:'resource',name:'金',amount:gold});budget-=gold;}
  const candidates=balance.resources.map(name=>({name,amount:available(name)})).filter(row=>row.amount>0)
    .sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name)).slice(0,balance.maximumMaterialKinds);
  for(let index=0;index<candidates.length&&budget>0;index++){
    const item=candidates[index],amount=Math.min(item.amount,Math.ceil(budget/(candidates.length-index)));
    if(amount>0){rewards.push({kind:'resource',name:item.name,amount});budget-=amount;}
  }
  if(budget>0){const extra=Math.min(budget,available('金')-gold);if(extra>0){const item=rewards.find(row=>row.name==='金');if(item)item.amount+=extra;else rewards.push({kind:'resource',name:'金',amount:extra});}}
  return rewards;
}

export function attachV39AutomaticQuestReward(village,quest) {
  return {...quest,automaticRewardItems:resolveV39AutomaticQuestRewards(village,quest)};
}
