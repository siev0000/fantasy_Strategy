import { renderV39UnitSkills } from "./v39-unit-skills.js";
import { focusV39MapTile } from '../map/v39-map-focus.js';
import { resolveV39BaseMoveApCost } from "../../lib/v39-gameplay-balance.js";
import { resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";
import { renderV39UnitCard } from "./v39-unit-card.js";
import { updateV39UnitAbility } from "./v39-unit-detail.js";
import {renderV39SquadCoordination} from './v39-squad-coordination-ui.js';
import {renderV39UnitHeading} from './v39-unit-heading.js';

const renderedMarkup = new WeakMap();
let renderingFaction;
function updateMarkup(host, markup) {
  if (!host || renderedMarkup.get(host) === markup) return;
  host.innerHTML = markup;
  renderedMarkup.set(host, markup);
}

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampPercent(current, max) {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function unitId(unit, index) {
  return text(unit?.id ?? unit?.unitId ?? unit?.characterId ?? unit?.名前, `unit-${index}`);
}

function unitName(unit, index) {
  return text(unit?.name ?? unit?.displayName ?? unit?.名前, `ユニット${index + 1}`);
}

function squadKey(unit) {
  if (unit?.solo === true || unit?.isSolo === true) return "solo";
  const raw = text(unit?.squadId ?? unit?.squadKey ?? unit?.groupId ?? unit?.partyId ?? unit?.squad);
  if (!raw) return "solo";
  if (raw === "solo" || raw === "単独") return "solo";
  return raw;
}

function unitPosition(unit) {
  const x = num(unit?.x ?? unit?.tileX ?? unit?.pos?.x, null);
  const y = num(unit?.y ?? unit?.tileY ?? unit?.pos?.y, null);
  return x !== null && y !== null ? `(${x},${y})` : "(-,-)";
}

function hpValues(unit) {
  const max = Math.max(0, num(unit?.maxHp ?? unit?.status?.HP, 0));
  const current = Math.max(0, num(unit?.hp ?? unit?.currentHp, max));
  return { current, max };
}

function apValues(unit) {
  const max = Math.max(0, num(unit?.maxAp ?? unit?.apMax ?? unit?.status?.AP, 0));
  const current = Math.max(0, num(unit?.ap ?? unit?.currentAp, max));
  return { current, max };
}

function defenseDisplay(unit) {
  return [["shield", "盾"], ["barrier", "障壁"]].flatMap(([kind, label]) => {
    const value = unit?.[kind];
    if (!value || !(Number(value.maximum) > 0) || (kind === "barrier" && !(Number(value.remaining) > 0))) return [];
    return [{ kind, label, remaining:Math.max(0, num(value.remaining, 0)), percent:clampPercent(value.remaining, value.maximum) }];
  });
}

function movementValue(unit) {
  return unit?.movement ?? unit?.status?.移動 ?? unit?.move ?? unit?.moveRange ?? unit?.移動 ?? "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setExpandedTechnique(name = "") {
  expandedTechniqueName = text(name);
  const list = document.getElementById("detailTechniqueList");
  if (!(list instanceof HTMLElement)) return;
  list.querySelectorAll("[data-v39-technique-name]").forEach(card => {
    const expanded = text(card?.dataset?.v39TechniqueName) === expandedTechniqueName;
    card.classList.toggle("is-expanded", expanded);
    if (card.getAttribute("aria-expanded") !== String(expanded)) card.setAttribute("aria-expanded", String(expanded));
  });
}

function equipmentKey(item, index) {
  return text(item?.instanceId ?? item?.id, `${text(item?.slot, "slot")}-${index}`);
}

function equipmentIcon(item) {
  const slot = text(item?.slot);
  if (slot.startsWith("武器")) return "⚔";
  if (slot === "頭") return "⛑";
  if (slot === "体") return "🥋";
  if (slot === "足") return "👢";
  if (slot.startsWith("装飾")) return "💍";
  return "⚒";
}

function nonZeroEntries(record = {}) {
  return Object.entries(record && typeof record === "object" ? record : {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0);
}

function equipmentDetailMarkup(item) {
  const metrics = [
    ["威力", item?.power],
    ["ガード", item?.guard],
    ["攻撃AP", item?.attackAp],
    ["魔法AP", item?.magicAp],
    ["射撃", item?.shot],
    ["Cr率", item?.criticalRate],
    ["Cr威力", item?.criticalPower],
    ["射程", item?.range],
    ["ペナルティ", item?.penalty]
  ].filter(([, value]) => value !== null && value !== undefined && value !== "" && Number(value) !== 0);
  const status = nonZeroEntries(item?.statusBonus);
  const resistance = nonZeroEntries(item?.resistanceBonus);
  const traits = Array.isArray(item?.traits) ? item.traits.map(text).filter(Boolean) : [];
  const enchantments = Array.isArray(item?.enchantments) ? item.enchantments.map(text).filter(Boolean) : [];
  const enchantedStatus = nonZeroEntries(item?.enchantBonus);
  const enchantedResistance = nonZeroEntries(item?.enchantResistanceBonus);

  const metricHtml = metrics.length
    ? `<div class="equipment-detail-grid">${metrics.map(([label, value]) => `<span>${escapeHtml(label)} <b>${escapeHtml(value)}</b></span>`).join("")}</div>`
    : "";
  const line = (label, values) => values.length
    ? `<div class="equipment-detail-line"><b>${escapeHtml(label)}</b> ${values.map(([name, value]) => `${escapeHtml(name)} ${Number(value) > 0 ? "+" : ""}${escapeHtml(value)}`).join(" / ")}</div>`
    : "";
  return [
    metricHtml,
    line("能力", status),
    line("耐性", resistance),
    traits.length ? `<div class="equipment-detail-line"><b>特性</b> ${traits.map(escapeHtml).join(" / ")}</div>` : "",
    enchantments.length ? `<div class="equipment-detail-line"><b>付与</b> ${enchantments.map(escapeHtml).join(" / ")}</div>` : "",
    line("付与能力", enchantedStatus),
    line("付与耐性", enchantedResistance)
  ].filter(Boolean).join("") || '<div class="equipment-empty">追加性能なし</div>';
}

function renderEquipment(unit) {
  const host = document.getElementById("detailEquipmentList");
  if (!(host instanceof HTMLElement)) return;
  const equipment = Array.isArray(unit?.equipment) ? unit.equipment.filter(Boolean) : [];
  if (!equipment.length) {
    updateMarkup(host, '<div class="equipment-empty">装備なし</div>');
    expandedEquipmentKey = "";
    return;
  }
  updateMarkup(host, equipment.map((item, index) => {
    const key = equipmentKey(item, index);
    const expanded = key === expandedEquipmentKey;
    const quality = text(item?.qualityLabel ?? item?.quality);
    return `<button type="button" class="equipment-card${expanded ? " is-expanded" : ""}" data-v39-equipment-key="${escapeHtml(key)}" aria-expanded="${expanded}">
      <span class="equipment-summary">
        <span class="equipment-icon" aria-hidden="true">${equipmentIcon(item)}</span>
        <b class="equipment-name">${escapeHtml(text(item?.name, "名称未設定"))}</b>
        <small class="equipment-slot">${escapeHtml(text(item?.slotLabel ?? item?.slot, "-"))}</small>
        <small class="equipment-quality">${escapeHtml(quality ? `[${quality}]` : "")}</small>
      </span>
      <span class="equipment-detail">${equipmentDetailMarkup(item)}</span>
    </button>`;
  }).join(""));
}

function setExpandedEquipment(key = "") {
  expandedEquipmentKey = text(key);
  const list = document.getElementById("detailEquipmentList");
  if (!(list instanceof HTMLElement)) return;
  list.querySelectorAll("[data-v39-equipment-key]").forEach(card => {
    const expanded = text(card?.dataset?.v39EquipmentKey) === expandedEquipmentKey;
    card.classList.toggle("is-expanded", expanded);
    card.setAttribute("aria-expanded", String(expanded));
  });
}

function notifyDetailRendered(unit = null) {
  window.dispatchEvent(new CustomEvent("v39:squad-detail-rendered", {
    detail:{ unitId:unit ? unitId(unit) : "" }
  }));
}

let selectedSquadKey = "";
let selectedUnitId = "";
let expandedTechniqueName = "";
let expandedEquipmentKey = "";

function getFactionState() {
  if (renderingFaction !== undefined) return renderingFaction;
  return typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
}

function getUnits() {
  const factionState = getFactionState();
  return Array.isArray(factionState?.units) ? factionState.units : [];
}

function getSquads() {
  const factionState = getFactionState();
  const units = getUnits();
  const liveIds = new Set(units.map(unitId));
  const rows = (Array.isArray(factionState?.squads) ? factionState.squads : []).filter(Boolean)
    .map(row => ({ ...row, unitIds:(Array.isArray(row.unitIds) ? row.unitIds : []).map(String).filter(id => liveIds.has(id)) }));
  const assignedIds = new Set(rows.flatMap(row => row.unitIds));
  // 部隊の明示所属を優先し、未登録ユニットも現在の所属IDから一覧へ補う。
  units.forEach((unit, index) => {
    const id = unitId(unit, index);
    if (assignedIds.has(id)) return;
    const key = squadKey(unit);
    let row = rows.find((row, rowIndex) => squadIdOf(row, rowIndex) === key);
    if (!row) {
      row = { id:key, label:key === "solo" ? "単独" : key, unitIds:[] };
      rows.push(row);
    }
    row.unitIds.push(id);
    assignedIds.add(id);
  });
  return rows;
}

function squadIdOf(row, index = 0) {
  return text(row?.id ?? row?.squadId ?? row?.key, `squad-${index + 1}`);
}

function unitsForSquad(key) {
  const units = getUnits();
  const squad = getSquads().find((row, index) => squadIdOf(row, index) === key);
  const unitIds = new Set(Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : []);
  const order=Array.from(unitIds);
  return units.filter((unit, index) => unitIds.has(unitId(unit, index)))
    .sort((a,b)=>order.indexOf(unitId(a))-order.indexOf(unitId(b)));
}

function unitsForSelectedSquad() {
  return unitsForSquad(selectedSquadKey);
}

function squadKeyForUnitId(targetUnitId) {
  const id = text(targetUnitId);
  if (!id) return "";
  const squads = getSquads();
  for (let index = 0; index < squads.length; index += 1) {
    const squad = squads[index];
    const ids = Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : [];
    if (ids.includes(id)) return squadIdOf(squad, index);
  }
  const units = getUnits();
  const unit = units.find((row, index) => unitId(row, index) === id);
  return unit ? squadKey(unit) : "";
}

function findUnit(targetUnitId) {
  const id = text(targetUnitId);
  return getUnits().find((row, index) => unitId(row, index) === id) || null;
}

function syncSelectionFromGameState() {
  const faction = getFactionState();
  const authoritativeId = text(faction?.selectedUnitId);
  if (!authoritativeId || !findUnit(authoritativeId)) return;
  selectedUnitId = authoritativeId;
  const key = squadKeyForUnitId(authoritativeId);
  if (key) selectedSquadKey = key;
}

function persistSelectedUnit(targetUnitId, reason = "squad-unit-selected") {
  const id = text(targetUnitId);
  const unit = findUnit(id);
  if (!id || !unit) return;
  const faction = getFactionState();
  if (text(faction?.selectedUnitId) !== id && typeof window.updateV39ActiveFactionState === "function") {
    window.updateV39ActiveFactionState({ selectedUnitId:id }, { reason });
  }
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail:{ unitId:id, unit } }));
  focusV39MapTile(unit,{worldId:unit.worldId||'surface'});
}

function updateSelectorCounts() {
  const units = getUnits();
  const selector = document.getElementById("squadSelector");
  const squads = getSquads();
  if (!(selector instanceof HTMLElement)) return;
  const keys = squads.map((row, index) => squadIdOf(row, index)).filter(Boolean);
  if (!keys.includes(selectedSquadKey)) selectedSquadKey = keys[0] || "";
  updateMarkup(selector, squads.map((squad, index) => {
    const key = squadIdOf(squad, index);
    const ids = new Set(Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : []);
    const count = units.filter((unit, unitIndex) => ids.has(unitId(unit, unitIndex))).length;
    const label = text(squad?.label ?? squad?.name, key === "solo" ? "単独" : key);
    return `<button class="squad-select-btn${key === selectedSquadKey ? " active" : ""}" data-squad-select="${key}"><b>${label}</b><small>${count}体</small></button>`;
  }).join(""));
}

function renderMemberList() {
  const list = document.getElementById("squadMemberList");
  if (!(list instanceof HTMLElement)) return;

  const units = unitsForSelectedSquad();
  if (!units.length) {
    selectedUnitId = "";
    updateMarkup(list, '<div class="squad-empty">この部隊に実ユニットはいません</div>');
    return;
  }

  if (!units.some((unit, index) => unitId(unit, index) === selectedUnitId)) {
    selectedUnitId = unitId(units[0], 0);
  }

  updateMarkup(list, units.map((unit, index) => {
    const id = unitId(unit, index);
    const selected = id === selectedUnitId;
    const hp = hpValues(unit);
    const ap = apValues(unit);
    const defenses = defenseDisplay(unit);
    const icon = text(unit?.icon ?? unit?.glyph ?? unit?.symbol, "◆");
    return renderV39UnitCard(unit, {id,selected,hp,ap,defenses,icon,portrait:true,name:unitName(unit,index),position:unitPosition(unit)});
  }).join(""));
}

function renderDetail() {
  const units = unitsForSelectedSquad();
  const unit = units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0];
  const pane = document.getElementById("squadDetailPane");
  if (!unit) {
    updateMarkup(document.getElementById('detailUnitHeading'),'');
    if (pane) pane.dataset.empty = "1";
    updateV39UnitAbility(document.getElementById("detailAbilitySections"), null, {fieldIds:true});
    const prof = document.getElementById("detailProficiencyList");
    const resistance = document.getElementById("detailResistanceList");
    const equipment = document.getElementById("detailEquipmentList");
    const tech = document.getElementById("detailTechniqueRows");
    updateMarkup(prof, '<div class="squad-empty">技能データなし</div>');
    updateMarkup(resistance, '<div class="squad-empty">耐性データなし</div>');
    updateMarkup(equipment, '<div class="equipment-empty">装備なし</div>');
    updateMarkup(tech, '<div class="squad-empty">行動データなし</div>');
    expandedEquipmentKey = "";
    notifyDetailRendered();
    return;
  }
  if (pane) delete pane.dataset.empty;
  const head=pane?.querySelector('.squad-detail-minihead');
  if(head){
    let controls=head.querySelector('[data-squad-coordination-host]');
    if(!controls){controls=document.createElement('div');controls.dataset.squadCoordinationHost='';controls.style.cssText='flex-basis:100%;min-width:0';head.append(controls);}
    const open=controls.querySelector('details')?.open;
    updateMarkup(controls,renderV39SquadCoordination(unit,renderingFaction));
    if(open&&controls.querySelector('details'))controls.querySelector('details').open=true;
  }

  updateMarkup(document.getElementById('detailUnitHeading'),renderV39UnitHeading(unit));

  const movementGroup = resolveV39SquadMovementGroup(getFactionState() || {}, selectedUnitId,
    {followFormation:true});
  const moveValue = movementGroup?.ok ? Math.max(1, num(movementGroup.movement, 1)) : Math.max(1, num(movementValue(unit), 1));
  const moveBaseAp = Math.ceil(resolveV39BaseMoveApCost(moveValue));
  const moveApEl = document.getElementById("mobileMoveAp");
  const moveMetaEl = document.getElementById("mobileMoveMeta");
  const moveRemainEl = document.getElementById("mobileMoveRemain");
  if (moveApEl) {
    moveApEl.textContent = `AP ${moveBaseAp}/マス`;
    moveApEl.hidden = false;
  }
  if (moveMetaEl) {
    moveMetaEl.textContent = `移${moveValue}`;
    moveMetaEl.hidden = false;
  }
  if (moveRemainEl) {
    moveRemainEl.textContent = movementGroup?.ok ? `残AP ${movementGroup.moveAp}` : "";
    moveRemainEl.hidden = !movementGroup?.ok;
  }
  const ability = document.getElementById("detailAbilitySections");
  updateV39UnitAbility(ability, unit, {
    mapData:window.__v39FieldRuntime?.mapData, fieldIds:true
  });
  renderEquipment(unit);

  const tech = document.getElementById("detailTechniqueRows");
  if (tech) {
    updateMarkup(tech, renderV39UnitSkills(unit, {mapData:window.__v39FieldRuntime?.mapData, expandedName:expandedTechniqueName, interactive:true}));
  }
  setExpandedTechnique(expandedTechniqueName);
  notifyDetailRendered(unit);
}

function render() {
  // One detached faction snapshot per render, not another deep clone for every lookup.
  renderingFaction = getFactionState();
  try {
    syncSelectionFromGameState();
    updateSelectorCounts();
    renderMemberList();
    renderDetail();
    window.refreshV39SquadCardVitals?.();
  } finally {
    renderingFaction = undefined;
  }
}

let renderQueued = false;
function scheduleRender(event) {
  if (event?.detail?.reason === "activity-log") return;
  if (event?.detail?.reason === "active-player") {
    selectedSquadKey = "";
    selectedUnitId = "";
  }
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function install() {
  const selector = document.getElementById("squadSelector");
  const list = document.getElementById("squadMemberList");
  if (!(selector instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    window.setTimeout(install, 50);
    return;
  }

  const active = selector.querySelector("[data-squad-select].active");
  selectedSquadKey = active?.dataset?.squadSelect || "";
  syncSelectionFromGameState();

  selector.addEventListener("click", event => {
    const btn = event.target instanceof Element ? event.target.closest("[data-squad-select]") : null;
    if (!btn) return;
    selectedSquadKey = btn.dataset.squadSelect || "";
    expandedTechniqueName = "";
    expandedEquipmentKey = "";
    const first = unitsForSquad(selectedSquadKey)[0] || null;
    selectedUnitId = first ? unitId(first, 0) : "";
    if (selectedUnitId) persistSelectedUnit(selectedUnitId, "squad-selection-changed");
    scheduleRender();
  }, true);

  list.addEventListener("click", event => {
    const card = event.target instanceof Element ? event.target.closest("[data-v39-unit-id]") : null;
    if (!card) return;
    selectedUnitId = card.dataset.v39UnitId || "";
    expandedTechniqueName = "";
    expandedEquipmentKey = "";
    if (selectedUnitId) persistSelectedUnit(selectedUnitId, "squad-unit-selected");
    scheduleRender();
  }, true);

  const techniqueList = document.getElementById("detailTechniqueList");
  techniqueList?.addEventListener("click", event => {
    if (event.target instanceof Element && event.target.closest("[data-v39-system-use]")) return;
    const card = event.target instanceof Element ? event.target.closest("[data-v39-technique-name]") : null;
    if (!card) return;
    const name = text(card.dataset.v39TechniqueName);
    if (["__system_wait__", "__system_survey__", "__system_gather__"].includes(name) || name.startsWith("__cave_site_")) {
      window.cancelV39SelectedUnitMove?.("system-action-preview");
      window.cancelV39SelectedUnitAttack?.("system-action-preview");
    }
    setExpandedTechnique(expandedTechniqueName === name ? "" : name);
  }, true);
  techniqueList?.addEventListener("keydown", event => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('.system-action-card[role="button"]')) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.target.click(); }
  });

  const equipmentList = document.getElementById("detailEquipmentList");
  equipmentList?.addEventListener("click", event => {
    const card = event.target instanceof Element ? event.target.closest("[data-v39-equipment-key]") : null;
    if (!card) return;
    const key = text(card.dataset.v39EquipmentKey);
    setExpandedEquipment(expandedEquipmentKey === key ? "" : key);
  }, true);

  window.addEventListener("v39:game-state-changed", scheduleRender);
  window.addEventListener("v39:unit-selected", scheduleRender);
  window.refreshV39SquadDerivedUI = render;
  window.openV39ActionDetail = name => {
    window.cancelV39SelectedUnitMove?.("system-action-preview");
    window.cancelV39SelectedUnitAttack?.("system-action-preview");
    window.activateV39FooterTab?.("squad");
    document.querySelector('[data-squad-detail-tab="basic"]')?.click();
    setExpandedTechnique(name);
    const card = [...document.querySelectorAll("[data-v39-technique-name]")].find(row => row.dataset.v39TechniqueName === name);
    card?.scrollIntoView({ block:"nearest" });
  };
  window.getV39SelectedSquadUnit = () => {
    syncSelectionFromGameState();
    const units = unitsForSelectedSquad();
    return units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0] || null;
  };

  render();
}

install();
