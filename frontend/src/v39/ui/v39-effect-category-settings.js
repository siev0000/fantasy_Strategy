import {
  getV39EffectSetting,
  getV39EffectSettingsCatalog,
  updateV39EffectSetting
} from "../../lib/v39-effect-settings.js";
import {
  getV39EffectCategories,
  getV39EffectCategory,
  getV39EffectCategorySettingsSnapshot,
  importV39EffectCategorySettings,
  resetV39EffectCategory,
  updateV39EffectCategory
} from "../../lib/v39-effect-category-settings.js";
import {
  getV39EffectAttributes,
  getV39EffectAttribute,
  getV39EffectAttributeSettingsSnapshot,
  importV39EffectAttributeSettings,
  loadV39EffectAttributes,
  resetV39EffectAttribute,
  updateV39EffectAttribute
} from "../../lib/v39-effect-attribute-settings.js";

const EDITOR_SELECT_ID = "v39-effect-composite-selector";
const MODE_ID = "v39-effect-composite-mode";
const STYLE_ID = "v39-effect-category-style";
const COMPOSITE_SCHEMA = "v39-effect-composite-settings";
const COMPOSITE_VERSION = 1;
let installed = false;
let installing = false;
let observer = null;
let editorMode = "category";
let selectedCategoryId = "";
let selectedAttributeName = "";
let syncing = false;

function element(id) {
  return document.getElementById(id);
}

function installStyles() {
  if (element(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    #v39-effect-setting-source{display:none!important}
    #${EDITOR_SELECT_ID}{width:100%;min-width:0;min-height:38px;border:1px solid #536a72;border-radius:7px;background:#0b1519;color:#eef5f2;padding:4px 7px;font:inherit}
    #${MODE_ID}{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;flex:0 0 auto}
    #${MODE_ID} button{min-height:38px;border:1px solid #455c64;border-radius:7px;background:#111d22;color:#9eb0b3;padding:4px 9px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    #${MODE_ID} button[aria-pressed="true"]{background:#1b343b;color:#eff9f7;border-color:#70c5d2}
    @media(max-width:600px){#${MODE_ID} button{min-height:40px;padding:4px 7px}}
  `;
  document.head.appendChild(style);
}

function setStatus(message, isError = false) {
  const status = element("v39-effect-settings-status");
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("is-error", !!isError);
}

function currentCategory() {
  return getV39EffectCategory(selectedCategoryId) || getV39EffectCategories()[0] || null;
}

function currentAttribute() {
  return getV39EffectAttribute(selectedAttributeName) || getV39EffectAttributes()[0] || null;
}

function proxyEffect(category = currentCategory()) {
  const catalog = getV39EffectSettingsCatalog();
  if (catalog.includes(category?.defaultEffect)) return category.defaultEffect;
  if (catalog.includes(category?.baseEffect)) return category.baseEffect;
  return catalog[0] || "";
}

function categoryPreviewPatch(category) {
  return {
    baseEffect:category.baseEffect,
    decorationEffect:"",
    tint:"",
    gradientEnabled:false,
    gradientMotionMode:"fixed",
    scaleMultiplierPercent:category.scaleMultiplierPercent
  };
}

function attributePreviewPatch(attribute, category = currentCategory()) {
  return {
    baseEffect:category?.baseEffect || proxyEffect(category),
    decorationEffect:attribute.decorationEffect,
    tint:attribute.tint,
    gradientEnabled:attribute.gradientEnabled,
    gradientColorA:attribute.gradientColorA,
    gradientColorB:attribute.gradientColorB,
    gradientDirection:attribute.gradientDirection,
    gradientMotionMode:attribute.gradientMotionMode,
    gradientStartPercent:attribute.gradientStartPercent,
    gradientEndPercent:attribute.gradientEndPercent,
    colorStrengthPercent:attribute.colorStrengthPercent,
    gradientSpeedPercentPerSecond:attribute.gradientSpeedPercentPerSecond,
    scaleMultiplierPercent:category?.scaleMultiplierPercent || 100
  };
}

function categoryPatchFromEffect(setting) {
  return {
    baseEffect:setting.baseEffect,
    scaleMultiplierPercent:setting.scaleMultiplierPercent
  };
}

function attributePatchFromEffect(setting) {
  return {
    decorationEffect:setting.decorationEffect,
    tint:setting.tint,
    gradientEnabled:setting.gradientEnabled,
    gradientColorA:setting.gradientColorA,
    gradientColorB:setting.gradientColorB,
    gradientDirection:setting.gradientDirection,
    gradientMotionMode:setting.gradientMotionMode,
    gradientStartPercent:setting.gradientStartPercent,
    gradientEndPercent:setting.gradientEndPercent,
    colorStrengthPercent:setting.colorStrengthPercent,
    gradientSpeedPercentPerSecond:setting.gradientSpeedPercentPerSecond
  };
}

function syncCurrentFromProxy() {
  if (syncing) return;
  const category = currentCategory();
  const proxy = proxyEffect(category);
  if (!proxy || element("v39-effect-setting-source")?.value !== proxy) return;
  const setting = getV39EffectSetting(proxy);
  syncing = true;
  try {
    if (editorMode === "category") {
      const updated = updateV39EffectCategory(category?.id, categoryPatchFromEffect(setting));
      if (updated) setStatus(`カテゴリ「${updated.name}」を自動保存しました。`);
    } else {
      const attribute = currentAttribute();
      const updated = updateV39EffectAttribute(attribute?.name, attributePatchFromEffect(setting));
      if (updated) setStatus(`属性「${updated.name}」の共通設定を自動保存しました。`);
    }
  } finally {
    syncing = false;
  }
}

function hiddenRow(controlId, hidden) {
  const row = element(controlId)?.closest?.(".v39-effect-setting-row");
  if (row instanceof HTMLElement) row.hidden = hidden;
}

function applyModeVisibility() {
  const attributeMode = editorMode === "attribute";
  hiddenRow("v39-effect-setting-base", attributeMode);
  hiddenRow("v39-effect-setting-scale", attributeMode);
  hiddenRow("v39-effect-setting-decoration", !attributeMode);

  for (const tabName of ["color", "motion"]) {
    const tab = document.querySelector(`[data-v39-effect-tab="${tabName}"]`);
    if (tab instanceof HTMLElement) tab.hidden = !attributeMode;
  }
  const selectedHidden = [...document.querySelectorAll("[data-v39-effect-tab]")]
    .some(tab => tab.getAttribute("aria-selected") === "true" && tab.hidden);
  if (selectedHidden) document.querySelector('[data-v39-effect-tab="basic"]')?.click();

  const reset = element("v39-effect-setting-reset");
  if (reset) reset.textContent = attributeMode ? "↺ この属性を初期化" : "↺ このカテゴリを初期化";
  const note = document.querySelector('[data-v39-effect-panel="data"] .v39-effect-settings-note');
  if (note) note.textContent = "カテゴリは基本形状・Scale、属性は色・グラデーション・動き・属性装飾を共通保存します。JSON書き出しでは両方をまとめて出力します。";
}

function fillEditorSelector() {
  const select = element(EDITOR_SELECT_ID);
  if (!(select instanceof HTMLSelectElement)) return;
  select.replaceChildren();
  if (editorMode === "category") {
    const categories = getV39EffectCategories();
    for (const [group, label] of [["attack", "攻撃系"], ["support", "補助系"]]) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = label;
      for (const category of categories.filter(item => item.group === group)) {
        const option = document.createElement("option");
        option.value = category.id;
        option.textContent = category.name;
        optgroup.appendChild(option);
      }
      select.appendChild(optgroup);
    }
    if (!selectedCategoryId) selectedCategoryId = categories[0]?.id || "";
    select.value = selectedCategoryId;
  } else {
    const attributes = getV39EffectAttributes();
    for (const attribute of attributes) {
      const option = document.createElement("option");
      option.value = attribute.name;
      option.textContent = attribute.name;
      select.appendChild(option);
    }
    if (!selectedAttributeName) selectedAttributeName = attributes[0]?.name || "";
    select.value = selectedAttributeName;
  }
  const label = element("v39-effect-setting-source")?.closest?.("label")?.querySelector("span");
  if (label) label.textContent = editorMode === "category" ? "カテゴリ" : "属性";
}

function updateModeButtons() {
  const mode = element(MODE_ID);
  for (const button of mode?.querySelectorAll?.("button") || []) {
    button.setAttribute("aria-pressed", button.dataset.mode === editorMode ? "true" : "false");
  }
}

function activateCurrent({ announce = true } = {}) {
  const category = currentCategory();
  if (!category) return false;
  selectedCategoryId = category.id;
  const proxy = proxyEffect(category);
  if (!proxy) {
    setStatus("エフェクトカタログが空です。", true);
    return false;
  }
  let patch = categoryPreviewPatch(category);
  let label = `カテゴリ「${category.name}」`;
  if (editorMode === "attribute") {
    const attribute = currentAttribute();
    if (!attribute) {
      setStatus("属性一覧が空です。", true);
      return false;
    }
    selectedAttributeName = attribute.name;
    patch = attributePreviewPatch(attribute, category);
    label = `属性「${attribute.name}」`;
  }

  syncing = true;
  try {
    updateV39EffectSetting(proxy, patch);
    const source = element("v39-effect-setting-source");
    if (source instanceof HTMLSelectElement) {
      source.value = proxy;
      source.dispatchEvent(new Event("change", { bubbles:true }));
    }
  } finally {
    syncing = false;
  }
  fillEditorSelector();
  updateModeButtons();
  applyModeVisibility();
  if (announce) setStatus(`${label}を編集中 / 自動保存 ON`);
  return true;
}

function ensureEditorUi() {
  const source = element("v39-effect-setting-source");
  const label = source?.closest?.("label");
  const toolbar = source?.closest?.(".v39-effect-preview-toolbar");
  if (!(source instanceof HTMLSelectElement) || !(label instanceof HTMLElement) || !(toolbar instanceof HTMLElement)) return false;
  installStyles();
  source.setAttribute("aria-hidden", "true");
  source.tabIndex = -1;

  let mode = element(MODE_ID);
  if (!(mode instanceof HTMLElement)) {
    mode = document.createElement("div");
    mode.id = MODE_ID;
    mode.setAttribute("aria-label", "エフェクト設定種別");
    for (const [value, text] of [["category", "カテゴリ"], ["attribute", "属性"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.mode = value;
      button.textContent = text;
      button.setAttribute("aria-pressed", value === editorMode ? "true" : "false");
      button.addEventListener("click", () => {
        syncCurrentFromProxy();
        editorMode = value;
        fillEditorSelector();
        updateModeButtons();
        applyModeVisibility();
        activateCurrent();
      });
      mode.appendChild(button);
    }
    toolbar.insertBefore(mode, label);
  }

  let select = element(EDITOR_SELECT_ID);
  if (!(select instanceof HTMLSelectElement)) {
    select = document.createElement("select");
    select.id = EDITOR_SELECT_ID;
    label.appendChild(select);
    select.addEventListener("change", () => {
      syncCurrentFromProxy();
      if (editorMode === "category") selectedCategoryId = select.value;
      else selectedAttributeName = select.value;
      activateCurrent();
    });
  }
  return true;
}

function exportCompositeJson() {
  syncCurrentFromProxy();
  const categorySnapshot = getV39EffectCategorySettingsSnapshot();
  const attributeSnapshot = getV39EffectAttributeSettingsSnapshot();
  const payload = {
    schema:COMPOSITE_SCHEMA,
    version:COMPOSITE_VERSION,
    categories:categorySnapshot.categories,
    attributes:attributeSnapshot.attributes,
    exportedAt:new Date().toISOString()
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "v39-effect-composite-settings.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`カテゴリ ${Object.keys(payload.categories).length}件 / 属性 ${Object.keys(payload.attributes).length}件を書き出しました。`);
}

async function importCompositeJson(file) {
  if (!(file instanceof File)) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("設定JSONの形式が正しくありません。");
    let categoryResult = { importedCount:0, skippedCount:0 };
    let attributeResult = { importedCount:0, skippedCount:0 };
    if (parsed.schema === COMPOSITE_SCHEMA || (!parsed.schema && parsed.categories && parsed.attributes)) {
      categoryResult = importV39EffectCategorySettings({ categories:parsed.categories });
      attributeResult = importV39EffectAttributeSettings({ attributes:parsed.attributes });
    } else if (parsed.schema === "v39-effect-category-settings") {
      categoryResult = importV39EffectCategorySettings(parsed);
    } else if (parsed.schema === "v39-effect-attribute-settings") {
      attributeResult = importV39EffectAttributeSettings(parsed);
    } else {
      throw new TypeError(`対応していない設定形式です: ${parsed.schema || "不明"}`);
    }
    fillEditorSelector();
    activateCurrent({ announce:false });
    setStatus(`設定JSONを読み込みました。カテゴリ ${categoryResult.importedCount}件 / 属性 ${attributeResult.importedCount}件`);
  } catch (error) {
    console.error("[エフェクト共通設定] JSON読み込み失敗", error);
    setStatus(`設定JSON読み込み失敗: ${String(error?.message || error)}`, true);
  }
}

function interceptSaveControls() {
  const exportButton = element("v39-effect-settings-export");
  if (exportButton && !exportButton.dataset.v39CompositeBound) {
    exportButton.dataset.v39CompositeBound = "1";
    exportButton.textContent = "設定JSON書き出し";
    exportButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportCompositeJson();
    }, true);
  }

  const importButton = element("v39-effect-settings-import");
  if (importButton && !importButton.dataset.v39CompositeBound) {
    importButton.dataset.v39CompositeBound = "1";
    importButton.textContent = "設定JSON読み込み";
    importButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      element("v39-effect-settings-file")?.click();
    }, true);
  }

  const fileInput = element("v39-effect-settings-file");
  if (fileInput && !fileInput.dataset.v39CompositeBound) {
    fileInput.dataset.v39CompositeBound = "1";
    fileInput.addEventListener("change", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      void importCompositeJson(file);
      event.target.value = "";
    }, true);
  }

  const resetButton = element("v39-effect-setting-reset");
  if (resetButton && !resetButton.dataset.v39CompositeBound) {
    resetButton.dataset.v39CompositeBound = "1";
    resetButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (editorMode === "category") {
        const category = currentCategory();
        if (!category) return;
        resetV39EffectCategory(category.id);
        activateCurrent({ announce:false });
        setStatus(`カテゴリ「${category.name}」を仮設定へ戻しました。`);
      } else {
        const attribute = currentAttribute();
        if (!attribute) return;
        resetV39EffectAttribute(attribute.name);
        activateCurrent({ announce:false });
        setStatus(`属性「${attribute.name}」の共通設定を初期化しました。`);
      }
    }, true);
  }
}

async function install() {
  if (installed || installing) return;
  if (!ensureEditorUi()) {
    if (!observer && document.body) {
      observer = new MutationObserver(() => void install());
      observer.observe(document.body, { childList:true, subtree:true });
    }
    return;
  }
  installing = true;
  try {
    await loadV39EffectAttributes();
    fillEditorSelector();
    interceptSaveControls();
    applyModeVisibility();
    updateModeButtons();
    installed = true;
    observer?.disconnect();
    observer = null;
    activateCurrent({ announce:false });

    window.addEventListener("v39:effect-settings-changed", () => syncCurrentFromProxy());
    window.addEventListener("v39:effect-category-settings-changed", event => {
      if (syncing) return;
      const changedId = event.detail?.category?.id;
      if (!changedId || changedId === selectedCategoryId) activateCurrent({ announce:false });
    });
    window.addEventListener("v39:effect-attribute-settings-changed", event => {
      if (syncing || editorMode !== "attribute") return;
      const changedName = event.detail?.attribute?.name;
      if (!changedName || changedName === selectedAttributeName) activateCurrent({ announce:false });
    });
  } catch (error) {
    console.error("[エフェクト属性設定] 属性一覧の初期化失敗", error);
    setStatus(`属性一覧を読み込めませんでした: ${String(error?.message || error)}`, true);
  } finally {
    installing = false;
  }
}

void install();
