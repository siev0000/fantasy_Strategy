import categoryDefaults from "../../../config/v39-effect-categories.json";
import { getV39EffectSettingsCatalog } from "./v39-effect-settings.js";

const STORAGE_KEY = "v39-effect-category-settings-v1";
const SCHEMA = "v39-effect-category-settings";
const VERSION = 3;

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

function defaults() {
  return (Array.isArray(categoryDefaults) ? categoryDefaults : [])
    .map(item => ({
      id:text(item?.id),
      group:item?.group === "support" ? "support" : "attack",
      name:text(item?.name),
      defaultEffect:text(item?.defaultEffect)
    }))
    .filter(item => item.id && item.name && item.defaultEffect);
}

function defaultSetting(category) {
  return {
    baseEffect:category.defaultEffect,
    scaleMultiplierPercent:100
  };
}

function normalizeSetting(category, raw = {}) {
  const standard = defaultSetting(category);
  const catalog = new Set(getV39EffectSettingsCatalog());
  const rawBase = text(raw.baseEffect ?? raw.effectName, standard.baseEffect);
  return {
    baseEffect:catalog.size && !catalog.has(rawBase) ? standard.baseEffect : rawBase,
    scaleMultiplierPercent:Math.round(clamp(raw.scaleMultiplierPercent, 10, 400, 100))
  };
}

function sameSetting(a, b) {
  return a.baseEffect === b.baseEffect
    && a.scaleMultiplierPercent === b.scaleMultiplierPercent;
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    if (parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)) {
      return Object.fromEntries(Object.entries(parsed.settings).map(([id, raw]) => [id, {
        baseEffect:raw?.baseEffect ?? raw?.effectName,
        scaleMultiplierPercent:raw?.scaleMultiplierPercent
      }]));
    }
    if (parsed.assignments && typeof parsed.assignments === "object" && !Array.isArray(parsed.assignments)) {
      return Object.fromEntries(Object.entries(parsed.assignments).map(([id, baseEffect]) => [id, { baseEffect }]));
    }
    return {};
  } catch {
    return {};
  }
}

let overrides = readState();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:VERSION, settings:overrides }));
  } catch (error) {
    console.warn("[エフェクトカテゴリ設定] localStorage保存に失敗しました", error);
  }
}

function categoryDefinition(categoryId) {
  const id = text(categoryId);
  return defaults().find(item => item.id === id) || null;
}

export function getV39EffectCategories() {
  return defaults().map(category => {
    const standard = defaultSetting(category);
    const setting = normalizeSetting(category, overrides[category.id] || standard);
    return { ...category, ...setting, effectName:setting.baseEffect, customized:!sameSetting(setting, standard) };
  });
}

export function getV39EffectCategory(categoryId) {
  const id = text(categoryId);
  return getV39EffectCategories().find(category => category.id === id) || null;
}

export function updateV39EffectCategory(categoryId, patch = {}) {
  const category = categoryDefinition(categoryId);
  if (!category) return null;
  const rawPatch = typeof patch === "string" ? { baseEffect:patch } : (patch || {});
  const current = getV39EffectCategory(category.id) || { ...category, ...defaultSetting(category) };
  const setting = normalizeSetting(category, { ...current, ...rawPatch });
  const standard = defaultSetting(category);
  const next = { ...overrides };
  if (sameSetting(setting, standard)) delete next[category.id];
  else next[category.id] = setting;
  overrides = next;
  persist();
  const updated = getV39EffectCategory(category.id);
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ category:updated, reason:"update" } }));
  return updated;
}

export function resetV39EffectCategory(categoryId) {
  const category = categoryDefinition(categoryId);
  if (!category) return false;
  const next = { ...overrides };
  delete next[category.id];
  overrides = next;
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ category:getV39EffectCategory(category.id), reason:"reset" } }));
  return true;
}

export function resetV39EffectCategories() {
  overrides = {};
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ reason:"reset-all" } }));
  return getV39EffectCategories();
}

export function getV39EffectCategorySettingsSnapshot() {
  const categories = {};
  for (const category of getV39EffectCategories()) {
    categories[category.id] = {
      group:category.group,
      name:category.name,
      baseEffect:category.baseEffect,
      scaleMultiplierPercent:category.scaleMultiplierPercent
    };
  }
  return { schema:SCHEMA, version:VERSION, categories };
}

export function importV39EffectCategorySettings(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("カテゴリ設定JSONの形式が正しくありません。");
  if (parsed.schema && parsed.schema !== SCHEMA) throw new TypeError(`対応していない設定形式です: ${parsed.schema}`);
  const source = parsed.categories;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError("categories がありません。");
  const next = {};
  let importedCount = 0;
  let skippedCount = 0;
  for (const category of defaults()) {
    const raw = source[category.id];
    if (!raw) continue;
    const setting = normalizeSetting(category, raw);
    if (!sameSetting(setting, defaultSetting(category))) next[category.id] = setting;
    importedCount += 1;
  }
  for (const id of Object.keys(source)) if (!categoryDefinition(id)) skippedCount += 1;
  overrides = next;
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ reason:"import", importedCount, skippedCount } }));
  return { importedCount, skippedCount };
}

export function resolveV39EffectCategoryEffect(categoryId) {
  return getV39EffectCategory(categoryId)?.baseEffect || "";
}

export const V39_EFFECT_CATEGORY_SETTINGS_STORAGE_KEY = STORAGE_KEY;
export const V39_EFFECT_CATEGORY_SETTINGS_SCHEMA = SCHEMA;
export const V39_EFFECT_CATEGORY_SETTINGS_VERSION = VERSION;
