const ENABLED = import.meta.env.DEV || import.meta.env.MODE === "teston";
const UPDATE_INTERVAL_MS = 1000;
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

let monitorElement = null;
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
  updateMonitor();
}

function formatTurnPerformance() {
  if (!latestTurnPerformance) return "ターン計測: 未実行";
  const slowest = [...latestTurnPerformance.stages]
    .sort((left, right) => right.ms - left.ms)
    .slice(0, 4)
    .map(row => `${TURN_STAGE_LABELS[row.key] || row.key}:${Math.round(row.ms)}ms`)
    .join(" / ");
  return `T${latestTurnPerformance.turnNumber}: ${Math.round(latestTurnPerformance.totalMs)}ms\n${slowest || "内訳なし"}`;
}

function updateMonitor() {
  if (!(monitorElement instanceof HTMLElement)) return;
  monitorElement.textContent = `メモリ:${formatMemory(performance?.memory?.usedJSHeapSize)}\n${formatTurnPerformance()}`;
}

function installTurnMeasurement() {
  window.addEventListener("v39:turn-phase-changed", event => {
    if (String(event?.detail?.phase || "") !== "enemy") return;
    beginTurnMeasurement(event?.detail?.turnNumber);
  });
  for (const stage of TURN_STAGE_KEYS) {
    window.addEventListener(`v39:turn-stage-${stage}`, () => beginTurnStage(stage));
  }
  window.addEventListener("v39:turn-advanced", event => completeTurnMeasurement(event?.detail));
}

function install() {
  if (!ENABLED || document.getElementById("v39-memory-monitor")) return;
  const monitor = document.createElement("output");
  monitor.id = "v39-memory-monitor";
  monitor.setAttribute("aria-label", "パフォーマンス計測");
  Object.assign(monitor.style, {
    position:"fixed",
    top:"4px",
    right:"6px",
    zIndex:"1000",
    color:"#68e08c",
    fontSize:"13px",
    fontWeight:"800",
    lineHeight:"1.3",
    whiteSpace:"pre",
    textAlign:"right",
    pointerEvents:"none",
    textShadow:"0 1px 2px #000"
  });
  document.body.appendChild(monitor);
  monitorElement = monitor;
  installTurnMeasurement();
  updateMonitor();
  const intervalId = window.setInterval(updateMonitor, UPDATE_INTERVAL_MS);
  window.addEventListener("pagehide", () => window.clearInterval(intervalId), { once:true });
}

install();
