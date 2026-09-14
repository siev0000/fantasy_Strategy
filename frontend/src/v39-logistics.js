import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, normalizeV39Village } from "./lib/v39-economy-rules.js";
import { normalizeV39EquipmentInventory } from "./lib/v39-equipment-rules.js";
import {
  addV39CargoToFactionUnit,
  getV39SquadUnitIds,
  isV39CargoEmpty,
  mergeV39Cargo,
  normalizeV39Cargo
} from "./lib/v39-logistics-state.js";
import { getFactionSettlements, replaceFactionSettlement } from "./lib/settlement-state.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tileKey = value => `${Math.floor(number(value?.x))},${Math.floor(number(value?.y))}`;
const foodKeys = new Set(FOOD_RESOURCE_KEYS);
const materialKeys = new Set(MATERIAL_RESOURCE_KEYS);

function cargoEmpty(value) {
  return isV39CargoEmpty(value);
}

function squadUnitIds(squad) {
  return getV39SquadUnitIds(squad);
}

function settlementAt(faction, unit) {
  const key = tileKey(unit);
  return getFactionSettlements(faction).find(settlement => settlement?.placed !== false && tileKey(settlement) === key) || null;
}

function allLivingSquadMembersAt(faction, squad, destination) {
  const ids = new Set(squadUnitIds(squad));
  const members = (faction?.units || []).filter(unit => ids.has(text(unit?.id)) && number(unit?.hp ?? unit?.currentHp) > 0);
  return members.length > 0 && members.every(unit => tileKey(unit) === tileKey(destination));
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

function depositIntoNest(rawNest, rawCargo) {
  const cargo = normalizeV39Cargo(rawCargo);
  const foodStockByType = { ...(rawNest?.foodStockByType || {}) };
  const materialStockByType = { ...(rawNest?.materialStockByType || {}) };
  for (const [name, amount] of Object.entries(cargo.resourcesByType)) {
    const target = foodKeys.has(name) ? foodStockByType : materialStockByType;
    target[name] = number(target[name]) + amount;
  }
  return {
    nest:{
      ...rawNest,
      foodStockByType,
      materialStockByType,
      equipmentInventory:normalizeV39EquipmentInventory([...(rawNest?.equipmentInventory || []), ...cargo.equipmentInventory])
    },
    deposited:cargo
  };
}

function cargoSummary(cargo) {
  const normalized = normalizeV39Cargo(cargo);
  const resources = Object.entries(normalized.resourcesByType).map(([name, amount]) => `${name}${amount}`);
  if (normalized.equipmentInventory.length) resources.push(`装備${normalized.equipmentInventory.length}`);
  return resources.join(" / ");
}

export function addV39CargoToUnit(playerId, unitId, cargoToAdd) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  if (!state || !player || cargoEmpty(cargoToAdd)) return { ok:false, reason:"運搬対象がありません" };
  const result = addV39CargoToFactionUnit(player.factionState, unitId, cargoToAdd);
  if (!result.ok) return { ok:false, reason:"所属部隊が見つかりません" };
  const players = state.players.map(row => text(row?.id) === text(player.id)
    ? { ...row, factionState:result.faction }
    : row);
  window.setV39GameState?.({ players }, { reason:"unit-cargo-added" });
  return { ok:true, solo:result.solo, squadId:result.squadId };
}

export function addV39CargoToEnemy(enemyId, cargoToAdd) {
  const state = window.getV39GameState?.();
  const enemy = state?.enemies?.find(row => text(row?.id) === text(enemyId));
  const squadId = text(enemy?.enemySquadId);
  if (!state || !enemy || !squadId || cargoEmpty(cargoToAdd)) return { ok:false, reason:"敵部隊が見つかりません" };
  const enemySquads = state.enemySquads.map(squad => text(squad?.id) === squadId
    ? { ...squad, cargo:mergeV39Cargo(squad?.cargo, cargoToAdd) }
    : squad);
  window.setV39GameState?.({ enemySquads }, { reason:"enemy-cargo-added" });
  return { ok:true, squadId };
}

export function depositV39PlayerCargo(playerId, movedUnitId = "") {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  if (!state || !player) return [];
  let faction = player.factionState;
  let changed = false;
  const reports = [];
  const squads = faction.squads.map(squad => {
    const ids = squadUnitIds(squad);
    if (movedUnitId && !ids.includes(text(movedUnitId))) return squad;
    const solo = text(squad?.id) === "solo";
    if (solo) {
      const cargoByUnitId = { ...(squad?.cargoByUnitId || {}) };
      for (const unitId of movedUnitId ? [text(movedUnitId)] : Object.keys(cargoByUnitId)) {
        const unit = faction.units.find(row => text(row?.id) === unitId);
        const settlement = unit && settlementAt(faction, unit);
        if (!settlement || cargoEmpty(cargoByUnitId[unitId])) continue;
        const result = depositIntoSettlement(settlement, player.race, cargoByUnitId[unitId]);
        faction = replaceFactionSettlement(faction, result.settlement, { ownerPlayerId:player.id });
        if (cargoEmpty(result.remainingCargo)) delete cargoByUnitId[unitId];
        else cargoByUnitId[unitId] = result.remainingCargo;
        reports.push({ playerId:player.id, unitId, squadId:text(squad.id), settlementId:text(settlement.settlementId || settlement.id), deposited:result.deposited });
        changed = true;
      }
      return { ...squad, cargoByUnitId };
    }
    const member = faction.units.find(unit => ids.includes(text(unit?.id)));
    const settlement = member && settlementAt(faction, member);
    if (!settlement || cargoEmpty(squad?.cargo) || !allLivingSquadMembersAt(faction, squad, settlement)) return squad;
    const result = depositIntoSettlement(settlement, player.race, squad.cargo);
    faction = replaceFactionSettlement(faction, result.settlement, { ownerPlayerId:player.id });
    reports.push({ playerId:player.id, squadId:text(squad.id), settlementId:text(settlement.settlementId || settlement.id), deposited:result.deposited });
    changed = true;
    return { ...squad, cargo:result.remainingCargo };
  });
  if (!changed) return reports;
  faction = { ...faction, squads };
  const players = state.players.map(row => text(row?.id) === text(player.id) ? { ...row, factionState:faction } : row);
  window.setV39GameState?.({ players }, { reason:"player-cargo-deposited" });
  for (const report of reports) window.appendV39ActivityLog?.(player.id, "物資", `拠点へ搬入: ${cargoSummary(report.deposited)}`, report);
  window.dispatchEvent(new CustomEvent("v39:cargo-deposited", { detail:{ side:"player", reports } }));
  return reports;
}

export function depositV39EnemyCargo(enemyId = "") {
  const state = window.getV39GameState?.();
  if (!state) return [];
  const reports = [];
  let enemyNests = state.enemyNests;
  let changed = false;
  const enemySquads = state.enemySquads.map(squad => {
    if (enemyId && !squadUnitIds(squad).includes(text(enemyId))) return squad;
    if (cargoEmpty(squad?.cargo)) return squad;
    const nest = enemyNests.find(row => text(row?.id) === text(squad?.nestId));
    const ids = new Set(squadUnitIds(squad));
    const members = state.enemies.filter(enemy => ids.has(text(enemy?.id)) && number(enemy?.hp ?? enemy?.currentHp) > 0);
    if (!nest || !members.length || !members.every(enemy => tileKey(enemy) === tileKey(nest))) return squad;
    const result = depositIntoNest(nest, squad.cargo);
    enemyNests = enemyNests.map(row => text(row?.id) === text(nest.id) ? result.nest : row);
    reports.push({ squadId:text(squad.id), nestId:text(nest.id), deposited:result.deposited });
    changed = true;
    return { ...squad, cargo:normalizeV39Cargo() };
  });
  if (changed) {
    window.setV39GameState?.({ enemySquads, enemyNests }, { reason:"enemy-cargo-deposited" });
    window.dispatchEvent(new CustomEvent("v39:cargo-deposited", { detail:{ side:"enemy", reports } }));
  }
  return reports;
}

export function recoverV39GroundLoot(playerId, unitId, rawTileKey) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const unit = player?.factionState?.units?.find(row => text(row?.id) === text(unitId));
  const key = text(rawTileKey || tileKey(unit));
  const groundLoot = state?.groundLootByTile?.[key];
  if (!state || !player || !unit || number(unit?.hp ?? unit?.currentHp) <= 0) return { ok:false, reason:"回収するキャラクターがいません" };
  if (tileKey(unit) !== key) return { ok:false, reason:"残留品と同じマスで実行してください" };
  if (!groundLoot || cargoEmpty(groundLoot.cargo)) return { ok:false, reason:"残留品がありません" };
  if (!groundLoot.discoveredByPlayerIds?.includes(text(player.id))) return { ok:false, reason:"先に残留品を調査してください" };
  const result = addV39CargoToFactionUnit(player.factionState, unit.id, groundLoot.cargo);
  if (!result.ok) return { ok:false, reason:"所属部隊が見つかりません" };
  const players = state.players.map(row => text(row?.id) === text(player.id)
    ? { ...row, factionState:result.faction }
    : row);
  const groundLootByTile = { ...state.groundLootByTile };
  delete groundLootByTile[key];
  window.setV39GameState?.({ players, groundLootByTile }, { reason:"ground-loot-recovered" });
  const report = { playerId:player.id, unitId:text(unit.id), squadId:result.squadId, key, recovered:normalizeV39Cargo(groundLoot.cargo) };
  window.appendV39ActivityLog?.(player.id, "物資", `残留品を回収: ${cargoSummary(report.recovered)}`, report);
  window.dispatchEvent(new CustomEvent("v39:ground-loot-recovered", { detail:report }));
  return { ok:true, ...report };
}

export function recoverV39GroundLootForEnemy(enemyId, rawTileKey = "") {
  const state = window.getV39GameState?.();
  const enemy = state?.enemies?.find(row => text(row?.id) === text(enemyId));
  const key = text(rawTileKey || tileKey(enemy));
  const groundLoot = state?.groundLootByTile?.[key];
  const squadId = text(enemy?.enemySquadId);
  if (!state || !enemy || number(enemy?.hp ?? enemy?.currentHp) <= 0 || !squadId) return { ok:false, reason:"回収する敵部隊がありません" };
  if (tileKey(enemy) !== key) return { ok:false, reason:"残留品と同じマスではありません" };
  if (!groundLoot || cargoEmpty(groundLoot.cargo)) return { ok:false, reason:"残留品がありません" };
  const enemySquads = state.enemySquads.map(squad => text(squad?.id) === squadId
    ? { ...squad, cargo:mergeV39Cargo(squad?.cargo, groundLoot.cargo) }
    : squad);
  const groundLootByTile = { ...state.groundLootByTile };
  delete groundLootByTile[key];
  window.setV39GameState?.({ enemySquads, groundLootByTile }, { reason:"ground-loot-recovered-by-enemy" });
  const report = { enemyId:text(enemy.id), squadId, key, recovered:normalizeV39Cargo(groundLoot.cargo) };
  window.dispatchEvent(new CustomEvent("v39:ground-loot-recovered", { detail:{ ...report, enemyAction:true } }));
  return { ok:true, ...report };
}

window.addV39CargoToUnit = addV39CargoToUnit;
window.addV39CargoToEnemy = addV39CargoToEnemy;
window.depositV39PlayerCargo = depositV39PlayerCargo;
window.depositV39EnemyCargo = depositV39EnemyCargo;
window.recoverV39GroundLoot = recoverV39GroundLoot;
window.recoverV39GroundLootForEnemy = recoverV39GroundLootForEnemy;
window.addEventListener("v39:unit-moved", event => depositV39PlayerCargo(window.getV39GameState?.()?.activePlayerId, event?.detail?.unitId));
window.addEventListener("v39:enemy-moved", event => {
  recoverV39GroundLootForEnemy(event?.detail?.enemyId);
  depositV39EnemyCargo(event?.detail?.enemyId);
});
