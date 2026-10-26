import {depositV39FactionCargo} from '../../lib/v39-cargo-deposit.js';
import { FOOD_RESOURCE_KEYS } from "../../lib/v39-economy-rules.js";
import { normalizeV39EquipmentInventory } from "../../lib/v39-equipment-rules.js";
import {
  addV39CargoToFactionUnit,
  fitV39CargoToCapacity,
  getV39SquadUnitIds,
  isV39CargoEmpty,
  mergeV39Cargo,
  normalizeV39Cargo,
  resolveV39EnemySquadCargoStatus
} from "../../lib/v39-logistics-state.js";
import { recoverV39GroundLootState } from '../../lib/v39-ground-loot-recovery.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const tileKey = value => `${Math.floor(number(value?.x))},${Math.floor(number(value?.y))}`;
const foodKeys = new Set(FOOD_RESOURCE_KEYS);

function cargoEmpty(value) {
  return isV39CargoEmpty(value);
}

function squadUnitIds(squad) {
  return getV39SquadUnitIds(squad);
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
  const squad = state?.enemySquads?.find(row => text(row?.id) === squadId);
  if (!state || !enemy || !squadId || !squad || cargoEmpty(cargoToAdd)) return { ok:false, reason:"敵部隊が見つかりません" };
  const capacity = resolveV39EnemySquadCargoStatus(state, squad);
  const fitted = fitV39CargoToCapacity(cargoToAdd, capacity.remaining);
  if (cargoEmpty(fitted.accepted)) return { ok:false, reason:"運搬上限です", full:true, capacity, overflow:fitted.overflow };
  const enemySquads = state.enemySquads.map(squad => text(squad?.id) === squadId
    ? { ...squad, cargo:mergeV39Cargo(squad?.cargo, fitted.accepted) }
    : squad);
  window.setV39GameState?.({ enemySquads }, { reason:"enemy-cargo-added" });
  const acceptedLoad = Object.values(fitted.accepted.resourcesByType || {})
    .reduce((sum, amount) => sum + Math.max(0, number(amount)), 0)
    + (fitted.accepted.equipmentInventory || []).length;
  return {
    ok:true,
    squadId,
    accepted:fitted.accepted,
    overflow:fitted.overflow,
    capacity,
    full:acceptedLoad >= capacity.remaining
  };
}

export function depositV39PlayerCargo(playerId,movedUnitId="") {
  const source=window.getV39GameState?.(),result=depositV39FactionCargo(source,playerId,movedUnitId);
  if(result.state!==source)window.setV39GameState?.({players:result.state.players},{reason:'player-cargo-deposited'});
  for(const report of result.reports)window.appendV39ActivityLog?.(playerId,'物資',`拠点へ搬入: ${cargoSummary(report.deposited)}`,report);
  if(result.reports.length)window.dispatchEvent(new CustomEvent('v39:cargo-deposited',{detail:{side:'player',reports:result.reports}}));
  return result.reports;
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
  if (!state) return { ok:false, reason:'ゲームが開始されていません' };
  const result = recoverV39GroundLootState(state, playerId, unitId, key);
  if (!result.ok) return result;
  window.setV39GameState?.({ players:result.state.players, groundLootByTile:result.state.groundLootByTile }, { reason:"ground-loot-recovered" });
  const report = result.report;
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
  const squad = state.enemySquads.find(row => text(row?.id) === squadId);
  const capacity = resolveV39EnemySquadCargoStatus(state, squad);
  const fitted = fitV39CargoToCapacity(groundLoot.cargo, capacity.remaining);
  if (cargoEmpty(fitted.accepted)) return { ok:false, reason:"運搬上限です", full:true, capacity };
  const enemySquads = state.enemySquads.map(row => text(row?.id) === squadId
    ? { ...row, cargo:mergeV39Cargo(row?.cargo, fitted.accepted) }
    : row);
  const groundLootByTile = { ...state.groundLootByTile };
  if (cargoEmpty(fitted.overflow)) delete groundLootByTile[key];
  else groundLootByTile[key] = { ...groundLoot, cargo:fitted.overflow };
  window.setV39GameState?.({ enemySquads, groundLootByTile }, { reason:"ground-loot-recovered-by-enemy" });
  const report = { enemyId:text(enemy.id), squadId, key, recovered:fitted.accepted, remaining:fitted.overflow, capacity };
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
