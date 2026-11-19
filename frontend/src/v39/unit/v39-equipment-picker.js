import { getV39EquipmentRarity, getV39EquipmentSlotCandidates, normalizeV39EquipmentItem, canV39ChangeUnitEquipmentSlot } from "../../lib/v39-equipment-rules.js";
import { isV39SupportSkill, resolveAttackApCost, resolveAttackPower, resolveAttackRange, resolveAttackRows } from "../../lib/v39-combat-engine.js";
import { resolveV39CurrentUnitAbilities } from "../../lib/v39-current-unit-abilities.js";
import { renderV39EquipmentDisplayRow, renderV39EquipmentRarityBadge, renderV39EquipmentIcon } from "../ui/v39-equipment-display.js";
import { applyV39DerivedCharacterData } from "./v39-character-derived-rules.js";
import { getV39UnitEquipmentStock, changeV39UnitEquipmentFromStock } from "./v39-unit-equipment-access.js";
import { renderV39UnitCard } from "./v39-unit-card.js";
import "./v39-equipment-picker.css";

const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const round = value => Math.round(value * 100) / 100;
let selection = null;

function context() {
  const state = window.getV39GameState?.({includeWorlds:false});
  const player = state?.players?.find(row => row.id === state.activePlayerId) || state?.players?.[0];
  const unit = player?.factionState?.units?.find(row => row.id === selection?.unitId);
  if (!player || !unit || !(unit.hp > 0) || !canV39ChangeUnitEquipmentSlot(unit, selection?.slot)
    || player.id !== selection?.playerId || state.activeWorldId !== selection?.worldId
    || player.factionState.selectedSettlementId !== selection?.settlementId) return null;
  const rows = getV39UnitEquipmentStock(player, unit, selection.underground)
    .filter(row => getV39EquipmentSlotCandidates(row.item?.source || row.item?.name).includes(selection.slot));
  const equipment = (unit.equipment || []).map(normalizeV39EquipmentItem).filter(Boolean);
  return {state, player, unit, rows, current:equipment.find(item => item.slot === selection.slot)};
}

function equipmentChange({state, player}, row) {
  const request = {unitId:selection.unitId, slot:selection.slot};
  if (row) Object.assign(request, {inventoryKey:row.key, name:row.item.name, rarity:row.item.quality});
  return changeV39UnitEquipmentFromStock(state, player.id, request, selection.underground);
}

function addDelta(rows, label, before, after, lowerBetter = false) {
  if (before == null && after == null) return;
  const delta = before == null || after == null ? null : round(after - before);
  if (delta === 0) return;
  rows.push({label, before, after, delta, lowerBetter});
}

function attackMetrics(unit, mapData, state) {
  return new Map(resolveAttackRows(unit).filter(row => !isV39SupportSkill(row, unit)).map(row => [
    row.装備スロット || row.名前,
    {
      power:resolveAttackPower(row, unit),
      range:resolveAttackRange(row, unit, mapData, state),
      ap:resolveAttackApCost(row, unit)
    }
  ]));
}

function compare(unit, updated, state, nextState) {
  const mapData = window.__v39FieldRuntime?.mapData ?? null;
  const before = resolveV39CurrentUnitAbilities(unit, {state, mapData});
  const after = resolveV39CurrentUnitAbilities(updated, {state:nextState, mapData});
  const rows = [];
  for (const group of ["status", "skillLevels", "resistances"]) {
    const previous = before[group] || {};
    const next = after[group] || {};
    for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
      const label = group === "status" && key === "HP" ? "最大HP" : key;
      addDelta(rows, label, numeric(previous[key]), numeric(next[key]));
    }
  }

  const beforeAttacks = attackMetrics(before, mapData, state);
  const afterAttacks = attackMetrics(after, mapData, nextState);
  for (const name of new Set([...beforeAttacks.keys(), ...afterAttacks.keys()])) {
    const previous = beforeAttacks.get(name);
    const next = afterAttacks.get(name);
    addDelta(rows, `${name} 威力`, previous?.power, next?.power);
    addDelta(rows, `${name} 射程`, previous?.range, next?.range);
    addDelta(rows, `${name} AP消費`, previous?.ap, next?.ap, true);
  }
  return rows;
}

function comparisonTable(rows) {
  if (!rows.length) return '<p class="v39-picker-note">数値の変化なし</p>';
  return `<table aria-label="ユニットの能力差"><thead><tr><th scope="col">項目</th><th scope="col">現在</th><th scope="col">変更後</th></tr></thead><tbody>${rows.map(({label, before, after, delta, lowerBetter}) => {
    const tone = (lowerBetter ? delta < 0 : delta > 0) ? "improved" : "reduced";
    return `<tr><th scope="row">${html(label)}</th><td>${before == null ? "—" : round(before)}</td><td>${after == null ? "—" : round(after)}${delta == null ? "" : ` <small class="${tone}">(${delta > 0 ? "+" : ""}${delta})</small>`}</td></tr>`;
  }).join("")}</tbody></table>`;
}

function equipmentPreview(item) {
  if (!item) return '<span class="v39-picker-note">なし</span>';
  const traits = [...(item.traits || []), ...(item.enchantments || [])];
  return renderV39EquipmentDisplayRow(item, {slot:" "})
    + (traits.length ? `<small>${traits.map(html).join("・")}</small>` : "");
}

function candidateMarkup({item, key, count}) {
  const quality = getV39EquipmentRarity(item.quality).key;
  return `<button type="button" class="v39-equipment-display-row v39-picker-item" data-quality="${html(quality)}" data-equipment-picker-key="${html(key)}" aria-pressed="false">
    <span class="v39-equipment-display-icon" aria-hidden="true">${renderV39EquipmentIcon(item)}</span><b>${html(item.name)}</b>
    ${renderV39EquipmentRarityBadge(quality)}<small>在庫 ${html(count)}</small>
  </button>`;
}

function updateComparison(dialog, c) {
  const row = c.rows.find(item => item.key === selection.key);
  const chosen = !!row || (selection.key === "remove" && !!c.current);
  const next = row?.item;
  let rows = [];
  let canConfirm = false;
  let error = "";
  if (chosen) {
    const result = equipmentChange(c, row);
    canConfirm = result.ok;
    const updated = result.state?.players?.find(player => player.id === c.player.id)?.factionState?.units?.find(unit => unit.id === c.unit.id);
    const preview = result.ok && updated
      ? selection.underground ? updated : applyV39DerivedCharacterData(updated)
      : null;
    if (preview?.derivedCharacter?.ok) rows = compare(c.unit, preview, c.state, result.state);
    else error = result.reason || "装備の計算に失敗しました";
  }
  const panel = dialog.querySelector(".v39-picker-comparison");
  panel.innerHTML = `<div class="v39-picker-names">
      <div><small>現在の装備</small>${equipmentPreview(c.current)}</div>
      <div><small>変更後の装備</small>${chosen ? equipmentPreview(next) : '<span class="v39-picker-note">候補を選択</span>'}</div>
    </div>${chosen && !error ? comparisonTable(rows) : ""}`;
  for (const button of dialog.querySelectorAll("[data-equipment-picker-key]")) {
    button.setAttribute("aria-pressed", String(button.dataset.equipmentPickerKey === selection.key));
  }
  dialog.querySelector("[data-equipment-picker-confirm]").disabled = !canConfirm;
  dialog.querySelector("output").textContent = selection.message || error;
}

function render(dialog, c) {
  dialog.innerHTML = `<header><h2 id="v39-equipment-picker-title">${html(selection.slot)}を変更</h2>
      <button type="button" data-equipment-picker-close aria-label="閉じる">×</button></header>
    <div class="v39-picker-body"><section class="v39-picker-candidates" aria-label="装備候補"><h3>装備候補</h3>
      ${c.current ? '<button type="button" data-equipment-picker-key="remove" aria-pressed="false">装備を外す</button>' : ""}
      ${c.rows.map(candidateMarkup).join("")}
      ${!c.rows.length ? '<p class="v39-picker-note">この部位に装備できる在庫がありません。</p>' : ""}
      </section>
      <section class="v39-picker-unit-area" aria-label="ユニットと装備の比較">
        ${renderV39UnitCard(c.unit, {portrait:true, interactive:false, collapseUnselected:false})}
        <div class="v39-picker-comparison"></div>
      </section></div>
    <output aria-live="polite"></output><footer><button type="button" data-equipment-picker-close>戻る</button>
      <button type="button" data-equipment-picker-confirm>決定</button></footer>`;
  updateComparison(dialog, c);
}

export function openV39EquipmentPicker(unitId, slot, onChanged) {
  const player = window.getV39ActivePlayer?.();
  const unit = player?.factionState?.units?.find(row => row.id === unitId);
  if (!canV39ChangeUnitEquipmentSlot(unit,slot) || !(unit.hp > 0)) return false;
  selection = {playerId:player.id, unitId, slot, onChanged, key:"", message:"",
    settlementId:player.factionState.selectedSettlementId,
    worldId:window.getV39ActiveWorldId?.() ?? window.getV39GameState?.({includeWorlds:false})?.activeWorldId,
    underground:!!window.__v39FieldRuntime?.mapData?.isUnderground};
  const initial = context();
  if (!initial) { selection = null; return false; }

  let dialog = document.getElementById("v39-equipment-picker");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "v39-equipment-picker";
    dialog.setAttribute("aria-labelledby","v39-equipment-picker-title");
    document.body.appendChild(dialog);
    dialog.addEventListener("keydown", event => { if (event.key === "Escape") event.stopPropagation(); });
    dialog.addEventListener("close", () => { if (!dialog.open) selection = null; });
    dialog.addEventListener("click", event => {
      const target = event.target.closest?.("button");
      if (!target || !selection) return;
      if (target.hasAttribute("data-equipment-picker-close")) { dialog.close(); return; }
      const c = context();
      if (!c) { dialog.close(); return; }
      if (target.hasAttribute("data-equipment-picker-key")) {
        selection.key = target.dataset.equipmentPickerKey;
        selection.message = "";
        dialog.querySelector(".v39-picker-comparison").scrollTop = 0;
        updateComparison(dialog, c);
      } else if (target.hasAttribute("data-equipment-picker-confirm")) {
        const row = c.rows.find(item => item.key === selection.key);
        if (!row && (selection.key !== "remove" || !c.current)) return;
        const result = equipmentChange(c, row);
        if (!result.ok) { dialog.querySelector("output").textContent = result.reason; return; }
        const callback = selection.onChanged;
        dialog.close();
        window.setV39GameState?.({players:result.state.players},{reason:"equipment-updated"});
        callback?.();
      }
    });
    window.addEventListener("v39:game-state-changed", event => {
      if (!dialog.open || !selection || event.detail?.reason === "activity-log") return;
      const c = context();
      if (!c) { dialog.close(); return; }
      selection.key = "";
      selection.message = "状態が更新されました。候補を選び直してください。";
      render(dialog, c);
    });
  }
  render(dialog, initial);
  if (!dialog.open) dialog.showModal();
  return true;
}
