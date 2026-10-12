import { cityBaseData, researchData as researchDbRaw } from "./game-data-registry.js";

const RESEARCH_TARGET_ORDER = [...new Set(researchDbRaw
  .map(row => String(row?.技術対象 ?? "").trim())
  .filter(target => target && target !== "技術対象"))];
export const RESEARCH_CATEGORY_ORDER = Object.freeze(RESEARCH_TARGET_ORDER.map(target => `${target}Lv`));

const RESEARCH_CATEGORY_VISUAL_PRESETS = Object.freeze({
  鍛冶:Object.freeze({ icon:"⚒", accent:"#d9b56b" }),
  魔法:Object.freeze({ icon:"✦", accent:"#a980de" }),
  信仰:Object.freeze({ icon:"✚", accent:"#e9de8b" }),
  軍事:Object.freeze({ icon:"⚔", accent:"#cf705e" }),
  経済:Object.freeze({ icon:"◆", accent:"#79c88f" }),
  調査:Object.freeze({ icon:"⌕", accent:"#70b7c6" }),
  地質調査:Object.freeze({ icon:"⛏", accent:"#d9b56b" }),
  生態調査:Object.freeze({ icon:"♧", accent:"#79c88f" }),
  地下探索:Object.freeze({ icon:"⌕", accent:"#70b7c6" })
});
const DEFAULT_RESEARCH_CATEGORY_VISUAL = Object.freeze({ icon:"◆", accent:"#70b7c6" });

export const RESEARCH_CATEGORY_META = Object.freeze(Object.fromEntries(
  RESEARCH_CATEGORY_ORDER.map(categoryKey => {
    const label = String(categoryKey || "研究").replace(/Lv$/, "");
    const visual = RESEARCH_CATEGORY_VISUAL_PRESETS[label] || DEFAULT_RESEARCH_CATEGORY_VISUAL;
    return [categoryKey, Object.freeze({ label, icon:visual.icon, accent:visual.accent })];
  })
));

export function getResearchCategoryMeta(categoryKey) {
  const key = String(categoryKey || "").trim();
  return RESEARCH_CATEGORY_META[key] || Object.freeze({
    label:String(key || "研究").replace(/Lv$/, ""),
    icon:DEFAULT_RESEARCH_CATEGORY_VISUAL.icon,
    accent:DEFAULT_RESEARCH_CATEGORY_VISUAL.accent
  });
}

const RESEARCH_LEVEL_RECOMMENDATION_MAP = new Map();
for (const row of researchDbRaw) {
  const level = Number(row?.Lv);
  if (!Number.isInteger(level) || level <= 0) continue;
  const recommendation = Math.max(0, Number(row?.推奨ユニットLv ?? row?.必要ユニットLv) || 0);
  RESEARCH_LEVEL_RECOMMENDATION_MAP.set(level,
    Math.max(RESEARCH_LEVEL_RECOMMENDATION_MAP.get(level) || 0, recommendation));
}
export const RESEARCH_LEVEL_UNIT_RECOMMENDATIONS = Object.freeze(Object.fromEntries(
  [...RESEARCH_LEVEL_RECOMMENDATION_MAP.entries()].sort((a, b) => a[0] - b[0])
));
export const RESEARCH_TIME_REDUCTION_SKILL_BY_CATEGORY = Object.freeze(Object.fromEntries(
  cityBaseData
    .filter(row => String(row?.分類 ?? "").trim() === "研究Lv")
    .map(row => [String(row?.データ分類 ?? "").trim(), String(row?.対応技能 ?? "").trim()])
    .filter(([category, skill]) => RESEARCH_CATEGORY_ORDER.includes(category) && skill)
));
const RESEARCH_CATEGORIES_WITHOUT_REDUCTION_SKILL = RESEARCH_CATEGORY_ORDER
  .filter(category => !RESEARCH_TIME_REDUCTION_SKILL_BY_CATEGORY[category]);
if (RESEARCH_CATEGORIES_WITHOUT_REDUCTION_SKILL.length) {
  throw new Error(`[ゲームデータ] 都市基本データ.json: 研究Lvの対応技能がありません (${RESEARCH_CATEGORIES_WITHOUT_REDUCTION_SKILL.join("、")})`);
}

const RESEARCH_CATEGORY_ALIAS = Object.freeze({
  ...Object.fromEntries(RESEARCH_TARGET_ORDER.flatMap(target => [[target, `${target}Lv`], [`${target}Lv`, `${target}Lv`]])),
  // 発見条件と旧セーブでは統合前の枝名を引き続き使う。
  地質調査:"地質調査Lv",
  生態調査:"生態調査Lv",
  地下探索:"地下探索Lv",
  鍛冶場:"鍛冶Lv"
});

const RESEARCH_ROW_NAME_FIELDS = ["項目名", "name", "名称"];
const RESEARCH_ROW_TARGET_FIELDS = ["技術対象", "カテゴリ", "category", "target"];
const RESEARCH_ROW_LEVEL_FIELDS = ["Lv", "level", "tier"];
const RESEARCH_ROW_DESC_FIELDS = ["詳細", "desc", "説明"];

function asText(value) {
  return String(value ?? "").trim();
}

function toSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sortCategoryKeys(keys = []) {
  const unique = Array.from(new Set((Array.isArray(keys) ? keys : []).map(asText).filter(Boolean)));
  const ordered = [];
  const rest = [];
  for (const key of unique) {
    if (RESEARCH_CATEGORY_ORDER.includes(key)) {
      ordered.push(key);
    } else {
      rest.push(key);
    }
  }
  ordered.sort((a, b) => RESEARCH_CATEGORY_ORDER.indexOf(a) - RESEARCH_CATEGORY_ORDER.indexOf(b));
  rest.sort((a, b) => a.localeCompare(b, "ja"));
  return [...ordered, ...rest];
}

function readFirstTextField(row, fieldNames = []) {
  if (!row || typeof row !== "object") return "";
  for (const key of fieldNames) {
    const text = asText(row[key]);
    if (text) return text;
  }
  return "";
}

function readLevelField(row) {
  if (!row || typeof row !== "object") return 0;
  for (const key of RESEARCH_ROW_LEVEL_FIELDS) {
    const value = row[key];
    if (value === null || value === undefined || value === "") continue;
    const num = Math.floor(toSafeNumber(value, 0));
    if (num > 0) return num;
  }
  return 0;
}

function pickResearchRowCore(row) {
  const name = readFirstTextField(row, RESEARCH_ROW_NAME_FIELDS);
  const target = normalizeResearchCategoryName(readFirstTextField(row, RESEARCH_ROW_TARGET_FIELDS));
  const level = readLevelField(row);
  const desc = readFirstTextField(row, RESEARCH_ROW_DESC_FIELDS) || "-";
  return { name, target, level, desc };
}

function isInvalidHeaderRow(core) {
  if (!core) return true;
  if (core.name === "項目名") return true;
  if (core.target === "技術対象") return true;
  if (core.level <= 0) return true;
  if (!core.name || !core.target) return true;
  return false;
}

function buildExtraDetailEntries(row) {
  if (!row || typeof row !== "object") return [];
  const excludedKeys = new Set(["必要研究Lv", "前提研究ID", "ID", "id", "項目名", "name", "名称", "技術対象", "カテゴリ", "category", "target", "Lv", "level", "tier", "必要ユニットLv", "推奨ユニットLv", "詳細", "desc", "説明"]);
  return Object.entries(row)
    .filter(([key, value]) => {
      if (excludedKeys.has(key)) return false;
      if (value === null || value === undefined || value === "") return false;
      return true;
    })
    .map(([key, value]) => ({
      key: asText(key),
      value: String(value)
    }));
}

function buildCategoriesFromRows(rows) {
  const byCategory = new Map();
  const source = Array.isArray(rows) ? rows : [];
  source.forEach(row => {
    if (!row || typeof row !== "object") return;
    const core = pickResearchRowCore(row);
    if (isInvalidHeaderRow(core)) return;
    if (!byCategory.has(core.target)) {
      byCategory.set(core.target, {
        name: core.target,
        levelsMap: new Map()
      });
    }
    const cat = byCategory.get(core.target);
    if (!cat.levelsMap.has(core.level)) {
      cat.levelsMap.set(core.level, []);
    }
    const details = buildExtraDetailEntries(row);
    cat.levelsMap.get(core.level).push({
      id: asText(row.ID ?? row.id) || `${core.target}:${core.level}:${core.name}`,
      name: core.name,
      desc: core.desc,
      level: core.level,
      category: core.target,
      requiredResearchLevel:Math.max(1, Math.floor(Number(row.必要研究Lv ?? core.level) || 1)),
      prerequisiteIds:[...new Set(String(row.前提研究ID ?? "").split(/[、,\n]/u).map(asText).filter(Boolean))],
      // 原本の旧列名も読み取るが、研究の解禁条件ではなく速度の目安。
      recommendedUnitLevel: Math.max(0, Number(row.推奨ユニットLv ?? row.必要ユニットLv) || 0),
      details
    });
  });

  const categories = {};
  const sortedCategoryKeys = sortCategoryKeys(Array.from(byCategory.keys()));
  for (const key of sortedCategoryKeys) {
    const cat = byCategory.get(key);
    if (!cat) continue;
    const levels = Array.from(cat.levelsMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([level, items]) => ({
        level,
        items: items.slice().sort((x, y) => x.name.localeCompare(y.name, "ja"))
      }));
    categories[key] = {
      key,
      name: cat.name,
      levels
    };
  }
  // 不明ID・循環は起動失敗ではなく項目ごとの解禁エラーとして保持する。
  const items = Object.values(categories).flatMap(cat => cat.levels.flatMap(row => row.items));
  const byId = new Map(items.map(item => [item.id,item]));
  const cycle = (id, path = new Set()) => {
    if (path.has(id)) return true;
    const next=new Set(path); next.add(id);
    return (byId.get(id)?.prerequisiteIds || []).some(parent => byId.has(parent) && cycle(parent,next));
  };
  for (const item of items) {
    item.prerequisiteErrors = item.prerequisiteIds.filter(id=>!byId.has(id)).map(id=>`不明な前提研究ID: ${id}`);
    if (cycle(item.id)) item.prerequisiteErrors.push("前提研究が循環しています");
  }
  return categories;
}

export function normalizeResearchCategoryName(value) {
  const text = asText(value);
  return RESEARCH_CATEGORY_ALIAS[text] || text;
}

export function resolveResearchTreeData(raw = researchDbRaw) {
  const categories = buildCategoriesFromRows(raw);
  const allLevels = Object.values(categories)
    .flatMap(cat => cat.levels.map(row => row.level));
  const maxImplementedLevel = allLevels.length ? Math.max(...allLevels) : 0;
  return {
    maxImplementedLevel,
    maxDefinedLevel: maxImplementedLevel,
    recommendedUnitLevels: { ...RESEARCH_LEVEL_UNIT_RECOMMENDATIONS },
    timeReductionSkills: { ...RESEARCH_TIME_REDUCTION_SKILL_BY_CATEGORY },
    categories
  };
}

export function resolveResearchCategoryList(requested = [], categoriesMap = {}) {
  const availableKeys = Object.keys(categoriesMap || {});
  const source = Array.isArray(requested) && requested.length ? requested : availableKeys;
  const normalized = source.map(normalizeResearchCategoryName).filter(Boolean);
  return sortCategoryKeys(normalized).filter(key => availableKeys.includes(key));
}

export const researchTreeData = resolveResearchTreeData(researchDbRaw);
