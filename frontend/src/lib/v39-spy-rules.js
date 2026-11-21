import missions from "../../../config/v39-spy-missions.json";
import {getHexDistance} from "./hex-grid.js";

const clamp = (value,min,max) => Math.max(min,Math.min(value,max));
const skill = (unit,key) => Number(unit?.skillLevels?.[key] ?? unit?.status?.[key]) || 0;

export function qualifiesForSpyMission(unit) {
  return unit?.state !== "死亡" && Number(unit?.hp ?? unit?.currentHp) > 0
    && skill(unit,"隠密") >= 150 && skill(unit,"変装") >= 150;
}

// 完了に必要なAPだけを支払う。端数は保持し、同ターンの次の指示へ引き継ぐ。
export function advanceSpyProgress({mission,spy,difficulty,areaMultiplier,progress,availableAp}) {
  const {baseTurns,skills} = missions[mission];
  const skillMean = skills.reduce((total,key) => total + skill(spy,key),0) / skills.length;
  const rate = clamp(1 + (skillMean - difficulty) / 400, 0.25, 2) * areaMultiplier / baseTurns;
  if (!Number.isFinite(rate) || rate <= 0) throw new RangeError("諜報任務の進捗倍率が不正です");
  const remaining = 100 - clamp(progress,0,100);
  const spent = Math.min(Math.max(availableAp,0),remaining / rate);
  return {spent,progress:spent >= remaining / rate ? 100 : 100 - remaining + spent * rate};
}

export function spyAvoidancePercent(difference, hasNetwork=false) {
  const base = difference < 0 ? Math.max(0,100 - 5 * 2 ** (-difference / 300))
    : Math.min(99,95 + 4 * difference / 150);
  return Math.min(100,base + (hasNetwork ? 2 : 0));
}

// 敵候補と軍隊所属は呼び出し側の勢力・編制情報で解決する。
export function spyEscapePercent({spy,location,enemies,isArmyMember,movementSpeed,hasDisguisePassive}) {
  const nearby = enemies.filter(unit => Number(unit.hp ?? unit.currentHp) > 0 && unit.state !== "死亡"
    && (unit.worldId || "surface") === (location.worldId || "surface") && getHexDistance(unit,location) <= 2);
  if (!nearby.length) return 100;
  const max = measure => Math.max(...nearby.map(measure));
  const count = nearby.reduce((total,unit) => total + (isArmyMember(unit) ? 0.4 : 1),0);
  const disguise = hasDisguisePassive ? (skill(spy,"変装") - max(unit => skill(unit,"看破"))) / 10 : 0;
  return clamp(50 + (skill(spy,"軽業") - max(unit => skill(unit,"軽業"))) / 10
    + movementSpeed(spy) - max(movementSpeed) + disguise - 5 * Math.max(0,count - 1),0,100);
}
