import { applyV39TerrainModifiers } from "../../lib/v39-terrain-modifiers.js";
import { RESISTANCE_FIELDS } from "../../constants/unitCommon.js";
import { formatResistanceValue, getResistanceIconSrc, resistanceValueTone } from "../../lib/resistance-display.js";
import "./v39-unit-detail.css";
import {EQUIPMENT_SLOT_KEYS} from '../../constants/unitCommon.js';

const escapeHtml = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");

// 項目・表示名・順序はフィールドと自キャラ画面で共有する。
const STATUS_FIELDS = [
  ["攻撃", "攻撃", "detailAtk"], ["防御", "防御", "detailDef"],
  ["魔力", "魔力", "detailMatk"], ["精神", "精神", "detailMdef"],
  ["命中", "命中", "detailHit"], ["速度", "速度", "detailSpd"],
  ["SIZ", "SIZ", "detailSiz"], ["移動", "移動", "detailMov"]
];

export function renderV39DetailSection(label, content) {
  return `<details class="squad-detail-section" open><summary class="squad-detail-section-title">${escapeHtml(label)}</summary><div class="squad-detail-section-body">${content}</div></details>`;
}

export function renderV39DetailTabs(tabs, active, attribute) {
  return `<div class="squad-detail-tabs" style="--v39-detail-tab-count:${tabs.length}" role="tablist" aria-label="キャラクター詳細">${tabs.map(([key, label]) =>
    `<button type="button" class="squad-detail-tab${key === active ? " active" : ""}" ${attribute}="${escapeHtml(key)}" role="tab" aria-selected="${key === active}">${escapeHtml(label)}</button>`
  ).join("")}</div>`;
}

export function renderV39UnitEquipment(unit,{readOnly=true,disabled=false}={}){
  const equipment=Array.isArray(unit?.equipment)?unit.equipment:[];
  return `<div class="v39-char-equipment-list">${EQUIPMENT_SLOT_KEYS.map(slot=>{
    const item=equipment.find(row=>row.slot===slot);
    const quality=item?.qualityLabel||item?.quality;
    const content=`<span>${escapeHtml(slot)}</span><b>${escapeHtml(item?.name||'なし')}${quality?` [${escapeHtml(quality)}]`:''}</b>`;
    return readOnly?`<div class="v39-char-equipment-row">${content}</div>`
      :`<button type="button" class="v39-char-equipment-row" data-v39-character-equip-open="${escapeHtml(slot)}"${disabled?' disabled':''}>${content}</button>`;
  }).join('')}</div>`;
}

export function renderV39UnitGrowth(unit){
  const derived=unit?.derivedCharacter||{},number=value=>Math.max(0,Math.floor(Number(value)||0));
  const rows=[['総合Lv',Math.max(1,number(unit?.level))],
    [`${unit?.race||'種族'} Lv`,derived.growthCaps?.raceLevels>0?`${number(derived.raceLevels)} / ${derived.growthCaps.raceLevels}`:number(derived.raceLevels)],
    [`${unit?.className||'クラス'} Lv`,derived.growthCaps?`${number(derived.classLevels)} / ${derived.growthCaps.classLevels}`:number(derived.classLevels)]];
  for(const [name,levels] of Object.entries(derived.prerequisiteClassLevels||{}))rows.push([`${name} Lv`,levels]);
  const second=derived.secondClassName||unit?.secondClassName||unit?.subClassName;
  if(second)rows.push([`${second} Lv`,1]);
  if(derived.strongAnimalClassName)rows.push([`${derived.strongAnimalClassName} Lv`,derived.strongAnimalClassLevel]);
  if(unit?.fusionGrowth){
    rows.push(['合体・基礎EXP',`${Number(unit.fusionGrowth.baseExp||0).toFixed(1)} / ${unit.fusionGrowth.baseNeed}`]);
    for(const [name,exp] of Object.entries(unit.fusionGrowth.classExp||{}))rows.push([`${name} EXP`,Number(exp).toFixed(1)]);
  }
  return `<div class="v39-char-growth-list">${rows.map(([label,value])=>`<div class="v39-char-growth-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

export function renderV39UnitAbility(unit, { mapData, fieldIds = false } = {}) {
  const adjusted = applyV39TerrainModifiers(unit, mapData);
  const id = value => fieldIds ? ` id="${value}"` : "";
  const stats = STATUS_FIELDS.map(([label, key, fieldId]) => {
    const raw = key === "移動"
      ? unit?.movement ?? unit?.status?.移動 ?? unit?.move ?? unit?.moveRange ?? unit?.移動
      : adjusted?.status?.[key];
    const modifier = key === "移動" ? 0 : Number(adjusted?.terrainModifiers?.[key]) || 0;
    const value = !Number.isFinite(Number(raw)) ? "-"
      : modifier ? `${Number(raw)} (${modifier > 0 ? "+" : ""}${modifier})` : Number(raw);
    return `<div class="detail-stat"><span>${label}</span><b${id(fieldId)}>${escapeHtml(value)}</b></div>`;
  }).join("");
  const skills = Object.entries(adjusted?.skillLevels || {})
    .filter(([, value]) => Number.isFinite(Number(value)) && Number(value) !== 0)
    .map(([name, value]) => `<div class="proficiency-item"><span>${escapeHtml(name)}</span><b>${escapeHtml(Number(value))}</b></div>`).join("");
  const resistances = RESISTANCE_FIELDS.flatMap(key => {
    const value = Number(adjusted?.resistances?.[key]);
    if (!Number.isFinite(value) || value === 0) return [];
    const icon = getResistanceIconSrc(key);
    return [`<button type="button" class="v39-resistance-indicator ${resistanceValueTone(value)}" data-v39-resistance-label="${escapeHtml(key)}" aria-label="${escapeHtml(key)} ${escapeHtml(formatResistanceValue(value))}">
      ${icon ? `<img src="${escapeHtml(icon)}" alt="" aria-hidden="true" class="v39-resistance-icon">` : '<span class="v39-resistance-icon-fallback" aria-hidden="true">?</span>'}
      <b>${escapeHtml(formatResistanceValue(value))}</b></button>`];
  }).join("");
  const empty = message => `<div class="squad-empty">${message}</div>`;
  return renderV39DetailSection("ステータス", `<div class="squad-detail-stats v39-char-status-grid">${stats}</div>`)
    + renderV39DetailSection("技能", `<div class="proficiency-grid"${id("detailProficiencyList")}>${skills || empty("技能データなし")}</div>`)
    + renderV39DetailSection("耐性", `<div class="v39-resistance-grid"${id("detailResistanceList")}>${resistances || empty("耐性データなし")}</div>`);
}

export function updateV39UnitAbility(host, unit, options) {
  if (!host) return;
  const markup = renderV39UnitAbility(unit, options);
  if (host.__v39AbilityMarkup === markup) return;
  const closed = new Set(Array.from(host.querySelectorAll("details:not([open])"),
    section => section.querySelector("summary")?.textContent));
  host.innerHTML = markup;
  host.__v39AbilityMarkup = markup;
  for (const section of host.querySelectorAll("details")) {
    if (closed.has(section.querySelector("summary")?.textContent)) section.open = false;
  }
}
