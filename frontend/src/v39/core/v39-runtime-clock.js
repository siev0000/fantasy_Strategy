const DEFAULT_ADVANCE_MS = 100;
let animationElapsedMs = 0;

// Browser test helpers may advance visual time, but game rules advance only by turns.
export function advanceRuntimeTime(deltaMs) {
  const delta = Math.max(0, Number(deltaMs) || 0);
  animationElapsedMs += delta;
  window.dispatchEvent(new CustomEvent("v39:animation-tick", {
    detail:{ deltaMs:delta, elapsedMs:animationElapsedMs }
  }));
  return animationElapsedMs;
}

function installAdvanceTimeHook() {
  window.advanceTime = (deltaMs = DEFAULT_ADVANCE_MS) => {
    advanceRuntimeTime(deltaMs);
    return window.render_game_to_text?.() || "";
  };
}

window.addEventListener("v39:field-runtime-ready", installAdvanceTimeHook);
window.advanceV39RuntimeTime = advanceRuntimeTime;
window.getV39RuntimeTimeMs = () => animationElapsedMs;
installAdvanceTimeHook();
