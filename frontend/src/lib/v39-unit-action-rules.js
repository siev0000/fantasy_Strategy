import {isV39UnitRecoveryWaiting} from './v39-recovery-wait.js';

export function isV39UnitWaiting(unit, turnNumber) {
  return Number(unit?.waitTurnNumber) === Number(turnNumber) || isV39UnitRecoveryWaiting(unit);
}

export const V39_WAITED_UNIT_BRIGHTNESS = 0.72;

export function isV39UnitWaitDimmed(unit, turnNumber) {
  return Number(turnNumber) >= 1
    && Number(unit?.hp ?? unit?.currentHp) > 0 && unit?.state !== "死亡"
    && isV39UnitWaiting(unit, turnNumber);
}

export function getV39UnitWaitTint(unit, turnNumber) {
  const channel = Math.round(255 * V39_WAITED_UNIT_BRIGHTNESS);
  return isV39UnitWaitDimmed(unit, turnNumber) ? channel * 0x010101 : 0xffffff;
}

export function isV39UnitUnacted(unit, turnNumber, faction = {}) {
  const ap = Number(unit?.ap ?? unit?.currentAp ?? 0);
  // 移動中の新教官と交代前の現教官は、どちらも任務中として扱う。
  const instructor = [faction.recruitInstructorByTile, faction.recruitInstructorTransfers]
    .some(assignments => Object.values(assignments || {}).some(entry => entry?.unitId === unit?.id));
  return Number(unit?.hp ?? unit?.currentHp ?? 0) > 0
    && (unit?.state || unit?.statusName) !== "死亡"
    && Number(unit?.x) >= 0 && Number(unit?.y) >= 0
    && ap > 0 && !isV39UnitWaiting(unit, turnNumber)
    && unit?.transportAssignment?.enabled !== true
    && !unit?.caveDuty
    && unit?.squadMoveMode !== 'gather'
    && unit?.tradeAssignment?.automatic !== true
    && !instructor
    && Number(unit?.lastActionTurn || 0) !== Number(turnNumber)
    && Number(unit?.surveyTask?.startedTurn || 0) !== Number(turnNumber)
    && ap >= Number(unit?.maxAp ?? unit?.maxActionPoint ?? 100);
}
