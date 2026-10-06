const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

const originalPlayV39MapEffect = window.__v39OriginalPlayV39MapEffect
  || (typeof window.playV39MapEffect === "function" ? window.playV39MapEffect : null);

let visibleWorldId = "surface";
let pendingAtResolution = [];
let deferredEffects = [];
let replaying = false;

function currentState() {
  return window.getV39GameState?.({ includeWorlds:false }) || window.getV39GameState?.() || null;
}

function currentPhase() {
  return text(currentState()?.timeline?.phase).toLowerCase();
}

function targetPoint(value) {
  const x = number(value?.tileX ?? value?.x, Number.NaN);
  const y = number(value?.tileY ?? value?.y, Number.NaN);
  return Number.isFinite(x) && Number.isFinite(y)
    ? { x:integer(x), y:integer(y) }
    : null;
}

function snapshotPendingActions(turnNumber) {
  const state = currentState();
  visibleWorldId = text(state?.activeWorldId, "surface");
  const resolveTurn = Math.max(1, integer(turnNumber, integer(state?.timeline?.turnNumber, 1)) + 1);
  const rows = [];
  for (const player of state?.players || []) {
    const units = Array.isArray(player?.factionState?.units) ? player.factionState.units : [];
    for (const pending of Object.values(player?.factionState?.combatRuntime?.pendingActionsByUnitId || {})) {
      if (integer(pending?.resolvesAtTurn, resolveTurn + 1) > resolveTurn) continue;
      const target = targetPoint(pending?.target);
      if (!target) continue;
      const unit = units.find(row => text(row?.id) === text(pending?.unitId));
      rows.push({
        playerId:text(player?.id),
        unitId:text(pending?.unitId),
        skillName:text(pending?.skillName),
        worldId:text(unit?.worldId, "surface"),
        target,
        captured:false
      });
    }
  }
  pendingAtResolution = rows;
}

function matchingPendingAction(request) {
  if (replaying || currentPhase() !== "resolution") return null;
  const target = targetPoint(request);
  if (!target) return null;
  const worldId = text(currentState()?.activeWorldId, "surface");
  return pendingAtResolution.find(row => !row.captured
    && row.worldId === worldId
    && row.target.x === target.x
    && row.target.y === target.y) || null;
}

async function playEffect(request = {}) {
  const pending = matchingPendingAction(request);
  if (!pending || typeof originalPlayV39MapEffect !== "function") {
    return originalPlayV39MapEffect ? originalPlayV39MapEffect(request) : false;
  }

  pending.captured = true;
  // 別ワールドのターン終了処理を、現在表示中のマップへ誤描画しない。
  if (pending.worldId === visibleWorldId) {
    deferredEffects.push({
      request:{ ...request },
      playerId:pending.playerId,
      unitId:pending.unitId,
      skillName:pending.skillName,
      worldId:pending.worldId
    });
    window.dispatchEvent(new CustomEvent("v39:combat-effect-deferred", { detail:{ ...pending, request:{ ...request } } }));
  }
  return true;
}

async function replayDeferredEffects(entries) {
  if (!entries.length || typeof originalPlayV39MapEffect !== "function") return 0;
  const inputToken = window.beginV39MapInputLock?.("turn-end-combat-presentation");
  replaying = true;
  let played = 0;
  try {
    for (const entry of entries) {
      if (await originalPlayV39MapEffect(entry.request)) played += 1;
    }
  } finally {
    replaying = false;
    window.endV39MapInputLock?.(inputToken, "turn-end-combat-presentation-complete");
  }
  window.dispatchEvent(new CustomEvent("v39:deferred-combat-effects-played", { detail:{ count:played } }));
  return played;
}

function scheduleReplay() {
  const entries = deferredEffects;
  deferredEffects = [];
  pendingAtResolution = [];
  if (!entries.length) return;

  // turn-advanced は描画バッチ解除直前に発火するため、次のタスクへ送って
  // マップ反映とターン処理用オーバーレイの解除後にエフェクトを再生する。
  window.setTimeout(async () => {
    await window.waitForV39MapRenderSettled?.();
    await new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    await replayDeferredEffects(entries);
  }, 0);
}

if (!window.__v39DeferredCombatEffectPresentationInstalled && typeof originalPlayV39MapEffect === "function") {
  window.__v39DeferredCombatEffectPresentationInstalled = true;
  window.__v39OriginalPlayV39MapEffect = originalPlayV39MapEffect;
  window.playV39MapEffect = playEffect;

  window.addEventListener("v39:turn-phase-changed", event => {
    const phase = text(event?.detail?.phase).toLowerCase();
    if (phase === "resolution") snapshotPendingActions(event?.detail?.turnNumber);
  });
  window.addEventListener("v39:turn-advanced", scheduleReplay);
  window.addEventListener("v39:field-generated", () => {
    pendingAtResolution = [];
    deferredEffects = [];
  });
}
