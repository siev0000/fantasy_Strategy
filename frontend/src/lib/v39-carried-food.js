import balance from '../../../config/v39-carried-food.json';
import {V39_PRESERVED_FOOD_RULE as ration,isV39PreservedFood,isV39PreservedFoodUnlocked,getV39PreservedFoodResearch} from './v39-preserved-food-rules.js';
import {getGameDataRows} from './game-data-registry.js';
import {isV39MaintenanceFoodResource,resolveV39UnitMaintenanceDemand,consumeV39CarriedMaintenance,inspectV39NormalFoodSupply,FOOD_SUBSTITUTE_MULTIPLIER} from './v39-population-economy.js';
import {resolveV39FactionUnitCargoStatus,normalizeV39Cargo,resolveV39CargoLoad,resolveV39UnitCargoCapacity,addV39CargoToFactionUnit} from './v39-logistics-state.js';
import {replaceFactionSettlement} from './settlement-state.js';
import {resolveV39UnitSupplySettlement} from './v39-settlement-location.js';
import {getHexDistance} from './hex-grid.js';

const rows=getGameDataRows('都市基本データ');
export const V39_CARRIED_FOOD_KEYS=rows.filter(r=>['食料','特殊資源'].includes(r.分類)&&isV39MaintenanceFoodResource(r.データ分類)).map(r=>r.データ分類);
const normalKeys=rows.filter(r=>r.分類==='食料').map(r=>r.データ分類);
const n=value=>Number(value)||0,round=value=>Math.round(Math.max(0,value)*1e6)/1e6;
const alive=u=>u&&n(u.hp??u.currentHp)>0&&u.state!=='死亡';
export const hasV39CarriedFood=cargo=>V39_CARRIED_FOOD_KEYS.some(key=>n(cargo?.resourcesByType?.[key])>0);
export const isV39AutoFoodResupplyEnabled=state=>typeof state?.gameSettings?.carriedFoodAutoResupply==='boolean'?state.gameSettings.carriedFoodAutoResupply:balance.autoResupply;

export function autoResupplyV39CarriedFood(state,playerId,unitId=''){
  if(!isV39AutoFoodResupplyEnabled(state)||state?.activePlayerId!==playerId||state.timeline?.phase!=='player')return {state,reports:[]};
  const units=state.players.find(p=>p.id===playerId)?.factionState?.units||[],reports=[];
  for(const unit of units){
    if(unitId&&unit.id!==unitId)continue;
    const result=resupplyV39CarriedFood(state,playerId,unit.id,unit.carriedFoodTargetTurns||balance.defaultTurns);
    if(result.ok){state=result.state;reports.push({unitId:unit.id,resources:result.resources,convertedFood:result.convertedFood});}
  }
  return {state,reports};
}

export function resolveV39CarriedFoodStatus(faction,unitId,state){
  const status=resolveV39FactionUnitCargoStatus(faction,unitId,state);
  let members=status.members.filter(alive),accessible=true;
  if(!status.individual&&members.length){
    const leader=members.find(u=>u.id===(status.squad?.moveLeaderId||status.squad?.leaderId))||members[0];
    const connected=new Set([leader.id]);
    for(let i=0;i<members.length;i++)for(const unit of members)if(members.some(other=>connected.has(other.id)&&getHexDistance(unit,other)<=balance.shareRadius))connected.add(unit.id);
    accessible=connected.has(unitId);members=members.filter(u=>connected.has(u.id));
  }
  const demand={};
  for(const unit of members)for(const [key,amount] of Object.entries(resolveV39UnitMaintenanceDemand(unit,V39_CARRIED_FOOD_KEYS)))demand[key]=round(n(demand[key])+amount);
  const capacity=members.reduce((sum,u)=>sum+resolveV39UnitCargoCapacity(u,state),0);
  const dailyFood=Object.values(demand).reduce((sum,value)=>sum+value,0);
  const owner=(state?.players?.find(player=>player.factionState===faction)||state?.players?.find(player=>player.factionState?.units?.some(u=>u.id===unitId)))?.id;
  const base=resolveV39UnitSupplySettlement(state,faction,status.unit,owner);
  const ordinaryDaily=normalKeys.reduce((sum,key)=>sum+n(demand[key]),0);
  return {...status,members,accessible,demand,base,capacity,ordinaryDaily,preservedFoodTurns:ordinaryDaily>0&&dailyFood===ordinaryDaily?Math.floor(capacity*ration.nutrition/ordinaryDaily):null,emptyFoodTurns:dailyFood>0?Math.floor(capacity/dailyFood*10)/10:null,remaining:Math.max(0,capacity-status.load)};
}

function replaceCargo(faction,status,cargo){
  return {...faction,squads:faction.squads.map(s=>s.id!==status.squad?.id?s:status.individual
    ?{...s,cargoByUnitId:{...s.cargoByUnitId,[status.unit.id]:normalizeV39Cargo(cargo)}}:{...s,cargo:normalizeV39Cargo(cargo)})};
}
export function inspectV39FoodResupply(state,playerId,unitId,turns=balance.defaultTurns){
  const faction=state?.players?.find(p=>p.id===playerId)?.factionState;
  let status=resolveV39CarriedFoodStatus(faction,unitId,state);
  const originalCargo=status.cargo,originalLoad=status.load;
  const automaticPreservedFood=isV39PreservedFoodUnlocked(faction);
  let convertedFood=0;
  if(automaticPreservedFood&&status.base&&status.accessible&&status.members.some(unit=>unit.carryFood)
    &&!status.members.some(unit=>unit.transportAssignment||unit.tradeAssignment)){
    const carried={...status.cargo.resourcesByType},inputs=normalKeys.filter(key=>!isV39PreservedFood(key));
    const total=inputs.reduce((sum,key)=>sum+n(carried[key]),0);
    const used=Math.floor(total*10+1e-8)/10;
    if(used>0){
      let remaining=used;
      for(const key of inputs){const take=Math.min(n(carried[key]),remaining);carried[key]=round(n(carried[key])-take);remaining=round(remaining-take);}
      convertedFood=round(used/ration.inputPerItem);carried[ration.name]=round(n(carried[ration.name])+convertedFood);
      const cargo=normalizeV39Cargo({...status.cargo,resourcesByType:carried}),load=resolveV39CargoLoad(cargo);
      status={...status,cargo,load,remaining:Math.max(0,status.capacity-load)};
    }
  }
  turns=Math.max(1,Math.min(balance.maxTurns,Math.floor(n(turns)||balance.defaultTurns)));
  let room=status.remaining;
  const resources={};
  const ordinaryWanted=normalKeys.reduce((sum,key)=>sum+Math.max(0,n(status.demand[key])*turns-n(status.cargo.resourcesByType[key])),0);
  const savedWanted=Math.max(0,ordinaryWanted/ration.nutrition-n(status.cargo.resourcesByType[ration.name]));
  const savedTake=round(Math.min(savedWanted,n(status.base?.foodStockByType?.[ration.name]),room));
  if(savedTake>0){resources[ration.name]=savedTake;room-=savedTake;}
  const ingredients={},availableStock={...status.base?.foodStockByType};
  let autoCrafted=0;
  if(automaticPreservedFood&&status.base){
    const inputs=normalKeys.filter(key=>!isV39PreservedFood(key));
    const total=inputs.reduce((sum,key)=>sum+n(availableStock[key]),0);
    const inputBudget=Math.floor(Math.min(Math.max(0,savedWanted-savedTake)*ration.inputPerItem,room*ration.inputPerItem,total)*10+1e-8)/10;
    let remaining=inputBudget;
    for(const key of inputs){const take=round(Math.min(n(availableStock[key]),remaining));if(take>0){ingredients[key]=take;availableStock[key]=round(n(availableStock[key])-take);}remaining=round(remaining-take);}
    autoCrafted=round(inputBudget/ration.inputPerItem);
    if(autoCrafted>0){resources[ration.name]=round(savedTake+autoCrafted);room-=autoCrafted;}
  }
  let savedNutrition=(n(status.cargo.resourcesByType[ration.name])+savedTake+autoCrafted)*ration.nutrition;
  for(const key of V39_CARRIED_FOOD_KEYS){
    if(isV39PreservedFood(key))continue;
    let deficit=Math.max(0,n(status.demand[key])*turns-n(status.cargo.resourcesByType[key]));
    if(normalKeys.includes(key)){const covered=Math.min(deficit,savedNutrition);deficit-=covered;savedNutrition-=covered;}
    const wanted=Math.ceil(deficit*10-1e-8)/10;
    const take=Math.floor(Math.min(wanted,n(availableStock[key]),room)*10+1e-8)/10;
    if(take>0){resources[key]=take;room-=take;}
  }
  const planned={...status.cargo.resourcesByType};
  for(const [key,value] of Object.entries(resources))planned[key]=n(planned[key])+value;
  const ordinaryDemand=Object.fromEntries(normalKeys.map(key=>[key,n(status.demand[key])*turns]));
  const shortage=inspectV39NormalFoodSupply(planned,ordinaryDemand,normalKeys).shortageTotal;
  let substituteWanted=Math.ceil(shortage*FOOD_SUBSTITUTE_MULTIPLIER*10-1e-8)/10;
  for(const key of normalKeys.filter(key=>!isV39PreservedFood(key)).sort((a,b)=>n(availableStock[b])-n(availableStock[a]))){
    const spare=Math.max(0,n(availableStock[key])-n(resources[key]));
    const take=Math.floor(Math.min(substituteWanted,spare,room)*10+1e-8)/10;
    if(take>0){resources[key]=round(n(resources[key])+take);room-=take;substituteWanted=round(substituteWanted-take);}
  }
  const reason=!alive(status.unit)?'生存ユニットを選択してください':state?.activePlayerId!==playerId||state.timeline?.phase!=='player'?'自分の操作ターンに補給してください'
    :n(status.unit.ap??status.unit.currentAp)<balance.resupplyApCost?'APが不足しています'
    :!status.accessible?'部隊へ合流してから補給してください':!status.base?'自軍の拠点領土内で補給できます'
    :!Object.keys(resources).length&&!convertedFood?'必要量を携帯済み、または拠点在庫・積載余力がありません':'';
  // Crafted food is new cargo, not stock to subtract a second time.
  const stockCosts={...resources,[ration.name]:savedTake};
  for(const [key,amount] of Object.entries(ingredients))stockCosts[key]=round(n(stockCosts[key])+amount);
  return {...status,cargo:originalCargo,load:originalLoad,plannedCargo:status.cargo,turns,resources,stockCosts,ingredients,autoCrafted,convertedFood,automaticPreservedFood,reason,available:!reason,maxTurns:balance.maxTurns};
}
export function resupplyV39CarriedFood(state,playerId,unitId,turns){
  const check=inspectV39FoodResupply(state,playerId,unitId,turns);
  if(!check.available)return {ok:false,state,reason:check.reason};
  const player=state.players.find(p=>p.id===playerId);
  const source=check.convertedFood?replaceCargo(player.factionState,check,check.plannedCargo):player.factionState;
  const added=Object.keys(check.resources).length?addV39CargoToFactionUnit(source,unitId,{resourcesByType:check.resources}):{ok:true,faction:source};
  if(!added.ok)return {ok:false,state,reason:'荷物を配置できません'};
  const ids=new Set(check.members.map(u=>u.id));
  let faction={...added.faction,units:added.faction.units.map(u=>ids.has(u.id)?{...u,carryFood:true,carriedFoodTargetTurns:check.turns,
    ...(u.id===unitId?{ap:Math.max(0,n(u.ap??u.currentAp)-balance.resupplyApCost),currentAp:Math.max(0,n(u.ap??u.currentAp)-balance.resupplyApCost),actionPoint:Math.max(0,n(u.ap??u.currentAp)-balance.resupplyApCost)}:{})}:u)};
  const stock={...check.base.foodStockByType};for(const [key,amount] of Object.entries(check.stockCosts))if(amount>0)stock[key]=round(n(stock[key])-amount);
  faction=replaceFactionSettlement(faction,{...check.base,foodStockByType:stock},{ownerPlayerId:playerId,select:false});
  return {ok:true,resources:check.resources,convertedFood:check.convertedFood,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:faction}:p)}};
}
export function unloadV39CarriedFood(state,playerId,unitId){
  const player=state?.players?.find(p=>p.id===playerId),status=resolveV39CarriedFoodStatus(player?.factionState,unitId,state);
  if(!alive(status.unit)||state.activePlayerId!==playerId||state.timeline?.phase!=='player'||!status.base||!status.accessible)return {ok:false,state,reason:'自分の操作ターンに自軍拠点内で預けてください'};
  const resources={...status.cargo.resourcesByType},stock={...status.base.foodStockByType},remainders={...status.base.carriedFoodRemainderByType};
  for(const key of V39_CARRIED_FOOD_KEYS){
    const total=round(n(stock[key])+n(resources[key])+n(remainders[key]));
    if(isV39PreservedFood(key)){stock[key]=total;remainders[key]=0;delete resources[key];continue;}
    stock[key]=Math.floor((total+1e-8)*10)/10;remainders[key]=round(total-stock[key]);delete resources[key];
  }
  const ids=new Set(status.members.map(u=>u.id));
  let faction=replaceCargo(player.factionState,status,{...status.cargo,resourcesByType:resources});
  faction={...faction,units:faction.units.map(u=>ids.has(u.id)?{...u,carryFood:false}:u)};
  faction=replaceFactionSettlement(faction,{...status.base,foodStockByType:stock,carriedFoodRemainderByType:remainders},{ownerPlayerId:playerId,select:false});
  return {ok:true,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:faction}:p)}};
}

export function inspectV39PreservedFoodCraft(state,playerId,unitId,turns){
  const player=state?.players?.find(row=>row.id===playerId);
  const check=inspectV39FoodResupply(state,playerId,unitId,turns);
  const stock=check.base?.foodStockByType||{},ingredients={};
  const nutrition=normalKeys.reduce((sum,key)=>sum+n(check.cargo.resourcesByType[key])*(isV39PreservedFood(key)?ration.nutrition:1),0);
  const target=Math.max(0,Math.ceil((check.ordinaryDaily*check.turns-nutrition)/ration.nutrition-1e-8));
  const available=normalKeys.filter(key=>!isV39PreservedFood(key));
  const total=available.reduce((sum,key)=>sum+n(stock[key]),0);
  const count=Math.min(target,Math.floor(check.remaining),Math.floor(total/ration.inputPerItem+1e-8));
  let needed=count*ration.inputPerItem;
  for(const key of available){const take=round(Math.min(n(stock[key]),needed));if(take>0)ingredients[key]=take;needed=round(needed-take);}
  const reason=!isV39PreservedFoodUnlocked(player?.factionState)?`${getV39PreservedFoodResearch()?.項目名||'対応研究'}の完了が必要です`:!alive(check.unit)?'生存ユニットを選択してください':state?.activePlayerId!==playerId||state.timeline?.phase!=='player'?'自分の操作ターンに作成してください'
    :!check.accessible?'部隊へ合流してください':!check.base?'自軍の拠点領土内で作成できます':n(check.unit.ap??check.unit.currentAp)<ration.apCost?'APが不足しています'
    :count<=0?'目標分を携帯済み、または通常食料・積載余力が不足しています':'';
  return {...check,ingredients,count,reason,available:!reason};
}
export function craftV39PreservedFood(state,playerId,unitId,turns){
  const check=inspectV39PreservedFoodCraft(state,playerId,unitId,turns);
  if(!check.available)return {ok:false,state,reason:check.reason};
  const player=state.players.find(p=>p.id===playerId),resources={[ration.name]:check.count};
  const added=addV39CargoToFactionUnit(player.factionState,unitId,{resourcesByType:resources});
  if(!added.ok)return {ok:false,state,reason:'荷物を配置できません'};
  const ids=new Set(check.members.map(u=>u.id));
  let faction={...added.faction,units:added.faction.units.map(u=>ids.has(u.id)?{...u,carryFood:true,carriedFoodTargetTurns:check.turns,...(u.id===unitId?{ap:n(u.ap??u.currentAp)-ration.apCost,currentAp:n(u.ap??u.currentAp)-ration.apCost,actionPoint:n(u.ap??u.currentAp)-ration.apCost}:{})}:u)};
  const stock={...check.base.foodStockByType};
  for(const [key,amount] of Object.entries(check.ingredients))stock[key]=round(n(stock[key])-amount);
  faction=replaceFactionSettlement(faction,{...check.base,foodStockByType:stock},{ownerPlayerId:playerId,select:false});
  return {ok:true,resources,state:{...state,players:state.players.map(p=>p.id===playerId?{...p,factionState:faction}:p)}};
}
export function feedV39CarriedFood(faction,unit,shortfall,state,turn){
  if(unit.lastCarriedFoodTurn===turn)return {faction,protected:unit.carriedFoodFed===true};
  if(!unit.carryFood&&!(faction.squads||[]).some(s=>hasV39CarriedFood(s.cargo)||hasV39CarriedFood(s.cargoByUnitId?.[unit.id])))return {faction,protected:false};
  const status=resolveV39CarriedFoodStatus(faction,unit.id,state);
  if(!unit.carryFood&&!hasV39CarriedFood(status.cargo))return {faction,protected:false};
  const demand=shortfall||resolveV39UnitMaintenanceDemand(unit,V39_CARRIED_FOOD_KEYS);
  const result=consumeV39CarriedMaintenance(status.accessible?status.cargo.resourcesByType:{},demand,V39_CARRIED_FOOD_KEYS,normalKeys);
  if(status.accessible&&status.squad){
    const resources={...status.cargo.resourcesByType};
    for(const [key,amount] of Object.entries(result.consumed))if(amount>0)resources[key]=round(n(resources[key])-amount);
    faction=replaceCargo(faction,status,{...status.cargo,resourcesByType:resources});
  }
  faction={...faction,units:faction.units.map(u=>u.id===unit.id?{...u,carryFood:true,lastCarriedFoodTurn:turn,carriedFoodFed:result.fed,carriedFoodConsumed:result.consumed,
    ...(result.fed?{starvationStage:0,starvationApCap:0,starvationPenaltyRate:0}:{})}:u)};
  return {faction,protected:result.fed};
}
