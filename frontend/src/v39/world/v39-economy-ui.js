import {
  advanceV39EconomyTurn,
  facilityDefinitions,
  resolveV39FacilityEffectsAtTile,
  resolveV39FacilityYieldMultiplier,
  inspectV39Construction,
  inspectV39SettlementDevelopment,
  normalizeV39Village,
  startV39Construction,
  startV39WallConstruction,
  startV39SettlementDevelopment
} from "../../lib/v39-economy-rules.js";
import { getSelectedSettlement,getFactionSettlementById } from "../../lib/settlement-state.js";
import {V39_INITIAL_STOCK_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {buildV39HeaderResourceSnapshot} from '../../lib/v39-settlement-resource-flow.js';
import {usesV39OperationPhases,isV39TerritoryPhase} from '../../lib/v39-operation-phases.js';
import {queueV39OperationPlan} from '../../lib/v39-operation-plans.js';
import { getVillageScaleDefinitions, resolveVillageScaleDefinition } from "../../composables/villageCoreUtils.js";
import { getHexOffsetNeighbors } from "../../lib/hex-grid.js";
import './v39-land-construction-ui.js';

const modal = document.getElementById("buildModal");
let selectedTile = null;
let selectedFacilityName = "";
let processingTurn = false;
let developmentSelection = null;
let developmentSettlementId='';

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatNumber = value => number(value).toLocaleString("ja-JP", { maximumFractionDigits:1 });
const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));

function activeContext(forDevelopment=false) {
  const state = window.getV39GameState?.({ includeWorlds:false });
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  const village=forDevelopment&&developmentSettlementId?getFactionSettlementById(player?.factionState,developmentSettlementId):getSelectedSettlement(player?.factionState);
  return { state, player, village:normalizeV39Village(village, player?.race) };
}

function targetTile(context = activeContext()) {
  const selectedKey = selectedTile ? `${selectedTile.x},${selectedTile.y}` : "";
  if (selectedKey && text(context.state?.territoryOwnerByTile?.[selectedKey]) === text(context.player?.id)) return selectedTile;
  if (context.village?.placed) return { x:context.village.x, y:context.village.y, terrain:"拠点" };
  return selectedTile;
}

function ensureBuildModalShell() {
  if (!(modal instanceof HTMLElement) || modal.dataset.v39EconomyReady === "true") return;
  modal.dataset.v39EconomyReady = "true";
  modal.innerHTML = `<div class="modal v39-build-modal">
    <div class="modal-head"><h2>拠点発展</h2><button class="close" data-close>×</button></div>
    <div class="modal-body v39-build-body">
      <header class="v39-build-summary" id="v39-build-summary"></header>
      <section class="v39-development" id="v39-development"></section>
    </div>
  </div>`;
  modal.querySelector("[data-close]")?.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("#v39-development-start")) startSelectedDevelopment();
  });
  installStyles();
}

function installStyles() {
  if (document.getElementById("v39-economy-style")) return;
  const style = document.createElement("style");
  style.id = "v39-economy-style";
  style.textContent = `
    .v39-build-modal{width:min(920px,94vw);height:min(680px,88vh)}
    .v39-build-body{display:grid!important;grid-template-rows:auto auto;align-content:start;gap:8px;overflow:auto!important}
    .v39-build-summary{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid #3f555d;border-radius:8px;background:#101d22;font-size:var(--font-body)}
    .v39-development{display:grid;gap:7px;padding:9px;border:1px solid #477680;border-radius:8px;background:#102228;color:#e9f5f3}
    .v39-development-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v39-development-head strong{font-size:var(--font-size-16)}.v39-development-head span{font-size:var(--font-secondary);color:#9bb0b4}
    .v39-development-requirements{display:flex;flex-wrap:wrap;gap:5px}.v39-development-requirement{padding:5px 7px;border:1px solid #526268;border-radius:6px;background:#17282e;font-size:var(--font-secondary)}.v39-development-requirement.met{border-color:#4d8b68;color:#bce7ca}.v39-development-requirement.shortage{border-color:#8c594f;color:#efb0a2}
    .v39-development-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.v39-development-reason{margin-right:auto;color:#e8aa91;font-size:var(--font-secondary)}
    #v39-development-start{min-height:36px;padding:6px 12px;border:1px solid #67cddd;border-radius:7px;background:#17343c;color:#efffff;font-size:var(--font-body);font-weight:800;cursor:pointer}#v39-development-start:disabled{opacity:.4;cursor:not-allowed}
    .v39-development-selection-toolbar{position:fixed;top:76px;left:50%;z-index:6000;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:9px 11px;border:2px solid #67cddd;border-radius:9px;background:rgba(9,24,29,.97);box-shadow:0 5px 18px rgba(0,0,0,.4);color:#eaffff;font-size:var(--font-body);font-weight:700}
    .v39-development-selection-toolbar button{min-height:34px;padding:5px 10px;border:1px solid #597078;border-radius:6px;background:#17282e;color:#e8f4f3;font-size:var(--font-body);font-weight:700;cursor:pointer}.v39-development-selection-toolbar button.confirm{border-color:#d2aa4c;background:#443716;color:#ffe69d}.v39-development-selection-toolbar button:disabled{opacity:.4;cursor:not-allowed}
    @media(max-width:680px){.v39-build-modal{height:92vh}}
  `;
  document.head.appendChild(style);
}

function substitutionText(payment) {
  return (payment?.substitutions || []).map(row => `${row.source}不足${formatNumber(row.missing)} → ${row.resource}+${formatNumber(row.amount)}`).join(" / ");
}

function renderBuildModal() {
  ensureBuildModalShell();
  if (!(modal instanceof HTMLElement)) return;
  const context = activeContext(true);
  const summary = modal.querySelector('#v39-build-summary');
  if(summary)summary.innerHTML=context.village?.placed
    ? `<span>拠点 <b>${escapeHtml(context.village.name||'拠点')}</b></span><span>人口 <b>${formatNumber(context.village.population)}</b></span>`
    : '<span>初期拠点を配置してください</span>';
  const development = inspectV39SettlementDevelopment(context.state, context.player?.id, context.village?.settlementId || context.village?.id);
  const developmentPanel = modal.querySelector("#v39-development");
  if (developmentPanel) {
    const requirements = (development.requirements || []).map(row => `<span class="v39-development-requirement ${row.met ? "met" : "shortage"}">${escapeHtml(row.label)} <b>${formatNumber(row.current)}/${formatNumber(row.required)}</b></span>`).join("");
    const project = development.project;
    developmentPanel.innerHTML = `<div class="v39-development-head"><strong>拠点発展: ${escapeHtml(development.current?.name || context.village?.type || "-")} ${development.next ? `→ ${escapeHtml(development.next.name)}` : ""}</strong><span>${project ? `工事中 残り${project.remainingTurns}/${project.totalTurns}T` : (development.next ? `工期 ${development.next.buildTurns}T` : "最大規模")}</span></div>
      ${requirements ? `<div class="v39-development-requirements">${requirements}</div>` : ""}
      ${development.materialPayment?.substitutions?.length ? `<div>${escapeHtml(substitutionText(development.materialPayment))}</div>` : ""}
      <div class="v39-development-actions"><span class="v39-development-reason">${escapeHtml(development.reason)}</span>${development.next ? `<button type="button" id="v39-development-start" ${development.available||(isV39TerritoryPhase(context.state)&&development.next&&!project) ? "" : "disabled"}>${project ? "発展工事中" : "拡張位置を選択"}</button>` : ""}</div>`;
  }
}

function developmentSelectionKey(tile) {
  const x = Math.floor(number(tile?.x));
  const y = Math.floor(number(tile?.y));
  return Number.isFinite(x) && Number.isFinite(y) ? `${x},${y}` : "";
}

function selectedKeysConnected(keys) {
  const selected = new Set(keys);
  if (!selected.size) return false;
  const queue = [[...selected][0]];
  const visited = new Set(queue);
  while (queue.length) {
    const [x, y] = queue.shift().split(",").map(Number);
    for (const neighbor of getHexOffsetNeighbors(x, y)) {
      const key = `${neighbor.x},${neighbor.y}`;
      if (!selected.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push(key);
    }
  }
  return visited.size === selected.size;
}

function dispatchDevelopmentSelectionChanged() {
  window.dispatchEvent(new CustomEvent("v39:settlement-development-selection-changed", {
    detail:developmentSelection ? {
      ...developmentSelection,
      candidateTileKeys:[...developmentSelection.candidateTileKeys],
      lockedTileKeys:[...developmentSelection.lockedTileKeys],
      selectedTileKeys:[...developmentSelection.selectedTileKeys]
    } : null
  }));
}

function renderDevelopmentSelectionToolbar() {
  document.getElementById("v39-development-selection-toolbar")?.remove();
  if (!developmentSelection) return;
  const toolbar = document.createElement("div");
  toolbar.id = "v39-development-selection-toolbar";
  toolbar.className = "v39-development-selection-toolbar";
  const count = developmentSelection.selectedTileKeys.size;
  toolbar.innerHTML = `<span>${escapeHtml(developmentSelection.targetName)}の範囲 ${count}/${developmentSelection.requiredTiles}マス</span><button type="button" data-development-selection-action="auto">自動選択</button><button type="button" class="confirm" data-development-selection-action="confirm"${count === developmentSelection.requiredTiles ? "" : " disabled"}>確定</button><button type="button" data-development-selection-action="cancel">キャンセル</button>`;
  document.body.appendChild(toolbar);
}

function clearDevelopmentSelection({ reopen = false } = {}) {
  developmentSelection = null;
  renderDevelopmentSelectionToolbar();
  dispatchDevelopmentSelectionChanged();
  if (reopen) window.openV39SettlementDevelopment?.(developmentSettlementId);
}

function beginDevelopmentSelection() {
  const context = activeContext(true);
  const inspection = inspectV39SettlementDevelopment(context.state, context.player?.id, context.village?.settlementId || context.village?.id);
  if (!inspection.available && !(isV39TerritoryPhase(context.state)&&inspection.next&&!context.village?.developmentProject)) {
    window.showV39TurnBanner?.(`発展不可: ${inspection.reason}`);
    renderBuildModal();
    return { ok:false, reason:inspection.reason, inspection };
  }
  const requiredTiles = Math.max(1, Math.floor(number(inspection.next?.footprintTiles, 1)));
  developmentSelection = {
    playerId:context.player.id,
    settlementId:text(context.village?.settlementId || context.village?.id),
    targetName:inspection.next.name,
    requiredTiles,
    candidateTileKeys:new Set(inspection.residentialTileKeys),
    lockedTileKeys:new Set(inspection.lockedResidentialTileKeys),
    selectedTileKeys:new Set(inspection.lockedResidentialTileKeys)
  };
  modal?.classList.remove("open");
  renderDevelopmentSelectionToolbar();
  dispatchDevelopmentSelectionChanged();
  window.showV39TurnBanner?.(`発展先を${requiredTiles}マス選択してください`);
  return { ok:true, inspection };
}

function confirmDevelopmentSelection() {
  if (!developmentSelection || developmentSelection.selectedTileKeys.size !== developmentSelection.requiredTiles) return { ok:false, reason:"必要マス数を選択してください" };
  const context = activeContext(true);
  if(usesV39OperationPhases(context.state)){
    const result=queueV39OperationPlan(context.state,developmentSelection.playerId,developmentSelection.settlementId,
      {kind:'development',facilityName:developmentSelection.targetName,tile:{x:context.village.x,y:context.village.y},residentialTileKeys:[...developmentSelection.selectedTileKeys]});
    if(result.ok){window.setV39GameState({players:result.state.players},{reason:'development-planned'});clearDevelopmentSelection();}
    window.showV39TurnBanner?.(result.ok?'拠点発展を計画に追加しました':result.reason);return result;
  }
  const result = startV39SettlementDevelopment(
    context.state,
    developmentSelection.playerId,
    developmentSelection.settlementId,
    { residentialTileKeys:[...developmentSelection.selectedTileKeys] }
  );
  if (!result.ok) {
    window.showV39TurnBanner?.(`発展不可: ${result.reason}`);
    return result;
  }
  window.setV39GameState?.({ players:result.state.players }, { reason:"settlement-development-started" });
  window.showV39TurnBanner?.(`${context.village.name || "拠点"}: ${result.target.name}への発展を開始 (${result.village.developmentProject.totalTurns}T)`);
  window.appendV39ActivityLog?.(context.player.id, "拠点", `${context.village.name || "拠点"}が${result.target.name}への発展を開始`, result.village.developmentProject);
  clearDevelopmentSelection();
  return result;
}

function toggleDevelopmentSelection(tile) {
  if (!developmentSelection) return false;
  const key = developmentSelectionKey(tile);
  if (!developmentSelection.candidateTileKeys.has(key)) {
    window.showV39TurnBanner?.("このマスは発展先に選択できません");
    return true;
  }
  if (developmentSelection.lockedTileKeys.has(key)) {
    window.showV39TurnBanner?.("現在の拠点マスは選択解除できません");
    return true;
  }
  const next = new Set(developmentSelection.selectedTileKeys);
  if (next.has(key)) next.delete(key);
  else {
    if (next.size >= developmentSelection.requiredTiles) {
      window.showV39TurnBanner?.("必要数に達しています。別のマスを外してから選択してください");
      return true;
    }
    next.add(key);
  }
  if (!selectedKeysConnected(next)) {
    window.showV39TurnBanner?.("発展先は隣接するマスを連結して選択してください");
    return true;
  }
  developmentSelection.selectedTileKeys = next;
  renderDevelopmentSelectionToolbar();
  dispatchDevelopmentSelectionChanged();
  return true;
}

function autoSelectDevelopmentTiles() {
  if (!developmentSelection) return;
  developmentSelection.selectedTileKeys = new Set(
    [...developmentSelection.candidateTileKeys].slice(0, developmentSelection.requiredTiles)
  );
  renderDevelopmentSelectionToolbar();
  dispatchDevelopmentSelectionChanged();
}

function startSelectedDevelopment() {
  return beginDevelopmentSelection();
}

function startSelectedConstruction(explicitTile=null) {
  const context = activeContext();
  const tile = explicitTile||targetTile(context);
  const definition = facilityDefinitions().find(row => row.name === selectedFacilityName);
  if(['防壁','城壁'].includes(definition?.name)){
    window.openV39LandConstruction?.(tile);
    return {ok:false,reason:'土地の建築画面で壁の辺を選択してください'};
  }
  const check = definition ? inspectV39Construction(context.state, context.player, definition, tile) : null;
  if(usesV39OperationPhases(context.state)){
    if(!definition)return {ok:false,reason:'施設データがありません'};
    if(check?.replacesResidential&&!window.confirm('予約した施設へ居住地を変更しますか？ 資材は着手時に消費します。'))return {ok:false,cancelled:true};
    const plannedBase=context.player.factionState.settlements?.find(base=>(base.operationPlans||[]).some(plan=>plan.kind==='expansion'&&plan.tile.x===tile.x&&plan.tile.y===tile.y)||base.landExpansionProjects?.some(plan=>plan.tileKey===`${tile.x},${tile.y}`));
    const result=queueV39OperationPlan(context.state,context.player.id,plannedBase?.settlementId||check?.village?.settlementId||context.village?.settlementId,
      {kind:'construction',facilityName:selectedFacilityName,tile:{x:tile.x,y:tile.y},confirmResidentialReplacement:check?.replacesResidential===true});
    if(result.ok)window.setV39GameState({players:result.state.players},{reason:'construction-planned'});
    window.showV39TurnBanner?.(result.ok?'建設を計画に追加しました':result.reason);return result;
  }
  if (check?.available && check.replacesResidential && !window.confirm(`居住地を${selectedFacilityName}へ変更しますか？\n村表示を施設に置き換え、建設資材を消費します。\n工期は${definition.buildTurns}ターンです。施設があるマスの基礎産出は土地用途の設定に従います。`)) return { ok:false, cancelled:true };
  const result = startV39Construction(context.state, context.player?.id, selectedFacilityName, tile, window.__v39FieldRuntime?.mapData, { confirmResidentialReplacement:check?.replacesResidential === true });
  if (!result.ok) {
    window.showV39TurnBanner?.(`建設不可: ${result.reason}`);
    renderBuildModal();
    return result;
  }
  window.setV39GameState?.({ players:result.state.players }, { reason:"construction-started" });
  window.showV39TurnBanner?.(`${result.definition.name}の建設を開始 (${result.queueItem.totalTurns}T)`);
  window.dispatchEvent(new CustomEvent("v39:construction-started", { detail:result.queueItem }));
  renderBuildModal();
  return result;
}

let cachedHeaderSnapshot=null,cachedHeaderMap=null;
function currentResourceSnapshot() {
  // Before the initial village is placed, the player's resource bags are empty rather than sample data.
  const map=window.__v39FieldRuntime?.mapData;
  if(cachedHeaderSnapshot&&cachedHeaderMap===map)return cachedHeaderSnapshot;
  const state=window.getV39GameState?.({includeWorlds:false});
  const player=state?.players?.find(row=>row.id===state.activePlayerId)||window.getV39ActivePlayer?.();
  const village=normalizeV39Village(getSelectedSettlement(player?.factionState),player?.race);
  const snapshot=buildV39HeaderResourceSnapshot(state,player,village,map);
  if(map&&village?.placed){cachedHeaderSnapshot=snapshot;cachedHeaderMap=map;}
  return snapshot;
}

function handleTurn() {
  if (processingTurn) return;
  const state = window.getV39GameState?.({ includeWorlds:false });
  if (!state) return;
  processingTurn = true;
  try {
    const result = advanceV39EconomyTurn(state);
    window.setV39GameState?.({
      players:result.state.players,
      enemies:result.state.enemies,
      enemySquads:result.state.enemySquads,
      enemyNests:result.state.enemyNests,
      facilitiesByTile:result.state.facilitiesByTile,
      settlements:result.state.settlements,
      territoryOwnerByTile:result.state.territoryOwnerByTile,
      territoryStateByTile:result.state.territoryStateByTile
    }, { reason:"economy-turn" });
    for (const item of result.landExpansionCompleted || []) {
      window.appendV39ActivityLog?.(item.playerId, "開拓", `${item.settlementName || "拠点"}: ${item.tileKey}を領土化`, item);
    }
    if (result.landExpansionCompleted?.length) {
      window.showV39TurnBanner?.(`開拓完了: ${result.landExpansionCompleted.map(row => row.tileKey).join(" / ")}`);
    }
    if (result.completed.length) {
      const counts=new Map();
      for(const row of result.completed){const name=`${row.facilityName}${row.edge?'（辺）':''}`;counts.set(name,(counts.get(name)||0)+1);}
      window.showV39TurnBanner?.(`建設完了: ${[...counts].map(([name,count])=>`${name}${count>1?`×${count}`:''}`).join('、')}`);
      window.dispatchEvent(new CustomEvent("v39:construction-completed", { detail:{ completed:result.completed } }));
    }
    if (result.developmentCompleted?.length) {
      const labels = result.developmentCompleted.map(row => `${row.settlementName}が${row.scaleName}へ発展`);
      window.showV39TurnBanner?.(labels.join(" / "));
      for (const item of result.developmentCompleted) {
        window.appendV39ActivityLog?.(item.playerId, "拠点", `${item.settlementName}が${item.scaleName}へ発展`, item);
      }
      window.dispatchEvent(new CustomEvent("v39:settlement-development-completed", {
        detail:{ completed:result.developmentCompleted }
      }));
    }
    if (result.territoryConversionCompleted?.length) {
      for (const item of result.territoryConversionCompleted) {
        const label = item.targetMode === "settlement" ? "居住化" : "資源化";
        window.appendV39ActivityLog?.(item.playerId, "領土", `${label}完了: (${item.tileKey})`, item);
      }
      window.dispatchEvent(new CustomEvent("v39:territory-conversion-completed", {
        detail:{ completed:result.territoryConversionCompleted }
      }));
    }
    for (const rebellion of result.rebellions || []) {
      const message = `${rebellion.settlementName}で反乱発生: ${rebellion.race}${rebellion.population}人が敵対化`;
      window.showV39TurnBanner?.(message);
      window.appendV39ActivityLog?.(rebellion.playerId, "反乱", message, rebellion);
    }
    for (const outflow of result.civicOutflows || []) {
      const message = `${outflow.settlementName}から不満・治安悪化により${outflow.population}人が流出`;
      window.appendV39ActivityLog?.(outflow.playerId, "人口", message, outflow);
    }
    window.dispatchEvent(new CustomEvent("v39:economy-turn-resolved", { detail:{ reports:result.reports, turnNumber:state?.timeline?.turnNumber } }));
  } finally {
    processingTurn = false;
  }
}

function refresh(event) {
  if(event?.detail?.reason==='activity-log')return;
  cachedHeaderSnapshot=null;
  window.renderV39ResourceTop?.();
  if (modal?.classList.contains("open")) renderBuildModal();
}

window.getV39ResourceSnapshot = currentResourceSnapshot;
window.getV39SimpleResourceSnapshot = () => Object.entries(currentResourceSnapshot()).map(([key, group]) => ({
  key, label:group.title, icon:group.icon, iconColor:group.iconColor, cls:group.className,
  value:group.items.reduce((total, item) => total + item.value, 0),
  delta:group.items.reduce((total, item) => total + item.delta, 0),
  tip:group.items.map(item => item.name).join("・")
}));
window.getV39FacilityDefinitions = facilityDefinitions;
window.getV39SettlementScaleDefinitions = getVillageScaleDefinitions;
window.resolveV39SettlementScale = resolveVillageScaleDefinition;
window.getV39FacilityEffectsAtTile = (tileKey, village = getSelectedSettlement(window.getV39ActiveFactionState?.())) => resolveV39FacilityEffectsAtTile(village, tileKey);
window.getV39FacilityYieldMultiplier = (tileKey, resourceKey, village = getSelectedSettlement(window.getV39ActiveFactionState?.())) => resolveV39FacilityYieldMultiplier(village, tileKey, resourceKey);
window.inspectV39Construction = (facilityName, tile = targetTile()) => {
  const context = activeContext();
  const definition = facilityDefinitions().find(row => row.name === text(facilityName));
  return definition ? inspectV39Construction(context.state, context.player, definition, tile) : null;
};
window.startV39Construction = (facilityName, tile = targetTile()) => {
  selectedFacilityName = text(facilityName);
  selectedTile = tile;
  return startSelectedConstruction(tile);
};
window.startV39WallConstruction=(facilityName,edges)=>{
  const context=activeContext();
  if(usesV39OperationPhases(context.state)){
    const result=queueV39OperationPlan(context.state,context.player.id,getFactionSettlementById(context.player.factionState,context.state.territoryStateByTile?.[`${edges[0]?.from?.x},${edges[0]?.from?.y}`]?.settlementId)?.settlementId||context.village.settlementId,{kind:'wall',facilityName,edges,tile:edges[0]?.from});
    if(result.ok)window.setV39GameState({players:result.state.players},{reason:'wall-planned'});
    window.showV39TurnBanner?.(result.ok?'壁の建設を計画に追加しました':result.reason);return result;
  }
  const result=startV39WallConstruction(context.state,context.player?.id,facilityName,edges,window.__v39FieldRuntime?.mapData);
  if(result.ok){
    window.setV39GameState?.({players:result.state.players},{reason:'wall-construction-started'});
    window.showV39TurnBanner?.(`${facilityName} ${result.queueItems.length}辺の建築を開始しました`);
  }
  return result;
};
window.openV39SettlementDevelopment = (settlementId='') => {
  developmentSettlementId=settlementId;
  renderBuildModal();
  modal?.classList.add("open");
  return modal instanceof HTMLElement;
};
window.getV39SettlementDevelopmentSelection = () => developmentSelection ? ({
  ...developmentSelection,
  candidateTileKeys:[...developmentSelection.candidateTileKeys],
  lockedTileKeys:[...developmentSelection.lockedTileKeys],
  selectedTileKeys:[...developmentSelection.selectedTileKeys]
}) : null;
window.confirmV39SettlementDevelopmentSelection = confirmDevelopmentSelection;
window.cancelV39SettlementDevelopmentSelection = () => clearDevelopmentSelection({ reopen:true });
window.getV39EconomyRules = () => ({ gainScale:0.1, consumptionScale:0.1, initialStockTurns:V39_INITIAL_STOCK_BALANCE.territoryIncomeTurns,
  initialFoodMaintenanceTurns:V39_INITIAL_STOCK_BALANCE.normalFoodMaintenanceTurns, constructionUsesJsonTurns:true });

window.addEventListener("v39:tile-selected", event => {
  selectedTile = event.detail || null;
  if (developmentSelection && toggleDevelopmentSelection(selectedTile)) return;
  if (modal?.classList.contains("open")) renderBuildModal();
});
window.addEventListener("v39:turn-stage-economy", handleTurn);
window.addEventListener("v39:game-state-changed", refresh);
document.addEventListener("click", event => {
  const selectionAction = event.target instanceof Element ? event.target.closest("[data-development-selection-action]") : null;
  if (selectionAction) {
    const action = text(selectionAction.dataset.developmentSelectionAction);
    if (action === "auto") autoSelectDevelopmentTiles();
    else if (action === "confirm") confirmDevelopmentSelection();
    else if (action === "cancel") clearDevelopmentSelection({ reopen:true });
    return;
  }
  const buildButton = event.target instanceof Element ? event.target.closest('[data-open="build"]') : null;
  if (buildButton){developmentSettlementId='';window.requestAnimationFrame(renderBuildModal);}
});
ensureBuildModalShell();
refresh();
