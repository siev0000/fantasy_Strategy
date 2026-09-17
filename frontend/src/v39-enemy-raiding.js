import { resolveAttackApCost, resolveAttackPower } from "./lib/v39-combat-engine.js";
import { collectV39TerritoryTileIncome, FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS } from "./lib/v39-economy-rules.js";
import { resolveV39ConsumableFoodKeys } from "./lib/v39-population-economy.js";
import { normalizeTerritoryStateRecord } from "./lib/settlement-state.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const coordKey = value => `${integer(value?.x)},${integer(value?.y)}`;

function threeTurnFoodIncome(state, enemy, key) {
  const ownerId = text(state?.territoryOwnerByTile?.[key]);
  const income = collectV39TerritoryTileIncome(state, ownerId, key);
  const allowed = new Set(resolveV39ConsumableFoodKeys(enemy?.race, FOOD_RESOURCE_KEYS, NORMAL_FOOD_RESOURCE_KEYS));
  return Object.fromEntries(Object.entries(income.food || {})
    .map(([name, amount]) => [name, Math.round(Math.max(0, number(amount)) * 3 * 10) / 10])
    .filter(([name, amount]) => allowed.has(name) && amount > 0));
}

export function executeV39EnemyTerritoryRaid({ enemyId, tileKey, skillRow, turnNumber } = {}) {
  const state = window.getV39GameState?.();
  const enemy = state?.enemies?.find(row => text(row?.id) === text(enemyId));
  const key = text(tileKey || coordKey(enemy));
  const ownerId = text(state?.territoryOwnerByTile?.[key]);
  if (!state || !enemy || !ownerId) return { ok:false, reason:"略奪対象の領土がありません" };
  if (coordKey(enemy) !== key) return { ok:false, reason:"対象領土と同じマスにいません" };
  const territory = normalizeTerritoryStateRecord(state.territoryStateByTile?.[key]);
  if (territory.raided === true) return { ok:false, reason:"修復されるまで再略奪できません", completed:true };
  const apCost = resolveAttackApCost(skillRow);
  if (number(enemy?.ap, enemy?.currentAp) < apCost) return { ok:false, reason:"APが不足しています" };
  const damage = Math.max(1, resolveAttackPower(skillRow, enemy));
  const hpBefore = territory.hp;
  const hp = Math.max(0, hpBefore-damage);
  const completed = hp <= 0;
  const resourcesByType = completed ? threeTurnFoodIncome(state, enemy, key) : {};
  const territoryStateByTile = {
    ...state.territoryStateByTile,
    [key]:{
      ...territory,
      hp,
      ...(completed ? { raided:true, raidedAtTurn:Math.max(1, integer(turnNumber, state?.timeline?.turnNumber || 1)), raidedByNestId:text(enemy?.nestId) } : {})
    }
  };
  const enemies = state.enemies.map(row => text(row?.id) === text(enemy?.id) ? {
    ...row,
    ap:Math.max(0, number(row?.ap, row?.currentAp)-apCost),
    currentAp:Math.max(0, number(row?.ap, row?.currentAp)-apCost),
    actionPoint:Math.max(0, number(row?.ap, row?.currentAp)-apCost),
    ...(completed ? { explorationState:{ ...(row?.explorationState || {}), active:true, mode:"return" } } : {})
  } : row);
  window.setV39GameState?.({ enemies, territoryStateByTile }, { reason:completed ? "enemy-territory-raided" : "enemy-territory-attacked" });
  const cargoResult = completed && Object.keys(resourcesByType).length
    ? window.addV39CargoToEnemy?.(enemy.id, { resourcesByType, equipmentInventory:[] })
    : null;
  const detail = {
    enemyId:text(enemy.id), nestId:text(enemy?.nestId), ownerPlayerId:ownerId, key,
    skillName:text(skillRow?.名前), damage, hpBefore, hp, completed,
    plannedResources:resourcesByType,
    acquiredResources:cargoResult?.accepted?.resourcesByType || {},
    overflowResources:cargoResult?.overflow?.resourcesByType || {}
  };
  window.dispatchEvent(new CustomEvent("v39:territory-raided", { detail }));
  if (completed) window.appendV39ActivityLog?.(ownerId, "領土", `領土${key}が${text(enemy.name, enemy.id)}に略奪されました`, detail);
  return { ok:true, ...detail, cargoFull:cargoResult?.full === true || (cargoResult?.capacity?.remaining ?? 1) <= 0 };
}

window.executeV39EnemyTerritoryRaid = executeV39EnemyTerritoryRaid;
