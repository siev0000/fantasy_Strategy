export const V39_TURN_PHASE = Object.freeze({
  PLAYER: "player",
  ENEMY: "enemy",
  RESOLUTION: "resolution"
});

export const DEFAULT_MAGIC_CAST_TURNS = 6;
export const DEFAULT_CORPSE_FIELD_TURNS = 30;

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function parseV39TurnCount(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return Math.max(0, Math.ceil(finiteNumber(fallback)));
  const source = String(value).trim();
  if (!source || /秒/.test(source)) return Math.max(0, Math.ceil(finiteNumber(fallback)));
  const match = source.match(/-?\d+(?:\.\d+)?/);
  return Math.max(0, Math.ceil(finiteNumber(match?.[0], fallback)));
}

export function currentV39TurnNumber(state = window.getV39GameState?.()) {
  return Math.max(1, Math.floor(finiteNumber(state?.timeline?.turnNumber, 1)));
}

export function resolveV39DeadlineTurn(startTurn, duration) {
  return currentV39TurnNumber({ timeline:{ turnNumber:startTurn } }) + parseV39TurnCount(duration);
}

export function remainingV39Turns(deadlineTurn, currentTurn = currentV39TurnNumber()) {
  return Math.max(0, Math.ceil(finiteNumber(deadlineTurn) - finiteNumber(currentTurn)));
}

export function isV39TurnDeadlineReached(deadlineTurn, currentTurn = currentV39TurnNumber()) {
  return remainingV39Turns(deadlineTurn, currentTurn) <= 0;
}
