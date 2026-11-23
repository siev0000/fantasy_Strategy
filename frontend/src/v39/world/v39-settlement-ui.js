import {formatV39FacilityProductionProgress} from '../../lib/v39-production-work.js';
import {usesV39OperationPhases,isV39TerritoryPhase} from '../../lib/v39-operation-phases.js';
import {renderV39OperationPlans,V39_TERRITORY_GUIDE_STEPS} from './v39-operation-plan-ui.js';
import { getFactionSettlements, selectFactionSettlement, territorySettlementId } from "../../lib/settlement-state.js";
import { inspectV39CitySpecializationNotice, acknowledgeV39CitySpecializations, selectV39CitySpecialization, getV39SelectedCityDefinitions, describeV39CitySpecialization } from "../../lib/v39-city-specialization-rules.js";
import { resolveV39SettlementProductionMetrics } from "../../lib/v39-economy-rules.js";
import { getGameDataRows } from "../../lib/game-data-registry.js";
import { focusV39MapTile } from '../map/v39-map-focus.js';
import { renderV39LandExpansionControls } from "./v39-land-expansion-ui.js";
import {getV39SettlementFacilities,renderV39FacilityOperations} from './v39-facility-panel.js';
import {convertV39SubjectPopulation} from '../../lib/v39-subject-conversion.js';
import {isV39SubjectRuler,normalizeV39SubjectPopulation} from '../../lib/v39-initial-subjects.js';
import './v39-subject-population.css';
import {inspectV39SettlementResourceFlow} from '../../lib/v39-settlement-resource-flow.js';
import {renderV39SettlementResourceFlow} from './v39-settlement-resource-flow-ui.js';
import {settlementProductionEffects} from '../../lib/v39-settlement-intel.js';
import {renderV39PopulationTrend} from '../../lib/v39-population-trend.js';
import {resolveV39OccupiedHousing} from '../../lib/v39-population-economy.js';

const panel = document.getElementById("footSettlement");
const openSections = new Set(["population", "food"]);
let activePage = 'overview';
let territoryGuideKey='',territoryGuideStep='expansion';
function guideStep(state){const key=`${state.activePlayerId}:${state.timeline?.turnNumber}`;if(key!==territoryGuideKey){territoryGuideKey=key;territoryGuideStep='expansion';}return territoryGuideStep;}
window.getV39TerritoryGuideStep=guideStep;
function changeGuideStep(state,step){
  const previous=guideStep(state);
  territoryGuideStep=step;
  if(previous!==step)window.dispatchEvent(new Event('v39:territory-guide-changed'));
}
let resourceFlowMode='forecast';
let renderDirty=true;
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
      ? `<span class="settlement-population-alert">前回の維持不足 ${formatNumber(shortage)}</span>`
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
        <span>成長ゲージ ${progress}</span>
        ${renderV39PopulationTrend(settlement,race)}
        ${condition ? `<span title="${condition === "食事" ? "通常の維持費を賄うと成長します。産出が維持費を十分に上回ると、余剰の一部を使って早く成長します。" : "人口増加に使う資源です。毎ターンの維持食料とは別です。"}">増加条件: ${escapeHtml(condition)}</span>` : ""}
        ${alert}
      </div>
    </div>`;
  }).join("")}</div>`;
}

function subjectPopulationControls(player,settlement){
  if(!isV39SubjectRuler(player?.race))return '';
  const rows=Object.entries(normalizeV39SubjectPopulation(settlement.populationByRace,settlement.subjectPopulationByRace));
  if(!rows.length)return '';
  return `<div data-subject-population><strong>奴隷住民</strong><p>人口・生産に含まれます。変換すると住民と生産力が減少します。</p>${rows.map(([race,count])=>`<div class="settlement-inline-facts" data-subject-race="${escapeHtml(race)}"><span>${escapeHtml(race)} ${count}人</span><label>人数 <input type="number" min="1" max="${count}" step="1" value="1" data-subject-count style="width:4em"></label><button type="button" data-subject-convert="魂">魂に変換</button><button type="button" data-subject-convert="死体">死体に変換</button></div>`).join('')}</div>`;
}

function settlementSection(key, label, value, body, activePage, openSections) {
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
  if(panel.hidden){renderDirty=true;return;}
  renderDirty=false;
  const scrollTop = panel.scrollTop;
  const listScrollTop = panel.querySelector(".settlement-fold-list")?.scrollTop || 0;
  const { state, player, settlements, settlement } = activeContext();
  const editorButtons = window.isV39FixedMapEditing?.()
    ? `<div class="settlement-inline-facts"><button type="button" class="settlement-chip" data-fixed-map-base="owned"${player?'':' disabled'}>拠点を追加</button><button type="button" class="settlement-chip" data-fixed-map-base="neutral">一般村を追加</button></div>`
    : '';
  if (!settlement) {
    panel.innerHTML = `<div class="settlement-empty-state">拠点未配置${editorButtons}</div>`;
    return;
  }
  const listScroll = panel.querySelector('.settlement-tabs')?.scrollTop || 0;
  const resourceBreakdownOpen = panel.querySelector('[data-resource-flow-breakdown]')?.open || false;
  panel.innerHTML = renderV39SettlementView({state,player,settlements,settlement,activePage,openSections,resourceFlowMode,resourceBreakdownOpen});
  if(editorButtons)panel.querySelector('.settlement-detail-pane .settlement-heading')?.insertAdjacentHTML('beforeend',editorButtons);
  panel.scrollTop = scrollTop;
  panel.querySelector('.settlement-tabs').scrollTop = listScroll;
  const foldList = panel.querySelector(".settlement-fold-list");
  if (foldList) foldList.scrollTop = listScrollTop;
}

export function renderV39SettlementView({state,player,settlements,settlement,activePage,
  openSections=new Set(["population"]),resourceFlowMode="forecast",resourceBreakdownOpen=false,intel,facilityId,unitsPage=""}){
  const readOnly=Boolean(intel);
  const settlementId = text(settlement.settlementId || settlement.id);
  const badge=key=>intel?.[key]?"T"+escapeHtml(intel[key].turn):"未調査";
  const legacyBody=key=>{
    const data=intel?.[key]?.data;
    return Array.isArray(data)?data.map(line=>`<p>${escapeHtml(line)}</p>`).join(""):"<p>未調査</p>";
  };
  function section(key,label,value,body,intelKey){
    const report=intel?.[intelKey];
    if(readOnly){
      if(!report?.data||Array.isArray(report.data)){value=badge(intelKey);body=legacyBody(intelKey);}
      else body=`<small>調査 T${escapeHtml(report.turn)}</small>${body}`;
    }
    return settlementSection(key,label,value,body,activePage,openSections);
  }
  const ownedTerritories = readOnly?Object.entries(intel.territory?.data?.records||{}):Object.entries(state?.territoryOwnerByTile || {}).filter(([key, ownerId]) => {
    if (text(ownerId) !== text(player?.id)) return false;
    const assignedId = territorySettlementId(state?.territoryStateByTile?.[key]);
    return !assignedId || assignedId === settlementId;
  });
  const damaged = ownedTerritories.filter(([key]) => {
    const record = (readOnly?intel.territory?.data?.records:state?.territoryStateByTile)?.[key];
    return number(record?.maxHp) > 0 && number(record?.hp) < number(record?.maxHp);
  });
  const facilities = getV39SettlementFacilities(state,player.id,settlement);
  const selectionKey = JSON.stringify([player.id,settlementId]);
  const selected = facilities.find(row=>row.id===(readOnly?facilityId:selectedFacilityByBase.get(selectionKey))) || facilities[0];
  if(selected&&!readOnly)selectedFacilityByBase.set(selectionKey,selected.id);
  const facilityPage = readOnly&&!intel.facilities?.data?.base
    ? `<div data-settlement-page="facility"${activePage==='facility'?'':' hidden'}>${legacyBody('facilities')}</div>`
    : `<div class="v39-facility-list" data-settlement-page="facility"${activePage==='facility'?'':' hidden'}>${readOnly?`<small>調査 T${escapeHtml(intel.facilities.turn)}</small>`:""}${facilities.map(row=>`<section class="v39-facility-row"><button type="button" data-settlement-facility="${escapeHtml(row.id)}" aria-expanded="${row.id===selected?.id}"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.tileKey?`(${row.tileKey})`:'未配置')}</small></button>${row.id===selected?.id?renderV39FacilityOperations(state,player.id,row,readOnly?{storedUnits:intel.facilities?.data?.storage||[]}:undefined):''}</section>`).join('')||'<p class="settlement-empty">施設なし</p>'}${(settlement.constructionQueue||[]).filter(item=>!facilities.some(row=>row.tileKey===item.tileKey)).map(item=>`<div class="v39-facility-queue">建設中: ${escapeHtml(item.facilityName)} · ${formatV39FacilityProductionProgress(item)}</div>`).join('')}</div>`;
  const production = readOnly
    ? intel.population?.data?.metrics||{productionMultipliers:{}}
    : resolveV39SettlementProductionMetrics(state,player,settlement);
  const productionReport=intel?.production?.data;
  const stocks=intel?.stocks?.data?.base;
  const resourceFlow=activePage!=='production'?'':readOnly
    ? `<div data-settlement-page="production"><p>備蓄 ${badge('stocks')} / 収支 ${badge('production')}</p>
      ${Array.isArray(intel.stocks?.data)?legacyBody('stocks'):''}
      ${Array.isArray(productionReport)?legacyBody('production'):''}
      ${stocks||productionReport?.flow?renderV39SettlementResourceFlow(stocks||{},productionReport?.flow,
        productionReport?.mode,{metrics:productionReport?.metrics,facilityEffects:productionReport?.effects,readOnly:true,stocksKnown:Boolean(stocks)}):''}
    </div>`
    : renderV39SettlementResourceFlow(settlement,resourceFlowMode==='recorded'?settlement.lastEconomyDelta:
        inspectV39SettlementResourceFlow(state,player,settlement,window.__v39FieldRuntime?.mapData),
      resourceFlowMode,{metrics:production,facilityEffects:settlementProductionEffects(settlement),breakdownOpen:resourceBreakdownOpen});
  // 領土に紐づく雇用枠から再計算した稼働率を表示する。
  const employmentRate = Math.max(0, Math.min(1, number(production.employmentRate)));
  const overcrowding = Math.max(0, Math.floor(number(settlement.overcrowdingPopulation)));
  const overcrowdingText = overcrowding > 0
    ? `<span>人口過多 <b>${formatNumber(overcrowding)}</b></span><span>流出 <b>-${formatNumber(settlement.lastPopulationOutflow)}</b></span><span>幸福/治安 <b>${formatNumber(settlement.overcrowdingHappinessPenalty)}</b></span>`
    : "";
  const occupiedHousing = resolveV39OccupiedHousing(settlement.populationByRace, settlement.population);
  const populationSummary = `<div class="settlement-inline-facts"><span title="使用枠は住民の種族ごとの基準SIZから計算します。">居住枠 <b>${formatNumber(occupiedHousing)} / ${formatNumber(production.populationCapacity)}</b> <small>(土地 ${formatNumber(production.landUsePopulationCapacity)} + 規模 ${formatNumber(production.settlementScalePopulationCapacity)})</small></span><span>雇用枠 <b>${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span>${overcrowdingText}</div><div class="settlement-inline-facts" title="各生産項目は、人口構成から求めた対応技能値を生産倍率表へ換算した値です。"><span>農業 <b>${formatNumber(production.productionMultipliers.農業 * 100)}%</b></span><span>林業 <b>${formatNumber(production.productionMultipliers.林業 * 100)}%</b></span><span>漁業 <b>${formatNumber(production.productionMultipliers.漁業 * 100)}%</b></span><span>工業 <b>${formatNumber(production.productionMultipliers.工業 * 100)}%</b></span></div>${populationRows(settlement)}`;
  const repair = readOnly?intel.operations?.data?.repair:window.inspectV39TerritoryRepair?.(player?.id, settlementId);
  const repairTargets = repair?.targets || [];
  const repairable = repairTargets.filter(row => !row.blockedReason).length;
  const damagedFacilityCount = repairTargets.reduce((sum, row) => sum + (row.damagedFacilities?.length || 0), 0);
  const repairBody = `<div class="settlement-inline-facts"><span>修復可能 <b>${repairable}/${repairTargets.length}</b></span><span>施設損壊 <b>${damagedFacilityCount}</b></span><span>同時修復 <b>${repair?.maxTiles || 0}</b></span><span>回復率 <b>${Math.round(number(repair?.healRate)*100)}%</b></span><span>鍛冶Lv <b>${repair?.level || 0}</b></span></div>${readOnly?"":`<div class="settlement-chip-list"><button type="button" class="settlement-chip" data-territory-repair="${escapeHtml(settlementId)}"${repairable ? "" : " disabled"}>一斉修復</button><button type="button" class="settlement-chip${settlement.autoRepair ? " building" : ""}" data-territory-auto-repair="${escapeHtml(settlementId)}">自動修復 ${settlement.autoRepair ? "ON" : "OFF"}</button></div>`}`;
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
    ["内壁の不便", number(civicModifiers.innerWalls)],
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
  const noticeState=readOnly?null:cityNoticeState(state);
  const notices=new Map((readOnly?[]:settlements).map(base=>[text(base.settlementId),inspectV39CitySpecializationNotice(noticeState,player,base)]));
  const cityNotice=notices.get(settlementId)||{unseen:[],options:[],changeable:[]},highlight=reviewedCityCandidates.get(cityReviewKey(player,settlement))||new Set();
  const fresh=new Set([...cityNotice.unseen.map(option=>option.id),...highlight]);
  const specializationOptions=cityNotice.options.filter(option=>option.unlocked||option.id===settlement.citySpecializationId);
  const specializationSummary=`<div data-city-effects-summary>${getV39SelectedCityDefinitions(settlement).filter(row=>row.レア度==='レア').map(row=>`<p><b>${escapeHtml(row.項目名)}</b> ${escapeHtml(describeV39CitySpecialization(row))}</p>`).join('')}<div class="settlement-inline-facts"><span>環境安定度 <b>${formatNumber(settlement.environmentStability)}</b></span><span>道路整備済み <b>${Object.keys(settlement.roadDevelopmentByTile||{}).length}マス</b></span></div>${settlement.cityEventCandidates?.length?`<p>イベント候補: ${settlement.cityEventCandidates.map(id=>escapeHtml(getGameDataRows('イベント会話').find(row=>row.ID===id)?.名前||id)).join(' / ')}</p>`:''}</div>`;
  const specializationBody = `<div class="settlement-inline-facts"><span>選択中 <b>${escapeHtml(settlement.citySpecializationId || "なし")}</b></span><span>都市特性 <b>${escapeHtml((settlement.cityTraits || []).join(" / ") || "なし")}</b></span></div>${cityNotice.remainingTurns?`<p class="settlement-city-wait">切替まであと${cityNotice.remainingTurns}ターン</p>`:''}<div class="settlement-chip-list">${specializationOptions.map(option=>cityCandidateCard(option,settlement.citySpecializationId,fresh)).join('')||'<p class="settlement-empty" data-city-no-options>条件を満たした都市特化はありません</p>'}</div>`;

  const employmentSummary=readOnly&&!intel.population?.data?.metrics
    ? ""
    : `<span>雇用 <b>${formatNumber(settlement.population)}/${formatNumber(production.employmentSlots)}</b></span><span>稼働率 <b>${formatNumber(employmentRate * 100)}%</b></span>`;
  const surveyedTiles=readOnly?ownedTerritories.map(([tile,record])=>
    `<p>(${escapeHtml(tile)}) ${escapeHtml(record.status||"領土")}${record.hp==null?"":`　HP ${formatNumber(record.hp)}/${formatNumber(record.maxHp)}`}</p>`).join(""):"";
  return `
    <nav class="settlement-tabs" aria-label="拠点一覧">
      ${settlements.map(row => `<button type="button" class="settlement-tab${text(row.settlementId) === settlementId ? " active" : ""}" aria-pressed="${text(row.settlementId) === settlementId}" data-settlement-id="${escapeHtml(row.settlementId)}">${notices.get(text(row.settlementId))?.unseen.length?'<span class="settlement-city-alert" data-city-notice aria-label="未確認の都市特化があります">!</span>':''}<span class="settlement-card-type">${escapeHtml(row.type || '拠点')}</span><strong>${escapeHtml(row.name || row.type || "拠点")}</strong><span>人口 ${readOnly&&row.population==null?"未調査":formatNumber(row.population)}</span></button>`).join("")}
    </nav>
    <div class="settlement-detail-pane">
    <header class="settlement-heading">${readOnly?"":'<button type="button" class="settlement-expansion-open" data-expansion-action="open">領土拡張</button>'}<strong>${escapeHtml(settlement.name || settlement.type || '拠点')}</strong><span>${escapeHtml(settlement.type || '')}</span>${cityNotice.changeable.length?`<button type="button" class="settlement-city-shortcut" data-open-city-specialization>${cityNotice.unseen.length?'<span class="settlement-city-new" data-city-header-notice aria-label="未確認">!</span> ':''}都市特化を変更可能</button>`:''}</header>
    ${!readOnly&&usesV39OperationPhases(state)&&!isV39TerritoryPhase(state)?'<section class="v39-territory-management" data-territory-planning="false"><strong>戦闘・探索中</strong><small>予約は自動進行中。編集は次の拠点フェーズで行います。</small><button type="button" data-open-construction-plans>建設順を確認</button></section>':''}
    <nav class="settlement-pages" aria-label="拠点の操作">${[['overview','概況'],['production','生産'],['facility','施設'],...(readOnly?[['units','ユニット']]:[]),['operation','運用']].map(([key,label])=>`<button type="button" data-settlement-page-select="${key}" aria-pressed="${activePage===key}">${label}</button>`).join('')}</nav>
    <div class="settlement-fold-list"><section data-settlement-page="construction-plans"${activePage==='construction-plans'?'':' hidden'}>${activePage==='construction-plans'?`<h3>建設順</h3>${renderV39OperationPlans(state,player,settlement,{scope:'construction',showFinish:false})}`:''}</section>

      ${section("population", "人口", formatNumber(settlement.population), populationSummary+(readOnly?"":subjectPopulationControls(player,settlement)),"population")}
      ${resourceFlow}
      ${facilityPage}
      ${readOnly&&activePage==="units"?`<section class="v39-spy-roster" data-settlement-page="units">${unitsPage}</section>`:""}
      ${section("territory", "領土", `${ownedTerritories.length}マス`, `<div class="settlement-inline-facts">
        <span>損傷 <b>${damaged.length}</b></span>${employmentSummary}
        <span>座標 <b>${Math.floor(number(settlement.x))},${Math.floor(number(settlement.y))}</b></span>
      </div>${surveyedTiles}`,"territory")}
      <section class="v39-expansion-page" data-settlement-page="expansion"${activePage==='expansion'?'':' hidden'}>${activePage==='expansion'?renderV39LandExpansionControls(state, player, settlement):''}</section>
      ${section("civic", "住民状態", `幸福${formatNumber(civic.happiness)}`, civicBody,"population")}
      ${section("specialization", "都市専門化", escapeHtml(settlement.citySpecializationId || "未選択"), specializationSummary+(readOnly?`<p>都市特性 ${escapeHtml((settlement.cityTraits||[]).join(" / ")||"なし")}</p>`:specializationBody),"operations")}
      ${section("repair", "修復", repairTargets.length ? `${repairTargets.length}マス` : "なし", repairBody,"operations")}
      ${readOnly?section("plans","進行状況","",renderIntelPlans(intel.operations?.data?.base||{},intel.operations?.data),"operations"):""}
    </div></div>`;
}

function renderIntelPlans(base,operations){
  const rows=[
    ...(base.operationPlans||[]).map(plan=>`計画　${plan.facilityName||"領土拡張"}　(${plan.tile?.x}, ${plan.tile?.y})　開始予定 T${plan.notBeforeTurn}`),
    ...(base.constructionQueue||[]).map(order=>`建設中　${order.facilityName}　(${order.tileKey})　${formatV39FacilityProductionProgress(order)}`),
    ...(base.landExpansionProjects||[]).map(order=>`領土拡張　(${order.tileKey})　残${order.remainingTurns}T`),
    ...(operations?.training||[]).map(order=>`訓練　${order.name||"ユニット"}　残${order.remainingTurns}T`)
  ];
  return rows.length?rows.map(line=>`<p>${escapeHtml(line)}</p>`).join(""):"<p>進行中の計画はありません。</p>";
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
  if(event.target.closest?.('[data-resource-flow-refresh]')){render();return;}
  const conversion=event.target.closest?.('[data-subject-convert]');
  if(conversion){
    if(window.isV39MapInputLocked?.())return;
    const {state,player,settlement}=activeContext(),row=conversion.closest('[data-subject-race]');
    const count=Number(row.querySelector('[data-subject-count]').value),race=row.dataset.subjectRace,resource=conversion.dataset.subjectConvert;
    if(!Number.isSafeInteger(count)||count<1||count>Number(settlement.subjectPopulationByRace?.[race]||0)){
      window.showV39TurnBanner?.('奴隷住民の保有人数以内で指定してください');return;
    }
    if(!window.confirm(`${race}${count}人を${resource}へ変換します。住民が減り、元には戻せません。実行しますか？`))return;
    const result=convertV39SubjectPopulation(state,player.id,settlement.settlementId||settlement.id,{race,count,resource});
    if(result.ok){window.setV39GameState({players:result.state.players,settlements:result.state.settlements},{reason:'subject-conversion'});
      window.appendV39ActivityLog?.(player.id,'人口',result.message);}
    window.showV39TurnBanner?.(result.ok?result.message:result.reason);return;
  }
  if(event.target.closest?.('[data-open-city-specialization]')){openCityCandidates();return;}
  if(event.target.closest?.('[data-open-construction-plans]')){window.openV39SettlementConstructionPlans();return;}

  const pageButton = event.target.closest?.('[data-settlement-page-select]');
  if (pageButton) {
    activePage = pageButton.dataset.settlementPageSelect;
    panel.querySelectorAll('[data-settlement-page-select]').forEach(button=>button.setAttribute('aria-pressed',String(button===pageButton)));
    panel.querySelectorAll('[data-settlement-page]').forEach(section=>section.hidden=section.dataset.settlementPage!==activePage);
    panel.querySelector('.settlement-fold-list').scrollTop=0;
    if(activePage==='production')render();
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
  if (developmentButton && !developmentButton.disabled) {
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

// Hidden panels catch up once when opened; unchanged reopening keeps their DOM.
window.addEventListener("v39:game-state-changed", event => {
  if (event.detail?.reason !== "activity-log") render();
});
window.addEventListener("v39:operation-ui-ready", render);
window.addEventListener('v39:footer-tab-changed',event=>{if(event.detail?.tab==='settlement'){if(renderDirty)render();reviewCityCandidates();}else if(reviewedCityCandidates.size){reviewedCityCandidates.clear();render();}});
render();

panel?.addEventListener('change',event=>{
  if(!event.target.matches?.('[data-resource-flow-mode]'))return;
  resourceFlowMode=event.target.value==='recorded'?'recorded':'forecast';render();
});
window.renderV39SettlementPanel = render;

window.openV39SettlementExpansion=()=>{changeGuideStep(activeContext().state,'expansion');activePage='expansion';window.activateV39FooterTab?.('settlement');render();};

window.openV39OperationPlans=()=>window.openV39TerritoryManagement?.();

window.openV39TerritoryManagement=({openTab=true}={})=>{
  changeGuideStep(activeContext().state,'expansion');
  window.clearV39LandExpansionSelection?.();
  activePage='overview';
  if(openTab)window.activateV39FooterTab?.('settlement');
  render();
};
window.openV39SettlementConstructionPlans=()=>{
  changeGuideStep(activeContext().state,'construction');
  window.clearV39LandExpansionSelection?.();
  activePage='construction-plans';
  window.activateV39FooterTab?.('settlement');
  render();
};
window.setV39TerritoryGuideStep=step=>{
  const {state}=activeContext();if(!isV39TerritoryPhase(state)||!V39_TERRITORY_GUIDE_STEPS.includes(step))return;
  changeGuideStep(state,step);
  document.getElementById('characterModal')?.classList.remove('open');
  if(step==='expansion'){window.openV39TerritoryManagement({openTab:false});return;}
  if(step==='construction'){window.openV39SettlementConstructionPlans();return;}
  window.activateV39FooterTab?.('squad');
};
window.reviewV39TerritoryPlans=async()=>{
  const {state}=activeContext();if(!isV39TerritoryPhase(state))return;
  changeGuideStep(state,'units');activePage='overview';
  if(await window.advanceV39Turn?.())document.getElementById('characterModal')?.classList.remove('open');
};
