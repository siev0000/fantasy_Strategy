export const UNIT_CREATE_MODE_KEYS = {
  NORMAL: "normal",
  ARMY: "army",
  ELITE_ARMY: "elite_army"
};

const MILITARY_UNIT_MODE_DEFS = {
  [UNIT_CREATE_MODE_KEYS.NORMAL]: {
    mode: UNIT_CREATE_MODE_KEYS.NORMAL,
    label: "個体ユニット",
    unitTypeLabel: "モブ",
    requiredMilitaryLevel: 1,
    populationCost: 0,
    hpMultiplier: 1,
    attackCount: 1,
    simpleActionOnly: false
  },
  [UNIT_CREATE_MODE_KEYS.ARMY]: {
    mode: UNIT_CREATE_MODE_KEYS.ARMY,
    label: "軍隊ユニット",
    unitTypeLabel: "軍隊",
    requiredMilitaryLevel: 2,
    populationCost: 4,
    hpMultiplier: 2.5,
    attackCount: 4,
    simpleActionOnly: true
  },
  [UNIT_CREATE_MODE_KEYS.ELITE_ARMY]: {
    mode: UNIT_CREATE_MODE_KEYS.ELITE_ARMY,
    label: "強化軍隊ユニット",
    unitTypeLabel: "精鋭軍隊",
    requiredMilitaryLevel: 3,
    populationCost: 5,
    hpMultiplier: 3,
    attackCount: 5,
    simpleActionOnly: true
  }
};

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function cloneObject(input) {
  if (!input || typeof input !== "object") return {};
  return { ...input };
}

export function resolveUnitCreateModeOptions(militaryLevel = 1) {
  const level = Math.max(1, Math.floor(toSafeNumber(militaryLevel, 1)));
  return Object.values(MILITARY_UNIT_MODE_DEFS)
    .filter(def => level >= def.requiredMilitaryLevel)
    .sort((a, b) => a.requiredMilitaryLevel - b.requiredMilitaryLevel);
}

export function resolveUnitCreateMode(mode, militaryLevel = 1) {
  const options = resolveUnitCreateModeOptions(militaryLevel);
  if (!options.length) return { ...MILITARY_UNIT_MODE_DEFS[UNIT_CREATE_MODE_KEYS.NORMAL] };
  const key = nonEmptyText(mode);
  const found = options.find(def => def.mode === key);
  if (found) return { ...found };
  return { ...options[options.length - 1] };
}

export function applyMilitaryProfileToStatus(status, militaryProfile = null, options = {}) {
  const source = cloneObject(status);
  if (!militaryProfile || typeof militaryProfile !== "object") return source;
  const hpMultiplier = Math.max(1, toSafeNumber(militaryProfile.hpMultiplier, 1));
  const roundValue = typeof options?.roundValue === "function"
    ? options.roundValue
    : value => Math.round(value);
  const baseHp = toSafeNumber(source.HP, 0);
  if (baseHp > 0) {
    source.HP = Math.max(1, roundValue(baseHp * hpMultiplier));
  }
  return source;
}

export function resolveMaxCreatableByPopulation(village, raceName, perUnitPopulationCost = 0) {
  const perUnit = Math.max(0, Math.floor(toSafeNumber(perUnitPopulationCost, 0)));
  if (perUnit <= 0) return Number.POSITIVE_INFINITY;
  const race = nonEmptyText(raceName);
  if (!race) return 0;
  const raceCount = Math.max(0, Math.floor(toSafeNumber(village?.populationByRace?.[race], 0)));
  return Math.max(0, Math.floor(raceCount / perUnit));
}

export function consumeVillagePopulationByRace(village, raceName, consumeCount = 0) {
  if (!village || typeof village !== "object") {
    return { ok: false, reason: "村データが不正です。", village: null, consumed: 0 };
  }
  const race = nonEmptyText(raceName);
  const need = Math.max(0, Math.floor(toSafeNumber(consumeCount, 0)));
  if (!need) return { ok: true, village: { ...village }, consumed: 0 };
  if (!race) return { ok: false, reason: "人口消費対象の種族が未設定です。", village: null, consumed: 0 };

  const nextPopulationByRace = cloneObject(village.populationByRace);
  const current = Math.max(0, Math.floor(toSafeNumber(nextPopulationByRace[race], 0)));
  if (current < need) {
    return {
      ok: false,
      reason: `人口不足: ${race} ${current}人 (必要 ${need}人)`,
      village: null,
      consumed: 0
    };
  }
  nextPopulationByRace[race] = current - need;
  const total = Object.values(nextPopulationByRace)
    .reduce((acc, n) => acc + Math.max(0, Math.floor(toSafeNumber(n, 0))), 0);
  if (total < 1) {
    return { ok: false, reason: "人口不足: 村人口が0になります。", village: null, consumed: 0 };
  }
  return {
    ok: true,
    village: {
      ...village,
      populationByRace: nextPopulationByRace,
      population: total
    },
    consumed: need
  };
}
