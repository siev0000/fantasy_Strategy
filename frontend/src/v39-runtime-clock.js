const TICK_INTERVAL_MS = 100;
const MAX_REAL_TICK_MS = 250;

let lastRealTime = performance.now();
let timerId = 0;

function currentTimeline() {
  const value = window.getV39GameState?.()?.timeline || {};
  return {
    turnNumber: Math.max(1, Math.floor(Number(value.turnNumber) || 1)),
    paused: value.paused === true,
    elapsedMs: Math.max(0, Number(value.elapsedMs) || 0),
    lastTurnAdvancedAtMs: Math.max(0, Number(value.lastTurnAdvancedAtMs) || 0)
  };
}

export function advanceRuntimeTime(deltaMs, options = {}) {
  const delta = Math.max(0, Number(deltaMs) || 0);
  const state = window.getV39GameState?.();
  if (!state || delta <= 0) return currentTimeline().elapsedMs;
  const timeline = currentTimeline();
  if (timeline.paused && options.force !== true) return timeline.elapsedMs;
  const next = { ...timeline, elapsedMs:timeline.elapsedMs + delta };
  window.setV39GameState?.({ timeline:next }, { silent:true, reason:"runtime-clock" });
  window.dispatchEvent(new CustomEvent("v39:runtime-tick", {
    detail:{ deltaMs:delta, elapsedMs:next.elapsedMs, forced:options.force === true }
  }));
  return next.elapsedMs;
}

function tick() {
  const now = performance.now();
  const delta = Math.min(MAX_REAL_TICK_MS, Math.max(0, now - lastRealTime));
  lastRealTime = now;
  if (!document.hidden) advanceRuntimeTime(delta);
}

function installAdvanceTimeHook() {
  window.advanceTime = (deltaMs = TICK_INTERVAL_MS) => {
    advanceRuntimeTime(deltaMs, { force:true });
    return window.render_game_to_text?.() || "";
  };
}

timerId = window.setInterval(tick, TICK_INTERVAL_MS);
window.addEventListener("v39:field-runtime-ready", installAdvanceTimeHook);
window.addEventListener("beforeunload", () => window.clearInterval(timerId), { once:true });
window.advanceV39RuntimeTime = advanceRuntimeTime;
window.getV39RuntimeTimeMs = () => currentTimeline().elapsedMs;
installAdvanceTimeHook();
