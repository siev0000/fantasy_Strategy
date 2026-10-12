import { V39_CAVE_NEST_BALANCE } from "./v39-gameplay-balance.js";

const nonnegative = value => Number.isFinite(Number(value)) ? Math.max(0,Number(value)) : 0;

// 洞窟の巣成立候補に使う計算。未鉱床化奥地の再巣化でも共用する。
// canProgressは個体数・食料などの判定結果。条件不足時の扱いは暫定で進捗保持。
export function advanceV39CaveNestProgress(previous = {}, turnNumber, {playerPresent = false, canProgress = true} = {}, rules = V39_CAVE_NEST_BALANCE) {
  const turn = Math.floor(Number(turnNumber));
  if (!Number.isFinite(turn) || turn < 1 || previous.lastProcessedTurn >= turn) return {...previous};
  const required = Math.max(1,nonnegative(rules.establishmentTurns));
  const current = nonnegative(previous.progressTurns);
  const delta = playerPresent ? -nonnegative(rules.intrusionRollbackPerTurn)
    : canProgress ? nonnegative(rules.progressPerTurn) : 0;
  const progressTurns = Math.max(0,Math.min(required,current + delta));
  return {...previous,progressTurns,lastProcessedTurn:turn,ready:canProgress && !playerPresent && progressTurns >= required};
}
