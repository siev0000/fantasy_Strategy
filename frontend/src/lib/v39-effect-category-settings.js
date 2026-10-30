import { normalizeV39EffectTransform } from "./v39-effect-transform.js";
import categoryDefaults from "../../../config/v39-effect-categories.json";
import compositeDefaults from "../../../config/v39-effect-composite-defaults.json";
import { getV39EffectSettingsCatalog } from "./v39-effect-settings.js";

const STORAGE_KEY = "v39-effect-category-settings-v1";
const SCHEMA = "v39-effect-category-settings";
const VERSION = 6;
let customCategories = [];

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

function defaults() {
  const predefined = (Array.isArray(categoryDefaults) ? categoryDefaults : [])
    .map(item => ({
      id:text(item?.id),
      group:item?.group === "support" ? "support" : "attack",
      name:text(item?.name),
      aliases:Array.isArray(item?.aliases)?item.aliases.map(value=>text(value)).filter(Boolean):[],
      independent:item?.independent === true,
      defaultEffect:text(item?.defaultEffect)
    }))
    .filter(item => item.id && item.name && item.defaultEffect);
  return [...predefined, ...customCategories];
}

function normalizeCustomCategories(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map(item => ({
    id:text(item?.id), name:text(item?.name), group:item?.group === "support" ? "support" : "attack",
    defaultEffect:text(item?.defaultEffect ?? item?.baseEffect, "斬撃"), custom:true
  })).filter(item => {
    if (!item.id.startsWith("custom_") || !item.name || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function defaultSetting(category) {
  const saved = compositeDefaults.categories[category.id] || {};
  return {
    ...normalizeV39EffectTransform(saved),
    orientToAttack:saved.orientToAttack === true,
    baseEffect:text(saved.baseEffect, category.defaultEffect),
    scaleMultiplierPercent:Math.round(clamp(saved.scaleMultiplierPercent, 10, 400, 100))
  };
}

function normalizeSetting(category, raw = {}) {
  const standard = defaultSetting(category);
  raw = { ...standard, ...raw };
  const catalog = new Set(getV39EffectSettingsCatalog());
  const rawBase = text(raw.baseEffect ?? raw.effectName, standard.baseEffect);
  return {
    ...normalizeV39EffectTransform(raw),
    orientToAttack:raw.orientToAttack === true,
    baseEffect:catalog.size && !catalog.has(rawBase) ? standard.baseEffect : rawBase,
    scaleMultiplierPercent:Math.round(clamp(raw.scaleMultiplierPercent, 10, 400, 100))
  };
}

function sameSetting(a, b) {
  return a.rotationDeg === b.rotationDeg && a.offsetX === b.offsetX && a.offsetY === b.offsetY
    && a.orientToAttack === b.orientToAttack && a.baseEffect === b.baseEffect
    && a.scaleMultiplierPercent === b.scaleMultiplierPercent && a.placementMode === b.placementMode
    && a.powerScaleAxis === b.powerScaleAxis;
}

function splitLegacyClawFang(settings) {
  const next = { ...settings };
  if (next.claw_fang) {
    next.claw ??= { ...next.claw_fang };
    next.fang ??= { ...next.claw_fang };
    delete next.claw_fang;
  }
  return next;
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    customCategories = normalizeCustomCategories(parsed.customCategories);
    if (parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)) {
      return splitLegacyClawFang(Object.fromEntries(Object.entries(parsed.settings).map(([id, raw]) => [id, {
        ...normalizeV39EffectTransform(raw),
        orientToAttack:raw?.orientToAttack === true,
        baseEffect:raw?.baseEffect ?? raw?.effectName,
        scaleMultiplierPercent:raw?.scaleMultiplierPercent
      }])));
    }
    if (parsed.assignments && typeof parsed.assignments === "object" && !Array.isArray(parsed.assignments)) {
      return splitLegacyClawFang(Object.fromEntries(Object.entries(parsed.assignments).map(([id, baseEffect]) => [id, { baseEffect }])));
    }
    return {};
  } catch {
    return {};
  }
}

let overrides = readState();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:VERSION, settings:overrides, customCategories }));
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

export function addV39EffectCategory(baseEffect = "斬撃") {
  // LANのHTTP表示でも使える乱数APIでIDを作り、既存IDとの重複を避ける。
  let id;
  do {
    const values = crypto.getRandomValues(new Uint32Array(4));
    id = `custom_${[...values].map(value => value.toString(16).padStart(8, "0")).join("")}`;
  } while (defaults().some(category => category.id === id));
  let index = 1;
  while (defaults().some(category => category.name === `基本${index}`)) index += 1;
  customCategories.push({ id, name:`基本${index}`, group:"attack", defaultEffect:baseEffect, custom:true });
  persist();
  const category = getV39EffectCategory(id);
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ category, reason:"add" } }));
  return category;
}

export function renameV39EffectCategory(id, name) {
  const category = customCategories.find(item => item.id === id);
  if (!category || !text(name)) return false;
  category.name = text(name);
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ category:getV39EffectCategory(id), reason:"rename" } }));
  return true;
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
      ...(category.custom ? { custom:true, defaultEffect:category.defaultEffect } : {}),
      ...normalizeV39EffectTransform(category),
      orientToAttack:category.orientToAttack,
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
  let source = parsed.categories;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError("categories がありません。");
  source = splitLegacyClawFang(source);
  customCategories = normalizeCustomCategories(Object.entries(source).filter(([, raw]) => raw?.custom === true).map(([id, raw]) => ({ ...raw, id })));
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
