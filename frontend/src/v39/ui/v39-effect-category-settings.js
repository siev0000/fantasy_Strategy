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

const CATEGORY_SELECT_ID = "v39-effect-category-selector";
const STYLE_ID = "v39-effect-category-style";
let installed = false;
let observer = null;
let selectedCategoryId = "";
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
    #${CATEGORY_SELECT_ID}{width:100%;min-width:0;min-height:38px;border:1px solid #536a72;border-radius:7px;background:#0b1519;color:#eef5f2;padding:4px 7px;font:inherit}
  `;
  document.head.appendChild(style);
}

function setStatus(message, isError = false) {
  const status = element("v39-effect-settings-status");
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("is-error", !!isError);
}

function proxyEffect(category) {
  const catalog = getV39EffectSettingsCatalog();
  if (catalog.includes(category?.defaultEffect)) return category.defaultEffect;
  if (catalog.includes(category?.baseEffect)) return category.baseEffect;
  return catalog[0] || "";
}

function settingPatch(category) {
  return {
    baseEffect:category.baseEffect,
    decorationEffect:category.decorationEffect,
    tint:category.tint,
    gradientEnabled:category.gradientEnabled,
    gradientColorA:category.gradientColorA,
    gradientColorB:category.gradientColorB,
    gradientDirection:category.gradientDirection,
    gradientMotionMode:category.gradientMotionMode,
    gradientStartPercent:category.gradientStartPercent,
    gradientEndPercent:category.gradientEndPercent,
    colorStrengthPercent:category.colorStrengthPercent,
    gradientSpeedPercentPerSecond:category.gradientSpeedPercentPerSecond,
    scaleMultiplierPercent:category.scaleMultiplierPercent
  };
}

function categoryPatchFromEffect(setting) {
  return {
    baseEffect:setting.baseEffect,
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
    gradientSpeedPercentPerSecond:setting.gradientSpeedPercentPerSecond,
    scaleMultiplierPercent:setting.scaleMultiplierPercent
  };
}

function currentCategory() {
  return getV39EffectCategory(selectedCategoryId) || getV39EffectCategories()[0] || null;
}

function syncCategoryFromProxy() {
  if (syncing) return;
  const category = currentCategory();
  if (!category) return;
  const proxy = proxyEffect(category);
  if (!proxy) return;
  const source = element("v39-effect-setting-source");
  if (source?.value !== proxy) return;
  const setting = getV39EffectSetting(proxy);
  syncing = true;
  try {
    const updated = updateV39EffectCategory(category.id, categoryPatchFromEffect(setting));
    if (updated) setStatus(`カテゴリ「${updated.name}」を自動保存しました。`);
  } finally {
    syncing = false;
  }
}

function activateCategory(categoryId, { announce = true } = {}) {
  const category = getV39EffectCategory(categoryId) || getV39EffectCategories()[0];
  if (!category) return false;
  const proxy = proxyEffect(category);
  if (!proxy) {
    setStatus("エフェクトカタログが空です。", true);
    return false;
  }
  selectedCategoryId = category.id;
  const categorySelect = element(CATEGORY_SELECT_ID);
  if (categorySelect instanceof HTMLSelectElement) categorySelect.value = category.id;
  const source = element("v39-effect-setting-source");
  syncing = true;
  try {
    updateV39EffectSetting(proxy, settingPatch(category));
    if (source instanceof HTMLSelectElement) {
      source.value = proxy;
      source.dispatchEvent(new Event("change", { bubbles:true }));
    }
  } finally {
    syncing = false;
  }
  if (announce) setStatus(`カテゴリ「${category.name}」を編集中 / 自動保存 ON`);
  return true;
}

function fillCategorySelector(select) {
  if (!(select instanceof HTMLSelectElement)) return;
  const categories = getV39EffectCategories();
  select.replaceChildren();
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
}

function ensureCategorySelector() {
  const source = element("v39-effect-setting-source");
  const label = source?.closest?.("label");
  if (!(source instanceof HTMLSelectElement) || !(label instanceof HTMLElement)) return false;
  installStyles();
  const labelText = label.querySelector("span");
  if (labelText) labelText.textContent = "カテゴリ";
  source.setAttribute("aria-hidden", "true");
  source.tabIndex = -1;
  let select = element(CATEGORY_SELECT_ID);
  if (!(select instanceof HTMLSelectElement)) {
    select = document.createElement("select");
    select.id = CATEGORY_SELECT_ID;
    select.setAttribute("aria-label", "基本エフェクトカテゴリ");
    label.appendChild(select);
    select.addEventListener("change", () => activateCategory(select.value));
  }
  fillCategorySelector(select);
  if (!selectedCategoryId) selectedCategoryId = getV39EffectCategories()[0]?.id || "";
  select.value = selectedCategoryId;
  return true;
}

function exportCategoryJson() {
  syncCategoryFromProxy();
  const payload = { ...getV39EffectCategorySettingsSnapshot(), exportedAt:new Date().toISOString() };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "v39-effect-category-settings.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`カテゴリ設定 ${Object.keys(payload.categories || {}).length}件を書き出しました。`);
}

async function importCategoryJson(file) {
  if (!(file instanceof File)) return;
  try {
    const result = importV39EffectCategorySettings(await file.text());
    fillCategorySelector(element(CATEGORY_SELECT_ID));
    activateCategory(selectedCategoryId, { announce:false });
    setStatus(`カテゴリJSONを読み込みました。反映 ${result.importedCount}件 / 未登録カテゴリ ${result.skippedCount}件`);
  } catch (error) {
    console.error("[エフェクトカテゴリ設定] JSON読み込み失敗", error);
    setStatus(`カテゴリJSON読み込み失敗: ${String(error?.message || error)}`, true);
  }
}

function interceptSaveControls() {
  const exportButton = element("v39-effect-settings-export");
  if (exportButton && !exportButton.dataset.v39CategoryBound) {
    exportButton.dataset.v39CategoryBound = "1";
    exportButton.textContent = "カテゴリJSON書き出し";
    exportButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      exportCategoryJson();
    }, true);
  }

  const importButton = element("v39-effect-settings-import");
  if (importButton && !importButton.dataset.v39CategoryBound) {
    importButton.dataset.v39CategoryBound = "1";
    importButton.textContent = "カテゴリJSON読み込み";
    importButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      element("v39-effect-settings-file")?.click();
    }, true);
  }

  const fileInput = element("v39-effect-settings-file");
  if (fileInput && !fileInput.dataset.v39CategoryBound) {
    fileInput.dataset.v39CategoryBound = "1";
    fileInput.addEventListener("change", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const file = event.target.files?.[0];
      void importCategoryJson(file);
      event.target.value = "";
    }, true);
  }

  const resetButton = element("v39-effect-setting-reset");
  if (resetButton && !resetButton.dataset.v39CategoryBound) {
    resetButton.dataset.v39CategoryBound = "1";
    resetButton.textContent = "↺ このカテゴリを初期化";
    resetButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const category = currentCategory();
      if (!category) return;
      resetV39EffectCategory(category.id);
      activateCategory(category.id, { announce:false });
      setStatus(`カテゴリ「${category.name}」を仮設定へ戻しました。`);
    }, true);
  }

  const dataPanel = document.querySelector('[data-v39-effect-panel="data"] .v39-effect-settings-note');
  if (dataPanel) dataPanel.textContent = "18カテゴリの設定を自動保存します。JSON書き出しでは各カテゴリの基本形状・装飾・色・動き・Scaleをまとめて出力します。";
}

function install() {
  if (installed) return;
  if (!ensureCategorySelector()) {
    if (!observer && document.body) {
      observer = new MutationObserver(() => install());
      observer.observe(document.body, { childList:true, subtree:true });
    }
    return;
  }
  interceptSaveControls();
  installed = true;
  observer?.disconnect();
  observer = null;
  activateCategory(selectedCategoryId, { announce:false });

  window.addEventListener("v39:effect-settings-changed", () => syncCategoryFromProxy());
  window.addEventListener("v39:effect-category-settings-changed", event => {
    if (syncing) return;
    const changedId = event.detail?.category?.id;
    fillCategorySelector(element(CATEGORY_SELECT_ID));
    if (!changedId || changedId === selectedCategoryId) activateCategory(selectedCategoryId, { announce:false });
  });
}

install();
