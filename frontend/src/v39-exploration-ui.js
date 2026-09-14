import {
  V39_EXPLORATION_RULES,
  advanceV39ExplorationTurn,
  generateV39ExplorationSites,
  getV39DiscoveredFeature,
  inspectV39Survey,
  startV39SurveyTask
} from "./lib/v39-exploration-rules.js";
import { showV39Feedback } from "./v39-feedback.js";

let selectedTile = null;

const text = value => String(value ?? "").trim();

function context() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  const faction = player?.factionState || null;
  const unit = faction?.units?.find(row => text(row?.id) === text(faction?.selectedUnitId)) || null;
  return { state, player, faction, unit };
}

function showMessage(message) {
  showV39Feedback(message, { banner:true });
}

function ensureLandControls() {
  const panel = document.getElementById("footTile");
  if (!(panel instanceof HTMLElement) || document.getElementById("v39-land-survey-actions")) return;
  const actions = document.createElement("div");
  actions.id = "v39-land-survey-actions";
  actions.innerHTML = `<div><span>探索</span><b id="v39-land-exploration-result">未調査</b></div><button type="button" id="v39-land-survey-start">調査開始</button>`;
  panel.appendChild(actions);
  actions.querySelector("button")?.addEventListener("click", runSurvey);
}

function render() {
  ensureLandControls();
  const output = document.getElementById("v39-land-exploration-result");
  const button = document.getElementById("v39-land-survey-start");
  if (!output || !(button instanceof HTMLButtonElement)) return;
  if (!selectedTile) {
    output.textContent = "マスを選択";
    button.disabled = true;
    return;
  }
  const { state, player, faction, unit } = context();
  const key = `${Math.floor(Number(selectedTile.x))},${Math.floor(Number(selectedTile.y))}`;
  const feature = getV39DiscoveredFeature(faction, key);
  const surveyed = faction?.exploration?.surveyedTileKeys?.includes(key);
  const task = unit?.surveyTask;
  output.textContent = feature?.definition?.name || (surveyed ? "異常なし" : task?.key === key ? `調査中 / 残${task.remainingTurns}T` : "未調査");
  const check = inspectV39Survey(state, player?.id, unit?.id, selectedTile);
  button.disabled = !check.available;
  button.textContent = task?.key === key ? "調査中" : surveyed ? "調査済み" : "調査開始";
  button.title = check.available ? "次のターン処理で完了" : check.reasons.join(" / ");
}

function runSurvey() {
  const { state, player, unit } = context();
  const result = startV39SurveyTask(state, player?.id, unit?.id, selectedTile);
  if (!result.ok) {
    showMessage(`調査不可: ${result.reason}`);
    render();
    return result;
  }
  window.setV39GameState?.({ players:result.state.players }, { reason:"survey-started" });
  showMessage(`${text(result.unit?.name) || "キャラクター"}: 調査開始 / 次のターンに完了`);
  window.dispatchEvent(new CustomEvent("v39:survey-started", { detail:{ ...result.task, unitId:result.unit?.id, playerId:player?.id } }));
  render();
  return result;
}

function initializeSites(event) {
  const state = window.getV39GameState?.();
  const mapData = event?.detail?.mapData || window.__v39FieldRuntime?.mapData;
  if (!state || !mapData || event?.detail?.restored) return;
  const explorationSitesByTile = generateV39ExplorationSites(mapData, { seed:`${mapData.w}x${mapData.h}:${mapData.patternId || "map"}` });
  const players = state.players.map(player => ({
    ...player,
    factionState:{ ...player.factionState, exploration:{ discoveredFeaturesByTile:{}, surveyedTileKeys:[], history:[], lastProcessedTurn:0 } }
  }));
  window.setV39GameState?.({ explorationSitesByTile, players }, { reason:"exploration-sites-generated" });
  window.dispatchEvent(new CustomEvent("v39:exploration-sites-generated", { detail:{ count:Object.keys(explorationSitesByTile).length } }));
}

function advanceTurn(event) {
  const state = window.getV39GameState?.();
  if (!state) return;
  const result = advanceV39ExplorationTurn(state, event?.detail?.turnNumber);
  window.setV39GameState?.({ players:result.state.players, dangerPercentByTile:result.state.dangerPercentByTile, territoryOwnerByTile:result.state.territoryOwnerByTile, territoryStateByTile:result.state.territoryStateByTile }, { reason:"exploration-turn" });
  for (const report of result.reports) {
    window.dispatchEvent(new CustomEvent("v39:exploration-log", { detail:report }));
    showMessage(report.message);
  }
}

function installStyles() {
  if (document.getElementById("v39-exploration-style")) return;
  const style = document.createElement("style");
  style.id = "v39-exploration-style";
  style.textContent = `#v39-land-survey-actions{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:6px;align-items:center;padding:6px;border:1px solid #3b5962;border-radius:7px;background:#132229}#v39-land-survey-actions div{min-width:0}#v39-land-survey-actions span,#v39-land-survey-actions b{display:block}#v39-land-survey-actions span{font-size:13px;color:#94a9ae}#v39-land-survey-actions b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#v39-land-survey-start{min-height:36px;border:1px solid #c39a3d;border-radius:6px;background:#352c15;color:#ffe4a0;font-size:15px;font-weight:800;cursor:pointer}#v39-land-survey-start:disabled{cursor:not-allowed;opacity:.45}`;
  document.head.appendChild(style);
}

window.addEventListener("v39:field-generated", initializeSites);
window.addEventListener("v39:turn-stage-exploration", advanceTurn);
window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; render(); });
window.addEventListener("v39:game-state-changed", render);
window.addEventListener("v39:operation-ui-ready", render);
window.getV39ExplorationRules = () => ({ ...V39_EXPLORATION_RULES });
window.inspectV39Survey = tile => { const current = context(); return inspectV39Survey(current.state, current.player?.id, current.unit?.id, tile || selectedTile); };
window.startV39Survey = tile => { if (tile) selectedTile = tile; return runSurvey(); };
window.generateV39ExplorationSites = generateV39ExplorationSites;

installStyles();
render();
