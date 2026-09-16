const BUILD_ENABLED = import.meta.env.DEV || import.meta.env.MODE === "teston";

let latestProfile = null;

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function runtimeEnabled() {
  return BUILD_ENABLED
    || window.isV39TestMode?.() === true
    || window.getV39DisplaySettings?.()?.testMode === true;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value ?? "").trim();
}

function isAlive(unit) {
  return number(unit?.hp ?? unit?.currentHp, 0) > 0 && text(unit?.state || unit?.statusName) !== "死亡";
}

function decisionLogCount(state) {
  return Object.values(state?.enemyCombatRuntime?.decisionLogsByFactionId || {})
    .reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);
}

function pendingActionCount(state) {
  return Object.keys(state?.enemyCombatRuntime?.pendingActionsByEnemyId || {}).length;
}

function createProfile(turnNumber, state) {
  const alive = (state?.enemies || []).filter(isAlive);
  return {
    turnNumber:Math.max(1, Math.floor(number(turnNumber, 1))),
    startedAt:nowMs(),
    totalMs:0,
    aliveEnemies:alive.length,
    playerTargets:(state?.players || []).flatMap(player => player?.factionState?.units || []).filter(isAlive).length,
    actionLimit:Math.max(1, alive.length * 2),
    aiPasses:0,
    movedEnemies:0,
    decisionLogsAdded:0,
    pendingActions:0,
    timings:{ state:0, combat:0, loot:0, deposit:0 },
    counts:{ state:0, combat:0, loot:0, deposit:0 },
    stack:[]
  };
}

function wrapTimedFunction(profile, functionName, key) {
  const original = window[functionName];
  if (typeof original !== "function") return () => {};
  const wrapped = function(...args) {
    const startedAt = nowMs();
    const parent = profile.stack[profile.stack.length - 1] || null;
    const frame = { key, startedAt, childMs:0 };
    profile.stack.push(frame);
    try {
      return original.apply(this, args);
    } finally {
      const elapsed = Math.max(0, nowMs() - startedAt);
      profile.stack.pop();
      profile.timings[key] += Math.max(0, elapsed - frame.childMs);
      profile.counts[key] += 1;
      if (parent) parent.childMs += elapsed;
    }
  };
  window[functionName] = wrapped;
  return () => {
    if (window[functionName] === wrapped) window[functionName] = original;
  };
}

function install() {
  const originalRunEnemyTurn = window.runV39EnemyTurn;
  if (typeof originalRunEnemyTurn !== "function" || originalRunEnemyTurn.__v39Profiled === true) return;

  const profiledRunEnemyTurn = function(turnNumber, ...args) {
    if (!runtimeEnabled()) return originalRunEnemyTurn.call(this, turnNumber, ...args);

    const beforeState = window.getV39EnemyTurnState?.() || window.getV39GameState?.() || {};
    const profile = createProfile(turnNumber, beforeState);
    const beforePositions = new Map((beforeState.enemies || []).map(enemy => [text(enemy?.id), `${number(enemy?.x)},${number(enemy?.y)}`]));
    const beforeLogs = decisionLogCount(beforeState);
    const restore = [
      wrapTimedFunction(profile, "patchV39EnemyTurnState", "state"),
      wrapTimedFunction(profile, "setV39GameState", "state"),
      wrapTimedFunction(profile, "executeV39EnemyCombatAction", "combat"),
      wrapTimedFunction(profile, "recoverV39GroundLootForEnemy", "loot"),
      wrapTimedFunction(profile, "depositV39EnemyCargo", "deposit")
    ];

    let result;
    try {
      result = originalRunEnemyTurn.call(this, turnNumber, ...args);
      profile.aiPasses = Math.max(0, Math.floor(number(result, 0)));
      return result;
    } finally {
      for (const restoreFunction of restore.reverse()) restoreFunction();
      const afterState = window.getV39EnemyTurnState?.() || window.getV39GameState?.() || {};
      profile.totalMs = Math.max(0, nowMs() - profile.startedAt);
      profile.movedEnemies = (afterState.enemies || []).filter(enemy => {
        const id = text(enemy?.id);
        return beforePositions.has(id) && beforePositions.get(id) !== `${number(enemy?.x)},${number(enemy?.y)}`;
      }).length;
      profile.decisionLogsAdded = Math.max(0, decisionLogCount(afterState) - beforeLogs);
      profile.pendingActions = pendingActionCount(afterState);
      const measuredExclusive = Object.values(profile.timings).reduce((sum, value) => sum + number(value), 0);
      profile.otherAiMs = Math.max(0, profile.totalMs - measuredExclusive);
      delete profile.stack;
      latestProfile = {
        ...profile,
        timings:{ ...profile.timings },
        counts:{ ...profile.counts }
      };
      window.dispatchEvent(new CustomEvent("v39:enemy-ai-performance", { detail:{ ...latestProfile } }));
    }
  };
  profiledRunEnemyTurn.__v39Profiled = true;
  window.runV39EnemyTurn = profiledRunEnemyTurn;
}

window.getV39LastEnemyAiPerformance = () => latestProfile ? {
  ...latestProfile,
  timings:{ ...latestProfile.timings },
  counts:{ ...latestProfile.counts }
} : null;

install();
