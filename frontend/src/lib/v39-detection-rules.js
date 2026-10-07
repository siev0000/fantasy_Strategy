import {
  resolveUnitScoutValue,
  resolveUnitStealthValue
} from "../composables/unitCoreUtils.js";
import { V39_CAVE_BALANCE, V39_ATTACK_STEALTH_RECOVERY_TURNS } from "./v39-gameplay-balance.js";

export const V39_SCOUT_DISTANCE_DECAY_PER_TILE = 50;
// ユニットは最低1マスを見通す。地上は索敵75、地下は設定値37.5ごとに1マス広げる。
// フィールドFogと勢力AIで同じ視界計算を使う。
export const V39_UNIT_VISION_BASE_RANGE = 1;
export const V39_UNIT_VISION_SCOUT_STEP = 75;

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundTo1(value) {
  return Math.round(number(value) * 10) / 10;
}

export function resolveDetectionScoutValue(unit) {
  return Math.max(
    0,
    roundTo1(resolveUnitScoutValue(unit)),
    roundTo1(number(unit?.status?.索敵)),
    roundTo1(number(unit?.索敵)),
    roundTo1(number(unit?.scoutRange))
  );
}

export function resolveV39UnitVisionRange(unit, mapData = null) {
  const scout = resolveDetectionScoutValue(unit);
  const scoutStep=mapData?.isUnderground?V39_CAVE_BALANCE.visionScoutStep:V39_UNIT_VISION_SCOUT_STEP;
  return V39_UNIT_VISION_BASE_RANGE + Math.max(0, Math.floor(scout / scoutStep))
    + (mapData?.isUnderground ? V39_CAVE_BALANCE.visionBonusTiles : 0);
}

export function resolveDetectionStealthRecoveryRate(unit, { turnNumber = null } = {}) {
  const currentTurn = Number(turnNumber);
  if (Number.isFinite(currentTurn) && currentTurn > 0
    && Math.floor(number(unit?.lastStealthBreakTurn, -1)) === Math.floor(currentTurn)) {
    return 0;
  }
  const attackTurn = number(unit?.lastStealthAttackTurn,
    unit?.lastStealthBreakReason === "attack" ? number(unit?.lastStealthBreakTurn, -1) : -1);
  if (!Number.isFinite(currentTurn) || currentTurn <= 0 || attackTurn < 1 || currentTurn < attackTurn) return 1;
  return Math.min(1, Math.floor(currentTurn - attackTurn) / V39_ATTACK_STEALTH_RECOVERY_TURNS);
}

export function resolveDetectionStealthValue(unit, options = {}) {
  const base = Math.max(
    0,
    roundTo1(resolveUnitStealthValue(unit)),
    roundTo1(number(unit?.status?.隠密)),
    roundTo1(number(unit?.隠密))
  );
  return roundTo1(base * resolveDetectionStealthRecoveryRate(unit, options));
}

export function resolveDetectionGroupSense(units = [], options = {}) {
  const source = (Array.isArray(units) ? units : []).filter(Boolean);
  return resolveDetectionGroupSenseFromValues(
    source.map(resolveDetectionScoutValue),
    source.map(unit => resolveDetectionStealthValue(unit, options))
  );
}

export function resolveDetectionGroupSenseFromValues(scoutValues = [], stealthValues = []) {
  const scouts = (Array.isArray(scoutValues) ? scoutValues : [])
    .map(value => Math.max(0, roundTo1(value)))
    .sort((a, b) => b - a);
  const stealths = (Array.isArray(stealthValues) ? stealthValues : [])
    .map(value => Math.max(0, roundTo1(value)));
  const count = Math.max(1, stealths.length || scouts.length);
  const maxScout = scouts[0] || 0;
  const supportScout = scouts.slice(1).reduce((sum, value) => sum + (value / 5), 0);
  const stealthTotal = stealths.reduce((sum, value) => sum + value, 0);
  const stealthDivisor = count > 1 ? Math.max(1, count * 0.75) : 1;
  return {
    scout:roundTo1(maxScout + supportScout),
    stealth:roundTo1(stealthTotal / stealthDivisor),
    count
  };
}

export function resolveEffectiveScoutAtDistance(scout, distance, mapData = null) {
  const bonus=mapData?.isUnderground?V39_CAVE_BALANCE.visionBonusTiles:0;
  const decayRate=mapData?.isUnderground?V39_CAVE_BALANCE.visionScoutStep/V39_UNIT_VISION_SCOUT_STEP:1;
  const penalty = Math.max(0, Math.floor(number(distance)) - 1 - bonus) * V39_SCOUT_DISTANCE_DECAY_PER_TILE * decayRate;
  // 視界内で隠密0の対象まで見失わないよう、距離減衰後も索敵の下限は0。
  return Math.max(0, roundTo1(number(scout) - penalty));
}

export function isDetectedByScout({ scout = 0, stealth = 0, distance = 0, inRange = true, mapData = null } = {}) {
  return inRange === true && resolveEffectiveScoutAtDistance(scout, distance, mapData) >= Math.max(0, number(stealth));
}
