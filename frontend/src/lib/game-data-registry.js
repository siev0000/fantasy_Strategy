const rawGameDataModules = import.meta.glob("../../../data/source/export/json/*.json", {
  eager: true,
  import: "default"
});

import {
  GAME_DATA_VALUE_RULES,
  getGameDataFieldUnit,
  hasGameDataValue,
  isValidGameDataNumber,
  normalizeEquipmentSlotValue,
  normalizeGameDataReference,
  parseGameDataNumber,
  readGameDataNumber
} from "./game-data-values.js";

export {
  GAME_DATA_VALUE_RULES,
  getGameDataFieldUnit,
  hasGameDataValue,
  isValidGameDataNumber,
  normalizeEquipmentSlotValue,
  normalizeGameDataReference,
  parseGameDataNumber,
  readGameDataNumber
};

function tableNameFromPath(path) {
  const normalized = String(path || "").replaceAll("\\", "/");
  const fileName = normalized.split("/").pop() || "";
  return fileName.replace(/\.json$/i, "");
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length;
  return value && typeof value === "object" ? 1 : 0;
}

const tableMap = new Map();
const sourcePathMap = new Map();

const TABLE_KEY_FIELDS = Object.freeze({
  クラス:["名前"], テストクラス:["名前"], スキル一覧:["名前"], テストスキル:["名前"], テストゲーム状態:["activePlayerId"],
  外交姿勢:["項目カテゴリ", "項目名"], 研究:["技術対象", "Lv", "項目名"], 効果:["追加効果"],
  災害:["カテゴリ名"], 施設:["施設名"], 種族:["key"], 種族幸福度仮:["名前"],
  出現敵:["出現地形", "種族名", "Lv_Min", "Lv_Max"], 消費量:["種別", "Lv"],
  勢力:["種族"], 説明:["技能名"], 組織:["項目名"], 装備:["装備名"],
  体制:["項目カテゴリ", "項目名"], 地形:["地形"], 都市:["項目名", "レア度"],
  都市基本データ:["データ分類", "分類", "詳細"], 範囲:["範囲タイプ"], 付与:["付与能力", "Lv"]
});

const REQUIRED_FIELDS = Object.freeze({
  クラス:["名前", "種類"], テストクラス:["名前", "種類", "テスト専用"], スキル一覧:["名前", "行動"], テストスキル:["名前", "行動", "テスト専用"], 装備:["装備名", "装備箇所"],
  地形:["地形"], 出現敵:["ID", "出現地形", "種族名"],
  研究:["ID", "項目名", "技術対象", "Lv", "必要ユニットLv"], 災害:["ID", "カテゴリ名", "効果"],
  種族:["key", "name", "className"], 種族幸福度仮:["名前"], 勢力:["種族", "カナ", "マーカー文字", "マーカー色"], 範囲:["範囲タイプ", "処理タイプ"]
});

export const GAME_DATA_TABLE_METADATA = Object.freeze({
  クラス:{ purpose:"種族・職業・敵クラスの能力、成長、装備、取得スキル", status:"connected" },
  テストクラス:{ purpose:"テストモード専用キャラクターの能力と取得スキル", status:"test-only" },
  スキル一覧:{ purpose:"行動A、攻撃、回復、補助効果、射程、時間", status:"connected" },
  テストスキル:{ purpose:"テストモード専用の戦闘・死亡・蘇生などの動作確認スキル", status:"test-only" },
  テストゲーム状態:{ purpose:"ローカル確認用プレイヤー・部隊・配置", status:"connected" },
  外交姿勢:{ purpose:"国家の外交姿勢選択と補正", status:"connected" },
  研究:{ purpose:"研究ツリー、条件、進行", status:"connected" },
  効果:{ purpose:"スキル追加効果名の説明辞書", status:"definition-only" },
  災害:{ purpose:"災害種類と効果説明。数値列追加待ち", status:"definition-only" },
  施設:{ purpose:"建設条件、費用、時間、範囲、都市・土地効果", status:"connected" },
  種族:{ purpose:"種族選択肢と表示情報", status:"connected" },
  種族幸福度仮:{ purpose:"クラス.jsonへ幸福度係数を追加するまでの種族別幸福度フォールバック", status:"provisional" },
  出現敵:{ purpose:"地形別の敵、レベル、装備、個体数", status:"connected" },
  消費量:{ purpose:"装備生成、レア度変更、付与の資材費", status:"connected" },
  勢力:{ purpose:"勢力種族の初期人口、土地傾向、国家基礎値", status:"connected" },
  説明:{ purpose:"技能・能力の表示説明", status:"connected" },
  組織:{ purpose:"国家組織の選択肢と補正", status:"connected" },
  装備:{ purpose:"装備性能、スロット、素材倍率、特性", status:"connected" },
  体制:{ purpose:"国家体制の選択肢と補正", status:"connected" },
  地形:{ purpose:"地形性能、産出、危険度、能力補正、探索資源", status:"connected" },
  都市:{ purpose:"都市特性候補。仮条件・仮効果の確定待ち", status:"provisional" },
  都市基本データ:{ purpose:"都市項目の分類・説明・対応技能", status:"definition-only" },
  範囲:{ purpose:"スキル範囲名と対象抽出処理タイプ", status:"connected" },
  付与:{ purpose:"装備付与、条件、費用、能力・耐性・攻撃属性", status:"connected" }
});

const asText = value => String(value ?? "").trim();

function isHeaderRecord(name, row) {
  if (!row || typeof row !== "object") return true;
  const fields = TABLE_KEY_FIELDS[name] || [];
  if (!fields.length) return false;
  if (fields.some(field => asText(row[field]) === field)) return true;
  if (name === "出現敵" && Number(row?.出現地形) === 1 && Number(row?.種族名) === 2) return true;
  return name === "災害" && asText(row.カテゴリ名) === "災害種別";
}

function getLegacyGameDataRecordId(name, row) {
  const tableName = asText(name).replace(/\.json$/i, "");
  if (isHeaderRecord(tableName, row)) return "";
  const fields = TABLE_KEY_FIELDS[tableName];
  if (!fields?.length) return "";
  const values = fields.map(field => asText(row?.[field]));
  return values.some(Boolean) ? `${tableName}:${values.join(":")}` : "";
}

export function getGameDataRecordId(name, row) {
  const tableName = asText(name).replace(/\.json$/i, "");
  if (isHeaderRecord(tableName, row)) return "";
  return asText(row?.ID ?? row?.id) || getLegacyGameDataRecordId(tableName, row);
}

for (const [path, data] of Object.entries(rawGameDataModules)) {
  const name = tableNameFromPath(path);
  if (!name) continue;
  if (tableMap.has(name)) {
    throw new Error(`[ゲームデータ] JSON名が重複しています: ${name}`);
  }
  tableMap.set(name, data);
  sourcePathMap.set(name, path);
}

export function hasGameDataTable(name) {
  return tableMap.has(String(name || "").replace(/\.json$/i, ""));
}

export function getGameDataTable(name, fallback = null) {
  const normalizedName = String(name || "").replace(/\.json$/i, "");
  return tableMap.has(normalizedName) ? tableMap.get(normalizedName) : fallback;
}

export function getGameDataRows(name) {
  const value = getGameDataTable(name, []);
  return Array.isArray(value) ? value : [];
}

export function findGameDataRow(name, field, value) {
  const expected = String(value ?? "").trim();
  return getGameDataRows(name).find(row => String(row?.[field] ?? "").trim() === expected) || null;
}

export function findGameDataRowById(name, recordId) {
  const expected = asText(recordId);
  return getGameDataRows(name).find(row => getGameDataRecordId(name, row) === expected
    || getLegacyGameDataRecordId(name, row) === expected) || null;
}

function validateReference(issues, sourceTable, rowId, field, targetTable, targetField, value) {
  const reference = asText(value);
  if (!reference || reference === "-" || reference === "なし" || reference === "0") return;
  if (!getGameDataRows(targetTable).some(row => asText(row?.[targetField]) === reference)) {
    issues.push({ level:"warning", type:"missing-reference", table:sourceTable, recordId:rowId, field, value:reference, targetTable });
  }
}

function validateSkillReference(issues, sourceTable, rowId, field, value) {
  const reference = asText(value);
  if (!reference || reference === "-" || reference === "なし" || reference === "0") return;
  const isKnownSkill = [...getGameDataRows("スキル一覧"), ...getGameDataRows("テストスキル")].some(row => asText(row?.名前) === reference);
  const isKnownAbility = getGameDataRows("説明").some(row => asText(row?.技能名) === reference);
  const isClassTransition = getGameDataRows("クラス").some(row => asText(row?.名前) === reference);
  if (!isKnownSkill && !isKnownAbility && !isClassTransition) {
    issues.push({ level:"warning", type:"missing-reference", table:sourceTable, recordId:rowId, field, value:reference, targetTable:"スキル一覧/説明" });
  }
}

export function validateGameDataRegistry() {
  const issues = [];
  const idsByTable = {};
  for (const table of listGameDataTables()) {
    const seen = new Set();
    idsByTable[table.name] = [];
    for (const row of getGameDataRows(table.name)) {
      if (isHeaderRecord(table.name, row)) continue;
      const id = getGameDataRecordId(table.name, row);
      if (!id) issues.push({ level:"error", type:"missing-id", table:table.name, recordId:"", field:(TABLE_KEY_FIELDS[table.name] || []).join("+") });
      else if (seen.has(id)) issues.push({ level:"error", type:"duplicate-id", table:table.name, recordId:id });
      else { seen.add(id); idsByTable[table.name].push(id); }
      for (const field of REQUIRED_FIELDS[table.name] || []) {
        if (!asText(row?.[field])) issues.push({ level:"warning", type:"missing-required", table:table.name, recordId:id, field });
      }
      if (["クラス", "テストクラス"].includes(table.name)) for (let index = 1; index <= 10; index += 1) validateSkillReference(issues, table.name, id, `Skill${index}`, row?.[`Skill${index}`]);
      if (table.name === "出現敵") {
        validateReference(issues, table.name, id, "種族", "クラス", "名前", row?.種族);
        validateReference(issues, table.name, id, "サブクラス", "クラス", "名前", row?.サブクラス);
        for (const field of ["武器", "副武器", "胴", "頭", "足", "装飾1", "装飾2"]) validateReference(issues, table.name, id, field, "装備", "装備名", row?.[field]);
      }
      if (["スキル一覧", "テストスキル"].includes(table.name)) validateReference(issues, table.name, id, "範囲", "範囲", "範囲タイプ", row?.範囲);
      if (table.name === "範囲" && !["single", "line", "fan", "circle", "around", "front", "all"].includes(asText(row?.処理タイプ))) {
        issues.push({ level:"error", type:"invalid-handler", table:table.name, recordId:id, field:"処理タイプ", value:asText(row?.処理タイプ) });
      }
      if (table.name === "付与") {
        validateSkillReference(issues, table.name, id, "獲得スキル", row?.獲得スキル);
        validateReference(issues, table.name, id, "範囲", "範囲", "範囲タイプ", row?.範囲);
      }
    }
  }
  return {
    valid:!issues.some(issue => issue.level === "error"),
    errorCount:issues.filter(issue => issue.level === "error").length,
    warningCount:issues.filter(issue => issue.level === "warning").length,
    issues,
    idsByTable
  };
}

export function listGameDataTables() {
  return [...tableMap.entries()]
    .map(([name, data]) => ({
      name,
      sourcePath: sourcePathMap.get(name) || "",
      type: Array.isArray(data) ? "array" : "object",
      recordCount: recordCount(data),
      purpose:GAME_DATA_TABLE_METADATA[name]?.purpose || "用途未登録",
      status:GAME_DATA_TABLE_METADATA[name]?.status || "unclassified"
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function getGameDataRegistryStatus() {
  const tables = listGameDataTables();
  return {
    tableCount: tables.length,
    recordCount: tables.reduce((sum, table) => sum + table.recordCount, 0),
    tables
  };
}

export const classData = getGameDataRows("クラス");
export const testClassData = getGameDataRows("テストクラス");
export const skillData = getGameDataRows("スキル一覧");
export const testSkillData = getGameDataRows("テストスキル");
export const testGameData = getGameDataTable("テストゲーム状態", {});
export const diplomacyStanceData = getGameDataRows("外交姿勢");
export const researchData = getGameDataRows("研究");
export const effectData = getGameDataRows("効果");
export const disasterData = getGameDataRows("災害");
export const facilityData = getGameDataRows("施設");
export const raceData = getGameDataRows("種族");
export const enemySpawnData = getGameDataRows("出現敵");
export const consumptionData = getGameDataRows("消費量");
export const factionData = getGameDataRows("勢力");
export const descriptionData = getGameDataRows("説明");
export const organizationData = getGameDataRows("組織");
export const equipmentData = getGameDataRows("装備");
export const governmentData = getGameDataRows("体制");
export const terrainData = getGameDataRows("地形");
export const cityData = getGameDataRows("都市");
export const cityBaseData = getGameDataRows("都市基本データ");
export const rangeData = getGameDataRows("範囲");
export const enchantmentData = getGameDataRows("付与");

if (typeof window !== "undefined") {
  window.getGameDataTable = getGameDataTable;
  window.getGameDataRows = getGameDataRows;
  window.getGameDataRegistryStatus = getGameDataRegistryStatus;
  window.getGameDataRecordId = getGameDataRecordId;
  window.findGameDataRowById = findGameDataRowById;
  window.validateGameDataRegistry = validateGameDataRegistry;
  window.getGameDataFieldUnit = getGameDataFieldUnit;
  window.normalizeGameDataReference = normalizeGameDataReference;
  window.normalizeEquipmentSlotValue = normalizeEquipmentSlotValue;
  window.parseGameDataNumber = parseGameDataNumber;
  const validation = validateGameDataRegistry();
  window.__gameDataValidation = validation;
  if (!validation.valid) console.error("[ゲームデータ検証]", validation);
  else if (validation.warningCount) console.warn(`[ゲームデータ検証] 警告 ${validation.warningCount}件`, validation.issues);
}
