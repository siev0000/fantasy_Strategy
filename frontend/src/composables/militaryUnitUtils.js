import { cityBaseData } from "../lib/game-data-registry.js";

export const UNIT_CREATE_MODE_KEYS = {
  NORMAL: "normal",
  ARMY: "army",
  ELITE_ARMY: "elite_army"
};

export const TERRITORY_GUARD_ASSIGNMENT_MAP_KEY = "territoryGuardAssignmentMap";
export const TERRITORY_GUARD_TARGET_CONSCRIPTION_RATE_KEY = "guardTargetConscriptionRate";

// 調整予定: 警備研究の具体的な研究名・解放条件が確定するまでは段階だけを共通定義として扱う。
// 3人警備は今回の確定仕様。4人/5人は研究進行後の編成として既存の軍隊ユニット倍率に合わせる。
export const TERRITORY_GUARD_FORMATIONS = Object.freeze([
  Object.freeze({ stage: 0, memberCount: 3, hpMultiplier: 2, attackCount: 3 }),
  Object.freeze({ stage: 1, memberCount: 4, hpMultiplier: 2.5, attackCount: 4 }),
  Object.freeze({ stage: 2, memberCount: 5, hpMultiplier: 3, attackCount: 5 })
]);

// 調整予定: Lv×人数を治安へ変換する係数。初期 Lv3×3人 = 治安+9 相当。
// 種族固有の追加警備倍率は付けず、種族差は実戦時の既存ステータス・技能で表現する。
export const TERRITORY_GUARD_SECURITY_PER_SCORE = 1;
export const TERRITORY_GUARD_SECURITY_BONUS_CAP_PER_TILE = 30;

function toSafeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nonEmptyText(value) {
  const text = String(value ?? "").trim();
  return text.length ? text : "";
}

function normalizeRatio(value, fallback = 0) {
  const raw = toSafeNumber(value, fallback);
  const ratio = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, ratio));
}

const MILITARY_UNIT_MODE_DEFS = Object.freeze(Object.fromEntries(
  cityBaseData
    .filter(row => nonEmptyText(row?.分類) === "ユニット作成")
    .map(row => {
      const mode = nonEmptyText(row?.データ分類);
      return [mode, Object.freeze({
        mode,
        label:nonEmptyText(row?.表示名),
        unitTypeLabel:nonEmptyText(row?.ユニット種別),
        requiredMilitaryLevel:Math.max(1, Math.floor(toSafeNumber(row?.必要軍事Lv, 1))),
        populationCost:Math.max(0, Math.floor(toSafeNumber(row?.人口消費, 0))),
        hpMultiplier:Math.max(1, toSafeNumber(row?.HP倍率, 1)),
        attackCount:Math.max(1, Math.floor(toSafeNumber(row?.攻撃回数, 1))),
        simpleActionOnly:row?.簡易行動限定 === true,
        order:Math.max(0, Math.floor(toSafeNumber(row?.表示順, 0)))
      })];
    })
    .filter(([mode, def]) => mode && def.label && def.unitTypeLabel)
));
const missingUnitCreateModes = Object.values(UNIT_CREATE_MODE_KEYS).filter(mode => !MILITARY_UNIT_MODE_DEFS[mode]);
if (missingUnitCreateModes.length) {
  throw new Error(`[ゲームデータ] 都市基本データ.json: ユニット作成種別がありません (${missingUnitCreateModes.join("、")})`);
}

function cloneObject(input) {
  if (!input || typeof input !== "object") return {};
  return { ...input };
}

export function resolveTerritoryGuardSoldierLevel(militaryLevel = 1) {
  const level = Math.max(1, Math.floor(toSafeNumber(militaryLevel, 1)));
  return (level - 1) * 3 + 3;
}

export function resolveTerritoryGuardFormation(guardResearchStage = 0) {
  const requested = Math.max(0, Math.floor(toSafeNumber(guardResearchStage, 0)));
  const index = Math.min(TERRITORY_GUARD_FORMATIONS.length - 1, requested);
  return { ...TERRITORY_GUARD_FORMATIONS[index] };
}

export function buildTerritoryGuardMilitaryProfile(militaryLevel = 1, guardResearchStage = 0) {
  const formation = resolveTerritoryGuardFormation(guardResearchStage);
  const soldierLevel = resolveTerritoryGuardSoldierLevel(militaryLevel);
  const guardScore = soldierLevel * formation.memberCount;
  return {
    mode: "territory_guard",
    unitTypeLabel: "警備隊",
    soldierLevel,
    memberCount: formation.memberCount,
    populationCost: formation.memberCount,
    hpMultiplier: formation.hpMultiplier,
    attackCount: formation.attackCount,
    simpleActionOnly: true,
    guardScore,
    // 仮値。最終的な治安式・モンスター危険度との接続時にこの係数だけ調整できるようにする。
    securityBonus: Math.min(
      TERRITORY_GUARD_SECURITY_BONUS_CAP_PER_TILE,
      guardScore * TERRITORY_GUARD_SECURITY_PER_SCORE
    )
  };
}

export function resolveTerritoryGuardManpower({
  population = 0,
  targetConscriptionRate = 0,
  fieldMilitaryPopulation = 0,
  militaryLevel = 1,
  guardResearchStage = 0
} = {}) {
  const safePopulation = Math.max(0, Math.floor(toSafeNumber(population, 0)));
  const rate = normalizeRatio(targetConscriptionRate, 0);
  const conscriptedPopulation = Math.max(0, Math.floor(safePopulation * rate));
  const fieldPopulation = Math.max(0, Math.floor(toSafeNumber(fieldMilitaryPopulation, 0)));
  const availableGuardPopulation = Math.max(0, conscriptedPopulation - fieldPopulation);
  const profile = buildTerritoryGuardMilitaryProfile(militaryLevel, guardResearchStage);
  const guardUnitCount = Math.floor(availableGuardPopulation / profile.memberCount);
  const reservePopulation = availableGuardPopulation - guardUnitCount * profile.memberCount;
  return {
    population: safePopulation,
    targetConscriptionRate: rate,
    conscriptedPopulation,
    fieldMilitaryPopulation: fieldPopulation,
    availableGuardPopulation,
    guardUnitCount,
    reservePopulation,
    profile
  };
}

export function normalizeTerritoryGuardAssignmentMap(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [tileKeyRaw, countRaw] of Object.entries(raw)) {
    const tileKey = nonEmptyText(tileKeyRaw);
    if (!tileKey.includes(",")) continue;
    const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
    if (count > 0) out[tileKey] = count;
  }
  return out;
}

export function countAssignedTerritoryGuardUnits(raw) {
  return Object.values(normalizeTerritoryGuardAssignmentMap(raw))
    .reduce((sum, count) => sum + count, 0);
}

export function assignTerritoryGuardUnits(raw, tileKeyRaw, unitCount = 0, maxAvailableUnits = Number.POSITIVE_INFINITY) {
  const map = normalizeTerritoryGuardAssignmentMap(raw);
  const tileKey = nonEmptyText(tileKeyRaw);
  if (!tileKey.includes(",")) return map;
  const requested = Math.max(0, Math.floor(toSafeNumber(unitCount, 0)));
  const assignedElsewhere = Object.entries(map)
    .filter(([key]) => key !== tileKey)
    .reduce((sum, [, count]) => sum + count, 0);
  const finiteMax = Number.isFinite(maxAvailableUnits)
    ? Math.max(0, Math.floor(toSafeNumber(maxAvailableUnits, 0)))
    : Number.POSITIVE_INFINITY;
  const allowed = Number.isFinite(finiteMax)
    ? Math.max(0, finiteMax - assignedElsewhere)
    : requested;
  const nextCount = Math.min(requested, allowed);
  if (nextCount > 0) map[tileKey] = nextCount;
  else delete map[tileKey];
  return map;
}

export function resolveTerritoryGuardAtTile(village, tileKeyRaw, options = {}) {
  const tileKey = nonEmptyText(tileKeyRaw);
  const assignmentMap = normalizeTerritoryGuardAssignmentMap(
    village?.[TERRITORY_GUARD_ASSIGNMENT_MAP_KEY]
  );
  const assignedUnits = Math.max(0, Math.floor(toSafeNumber(assignmentMap?.[tileKey], 0)));
  const militaryLevel = Math.max(1, Math.floor(toSafeNumber(
    options?.militaryLevel,
    village?.cityLevels?.military ?? village?.militaryLevel ?? village?.軍事Lv ?? 1
  )));
  const guardResearchStage = Math.max(0, Math.floor(toSafeNumber(
    options?.guardResearchStage,
    village?.guardResearchStage ?? 0
  )));
  const profile = buildTerritoryGuardMilitaryProfile(militaryLevel, guardResearchStage);
  return {
    tileKey,
    assignedUnits,
    totalMembers: assignedUnits * profile.memberCount,
    totalGuardScore: assignedUnits * profile.guardScore,
    securityBonus: Math.min(
      TERRITORY_GUARD_SECURITY_BONUS_CAP_PER_TILE,
      assignedUnits * profile.guardScore * TERRITORY_GUARD_SECURITY_PER_SCORE
    ),
    profile
  };
}

export function resolveUnitCreateModeOptions(militaryLevel = 1) {
  const level = Math.max(1, Math.floor(toSafeNumber(militaryLevel, 1)));
  return Object.values(MILITARY_UNIT_MODE_DEFS)
    .filter(def => level >= def.requiredMilitaryLevel)
    .sort((a, b) => a.order - b.order || a.requiredMilitaryLevel - b.requiredMilitaryLevel);
}

export function resolveUnitCreateModeCatalog() {
  return Object.values(MILITARY_UNIT_MODE_DEFS)
    .map(def => ({ ...def }))
    .sort((a, b) => a.order - b.order || a.requiredMilitaryLevel - b.requiredMilitaryLevel);
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
