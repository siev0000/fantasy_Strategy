const ABSENT_REFERENCE_TOKENS = new Set(["", "-", "なし", "0"]);

const UNIT_FIELDS = Object.freeze({
  seconds:new Set(["待機", "CT", "効果時間"]),
  turns:new Set(["建築時間", "所要ターン", "継続ターン"]),
  tiles:new Set(["射程", "炸裂", "範囲", "最大距離", "影響半径"]),
  ratio:new Set(["モンスター危険度", "台風", "竜巻", "吹雪", "噴火", "砂嵐", "洪水", "地震", "雷嵐", "ターンダメージ最大HP率"]),
  percentPoints:new Set([
    "Cr率", "Cr威力", "耐性", "ペナルティ", "幸福度", "環境安定度",
    "物理耐性", "魔法耐性", "精神耐性", "怯み耐性", "拘束耐性", "幻覚耐性",
    "炎耐性", "毒耐性", "氷耐性", "光耐性", "闇耐性", "雷耐性", "出血耐性",
    "切断耐性", "貫通耐性", "打撃耐性"
  ])
});

const UNIT_SUFFIXES = Object.freeze({
  seconds:new Set(["s", "秒", "t"]),
  turns:new Set(["t", "ターン"]),
  tiles:new Set(["マス"]),
  ratio:new Set([]),
  percentPoints:new Set(["%", "％"]),
  number:new Set([])
});

export function hasGameDataValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

export function normalizeGameDataReference(value) {
  const text = String(value ?? "").trim();
  return ABSENT_REFERENCE_TOKENS.has(text) ? null : text;
}

export function normalizeEquipmentSlotValue(value) {
  const text = String(value ?? "").trim();
  if (text === "×") return Object.freeze({ state:"prohibited", value:null });
  const reference = normalizeGameDataReference(text);
  return Object.freeze({ state:reference === null ? "empty" : "available", value:reference });
}

export function getGameDataFieldUnit(_tableName, fieldName) {
  const field = String(fieldName ?? "").trim();
  for (const [unit, fields] of Object.entries(UNIT_FIELDS)) {
    if (fields.has(field)) return unit;
  }
  if (/耐性$/.test(field)) return "percentPoints";
  if (/率$|確率$/.test(field)) return "percentPoints";
  if (/時間$/.test(field)) return "turns";
  if (/射程$|距離$|半径$/.test(field)) return "tiles";
  return "number";
}

function stripUnitSuffix(text, unit) {
  const suffixes = UNIT_SUFFIXES[unit] || UNIT_SUFFIXES.number;
  for (const suffix of suffixes) {
    if (suffix && text.endsWith(suffix)) return text.slice(0, -suffix.length).trim();
  }
  return text;
}

export function parseGameDataNumber(value, options = {}) {
  const fallback = Object.hasOwn(options, "fallback") ? options.fallback : null;
  if (!hasGameDataValue(value)) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const unit = options.unit || getGameDataFieldUnit(options.tableName, options.fieldName);
  const normalized = stripUnitSuffix(String(value).trim().replaceAll(",", ""), unit);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return fallback;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

export function readGameDataNumber(row, tableName, fieldName, fallback = null) {
  return parseGameDataNumber(row?.[fieldName], { tableName, fieldName, fallback });
}

export function isValidGameDataNumber(value, options = {}) {
  if (!hasGameDataValue(value)) return true;
  return !Number.isNaN(parseGameDataNumber(value, { ...options, fallback:Number.NaN }));
}

export const GAME_DATA_VALUE_RULES = Object.freeze({
  absentReferenceTokens:Object.freeze([...ABSENT_REFERENCE_TOKENS]),
  prohibitedEquipmentToken:"×"
});
