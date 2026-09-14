import { findGameDataRow } from "./game-data-registry.js";

export const TERRAIN_STATUS_FIELDS = Object.freeze([
  "HP", "MP", "ST", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ",
  "指揮", "威圧", "看破", "早業", "技術", "隠密", "索敵", "農業", "林業", "漁業",
  "工業", "統治", "交渉", "魔術", "信仰", "保有可能人数", "浄化", "穢れ", "回復"
]);

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function resolveV39TerrainNameAt(mapData, x, y) {
  const nx = Math.floor(Number(x));
  const ny = Math.floor(Number(y));
  if (!mapData?.grid || !Number.isFinite(nx) || !Number.isFinite(ny)) return "";
  if (mapData?.lavaMap?.[ny]?.[nx]) return "溶岩";
  return text(mapData?.specialMap?.[ny]?.[nx]) || text(mapData?.grid?.[ny]?.[nx]);
}

export function getV39TerrainModifiers(mapData, x, y) {
  const terrainName = resolveV39TerrainNameAt(mapData, x, y);
  const row = findGameDataRow("地形", "地形", terrainName);
  const modifiers = {};
  for (const key of TERRAIN_STATUS_FIELDS) {
    const value = number(row?.[key]);
    if (value !== 0) modifiers[key] = value;
  }
  return { terrainName, modifiers, source:row };
}

export function applyV39TerrainModifiers(unit, mapData = window.__v39FieldRuntime?.mapData) {
  if (!unit || typeof unit !== "object") return unit;
  const terrain = getV39TerrainModifiers(mapData, unit.x, unit.y);
  const status = { ...(unit.status || {}) };
  const skillLevels = { ...(unit.skillLevels || {}) };
  for (const [key, value] of Object.entries(terrain.modifiers)) {
    if (Object.prototype.hasOwnProperty.call(status, key) || ["HP", "MP", "ST", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"].includes(key)) {
      status[key] = number(status[key]) + value;
    } else {
      skillLevels[key] = number(skillLevels[key]) + value;
    }
  }
  return { ...unit, status, skillLevels, terrainModifiers:terrain.modifiers, terrainModifierSource:terrain.terrainName };
}

export function formatV39TerrainModifiers(mapData, x, y) {
  const terrain = getV39TerrainModifiers(mapData, x, y);
  const parts = Object.entries(terrain.modifiers).map(([key, value]) => `${key}${value > 0 ? "+" : ""}${value}`);
  return parts.length ? parts.join(" / ") : "なし";
}
