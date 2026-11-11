import { DAMAGE_TYPE_FIELDS, SKILL_STATE_KEYS } from "../constants/unitCommon.js";
import {V39_CONTROL_STATUS_FIELDS,V39_NUMERIC_STATUSES,resolveV39ControlStatusPower,resolveV39NumericStatusPower} from './v39-control-status.js';
import {abilityDamageTarget} from './v39-ability-damage.js';

export const DAMAGE_SUM_KEYS = [...DAMAGE_TYPE_FIELDS,'力場'];
export { SKILL_STATE_KEYS };

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
  if (normalizeText(raw).startsWith('最大_')) return Math.max(0,...normalizeText(raw).slice(3).split('_').map(key=>resolveStatusValue(statusSource,key)));
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
  if(!row)return 0;
  const effects=normalizeText(row.効果).split(/[\s/／,:：|]+/);
  const keys=new Set([...SKILL_STATE_KEYS,...V39_NUMERIC_STATUSES].filter(key=>!['疲労','麻痺'].includes(key)));
  if(!effects.includes('麻痺')||effects.includes('毒'))keys.add('毒');
  if(!effects.includes('麻痺')&&!effects.includes('疲労'))keys.add('呪い');
  const numeric=[...keys].reduce((sum,key)=>sum+Math.max(0,toSafeNumber(row[key],0)),0);
  const sourced=['疲労','麻痺'].reduce((sum,key)=>sum+resolveV39NumericStatusPower(row,effects,key),0);
  const control=Object.keys(V39_CONTROL_STATUS_FIELDS).reduce((sum,key)=>sum+resolveV39ControlStatusPower(row,effects,key),0);
  const burn=Math.max(0,toSafeNumber(row.燃焼,effects.includes('燃焼')?toSafeNumber(row.炎,0):0));
  const knockdown=effects.some(effect=>effect==='転倒'||effect==='打ち倒し')?Math.max(0,toSafeNumber(row.体幹??row.ノックバック,0)):0;
  const dispel=effects.includes('強化解除')?Math.max(0,toSafeNumber(row.魔法,0)):0;
  const ability=abilityDamageTarget(row)&&!row.呪い&&!row.毒?Math.max(0,resolveSkillBasePower(row)):0;
  return numeric+sourced+control+burn+knockdown+dispel+ability;
}

export function resolveSkillBaseGuard(row) {
  const guard = toSafeNumber(row?.ガード, null);
  return guard === null ? 0 : guard;
}

export function formatV39SkillCombatValues({power,guard,state,healing}) {
  return [['威',power],['守',guard],['状',state],['回',healing]]
    .filter(([,value])=>toSafeNumber(value,0)!==0)
    .map(([label,value])=>label+toSafeNumber(value,0))
    .join(' ');
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
