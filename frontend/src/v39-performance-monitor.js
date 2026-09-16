const ENABLED = import.meta.env.DEV || import.meta.env.MODE === "teston";
const TURN_STAGE_LABELS = Object.freeze({
  enemy:"敵",
  terrain:"地形",
  ai:"国家AI",
  exploration:"探索",
  world:"世界",
  economy:"経済",
  research:"研究",
  diplomacy:"外交・回復"
});
const TURN_STAGE_KEYS = Object.freeze(["terrain", "ai", "exploration", "world", "economy", "research", "diplomacy"]);

let latestTurnPerformance = null;
let activeTurnPerformance = null;

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function formatMemory(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "N/A";
  const megaBytes = value / (1024 * 1024);
  return `${megaBytes >= 100 ? megaBytes.toFixed(0) : megaBytes.toFixed(1)} MB`;
}

function finishCurrentTurnStage(atMs) {
  if (!activeTurnPerformance?.stage) return;
  activeTurnPerformance.stages.push({
    key:activeTurnPerformance.stage,
    ms:Math.max(0, atMs - activeTurnPerformance.stageStartedAt)
  });
}

function beginTurnMeasurement(turnNumber) {
  const startedAt = nowMs();
  activeTurnPerformance = {
    turnNumber:Math.max(1, Math.floor(Number(turnNumber) || 1)),
    startedAt,
    stage:"enemy",
    stageStartedAt:startedAt,
    stages:[]
  };
}

function beginTurnStage(stage) {
  if (!activeTurnPerformance) return;
  const atMs = nowMs();
  finishCurrentTurnStage(atMs);
  activeTurnPerformance.stage = stage;
  activeTurnPerformance.stageStartedAt = atMs;
}

function performanceSummary(performanceRow) {
  if (!performanceRow) return "";
  const slowest = [...performanceRow.stages]
    .sort((left, right) => right.ms - left.ms)
    .slice(0, 4)
    .map(row => `${TURN_STAGE_LABELS[row.key] || row.key}:${Math.round(row.ms)}ms`)
    .join(" / ");
  return `合計 ${Math.round(performanceRow.totalMs)}ms${slowest ? `\n${slowest}` : ""}`;
}

function completeTurnMeasurement(detail = {}) {
  if (!activeTurnPerformance) return;
  const finishedAt = nowMs();
  finishCurrentTurnStage(finishedAt);
  latestTurnPerformance = {
    turnNumber:Math.max(1, Math.floor(Number(detail?.previousTurn ?? activeTurnPerformance.turnNumber) || activeTurnPerformance.turnNumber)),
    totalMs:Math.max(0, finishedAt - activeTurnPerformance.startedAt),
    stages:activeTurnPerformance.stages
  };
  activeTurnPerformance = null;
  window.pushV39SideRailMessage?.({
    channel:"notification",
    title:`T${latestTurnPerformance.turnNumber} ターン処理`,
    message:performanceSummary(latestTurnPerformance),
    meta:`メモリ ${formatMemory(performance?.memory?.usedJSHeapSize)}`,
    tone:latestTurnPerformance.totalMs >= 1000 ? "warn" : "debug",
    turn:latestTurnPerformance.turnNumber
  });
  window.dispatchEvent(new CustomEvent("v39:turn-performance-measured", { detail:{ ...latestTurnPerformance } }));
}

function installTurnMeasurement() {
  if (!ENABLED) return;
  window.addEventListener("v39:turn-phase-changed", event => {
    if (String(event?.detail?.phase || "") !== "enemy") return;
    beginTurnMeasurement(event?.detail?.turnNumber);
  });
  for (const stage of TURN_STAGE_KEYS) {
    window.addEventListener(`v39:turn-stage-${stage}`, () => beginTurnStage(stage));
  }
  window.addEventListener("v39:turn-advanced", event => completeTurnMeasurement(event?.detail));
}

window.getV39LastTurnPerformance = () => latestTurnPerformance ? {
  ...latestTurnPerformance,
  stages:latestTurnPerformance.stages.map(row => ({ ...row }))
} : null;

installTurnMeasurement();
