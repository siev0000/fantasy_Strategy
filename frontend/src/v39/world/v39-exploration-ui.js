import {
  V39_EXPLORATION_RULES,
  advanceV39ExplorationTurn,
  generateV39ExplorationSites,
  getV39DiscoveredFeature,
  inspectV39Survey,
  startV39SurveyTask
} from "../../lib/v39-exploration-rules.js";
import { generateV39VictoryLandmarks } from "../../lib/v39-victory-landmarks.js";
import { getFactionSettlements } from "../../lib/settlement-state.js";
import { showV39Feedback } from "../ui/v39-feedback.js";
import { inspectV39Gather, gatherV39Resources } from "../../lib/v39-gather-rules.js";
import { generateV39Specialties } from "../../lib/v39-specialty-rules.js";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";

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
  actions.innerHTML = `<div><span>探索</span><b id="v39-land-exploration-result">未調査</b></div><button type="button" id="v39-land-survey-start" hidden>残留品回収</button>`;
  panel.appendChild(actions);
  actions.querySelector("button")?.addEventListener("click", () => runSurvey());
}

function render() {
  ensureLandControls();
  const { state, player, faction, unit } = context();
  const gatherButton = document.getElementById("mobileBattleGather");
  if (gatherButton instanceof HTMLElement) {
    if (gatherButton.dataset.gatherBound !== "1") {
      gatherButton.dataset.gatherBound = "1";
      document.getElementById("mobileBattleGatherUse").addEventListener("click", event => {
        event.preventDefault(); event.stopImmediatePropagation(); runGather();
      }, true);
    }
    const cave = window.inspectV39CaveGather?.();
    const check = cave || inspectV39Gather(state, player?.id, unit?.id, window.__v39FieldRuntime?.mapData);
    const hasTarget = cave ? cave.hasTarget : !!unit && Object.keys(check.yields).length > 0 && !state?.territoryOwnerByTile?.[check.key];
    gatherButton.hidden = !hasTarget;
    renderGatherHint(cave ? null : hasTarget ? unit : null, check.available);
    gatherButton.classList.toggle("unavailable", !check.available);
    document.getElementById("mobileBattleGatherUse").disabled = !check.available;
    gatherButton.setAttribute("aria-disabled", String(!check.available));
    gatherButton.title = cave ? check.reason || "選択した鉱床から採取" : check.available ? "現在地の資源を運搬品へ積載" : check.reasons.join(" / ");
    document.getElementById("mobileGatherAp").textContent = `AP ${check.apCost}`;
    document.getElementById("mobileGatherYield").textContent = cave
      ? cave.site ? `${cave.site.icon} ${cave.site.name} (${cave.site.x},${cave.site.y}) / 残り${cave.site.remaining}${cave.reason ? ` / ${cave.reason}` : ""}` : cave.reason
      : check.available
      ? Object.entries(check.accepted.resourcesByType).map(([name, amount]) => `${name} ${amount}`).join(" / ")
      : check.reasons[0];
  }
  const action = document.getElementById("mobileBattleSurvey");
  if (action instanceof HTMLElement) {
    if (action.dataset.surveyBound !== "1") {
      action.dataset.surveyBound = "1";
      document.getElementById("mobileBattleSurveyUse").addEventListener("click", event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const current = context();
        runSurvey(current.unit ? { x:current.unit.x, y:current.unit.y } : null, false);
      }, true);
    }
    const check = inspectV39Survey(state, player?.id, unit?.id, unit);
    // 詳細は実行不可でも開ける。使用ボタンだけを無効化する。
    document.getElementById("mobileBattleSurveyUse").disabled = !check.available;
    action.setAttribute("aria-disabled", String(!check.available));
    action.classList.toggle("unavailable", !check.available);
    action.title = check.available ? `索敵範囲${check.tileKeys.length}マスを調査 / 残りAP全消費` : check.reasons.join(" / ");
    document.getElementById("mobileSurveyAp").textContent = `AP ${check.apCost}→0`;
    const progress = unit?.surveyTask?.progressPercent;
    const surveyed = check.tileKeys.length > 0 && check.tileKeys.every(key => faction?.exploration?.surveyedTileKeys?.includes(key));
    document.getElementById("mobileSurveyProgress").textContent = unit?.surveyTask
      ? `${Math.round(progress ?? 100)}%${(progress ?? 100) >= 100 ? " / 結果待ち" : " / 継続"}` : surveyed ? "調査済み" : "未調査";
  }
  const output = document.getElementById("v39-land-exploration-result");
  const button = document.getElementById("v39-land-survey-start");
  if (!output || !(button instanceof HTMLButtonElement)) return;
  if (!selectedTile) {
    output.textContent = "マスを選択";
    button.disabled = true;
    button.hidden = true;
    return;
  }
  const key = `${Math.floor(Number(selectedTile.x))},${Math.floor(Number(selectedTile.y))}`;
  const feature = getV39DiscoveredFeature(faction, key);
  const surveyed = faction?.exploration?.surveyedTileKeys?.includes(key);
  const task = unit?.surveyTask;
  const groundLoot = state?.groundLootByTile?.[key];
  const groundLootDiscovered = groundLoot?.discoveredByPlayerIds?.includes(text(player?.id));
  const resourceCount = Object.values(groundLoot?.cargo?.resourcesByType || {}).reduce((sum, amount) => sum + Number(amount || 0), 0);
  const equipmentCount = groundLoot?.cargo?.equipmentInventory?.length || 0;
  const lootText = groundLootDiscovered ? `残留品 ${resourceCount + equipmentCount}` : "";
  output.textContent = [feature?.definition?.name, lootText].filter(Boolean).join(" / ")
    || faction?.exploration?.discoveredSpecialtiesByTile?.[key]?.name
    || (surveyed ? "異常なし" : task?.key === key ? `調査中 / ${Math.round(task.progressPercent ?? 100)}%` : "未調査");
  button.hidden = !groundLootDiscovered;
  if (groundLootDiscovered) {
    button.disabled = !unit || Math.floor(Number(unit.x)) !== Number(selectedTile.x) || Math.floor(Number(unit.y)) !== Number(selectedTile.y);
    button.textContent = "残留品回収";
    button.title = button.disabled ? "キャラクターと同じマスで実行してください" : "部隊所持品へ移す";
    return;
  }
}

function renderGatherHint(unit, available) {
  const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if(!scene)return;
  scene.v39GatherHint?.destroy(true);
  scene.v39GatherHint=null;
  if(!unit)return;
  const x=unit.x*HEX_TILE_CONFIG.width+(unit.y%2?HEX_TILE_CONFIG.oddRowOffsetX:0)+HEX_TILE_CONFIG.width*.78;
  const y=unit.y*HEX_TILE_CONFIG.rowStep+HEX_TILE_CONFIG.height*.22;
  const container=scene.add.container(x,y).setDepth(108);
  const background=scene.add.graphics().fillStyle(0x172a30,.95).lineStyle(1,0xaed9dd,.8);
  const size=HEX_TILE_CONFIG.width*.28;
  background.fillRoundedRect(-size/2,-size/2,size,size,4).strokeRoundedRect(-size/2,-size/2,size,size,4);
  background.fillTriangle(-size*.2,size/2,0,size*.7,size*.15,size/2);
  const marker=scene.add.text(0,0,"⛏",{fontSize:`${size*.75}px`,color:"#ffe3a1"}).setOrigin(.5).setInteractive();
  marker.on("pointerdown",()=>window.openV39ActionDetail?.("__system_gather__"));
  container.add([background,marker]);container.setAlpha(available?1:.5);scene.v39GatherHint=container;
}

function runGather() {
  window.cancelV39SelectedUnitMove?.("gather-command");
  window.cancelV39SelectedUnitAttack?.("gather-command");
  if(window.__v39FieldRuntime?.mapData?.isUnderground)return window.gatherV39SelectedCaveSite?.();
  const { state, player, unit } = context();
  const result = gatherV39Resources(state, player?.id, unit?.id, window.__v39FieldRuntime?.mapData);
  if (!result.ok) showMessage(`採取不可: ${result.reason}`);
  else {
    window.setV39GameState?.({ players:result.state.players }, { reason:"resources-gathered" });
    const cargoText = Object.entries(result.accepted.resourcesByType).map(([name, amount]) => `${name} ${amount}`).join(" / ");
    window.appendV39ActivityLog?.(player.id, "物資", `${unit.name}: 採取 ${cargoText}`, { key:result.key, apCost:result.apCost });
    showMessage(`採取: ${cargoText} / AP-${result.apCost}`);
  }
  return result;
}

function runSurvey(tile = selectedTile, allowRecovery = true) {
  window.cancelV39SelectedUnitMove?.("survey-command");
  window.cancelV39SelectedUnitAttack?.("survey-command");
  const { state, player, unit } = context();
  const key = tile ? `${Math.floor(Number(tile.x))},${Math.floor(Number(tile.y))}` : "";
  const groundLoot = state?.groundLootByTile?.[key];
  if (allowRecovery && groundLoot?.discoveredByPlayerIds?.includes(text(player?.id))) {
    const recovered = window.recoverV39GroundLoot?.(player?.id, unit?.id, key);
    if (!recovered?.ok) showMessage(`回収不可: ${recovered?.reason || "実行できません"}`);
    else showMessage(`${text(unit?.name) || "キャラクター"}: 残留品を回収`);
    render();
    return recovered;
  }
  const result = startV39SurveyTask(state, player?.id, unit?.id, tile);
  if (!result.ok) {
    showMessage(`調査不可: ${result.reason}`);
    render();
    return result;
  }
  window.setV39GameState?.({ players:result.state.players }, { reason:"survey-started" });
  showMessage(`${text(result.unit?.name) || "キャラクター"}: 調査 ${Math.round(result.task.progressPercent)}% / AP-${result.apCost}${result.task.progressPercent >= 100 ? " / ターン終了時に完了" : ""}`);
  window.dispatchEvent(new CustomEvent("v39:survey-started", { detail:{ ...result.task, unitId:result.unit?.id, playerId:player?.id } }));
  render();
  return result;
}

function initialSettlementPositions(state) {
  return (state?.players || []).flatMap(player => getFactionSettlements(player?.factionState)
    .filter(settlement => settlement?.placed && Number.isFinite(Number(settlement?.x)) && Number.isFinite(Number(settlement?.y)))
    .map(settlement => ({ x:Math.floor(Number(settlement.x)), y:Math.floor(Number(settlement.y)) })));
}

function initializeSites(event) {
  const state = window.getV39GameState?.();
  const mapData = event?.detail?.mapData || window.__v39FieldRuntime?.mapData;
  if (!state || !mapData || event?.detail?.restored) return;
  const patternId = event?.detail?.settings?.patternId || window.__v39FieldRuntime?.settings?.patternId || mapData.patternId || "realistic";
  const seed = `${mapData.w}x${mapData.h}:${patternId}`;
  const victoryLandmarksByTile = generateV39VictoryLandmarks(mapData, {
    seed,
    patternId,
    startPositions:initialSettlementPositions(state)
  });
  const reservedTileKeys = Object.values(victoryLandmarksByTile)
    .flatMap(landmark => Array.isArray(landmark?.occupiedTileKeys) ? landmark.occupiedTileKeys : [landmark?.key])
    .filter(Boolean);
  const normalSitesByTile = generateV39ExplorationSites(mapData, { seed, reservedTileKeys });
  const specialtiesByTile = generateV39Specialties(mapData, {
    seed, reservedTileKeys,
    playerCount:state.players.filter(player => player.isPlayer !== false).length,
  });
  // Survey dispatch stays in one map; the dedicated record keeps landmark state queryable without type inference.
  const explorationSitesByTile = { ...normalSitesByTile, ...victoryLandmarksByTile };
  const players = state.players.map(player => ({
    ...player,
    factionState:{ ...player.factionState, exploration:{ discoveredFeaturesByTile:{}, discoveredSpecialtiesByTile:{}, surveyedTileKeys:[], history:[], lastProcessedTurn:0 } }
  }));
  window.setV39GameState?.({ explorationSitesByTile, specialtiesByTile, victoryLandmarksByTile, players }, { reason:"exploration-sites-generated" });
  window.dispatchEvent(new CustomEvent("v39:exploration-sites-generated", { detail:{ count:Object.keys(explorationSitesByTile).length, landmarkCount:Object.keys(victoryLandmarksByTile).length } }));
}

function clearSitesForNewField(event) {
  if (event?.detail?.restored) return;
  const state = window.getV39GameState?.();
  if (!state || (!Object.keys(state.explorationSitesByTile || {}).length && !Object.keys(state.victoryLandmarksByTile || {}).length && !Object.keys(state.specialtiesByTile || {}).length)) return;
  window.setV39GameState?.({ explorationSitesByTile:{}, specialtiesByTile:{}, victoryLandmarksByTile:{} }, { reason:"exploration-sites-cleared" });
}

function advanceTurn(event) {
  const state = window.getV39GameState?.();
  if (!state) return;
  const result = advanceV39ExplorationTurn(state, event?.detail?.turnNumber);
  window.setV39GameState?.({ players:result.state.players, dangerPercentByTile:result.state.dangerPercentByTile, territoryOwnerByTile:result.state.territoryOwnerByTile, territoryStateByTile:result.state.territoryStateByTile, groundLootByTile:result.state.groundLootByTile }, { reason:"exploration-turn" });
  for (const report of result.reports) {
    window.dispatchEvent(new CustomEvent("v39:exploration-log", { detail:report }));
  }
  const ownReports = result.reports.filter(row => row.playerId === state.activePlayerId);
  if (ownReports.length) {
    const found = [...new Set(ownReports.flatMap(row => [row.featureName, row.specialtyName, row.groundLootDiscovered ? "残留品" : ""]).filter(Boolean))];
    showMessage(`調査: ${ownReports.length}マス / ${found.join(" / ") || ownReports[0].message}`);
  }
}

function installStyles() {
  if (document.getElementById("v39-exploration-style")) return;
  const style = document.createElement("style");
  style.id = "v39-exploration-style";
  style.textContent = `#v39-land-survey-actions{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) 112px;gap:6px;align-items:center;padding:6px;border:1px solid #3b5962;border-radius:7px;background:#132229}#v39-land-survey-actions div{min-width:0}#v39-land-survey-actions span,#v39-land-survey-actions b{display:block}#v39-land-survey-actions span{font-size:var(--font-secondary);color:#94a9ae}#v39-land-survey-actions b{font-size:var(--font-body);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#v39-land-survey-start{min-height:36px;border:1px solid #c39a3d;border-radius:6px;background:#352c15;color:#ffe4a0;font-size:var(--font-body);font-weight:800;cursor:pointer}#v39-land-survey-start:disabled{cursor:not-allowed;opacity:.45}`;
  document.head.appendChild(style);
}

// 初期拠点の座標が確定してから、全開始地点から遠い候補地を生成する。
window.addEventListener("v39:field-generated", clearSitesForNewField);
window.addEventListener("v39:initial-placement-complete", initializeSites);
window.addEventListener("v39:turn-stage-exploration", advanceTurn);
window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; render(); });
window.addEventListener("v39:game-state-changed", render);
window.addEventListener("v39:unit-selected", render);
window.addEventListener("v39:operation-ui-ready", render);
window.addEventListener("v39:squad-detail-rendered", render);
window.addEventListener("v39:cave-gather-target-changed", render);
window.addEventListener("v39:field-layer-changed", render);
window.getV39ExplorationRules = () => ({ ...V39_EXPLORATION_RULES });
window.inspectV39Survey = tile => { const current = context(); return inspectV39Survey(current.state, current.player?.id, current.unit?.id, tile || selectedTile); };
window.startV39Survey = tile => { if (tile) selectedTile = tile; return runSurvey(); };
window.gatherV39SelectedUnit = runGather;
window.generateV39ExplorationSites = generateV39ExplorationSites;

installStyles();
render();
