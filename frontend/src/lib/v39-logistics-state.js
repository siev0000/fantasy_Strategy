import { normalizeV39NestExplorationState } from "./v39-enemy-exploration.js";
import { formatV39NestName, V39_INITIAL_NEST_TERRITORY_RADIUS } from "./v39-nest-rules.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function cloneRows(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map(row => ({ ...row }))
    : [];
}

export function normalizeV39ResourceCargo(value = {}) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .map(([name, amount]) => [text(name), Math.max(0, number(amount))])
    .filter(([name, amount]) => name && amount > 0));
}

export function normalizeV39Cargo(value = {}) {
  return {
    resourcesByType:normalizeV39ResourceCargo(value?.resourcesByType),
    equipmentInventory:cloneRows(value?.equipmentInventory)
  };
}

export function isV39CargoEmpty(value = {}) {
  const cargo = normalizeV39Cargo(value);
  return !Object.keys(cargo.resourcesByType).length && !cargo.equipmentInventory.length;
}

export function mergeV39Cargo(left = {}, right = {}) {
  const a = normalizeV39Cargo(left);
  const b = normalizeV39Cargo(right);
  const resourcesByType = { ...a.resourcesByType };
  for (const [name, amount] of Object.entries(b.resourcesByType)) {
    resourcesByType[name] = number(resourcesByType[name]) + number(amount);
  }
  return {
    resourcesByType,
    equipmentInventory:[...a.equipmentInventory, ...b.equipmentInventory]
  };
}

export function resolveV39UnitCargoCapacity(unit) {
  const size = Math.max(0, number(unit?.status?.SIZ, number(unit?.SIZ)));
  return Math.max(0, Math.round((100 * size / 170) * 10) / 10);
}

export function resolveV39CargoLoad(value = {}) {
  const cargo = normalizeV39Cargo(value);
  const resourceLoad = Object.values(cargo.resourcesByType).reduce((sum, amount) => sum + Math.max(0, number(amount)), 0);
  return Math.round((resourceLoad + cargo.equipmentInventory.length) * 10) / 10;
}

export function resolveV39EnemySquadCargoStatus(state, squad) {
  const ids = new Set(getV39SquadUnitIds(squad));
  const members = (state?.enemies || []).filter(unit => ids.has(text(unit?.id)) && number(unit?.hp ?? unit?.currentHp) > 0);
  const capacity = Math.round(members.reduce((sum, unit) => sum + resolveV39UnitCargoCapacity(unit), 0) * 10) / 10;
  const load = resolveV39CargoLoad(squad?.cargo);
  return { capacity, load, remaining:Math.max(0, Math.round((capacity-load)*10)/10), full:capacity > 0 && load >= capacity };
}

export function fitV39CargoToCapacity(value = {}, capacity = 0) {
  let remaining = Math.max(0, number(capacity));
  const source = normalizeV39Cargo(value);
  const accepted = { resourcesByType:{}, equipmentInventory:[] };
  const overflow = { resourcesByType:{}, equipmentInventory:[] };
  for (const [name, amount] of Object.entries(source.resourcesByType)) {
    const take = Math.min(amount, remaining);
    if (take > 0) accepted.resourcesByType[name] = Math.round(take*10)/10;
    if (amount > take) overflow.resourcesByType[name] = Math.round((amount-take)*10)/10;
    remaining = Math.max(0, Math.round((remaining-take)*10)/10);
  }
  for (const item of source.equipmentInventory) {
    if (remaining >= 1) {
      accepted.equipmentInventory.push(item);
      remaining = Math.max(0, Math.round((remaining-1)*10)/10);
    } else overflow.equipmentInventory.push(item);
  }
  return { accepted:normalizeV39Cargo(accepted), overflow:normalizeV39Cargo(overflow), remaining };
}

export function getV39SquadUnitIds(squad = {}) {
  const source = Array.isArray(squad?.unitIds)
    ? squad.unitIds
    : Array.isArray(squad?.memberIds) ? squad.memberIds : [];
  return [...new Set(source.map(text).filter(Boolean))];
}

export function addV39CargoToFactionUnit(faction = {}, unitId = "", cargoToAdd = {}) {
  const id = text(unitId);
  if (!id || isV39CargoEmpty(cargoToAdd)) return { ok:false, faction };
  const unit = (Array.isArray(faction?.units) ? faction.units : []).find(row => text(row?.id) === id);
  const squads = Array.isArray(faction?.squads) ? faction.squads : [];
  const squad = squads.find(row => getV39SquadUnitIds(row).includes(id))
    || squads.find(row => text(row?.id) === text(unit?.squadId));
  if (!unit || !squad) return { ok:false, faction };
  const solo = text(squad.id) === "solo" || text(unit.squadId) === "solo";
  const nextSquads = squads.map(row => {
    if (text(row?.id) !== text(squad.id)) return row;
    if (!solo) return { ...row, cargo:mergeV39Cargo(row?.cargo, cargoToAdd) };
    return {
      ...row,
      cargoByUnitId:{
        ...(row?.cargoByUnitId || {}),
        [id]:mergeV39Cargo(row?.cargoByUnitId?.[id], cargoToAdd)
      }
    };
  });
  return { ok:true, solo, squadId:text(squad.id), faction:{ ...faction, squads:nextSquads } };
}

export function normalizeV39SquadLogistics(squad = {}) {
  const cargoByUnitId = Object.fromEntries(Object.entries(squad?.cargoByUnitId || {})
    .map(([unitId, cargo]) => [text(unitId), normalizeV39Cargo(cargo)])
    .filter(([unitId, cargo]) => unitId
      && (Object.keys(cargo.resourcesByType).length || cargo.equipmentInventory.length)));
  return {
    ...squad,
    cargo:normalizeV39Cargo(squad?.cargo),
    cargoByUnitId
  };
}

export function normalizeV39EnemySquad(squad = {}, index = 0) {
  const normalized = normalizeV39SquadLogistics(squad);
  return {
    ...normalized,
    id:text(normalized?.id) || `enemy-squad-${index + 1}`,
    nestId:text(normalized?.nestId),
    unitIds:[...new Set((Array.isArray(normalized?.unitIds) ? normalized.unitIds : []).map(text).filter(Boolean))]
  };
}

export function normalizeV39EnemySquads(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map((squad, index) => normalizeV39EnemySquad(squad, index))
    : [];
}

export function normalizeV39EnemyNest(nest = {}, index = 0) {
  const x = Math.floor(number(nest?.x));
  const y = Math.floor(number(nest?.y));
  const nestType = text(nest?.nestType || nest?.type);
  const race = text(nest?.race, nestType || "モンスター");
  const unitIds = [...new Set((Array.isArray(nest?.unitIds) ? nest.unitIds : []).map(text).filter(Boolean))];
  return {
    ...nest,
    id:text(nest?.id) || `enemy-nest-${index + 1}-${x}-${y}`,
    name:text(nest?.name) || formatV39NestName(race, index + 1),
    nestType,
    race,
    x,
    y,
    territoryRadius:Math.max(1, Math.floor(number(nest?.territoryRadius, V39_INITIAL_NEST_TERRITORY_RADIUS))),
    population:Math.max(0, Math.floor(number(nest?.population))),
    populationByRace:Object.fromEntries(Object.entries(nest?.populationByRace || {})
      .map(([race, value]) => [text(race), Math.max(0, Math.floor(number(value)))])
      .filter(([race, value]) => race && value > 0)),
    populationGrowthByRace:Object.fromEntries(Object.entries(nest?.populationGrowthByRace || {}).map(([race, value]) => [text(race), { ...(value || {}) }])),
    explorationState:normalizeV39NestExplorationState(nest?.explorationState),
    unitIds,
    everHadUnits:nest?.everHadUnits === true || unitIds.length > 0,
    foodStockByType:normalizeV39ResourceCargo(nest?.foodStockByType),
    materialStockByType:normalizeV39ResourceCargo(nest?.materialStockByType),
    equipmentInventory:cloneRows(nest?.equipmentInventory)
  };
}

export function normalizeV39EnemyNests(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map((nest, index) => normalizeV39EnemyNest(nest, index))
    : [];
}

export function normalizeV39GroundLootByTile(value = {}) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .map(([tileKey, loot]) => [text(tileKey), {
      discoveredByPlayerIds:[...new Set((Array.isArray(loot?.discoveredByPlayerIds) ? loot.discoveredByPlayerIds : []).map(text).filter(Boolean))],
      cargo:normalizeV39Cargo(loot?.cargo)
    }])
    .filter(([tileKey, loot]) => tileKey.includes(",")
      && (Object.keys(loot.cargo.resourcesByType).length || loot.cargo.equipmentInventory.length)));
}
