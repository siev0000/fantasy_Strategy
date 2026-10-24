import { getFactionSettlements, selectFactionSettlement, territorySettlementId } from "../../lib/settlement-state.js";
import { inspectV39CitySpecializationNotice, acknowledgeV39CitySpecializations, selectV39CitySpecialization, getV39SelectedCityDefinitions, describeV39CitySpecialization } from "../../lib/v39-city-specialization-rules.js";
import { resolveV39SettlementProductionMetrics } from "../../lib/v39-economy-rules.js";
import { getGameDataRows } from "../../lib/game-data-registry.js";
import { focusV39MapTile } from '../map/v39-map-focus.js';
import { renderV39LandExpansionControls } from "./v39-land-expansion-ui.js";
import {getV39SettlementFacilities,renderV39FacilityOperations} from './v39-facility-panel.js';

const panel = document.getElementById("footSettlement");
const openSections = new Set(["population", "food"]);
let activePage = 'overview';
const selectedFacilityByBase = new Map();
const reviewedCityCandidates=new Map();
const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const escapeHtml = value => text(value).replace(/[&<>"']/g, char => ({
  "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
}[char]));
const formatNumber = value => number(value).toLocaleString("ja-JP", { maximumFractionDigits:1 });
const factionRows = getGameDataRows("勢力");

function raceMarker(race) {
  const target = text(race);
  const row = factionRows.find(item => [item?.種族, item?.カナ].map(text).includes(target))
    || (target === "只人" ? factionRows.find(item => text(item?.種族) === "人間") : null);
  const marker = text(row?.マーカー文字) || target.slice(0, 1) || "人";
  const rawColor = text(row?.マーカー色);
  const color = /^#[0-9a-f]{3,8}$/i.test(rawColor) ? rawColor : "#405158";
  return { marker, color };
}

function activeContext() {
  const state = window.getV39GameState?.({ includeWorlds:false });
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
  return `<div class="settlement-value-grid settlement-population-grid">${rows.map(([race, population]) => {
    const state = growth[race] || {};
    const gauge = formatNumber(state.gauge);
    const required = formatNumber(state.lastRequiredGauge);
    const shortage = number(state.shortage);
    const stage = Math.max(0, Math.floor(number(state.starvationStage)));
    const progress = required !== "0" ? `${gauge} / ${required}` : "-";
    const condition = text(state.condition);
    const marker = raceMarker(race);
    const alert = shortage > 0
      ? `<span class="settlement-population-alert">不足 ${formatNumber(shortage)}</span>`
      : stage > 0
        ? `<span class="settlement-population-alert">備蓄注意</span>`
        : "";
    return `<div class="settlement-population-card">
      <div class="settlement-population-head">
        <span class="settlement-race-marker" style="--race-marker-color:${marker.color}">${escapeHtml(marker.marker)}</span>
        <b>${formatNumber(population)}人</b>
      </div>
      <strong class="settlement-population-race">${escapeHtml(race)}</strong>
      <div class="settlement-population-meta">
        <span>増加 ${progress}</span>
        ${condition ? `<span title="クラス.jsonの増加条件">増加条件: ${escapeHtml(condition)}</span>` : ""}
        ${alert}
      </div>
    </div>`;
  }).join("")}</div>`;
}

function section(key, label, value, body) {
  const page = ['population','civic','territory'].includes(key) ? 'overview' : ['food','material','facility'].includes(key) ? 'production' : 'operation';
  return `<details class="settlement-fold" data-settlement-page="${page}"${page === activePage ? '' : ' hidden'} data-settlement-fold="${key}"${openSections.has(key) ? " open" : ""}>
    <summary><span>${label}</span>${value ? `<b>${value}</b>` : ""}</summary>
    <div class="settlement-fold-body">${body}</div>
  </details>`;
}

function cityReviewKey(player,settlement) {return JSON.stringify([player?.id,settlement?.settlementId||settlement?.id]);}
const cityNoticeState=state=>({...state,explorationWorlds:window.getV39EnemyTurnState?.()?.explorationWorlds||state?.explorationWorlds});

function cityCandidateCard(option,currentId,fresh) {
  const selected=option.id===currentId;
  const marker=fresh.has(option.id)&&option.available&&!selected?'<span class="settlement-city-new" aria-label="新しく解禁">!</span> ':'';
  return `<button type="button" class="settlement-chip settlement-city-option${selected?' building':''}" data-city-specialization="${escapeHtml(option.id)}" title="${escapeHtml(option.reason)}"${option.available?'':' disabled'}><b>${marker}${escapeHtml(option.name)}${selected?'（選択中）':''}</b><span>${escapeHtml(option.effects)}</span><small>${escapeHtml(option.condition||'条件なし')} / ${escapeHtml(option.reason)}</small></button>`;
}

function reviewCityCandidates() {
  const details=panel?.querySelector('[data-settlement-fold="specialization"]');
  if(panel?.hidden||activePage!=='operation'||!details?.open)return;
  const {state,player,settlement}=activeContext();
  const notice=inspectV39CitySpecializationNotice(cityNoticeState(state),player,settlement);
  if(!notice.unseen.length)return;
  const key=cityReviewKey(player,settlement),highlight=reviewedCityCandidates.get(key)||new Set();
  notice.unseen.forEach(option=>highlight.add(option.id));reviewedCityCandidates.set(key,highlight);
  const result=acknowledgeV39CitySpecializations(cityNoticeState(state),player.id,settlement.settlementId);
  if(result.changed)window.setV39GameState?.({players:result.state.players},{reason:'city-specialization-reviewed'});
}

function openCityCandidates() {
  activePage='operation';openSections.add('specialization');render();
  reviewCityCandidates();
  const summary=panel.querySelector('[data-settlement-fold="specialization"] > summary');
  summary?.focus({preventScroll:true});summary?.scrollIntoView({block:'nearest'});
}

function render() {
  if (!(panel instanceof HTMLElement)) return;
  const scrollTop = panel.scrollTop;
  const listScrollTop = panel.querySelector(".settlement-fold-list")?.scrollTop || 0;
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
  const facilities = getV39SettlementFacilities(state,player.id,settlement);
  const selectionKey = JSON.stringify([player.id,settlementId]);
  const selected = facilities.find(row=>row.id===selectedFacilityByBase.get(selectionKey)) || facilities[0];
  if(selected)selectedFacilityByBase.set(selectionKey,selected.id);
  const facilityPage = `<div class="v39-facility-list" data-settlement-page="facility"${activePage==='facility'?'':' hidden'}>${facilities.map(row=>`<section class="v39-facility-row"><button type="button" data-settlement-facility="${escapeHtml(row.id)}" aria-expanded="${row.id===selected?.id}"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.tileKey?`(${row.tileKey})`:'未配置')}</small></button>${row.id===selected?.id?renderV39FacilityOperations(state,player.id,row):''}</section>`).join('')||'<p class="settlement-empty">施設なし</p>'}${(settlement.constructionQueue||[]).filter(item=>!facilities.some(row=>row.tileKey===item.tileKey)).map(item=>`<div class="v39-facility-queue">建設中: ${escapeHtml(item.facilityName)} · 残${Math.max(0,Math.floor(number(item.remainingTurns)))}T</div>`).join('')}</div>`;
  const production = resolveV39SettlementProductionMetrics(state, player, settlement);
  // 領土に紐づく雇用枠から再計算した稼働率を表示する。
  const employmentRate = Math.max(0, Math.min(1, number(production.employmentRate)));
  const overcrowding = Math.max(0, Math.floor(number(settlement.overcrowdingPopulation)));
  const overcrowdingText = overcrowding > 0
    ? `<span>人口過多 <b>${formatNumber(overcrowding)}</b></span><span>流出 <b>-${formatNumber(settlement.lastPopulationOutflow)}</b></span><span>幸福/治安 <b>${formatNumber(settlement.overcrowdingHappinessPenalty)}</b></span>`
    : "";
  const populationSummary = `<div class="settlement-inline-facts"><span title="土地用途の許容人数と拠点規模の収容力の合計です。">人口許容 <b>${formatNumber(production.populationCapacity)}</b> <small>(土地 ${formatNumber(production.landUsePopulationCapacity)} + 規模 ${formatNumber(production.settlementScalePopulationCapacity)})</small></span><span>雇用枠 <b>${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span>${overcrowdingText}</div><div class="settlement-inline-facts" title="各生産項目は、人口構成から求めた対応技能値を生産倍率表へ換算した値です。"><span>農業 <b>${formatNumber(production.productionMultipliers.農業 * 100)}%</b></span><span>林業 <b>${formatNumber(production.productionMultipliers.林業 * 100)}%</b></span><span>漁業 <b>${formatNumber(production.productionMultipliers.漁業 * 100)}%</b></span><span>工業 <b>${formatNumber(production.productionMultipliers.工業 * 100)}%</b></span></div>${populationRows(settlement)}`;
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
    ["国", number(civicModifiers.countryHappiness)],
    ["都市幸福", number(civicModifiers.specializationHappiness)],
    ["都市治安", number(civicModifiers.specializationSecurity)],
    ["飢餓", number(civicModifiers.starvationHappiness)],
    ["人口過多", number(civicModifiers.overcrowding)],
    ["災害", number(civicModifiers.disaster)],
    ["占領", number(civicModifiers.occupation)],
    ["異種族", number(civicModifiers.mixedRace)],
    ["苦手土地", number(civicModifiers.unfavorableTerrain)],
    ["特産品", number(civicModifiers.specialties)],
    ["イベント", number(civicModifiers.eventHappiness)]
  ].filter(([, value]) => Math.abs(value) >= 0.05);
  const civicModifierText = civicModifierEntries.length
    ? civicModifierEntries.map(([label, value]) => `<span>${escapeHtml(label)} <b>${value > 0 ? "+" : ""}${formatNumber(value)}</b></span>`).join("")
    : "<span>補正 <b>なし</b></span>";
  const civicBody = `<div class="settlement-inline-facts"><span>幸福度 <b>${formatNumber(civic.happiness)}</b></span><span>不満度 <b>${formatNumber(civic.dissatisfaction)}</b></span><span>治安 <b>${formatNumber(civic.security)}</b></span><span>産出補正 <b>${formatNumber(number(settlement.lastEconomyDelta?.civicProductionMultiplier || 1) * 100)}%</b></span></div><div class="settlement-inline-facts"><span>目標幸福 <b>${formatNumber(civicModifiers.happinessTarget ?? civic.happiness)}</b></span><span>目標不満 <b>${formatNumber(civicModifiers.dissatisfactionTarget ?? civic.dissatisfaction)}</b></span><span>目標治安 <b>${formatNumber(civicModifiers.securityTarget ?? civic.security)}</b></span><span>食料余裕 <b>${civicModifiers.foodReserveTurns == null ? "-" : `${formatNumber(civicModifiers.foodReserveTurns)}T`}</b></span></div><div class="settlement-inline-facts">${civicModifierText}</div><div class="settlement-subhead">種族別幸福度</div>${raceHappinessBody}`;
  const noticeState=cityNoticeState(state);
  const notices=new Map(settlements.map(base=>[text(base.settlementId),inspectV39CitySpecializationNotice(noticeState,player,base)]));
  const cityNotice=notices.get(settlementId),highlight=reviewedCityCandidates.get(cityReviewKey(player,settlement))||new Set();
  const fresh=new Set([...cityNotice.unseen.map(option=>option.id),...highlight]);
  const specializationOptions=cityNotice.options.filter(option=>option.unlocked||option.id===settlement.citySpecializationId);
  const specializationSummary=`<div data-city-effects-summary>${getV39SelectedCityDefinitions(settlement).filter(row=>row.レア度==='レア').map(row=>`<p><b>${escapeHtml(row.項目名)}</b> ${escapeHtml(describeV39CitySpecialization(row))}</p>`).join('')}<div class="settlement-inline-facts"><span>環境安定度 <b>${formatNumber(settlement.environmentStability)}</b></span><span>道路整備済み <b>${Object.keys(settlement.roadDevelopmentByTile||{}).length}マス</b></span></div>${settlement.cityEventCandidates?.length?`<p>イベント候補: ${settlement.cityEventCandidates.map(id=>escapeHtml(getGameDataRows('イベント会話').find(row=>row.ID===id)?.名前||id)).join(' / ')}</p>`:''}</div>`;
  const specializationBody = `<div class="settlement-inline-facts"><span>選択中 <b>${escapeHtml(settlement.citySpecializationId || "なし")}</b></span><span>都市特性 <b>${escapeHtml((settlement.cityTraits || []).join(" / ") || "なし")}</b></span></div>${cityNotice.remainingTurns?`<p class="settlement-city-wait">切替まであと${cityNotice.remainingTurns}ターン</p>`:''}<div class="settlement-chip-list">${specializationOptions.map(option=>cityCandidateCard(option,settlement.citySpecializationId,fresh)).join('')||'<p class="settlement-empty" data-city-no-options>条件を満たした都市特化はありません</p>'}</div>`;

  const listScroll = panel.querySelector('.settlement-tabs')?.scrollTop || 0;
  panel.innerHTML = `
    <nav class="settlement-tabs" aria-label="所有拠点">
      ${settlements.map(row => `<button type="button" class="settlement-tab${text(row.settlementId) === settlementId ? " active" : ""}" aria-pressed="${text(row.settlementId) === settlementId}" data-settlement-id="${escapeHtml(row.settlementId)}">${notices.get(text(row.settlementId))?.unseen.length?'<span class="settlement-city-alert" data-city-notice aria-label="未確認の都市特化があります">!</span>':''}<span class="settlement-card-type">${escapeHtml(row.type || '拠点')}</span><strong>${escapeHtml(row.name || row.type || "拠点")}</strong><span>人口 ${formatNumber(row.population)}</span></button>`).join("")}
    </nav>
    <div class="settlement-detail-pane">
    <header class="settlement-heading"><strong>${escapeHtml(settlement.name || settlement.type || '拠点')}</strong><span>${escapeHtml(settlement.type || '')}</span>${cityNotice.changeable.length?`<button type="button" class="settlement-city-shortcut" data-open-city-specialization>${cityNotice.unseen.length?'<span class="settlement-city-new" data-city-header-notice aria-label="未確認">!</span> ':''}都市特化を変更可能</button>`:''}</header>
    <nav class="settlement-pages" aria-label="拠点の操作">${[['overview','概況'],['production','生産'],['facility','施設'],['operation','運用']].map(([key,label])=>`<button type="button" data-settlement-page-select="${key}" aria-pressed="${activePage===key}">${label}</button>`).join('')}</nav>
    <div class="settlement-fold-list">
      <div class="settlement-page-actions" data-settlement-page="overview"${activePage === 'overview' ? '' : ' hidden'}><button type="button" class="settlement-development-open" data-settlement-development>拠点発展</button></div>
      <div class="settlement-page-actions" data-settlement-page="operation"${activePage === 'operation' ? '' : ' hidden'}><button type="button" class="settlement-trade-open" data-open-v39-trade>取引</button><button type="button" class="settlement-chip" data-foot="logistics">物流</button></div>
      ${section("population", "人口", formatNumber(settlement.population), populationSummary)}
      ${section("food", "食料", formatNumber(settlement.foodStock), keyValueRows(settlement.foodStockByType))}
      ${section("material", "資材", formatNumber(settlement.materialStock), keyValueRows(settlement.materialStockByType))}
      ${facilityPage}
      ${section("territory", "領土", `${ownedTerritories.length}マス`, `<div class="settlement-inline-facts"><span>損傷 <b>${damaged.length}</b></span><span>雇用 <b>${formatNumber(settlement.population)}/${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span><span>座標 <b>${Math.floor(number(settlement.x))},${Math.floor(number(settlement.y))}</b></span></div>`)}
      ${section("expansion", "開拓", `${formatNumber(production.expansionWorkers)}人`, renderV39LandExpansionControls(state, player, settlement))}
      ${section("civic", "住民状態", `幸福${formatNumber(civic.happiness)}`, civicBody)}
      ${section("specialization", "都市専門化", escapeHtml(settlement.citySpecializationId || "未選択"), specializationSummary+specializationBody)}
      ${section("repair", "修復", repairTargets.length ? `${repairTargets.length}マス` : "なし", repairBody)}
    </div></div>`;
  panel.scrollTop = scrollTop;
  panel.querySelector('.settlement-tabs').scrollTop = listScroll;
  const foldList = panel.querySelector(".settlement-fold-list");
  if (foldList) foldList.scrollTop = listScrollTop;
}

panel?.addEventListener("toggle", event => {
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement)) return;
  const key = text(details.dataset.settlementFold);
  if (!key) return;
  if (details.open) openSections.add(key);
  else openSections.delete(key);
  if(key==='specialization'){
    if(details.open)reviewCityCandidates();
    else {const {player,settlement}=activeContext();reviewedCityCandidates.delete(cityReviewKey(player,settlement));render();}
  }
}, true);

panel?.addEventListener("click", event => {
  if(event.target.closest?.('[data-open-city-specialization]')){openCityCandidates();return;}
  const pageButton = event.target.closest?.('[data-settlement-page-select]');
  if (pageButton) {
    activePage = pageButton.dataset.settlementPageSelect;
    panel.querySelectorAll('[data-settlement-page-select]').forEach(button=>button.setAttribute('aria-pressed',String(button===pageButton)));
    panel.querySelectorAll('[data-settlement-page]').forEach(section=>section.hidden=section.dataset.settlementPage!==activePage);
    panel.querySelector('.settlement-fold-list').scrollTop=0;
    reviewCityCandidates();
    return;
  }
  const facilityButton=event.target.closest?.('[data-settlement-facility]');
  if(facilityButton){
    const {state,player,settlement}=activeContext();
    const facility=getV39SettlementFacilities(state,player.id,settlement).find(row=>row.id===facilityButton.dataset.settlementFacility);
    if(!facility)return;
    selectedFacilityByBase.set(JSON.stringify([player.id,text(settlement.settlementId||settlement.id)]),facility.id);
    render();
    panel.querySelectorAll('[data-settlement-facility]').forEach(button=>{if(button.dataset.settlementFacility===facility.id)button.focus({preventScroll:true});});
    if(facility.tileKey){const [x,y]=facility.tileKey.split(',').map(Number);focusV39MapTile({x,y},{worldId:facility.worldId});}
    return;
  }
  const developmentButton = event.target instanceof Element ? event.target.closest("[data-settlement-development]") : null;
  if (developmentButton) {
    window.openV39SettlementDevelopment?.();
    return;
  }
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
  const previous=activeContext();reviewedCityCandidates.delete(cityReviewKey(previous.player,previous.settlement));
  const next = selectFactionSettlement(faction, button.dataset.settlementId);
  window.updateV39ActiveFactionState?.(next, { reason:"settlement-selected" });
  reviewCityCandidates();
  const settlement = next.settlements.find(row => text(row.settlementId) === next.selectedSettlementId);
  if (!settlement?.placed || !Number.isFinite(settlement.x) || !Number.isFinite(settlement.y)) return;
  focusV39MapTile(settlement,{worldId:'surface'});
});

// 状態更新で内容を準備済み。タブを開くだけでは再計算・DOM交換しない。
window.addEventListener("v39:game-state-changed", event => {
  if (event.detail?.reason !== "activity-log") render();
});
window.addEventListener("v39:operation-ui-ready", render);
window.addEventListener('v39:footer-tab-changed',event=>{if(event.detail?.tab==='settlement')reviewCityCandidates();else if(reviewedCityCandidates.size){reviewedCityCandidates.clear();render();}});
render();

window.renderV39SettlementPanel = render;
