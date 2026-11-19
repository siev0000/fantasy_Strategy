import { applyEnemyPlanToSimulation, attachEnemyAiPlanningCache, isAliveEnemyAiUnit, planNextEnemyAction, precomputeEnemyAiCandidates } from "../lib/v39-enemy-ai-planner.js";

let state = null;
let mapData = null;
let turnNumber = 1;
let processed = 0;

let fieldSignature;
let planningCache;
let precomputeTimer;

function stopPrecompute() {
  clearTimeout(precomputeTimer);
}

function reusePlanningCache(map) {
  const signature = JSON.stringify(map);
  if (signature !== fieldSignature) {
    fieldSignature = signature;
    planningCache = { sight:new Map(), detection:new Map(), movement:new Map(), exploration:new Map() };
  }
  attachEnemyAiPlanningCache(map, planningCache);
}

function startPrecompute(snapshot, map, turn) {
  stopPrecompute();
  reusePlanningCache(map);
  const enemies = snapshot.enemies.filter(isAliveEnemyAiUnit);
  let index = 0;
  const batch = () => {
    const deadline = performance.now() + 6;
    while (index < enemies.length && performance.now() < deadline) {
      precomputeEnemyAiCandidates(snapshot, map, turn, enemies[index++]);
    }
    if (index < enemies.length) precomputeTimer = setTimeout(batch, 16);
  };
  if (enemies.length) precomputeTimer = setTimeout(batch, 0);
}

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "precompute") {
    startPrecompute(message.state, message.mapData, message.turnNumber);
    return;
  }
  if (message.type === "pause-precompute") {
    stopPrecompute();
    return;
  }
  if (message.type === "initialize") {
    stopPrecompute();
    if (planningCache) reusePlanningCache(message.mapData);
    state = message.state;
    mapData = message.mapData;
    turnNumber = message.turnNumber;
    processed = 0;
    self.postMessage({ type:"ready" });
    return;
  }
  if (message.type === "sync") {
    state = message.state;
    self.postMessage({ type:"synced" });
    return;
  }
  if (message.type !== "next" || !state) return;
  const startedAt = performance.now();
  const plan = planNextEnemyAction(state, mapData, turnNumber);
  const calculationMs = performance.now() - startedAt;
  if (!plan) {
    self.postMessage({ type:"complete", processed, calculationMs });
    return;
  }
  if (!plan.requiresSync) state = applyEnemyPlanToSimulation(state, plan);
  processed += 1;
  self.postMessage({ type:"action", plan, processed, calculationMs });
});
