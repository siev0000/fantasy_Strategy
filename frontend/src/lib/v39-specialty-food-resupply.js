import {V39_PRESERVED_FOOD_RULE as ration,isV39PreservedFood} from './v39-preserved-food-rules.js';
import {inspectV39Gather,gatherV39Resources} from './v39-gather-rules.js';
import {resolveV39CarriedFoodStatus} from './v39-carried-food.js';
import {FOOD_SUBSTITUTE_MULTIPLIER} from './v39-population-economy.js';
import {getGameDataRows} from './game-data-registry.js';
import balance from '../../../config/v39-carried-food.json';

const normalKeys=getGameDataRows('都市基本データ').filter(r=>r.分類==='食料').map(r=>r.データ分類);
const n=value=>Number(value)||0;
export function inspectV39SpecialtyFoodResupply(state,playerId,unitId,map,turns=balance.defaultTurns){
  const faction=state?.players?.find(p=>p.id===playerId)?.factionState,status=resolveV39CarriedFoodStatus(faction,unitId,state);
  turns=Math.max(1,Math.min(balance.maxTurns,Math.floor(n(turns)||balance.defaultTurns)));
  const target=normalKeys.reduce((sum,key)=>sum+n(status.demand[key]),0)*turns*FOOD_SUBSTITUTE_MULTIPLIER;
  const stock=normalKeys.reduce((sum,key)=>sum+n(status.cargo.resourcesByType[key])*(isV39PreservedFood(key)?ration.nutrition*FOOD_SUBSTITUTE_MULTIPLIER:1),0);
  const maximum=Math.max(0,Math.ceil((target-stock)*10-1e-8)/10);
  const check=inspectV39Gather(state,playerId,unitId,map,{specialtyFood:true,maxLoad:Math.min(maximum,status.remaining)});
  const reason=!status.accessible?'部隊へ合流してから補充してください':target<=0?'この部隊は通常食料を消費しません':maximum<=0?'目標ターン分の食料を携帯済みです':check.reasons.join(' / ');
  return {...check,available:!reason,reason,status,turns,maximum};
}
export function resupplyV39FoodFromSpecialty(state,playerId,unitId,map,turns){
  const check=inspectV39SpecialtyFoodResupply(state,playerId,unitId,map,turns);
  if(!check.available)return {ok:false,state,reason:check.reason};
  const result=gatherV39Resources(state,playerId,unitId,map,{specialtyFood:true,maxLoad:Math.min(check.maximum,check.status.remaining)});
  if(!result.ok)return result;
  const ids=new Set(check.status.members.map(u=>u.id));
  return {...result,resources:result.accepted.resourcesByType,state:{...result.state,players:result.state.players.map(p=>p.id!==playerId?p:{...p,
    factionState:{...p.factionState,units:p.factionState.units.map(u=>ids.has(u.id)?{...u,carryFood:true}:u)}})}};
}
