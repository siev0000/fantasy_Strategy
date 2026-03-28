export const RACE_CLASS_NAME_MAP = Object.freeze({
  "只人": "ヒューマン",
  "エルフ": "エルフ",
  "オーガ": "オーガ",
  "ゴブリン": "ゴブリン",
  "竜人": "ドラゴニュート",
  "悪魔": "デヴィル",
  "天使": "エンジェル",
  "ヴァンパイア": "ヴァンパイア"
});

export const STATUS_FIELDS = Object.freeze(["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中", "SIZ"]);
export const STATUS_GROWTH_FIELDS = Object.freeze(["HP", "攻撃", "防御", "魔力", "精神", "速度", "命中"]);

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
  "怯み耐性",
  "出血耐性",
  "拘束耐性",
  "幻覚耐性",
  "Cr率耐性",
  "Cr威力耐性"
]);

export const EQUIPMENT_SLOT_KEYS = Object.freeze(["武器1", "武器2", "頭", "体", "足", "装飾1", "装飾2"]);
