import { V39_VICTORY_CONDITION_BALANCE } from "./v39-gameplay-balance.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

function landmarkKeys(state) {
  return Object.keys(state?.victoryLandmarksByTile || {}).sort();
}

function normalizeProgress(value = {}) {
  return {
    controlledLandmarkKeys:Array.isArray(value?.controlledLandmarkKeys) ? [...new Set(value.controlledLandmarkKeys.map(text).filter(Boolean))].sort() : [],
    controlStartedTurnByTile:Object.fromEntries(Object.entries(value?.controlStartedTurnByTile || {})
      .filter(([key]) => text(key))
      .map(([key, turn]) => [text(key), Math.max(1, integer(turn, 1))]))
  };
}

export function normalizeV39VictoryState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    completed:source?.completed === true,
    winnerPlayerId:text(source?.winnerPlayerId),
    achievedTurn:Math.max(0, integer(source?.achievedTurn)),
    reason:text(source?.reason),
    progressByPlayerId:Object.fromEntries(Object.entries(source?.progressByPlayerId || {})
      .filter(([playerId]) => text(playerId))
      .map(([playerId, progress]) => [text(playerId), normalizeProgress(progress)]))
  };
}

// 支配者・維持ターンを共通状態から判定する。NPCもプレイヤーも同じ処理を使う。
export function evaluateV39Victory(state, turnNumber = state?.timeline?.turnNumber) {
  const turn = Math.max(1, integer(turnNumber, 1));
  const current = normalizeV39VictoryState(state?.victory);
  const keys = landmarkKeys(state);
  const requiredCount = Math.max(1, Math.min(keys.length || 1, integer(V39_VICTORY_CONDITION_BALANCE.requiredLandmarkCount, 1)));
  const requiredHoldTurns = Math.max(1, integer(V39_VICTORY_CONDITION_BALANCE.requiredHoldTurns, 1));
  const progressByPlayerId = {};
  let winnerPlayerId = current.winnerPlayerId;

  for (const player of state?.players || []) {
    const playerId = text(player?.id);
    if (!playerId) continue;
    const previous = normalizeProgress(current.progressByPlayerId?.[playerId]);
    const controlled = keys.filter(key => text(state?.territoryOwnerByTile?.[key]) === playerId);
    const controlledSet = new Set(controlled);
    const controlStartedTurnByTile = {};
    for (const key of controlled) controlStartedTurnByTile[key] = previous.controlledLandmarkKeys.includes(key)
      ? previous.controlStartedTurnByTile[key] || turn
      : turn;
    const progress = { controlledLandmarkKeys:controlled, controlStartedTurnByTile };
    progressByPlayerId[playerId] = progress;
    if (winnerPlayerId || controlledSet.size < requiredCount) continue;
    const heldKeys = controlled.filter(key => turn - controlStartedTurnByTile[key] + 1 >= requiredHoldTurns);
    if (heldKeys.length >= requiredCount) winnerPlayerId = playerId;
  }

  const completed = !!winnerPlayerId;
  const victory = {
    completed,
    winnerPlayerId,
    achievedTurn:completed ? (current.completed ? current.achievedTurn : turn) : 0,
    reason:completed ? `勝利対象土地を${requiredCount}地点、${requiredHoldTurns}ターン支配` : "",
    progressByPlayerId
  };
  return { state:{ ...state, victory }, changed:JSON.stringify(victory) !== JSON.stringify(current), victory, requiredCount, requiredHoldTurns };
}
