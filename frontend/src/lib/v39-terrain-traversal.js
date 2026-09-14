import { getGameDataRows, normalizeGameDataReference, readGameDataNumber } from "./game-data-registry.js";

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
  return inspectV39TerrainTraversal(unit, resolveV39TileTerrainName(mapData, x, y)).allowed;
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
  window.resolveV39TerrainTurnDamageRule = resolveV39TerrainTurnDamageRule;
}
