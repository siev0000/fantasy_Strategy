import { getGameDataRows, normalizeGameDataReference, readGameDataNumber } from "./game-data-registry.js";
import { resolveV39BaseMoveApCost, V39_SQUAD_MOVEMENT_BALANCE } from "./v39-gameplay-balance.js";

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const terrainByName = new Map(getGameDataRows("地形")
  .map(row => [text(row?.地形), row])
  .filter(([name]) => name));

function unitNamedCapabilities(unit) {
  return new Set([unit?.acquiredSkillNames, unit?.abilities, unit?.traits]
    .flat()
    .map(value => text(value?.name ?? value?.名前 ?? value))
    .filter(Boolean));
}

export function resolveV39UnitCapabilityValue(unit, capabilityName) {
  const key = text(capabilityName);
  if (!key) return 0;
  if (unitNamedCapabilities(unit).has(key)) return Number.POSITIVE_INFINITY;
  return Math.max(
    number(unit?.[key]),
    number(unit?.status?.[key]),
    number(unit?.skillLevels?.[key]),
    number(unit?.resistances?.[key])
  );
}

function parseCondition(value) {
  const source = text(value);
  const match = source.match(/^(.+?):\s*(-?\d+(?:\.\d+)?)$/u);
  return {
    name:text(match?.[1] ?? source),
    minimum:match ? number(match[2]) : 1
  };
}

export function inspectV39TerrainTraversal(unit, terrainName) {
  const name = text(terrainName);
  const row = terrainByName.get(name) || null;
  const rawCondition = normalizeGameDataReference(row?.移動条件);
  if (!row || !rawCondition) return { allowed:true, terrainName:name, conditions:[], matchedCondition:"" };
  const conditions = rawCondition.split("|").map(parseCondition).filter(condition => condition.name);
  const matched = conditions.find(condition => resolveV39UnitCapabilityValue(unit, condition.name) >= condition.minimum);
  return {
    allowed:!!matched,
    terrainName:name,
    conditions,
    matchedCondition:matched?.name || ""
  };
}

export function resolveV39TileTerrainName(mapData, x, y) {
  if (mapData?.lavaMap?.[y]?.[x]) return "溶岩";
  const special = text(mapData?.specialMap?.[y]?.[x]);
  return terrainByName.has(special) ? special : text(mapData?.grid?.[y]?.[x]);
}

export function canUnitEnterV39Tile(mapData, x, y, unit) {
  if (mapData?.isUnderground && mapData.grid?.[y]?.[x] !== "洞窟") return false;
  return inspectV39TerrainTraversal(unit, resolveV39TileTerrainName(mapData, x, y)).allowed;
}

// 移動値は旧データの表記揺れも受ける。AIとプレイヤー操作で同じAP計算を使う。
export function resolveV39UnitMovementValue(unit) {
  const candidates = [unit?.status?.移動, unit?.移動, unit?.movement, unit?.moveRange, unit?.move];
  for (const value of candidates) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(1, Math.floor(parsed));
  }
  return V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile;
}

function resolveV39UnitFlightValue(unit) {
  const candidates = [unit?.status?.飛行, unit?.飛行, unit?.skillLevels?.飛行];
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.floor(parsed));
  }
  return 0;
}

// 1ヘックス移動の共通AP。高低差、飛行、地形移動コストをここで一元判定する。
export function resolveV39UnitMovementStepCost(mapData, fromX, fromY, toX, toY, unit = null) {
  const fromXValue = Math.floor(Number(fromX));
  const fromYValue = Math.floor(Number(fromY));
  const toXValue = Math.floor(Number(toX));
  const toYValue = Math.floor(Number(toY));
  if (![fromXValue, fromYValue, toXValue, toYValue].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  if (fromXValue === toXValue && fromYValue === toYValue) return 0;
  if (!canUnitEnterV39Tile(mapData, toXValue, toYValue, unit)) return Number.POSITIVE_INFINITY;

  const fromLevel = Number(mapData?.heightLevelMap?.[fromYValue]?.[fromXValue]);
  const toLevel = Number(mapData?.heightLevelMap?.[toYValue]?.[toXValue]);
  const hasHeight = Number.isFinite(fromLevel) && Number.isFinite(toLevel);
  const absDiff = hasHeight ? Math.abs(toLevel - fromLevel) : 0;
  const climbDiff = hasHeight ? Math.max(0, toLevel - fromLevel) : 0;
  const flightValue = resolveV39UnitFlightValue(unit);
  if (absDiff > 1 && flightValue <= 0) return Number.POSITIVE_INFINITY;

  const heightPenaltyPoints = Math.max(0, (climbDiff * 25) - (Math.floor(flightValue / 30) * 25));
  const terrain = resolveV39TerrainMoveCost(unit, resolveV39TileTerrainName(mapData, toXValue, toYValue), heightPenaltyPoints);
  return Math.max(0, Math.ceil(terrain.multiplier * resolveV39BaseMoveApCost(resolveV39UnitMovementValue(unit))));
}

export function resolveV39TerrainMoveCost(unit, terrainName, additionalPenaltyPoints = 0) {
  const name = text(terrainName);
  const row = terrainByName.get(name) || null;
  const rawCost = Math.max(1, number(row?.移動コスト) || 1);
  const terrainPercent = 100 + Math.max(0, rawCost - 1) * 50;
  const extraPenaltyPoints = Math.max(0, number(additionalPenaltyPoints));
  const basePercent = terrainPercent + extraPenaltyPoints;
  const quickness = Math.max(
    0,
    number(unit?.早業),
    number(unit?.status?.早業),
    number(unit?.skillLevels?.早業)
  );
  const reductionPoints = quickness * 0.5;
  const finalPercent = Math.max(100, basePercent - reductionPoints);
  return {
    terrainName:name,
    rawCost,
    terrainPercent,
    extraPenaltyPoints,
    basePercent,
    quickness,
    reductionPoints,
    finalPercent,
    multiplier:finalPercent / 100
  };
}

export function resolveV39TerrainTurnDamageRule(terrainName) {
  const name = text(terrainName);
  const row = terrainByName.get(name) || null;
  const maxHpRate = Math.max(0, readGameDataNumber(row, "地形", "ターンダメージ最大HP率", 0));
  const resistanceName = normalizeGameDataReference(row?.ターンダメージ耐性);
  return { terrainName:name, maxHpRate, resistanceName };
}

if (typeof window !== "undefined") {
  window.inspectV39TerrainTraversal = inspectV39TerrainTraversal;
  window.canUnitEnterV39Tile = canUnitEnterV39Tile;
  window.resolveV39TerrainMoveCost = resolveV39TerrainMoveCost;
  window.resolveV39TerrainTurnDamageRule = resolveV39TerrainTurnDamageRule;
}
