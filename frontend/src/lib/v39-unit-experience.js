import { classData } from "./game-data-registry.js";
import { V39_UNIT_EXP_BALANCE } from "./v39-gameplay-balance.js";
import { applyV39DerivedCharacterData } from "../v39/unit/v39-character-derived-rules.js";
import { RACE_CLASS_NAME_MAP } from "../constants/unitCommon.js";

export const V39_UNIT_LEVEL_CAP = 120;
export const V39_UNIT_EXP_LEVEL_SPLIT = 15;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const classByName = new Map((Array.isArray(classData) ? classData : []).map(row => [text(row?.名前), row]).filter(([name]) => name));

export function resolveV39UnitRaceCategory(unit = {}) {
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
  return { exp:Math.max(0, Math.min(nextNeed, totalExp-consumed)), totalExp, need:nextNeed };
}

export function resolveV39UnitExpDisplay(unit = {}) {
  const category = resolveV39UnitRaceCategory(unit);
  const level = Math.max(1, Math.floor(number(unit?.level, 1)));
  const baseline = resolveV39UnitTotalExpForLevel(level, category);
  const totalExp = Math.max(baseline, Math.floor(number(unit?.totalExp, number(unit?.status?.totalExp, baseline))));
  const progress = resolveV39UnitExpProgress(totalExp, level, category);
  const percent = progress.need > 0 ? Math.max(0, Math.min(100, (progress.exp/progress.need)*100)) : 0;
  return { ...progress, category, level, percent };
}

export function resolveV39TargetFullExpReward(target = {}) {
  const level = Math.max(1, Math.floor(number(target?.level, target?.Lv || 1)));
  const category = resolveV39UnitRaceCategory(target);
  const multiplier = Math.max(0, number(V39_UNIT_EXP_BALANCE.targetRaceMultipliers?.[category], V39_UNIT_EXP_BALANCE.targetRaceMultipliers?.other ?? 1));
  return {
    level,
    category,
    multiplier,
    exp:Math.max(0, number(V39_UNIT_EXP_BALANCE.baseExpPerTargetLevel) * level * multiplier)
  };
}

export function resolveV39DamageExpReward(target = {}, beforeHpRaw = 0, afterHpRaw = 0) {
  const maxHp = Math.max(1, number(target?.maxHp, target?.status?.HP || beforeHpRaw || 1));
  const beforeHp = Math.max(0, Math.min(maxHp, number(beforeHpRaw)));
  const afterHp = Math.max(0, Math.min(beforeHp, number(afterHpRaw)));
  const actualDamage = Math.max(0, beforeHp-afterHp);
  const alreadyRewarded = Math.max(0, Math.min(maxHp, number(target?.expRewardedHpDamage)));
  const remainingRewardable = V39_UNIT_EXP_BALANCE.capRewardedDamageAtMaxHp
    ? Math.max(0, maxHp-alreadyRewarded)
    : actualDamage;
  const rewardedDamage = Math.min(actualDamage, remainingRewardable);
  const full = resolveV39TargetFullExpReward(target);
  return {
    ...full,
    maxHp,
    actualDamage,
    rewardedDamage,
    damageRate:rewardedDamage/maxHp,
    rawExp:full.exp*(rewardedDamage/maxHp),
    nextRewardedHpDamage:Math.min(maxHp, alreadyRewarded+rewardedDamage)
  };
}

function isAlive(unit) {
  return text(unit?.state) !== "死亡" && number(unit?.hp, unit?.currentHp ?? 1) > 0;
}

export function resolveV39ExperienceRecipientIds(factionState = {}, attackerIdRaw = "") {
  const attackerId = text(attackerIdRaw);
  const units = Array.isArray(factionState?.units) ? factionState.units : [];
  const attacker = units.find(unit => text(unit?.id) === attackerId) || null;
  if (!attacker || !isAlive(attacker)) return [];
  if (!V39_UNIT_EXP_BALANCE.splitAmongLivingSquadMembers) return [attackerId];

  const squads = Array.isArray(factionState?.squads) ? factionState.squads : [];
  const squad = squads.find(row => (Array.isArray(row?.unitIds) ? row.unitIds : []).map(text).includes(attackerId)) || null;
  const squadId = text(squad?.id || attacker?.squadId);
  if (!squad || squadId === "solo" || squadId === "単独") return [attackerId];

  const ids = new Set((Array.isArray(squad.unitIds) ? squad.unitIds : []).map(text).filter(Boolean));
  const recipients = units.filter(unit => ids.has(text(unit?.id)) && isAlive(unit)).map(unit => text(unit.id));
  return recipients.length ? recipients : [attackerId];
}

export function grantV39UnitExperience(unit = {}, amountRaw = 0) {
  const amount = Math.max(0, Math.floor(number(amountRaw)));
  const category = resolveV39UnitRaceCategory(unit);
  const fromLevel = Math.max(1, Math.floor(number(unit?.level, 1)));
  const fallbackTotal = resolveV39UnitTotalExpForLevel(fromLevel, category);
  const previousTotal = Math.max(fallbackTotal, Math.floor(number(unit?.totalExp, number(unit?.status?.totalExp, fallbackTotal))));
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

export function distributeV39CombatExperience(factionState = {}, attackerIdRaw = "", expPoolRaw = 0) {
  const carriedRemainder = Math.max(0, number(factionState?.combatExpRemainder));
  const availableExp = Math.max(0, number(expPoolRaw)) + carriedRemainder;
  const expPool = Math.floor(availableExp);
  const combatExpRemainder = availableExp-expPool;
  const recipientIds = resolveV39ExperienceRecipientIds(factionState, attackerIdRaw);
  if (expPool <= 0 || !recipientIds.length) return {
    factionState:{ ...factionState, combatExpRemainder },
    expPool:0,
    awards:[],
    levelUps:[]
  };

  const baseShare = Math.floor(expPool/recipientIds.length);
  let remainder = expPool-(baseShare*recipientIds.length);
  const awardById = new Map(recipientIds.map(id => {
    const amount = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    return [id, amount];
  }));
  const awards = [];
  const units = (Array.isArray(factionState?.units) ? factionState.units : []).map(unit => {
    const id = text(unit?.id);
    if (!awardById.has(id)) return unit;
    const result = grantV39UnitExperience(unit, awardById.get(id));
    awards.push({
      unitId:id,
      unitName:text(unit?.name, id),
      amount:result.amount,
      fromLevel:result.fromLevel,
      toLevel:result.toLevel,
      leveledUp:result.leveledUp
    });
    return result.unit;
  });
  return {
    factionState:{ ...factionState, units, combatExpRemainder },
    expPool,
    awards,
    levelUps:awards.filter(row => row.leveledUp)
  };
}

if (typeof window !== "undefined") {
  window.grantV39UnitExperience = grantV39UnitExperience;
  window.resolveV39UnitExpDisplay = resolveV39UnitExpDisplay;
  window.resolveV39DamageExpReward = resolveV39DamageExpReward;
}
