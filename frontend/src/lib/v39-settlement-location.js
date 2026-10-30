import {getFactionSettlements,territorySettlementId} from './settlement-state.js';

export function isV39UnitInsideSettlement(unit,settlement){
  if(!settlement?.placed||!Number.isInteger(unit?.x)||!Number.isInteger(unit?.y))return false;
  const key=`${unit.x},${unit.y}`,center=`${settlement.x},${settlement.y}`;
  return key===center||String(settlement.territoryResidentialCenterMap?.[key]||'').trim()===center;
}

// Supply may use the assigned settlement's territory; transport arrival stays residential-only.
export function resolveV39UnitSupplySettlement(state,faction,unit,playerId){
  if(!Number.isInteger(unit?.x)||!Number.isInteger(unit?.y))return null;
  const world=unit.worldId||'surface',key=`${unit.x},${unit.y}`;
  const bases=getFactionSettlements(faction).filter(base=>base.placed&&(base.worldId||'surface')===world);
  if(world==='surface'){
    const owner=state?.territoryOwnerByTile?.[key];
    if(owner&&owner!==playerId)return null;
    const assigned=territorySettlementId(state?.territoryStateByTile?.[key]);
    if(owner===playerId&&assigned)return bases.find(base=>(base.settlementId||base.id)===assigned)||null;
    const matched=bases.filter(base=>(base.territoryTileKeys||[]).includes(key));
    if(matched.length===1)return matched[0];
    if(owner===playerId&&bases.length===1)return bases[0];
  }
  return bases.find(base=>isV39UnitInsideSettlement(unit,base))||null;
}
