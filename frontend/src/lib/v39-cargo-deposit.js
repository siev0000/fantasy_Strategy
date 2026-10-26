import {FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS,normalizeV39Village} from './v39-economy-rules.js';
import {normalizeV39EquipmentInventory} from './v39-equipment-rules.js';
import {getFactionSettlements,replaceFactionSettlement} from './settlement-state.js';
import {isV39UnitInsideSettlement} from './v39-transport-rules.js';
import {getHexDistance} from './hex-grid.js';
import {getV39SquadUnitIds as squadUnitIds,isV39CargoEmpty as cargoEmpty,normalizeV39Cargo} from './v39-logistics-state.js';
const text=value=>String(value??'').trim();
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const foodKeys=new Set(FOOD_RESOURCE_KEYS),materialKeys=new Set(MATERIAL_RESOURCE_KEYS);
function settlementAt(faction, unit) {
  return getFactionSettlements(faction).find(settlement => (unit.worldId||'surface')===(settlement.worldId||'surface')&&isV39UnitInsideSettlement(unit, settlement)) || null;
}

function allLivingSquadMembersAt(faction, squad, destination) {
  const ids = new Set(squadUnitIds(squad));
  const members = (faction?.units || []).filter(unit => ids.has(text(unit?.id)) && number(unit?.hp ?? unit?.currentHp) > 0);
  return members.length > 0 && members.every(unit => (unit.worldId||'surface')===(destination.worldId||'surface')
    &&(isV39UnitInsideSettlement(unit,destination)||getHexDistance(unit,destination)<=1));
}

function depositIntoSettlement(rawSettlement, race, rawCargo) {
  const settlement = normalizeV39Village(rawSettlement, race);
  const cargo = normalizeV39Cargo(rawCargo);
  const foodStockByType = { ...settlement.foodStockByType };
  const materialStockByType = { ...settlement.materialStockByType };
  const remainingResources = {};
  const depositedResources = {};
  for (const [name, amount] of Object.entries(cargo.resourcesByType)) {
    if (foodKeys.has(name)) foodStockByType[name] = number(foodStockByType[name]) + amount;
    else if (materialKeys.has(name)) materialStockByType[name] = number(materialStockByType[name]) + amount;
    else {
      remainingResources[name] = amount;
      continue;
    }
    depositedResources[name] = amount;
  }
  const depositedEquipment = [...cargo.equipmentInventory];
  return {
    settlement:normalizeV39Village({
      ...settlement,
      foodStockByType,
      materialStockByType,
      equipmentInventory:normalizeV39EquipmentInventory([...settlement.equipmentInventory, ...depositedEquipment])
    }, race),
    remainingCargo:{ resourcesByType:remainingResources, equipmentInventory:[] },
    deposited:{ resourcesByType:depositedResources, equipmentInventory:depositedEquipment }
  };
}

export function depositV39FactionCargo(state,playerId,movedUnitId="") {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  if (!state || !player) return {state,reports:[]};
  let faction = player.factionState;
  let changed = false;
  const reports = [];
  const squads = faction.squads.map(squad => {
    const ids = squadUnitIds(squad);
    if (movedUnitId && !ids.includes(text(movedUnitId))) return squad;
    const solo = text(squad?.id) === "solo";
    {
      const cargoByUnitId = { ...(squad?.cargoByUnitId || {}) };
      const cargoDeliveryTargetByUnitId={...squad.cargoDeliveryTargetByUnitId};
      for (const unitId of movedUnitId ? [text(movedUnitId)] : Object.keys(cargoByUnitId)) {
        const unit = faction.units.find(row => text(row?.id) === unitId);
        const settlement = unit && settlementAt(faction, unit);
        if (!settlement || unit.transportAssignment?.enabled || cargoEmpty(cargoByUnitId[unitId])) continue;
        if(cargoDeliveryTargetByUnitId[unitId]&&cargoDeliveryTargetByUnitId[unitId]!==text(settlement.settlementId||settlement.id))continue;
        const result = depositIntoSettlement(settlement, player.race, cargoByUnitId[unitId]);
        faction = replaceFactionSettlement(faction, result.settlement, { ownerPlayerId:player.id, select:false });
        if (cargoEmpty(result.remainingCargo)){delete cargoByUnitId[unitId];delete cargoDeliveryTargetByUnitId[unitId];}
        else cargoByUnitId[unitId] = result.remainingCargo;
        reports.push({ playerId:player.id, unitId, squadId:text(squad.id), settlementId:text(settlement.settlementId || settlement.id), deposited:result.deposited });
        changed = true;
      }
      squad = { ...squad, cargoByUnitId,cargoDeliveryTargetByUnitId };
    }
    if (solo) return squad;
    const member = faction.units.find(unit => ids.includes(text(unit?.id))&&number(unit.hp??unit.currentHp)>0&&settlementAt(faction,unit));
    const settlement = member && settlementAt(faction, member);
    if (!settlement || cargoEmpty(squad?.cargo) || !allLivingSquadMembersAt(faction, squad, settlement)) return squad;
    if(squad.cargoDeliveryTargetSettlementId&&squad.cargoDeliveryTargetSettlementId!==text(settlement.settlementId||settlement.id))return squad;
    const result = depositIntoSettlement(settlement, player.race, squad.cargo);
    faction = replaceFactionSettlement(faction, result.settlement, { ownerPlayerId:player.id });
    reports.push({ playerId:player.id, squadId:text(squad.id), settlementId:text(settlement.settlementId || settlement.id), deposited:result.deposited });
    changed = true;
    return { ...squad, cargo:result.remainingCargo,cargoDeliveryTargetSettlementId:cargoEmpty(result.remainingCargo)?null:squad.cargoDeliveryTargetSettlementId };
  });
  if (!changed) return {state,reports};
  faction = { ...faction, squads };
  const players = state.players.map(row => text(row?.id) === text(player.id) ? { ...row, factionState:faction } : row);
  return {state:{...state,players},reports};
}
