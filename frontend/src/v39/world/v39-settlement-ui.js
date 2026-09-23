import { getFactionSettlements, selectFactionSettlement, territorySettlementId } from "../../lib/settlement-state.js";
import { inspectV39CitySpecializations, selectV39CitySpecialization } from "../../lib/v39-city-specialization-rules.js";
import { resolveV39SettlementProductionMetrics } from "../../lib/v39-economy-rules.js";

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
  const facilityStateByName = new Map(Object.values(settlement.facilityStateByTile || {})
    .flatMap(states => Object.entries(states || {})));
  const facilityBody = [
    ...buildings.map(name => {
      const facility = facilityStateByName.get(name);
      const damaged = facility && number(facility.hp) < number(facility.maxHp, 100);
      return `<span class="settlement-chip${damaged ? " building" : ""}">${escapeHtml(name)}${damaged ? ` HP ${formatNumber(facility.hp)}/${formatNumber(facility.maxHp)}` : ""}</span>`;
    }),
    ...queue.map(item => `<span class="settlement-chip building">${escapeHtml(item.facilityName)} 残${Math.max(0, Math.floor(number(item.remainingTurns)))}T</span>`)
  ].join("") || `<span class="settlement-empty">なし</span>`;
  const production = resolveV39SettlementProductionMetrics(state, player, settlement);
  // 領土に紐づく雇用枠から再計算した稼働率を表示する。
  const employmentRate = Math.max(0, Math.min(1, number(production.employmentRate)));
  const overcrowding = Math.max(0, Math.floor(number(settlement.overcrowdingPopulation)));
  const overcrowdingText = overcrowding > 0
    ? `<span>人口過多 <b>${formatNumber(overcrowding)}</b></span><span>流出 <b>-${formatNumber(settlement.lastPopulationOutflow)}</b></span><span>幸福/治安 <b>${formatNumber(settlement.overcrowdingHappinessPenalty)}</b></span>`
    : "";
  const populationSummary = `<div class="settlement-inline-facts"><span>人口許容 <b>${formatNumber(settlement.populationCapacity)}</b></span><span>雇用枠 <b>${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span>${overcrowdingText}</div><div class="settlement-inline-facts" title="各生産項目は、人口構成から求めた対応技能値を生産倍率表へ換算した値です。"><span>農業 <b>${formatNumber(production.productionMultipliers.農業 * 100)}%</b></span><span>林業 <b>${formatNumber(production.productionMultipliers.林業 * 100)}%</b></span><span>漁業 <b>${formatNumber(production.productionMultipliers.漁業 * 100)}%</b></span><span>工業 <b>${formatNumber(production.productionMultipliers.工業 * 100)}%</b></span></div>${populationRows(settlement)}`;
  const repair = window.inspectV39TerritoryRepair?.(player?.id, settlementId);
  const repairTargets = repair?.targets || [];
  const repairable = repairTargets.filter(row => !row.blockedReason).length;
  const damagedFacilityCount = repairTargets.reduce((sum, row) => sum + (row.damagedFacilities?.length || 0), 0);
  const repairBody = `<div class="settlement-inline-facts"><span>修復可能 <b>${repairable}/${repairTargets.length}</b></span><span>施設損壊 <b>${damagedFacilityCount}</b></span><span>同時修復 <b>${repair?.maxTiles || 0}</b></span><span>回復率 <b>${Math.round(number(repair?.healRate)*100)}%</b></span><span>鍛冶Lv <b>${repair?.level || 0}</b></span></div><div class="settlement-chip-list"><button type="button" class="settlement-chip" data-territory-repair="${escapeHtml(settlementId)}"${repairable ? "" : " disabled"}>一斉修復</button><button type="button" class="settlement-chip${settlement.autoRepair ? " building" : ""}" data-territory-auto-repair="${escapeHtml(settlementId)}">自動修復 ${settlement.autoRepair ? "ON" : "OFF"}</button></div>`;
  const civic = settlement.civicState || {};
  const civicModifiers = civic.modifiers || {};
  const raceHappinessRows = Object.entries(settlement.populationByRace || {})
    .filter(([, population]) => number(population) > 0)
    .map(([race, population]) => {
      const current = civic.happinessByRace?.[race] ?? civic.happiness ?? 50;
      const target = civic.happinessTargetByRace?.[race] ?? current;
      const source = text(civic.happinessModifiersByRace?.[race]?.source);
      const sourceLabel = source === "クラス" ? "クラス" : source === "クラス+仮" ? "混合" : "仮";
      return `<div><span>${escapeHtml(race)} ${formatNumber(population)}人 <small>[${sourceLabel}]</small></span><b>${formatNumber(current)} → ${formatNumber(target)}</b></div>`;
    }).join("");
  const raceHappinessBody = raceHappinessRows
    ? `<div class="settlement-value-grid">${raceHappinessRows}</div>`
    : '<span class="settlement-empty">種族データなし</span>';
  const civicModifierEntries = [
    ["食料", number(civicModifiers.foodComfort)],
    ["住居", number(civicModifiers.housingComfort)],
    ["施設", number(civicModifiers.facilityHappiness)],
    ["飢餓", number(civicModifiers.starvationHappiness)],
    ["人口過多", number(civicModifiers.overcrowding)],
    ["災害", number(civicModifiers.disaster)],
    ["占領", number(civicModifiers.occupation)],
    ["異種族", number(civicModifiers.mixedRace)],
    ["イベント", number(civicModifiers.eventHappiness)]
  ].filter(([, value]) => Math.abs(value) >= 0.05);
  const civicModifierText = civicModifierEntries.length
    ? civicModifierEntries.map(([label, value]) => `<span>${escapeHtml(label)} <b>${value > 0 ? "+" : ""}${formatNumber(value)}</b></span>`).join("")
    : "<span>補正 <b>なし</b></span>";
  const civicBody = `<div class="settlement-inline-facts"><span>幸福度 <b>${formatNumber(civic.happiness)}</b></span><span>不満度 <b>${formatNumber(civic.dissatisfaction)}</b></span><span>治安 <b>${formatNumber(civic.security)}</b></span><span>産出補正 <b>${formatNumber(number(settlement.lastEconomyDelta?.civicProductionMultiplier || 1) * 100)}%</b></span></div><div class="settlement-inline-facts"><span>目標幸福 <b>${formatNumber(civicModifiers.happinessTarget ?? civic.happiness)}</b></span><span>目標不満 <b>${formatNumber(civicModifiers.dissatisfactionTarget ?? civic.dissatisfaction)}</b></span><span>目標治安 <b>${formatNumber(civicModifiers.securityTarget ?? civic.security)}</b></span><span>食料余裕 <b>${civicModifiers.foodReserveTurns == null ? "-" : `${formatNumber(civicModifiers.foodReserveTurns)}T`}</b></span></div><div class="settlement-inline-facts">${civicModifierText}</div><div class="settlement-subhead">種族別幸福度</div>${raceHappinessBody}`;
  const specializationOptions = inspectV39CitySpecializations(state, player, settlement);
  const specializationBody = `<div class="settlement-inline-facts"><span>選択中 <b>${escapeHtml(settlement.citySpecializationId || "なし")}</b></span><span>都市特性 <b>${escapeHtml((settlement.cityTraits || []).join(" / ") || "なし")}</b></span><span>条件の正本 <b>都市.json</b></span></div><div class="settlement-chip-list">${specializationOptions.map(option => `<button type="button" class="settlement-chip${settlement.citySpecializationId === option.id ? " building" : ""}" data-city-specialization="${escapeHtml(option.id)}" title="${escapeHtml(option.reason)}"${option.available ? "" : " disabled"}>${escapeHtml(option.name)}${option.available ? "" : " ×"}</button>`).join("")}</div>`;

  panel.innerHTML = `
    <nav class="settlement-tabs" aria-label="所有拠点">
      ${settlements.map(row => `<button type="button" class="settlement-tab${text(row.settlementId) === settlementId ? " active" : ""}" data-settlement-id="${escapeHtml(row.settlementId)}">${escapeHtml(row.name || row.type || "拠点")}</button>`).join("")}
    </nav>
    <div class="settlement-fold-list">
      ${section("population", "人口", formatNumber(settlement.population), populationSummary)}
      ${section("food", "食料", formatNumber(settlement.foodStock), keyValueRows(settlement.foodStockByType))}
      ${section("material", "資材", formatNumber(settlement.materialStock), keyValueRows(settlement.materialStockByType))}
      ${section("facility", "施設", `${buildings.length + queue.length}`, `<div class="settlement-chip-list">${facilityBody}</div>`)}
      ${section("territory", "領土", `${ownedTerritories.length}マス`, `<div class="settlement-inline-facts"><span>損傷 <b>${damaged.length}</b></span><span>雇用 <b>${formatNumber(settlement.population)}/${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span><span>座標 <b>${Math.floor(number(settlement.x))},${Math.floor(number(settlement.y))}</b></span></div>`)}
      ${section("civic", "住民状態", `幸福${formatNumber(civic.happiness)}`, civicBody)}
      ${section("specialization", "都市専門化", escapeHtml(settlement.citySpecializationId || "未選択"), specializationBody)}
      ${section("repair", "修復", repairTargets.length ? `${repairTargets.length}マス` : "なし", repairBody)}
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
  const specializationButton = event.target instanceof Element ? event.target.closest("[data-city-specialization]") : null;
  if (specializationButton) {
    const { state, player, settlement } = activeContext();
    const result = selectV39CitySpecialization(state, player?.id, settlement?.settlementId || settlement?.id, specializationButton.dataset.citySpecialization);
    if (!result.ok) window.showV39TurnBanner?.(`選択不可: ${result.reason}`);
    else {
      window.setV39GameState?.({ players:result.state.players }, { reason:"city-specialization-selected" });
      window.showV39TurnBanner?.(`${result.specialization.name}に専門化`);
    }
    return;
  }
  const repairButton = event.target instanceof Element ? event.target.closest("[data-territory-repair]") : null;
  if (repairButton) {
    const { player } = activeContext();
    window.runV39TerritoryRepair?.(player?.id, repairButton.dataset.territoryRepair);
    return;
  }
  const autoButton = event.target instanceof Element ? event.target.closest("[data-territory-auto-repair]") : null;
  if (autoButton) {
    const { player, settlement } = activeContext();
    window.setV39TerritoryAutoRepair?.(player?.id, autoButton.dataset.territoryAutoRepair, settlement?.autoRepair !== true);
    return;
  }
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
