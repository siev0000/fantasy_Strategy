import { renderV39UnitSkills } from "./v39-unit-skills.js";
import {canV39ChangeUnitEquipmentSlot} from "../../lib/v39-equipment-rules.js";
import {renderV39EquipmentDisplayRow} from "../ui/v39-equipment-display.js";
import {visualV39CombatUnit} from '../../lib/v39-combat-visual-state.js';
import {resolveV39MaxAp} from '../../lib/v39-control-status.js';
import { focusV39MapTile } from '../map/v39-map-focus.js';
import { resolveV39BaseMoveApCost, resolveV39MovementMultiplier } from "../../lib/v39-gameplay-balance.js";
import { resolveV39SquadMovementGroup } from "../../lib/v39-squad-movement-rules.js";
import { renderV39UnitCard } from "./v39-unit-card.js";
import { renderV39GeneratedWeaponMove,updateV39UnitAbility } from "./v39-unit-detail.js";
import { getV39EffectiveEquipment } from "../../lib/v39-generated-weapon.js";
import {renderV39SquadCoordination,renderV39GolemBoarding} from './v39-squad-coordination-ui.js';
import {renderV39RubbleActions} from '../world/v39-terrain-destruction.js';
import {renderV39UnitHeading} from './v39-unit-heading.js';
import {renderV39TeleportGateActions} from './v39-teleport-ui.js';
import {createV39BasicActionNavigation} from './v39-basic-action-navigation.js';
import {renderV39ScreenIcon} from '../ui/v39-screen-icons.js';

const renderedMarkup = new WeakMap();
let renderingFaction;
let basicNavigation;
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
  unit=visualV39CombatUnit(unit);
  const max = Math.max(0, num(unit?.maxHp ?? unit?.status?.HP, 0));
  const current = Math.max(0, num(unit?.hp ?? unit?.currentHp, max));
  return { current, max };
}

function apValues(unit) {
  const max = resolveV39MaxAp(unit,num(unit?.maxAp ?? unit?.apMax ?? unit?.status?.AP,0));
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
  const heading = document.getElementById("detailEquipmentHeading");
  for (const target of [host, heading]) {
    if (unit?.id && unit.hp > 0) target?.setAttribute("data-v39-equip-hold-unit", unit.id);
    else target?.removeAttribute("data-v39-equip-hold-unit");
  }
  const equipment = getV39EffectiveEquipment(unit).filter(Boolean);
  const moveControl = unit && !unit.boardingHost ? renderV39GeneratedWeaponMove(unit) : '';
  if (!equipment.length && !moveControl) {
    updateMarkup(host, '<div class="equipment-empty">装備なし</div>');
    expandedEquipmentKey = "";
    return;
  }
  updateMarkup(host, moveControl + equipment.map((item, index) => {
    const key = equipmentKey(item, index);
    return renderV39EquipmentDisplayRow(item,{expandKey:key,expanded:key===expandedEquipmentKey,detail:equipmentDetailMarkup(item),changeUnitId:unit.hp > 0 && canV39ChangeUnitEquipmentSlot(unit,item.slot) ? unit.id : undefined});
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
let inspectedPilotId = "";
let inspectionAnchorId = "";
let expandedTechniqueName = "";
let expandedEquipmentKey = "";

function getFactionState() {
  if (renderingFaction !== undefined) return renderingFaction;
  return typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
}

function getUnits(factionState = getFactionState()) {
  return (factionState?.units || []).flatMap(unit => unit.boardingPilot
    ? [unit,{...unit.boardingPilot,boardingHost:unit,x:unit.x,y:unit.y,worldId:unit.worldId}]
    : [unit]);
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

function findUnit(targetUnitId, faction = getFactionState()) {
  const id = text(targetUnitId);
  return getUnits(faction).find((row, index) => unitId(row, index) === id) || null;
}

function syncSelectionFromGameState() {
  const faction = getFactionState();
  const authoritativeId = text(faction?.selectedUnitId);
  if (inspectedPilotId && authoritativeId === inspectionAnchorId && findUnit(inspectedPilotId)?.boardingHost) return;
  inspectedPilotId = "";
  if (!authoritativeId || !findUnit(authoritativeId)) return;
  selectedUnitId = authoritativeId;
  const key = squadKeyForUnitId(authoritativeId);
  if (key) selectedSquadKey = key;
}

function persistSelectedUnit(targetUnitId, reason = "squad-unit-selected") {
  const id = text(targetUnitId);
  if (!id) return;
  const faction = getFactionState();
  const unit = findUnit(id, faction);
  if (!unit) return;
  if (unit.boardingHost) {
    inspectedPilotId = id;
    inspectionAnchorId = text(faction?.selectedUnitId);
    basicNavigation?.back();
    return;
  }
  inspectedPilotId = "";
  const mapFocusHandled = focusV39MapTile(unit, { worldId:unit.worldId || "surface", select:true, notify:false });
  if (text(faction?.selectedUnitId) !== id && typeof window.updateV39ActiveFactionState === "function") {
    window.updateV39ActiveFactionState({ selectedUnitId:id }, { reason, returnState:false });
  }
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail:{ unitId:id, unit, mapFocusHandled } }));
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
    return renderV39UnitCard(unit, {id,selected,hp,ap,defenses,icon,portrait:true,name:unitName(unit,index),
      position:unit.boardingHost ? `搭乗中：${unit.boardingHost.name}` : unitPosition(unit)});
  }).join(""));
}

function renderDetail() {
  const units = unitsForSelectedSquad();
  const unit = units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0];
  const pane = document.getElementById("squadDetailPane");
  pane?.toggleAttribute('data-boarding-pilot',!!unit?.boardingHost);
  if (!unit) {
    updateMarkup(document.getElementById('v39-rubble-actions'),'');
    updateMarkup(pane?.querySelector('[data-squad-coordination-host]'),'');
    updateMarkup(document.getElementById('v39-golem-boarding-actions'),'');
    updateMarkup(document.getElementById('v39-teleport-gate-actions'),'');
    updateMarkup(document.getElementById('detailUnitHeading'),'');
    if (pane) pane.dataset.empty = "1";
    updateV39UnitAbility(document.getElementById("detailAbilitySections"), null, {fieldIds:true});
    const prof = document.getElementById("detailProficiencyList");
    const resistance = document.getElementById("detailResistanceList");
    const tech = document.getElementById("detailTechniqueRows");
    updateMarkup(prof, '<div class="squad-empty">技能データなし</div>');
    updateMarkup(resistance, '<div class="squad-empty">耐性データなし</div>');
    renderEquipment(null);
    updateMarkup(tech, '<div class="squad-empty">行動データなし</div>');
    expandedEquipmentKey = "";
    notifyDetailRendered();
    return;
  }
  if (pane) delete pane.dataset.empty;
  updateMarkup(pane?.querySelector('[data-squad-coordination-host]'),unit.boardingHost?'':renderV39SquadCoordination(unit,renderingFaction));
  updateMarkup(document.getElementById('v39-golem-boarding-actions'),
    renderV39GolemBoarding(unit.boardingHost||unit,renderingFaction,window.__v39FieldRuntime?.mapData));

  updateMarkup(document.getElementById('detailUnitHeading'),renderV39UnitHeading(unit));

  const movementGroup = resolveV39SquadMovementGroup(getFactionState() || {}, selectedUnitId,
    {followFormation:true});
  const moveValue = movementGroup?.ok ? Math.max(1, num(movementGroup.movement, 1)) : Math.max(1, num(movementValue(unit), 1));
  const mapData=window.__v39FieldRuntime?.mapData;
  const moveBaseAp = Math.ceil(resolveV39BaseMoveApCost(moveValue,mapData));
  const moveMultiplier=resolveV39MovementMultiplier(mapData);
  const moveApEl = document.getElementById("mobileMoveAp");
  const moveMetaEl = document.getElementById("mobileMoveMeta");
  const moveRemainEl = document.getElementById("mobileMoveRemain");
  if (moveApEl) {
    moveApEl.textContent = `AP ${moveBaseAp}/マス`;
    moveApEl.hidden = false;
  }
  if (moveMetaEl) {
    moveMetaEl.textContent = `移${moveValue}${moveMultiplier!==1?` ×${moveMultiplier}`:''}`;
    moveMetaEl.hidden = false;
  }
  if (moveRemainEl) {
    moveRemainEl.textContent = movementGroup?.ok ? `残AP ${movementGroup.moveAp}` : "";
    moveRemainEl.hidden = !movementGroup?.ok;
  }
  const ability = document.getElementById("detailAbilitySections");
  updateV39UnitAbility(ability, unit, {
    mapData:window.__v39FieldRuntime?.mapData, fieldIds:true, interactive:!unit.boardingHost
  });
  renderEquipment(unit);
  updateMarkup(document.getElementById('v39-rubble-actions'),unit.boardingHost?'':renderV39RubbleActions(unit));
  updateMarkup(document.getElementById('v39-teleport-gate-actions'),unit.boardingHost?'':renderV39TeleportGateActions(unit,window.__v39FieldRuntime?.mapData));

  const tech = document.getElementById("detailTechniqueRows");
  if (tech) {
    updateMarkup(tech, renderV39UnitSkills(unit, {mapData:window.__v39FieldRuntime?.mapData, expandedName:expandedTechniqueName, interactive:!unit.boardingHost}));
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
    basicNavigation?.sync();
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
    inspectedPilotId = "";
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
  const basicList=document.getElementById('detailBasicList');
  if(basicList&&!basicNavigation){
    basicNavigation=createV39BasicActionNavigation({
      panel:basicList.closest('[data-squad-detail-panel="basic"]'),list:basicList,
      options:document.getElementById('v39-basic-action-options'),
      renderIcon:renderV39ScreenIcon,
      heading:document.getElementById('v39-basic-action-heading'),
      onBack:()=>{window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('basic-action-back');setExpandedTechnique('');},
      onChange:key=>window.dispatchEvent(new CustomEvent('v39:basic-action-changed',{detail:{key}}))
    });
    window.openV39BasicAction=id=>basicNavigation.select(document.getElementById(id));
    const observer=new MutationObserver(()=>basicNavigation.sync());
    observer.observe(basicList,{childList:true,subtree:true,characterData:true,attributes:true,
      attributeFilter:['hidden','data-basic-action-label','data-basic-action-meta']});
  }
  selectedSquadKey = active?.dataset?.squadSelect || "";
  syncSelectionFromGameState();

  selector.addEventListener("click", event => {
    const btn = event.target instanceof Element ? event.target.closest("[data-squad-select]") : null;
    if (!btn) return;
    selectedSquadKey = btn.dataset.squadSelect || "";
    inspectedPilotId = "";
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
    if (["__system_wait__", "__system_recovery_wait__", "__system_survey__", "__system_gather__", "__system_soul_recovery__"].includes(name) || name.startsWith("__cave_site_")) {
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
  window.addEventListener('v39:combat-visual-hp-released',scheduleRender);
  window.addEventListener("v39:unit-selected", scheduleRender);
  window.refreshV39SquadDerivedUI = render;
  window.openV39ActionDetail = name => {
    window.cancelV39SelectedUnitMove?.("system-action-preview");
    window.cancelV39SelectedUnitAttack?.("system-action-preview");
    window.activateV39FooterTab?.("squad");
    document.querySelector('[data-squad-detail-tab="basic"]')?.click();
    setExpandedTechnique(name);
    const card = [...document.querySelectorAll("[data-v39-technique-name]")].find(row => row.dataset.v39TechniqueName === name);
    basicNavigation?.select(card);
    card?.scrollIntoView({ block:"nearest" });
  };
  window.getV39SelectedSquadUnit = () => {
    syncSelectionFromGameState();
    const units = unitsForSelectedSquad();
    const unit=units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0];
    return unit?.boardingHost ? null : unit||null;
  };

  render();
}

install();
