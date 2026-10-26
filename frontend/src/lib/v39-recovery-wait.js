export const V39_RECOVERY_WAIT_BALANCE = Object.freeze({defaultTargetPercent:100,minimumPercent:1,maximumPercent:100});

export function normalizeV39RecoveryWaitPercent(value) {
  const n = Number(value);
  return value === null || value === '' || !Number.isFinite(n)
    ? V39_RECOVERY_WAIT_BALANCE.defaultTargetPercent
    : Math.min(V39_RECOVERY_WAIT_BALANCE.maximumPercent,Math.max(V39_RECOVERY_WAIT_BALANCE.minimumPercent,Math.round(n)));
}

export function isV39UnitRecoveryWaiting(unit) {
  if (!(Number(unit?.recoveryWaitTargetPercent)>0) || unit?.state === '死亡') return false;
  const hp=Number(unit?.hp??unit?.currentHp),maxHp=Number(unit?.maxHp??unit?.status?.HP);
  return hp>0 && maxHp>0 && hp<Math.ceil(maxHp*normalizeV39RecoveryWaitPercent(unit.recoveryWaitTargetPercent)/100);
}

export function finishV39RecoveryWait(unit) {
  if (!(Number(unit?.recoveryWaitTargetPercent)>0) || isV39UnitRecoveryWaiting(unit)) return unit;
  return {...unit,recoveryWaitTargetPercent:0,waitTurnNumber:0,
    ...(unit.lastAction==='回復待機'?{lastActionTurn:0,lastAction:'回復待機完了'}:{})};
}

export function updateV39RecoveryWaitSettings(state,value) {
  const target=normalizeV39RecoveryWaitPercent(value);
  return {...state,gameSettings:{...state.gameSettings,recoveryWaitHpPercent:target},
    players:(state.players||[]).map(player=>({...player,factionState:{...player.factionState,
      units:(player.factionState?.units||[]).map(unit=>Number(unit.recoveryWaitTargetPercent)>0
        ? finishV39RecoveryWait({...unit,recoveryWaitTargetPercent:target}):unit)}}))};
}
