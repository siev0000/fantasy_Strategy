import categoryDefaults from "../../../config/v39-effect-categories.json";

const STORAGE_KEY = "v39-effect-category-settings-v1";
let effectCatalog = [];
let effectCatalogSet = new Set();

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

function resolveEffectName(category, candidateRaw) {
  const candidate = String(candidateRaw || "").trim();
  if (candidate && effectCatalogSet.has(candidate)) return candidate;
  if (effectCatalogSet.has(category.defaultEffect)) return category.defaultEffect;
  return effectCatalog[0] || "";
}

export function setV39EffectCategoryCatalog(names = []) {
  effectCatalog = [...new Set((Array.isArray(names) ? names : []).map(name => String(name || "").trim()).filter(Boolean))];
  effectCatalogSet = new Set(effectCatalog);
  const validIds = new Set(normalizedDefaults().map(category => category.id));
  const sanitized = {};
  for (const [id, effectName] of Object.entries(overrides)) {
    if (!validIds.has(id) || !effectCatalogSet.has(effectName)) continue;
    sanitized[id] = effectName;
  }
  overrides = sanitized;
  persist();
  return getV39EffectCategories();
}

export function getV39EffectCategories() {
  return normalizedDefaults().map(category => {
    const override = String(overrides[category.id] || "").trim();
    const effectName = resolveEffectName(category, override || category.defaultEffect);
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
  if (!effectCatalogSet.has(effect)) return getV39EffectCategory(id);
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

export function getV39EffectCategoryAssignments() {
  return Object.fromEntries(getV39EffectCategories().map(category => [category.id, category.effectName]));
}

export function importV39EffectCategoryAssignments(input = {}) {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const next = {};
  let importedCount = 0;
  let skippedCount = 0;
  for (const category of normalizedDefaults()) {
    if (!Object.prototype.hasOwnProperty.call(raw, category.id)) continue;
    const effectName = String(raw[category.id] || "").trim();
    if (!effectCatalogSet.has(effectName)) {
      skippedCount += 1;
      continue;
    }
    if (effectName !== category.defaultEffect) next[category.id] = effectName;
    importedCount += 1;
  }
  overrides = next;
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-category-settings-changed", {
    detail:{ reason:"import", importedCount, skippedCount }
  }));
  return { importedCount, skippedCount };
}

export function getV39EffectCategorySettingsSnapshot() {
  return {
    schema:"v39-effect-category-settings",
    version:1,
    assignments:getV39EffectCategoryAssignments()
  };
}

export function resolveV39EffectCategoryEffect(categoryId) {
  return getV39EffectCategory(categoryId)?.effectName || "";
}

export const V39_EFFECT_CATEGORY_SETTINGS_STORAGE_KEY = STORAGE_KEY;
