import {
  V39_EQUIPMENT_RARITIES,
  applyV39EquipmentEnchantment,
  changeV39UnitEquipment,
  craftV39Equipment,
  getV39EquipmentCatalog,
  getV39EquipmentCraftCost,
  getV39EquipmentInventoryView,
  getV39EnchantmentOptions,
  getV39EquipmentSlotCandidates,
  normalizeV39EquipmentInventory,
  normalizeV39EquipmentItem,
  rerollV39MobEquipment
} from "./lib/v39-equipment-rules.js";
import { EQUIPMENT_SLOT_KEYS } from "./constants/unitCommon.js";
import { isMobUnit } from "./composables/unitCoreUtils.js";

let activeTab = "inventory";
let selectedInventoryKey = "";
let selectedUnitId = "";
let selectedEnchantmentName = "";
let statusText = "";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = value => text(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const stat = (label, value, suffix = "") => number(value) === 0 ? "" : `<div class="v39-equip-stat"><span>${label}</span><b>${escapeHtml(value)}${suffix}</b></div>`;

function player() {
  return window.getV39ActivePlayer?.() || null;
}

function itemDetail(item) {
  if (!item) return '<p class="v39-equip-empty">装備を選択してください</p>';
  const traits = (item.traits || []).map(value => `<span>${escapeHtml(value)}</span>`).join("");
  const resistances = Object.entries(item.resistanceBonus || {}).filter(([, value]) => number(value) !== 0)
    .map(([key, value]) => `<span>${escapeHtml(key)} ${number(value) > 0 ? "+" : ""}${number(value)}</span>`).join("");
  return `<h3>${escapeHtml(item.name)} <small>[${escapeHtml(item.qualityLabel)}]</small></h3>
    <div class="v39-equip-stats">${stat("威力", item.power)}${stat("ガード", item.guard)}${stat("攻撃AP", item.attackAp)}${stat("魔法AP", item.magicAp)}${stat("射撃", item.shot)}${stat("射程", item.range)}${stat("Cr率", item.criticalRate, "%")}${stat("Cr威力", item.criticalPower, "%")}${stat("ペナルティ", item.penalty)}</div>
    ${resistances ? `<h4>耐性</h4><div class="v39-equip-chips">${resistances}</div>` : ""}
    ${(item.enchantments || []).length ? `<h4>付与</h4><div class="v39-equip-chips">${item.enchantments.map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
    ${traits ? `<h4>特性</h4><div class="v39-equip-chips">${traits}</div>` : ""}`;
}

function inventoryPanel(current) {
  const rows = getV39EquipmentInventoryView(current);
  if (!rows.some(row => row.key === selectedInventoryKey)) selectedInventoryKey = rows[0]?.key || "";
  const selected = rows.find(row => row.key === selectedInventoryKey) || null;
  return `<div class="v39-equip-columns"><div class="v39-equip-list">${rows.map(row => {
    const rarity = V39_EQUIPMENT_RARITIES.find(entry => entry.key === row.quality);
    return `<button type="button" class="v39-equip-row${row.key === selectedInventoryKey ? " active" : ""}" data-v39-equip-item="${escapeHtml(row.key)}"><strong>${escapeHtml(row.name)} [${rarity?.short || "C"}]</strong><span>${row.equippedCount ? `E${row.equippedCount} ` : ""}残${row.remainingCount}</span></button>`;
  }).join("") || '<p class="v39-equip-empty">装備はありません</p>'}</div><div class="v39-equip-detail">${itemDetail(selected?.item)}</div></div>`;
}

function compatibleOptions(current, slot) {
  return normalizeV39EquipmentInventory(current?.factionState?.village?.equipmentInventory)
    .filter(row => getV39EquipmentSlotCandidates(row.item?.source || row.name).includes(slot))
    .map(row => `<option value="${escapeHtml(row.key)}">${escapeHtml(row.name)} [${escapeHtml(row.qualityLabel)}] 残${row.count}</option>`).join("");
}

function unitPanel(current) {
  const units = current.factionState?.units || [];
  if (!units.some(unit => unit.id === selectedUnitId)) selectedUnitId = current.factionState?.selectedUnitId || units[0]?.id || "";
  const unit = units.find(row => row.id === selectedUnitId) || units[0] || null;
  if (!unit) return '<p class="v39-equip-empty">キャラクターがいません</p>';
  const equipment = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  const mob = isMobUnit(unit);
  return `<div class="v39-equip-unit-bar"><label>キャラ<select id="v39-equip-unit">${units.map(row => `<option value="${escapeHtml(row.id)}"${row.id === unit.id ? " selected" : ""}>${escapeHtml(row.name)} / ${isMobUnit(row) ? "モブ" : "ネームド"}</option>`).join("")}</select></label>${mob ? '<b>固定プリセット装備</b>' : '<b>在庫装備を使用</b>'}</div>
    <div class="v39-equip-slots">${EQUIPMENT_SLOT_KEYS.map(slot => {
      const item = equipment.find(row => row.slot === slot);
      const options = compatibleOptions(current, slot);
      return `<section><header><span>${slot}</span><strong>${escapeHtml(item?.name || "なし")}${item ? ` [${escapeHtml(item.qualityLabel)}]` : ""}</strong></header>${itemDetail(item)}${mob ? "" : `<footer><select data-v39-equip-pick="${slot}"><option value="">在庫から選択</option>${options}</select><button type="button" data-v39-equip-apply="${slot}"${options ? "" : " disabled"}>変更</button><button type="button" data-v39-equip-remove="${slot}"${item ? "" : " disabled"}>外す</button></footer>`}</section>`;
    }).join("")}</div>${mob ? `<div class="v39-equip-reroll"><label>レア度<select id="v39-equip-reroll-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}">${row.label}</option>`).join("")}</select></label><button type="button" id="v39-equip-reroll">レア度一新</button></div>` : ""}`;
}

function costText(cost) {
  return Object.entries(cost?.material || {}).filter(([, value]) => number(value) > 0).map(([key, value]) => `${key} ${value}`).join(" / ") || "なし";
}

function craftPanel() {
  const catalog = getV39EquipmentCatalog();
  return `<div class="v39-equip-craft"><label>装備<select id="v39-equip-craft-name">${catalog.map(row => `<option value="${escapeHtml(row.name)}">${escapeHtml(row.name)}</option>`).join("")}</select></label><label>レア度<select id="v39-equip-craft-rarity">${V39_EQUIPMENT_RARITIES.map(row => `<option value="${row.key}">${row.label} / 鍛冶Lv${row.level}</option>`).join("")}</select></label><label>個数<input id="v39-equip-craft-count" type="number" min="1" max="99" value="1"></label><output id="v39-equip-craft-cost"></output><button type="button" id="v39-equip-craft">生成</button></div>`;
}

function enchantPanel(current) {
  const rows = getV39EquipmentInventoryView(current).filter(row => row.remainingCount > 0);
  if (!rows.some(row => row.key === selectedInventoryKey)) selectedInventoryKey = rows[0]?.key || "";
  const selected = rows.find(row => row.key === selectedInventoryKey) || null;
  const options = selected ? getV39EnchantmentOptions(current, selected.key) : [];
  if (!options.some(row => row.name === selectedEnchantmentName)) selectedEnchantmentName = options[0]?.name || "";
  const option = options.find(row => row.name === selectedEnchantmentName) || null;
  return `<div class="v39-enchant-layout"><div class="v39-enchant-form"><label>対象装備<select id="v39-enchant-target">${rows.map(row => `<option value="${escapeHtml(row.key)}"${row.key === selectedInventoryKey ? " selected" : ""}>${escapeHtml(row.name)} [${escapeHtml(row.qualityLabel)}] 残${row.remainingCount}</option>`).join("")}</select></label><div class="v39-enchant-options">${options.map(row => `<button type="button" data-v39-enchant-option="${escapeHtml(row.name)}" class="${row.name === selectedEnchantmentName ? "active" : ""}"${row.available ? "" : " disabled"}><b>${escapeHtml(row.name)}</b><span>${row.available ? `素材 ${escapeHtml(costText(row.cost))}` : escapeHtml(row.reason)}</span></button>`).join("") || '<p class="v39-equip-empty">付与候補がありません</p>'}</div><button type="button" id="v39-enchant-apply"${option?.available ? "" : " disabled"}>付与を実行</button></div><div class="v39-equip-detail">${itemDetail(selected?.item)}${option ? `<h4>選択付与</h4><p>${escapeHtml(option.name)} / Lv${number(option.row?.Lv)} / ${escapeHtml(costText(option.cost))}</p>` : ""}</div></div>`;
}

function updateCraftCost() {
  const name = document.getElementById("v39-equip-craft-name")?.value;
  const rarity = document.getElementById("v39-equip-craft-rarity")?.value;
  const count = document.getElementById("v39-equip-craft-count")?.value;
  const output = document.getElementById("v39-equip-craft-cost");
  if (output) output.textContent = `必要素材: ${costText(getV39EquipmentCraftCost(name, rarity, count))}`;
}

function render() {
  const modal = document.getElementById("equipmentModal");
  const body = modal?.querySelector(".modal-body");
  const current = player();
  if (!(body instanceof HTMLElement) || !current) return;
  body.className = "modal-body v39-equipment-body";
  const tabs = [["inventory", "一覧"], ["unit", "キャラ装備"], ["craft", "生成"], ["enchant", "付与"]];
  body.innerHTML = `<div class="modal-tabs">${tabs.map(([key, label]) => `<button type="button" class="${key === activeTab ? "active" : ""}" data-v39-equipment-tab="${key}">${label}</button>`).join("")}</div><div class="v39-equipment-content">${activeTab === "inventory" ? inventoryPanel(current) : activeTab === "unit" ? unitPanel(current) : activeTab === "craft" ? craftPanel() : enchantPanel(current)}</div><output class="v39-equip-status">${escapeHtml(statusText)}</output>`;
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

function installStyles() {
  const style = document.createElement("style");
  style.textContent = `.v39-equipment-body{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:7px}.v39-equipment-content{min-height:0;overflow:hidden}.v39-equip-columns,.v39-enchant-layout{height:100%;display:grid;grid-template-columns:minmax(250px,1fr) minmax(280px,1fr);gap:8px}.v39-equip-list,.v39-equip-detail,.v39-enchant-form{min-height:0;overflow:auto;border:1px solid #34474e;border-radius:8px;background:#111b20;padding:7px}.v39-equip-row{width:100%;min-height:40px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #354950;border-radius:6px;background:#17252a;color:#edf4f2;padding:7px;margin-bottom:5px;font-size:15px;text-align:left}.v39-equip-row.active{border:2px solid #e4c46b;background:#2e2a18}.v39-equip-row span{color:#b9c6c7;white-space:nowrap}.v39-equip-detail h3{font-size:18px;margin:2px 0 10px}.v39-equip-detail h3 small{font-size:14px;color:#d9c276}.v39-equip-detail h4,.v39-equip-slots h4{margin:8px 0 4px}.v39-equip-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.v39-equip-stat{display:grid;gap:2px;border:1px solid #34464d;border-radius:5px;padding:5px}.v39-equip-stat span{font-size:13px;color:#9eafb2}.v39-equip-stat b{font-size:16px}.v39-equip-chips{display:flex;gap:5px;flex-wrap:wrap}.v39-equip-chips span{border:1px solid #43555b;border-radius:5px;padding:4px 6px;font-size:14px}.v39-equip-empty{color:#9cadb0}.v39-equip-unit-bar{display:flex;align-items:center;gap:12px;margin-bottom:6px}.v39-equip-unit-bar label,.v39-equip-craft label,.v39-equip-reroll label,.v39-enchant-form label{display:flex;align-items:center;gap:6px;font-size:15px}.v39-equip-unit-bar select,.v39-equip-craft select,.v39-equip-craft input,.v39-equip-reroll select,.v39-equip-slots select,.v39-enchant-form select{min-height:36px;border:1px solid #40565e;border-radius:6px;background:#101c21;color:#edf4f2;padding:5px;font-size:15px}.v39-equip-slots{height:calc(100% - 48px);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;overflow:auto}.v39-equip-slots section{border:1px solid #35484f;border-radius:7px;background:#111b20;padding:7px}.v39-equip-slots header{display:flex;justify-content:space-between;gap:8px}.v39-equip-slots header span{color:#9db0b3}.v39-equip-slots .v39-equip-detail{border:0;padding:5px 0;overflow:visible}.v39-equip-slots footer{display:flex;gap:5px}.v39-equip-slots footer select{min-width:0;flex:1}.v39-equip-slots button,.v39-equip-reroll button,.v39-equip-craft button,#v39-enchant-apply{min-height:36px;border:1px solid #806b39;border-radius:6px;background:#302916;color:#f1d889;padding:5px 10px;font-size:15px}.v39-equip-slots button:disabled,#v39-enchant-apply:disabled{opacity:.35}.v39-equip-reroll{display:flex;gap:8px;justify-content:flex-end;margin-top:6px}.v39-equip-craft{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;align-content:start;border:1px solid #35484f;border-radius:8px;background:#111b20;padding:10px}.v39-equip-craft label{display:grid}.v39-equip-craft output{grid-column:1/-1;font-size:15px}.v39-equip-craft button{grid-column:3}.v39-enchant-form{display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:8px}.v39-enchant-form label{display:grid}.v39-enchant-options{min-height:0;overflow:auto;display:grid;align-content:start;gap:5px}.v39-enchant-options button{display:grid;gap:2px;text-align:left;border:1px solid #40545b;border-radius:6px;background:#17252a;color:#edf4f2;padding:7px;font-size:15px}.v39-enchant-options button.active{border:2px solid #e4c46b;background:#302916}.v39-enchant-options button:disabled{opacity:.45}.v39-enchant-options span{font-size:13px;color:#a9b9bb}.v39-equip-status{min-height:20px;color:#e7cf8b;font-size:15px}@media(max-width:700px){.v39-equip-columns,.v39-enchant-layout{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.v39-equip-slots{grid-template-columns:1fr}.v39-equip-craft{grid-template-columns:1fr}.v39-equip-craft output,.v39-equip-craft button{grid-column:1}}`;
  document.head.appendChild(style);
}

function install() {
  installStyles();
  document.querySelectorAll('[data-open="equipment"]').forEach(button => button.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    statusText = "";
    document.getElementById("equipmentModal")?.classList.add("open");
    render();
  }, true));
  document.getElementById("equipmentModal")?.addEventListener("click", event => {
    const element = event.target instanceof Element ? event.target : null;
    const tab = element?.closest("[data-v39-equipment-tab]");
    if (tab) { activeTab = tab.dataset.v39EquipmentTab; statusText = ""; render(); return; }
    const row = element?.closest("[data-v39-equip-item]");
    if (row) { selectedInventoryKey = row.dataset.v39EquipItem; render(); return; }
    const apply = element?.closest("[data-v39-equip-apply]");
    if (apply) {
      const picker = document.querySelector(`[data-v39-equip-pick="${apply.dataset.v39EquipApply}"]`);
      const [name, rarity] = text(picker?.value).split("::");
      const state = window.getV39GameState?.();
      const current = player();
      commit(changeV39UnitEquipment(state, current?.id, { unitId:selectedUnitId, slot:apply.dataset.v39EquipApply, name, rarity, inventoryKey:text(picker?.value) }), "装備を変更しました");
      return;
    }
    const remove = element?.closest("[data-v39-equip-remove]");
    if (remove) {
      const state = window.getV39GameState?.();
      const current = player();
      commit(changeV39UnitEquipment(state, current?.id, { unitId:selectedUnitId, slot:remove.dataset.v39EquipRemove }), "装備を外しました");
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
      commit(craftV39Equipment(state, current?.id, { name:document.getElementById("v39-equip-craft-name")?.value, rarity:document.getElementById("v39-equip-craft-rarity")?.value, count:document.getElementById("v39-equip-craft-count")?.value }), "装備を生成しました");
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
