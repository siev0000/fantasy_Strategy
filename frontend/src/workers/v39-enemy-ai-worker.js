import { applyEnemyPlanToSimulation, planNextEnemyAction } from "../lib/v39-enemy-ai-planner.js";

let state = null;
let mapData = null;
let turnNumber = 1;
let processed = 0;

self.addEventListener("message", event => {
  const message = event.data || {};
  if (message.type === "initialize") {
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
