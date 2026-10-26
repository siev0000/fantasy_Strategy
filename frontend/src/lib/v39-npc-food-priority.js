import config from '../../../config/v39-npc-faction-ai.json';
import {collectV39TerritoryIncome,NORMAL_FOOD_RESOURCE_KEYS,advanceConstruction} from './v39-economy-rules.js';
import {buildV39PopulationMaintenanceStock,inspectV39NormalFoodSupply,FOOD_SUBSTITUTE_MULTIPLIER} from './v39-population-economy.js';
import {getFactionSettlements,getSelectedSettlement,replaceFactionSettlement} from './settlement-state.js';

const n=value=>Number(value)||0;
const alive=unit=>n(unit?.hp??unit?.currentHp)>0&&unit.state!=='死亡';
export function inspectV39NpcFoodBalance(state,player,map){
  const selected=getSelectedSettlement(player?.factionState),fallback=selected?.settlementId||selected?.id;
  return getFactionSettlements(player?.factionState).filter(base=>base.placed&&(base.worldId||'surface')===(state.activeWorldId||'surface')).map(base=>{
    const id=base.settlementId||base.id;
    const current=(player.factionState.units||[]).filter(unit=>alive(unit)&&(unit.settlementId||fallback)===id);
    const queued=(player.factionState.unitTrainingQueue||[]).map(entry=>entry.unit).filter(unit=>unit&&(unit.settlementId||fallback)===id&&alive(unit));
    const scoped={...player,factionState:replaceFactionSettlement(player.factionState,base,{ownerPlayerId:player.id})};
    const income=collectV39TerritoryIncome(state,scoped,map).food;
    const maintenance=buildV39PopulationMaintenanceStock(base.populationByRace,[...current,...queued],NORMAL_FOOD_RESOURCE_KEYS);
    const supply=inspectV39NormalFoodSupply(income,maintenance,NORMAL_FOOD_RESOURCE_KEYS);
    const reserveDemand=Object.fromEntries(Object.entries(maintenance).map(([key,value])=>[key,value*config.resourceTeams.stockReserveTurns]));
    const reserve=inspectV39NormalFoodSupply(base.foodStockByType,reserveDemand,NORMAL_FOOD_RESOURCE_KEYS);
    const status=supply.shortageTotal>0?'deficit':reserve.shortageTotal>0?'reserve':'stable';
    return {settlementId:id,name:base.name,status,active:config.foodPriority.enabled&&status!=='stable',income,maintenance,
      deficit:supply.shortageByType,deficitTotal:supply.shortageTotal,reserveDeficit:reserve.shortageByType,
      reserveDeficitTotal:reserve.shortageTotal,queuedUnits:queued.length,surplus:supply.surplus};
  });
}

export function scoreV39NpcFoodIncome(beforeIncome,afterIncome,maintenance){
  const before=inspectV39NormalFoodSupply(beforeIncome,maintenance,NORMAL_FOOD_RESOURCE_KEYS);
  const after=inspectV39NormalFoodSupply(afterIncome,maintenance,NORMAL_FOOD_RESOURCE_KEYS);
  return Math.round(((before.shortageTotal-after.shortageTotal)*FOOD_SUBSTITUTE_MULTIPLIER+after.surplus-before.surplus)*100)/100;
}

export function focusV39NpcFoodSettlement(state,playerId,map){
  const player=state.players?.find(row=>row.id===playerId);
  if(player?.isPlayer!==false)return state;
  const focus=inspectV39NpcFoodBalance(state,player,map).filter(row=>row.active)
    .sort((a,b)=>b.deficitTotal-a.deficitTotal||b.reserveDeficitTotal-a.reserveDeficitTotal||a.settlementId.localeCompare(b.settlementId))[0];
  const old=getSelectedSettlement(player.factionState),oldId=old?.settlementId||old?.id;
  if(!focus||focus.settlementId===oldId)return state;
  // Preserve the old fallback home when changing the AI's planning base in legacy saves.
  const faction={...player.factionState,selectedSettlementId:focus.settlementId,
    units:(player.factionState.units||[]).map(unit=>unit.settlementId?unit:{...unit,settlementId:oldId}),
    unitTrainingQueue:(player.factionState.unitTrainingQueue||[]).map(entry=>!entry.unit||entry.unit.settlementId?entry:{...entry,unit:{...entry.unit,settlementId:oldId}})};
  return {...state,players:state.players.map(row=>row.id===playerId?{...row,factionState:faction}:row)};
}

export function inspectV39NpcFoodFacilityGain(state,player,base,definition,tile,map,food){
  const completed=advanceConstruction({...base,constructionQueue:[{facilityName:definition.name,tileKey:`${tile.x},${tile.y}`,remainingTurns:1}],
    territoryTileModeMap:{...base.territoryTileModeMap,[`${tile.x},${tile.y}`]:'resource'}}).village;
  const projected={...player,factionState:replaceFactionSettlement(player.factionState,completed,{ownerPlayerId:player.id})};
  const after=collectV39TerritoryIncome(state,projected,map).food;
  return scoreV39NpcFoodIncome(food.income,after,food.maintenance);
}
