import "./v39-item-list-screen-1.css";
import "../unit/v39-enchantment-options.css";
import {resolveV39ResourceIcon} from "../../lib/resource-icon-glyphs.js";
import {renderV39UnitCard} from "../unit/v39-unit-card.js";
import {renderV39UnitAbility} from "../unit/v39-unit-detail.js";
import {renderV39UnitSkills} from "../unit/v39-unit-skills.js";
import {installV39ItemListPortraitPreview} from "./v39-item-list-portrait-preview.js";
import {renderV39EquipmentDisplayRow} from "./v39-equipment-display.js";

if (typeof document !== "undefined") installV39ItemListPortraitPreview();

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[character]));

const dataAttribute = (name, value = "") => /^data-[a-z][a-z0-9-]*$/.test(name)
  ? ` ${name}="${escapeHtml(value)}"` : "";
const actionData = ({id, value, destination, attribute}) =>
  ` data-v39-item-list-action="${escapeHtml(id)}"${value === undefined ? "" : ` data-v39-item-list-value="${escapeHtml(value)}"`}${destination ? ` data-v39-item-list-destination="${escapeHtml(destination)}"` : ""}${dataAttribute(attribute,value)}`;

function button(action) {
  return `<button type="button" class="v39-summon-action"${actionData(action)}${action.selected === undefined ? "" : ` aria-pressed="${Boolean(action.selected)}"`}${action.disabled ? " disabled" : ""}>${escapeHtml(action.label)}</button>`;
}

function renderControls(controls) {
  if (!controls?.length) return "";
  return `<div class="v39-item-list-controls">${controls.map(({id,label,options,value,attribute}) =>
    `<label>${escapeHtml(label)}<select${actionData({id,attribute})}>${options.map(option =>
      `<option value="${escapeHtml(option.value)}"${String(option.value) === String(value) ? " selected" : ""}>${escapeHtml(option.label)}</option>`
    ).join("")}</select></label>`
  ).join("")}</div>`;
}

function renderIcon(icon) {
  return icon ? `<span class="v39-item-list-icon" aria-hidden="true">${icon}</span>` : "";
}

function renderIconLabel(icon, label) {
  return `<span class="v39-item-list-icon-label">${renderIcon(icon)}<b>${escapeHtml(label)}</b></span>`;
}

function renderItemDetail({heading, icon, facts = [], sections = []}) {
  return `<div class="summon-scroll">${heading ? `<h4>${renderIconLabel(icon, heading)}</h4>` : ""}
    ${facts.length ? `<dl class="v39-item-list-facts">${facts.map(({label,value}) =>
      `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join("")}</dl>` : ""}
    ${sections.map(({label,lines}) => `<h4>${escapeHtml(label)}</h4>${renderLines(lines)}`).join("")}</div>`;
}

function renderCandidates(rows, {selectedId, candidateAttribute, cardAttribute, emptyText}) {
  return rows.map(({id,unit,label,meta,unavailable,badge,icon,metrics}) => {
    const selected = id === selectedId;
    const action = {id:"candidate",value:id,attribute:candidateAttribute};
    const content = unit ? renderV39UnitCard(unit, {
      id, character:true, portrait:true, attribute:cardAttribute || "data-v39-item-list-card", selected, position:meta ?? ""
    }) : icon || metrics?.length ? `<button type="button" class="v39-summon-action v39-item-list-compact-card${icon ? " has-icon" : ""}"${actionData(action)} aria-pressed="${selected}">
      ${renderIcon(icon)}<span class="v39-item-list-compact-main">
        <b>${escapeHtml(label)}</b>
        ${metrics?.length ? `<span class="v39-item-list-compact-metrics">${metrics.map(metric => `<span>${escapeHtml(metric)}</span>`).join("")}</span>` : ""}
      </span>
    </button>` : button({id:"candidate",value:id,label,selected});
    return `<div${actionData(action)} class="${unavailable ? "unavailable" : ""}">${content}${badge
      ? `<small class="v39-item-list-candidate-badge"><span aria-hidden="true">${escapeHtml(badge.icon)}</span> ${escapeHtml(badge.label)}</small>` : ""}</div>`;
  }).join("") || `<p>${escapeHtml(emptyText || "候補がありません")}</p>`;
}

function renderEquipment(groups) {
  if (!groups.length) return "<p>初期装備なし</p>";
  const hasRandomEquipment = groups.some(({items}) => items.length > 1);
  return `<div class="v39-item-list-equipment">${groups.map(({slot,items}) => `<div class="v39-item-list-equipment-group">
    ${items.length > 1 ? `<span class="v39-item-list-equipment-group-label">${escapeHtml(slot)}の抽選候補</span>` : ""}
    ${items.map(item => renderV39EquipmentDisplayRow(item,{slot})).join("")}
  </div>`).join("")}</div>
    ${hasRandomEquipment ? "<p>能力は各部位の先頭候補を装備した場合の表示です。</p>" : ""}`;
}

function renderUnitDetail({unit,activeDetailTab,detailTabAttribute,notes,equipment}) {
  if (!unit) return '<div class="summon-scroll"></div>';
  const tabs = [["ability","能力"],["skills","スキル"]];
  if (equipment) tabs.push(["equipment","装備"]);
  const content = activeDetailTab === "skills" ? renderV39UnitSkills(unit)
    : activeDetailTab === "equipment" && equipment ? renderEquipment(equipment)
    : `${renderLines(notes)}${renderV39UnitAbility(unit)}`;
  return `<div class="squad-detail-tabs" style="--v39-detail-tab-count:${tabs.length}" role="tablist" aria-label="キャラクター詳細">${tabs.map(([id,label]) =>
    `<button type="button" class="squad-detail-tab${id === activeDetailTab ? " active" : ""}"${actionData({id:"detail-tab",value:id,attribute:detailTabAttribute})} role="tab" aria-selected="${id === activeDetailTab}">${label}</button>`
  ).join("")}</div>
    <div class="summon-scroll">${content}</div>`;
}

const renderLines = (lines = []) => lines.map(line => `<p>${escapeHtml(line)}</p>`).join("");

function renderEnhancements({section,limitText,choices = []}) {
  return `<h4>${escapeHtml(section)}</h4>${limitText ? `<p>${escapeHtml(limitText)}</p>` : ""}
    <div class="summon-scroll"><div class="v39-enchant-options">${choices.map(choice =>
      `<div class="v39-item-list-enhancement-option"><button type="button"${actionData(choice)} class="${choice.selected ? "active" : ""}" aria-pressed="${Boolean(choice.selected)}"${choice.disabled ? " disabled" : ""}>
      <b>${escapeHtml(choice.label)}</b>${choice.detail ? `<span>${escapeHtml(choice.detail)}</span>` : ""}</button>
      ${renderV39ItemListCost("素材",choice.amounts)}</div>`
    ).join("") || "<p>付与候補がありません</p>"}</div></div>`;
}

export function readV39ItemListAction(element) {
  const control = element?.closest?.("[data-v39-item-list-action]");
  if (!control || control.disabled) return null;
  return {
    id:control.dataset.v39ItemListAction,
    value:control.tagName === "SELECT" ? control.value : control.dataset.v39ItemListValue,
    destination:control.dataset.v39ItemListDestination
  };
}

export function renderV39ItemListScreen1({
  title, titleId = "v39-item-list-screen-1-title", closeAttribute, help = [], tabs = [], activeTab,
  rows = [], listControls, listNotes, listActions = [], groups, detail = {}, enhancement = null, actions = [],
  costs = [], status, footerNotes
}) {
  const headingId = escapeHtml(titleId);
  const navigation = tabs.length ? `<nav class="v39-item-list-tabs" aria-label="種別">
      ${tabs.map(({id,label}) => button({id:"tab",value:id,label,selected:id===activeTab,attribute:"data-v39-item-list-tab"})).join("")}
    </nav>` : "";
  const left = `${renderLines(listNotes)}${renderControls(listControls)}${listActions.map(button).join("")}${groups
    ? groups.map(group => button(group)).join("")
    : renderCandidates(rows,detail)}`;
  const main = detail.kind === "enhancement" ? renderEnhancements(detail)
    : detail.kind === "review" ? `<h4>${escapeHtml(detail.heading)}</h4><div class="summon-scroll">${renderLines(detail.lines)}</div>`
    : detail.kind === "item" ? renderItemDetail(detail)
    : renderUnitDetail(detail);
  const buttons = enhancement ? [...actions,{id:"enhance",label:"付与へ進む",...enhancement}] : actions;
  return `<section class="modal v39-item-list-screen-1" role="dialog" aria-modal="true" aria-labelledby="${headingId}">
    <header class="modal-header"><h3 id="${headingId}">${escapeHtml(title)}</h3>${navigation}
    <div class="v39-item-list-header-actions">${help.length ? `<details class="v39-item-list-help"><summary aria-label="画面の説明">？</summary>
      <div class="v39-item-list-help-content">${renderLines(help)}</div></details>` : ""}<button type="button"${actionData({id:"close",attribute:closeAttribute})} class="v39-item-list-close v39-summon-action" aria-label="閉じる">×</button></div></header>
    <div class="modal-body character-layout"><div class="list-pane">${left}</div>
    <div class="summon-detail squad-detail-pane">${renderControls(detail.controls)}${main}
      <footer>${renderLines(footerNotes)}${costs.map(({label,amounts,summary,stock}) => renderV39ItemListCost(label,amounts,{summary,stock})).join("")}
        ${status ? `<p role="status">${escapeHtml(status)}</p>` : ""}
        <div class="v39-item-list-actions">${buttons.map(button).join("")}</div>
      </footer></div></div></section>`;
}

function renderV39ItemListCost(label, amounts, {summary = "", stock} = {}) {
  const resources = Object.entries(amounts ?? {}).filter(([, amount]) => Number(amount) > 0);
  if (!resources.length && !summary) return "";
  return `<div class="v39-item-list-cost"><b>${escapeHtml(label)}</b>${summary ? `<span>${escapeHtml(summary)}</span>` : ""}
    ${resources.map(([name, amount]) => {
      const {glyph, color, kind} = resolveV39ResourceIcon(name);
      const quantity = stock ? `${stock[name] ?? 0}/${amount}` : amount;
      return `<details class="v39-item-list-resource"><summary aria-label="${escapeHtml(`${name} ${quantity}`)}" title="${escapeHtml(name)}">
        <span aria-hidden="true" class="resource-glyph-icon is-${kind}" style="--resource-icon-color:${color || 'inherit'}">${escapeHtml(glyph)}</span> ${escapeHtml(quantity)}</summary>
        <span class="v39-item-list-resource-name">${escapeHtml(name)}</span></details>`;
    }).join("")}</div>`;
}
