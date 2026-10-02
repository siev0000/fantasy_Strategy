export function isV39UnitWaiting(unit, turnNumber) {
  return Number(unit?.waitTurnNumber) === Number(turnNumber);
}

export function isV39UnitUnacted(unit, turnNumber) {
  const ap = Number(unit?.ap ?? unit?.currentAp ?? 0);
  return Number(unit?.hp ?? unit?.currentHp ?? 0) > 0
    && (unit?.state || unit?.statusName) !== "死亡"
    && Number(unit?.x) >= 0 && Number(unit?.y) >= 0
    && ap > 0 && !isV39UnitWaiting(unit, turnNumber)
    && unit?.transportAssignment?.enabled !== true
    && Number(unit?.lastActionTurn || 0) !== Number(turnNumber)
    && Number(unit?.surveyTask?.startedTurn || 0) !== Number(turnNumber)
    && ap >= Number(unit?.maxAp ?? unit?.maxActionPoint ?? 100);
}
