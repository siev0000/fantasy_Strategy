const BUILD_MEASUREMENT_ENABLED = import.meta.env.DEV || import.meta.env.MODE === "teston";
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
let latestEnemyAiPerformance = null;
let testModeAnnounced = false;

function nowMs() {
  return typeof performance?.now === "function" ? performance.now() : Date.now();
}

function runtimeMeasurementEnabled() {
  return BUILD_MEASUREMENT_ENABLED
    || window.isV39TestMode?.() === true
    || window.getV39DisplaySettings?.()?.testMode === true;
}

function formatMemory(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "N/A";
  const megaBytes = value / (1024 * 1024);
  return `${megaBytes >= 100 ? megaBytes.toFixed(0) : megaBytes.toFixed(1)} MB`;
}

function announceTestModeIfNeeded() {
  if (!runtimeMeasurementEnabled() || testModeAnnounced) return;
  if (typeof window.pushV39SideRailMessage !== "function") return;
  testModeAnnounced = true;
  window.pushV39SideRailMessage({
    channel:"notification",
    title:"TEST ON",
    message:"ターン終了処理の計測を有効化しました。",
    tone:"debug",
    turn:null
  });
}

function finishCurrentTurnStage(atMs) {
  if (!activeTurnPerformance?.stage) return;
  activeTurnPerformance.stages.push({
    key:activeTurnPerformance.stage,
    ms:Math.max(0, atMs - activeTurnPerformance.stageStartedAt)
  });
}

function beginTurnMeasurement(turnNumber) {
  if (!runtimeMeasurementEnabled()) {
    activeTurnPerformance = null;
    return;
  }
  announceTestModeIfNeeded();
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

function enemyAiDetails(turnNumber) {
  const row = latestEnemyAiPerformance;
  if (!row || Math.floor(Number(row.turnNumber)) !== Math.floor(Number(turnNumber))) return "";
  const timings = row.timings || {};
  const counts = row.counts || {};
  return [
    `生存敵 ${Math.floor(Number(row.aliveEnemies) || 0)}体 / プレイヤー対象 ${Math.floor(Number(row.playerTargets) || 0)}体`,
    `AIループ ${Math.floor(Number(row.aiPasses) || 0)}回 / 上限 ${Math.floor(Number(row.actionLimit) || 0)}回`,
    `状態更新 ${Math.floor(Number(counts.state) || 0)}回: ${Math.round(Number(timings.state) || 0)}ms`,
    `戦闘処理 ${Math.floor(Number(counts.combat) || 0)}回: ${Math.round(Number(timings.combat) || 0)}ms`,
    `地上物資回収 ${Math.floor(Number(counts.loot) || 0)}回: ${Math.round(Number(timings.loot) || 0)}ms`,
    `巣への搬入 ${Math.floor(Number(counts.deposit) || 0)}回: ${Math.round(Number(timings.deposit) || 0)}ms`,
    `Worker計算: ${Math.round(Number(row.workerCalculationMs) || 0)}ms / メイン側反映: ${Math.round(Number(row.mainApplyMs) || 0)}ms`,
    `Worker全体: ${Math.round(Number(row.workerTotalMs) || 0)}ms / フォールバック: ${row.fallbackUsed === true ? "あり" : "なし"}`,
    `AI判断・探索など: ${Math.round(Number(row.otherAiMs) || 0)}ms`,
    `移動した敵 ${Math.floor(Number(row.movedEnemies) || 0)}体 / 判断ログ +${Math.floor(Number(row.decisionLogsAdded) || 0)} / 発動待機 ${Math.floor(Number(row.pendingActions) || 0)}`,
    `行動イベント ${Math.floor(Number(row.actionEventCount) || 0)}件 / 索敵内演出 ${Math.floor(Number(row.presentationEventCount) || 0)}件`
  ].join("\n");
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
  const details = enemyAiDetails(latestTurnPerformance.turnNumber);
  window.pushV39SideRailMessage?.({
    channel:"notification",
    title:`T${latestTurnPerformance.turnNumber} ターン処理`,
    message:performanceSummary(latestTurnPerformance),
    details,
    collapsible:details.length > 0,
    meta:`メモリ ${formatMemory(performance?.memory?.usedJSHeapSize)}`,
    tone:latestTurnPerformance.totalMs >= 1000 ? "warn" : "debug",
    turn:latestTurnPerformance.turnNumber
  });
  window.dispatchEvent(new CustomEvent("v39:turn-performance-measured", { detail:{ ...latestTurnPerformance, enemyAi:details ? { ...latestEnemyAiPerformance } : null } }));
}

function installTurnMeasurement() {
  window.addEventListener("v39:turn-phase-changed", event => {
    if (String(event?.detail?.phase || "") !== "enemy") return;
    beginTurnMeasurement(event?.detail?.turnNumber);
  });
  for (const stage of TURN_STAGE_KEYS) {
    window.addEventListener(`v39:turn-stage-${stage}`, () => beginTurnStage(stage));
  }
  window.addEventListener("v39:enemy-ai-performance", event => {
    latestEnemyAiPerformance = event?.detail && typeof event.detail === "object" ? { ...event.detail } : null;
  });
  window.addEventListener("v39:turn-advanced", event => completeTurnMeasurement(event?.detail));
  window.addEventListener("v39:display-settings-changed", announceTestModeIfNeeded);
  window.addEventListener("v39:operation-ui-ready", announceTestModeIfNeeded);
  window.addEventListener("v39:bootstrap-complete", announceTestModeIfNeeded);
}

window.getV39LastTurnPerformance = () => latestTurnPerformance ? {
  ...latestTurnPerformance,
  stages:latestTurnPerformance.stages.map(row => ({ ...row })),
  enemyAi:latestEnemyAiPerformance ? { ...latestEnemyAiPerformance } : null
} : null;
window.isV39TurnPerformanceEnabled = runtimeMeasurementEnabled;

installTurnMeasurement();
