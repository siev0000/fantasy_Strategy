import { getFactionSettlements, selectFactionSettlement, territorySettlementId } from "./lib/settlement-state.js";

const panel = document.getElementById("footSettlement");
const openSections = new Set(["population", "food"]);
const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));
const formatNumber = value => number(value).toLocaleString("ja-JP", { maximumFractionDigits:1 });

function activeContext() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0] || null;
  const settlements = getFactionSettlements(player?.factionState);
  const selectedId = text(player?.factionState?.selectedSettlementId) || text(settlements[0]?.settlementId);
  const settlement = settlements.find(row => text(row.settlementId) === selectedId) || settlements[0] || null;
  return { state, player, settlements, settlement };
}

function keyValueRows(record, emptyLabel = "なし") {
  const rows = Object.entries(record || {}).filter(([key, value]) => text(key) && number(value) !== 0);
  if (!rows.length) return `<span class="settlement-empty">${emptyLabel}</span>`;
  return `<div class="settlement-value-grid">${rows.map(([key, value]) => `<div><span>${escapeHtml(key)}</span><b>${formatNumber(value)}</b></div>`).join("")}</div>`;
}

function populationRows(settlement) {
  const growth = settlement?.populationGrowthByRace || {};
  const rows = Object.entries(settlement?.populationByRace || {}).filter(([, value]) => number(value) > 0);
  if (!rows.length) return `<span class="settlement-empty">なし</span>`;
  return `<div class="settlement-value-grid">${rows.map(([race, population]) => {
    const state = growth[race] || {};
    const gauge = formatNumber(state.gauge);
    const required = formatNumber(state.lastRequiredGauge);
    const shortage = number(state.shortage);
    const stage = Math.max(0, Math.floor(number(state.starvationStage)));
    const detail = required !== "0" ? `${gauge}/${required}` : "-";
    const alert = shortage > 0 ? ` / 不足${formatNumber(shortage)}` : stage > 0 ? ` / 飢餓${stage}` : "";
    return `<div><span>${escapeHtml(race)} ${formatNumber(population)}人<br>${escapeHtml(state.condition || "-")}${alert}</span><b>${detail}</b></div>`;
  }).join("")}</div>`;
}

function section(key, label, value, body) {
  return `<details class="settlement-fold" data-settlement-fold="${key}"${openSections.has(key) ? " open" : ""}>
    <summary><span>${label}</span>${value ? `<b>${value}</b>` : ""}</summary>
    <div class="settlement-fold-body">${body}</div>
  </details>`;
}

function render() {
  if (!(panel instanceof HTMLElement)) return;
  const { state, player, settlements, settlement } = activeContext();
  if (!settlement) {
    panel.innerHTML = `<div class="settlement-empty-state">拠点未配置</div>`;
    return;
  }
  const settlementId = text(settlement.settlementId || settlement.id);
  const ownedTerritories = Object.entries(state?.territoryOwnerByTile || {}).filter(([key, ownerId]) => {
    if (text(ownerId) !== text(player?.id)) return false;
    const assignedId = territorySettlementId(state?.territoryStateByTile?.[key]);
    return !assignedId || assignedId === settlementId;
  });
  const damaged = ownedTerritories.filter(([key]) => {
    const record = state?.territoryStateByTile?.[key];
    return number(record?.maxHp) > 0 && number(record?.hp) < number(record?.maxHp);
  });
  const buildings = Array.isArray(settlement.buildings) ? settlement.buildings : [];
  const queue = Array.isArray(settlement.constructionQueue) ? settlement.constructionQueue : [];
  const facilityBody = [
    ...buildings.map(name => `<span class="settlement-chip">${escapeHtml(name)}</span>`),
    ...queue.map(item => `<span class="settlement-chip building">${escapeHtml(item.facilityName)} 残${Math.max(0, Math.floor(number(item.remainingTurns)))}T</span>`)
  ].join("") || `<span class="settlement-empty">なし</span>`;
  const employmentRate = Math.max(0, Math.min(1, number(settlement.employmentRate)));
  const overcrowding = Math.max(0, Math.floor(number(settlement.overcrowdingPopulation)));
  const overcrowdingText = overcrowding > 0
    ? `<span>人口過多 <b>${formatNumber(overcrowding)}</b></span><span>流出 <b>-${formatNumber(settlement.lastPopulationOutflow)}</b></span><span>幸福/治安 <b>${formatNumber(settlement.overcrowdingHappinessPenalty)}</b></span>`
    : "";
  const populationSummary = `<div class="settlement-inline-facts"><span>人口許容 <b>${formatNumber(settlement.populationCapacity)}</b></span><span>雇用枠 <b>${formatNumber(settlement.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span>${overcrowdingText}</div>${populationRows(settlement)}`;

  panel.innerHTML = `
    <nav class="settlement-tabs" aria-label="所有拠点">
      ${settlements.map(row => `<button type="button" class="settlement-tab${text(row.settlementId) === settlementId ? " active" : ""}" data-settlement-id="${escapeHtml(row.settlementId)}">${escapeHtml(row.name || row.type || "拠点")}</button>`).join("")}
    </nav>
    <div class="settlement-fold-list">
      ${section("population", "人口", formatNumber(settlement.population), populationSummary)}
      ${section("food", "食料", formatNumber(settlement.foodStock), keyValueRows(settlement.foodStockByType))}
      ${section("material", "資材", formatNumber(settlement.materialStock), keyValueRows(settlement.materialStockByType))}
      ${section("facility", "施設", `${buildings.length + queue.length}`, `<div class="settlement-chip-list">${facilityBody}</div>`)}
      ${section("territory", "領土", `${ownedTerritories.length}マス`, `<div class="settlement-inline-facts"><span>損傷 <b>${damaged.length}</b></span><span>雇用 <b>${formatNumber(settlement.population)}/${formatNumber(settlement.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span><span>座標 <b>${Math.floor(number(settlement.x))},${Math.floor(number(settlement.y))}</b></span></div>`)}
      ${section("repair", "修復", damaged.length ? `${damaged.length}マス` : "なし", `<div class="settlement-inline-facts"><span>自動修復 <b>${settlement.autoRepair ? "ON" : "OFF"}</b></span><span>修復中 <b>${damaged.length}</b></span></div>`)}
    </div>`;
}

panel?.addEventListener("toggle", event => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  const key = text(details.dataset.settlementFold);
  if (!key) return;
  if (details.open) openSections.add(key);
  else openSections.delete(key);
}, true);

panel?.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-settlement-id]") : null;
  if (!button) return;
  const faction = window.getV39ActiveFactionState?.();
  const next = selectFactionSettlement(faction, button.dataset.settlementId);
  window.updateV39ActiveFactionState?.(next, { reason:"settlement-selected" });
});

window.addEventListener("v39:game-state-changed", render);
window.addEventListener("v39:footer-tab-changed", event => {
  if (event.detail?.tab === "settlement") render();
});
window.addEventListener("v39:operation-ui-ready", render);
render();

window.renderV39SettlementPanel = render;
