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
  鍛冶場: "鍛冶Lv",
  鍛冶: "鍛冶Lv",
  魔法: "魔法Lv",
  信仰: "信仰Lv",
  軍事: "軍事Lv",
  経済: "経済Lv"
};

const DEFAULT_RESEARCH_TREE_CATEGORIES = {
  鍛冶Lv: {
    name: "鍛冶Lv",
    rootSkill: {
      id: "smith_lv1",
      tier: 1,
      name: "鍛冶場解放",
      desc: "鍛冶場と基本装備作成を解放する。"
    },
    branches: [
      {
        id: "smith_weapon",
        name: "武器鍛造",
        skills: [
          { tier: 2, name: "武器鍛造", desc: "武器系統の研究を開始する。" },
          { tier: 3, name: "武器性能補正強化", desc: "武器性能補正を強化する。" },
          { tier: 4, name: "名工武器", desc: "高品質武器の研究を解放する。" }
        ]
      },
      {
        id: "smith_armor",
        name: "防具鍛造",
        skills: [
          { tier: 2, name: "防具鍛造", desc: "防具系統の研究を開始する。" },
          { tier: 3, name: "防具性能補正強化", desc: "防具性能補正を強化する。" },
          { tier: 4, name: "名工防具", desc: "高品質防具の研究を解放する。" }
        ]
      }
    ]
  },
  魔法Lv: {
    name: "魔法Lv",
    rootSkill: {
      id: "magic_lv1",
      tier: 1,
      name: "魔導塔解放",
      desc: "魔導塔と基礎魔法兵の研究を解放する。"
    },
    branches: [
      {
        id: "magic_attack",
        name: "攻撃魔法",
        skills: [
          { tier: 2, name: "攻撃魔法", desc: "攻撃魔法系統の研究を開始する。" },
          { tier: 3, name: "魔法攻撃補正強化", desc: "攻撃魔法の補正を強化する。" },
          { tier: 4, name: "高位攻撃魔法", desc: "上位攻撃魔法研究を解放する。" }
        ]
      },
      {
        id: "magic_barrier",
        name: "結界魔法",
        skills: [
          { tier: 2, name: "結界魔法", desc: "結界魔法系統の研究を開始する。" },
          { tier: 3, name: "結界耐久・属性耐性強化", desc: "結界耐久と属性耐性を強化する。" },
          { tier: 4, name: "高位防御魔法", desc: "結界装置と高位防御魔法研究を解放する。" }
        ]
      }
    ]
  },
  信仰Lv: {
    name: "信仰Lv",
    rootSkill: {
      id: "faith_lv1",
      tier: 1,
      name: "教会解放",
      desc: "教会・修道院を解放する。"
    },
    branches: [
      {
        id: "faith_heal",
        name: "治癒・加護",
        skills: [
          { tier: 2, name: "治癒・加護", desc: "治癒と加護の研究を開始する。" },
          { tier: 3, name: "回復・士気補正強化", desc: "回復量と士気補正を強化する。" },
          { tier: 4, name: "高位祝福", desc: "上位祝福研究を解放する。" }
        ]
      },
      {
        id: "faith_purge",
        name: "浄化・対不死",
        skills: [
          { tier: 2, name: "浄化・対不死", desc: "浄化と対不死の研究を開始する。" },
          { tier: 3, name: "呪い耐性・浄化強化", desc: "呪い耐性と浄化効果を強化する。" },
          { tier: 4, name: "大聖堂解放・聖域化", desc: "大聖堂解放と聖域化研究を解放する。" }
        ]
      }
    ]
  },
  軍事Lv: {
    name: "軍事Lv",
    rootSkill: {
      id: "military_lv1",
      tier: 1,
      name: "兵舎解放",
      desc: "兵舎と歩兵徴兵を解放する。"
    },
    branches: [
      {
        id: "military_melee",
        name: "近接軍備",
        skills: [
          { tier: 2, name: "近接軍備", desc: "近接軍備系統の研究を開始する。" },
          { tier: 3, name: "防壁・司令系強化", desc: "防壁と司令系統を強化する。" },
          { tier: 4, name: "精鋭歩兵・要塞化", desc: "精鋭歩兵と要塞化研究を解放する。" }
        ]
      },
      {
        id: "military_ranged",
        name: "遠距離軍備",
        skills: [
          { tier: 2, name: "遠距離軍備", desc: "遠距離軍備系統の研究を開始する。" },
          { tier: 3, name: "射撃場・索敵設備強化", desc: "射撃設備と索敵設備を強化する。" },
          { tier: 4, name: "精鋭弓兵・高警戒監視", desc: "精鋭弓兵と監視強化研究を解放する。" }
        ]
      }
    ]
  },
  経済Lv: {
    name: "経済Lv",
    rootSkill: {
      id: "economy_lv1",
      tier: 1,
      name: "市場・倉庫解放",
      desc: "市場、倉庫、基本生産施設を解放する。"
    },
    branches: [
      {
        id: "economy_production",
        name: "生産拡張",
        skills: [
          { tier: 2, name: "生産拡張", desc: "生産拡張系統の研究を開始する。" },
          { tier: 3, name: "生産施設効率強化", desc: "農場・伐採場・採石場・鉱山効率を強化する。" },
          { tier: 4, name: "大規模生産都市化", desc: "生産都市化研究を解放する。" }
        ]
      },
      {
        id: "economy_trade",
        name: "交易拡張",
        skills: [
          { tier: 2, name: "交易拡張", desc: "交易拡張系統の研究を開始する。" },
          { tier: 3, name: "港・市場・補給効率強化", desc: "港湾、交易、補給効率を強化する。" },
          { tier: 4, name: "大交易都市化", desc: "交易都市化研究を解放する。" }
        ]
      }
    ]
  }
};

function deepCloneJson(value, fallback = null) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch (_) {
    return fallback;
  }
}

function asText(value) {
  return String(value || "").trim();
}

function asTier(value, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizeSkill(rawSkill, index = 0) {
  if (!rawSkill || typeof rawSkill !== "object") return null;
  const name = asText(rawSkill.name || rawSkill.名称 || `研究${index + 1}`);
  if (!name) return null;
  return {
    tier: asTier(rawSkill.tier || rawSkill.Tier || rawSkill.Lv, index + 1),
    name,
    desc: asText(rawSkill.desc || rawSkill.説明 || rawSkill.詳細 || "-")
  };
}

function normalizeBranch(rawBranch, index = 0) {
  if (!rawBranch || typeof rawBranch !== "object") return null;
  const id = asText(rawBranch.id || rawBranch.key || `branch_${index + 1}`);
  const name = asText(rawBranch.name || rawBranch.名称 || id);
  const skillsRaw = Array.isArray(rawBranch.skills)
    ? rawBranch.skills
    : (Array.isArray(rawBranch.スキル) ? rawBranch.スキル : []);
  const skills = skillsRaw.map((row, i) => normalizeSkill(row, i)).filter(Boolean);
  if (!skills.length) return null;
  return { id, name, skills };
}

function normalizeCategory(rawKey, rawCategory) {
  if (!rawCategory || typeof rawCategory !== "object") return null;
  const normalizedKey = normalizeResearchCategoryName(rawKey);
  const key = normalizedKey || asText(rawKey);
  if (!key) return null;
  const name = asText(rawCategory.name || rawCategory.名前 || key);
  const rootRaw = rawCategory.rootSkill && typeof rawCategory.rootSkill === "object"
    ? rawCategory.rootSkill
    : (rawCategory.root && typeof rawCategory.root === "object" ? rawCategory.root : null);
  const rootSkill = rootRaw
    ? {
      id: asText(rootRaw.id || rootRaw.key || `${key}-root`),
      tier: asTier(rootRaw.tier || rootRaw.Lv, 1),
      name: asText(rootRaw.name || rootRaw.名称 || "基礎解放"),
      desc: asText(rootRaw.desc || rootRaw.説明 || rootRaw.詳細 || "-")
    }
    : null;
  const branchesRaw = Array.isArray(rawCategory.branches)
    ? rawCategory.branches
    : (Array.isArray(rawCategory.分岐) ? rawCategory.分岐 : []);
  const branches = branchesRaw.map((row, i) => normalizeBranch(row, i)).filter(Boolean);
  if (!rootSkill && !branches.length) return null;
  return { key, value: { name, rootSkill, branches } };
}

function toCategoryMap(raw) {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return {};
  if (raw.categories && typeof raw.categories === "object" && !Array.isArray(raw.categories)) {
    return raw.categories;
  }
  return raw;
}

function buildCategoriesFromRaw(raw) {
  const out = {};
  const map = toCategoryMap(raw);
  for (const [rawKey, rawCategory] of Object.entries(map)) {
    const normalized = normalizeCategory(rawKey, rawCategory);
    if (!normalized) continue;
    out[normalized.key] = normalized.value;
  }
  return out;
}

function sortCategoryKeys(keys = []) {
  const unique = Array.from(new Set((Array.isArray(keys) ? keys : []).map(k => asText(k)).filter(Boolean)));
  const ordered = [];
  const rest = [];
  for (const key of unique) {
    if (RESEARCH_CATEGORY_ORDER.includes(key)) ordered.push(key);
    else rest.push(key);
  }
  ordered.sort((a, b) => RESEARCH_CATEGORY_ORDER.indexOf(a) - RESEARCH_CATEGORY_ORDER.indexOf(b));
  return [...ordered, ...rest];
}

function toSinglePathCategory(key, category) {
  if (!category || typeof category !== "object") return null;
  const rootSkill = category.rootSkill && typeof category.rootSkill === "object"
    ? {
      id: asText(category.rootSkill.id || `${key}-root`),
      tier: asTier(category.rootSkill.tier, 1),
      name: asText(category.rootSkill.name || "基礎解放"),
      desc: asText(category.rootSkill.desc || "-")
    }
    : null;

  const tierMap = new Map();
  const branches = Array.isArray(category.branches) ? category.branches : [];
  for (const branch of branches) {
    const skills = Array.isArray(branch?.skills) ? branch.skills : [];
    for (const skill of skills) {
      const tier = asTier(skill?.tier, 1);
      const name = asText(skill?.name || `研究Lv${tier}`);
      const desc = asText(skill?.desc || "-");
      if (!tierMap.has(tier)) {
        tierMap.set(tier, [{ name, desc }]);
      } else {
        tierMap.get(tier).push({ name, desc });
      }
    }
  }

  const mergedSkills = Array.from(tierMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([tier, rows]) => ({
      tier,
      name: rows.map(row => row.name).join(" / "),
      desc: rows.map(row => row.desc).join(" / ")
    }));

  return {
    name: asText(category.name || key),
    rootSkill,
    branches: [
      {
        id: `${key}_main`,
        name: "主系統",
        skills: mergedSkills
      }
    ]
  };
}

export function normalizeResearchCategoryName(value) {
  const text = asText(value);
  return RESEARCH_CATEGORY_ALIAS[text] || text;
}

export function resolveResearchTreeData(raw = researchDbRaw) {
  const defaults = deepCloneJson(DEFAULT_RESEARCH_TREE_CATEGORIES, {});
  const fromRaw = buildCategoriesFromRaw(raw);
  const merged = { ...defaults, ...fromRaw };
  const sortedKeys = sortCategoryKeys(Object.keys(merged));
  const categories = {};
  for (const key of sortedKeys) {
    categories[key] = toSinglePathCategory(key, merged[key]) || merged[key];
  }
  return {
    maxImplementedLevel: 4,
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
