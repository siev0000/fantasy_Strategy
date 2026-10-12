import { findGameDataRow } from "./game-data-registry.js";
import { COMBAT_STATUS_FIELDS, SKILL_LEVEL_FIELDS } from "../constants/unitCommon.js";
import { resolveV39TerrainNameAt } from "./v39-terrain-location.js";
import { applyV39TerrainPassiveBonuses } from "./v39-passive-rules.js";
import { applyV39SquadSupport } from "./v39-squad-support.js";
export { resolveV39TerrainNameAt } from "./v39-terrain-location.js";

export const TERRAIN_STATUS_FIELDS = Object.freeze([
  ...COMBAT_STATUS_FIELDS,
  ...SKILL_LEVEL_FIELDS,
  "保有可能人数", "浄化", "穢れ", "回復"
]);

const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;

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

export function applyV39TerrainModifiers(unit, mapData = globalThis.window?.__v39FieldRuntime?.mapData) {
  if (!unit || typeof unit !== "object") return unit;
  unit=applyV39SquadSupport(unit);
  const terrain = getV39TerrainModifiers(mapData, unit.x, unit.y);
  // 再評価や移動時は前回の現在地補正だけ戻し、恒久能力は変更しない。
  const base={...unit,passiveContextSkillNames:[]};
  for (const bucket of ["status","skillLevels","resistances"]) {
    base[bucket]={...(unit[bucket]||{})};
    for (const [key,value] of Object.entries(unit.terrainAdjustmentDeltas?.[bucket]||{})) {
      base[bucket][key]=number(base[bucket][key])-value;
      if (base[bucket][key]===0 && unit.terrainAdjustmentAddedKeys?.[bucket]?.includes(key)) delete base[bucket][key];
    }
  }
  const status = { ...base.status };
  const skillLevels = { ...base.skillLevels };
  for (const [key, value] of Object.entries(terrain.modifiers)) {
    if (Object.prototype.hasOwnProperty.call(status, key) || ["HP", "MP", "ST", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"].includes(key)) {
      status[key] = number(status[key]) + value;
    } else {
      skillLevels[key] = number(skillLevels[key]) + value;
    }
  }
  const adjusted=applyV39TerrainPassiveBonuses({...base,status,skillLevels},terrain.terrainName);
  const terrainAdjustmentDeltas={};
  const terrainAdjustmentAddedKeys={};
  for (const bucket of ["status","skillLevels","resistances"]) {
    terrainAdjustmentAddedKeys[bucket]=Object.keys(adjusted[bucket]).filter(key=>!Object.hasOwn(base[bucket],key));
    terrainAdjustmentDeltas[bucket]=Object.fromEntries(Object.keys(adjusted[bucket]).map(key=>[
      key,number(adjusted[bucket][key])-number(base[bucket][key])
    ]).filter(([,value])=>value!==0));
  }
  return {...adjusted,terrainAdjustmentDeltas,terrainAdjustmentAddedKeys,terrainModifiers:terrain.modifiers,terrainModifierSource:terrain.terrainName};
}

export function formatV39TerrainModifiers(mapData, x, y) {
  const terrain = getV39TerrainModifiers(mapData, x, y);
  const parts = Object.entries(terrain.modifiers).map(([key, value]) => `${key}${value > 0 ? "+" : ""}${value}`);
  return parts.length ? parts.join(" / ") : "なし";
}

if (typeof window !== "undefined") {
  window.getV39TerrainModifiers = getV39TerrainModifiers;
  window.applyV39TerrainModifiers = applyV39TerrainModifiers;
}
