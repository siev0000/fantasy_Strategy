import categoryDefaults from "../../../config/v39-effect-categories.json";
import { getV39EffectSettingsCatalog } from "./v39-effect-settings.js";

const STORAGE_KEY = "v39-effect-category-settings-v1";

function readOverrides() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return { ...(parsed.assignments || {}) };
  } catch {
    return {};
  }
}

let overrides = readOverrides();

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:1, assignments:overrides }));
  } catch (error) {
    console.warn("[エフェクトカテゴリ設定] localStorage保存に失敗しました", error);
  }
}

function normalizedDefaults() {
  return (Array.isArray(categoryDefaults) ? categoryDefaults : [])
    .map(item => ({
      id:String(item?.id || "").trim(),
      group:item?.group === "support" ? "support" : "attack",
      name:String(item?.name || "").trim(),
      defaultEffect:String(item?.defaultEffect || "").trim()
    }))
    .filter(item => item.id && item.name);
}

export function getV39EffectCategories() {
  const catalog = getV39EffectSettingsCatalog();
  const catalogSet = new Set(catalog);
  return normalizedDefaults().map(category => {
    const override = String(overrides[category.id] || "").trim();
    const candidate = override || category.defaultEffect;
    const effectName = catalogSet.has(candidate)
      ? candidate
      : catalogSet.has(category.defaultEffect)
        ? category.defaultEffect
        : (catalog[0] || "");
    return { ...category, effectName, customized:!!override && override !== category.defaultEffect };
  });
}

export function getV39EffectCategory(categoryId) {
  const id = String(categoryId || "").trim();
  return getV39EffectCategories().find(category => category.id === id) || null;
}

export function updateV39EffectCategory(categoryId, effectName) {
  const id = String(categoryId || "").trim();
  const effect = String(effectName || "").trim();
  const category = normalizedDefaults().find(item => item.id === id);
  if (!category) return null;
  const catalogSet = new Set(getV39EffectSettingsCatalog());
  if (!catalogSet.has(effect)) return getV39EffectCategory(id);
  const next = { ...overrides };
  if (effect === category.defaultEffect) delete next[id];
  else next[id] = effect;
  overrides = next;
  persist();
  const updated = getV39EffectCategory(id);
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ category:updated } }));
  return updated;
}

export function resetV39EffectCategories() {
  overrides = {};
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", { detail:{ reason:"reset" } }));
  return getV39EffectCategories();
}

export function getV39EffectCategorySettingsSnapshot() {
  return {
    schema:"v39-effect-category-settings",
    version:1,
    categories:getV39EffectCategories().map(category => ({
      id:category.id,
      group:category.group,
      name:category.name,
      effectName:category.effectName
    }))
  };
}

export function resolveV39EffectCategoryEffect(categoryId) {
  return getV39EffectCategory(categoryId)?.effectName || "";
}

export const V39_EFFECT_CATEGORY_SETTINGS_STORAGE_KEY = STORAGE_KEY;
