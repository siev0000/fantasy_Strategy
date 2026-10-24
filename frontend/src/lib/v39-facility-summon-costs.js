import settings from '../../../config/v39-facility-summon-costs.json';
import {getFactionSettlementById,replaceFactionSettlement} from './settlement-state.js';
import {formatV39SummonMaterials,scaleV39SummonMaterials,inspectV39SummonMaterialPayment,payV39SummonMaterials} from './v39-summon-materials.js';

const positive=value=>Math.max(0,Number(value)||0);
export function resolveV39FacilitySummonCosts(unit,config=settings){
  return {goldCost:Math.ceil(positive(unit?.level??unit?.Lv)*positive(config.goldPerLevel))*Math.max(1,Math.floor(positive(unit?.summon?.representedCount)||1)),
    upkeepIntervalTurns:Math.max(1,Math.floor(positive(config.upkeepIntervalTurns)))};
}

// Called by the world-local lifecycle; saved deadlines prevent repeated movement/combat charges.
export function advanceV39FacilitySummonUpkeep(state,turn){
  const reports=[];let changed=false;
  const players=state.players.map(player=>{
    let faction=player.factionState;
    const units=faction.units.map(unit=>{
      const facility=unit.summon?.kind==='facility',hasMaterials=Object.keys(unit.summon?.upkeepMaterials||{}).length>0;
      if(!unit.summon||(!facility&&!hasMaterials)||positive(unit.hp??unit.currentHp)<=0
        ||(!facility&&unit.summon.expiresAtTurn<=turn)
        ||(unit.worldId||'surface')!==(state.activeWorldId||'surface'))return unit;
      const {goldCost,upkeepIntervalTurns}=resolveV39FacilitySummonCosts(unit);
      const deadline=Number(unit.summon.nextUpkeepTurn);
      // Legacy saves begin a fresh interval rather than receiving retroactive charges.
      if(!Number.isFinite(deadline)||unit.summon.nextUpkeepTurn==null){
        changed=true;return {...unit,summon:{...unit.summon,nextUpkeepTurn:turn+upkeepIntervalTurns}};
      }
      if(deadline>turn)return unit;
      const periods=Math.floor((turn-deadline)/upkeepIntervalTurns)+1,cost=facility?goldCost*periods:0;
      const payment=scaleV39SummonMaterials(unit.summon.upkeepMaterials,periods);payment.金=(payment.金||0)+cost;
      const base=getFactionSettlementById(faction,unit.summon.paymentSettlementId||unit.settlementId);
      changed=true;
      if(!base||!inspectV39SummonMaterialPayment(base,payment).available){
        reports.push({playerId:player.id,message:`${unit.name}: 維持費 ${formatV39SummonMaterials(payment)}を支払えず召喚解除`});
        return {...unit,summon:{...unit.summon,maintenanceFailed:true}};
      }
      faction=replaceFactionSettlement(faction,payV39SummonMaterials(base,payment),
        {ownerPlayerId:player.id,select:false});
      reports.push({playerId:player.id,message:`${unit.name}: 召喚維持費 ${formatV39SummonMaterials(payment)}`});
      return {...unit,summon:{...unit.summon,nextUpkeepTurn:deadline+periods*upkeepIntervalTurns}};
    });
    return {...player,factionState:{...faction,units}};
  });
  return {state:changed?{...state,players}:state,reports};
}
