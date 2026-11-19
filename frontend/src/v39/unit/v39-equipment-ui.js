import "./v39-enchantment-options.css";
import "./v39-equipment-ui.css";
import {renderV39EquipmentRarityBadge,renderV39EquipmentIcon} from "../ui/v39-equipment-display.js";
import {
  V39_EQUIPMENT_RARITIES,
  applyV39EquipmentEnchantment,
  changeV39UnitEquipment,
  canV39ChangeUnitEquipmentSlot,
  craftV39Equipment,
  createV39EquipmentEntry,
  getV39EquipmentCatalog,
  inspectV39EquipmentCraft,
  getV39EquipmentInventoryView,
  getV39EnchantmentOptions,
  normalizeV39EquipmentItem,
  rerollV39MobEquipment
} from "../../lib/v39-equipment-rules.js";
import { EQUIPMENT_SLOT_KEYS } from "../../constants/unitCommon.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { openV39EquipmentPicker } from "./v39-equipment-picker.js";
import { readV39ItemListAction, renderV39ItemListScreen1 } from "../ui/v39-item-list-screen-1.js";

let activeTab = "inventory";
let selectedInventoryKey = "";
let selectedUnitId = "";
let selectedEnchantmentName = "";
let statusText = "";
let craftRequest = {name:"", rarity:V39_EQUIPMENT_RARITIES[0]?.key, count:1};

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = value => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const stat = (label, value, suffix = "") => number(value) === 0 ? "" : `<div class="v39-equip-stat"><span>${label}</span><b>${escapeHtml(value)}${suffix}</b></div>`;

function player() {
  return window.getV39ActivePlayer?.() ?? null;
}

function equipmentStats(item) {
  return [
    ["威力", item.power], ["魔力", item.statusBonus?.魔力], ["ガード", item.guard],
    ["攻撃AP", item.attackAp], ["魔法AP", item.magicAp], ["射撃", item.shot], ["射程", item.range],
    ["Cr率", item.criticalRate, "%"], ["Cr威力", item.criticalPower, "%"], ["ペナルティ", item.penalty]
  ].filter(([, value]) => number(value) !== 0);
}

function equipmentResistanceLabels(item) {
  return Object.entries(item.resistanceBonus || {}).filter(([, value]) => number(value) !== 0)
    .map(([key, value]) => `${key} ${number(value) > 0 ? "+" : ""}${value}`);
}

function itemDetail(item, {preview = false} = {}) {
  if (!item) return '<p class="v39-equip-empty">装備を選択してください</p>';
  const traits = (item.traits || []).map(value => `<span>${escapeHtml(value)}</span>`).join("");
  const resistances = equipmentResistanceLabels(item).map(label => `<span>${escapeHtml(label)}</span>`).join("");
  return `<h3${preview ? ' class="v39-equip-preview-title"' : ""}>${preview ? `<span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(item, item.name)}</span>` : ""}${escapeHtml(item.name)} <small${preview ? ` class="v39-equip-preview-rarity" data-quality="${escapeHtml(item.quality)}"` : ""}>[${escapeHtml(item.qualityLabel)}]</small></h3>
    <div class="v39-equip-stats">${equipmentStats(item).map(([label,value,suffix]) => stat(label,value,suffix)).join("")}</div>
    ${resistances ? `<h4>耐性</h4><div class="v39-equip-chips">${resistances}</div>` : ""}
    ${(item.enchantments || []).length ? `<h4>付与</h4><div class="v39-equip-chips">${item.enchantments.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
    ${traits ? `<h4>特性</h4><div class="v39-equip-chips">${traits}</div>` : ""}`;
}

function inventoryPanel(current) {
  const rows = getV39EquipmentInventoryView(current);
  if (!rows.some(row => row.key === selectedInventoryKey)) selectedInventoryKey = rows[0]?.key || "";
  const selected = rows.find(row => row.key === selectedInventoryKey) || null;
  return `<div class="v39-equip-inventory"><div class="v39-equip-list"><div class="v39-equip-grid">${rows.map(row => {
    const label = `${row.name} ${row.qualityLabel} 在庫${row.remainingCount}${row.equippedCount ? ` 装備中${row.equippedCount}` : ""}`;
    return `<button type="button" class="v39-equip-tile" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" aria-pressed="${row.key === selectedInventoryKey}" data-v39-equip-item="${escapeHtml(row.key)}">
      <span class="v39-equip-rank" aria-hidden="true">${renderV39EquipmentRarityBadge(row.quality)}</span>
      <span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(row.item, row.name)}</span>
      <span class="v39-equip-count" aria-hidden="true">${row.equippedCount ? "残" : ""}${row.remainingCount}</span>
    </button>`;
  }).join("") || '<p class="v39-equip-empty">装備はありません</p>'}</div></div><div class="v39-equip-detail">${itemDetail(selected?.item)}</div></div>`;
}

function unitPanel(current) {
  const units = current.factionState?.units || [];
  if (!units.some(unit => unit.id === selectedUnitId)) selectedUnitId = current.factionState?.selectedUnitId || units[0]?.id || "";
  const unit = units.find(row => row.id === selectedUnitId) || units[0] || null;
  if (!unit) return '<p class="v39-equip-empty">キャラクターがいません</p>';
  selectedUnitId = unit.id;
  const equipment = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  const mob = isMobUnit(unit);
  const canChangeWeapons=mob&&canV39ChangeUnitEquipmentSlot(unit,"武器1");
  return `<div class="v39-equip-unit-bar"><label>キャラ<select id="v39-equip-unit">${units.map(row => `<option value="${escapeHtml(row.id)}"${row.id === unit.id ? " selected" : ""}>${escapeHtml(row.name)} / ${isMobUnit(row) ? "モブ" : "ネームド"}</option>`).join("")}</select></label>${canChangeWeapons ? '<b>武器は在庫装備を使用</b>' : mob ? '<b>固定プリセット装備</b>' : '<b>在庫装備を使用</b>'}</div>
    <div class="v39-equip-slots">${EQUIPMENT_SLOT_KEYS.map(slot => {
      const item = equipment.find(row => row.slot === slot);
      return `<section><header><span>${slot}</span><strong>${escapeHtml(item?.name || "なし")}${item ? ` [${escapeHtml(item.qualityLabel)}]` : ""}</strong></header>${itemDetail(item)}${!canV39ChangeUnitEquipmentSlot(unit,slot) ? "" : `<footer><button type="button" data-v39-equip-change="${slot}"${unit.hp > 0 ? "" : " disabled"}>変更</button></footer>`}</section>`;
    }).join("")}</div>${mob ? `<div class="v39-equip-reroll"><label>レア度<select id="v39-equip-reroll-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}">${row.label}</option>`).join("")}</select></label><button type="button" id="v39-equip-reroll">レア度一新</button></div>` : ""}`;
}

function costText(cost) {
  return Object.entries(cost?.material || {}).filter(([, value]) => number(value) > 0).map(([key, value]) => `${key} ${value}`).join(" / ") || "なし";
}

function craftItemCategory(row) {
  if (row.武器分類 === "盾") return "防具";
  if (row.装備箇所 === "武器") return "武器";
  return row.装備箇所 === "装飾" ? "装飾" : "防具";
}

function openCraftItemPicker() {
  if (document.getElementById("v39-craft-item-picker")) return;
  const tabs = ["武器", "防具", "装飾"].map(name => ({id:name, label:name}));
  const catalog = getV39EquipmentCatalog().flatMap(({name, row}) => {
    const item = createV39EquipmentEntry(name, craftRequest.rarity);
    if (!item) return [];
    const metrics = [["威",item.power],["守",item.guard],["AP",item.attackAp]]
      .filter(([, value]) => number(value) !== 0).map(([label,value]) => `${label}${value}`);
    return [{id:name, label:name, item, category:craftItemCategory(row), icon:renderV39EquipmentIcon(item), metrics}];
  });
  let selected = catalog.find(row => row.id === craftRequest.name);
  let category = selected?.category ?? tabs[0].id;
  const dialog = document.createElement("dialog");
  dialog.id = "v39-craft-item-picker";
  dialog.setAttribute("aria-labelledby", "v39-craft-item-picker-title");

  function renderPicker({keepPosition = false} = {}) {
    const rows = catalog.filter(row => row.category === category);
    selected = rows.find(row => row.id === selected?.id) ?? rows[0];
    const scrollTop = keepPosition ? dialog.querySelector(".list-pane")?.scrollTop ?? 0 : 0;
    let detail = {kind:"item", selectedId:selected?.id, emptyText:"この種別の装備はありません"};
    if (selected) {
      const {item, icon, label} = selected;
      const facts = equipmentStats(item).filter(([label]) => !["威力","ガード","攻撃AP"].includes(label))
        .map(([label, value, suffix = ""]) => ({label, value:`${value}${suffix}`}));
      detail = {...detail, heading:label, icon, facts:[{label:"レア度", value:item.qualityLabel}, ...facts],
        sections:[{label:"耐性",lines:equipmentResistanceLabels(item)},{label:"特性",lines:item.traits || []}]
          .filter(({lines}) => lines.length)};
    }
    dialog.innerHTML = renderV39ItemListScreen1({
      title:"装備を選ぶ", titleId:"v39-craft-item-picker-title", tabs, activeTab:category, rows, detail,
      actions:[{id:"back",label:"戻る",destination:"craft"},{id:"confirm",label:"決定",destination:"craft",disabled:!selected}]
    });
    dialog.querySelector(".list-pane").scrollTop = scrollTop;
  }

  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
  dialog.addEventListener("click", event => {
    const action = readV39ItemListAction(event.target);
    if (!action) return;
    if (action.id === "close" || action.id === "back") { dialog.close(); return; }
    if (action.id === "confirm" && selected) {
      craftRequest.name = selected.id;
      dialog.close();
      render();
      document.querySelector("#equipmentModal [data-v39-craft-picker]")?.focus();
      return;
    }
    if (action.id === "tab") {
      category = action.value;
      renderPicker();
      dialog.querySelector('[data-v39-item-list-tab][aria-pressed="true"]')?.focus({preventScroll:true});
    }
    if (action.id === "candidate") {
      selected = catalog.find(row => row.id === action.value);
      renderPicker({keepPosition:true});
      dialog.querySelector('.v39-item-list-compact-card[aria-pressed="true"]')?.focus({preventScroll:true});
    }
  });
  document.body.append(dialog);
  renderPicker();
  dialog.showModal();
}

function craftPanel() {
  return `<div class="v39-equip-craft-layout">
    <div id="v39-equip-craft-preview" class="v39-equip-detail" aria-label="生成予定の装備"></div>
    <div class="v39-equip-craft">
    <button type="button" data-v39-craft-picker>装備を選ぶ</button>
    <div class="v39-equip-craft-fields">
      <label>レア度<select id="v39-equip-craft-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}"${row.key === craftRequest.rarity ? " selected" : ""}>${escapeHtml(row.label)}</option>`).join("")}</select></label>
      <label>個数<input id="v39-equip-craft-count" type="number" min="1" max="99" value="${escapeHtml(craftRequest.count)}"></label>
    </div>
    <output id="v39-equip-craft-cost"></output><button type="button" id="v39-equip-craft">生成</button>
    </div>
  </div>`;
}

export function renderV39EnchantmentOptions(options, actionAttribute, toggle=false) {
  return `<div class="v39-enchant-options">${options.map(row => `<button type="button" ${actionAttribute}="${escapeHtml(row.name)}"
    class="${row.selected ? "active" : ""}"${row.available ? "" : " disabled"}${toggle?` aria-pressed="${!!row.selected}"`:''}>
    <b>${escapeHtml(row.name)}${toggle?` Lv${number(row.row?.Lv)}`:""}</b><span>${row.available ? `素材 ${escapeHtml(costText(row.cost))}` : escapeHtml(row.reason)}</span></button>`).join("") || '<p class="v39-equip-empty">付与候補がありません</p>'}</div>`;
}

function enchantPanel(current) {
  const rows = getV39EquipmentInventoryView(current).filter(row => row.remainingCount > 0);
  if (!rows.some(row => row.key === selectedInventoryKey)) selectedInventoryKey = rows[0]?.key || "";
  const selected = rows.find(row => row.key === selectedInventoryKey) || null;
  const options = selected ? getV39EnchantmentOptions(current, selected.key, window.getV39GameState?.()?.timeline?.turnNumber) : [];
  if (!options.some(row => row.name === selectedEnchantmentName)) selectedEnchantmentName = options[0]?.name || "";
  const option = options.find(row => row.name === selectedEnchantmentName) || null;
  return `<div class="v39-enchant-layout"><div class="v39-enchant-form"><label>対象装備<select id="v39-enchant-target">${rows.map(row => `<option value="${escapeHtml(row.key)}"${row.key === selectedInventoryKey ? " selected" : ""}>${escapeHtml(row.name)} [${escapeHtml(row.qualityLabel)}] 残${row.remainingCount}</option>`).join("")}</select></label>${renderV39EnchantmentOptions(options.map(row => ({...row,selected:row.name === selectedEnchantmentName})), "data-v39-enchant-option")}<button type="button" id="v39-enchant-apply"${option?.available ? "" : " disabled"}>付与を実行</button></div><div class="v39-equip-detail">${itemDetail(selected?.item)}${option ? `<h4>選択付与</h4><p>${escapeHtml(option.name)} / Lv${number(option.row?.Lv)} / ${escapeHtml(costText(option.cost))}</p>` : ""}</div></div>`;
}

function updateCraftCost() {
  const output = document.getElementById("v39-equip-craft-cost");
  if (!output) return;
  craftRequest = {
    name:craftRequest.name,
    rarity:document.getElementById("v39-equip-craft-rarity").value,
    count:document.getElementById("v39-equip-craft-count").value
  };
  const check = inspectV39EquipmentCraft(player(), craftRequest);
  const preview = document.getElementById("v39-equip-craft-preview");
  const item = check.item ?? createV39EquipmentEntry(craftRequest.name, craftRequest.rarity);
  preview.innerHTML = item ? itemDetail(item, {preview:true}) : '<p class="v39-equip-empty">生成する装備を選択してください</p>';
  output.textContent = craftRequest.name ? [check.cost && `必要素材 ${costText(check.cost)}`, check.reason].filter(Boolean).join("  ·  ") : "";
  document.getElementById("v39-equip-craft").disabled = !check.ok;
}

function render() {
  const modal = document.getElementById("equipmentModal");
  const body = modal?.querySelector(".modal-body");
  const current = player();
  if (!(body instanceof HTMLElement)) return;
  if (!current) {
    body.innerHTML = '<p class="v39-equip-empty">ゲーム開始後に装備を確認できます。</p>';
    return;
  }
  const tabs = [["inventory", "一覧"], ["unit", "キャラ装備"], ["craft", "生成"], ["enchant", "付与"]];
  const scrollTop = body.querySelector(".v39-equipment-content")?.scrollTop || 0;
  const listScrollTop = body.querySelector(".v39-equip-list")?.scrollTop || 0;
  body.innerHTML = `<nav class="v39-equipment-tabs" aria-label="装備メニュー">${tabs.map(([key, label]) => `<button type="button" aria-pressed="${key === activeTab}" data-v39-equipment-tab="${key}">${label}</button>`).join("")}</nav><div class="v39-equipment-content">${activeTab === "inventory" ? inventoryPanel(current) : activeTab === "unit" ? unitPanel(current) : activeTab === "craft" ? craftPanel() : enchantPanel(current)}</div><output class="v39-equip-status" aria-live="polite">${escapeHtml(statusText)}</output>`;
  body.querySelector(".v39-equipment-content").scrollTop = scrollTop;
  const list = body.querySelector(".v39-equip-list");
  if (list) list.scrollTop = listScrollTop;
  if (activeTab === "craft") updateCraftCost();
}

function commit(result, success) {
  statusText = result?.ok ? success : (text(result?.reason) || "処理に失敗しました");
  if (result?.ok) {
    window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-updated" });
    window.renderV39ResourceTop?.();
  }
  render();
}

function install() {
  document.addEventListener("click", event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-open="equipment"]')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    statusText = "";
    document.getElementById("equipmentModal")?.classList.add("open");
    render();
  }, true);
  document.getElementById("equipmentModal")?.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target : null;
    const tab = element?.closest("[data-v39-equipment-tab]");
    if (tab) { activeTab = tab.dataset.v39EquipmentTab; statusText = ""; element.closest(".v39-equipment-body").querySelector(".v39-equipment-content").scrollTop = 0; render(); return; }
    if (element?.closest("[data-v39-craft-picker]")) { openCraftItemPicker(); return; }
    const row = element?.closest("[data-v39-equip-item]");
    if (row) { selectedInventoryKey = row.dataset.v39EquipItem; render(); return; }
    const change = element?.closest("[data-v39-equip-change]");
    if (change) {
      openV39EquipmentPicker(selectedUnitId, change.dataset.v39EquipChange, () => {
        statusText = "装備を更新しました";
        render();
      });
      return;
    }
    if (element?.closest("#v39-equip-reroll")) {
      const state = window.getV39GameState?.();
      const current = player();
      const rarity = document.getElementById("v39-equip-reroll-rarity")?.value;
      commit(rerollV39MobEquipment(state, current?.id, { unitId:selectedUnitId, rarity }), "固定装備のレア度を一新しました");
      return;
    }
    if (element?.closest("#v39-equip-craft")) {
      const state = window.getV39GameState?.();
      const current = player();
      commit(craftV39Equipment(state, current?.id, craftRequest), "装備を生成しました");
      return;
    }
    const enchantOption = element?.closest("[data-v39-enchant-option]");
    if (enchantOption) { selectedEnchantmentName = enchantOption.dataset.v39EnchantOption; render(); return; }
    if (element?.closest("#v39-enchant-apply")) {
      const current = player();
      commit(applyV39EquipmentEnchantment(window.getV39GameState?.(), current?.id, { inventoryKey:selectedInventoryKey, enchantmentName:selectedEnchantmentName }), "付与を実行しました");
    }
  });
  document.getElementById("equipmentModal")?.addEventListener("change", event => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.id === "v39-equip-unit") { selectedUnitId = element.value; render(); return; }
    if (element?.id === "v39-enchant-target") { selectedInventoryKey = element.value; selectedEnchantmentName = ""; render(); return; }
    if (element?.closest(".v39-equip-craft")) updateCraftCost();
  });
  document.getElementById("equipmentModal")?.addEventListener("input", event => {
    if (event.target?.id === "v39-equip-craft-count") updateCraftCost();
  });
  window.addEventListener("v39:game-state-changed", () => {
    if (document.getElementById("equipmentModal")?.classList.contains("open")) render();
  });
  window.renderV39Equipment = render;
  window.craftV39EquipmentForActivePlayer = request => {
    const current = player();
    const result = craftV39Equipment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-crafted" });
    return result;
  };
  window.changeV39ActiveUnitEquipment = request => {
    const current = player();
    const result = changeV39UnitEquipment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-updated" });
    return result;
  };
  window.rerollV39ActiveMobEquipment = request => {
    const current = player();
    const result = rerollV39MobEquipment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-rerolled" });
    return result;
  };
  window.enchantV39EquipmentForActivePlayer = request => {
    const current = player();
    const result = applyV39EquipmentEnchantment(window.getV39GameState?.(), current?.id, request);
    if (result.ok) window.setV39GameState?.({ players:result.state.players }, { reason:"equipment-enchanted" });
    return result;
  };
}

install();
