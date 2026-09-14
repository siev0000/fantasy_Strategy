import { raceData } from "../lib/game-data-registry.js";

const raceClassEntries = raceData
  .map(row => [String(row?.key ?? "").trim(), String(row?.className ?? "").trim()])
  .filter(([race, className]) => race && className);
const racesWithoutClassName = raceData
  .filter(row => String(row?.key ?? "").trim() && !String(row?.className ?? "").trim())
  .map(row => String(row.key).trim());
if (racesWithoutClassName.length) {
  throw new Error(`[ゲームデータ] 種族.json: classNameがありません (${racesWithoutClassName.join("、")})`);
}
export const RACE_CLASS_NAME_MAP = Object.freeze(Object.fromEntries(raceClassEntries));

export const STATUS_FIELDS = Object.freeze(["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"]);
export const STATUS_GROWTH_FIELDS = Object.freeze(["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中"]);
export const COMBAT_STATUS_FIELDS = Object.freeze(["HP", "MP", "ST", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ", "Cr率", "Cr威力"]);
export const DAMAGE_TYPE_FIELDS = Object.freeze(["物理", "魔法", "射撃", "切断", "貫通", "打撃", "炎", "氷", "雷", "毒", "光", "闇"]);
export const SKILL_STATE_KEYS = Object.freeze(["精神", "盲目", "怯み", "出血", "拘束", "幻覚"]);

export const SKILL_FIELD_DEFS = Object.freeze([
  Object.freeze({ key: "指揮", label: "指揮" }),
  Object.freeze({ key: "威圧", label: "威圧" }),
  Object.freeze({ key: "看破", label: "看破" }),
  Object.freeze({ key: "早業", label: "早業" }),
  Object.freeze({ key: "技術", label: "技術" }),
  Object.freeze({ key: "隠密", label: "隠密" }),
  Object.freeze({ key: "索敵", label: "索敵" }),
  Object.freeze({ key: "農業", label: "農業" }),
  Object.freeze({ key: "林業", label: "林業" }),
  Object.freeze({ key: "漁業", label: "漁業" }),
  Object.freeze({ key: "工業", label: "工業" }),
  Object.freeze({ key: "統治", label: "統治" }),
  Object.freeze({ key: "交渉", label: "交渉" }),
  Object.freeze({ key: "魔術", label: "魔術", aliases: Object.freeze(["魔法技術"]) }),
  Object.freeze({ key: "信仰", label: "信仰" })
]);

export const SKILL_LEVEL_FIELDS = Object.freeze(SKILL_FIELD_DEFS.map(field => field.key));

export const RESISTANCE_FIELDS = Object.freeze([
  "物理耐性",
  "魔法耐性",
  "射撃耐性",
  "切断耐性",
  "貫通耐性",
  "打撃耐性",
  "炎耐性",
  "氷耐性",
  "雷耐性",
  "毒耐性",
  "光耐性",
  "闇耐性",
  "精神耐性",
  "盲目耐性",
  "怯み耐性",
  "出血耐性",
  "拘束耐性",
  "幻覚耐性",
  "Cr率耐性",
  "Cr威力耐性"
]);

export const EQUIPMENT_SLOT_KEYS = Object.freeze(["武器1", "武器2", "頭", "体", "足", "装飾1", "装飾2"]);

export const TIMED_EFFECT_FIELDS = Object.freeze([
  ...COMBAT_STATUS_FIELDS,
  ...SKILL_LEVEL_FIELDS,
  ...RESISTANCE_FIELDS
]);
