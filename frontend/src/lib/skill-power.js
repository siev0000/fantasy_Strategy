const DAMAGE_SUM_KEYS = ["物理", "魔法", "射撃", "炎", "氷", "雷", "毒", "光", "闇"];
export const SKILL_STATE_KEYS = ["精神", "盲目", "怯み", "出血", "拘束", "幻覚"];

export function toSafeNumber(value, fallback = null) {
  if (value === null || value === undefined || value === "") return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseTokenList(text) {
  return normalizeText(text)
    .split(/[\s/／・,，]+/)
    .map(token => normalizeText(token))
    .filter(Boolean);
}

export function resolveStatusValue(statusSource, key) {
  if (!statusSource || !key) return 0;
  const num = toSafeNumber(statusSource?.[key], null);
  if (num === null) return 0;
  return num;
}

export function resolveScaleStatValue(raw, statusSource) {
  const direct = toSafeNumber(raw, null);
  if (direct !== null) return direct;
  const tokens = parseTokenList(raw);
  if (!tokens.length) return 0;
  for (const token of tokens) {
    const stat = resolveStatusValue(statusSource, token);
    if (stat !== 0) return stat;
  }
  return 0;
}

export function resolveSkillBasePower(row) {
  const explicitPower = toSafeNumber(row?.全威力, null);
  if (explicitPower !== null) return explicitPower;
  let sum = 0;
  let found = false;
  for (const key of DAMAGE_SUM_KEYS) {
    const value = toSafeNumber(row?.[key], null);
    if (value === null) continue;
    sum += value;
    found = true;
  }
  return found ? sum : 0;
}

export function resolveSkillBaseState(row) {
  let sum = 0;
  let found = false;
  for (const key of SKILL_STATE_KEYS) {
    const value = toSafeNumber(row?.[key], null);
    if (value === null) continue;
    sum += value;
    found = true;
  }
  return found ? sum : 0;
}

export function resolveSkillBaseGuard(row) {
  const guard = toSafeNumber(row?.ガード, null);
  return guard === null ? 0 : guard;
}

export function computeSkillScaledTriplet(row, statusSource = null) {
  const powerBase = resolveSkillBasePower(row);
  const stateBase = resolveSkillBaseState(row);
  const guardBase = resolveSkillBaseGuard(row);
  const judgeValue = resolveScaleStatValue(row?.判定, statusSource);
  const bonusValue = resolveScaleStatValue(row?.追加威力, statusSource);
  const multiplier = (1 + judgeValue / 100) * (1 + bonusValue / 500);
  return {
    multiplier,
    judgeValue,
    bonusValue,
    powerBase,
    stateBase,
    guardBase,
    power: Math.round(powerBase * multiplier),
    state: Math.round(stateBase * multiplier),
    guard: Math.round(guardBase * multiplier)
  };
}
