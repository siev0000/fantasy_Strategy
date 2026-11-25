import {V39_ENCHANTMENT_COLOR_FIELDS,normalizeV39EnchantmentColor} from "../../../../config/v39-enchantment-color-rules.mjs";
import {getV39EnchantmentColors,loadV39EnchantmentColors,setV39EnchantmentColors,v39EnchantmentColorKeys} from "../../lib/v39-enchantment-color-state.js";
import {createV39EquipmentEntry} from "../../lib/v39-equipment-rules.js";
import {renderV39EnchantmentMark,renderV39EquipmentIcon,renderV39EquipmentRarityBadge} from "../ui/v39-equipment-display.js";
import "./v39-equipment-ui.css";

const endpoint = "/api/local/enchantment-colors";
const defaultColor = "#c0c9cc";
const fieldLabels = {bodyColor:"武器本体の色", outlineColor:"武器の輪郭の色"};

function renderPreview(item, name, appearance) {
  if (!item || !name) return "";
  return `<div class="v39-equip-tile">
    <span class="v39-equip-tile-badges">
      <span class="v39-equip-rank">${renderV39EquipmentRarityBadge(item.quality)}</span>
      <span class="v39-equip-enchantment-badges">
        <span class="v39-equipment-enhancement-level">+1</span>
        <span class="v39-equip-enchantment-colors">${renderV39EnchantmentMark(name,appearance.bodyColor || appearance.outlineColor)}</span>
      </span>
    </span>
    <span class="v39-equip-icon" aria-hidden="true">${renderV39EquipmentIcon(item, item.name, appearance)}</span>
    <span class="v39-equip-count">1</span>
  </div>`;
}

async function requestColors(options) {
  const response = await fetch(endpoint, {cache:"no-store", ...options});
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.revision || !data.colors) {
    throw new Error(data?.error || "付与カラーの保存先に接続できません。");
  }
  return data;
}

export async function openV39EnchantmentColorSettings({onSaved} = {}) {
  if (document.getElementById("v39-enchantment-color-settings")) return;

  const previewItem = createV39EquipmentEntry("剣", "rare");
  const names = v39EnchantmentColorKeys;
  const dialog = document.createElement("dialog");
  dialog.id = "v39-enchantment-color-settings";
  dialog.setAttribute("aria-labelledby", "v39-enchantment-color-title");
  dialog.innerHTML = `<div class="v39-enchantment-editor">
    <header><h2 id="v39-enchantment-color-title">付与カラー設定</h2><button type="button" data-close-editor aria-label="閉じる">×</button></header>
    <div class="v39-enchantment-editor-body">
      <div class="v39-enchantment-editor-list" aria-label="付与系統"></div>
      <section class="v39-enchantment-editor-detail" aria-label="カラー設定">
        <h3></h3>
        <div class="v39-enchantment-editor-preview"></div>
        ${V39_ENCHANTMENT_COLOR_FIELDS.map(field => `<fieldset data-color-field="${field}">
          <legend>${fieldLabels[field]}</legend>
          <div class="v39-enchantment-editor-controls">
            <input type="color" data-color-picker value="${defaultColor}" aria-label="${fieldLabels[field]}を選ぶ">
            <input type="text" data-color-code maxlength="7" placeholder="#RRGGBB" spellcheck="false" aria-label="${fieldLabels[field]}のカラーコード">
            <button type="button" data-reset-color>解除</button>
          </div>
        </fieldset>`).join("")}
      </section>
    </div>
    <footer><output aria-live="polite"></output><button type="button" data-save-colors>保存</button></footer>
  </div>`;

  const list = dialog.querySelector(".v39-enchantment-editor-list");
  const detail = dialog.querySelector(".v39-enchantment-editor-detail");
  const preview = dialog.querySelector(".v39-enchantment-editor-preview");
  const heading = detail.querySelector("h3");
  const controls = [...detail.querySelectorAll("[data-color-field]")].map(group => ({
    field:group.dataset.colorField,
    picker:group.querySelector("[data-color-picker]"),
    code:group.querySelector("[data-color-code]"),
    reset:group.querySelector("[data-reset-color]")
  }));
  const save = dialog.querySelector("[data-save-colors]");
  const status = dialog.querySelector("output");
  let revision = "";
  let selected = names[0];
  let saved = new Map();
  let draft = new Map();
  let saving = false;

  function resetDraft() {
    const source = getV39EnchantmentColors();
    saved = new Map(names.map(name => [name, source.get(name) ?? {}]));
    draft = new Map(saved);
    refresh(true);
  }

  function refresh(syncCode = false) {
    const editable = Boolean(revision && selected && !saving);
    const valid = [...draft.values()].every(entry => Object.values(entry).every(value => !value || normalizeV39EnchantmentColor(value)));
    const changed = names.some(name => V39_ENCHANTMENT_COLOR_FIELDS.some(field => draft.get(name)?.[field] !== saved.get(name)?.[field]));
    detail.hidden = !selected;
    heading.textContent = selected || "";
    const appearance = {};
    for (const {field, picker, code, reset} of controls) {
      const raw = draft.get(selected)?.[field] || "";
      const color = normalizeV39EnchantmentColor(raw);
      appearance[field] = color;
      if (syncCode) code.value = raw;
      code.setAttribute("aria-invalid", String(Boolean(raw && !color)));
      picker.value = color || defaultColor;
      picker.disabled = code.disabled = !editable;
      reset.disabled = !editable || !raw;
    }
    save.disabled = !editable || !valid || !changed;
    preview.innerHTML = renderPreview(previewItem, selected, appearance);
    for (const [name, button] of buttons) {
      button.setAttribute("aria-pressed", String(name === selected));
      const entry = draft.get(name);
      button.style.setProperty("--affix-color", normalizeV39EnchantmentColor(entry?.bodyColor) || normalizeV39EnchantmentColor(entry?.outlineColor) || defaultColor);
    }
  }

  const buttons = new Map(names.map(name => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.addEventListener("click", () => {
      selected = name;
      refresh(true);
    });
    list.append(button);
    return [name, button];
  }));

  function edit(field, value, syncCode = false) {
    draft.set(selected, {...draft.get(selected), [field]:value});
    status.textContent = value && !normalizeV39EnchantmentColor(value) ? "カラーコードは # と16進数6桁で入力してください。" : "";
    refresh(syncCode);
  }

  for (const {field, picker, code, reset} of controls) {
    picker.addEventListener("input", () => edit(field, picker.value, true));
    code.addEventListener("input", () => edit(field, code.value));
    reset.addEventListener("click", () => edit(field, "", true));
  }
  save.addEventListener("click", async () => {
    saving = true;
    refresh();
    status.textContent = "保存中…";
    try {
      const entries = [...draft].map(([name, entry]) => [name, Object.fromEntries(
        V39_ENCHANTMENT_COLOR_FIELDS.map(field => [field, normalizeV39EnchantmentColor(entry[field])]).filter(([, value]) => value)
      )]).filter(([, entry]) => Object.keys(entry).length);
      const data = await requestColors({
        method:"PUT",
        headers:{"content-type":"application/json", "x-v39-local-editor":"1"},
        body:JSON.stringify({revision, colors:Object.fromEntries(entries)})
      });
      setV39EnchantmentColors(data.colors);
      revision = data.revision;
      resetDraft();
      onSaved?.();
      status.textContent = "保存しました。";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      saving = false;
      refresh();
    }
  });
  dialog.querySelector("[data-close-editor]").addEventListener("click", () => dialog.close());
  dialog.addEventListener("keydown", event => {
    if (event.key === "Escape") event.stopPropagation();
  });
  dialog.addEventListener("close", () => dialog.remove(), {once:true});
  resetDraft();
  status.textContent = names.length ? "読み込み中…" : "付与能力がありません。";
  document.body.append(dialog);
  dialog.showModal();

  try {
    await loadV39EnchantmentColors();
    if (!dialog.open) return;
    resetDraft();
    if ((import.meta.env?.BASE_URL || "/") !== "/" || window.location.hostname.endsWith(".github.io")) {
      status.textContent = "配布版の付与カラーを表示しています。編集にはローカル版を使用してください。";
      return;
    }
    const data = await requestColors();
    if (!dialog.open) return;
    setV39EnchantmentColors(data.colors);
    revision = data.revision;
    resetDraft();
    onSaved?.();
    if (names.length) status.textContent = "";
  } catch (error) {
    if (names.length) status.textContent = error.message;
  }
}
