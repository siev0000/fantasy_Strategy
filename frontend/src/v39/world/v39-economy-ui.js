import {
  MATERIAL_RESOURCE_KEYS,
  advanceV39EconomyTurn,
  buildV39ResourceSnapshot,
  facilityDefinitions,
  resolveV39FacilityEffectsAtTile,
  resolveV39FacilityYieldMultiplier,
  inspectV39Construction,
  inspectV39SettlementDevelopment,
  normalizeV39Village,
  startV39Construction,
  startV39SettlementDevelopment
} from "../../lib/v39-economy-rules.js";
import { getSelectedSettlement } from "../../lib/settlement-state.js";
import { getVillageScaleDefinitions, resolveVillageScaleDefinition } from "../../composables/villageCoreUtils.js";
import { getHexOffsetNeighbors } from "../../lib/hex-grid.js";

const modal = document.getElementById("buildModal");
let selectedTile = null;
let selectedFacilityName = "";
let processingTurn = false;
let developmentSelection = null;

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatNumber = value => number(value).toLocaleString("ja-JP", { maximumFractionDigits:1 });
const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));

function activeContext() {
  const state = window.getV39GameState?.({ includeWorlds:false });
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  return { state, player, village:normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race) };
}

function targetTile(context = activeContext()) {
  const selectedKey = selectedTile ? `${selectedTile.x},${selectedTile.y}` : "";
  if (selectedKey && text(context.state?.territoryOwnerByTile?.[selectedKey]) === text(context.player?.id)) return selectedTile;
  if (context.village?.placed) return { x:context.village.x, y:context.village.y, terrain:"拠点" };
  return selectedTile;
}

function formatCost(cost, stock = {}) {
  const parts = MATERIAL_RESOURCE_KEYS.filter(key => number(cost?.[key]) > 0).map(key => `${key} ${formatNumber(stock?.[key])}/${formatNumber(cost[key])}`);
  return parts.length ? parts.join(" / ") : "なし";
}

function formatRequirements(requirements, levels = {}) {
  const parts = Object.entries(requirements || {}).filter(([, value]) => number(value) > 0).map(([key, value]) => `${key} ${formatNumber(levels?.[key])}/${formatNumber(value)}`);
  return parts.length ? parts.join(" / ") : "なし";
}

function ensureBuildModalShell() {
  if (!(modal instanceof HTMLElement) || modal.dataset.v39EconomyReady === "true") return;
  modal.dataset.v39EconomyReady = "true";
  modal.innerHTML = `<div class="modal v39-build-modal">
    <div class="modal-head"><h2>都市・建設</h2><button class="close" data-close>×</button></div>
    <div class="modal-body v39-build-body">
      <header class="v39-build-summary" id="v39-build-summary"></header>
      <section class="v39-development" id="v39-development"></section>
      <div class="v39-build-layout">
        <div class="v39-build-list" id="v39-build-list"></div>
        <section class="v39-build-detail" id="v39-build-detail"></section>
      </div>
      <section class="v39-build-queue" id="v39-build-queue"></section>
    </div>
  </div>`;
  modal.querySelector("[data-close]")?.addEventListener("click", () => modal.classList.remove("open"));
  modal.addEventListener("click", event => {
    const facilityButton = event.target instanceof Element ? event.target.closest("[data-v39-facility]") : null;
    if (facilityButton) {
      selectedFacilityName = text(facilityButton.dataset.v39Facility);
      renderBuildModal();
      return;
    }
    if (event.target instanceof Element && event.target.closest("#v39-development-start")) startSelectedDevelopment();
    if (event.target instanceof Element && event.target.closest("#v39-build-start")) startSelectedConstruction();
  });
  installStyles();
}

function installStyles() {
  if (document.getElementById("v39-economy-style")) return;
  const style = document.createElement("style");
  style.id = "v39-economy-style";
  style.textContent = `
    .v39-build-modal{width:min(920px,94vw);height:min(680px,88vh)}
    .v39-build-body{display:grid!important;grid-template-rows:auto auto minmax(0,1fr) auto;gap:8px;overflow:hidden!important}
    .v39-build-summary{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid #3f555d;border-radius:8px;background:#101d22;font-size:var(--font-body)}
    .v39-build-summary b{color:#88dfab}.v39-build-layout{display:grid;grid-template-columns:minmax(250px,42%) minmax(0,1fr);gap:8px;min-height:0}
    .v39-build-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:6px;overflow:auto;padding-right:3px}
    .v39-build-item{min-height:66px;padding:7px;text-align:left;border:1px solid #40545b;border-radius:7px;background:#142329;color:#e5eeee;cursor:pointer}
    .v39-build-item strong,.v39-build-item span{display:block}.v39-build-item strong{font-size:var(--font-body)}.v39-build-item span{margin-top:3px;color:#9fb0b4;font-size:var(--font-secondary)}
    .v39-build-item.active{border:2px solid #67cddd;background:#17343c}.v39-build-item.unavailable{opacity:.48}
    .v39-build-detail{overflow:auto;padding:12px;border:1px solid #465b63;border-radius:8px;background:#111e23;color:#dae7e7}
    .v39-build-detail h3{margin:0 0 8px;font-size:var(--font-size-21)}.v39-build-detail p{font-size:var(--font-body);line-height:1.55}.v39-build-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .v39-build-fact{padding:8px;border-radius:6px;background:#192a30}.v39-build-fact span,.v39-build-fact b{display:block}.v39-build-fact span{font-size:var(--font-secondary);color:#93a5aa}.v39-build-fact b{margin-top:2px;font-size:var(--font-body)}
    #v39-build-start{width:100%;min-height:42px;margin-top:10px;border:1px solid #c29c45;border-radius:7px;background:#3c3217;color:#ffe6a0;font-size:var(--font-size-16);font-weight:800;cursor:pointer}
    #v39-build-start:disabled{cursor:not-allowed;opacity:.4}.v39-build-reasons{min-height:22px;margin-top:8px;color:#e89a89;font-size:var(--font-secondary)}
    .v39-development{display:grid;gap:7px;padding:9px;border:1px solid #477680;border-radius:8px;background:#102228;color:#e9f5f3}
    .v39-development-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.v39-development-head strong{font-size:var(--font-size-16)}.v39-development-head span{font-size:var(--font-secondary);color:#9bb0b4}
    .v39-development-requirements{display:flex;flex-wrap:wrap;gap:5px}.v39-development-requirement{padding:5px 7px;border:1px solid #526268;border-radius:6px;background:#17282e;font-size:var(--font-secondary)}.v39-development-requirement.met{border-color:#4d8b68;color:#bce7ca}.v39-development-requirement.shortage{border-color:#8c594f;color:#efb0a2}
    .v39-development-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px}.v39-development-reason{margin-right:auto;color:#e8aa91;font-size:var(--font-secondary)}
    #v39-development-start{min-height:36px;padding:6px 12px;border:1px solid #67cddd;border-radius:7px;background:#17343c;color:#efffff;font-size:var(--font-body);font-weight:800;cursor:pointer}#v39-development-start:disabled{opacity:.4;cursor:not-allowed}
    .v39-development-selection-toolbar{position:fixed;top:76px;left:50%;z-index:6000;transform:translateX(-50%);display:flex;align-items:center;gap:8px;max-width:calc(100vw - 24px);padding:9px 11px;border:2px solid #67cddd;border-radius:9px;background:rgba(9,24,29,.97);box-shadow:0 5px 18px rgba(0,0,0,.4);color:#eaffff;font-size:var(--font-body);font-weight:700}
    .v39-development-selection-toolbar button{min-height:34px;padding:5px 10px;border:1px solid #597078;border-radius:6px;background:#17282e;color:#e8f4f3;font-size:var(--font-body);font-weight:700;cursor:pointer}.v39-development-selection-toolbar button.confirm{border-color:#d2aa4c;background:#443716;color:#ffe69d}.v39-development-selection-toolbar button:disabled{opacity:.4;cursor:not-allowed}
    .v39-build-queue{display:flex;gap:6px;min-height:42px;overflow-x:auto}.v39-build-queue-item{flex:0 0 auto;padding:7px 10px;border:1px solid #53666c;border-radius:7px;background:#17252a;font-size:var(--font-secondary)}.v39-build-queue-empty{color:#829397;font-size:var(--font-secondary);padding:8px}
    @media(max-width:680px){.v39-build-modal{height:92vh}.v39-build-layout{grid-template-columns:1fr;grid-template-rows:minmax(130px,42%) minmax(0,1fr)}.v39-build-list{grid-template-columns:1fr 1fr}.v39-build-facts{grid-template-columns:1fr}.v39-build-item{min-height:58px}}
  `;
  document.head.appendChild(style);
}

function renderBuildModal() {
  ensureBuildModalShell();
  if (!(modal instanceof HTMLElement)) return;
  const context = activeContext();
  const target = targetTile(context);
  const definitions = facilityDefinitions();
  if (!selectedFacilityName || !definitions.some(row => row.name === selectedFacilityName)) selectedFacilityName = definitions[0]?.name || "";
  const selected = definitions.find(row => row.name === selectedFacilityName) || null;
  const checks = new Map(definitions.map(definition => [definition.name, inspectV39Construction(context.state, context.player, definition, target)]));
  const selectedCheck = selected ? checks.get(selected.name) : null;
  const summary = modal.querySelector("#v39-build-summary");
  if (summary) summary.innerHTML = context.village?.placed
    ? `<span>都市 <b>${text(context.village.name) || "拠点"}</b></span><span>人口 <b>${formatNumber(context.village.population)}</b></span><span>施設 <b>${selectedCheck?.used || 0}/${selectedCheck?.capacity || 0}</b></span><span>対象 <b>(${target?.x ?? "-"}, ${target?.y ?? "-"}) ${text(target?.special || target?.terrain)}</b></span>`
    : `<span>初期拠点を配置してください</span>`;
  const development = inspectV39SettlementDevelopment(context.state, context.player?.id, context.village?.settlementId || context.village?.id);
  const developmentPanel = modal.querySelector("#v39-development");
  if (developmentPanel) {
    const requirements = (development.requirements || []).map(row => `<span class="v39-development-requirement ${row.met ? "met" : "shortage"}">${escapeHtml(row.label)} <b>${formatNumber(row.current)}/${formatNumber(row.required)}</b></span>`).join("");
    const project = development.project;
    developmentPanel.innerHTML = `<div class="v39-development-head"><strong>拠点発展: ${escapeHtml(development.current?.name || context.village?.type || "-")} ${development.next ? `→ ${escapeHtml(development.next.name)}` : ""}</strong><span>${project ? `工事中 残り${project.remainingTurns}/${project.totalTurns}T` : (development.next ? `工期 ${development.next.buildTurns}T` : "最大規模")}</span></div>
      ${requirements ? `<div class="v39-development-requirements">${requirements}</div>` : ""}
      <div class="v39-development-actions"><span class="v39-development-reason">${escapeHtml(development.reason)}</span>${development.next ? `<button type="button" id="v39-development-start" ${development.available ? "" : "disabled"}>${project ? "発展工事中" : "拡張位置を選択"}</button>` : ""}</div>`;
  }
  const list = modal.querySelector("#v39-build-list");
  if (list) list.innerHTML = definitions.map(definition => {
    const check = checks.get(definition.name);
    return `<button type="button" class="v39-build-item${definition.name === selectedFacilityName ? " active" : ""}${check?.available ? "" : " unavailable"}" data-v39-facility="${definition.name}"><strong>${definition.name}</strong><span>${definition.terrainCondition} / ${definition.buildTurns}T</span></button>`;
  }).join("");
  const detail = modal.querySelector("#v39-build-detail");
  if (detail && selected) detail.innerHTML = `<h3>${selected.name}</h3><p>${selected.description}</p><div class="v39-build-facts">
    <div class="v39-build-fact"><span>地形 (対象/必要)</span><b>${text(target?.terrain || target?.special || "-")} / ${selected.terrainCondition}</b></div>
    <div class="v39-build-fact"><span>建築時間</span><b>${selected.buildTurns}ターン</b></div>
    <div class="v39-build-fact"><span>研究条件 (現在/必要)</span><b>${formatRequirements(selected.requirements, selectedCheck?.levels)}</b></div>
    <div class="v39-build-fact"><span>必要資材 (所持/必要)</span><b>${formatCost(selected.cost, context.village?.materialStockByType)}</b></div>
    <div class="v39-build-fact"><span>施設枠 (使用/上限)</span><b>${selectedCheck?.used || 0}/${selectedCheck?.capacity || 0}</b></div>
  </div><div class="v39-build-reasons">${selectedCheck?.available ? "建設可能" : (selectedCheck?.reasons || ["建設不可"]).join(" / ")}</div><button type="button" id="v39-build-start" ${selectedCheck?.available ? "" : "disabled"}>建設開始</button>`;
  const queue = modal.querySelector("#v39-build-queue");
  if (queue) queue.innerHTML = context.village?.constructionQueue?.length
    ? context.village.constructionQueue.map(item => `<div class="v39-build-queue-item"><b>${item.facilityName}</b> (${item.tileKey}) 残${item.remainingTurns}/${item.totalTurns}T</div>`).join("")
    : `<div class="v39-build-queue-empty">建設中の施設なし</div>`;
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
  if (reopen) window.openV39SettlementDevelopment?.();
}

function beginDevelopmentSelection() {
  const context = activeContext();
  const inspection = inspectV39SettlementDevelopment(context.state, context.player?.id, context.village?.settlementId || context.village?.id);
  if (!inspection.available) {
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
  const context = activeContext();
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

function startSelectedConstruction() {
  const context = activeContext();
  const tile = targetTile(context);
  const definition = facilityDefinitions().find(row => row.name === selectedFacilityName);
  const check = definition ? inspectV39Construction(context.state, context.player, definition, tile) : null;
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

function currentResourceSnapshot() {
  // Before the initial village is placed, the player's resource bags are empty rather than sample data.
  return buildV39ResourceSnapshot(activeContext().village || {});
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
      window.showV39TurnBanner?.(`建設完了: ${result.completed.map(row => row.facilityName).join("、")}`);
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

function refresh() {
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
  return startSelectedConstruction();
};
window.openV39SettlementDevelopment = () => {
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
window.getV39EconomyRules = () => ({ gainScale:0.1, consumptionScale:0.1, initialStockTurns:3, constructionUsesJsonTurns:true });

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
  if (buildButton) window.requestAnimationFrame(renderBuildModal);
});
ensureBuildModalShell();
refresh();
