import { V39_CORPSE_EATING_BALANCE } from "./v39-gameplay-balance.js";
import { getHexDistance } from "./hex-grid.js";

export function canV39UnitEatCorpses(unit, classRows = []) {
  if (typeof unit?.canEatCorpse === "boolean") return unit.canEatCorpse;
  const race = String(unit?.race || unit?.className || "").trim();
  const row = classRows.find(row => row.名前 === race);
  const value = row?.死体食;
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    return [true, 1, "1", "true", "○", "可", "可能"].includes(value);
  }
  return V39_CORPSE_EATING_BALANCE.fallbackRaces.includes(race);
}

export function v39GroundCorpseAmount(loot) {
  return Math.max(0, Number((loot?.cargo || loot)?.resourcesByType?.死体) || 0);
}

// 食べる対象は落とし物の死体資源だけ。死亡キャラや回収済みの死体は参照しない。
export function consumeV39GroundCorpse(state, enemyId, tileKey, turn) {
  const enemy = state.enemies?.find(unit => unit.id === enemyId);
  const [x, y] = String(tileKey).split(",").map(Number);
  const amount = V39_CORPSE_EATING_BALANCE.resourceAmount, cost = V39_CORPSE_EATING_BALANCE.apCost;
  const current = state.groundLootByTile?.[tileKey];
  if (!enemy || enemy.state === "死亡" || Number(enemy.hp ?? enemy.currentHp) <= 0
    || (enemy.worldId || "surface") !== (state.activeWorldId || "surface")
    || ![x, y].every(Number.isInteger) || getHexDistance(enemy, {x,y}) > 1
    || Number(enemy.ap) < cost || v39GroundCorpseAmount(current) < amount
    || enemy.lastCorpseMealTurn >= turn) return null;
  const cargo = current.cargo || current;
  const resourcesByType = { ...cargo.resourcesByType, 死体:v39GroundCorpseAmount(current) - amount };
  if (resourcesByType.死体 <= 0) delete resourcesByType.死体;
  const ap = Number(enemy.ap) - cost;
  return { enemies:state.enemies.map(unit => unit.id === enemyId
    ? {...unit, ap, currentAp:ap, actionPoint:ap, lastCorpseMealTurn:turn} : unit),
    groundLootByTile:{...state.groundLootByTile, [tileKey]:{...current, cargo:{...cargo, resourcesByType}}} };
}
