import { classData } from "./game-data-registry.js";
import { applyV39DerivedCharacterData } from "../v39/unit/v39-character-derived-rules.js";
import { RACE_CLASS_NAME_MAP } from "../constants/unitCommon.js";

export const V39_UNIT_LEVEL_CAP = 120;
export const V39_UNIT_EXP_LEVEL_SPLIT = 15;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const classByName = new Map((Array.isArray(classData) ? classData : []).map(row => [text(row?.名前), row]).filter(([name]) => name));

function raceCategory(unit = {}) {
  const raceName = text(unit?.race || unit?.raceName || unit?.種族);
  const row = classByName.get(RACE_CLASS_NAME_MAP[raceName] || raceName) || null;
  const kind = text(row?.種類);
  if (kind === "人族") return "human";
  if (kind === "亜人") return "demi";
  if (kind === "魔族") return "demon";
  return "other";
}

export function resolveV39UnitExpNeed(levelRaw, category = "other") {
  const level = Math.max(1, Math.floor(number(levelRaw, 1)));
  const early = level < V39_UNIT_EXP_LEVEL_SPLIT;
  if (category === "human") return early ? 175 + level*50 : 150 + level*80;
  if (category === "demi") return early ? 150 + level*50 : 150 + level*80;
  if (category === "demon") return early ? 100 + level*50 : 200 + level*100;
  const demiBase = early ? 150 + level*50 : 150 + level*80;
  return Math.max(1, Math.floor(demiBase*1.1));
}

export function resolveV39UnitTotalExpForLevel(levelRaw, category = "other") {
  const level = Math.max(1, Math.floor(number(levelRaw, 1)));
  let total = 0;
  for (let current = 1; current < level; current += 1) total += resolveV39UnitExpNeed(current, category);
  return total;
}

export function resolveV39UnitLevelFromTotalExp(totalExpRaw, category = "other", capRaw = V39_UNIT_LEVEL_CAP) {
  const totalExp = Math.max(0, Math.floor(number(totalExpRaw)));
  const cap = Math.max(1, Math.floor(number(capRaw, V39_UNIT_LEVEL_CAP)));
  let level = 1;
  let consumed = 0;
  while (level < cap) {
    const need = resolveV39UnitExpNeed(level, category);
    if (consumed + need > totalExp) break;
    consumed += need;
    level += 1;
  }
  return level;
}

export function resolveV39UnitExpProgress(totalExpRaw, levelRaw, category = "other") {
  const totalExp = Math.max(0, Math.floor(number(totalExpRaw)));
  const level = Math.max(1, Math.floor(number(levelRaw, 1)));
  const consumed = resolveV39UnitTotalExpForLevel(level, category);
  const nextNeed = resolveV39UnitExpNeed(level, category);
  return { exp:Math.max(0, Math.min(nextNeed, totalExp-consumed)), totalExp };
}

export function grantV39UnitExperience(unit = {}, amountRaw = 0) {
  const amount = Math.max(0, Math.floor(number(amountRaw)));
  const category = raceCategory(unit);
  const fromLevel = Math.max(1, Math.floor(number(unit?.level, 1)));
  const fallbackTotal = resolveV39UnitTotalExpForLevel(fromLevel, category);
  const previousTotal = Math.max(0, Math.floor(number(unit?.totalExp, number(unit?.status?.totalExp, fallbackTotal))));
  const totalExp = previousTotal + amount;
  const level = resolveV39UnitLevelFromTotalExp(totalExp, category);
  const consumed = resolveV39UnitTotalExpForLevel(level, category);
  const exp = Math.max(0, totalExp-consumed);
  const oldMaxHp = Math.max(1, number(unit?.maxHp, unit?.status?.HP || 1));
  const oldHp = Math.max(0, number(unit?.hp, number(unit?.currentHp, oldMaxHp)));
  const hpRate = oldHp/oldMaxHp;
  const recalculated = level === fromLevel ? { ...unit } : applyV39DerivedCharacterData({ ...unit, level });
  const maxHp = Math.max(1, Math.floor(number(recalculated?.maxHp, recalculated?.status?.HP || oldMaxHp)));
  const hp = Math.max(0, Math.min(maxHp, Math.floor(maxHp*hpRate)));
  return {
    unit:{
      ...recalculated,
      level,
      exp,
      totalExp,
      expPeakLevel:Math.max(level, Math.floor(number(unit?.expPeakLevel, fromLevel))),
      status:{ ...(recalculated?.status || {}), exp, totalExp },
      maxHp,
      hp,
      currentHp:hp
    },
    amount,
    fromLevel,
    toLevel:level,
    leveledUp:level > fromLevel
  };
}

if (typeof window !== "undefined") {
  window.grantV39UnitExperience = grantV39UnitExperience;
}
