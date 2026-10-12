import { getV39EquipmentSlotCandidates, normalizeV39EquipmentItem } from "../../lib/v39-equipment-rules.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { applyV39DerivedCharacterData } from "./v39-character-derived-rules.js";
import { getV39UnitEquipmentStock, changeV39UnitEquipmentFromStock } from "./v39-unit-equipment-access.js";
import "./v39-equipment-picker.css";

const html = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
let selection = null;

function context() {
  const player = window.getV39ActivePlayer?.();
  const unit = player?.factionState?.units?.find(row => row.id === selection?.unitId);
  const worldId = window.getV39GameState?.({includeWorlds:false})?.activeWorldId;
  if (!player || !unit || player.id !== selection?.playerId || worldId !== selection?.worldId
    || player.factionState.selectedSettlementId !== selection?.settlementId) return null;
  const rows = getV39UnitEquipmentStock(player, unit, selection.underground)
    .filter(row => getV39EquipmentSlotCandidates(row.item?.source || row.item?.name).includes(selection.slot));
  return {player, unit, rows, current:normalizeV39EquipmentItem(unit.equipment?.find(item => item.slot === selection.slot))};
}

function title(item) {
  return item ? `${item.name} [${item.qualityLabel || item.quality || "-"}]` : "なし";
}

function comparisonRows(rows) {
  return rows.map(([label, before, after, lowerBetter = false]) => {
    const delta = after === undefined ? 0 : numeric(after) - numeric(before);
    const tone = !delta ? "" : (lowerBetter ? delta < 0 : delta > 0) ? "improved" : "reduced";
    return `<tr><th scope="row">${html(label)}</th><td>${html(before ?? "—")}</td><td>${html(after ?? "—")} ${delta ? `<small class="${tone}">${delta > 0 ? "+" : ""}${html(Math.round(delta * 100) / 100)}</small>` : ""}</td></tr>`;
  }).join("");
}

function compare(unit, current, next, chosen = true) {
  const metrics = [["威力","power"],["ガード","guard"],["射程","range"],["攻撃AP","attackAp",true],["魔法AP","magicAp",true],["Cr率","criticalRate"],["Cr威力","criticalPower"],["ペナルティ","penalty",true]];
  const rows = metrics.filter(([, key]) => numeric(current?.[key]) || numeric(next?.[key]))
    .map(([label,key,lower]) => [label,numeric(current?.[key]),chosen ? numeric(next?.[key]) : undefined,lower]);
  for (const [group,label] of [["statusBonus","補正"],["skillBonus","技能"],["resistanceBonus","耐性"]]) {
    for (const key of new Set([...Object.keys(current?.[group] || {}),...Object.keys(next?.[group] || {})])) {
      if (numeric(current?.[group]?.[key]) || numeric(next?.[group]?.[key])) rows.push([`${key} ${label}`,numeric(current?.[group]?.[key]),chosen ? numeric(next?.[group]?.[key]) : undefined]);
    }
  }
  const preview = chosen ? applyV39DerivedCharacterData({...unit,equipment:[
    ...(unit.equipment || []).filter(item => item.slot !== selection.slot), ...(next ? [{...next,slot:selection.slot}] : [])
  ]}) : null;
  const stats = preview?.derivedCharacter?.ok ? Object.keys(unit.status || {})
    .filter(key => numeric(unit.status[key]) !== numeric(preview.status?.[key]))
    .map(key => [key,unit.status[key],preview.status?.[key]]) : [];
  const table = (caption, values) => `<table><caption>${caption}</caption><thead><tr><th>項目</th><th>現在</th><th>変更後</th></tr></thead><tbody>${comparisonRows(values)}</tbody></table>`;
  const traits = item => [...(item?.traits || []), ...(item?.enchantments || [])].map(html).join(" / ") || "なし";
  return `${rows.length ? table("装備の性能",rows) : '<p>数値補正なし</p>'}
    ${!chosen ? '<p class="v39-picker-note">候補を選ぶと変更後の性能差を表示します。</p>' : stats.length ? table("キャラクター能力の変化",stats) : '<p class="v39-picker-note">キャラクター能力値の変化なし</p>'}
    <div class="v39-picker-traits"><span>現在の特性・付与</span><b>${traits(current)}</b>${chosen ? `<span>変更後の特性・付与</span><b>${traits(next)}</b>` : ""}</div>`;
}

function render() {
  const dialog = document.getElementById("v39-equipment-picker");
  const c = context();
  if (!c) { dialog?.close(); return; }
  const row = c.rows.find(item => item.key === selection.key);
  const chosen = selection.key === "remove" || !!row;
  const next = row?.item || null;
  dialog.innerHTML = `<header><div><h2 id="v39-equipment-picker-title">${html(selection.slot)}を変更</h2><p>${html(c.unit.name)}</p></div><button type="button" data-equipment-picker-close aria-label="閉じる">×</button></header>
    <div class="v39-picker-body"><section class="v39-picker-candidates" aria-label="変更候補"><h3>装備を選ぶ</h3>
      ${c.current ? `<button type="button" data-equipment-picker-key="remove" aria-pressed="${selection.key === "remove"}">装備を外す</button>` : ""}
      ${c.rows.map(item => `<button type="button" data-equipment-picker-key="${html(item.key)}" aria-pressed="${selection.key === item.key}"><b>${html(title(item.item))}</b><small>在庫 ${item.count}</small></button>`).join("")}
      ${!c.rows.length ? '<p class="v39-picker-note">この部位に装備できる在庫がありません。</p>' : ""}</section>
      <section class="v39-picker-comparison" aria-label="装備の比較"><div class="v39-picker-names"><div><small>現在</small><b>${html(title(c.current))}</b></div><div><small>変更後</small><b>${chosen ? html(title(next)) : "候補を選択してください"}</b></div></div>
        ${compare(c.unit,c.current,next,chosen)}</section></div>
    <output aria-live="polite">${html(selection.message)}</output><footer><button type="button" data-equipment-picker-close>取消</button><button type="button" data-equipment-picker-confirm${chosen ? "" : " disabled"}>${selection.key === "remove" ? "外す確定" : "装備変更を確定"}</button></footer>`;
}

export function openV39EquipmentPicker(unitId, slot, onChanged) {
  const player = window.getV39ActivePlayer?.();
  const unit = player?.factionState?.units?.find(row => row.id === unitId);
  if (!unit || isMobUnit(unit) || !(unit.hp > 0)) return false;
  let dialog = document.getElementById("v39-equipment-picker");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "v39-equipment-picker";
    dialog.setAttribute("aria-labelledby","v39-equipment-picker-title");
    document.body.appendChild(dialog);
    dialog.addEventListener("keydown",event => { if (event.key === "Escape") event.stopPropagation(); });
    dialog.addEventListener("close",() => {selection = null;});
    dialog.addEventListener("click",event => {
      const target = event.target.closest?.("button");
      if (!target || !selection) return;
      if (target.hasAttribute("data-equipment-picker-close")) {dialog.close(); return;}
      if (target.hasAttribute("data-equipment-picker-key")) {
        const key = target.dataset.equipmentPickerKey;
        selection.key = key; selection.message = ""; render();
        Array.from(dialog.querySelectorAll("[data-equipment-picker-key]"))
          .find(button => button.dataset.equipmentPickerKey === key)?.focus();
      } else if (target.hasAttribute("data-equipment-picker-confirm")) {
        const c = context();
        const row = c?.rows.find(item => item.key === selection.key);
        if (!c || (selection.key !== "remove" && !row)) return;
        const result = changeV39UnitEquipmentFromStock(window.getV39GameState?.(), c.player.id, {
          unitId:selection.unitId,slot:selection.slot,...(row ? {inventoryKey:row.key,name:row.item.name,rarity:row.item.quality} : {})
        },selection.underground);
        if (!result.ok) {selection.message = result.reason; render(); return;}
        const callback = selection.onChanged;
        dialog.close();
        window.setV39GameState?.({players:result.state.players},{reason:"equipment-updated"});
        callback?.();
      }
    });
    window.addEventListener("v39:game-state-changed",() => {
      if (!dialog.open || !selection) return;
      selection.key = ""; selection.message = "在庫が更新されました。候補を選び直してください。"; render();
    });
  }
  selection = {playerId:player.id,unitId,slot,onChanged,key:"",message:"",
    settlementId:player.factionState.selectedSettlementId,
    worldId:window.getV39GameState?.({includeWorlds:false})?.activeWorldId,
    underground:!!window.__v39FieldRuntime?.mapData?.isUnderground};
  render();
  if (!dialog.open) dialog.showModal();
  return true;
}
