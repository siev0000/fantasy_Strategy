import researchDbRaw from "../../../data/source/export/json/研究.json";

export const RESEARCH_CATEGORY_ORDER = ["鍛冶Lv", "魔法Lv", "信仰Lv", "軍事Lv", "経済Lv"];

export const RESEARCH_LEVEL_UNIT_REQUIREMENTS = {
  1: 5,
  2: 15,
  3: 25,
  4: 35,
  5: 45,
  6: 55,
  7: 65
};

export const RESEARCH_TIME_REDUCTION_SKILL_BY_CATEGORY = {
  鍛冶Lv: "工業",
  魔法Lv: "魔法技術",
  信仰Lv: "信仰",
  軍事Lv: "指揮",
  経済Lv: "統治"
};

const RESEARCH_CATEGORY_ALIAS = {
  鍛冶: "鍛冶Lv",
  鍛冶場: "鍛冶Lv",
  鍛冶Lv: "鍛冶Lv",
  魔法: "魔法Lv",
  魔法Lv: "魔法Lv",
  信仰: "信仰Lv",
  信仰Lv: "信仰Lv",
  軍事: "軍事Lv",
  軍事Lv: "軍事Lv",
  経済: "経済Lv",
  経済Lv: "経済Lv"
};

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
  const excludedKeys = new Set(["項目名", "name", "名称", "技術対象", "カテゴリ", "category", "target", "Lv", "level", "tier", "詳細", "desc", "説明"]);
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
  source.forEach((row, index) => {
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
      id: `${core.target}:${core.level}:${index}:${core.name}`,
      name: core.name,
      desc: core.desc,
      level: core.level,
      category: core.target,
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
    maxDefinedLevel: 7,
    levelRequirements: { ...RESEARCH_LEVEL_UNIT_REQUIREMENTS },
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
