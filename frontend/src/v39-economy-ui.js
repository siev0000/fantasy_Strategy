import {
  MATERIAL_RESOURCE_KEYS,
  advanceV39EconomyTurn,
  buildV39ResourceSnapshot,
  facilityDefinitions,
  resolveV39FacilityEffectsAtTile,
  resolveV39FacilityYieldMultiplier,
  inspectV39Construction,
  normalizeV39Village,
  startV39Construction
} from "./lib/v39-economy-rules.js";
import { getSelectedSettlement } from "./lib/settlement-state.js";
import { getVillageScaleDefinitions, resolveVillageScaleDefinition } from "./composables/villageCoreUtils.js";

const modal = document.getElementById("buildModal");
let selectedTile = null;
let selectedFacilityName = "";
let processingTurn = false;

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const formatNumber = value => number(value).toLocaleString("ja-JP", { maximumFractionDigits:1 });

function activeContext() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  return { state, player, village:normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race) };
}

function targetTile(context = activeContext()) {
  const selectedKey = selectedTile ? `${selectedTile.x},${selectedTile.y}` : "";
  if (selectedKey && text(context.state?.territoryOwnerByTile?.[selectedKey]) === text(context.player?.id)) return selectedTile;
  if (context.village?.placed) return { x:context.village.x, y:context.village.y, terrain:"拠点" };
  return selectedTile;
}

function formatCost(cost) {
  const parts = MATERIAL_RESOURCE_KEYS.filter(key => number(cost?.[key]) > 0).map(key => `${key}${formatNumber(cost[key])}`);
  return parts.length ? parts.join(" / ") : "なし";
}

function formatRequirements(requirements) {
  const parts = Object.entries(requirements || {}).filter(([, value]) => number(value) > 0).map(([key, value]) => `${key}${value}`);
  return parts.length ? parts.join(" / ") : "なし";
}

function ensureBuildModalShell() {
  if (!(modal instanceof HTMLElement) || modal.dataset.v39EconomyReady === "true") return;
  modal.dataset.v39EconomyReady = "true";
  modal.innerHTML = `<div class="modal v39-build-modal">
    <div class="modal-head"><h2>都市・建設</h2><button class="close" data-close>×</button></div>
    <div class="modal-body v39-build-body">
      <header class="v39-build-summary" id="v39-build-summary"></header>
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
    .v39-build-body{display:grid!important;grid-template-rows:auto minmax(0,1fr) auto;gap:8px;overflow:hidden!important}
    .v39-build-summary{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border:1px solid #3f555d;border-radius:8px;background:#101d22;font-size:15px}
    .v39-build-summary b{color:#88dfab}.v39-build-layout{display:grid;grid-template-columns:minmax(250px,42%) minmax(0,1fr);gap:8px;min-height:0}
    .v39-build-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));align-content:start;gap:6px;overflow:auto;padding-right:3px}
    .v39-build-item{min-height:66px;padding:7px;text-align:left;border:1px solid #40545b;border-radius:7px;background:#142329;color:#e5eeee;cursor:pointer}
    .v39-build-item strong,.v39-build-item span{display:block}.v39-build-item strong{font-size:15px}.v39-build-item span{margin-top:3px;color:#9fb0b4;font-size:13px}
    .v39-build-item.active{border:2px solid #67cddd;background:#17343c}.v39-build-item.unavailable{opacity:.48}
    .v39-build-detail{overflow:auto;padding:12px;border:1px solid #465b63;border-radius:8px;background:#111e23;color:#dae7e7}
    .v39-build-detail h3{margin:0 0 8px;font-size:21px}.v39-build-detail p{font-size:15px;line-height:1.55}.v39-build-facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .v39-build-fact{padding:8px;border-radius:6px;background:#192a30}.v39-build-fact span,.v39-build-fact b{display:block}.v39-build-fact span{font-size:13px;color:#93a5aa}.v39-build-fact b{margin-top:2px;font-size:15px}
    #v39-build-start{width:100%;min-height:42px;margin-top:10px;border:1px solid #c29c45;border-radius:7px;background:#3c3217;color:#ffe6a0;font-size:16px;font-weight:800;cursor:pointer}
    #v39-build-start:disabled{cursor:not-allowed;opacity:.4}.v39-build-reasons{min-height:22px;margin-top:8px;color:#e89a89;font-size:13px}
    .v39-build-queue{display:flex;gap:6px;min-height:42px;overflow-x:auto}.v39-build-queue-item{flex:0 0 auto;padding:7px 10px;border:1px solid #53666c;border-radius:7px;background:#17252a;font-size:13px}.v39-build-queue-empty{color:#829397;font-size:13px;padding:8px}
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
  const list = modal.querySelector("#v39-build-list");
  if (list) list.innerHTML = definitions.map(definition => {
    const check = checks.get(definition.name);
    return `<button type="button" class="v39-build-item${definition.name === selectedFacilityName ? " active" : ""}${check?.available ? "" : " unavailable"}" data-v39-facility="${definition.name}"><strong>${definition.name}</strong><span>${definition.terrainCondition} / ${definition.buildTurns}T</span></button>`;
  }).join("");
  const detail = modal.querySelector("#v39-build-detail");
  if (detail && selected) detail.innerHTML = `<h3>${selected.name}</h3><p>${selected.description}</p><div class="v39-build-facts">
    <div class="v39-build-fact"><span>建設地形</span><b>${selected.terrainCondition}</b></div>
    <div class="v39-build-fact"><span>建築時間</span><b>${selected.buildTurns}ターン</b></div>
    <div class="v39-build-fact"><span>研究条件</span><b>${formatRequirements(selected.requirements)}</b></div>
    <div class="v39-build-fact"><span>必要資材</span><b>${formatCost(selected.cost)}</b></div>
  </div><div class="v39-build-reasons">${selectedCheck?.available ? "建設可能" : (selectedCheck?.reasons || ["建設不可"]).join(" / ")}</div><button type="button" id="v39-build-start" ${selectedCheck?.available ? "" : "disabled"}>建設開始</button>`;
  const queue = modal.querySelector("#v39-build-queue");
  if (queue) queue.innerHTML = context.village?.constructionQueue?.length
    ? context.village.constructionQueue.map(item => `<div class="v39-build-queue-item"><b>${item.facilityName}</b> (${item.tileKey}) 残${item.remainingTurns}/${item.totalTurns}T</div>`).join("")
    : `<div class="v39-build-queue-empty">建設中の施設なし</div>`;
}

function startSelectedConstruction() {
  const context = activeContext();
  const result = startV39Construction(context.state, context.player?.id, selectedFacilityName, targetTile(context));
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

function weightedResource(snapshot, weights) {
  let value = 0;
  let delta = 0;
  for (const group of Object.values(snapshot || {})) for (const item of group.items || []) {
    const weight = number(weights[item.name]);
    value += number(item.value) * weight;
    delta += number(item.delta) * weight;
  }
  return { value, delta };
}

function simpleResourceSnapshot() {
  const snapshot = currentResourceSnapshot();
  if (!snapshot) return null;
  const defs = [
    ["食料", "🌾", { 穀物:1, 野菜:1, 肉:1, 魚:1 }, "food-group"],
    ["木材", "🪵", { 木材:1, 黒木:2, 特木:4 }, "wood-group"],
    ["鉄", "⚙", { 鉄:1, 銀鉄:2, 青金鋼:4, 赤黒鋼:4 }, "ore-group"],
    ["金", "🟡", { 金:2, 銀:1, 宝石:2 }, "precious-group"],
    ["魂", "◉", { 死体:1, 魂:2 }, "soul-group"]
  ];
  return defs.map(([label, icon, weights, cls]) => ({ key:label, label, icon, cls, ...weightedResource(snapshot, weights), tip:Object.keys(weights).join("+") }));
}

function handleTurn() {
  if (processingTurn) return;
  const state = window.getV39GameState?.();
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
      settlements:result.state.settlements
    }, { reason:"economy-turn" });
    if (result.completed.length) {
      window.showV39TurnBanner?.(`建設完了: ${result.completed.map(row => row.facilityName).join("、")}`);
      window.dispatchEvent(new CustomEvent("v39:construction-completed", { detail:{ completed:result.completed } }));
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
window.getV39SimpleResourceSnapshot = simpleResourceSnapshot;
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
window.getV39EconomyRules = () => ({ gainScale:0.1, consumptionScale:0.1, initialStockTurns:3, constructionUsesJsonTurns:true });

window.addEventListener("v39:tile-selected", event => { selectedTile = event.detail || null; if (modal?.classList.contains("open")) renderBuildModal(); });
window.addEventListener("v39:turn-stage-economy", handleTurn);
window.addEventListener("v39:game-state-changed", refresh);
document.addEventListener("click", event => {
  const buildButton = event.target instanceof Element ? event.target.closest('[data-open="build"]') : null;
  if (buildButton) window.requestAnimationFrame(renderBuildModal);
});
ensureBuildModalShell();
refresh();
