import { getV39EffectSettingsCatalog } from "./v39-effect-settings.js";

const STORAGE_KEY = "v39-effect-attribute-settings-v1";
const SCHEMA = "v39-effect-attribute-settings";
const VERSION = 1;
const DEFAULT_GRADIENT_A = "#FFFFFF";
const DEFAULT_GRADIENT_B = "#FFFFFF";
const DIRECTIONS = new Set(["up", "down", "left", "right"]);
const MOTION_MODES = new Set(["fixed", "scroll", "wave"]);

let attributeNames = [];
let overrides = readState();

function text(value, fallback = "") {
  return String(value ?? "").trim() || fallback;
}

function clamp(value, min, max, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

function color(value, fallback = "") {
  const body = text(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(body) ? `#${body.toUpperCase()}` : fallback;
}

function defaultSetting() {
  return {
    decorationEffect:"",
    tint:"",
    gradientEnabled:false,
    gradientColorA:DEFAULT_GRADIENT_A,
    gradientColorB:DEFAULT_GRADIENT_B,
    gradientDirection:"up",
    gradientMotionMode:"fixed",
    gradientStartPercent:0,
    gradientEndPercent:100,
    colorStrengthPercent:100,
    gradientSpeedPercentPerSecond:80
  };
}

function normalizeSetting(raw = {}) {
  const base = defaultSetting();
  const catalog = new Set(getV39EffectSettingsCatalog());
  const rawDecoration = text(raw.decorationEffect);
  const start = clamp(raw.gradientStartPercent, 0, 100, base.gradientStartPercent);
  const end = clamp(raw.gradientEndPercent, 0, 100, base.gradientEndPercent);
  const direction = text(raw.gradientDirection).toLowerCase();
  const motion = text(raw.gradientMotionMode).toLowerCase();
  return {
    decorationEffect:rawDecoration && catalog.size && !catalog.has(rawDecoration) ? "" : rawDecoration,
    tint:color(raw.tint, ""),
    gradientEnabled:raw.gradientEnabled === true,
    gradientColorA:color(raw.gradientColorA, DEFAULT_GRADIENT_A),
    gradientColorB:color(raw.gradientColorB, DEFAULT_GRADIENT_B),
    gradientDirection:DIRECTIONS.has(direction) ? direction : "up",
    gradientMotionMode:MOTION_MODES.has(motion) ? motion : "fixed",
    gradientStartPercent:Math.min(start, end),
    gradientEndPercent:Math.max(start, end),
    colorStrengthPercent:Math.round(clamp(raw.colorStrengthPercent, 0, 100, 100)),
    gradientSpeedPercentPerSecond:Math.round(clamp(raw.gradientSpeedPercentPerSecond, 0, 500, 80))
  };
}

function sameSetting(a, b) {
  return Object.keys(a).every(key => a[key] === b[key]);
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const source = parsed.settings && typeof parsed.settings === "object" && !Array.isArray(parsed.settings)
      ? parsed.settings
      : {};
    return { ...source };
  } catch {
    return {};
  }
}

function persist() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:VERSION, settings:overrides }));
  } catch (error) {
    console.warn("[エフェクト属性設定] localStorage保存に失敗しました", error);
  }
}

function dataUrl() {
  const base = String(import.meta.env.BASE_URL || "/");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalizedBase}data/source/export/json/${encodeURIComponent("スキル一覧")}.json`;
}

function addConditionAttributes(target, rawCondition) {
  const raw = String(rawCondition ?? "");
  for (const match of raw.matchAll(/属性:([^\s]+)/g)) {
    const normalized = String(match[1] || "").replace(/\\\|/g, "|");
    for (const name of normalized.split("|").map(value => value.trim()).filter(Boolean)) target.add(name);
  }
}

function deriveAttributeNames(rows) {
  const names = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const family = text(row?.系統);
    if (family) names.add(family);
    addConditionAttributes(names, row?.取得条件);
    addConditionAttributes(names, row?.条件);
  }
  return [...names];
}

export async function loadV39EffectAttributes() {
  if (attributeNames.length) return getV39EffectAttributes();
  const response = await fetch(dataUrl(), { cache:"no-store" });
  if (!response.ok) throw new Error(`属性一覧を読み込めません: ${response.status} ${response.statusText}`);
  const rows = await response.json();
  attributeNames = deriveAttributeNames(rows);
  const valid = new Set(attributeNames);
  overrides = Object.fromEntries(Object.entries(overrides).filter(([name]) => valid.has(name)));
  persist();
  return getV39EffectAttributes();
}

export function getV39EffectAttributes() {
  return attributeNames.map(name => {
    const standard = defaultSetting();
    const setting = normalizeSetting(overrides[name] || standard);
    return { name, ...setting, customized:!sameSetting(setting, standard) };
  });
}

export function getV39EffectAttribute(attributeName) {
  const name = text(attributeName);
  return getV39EffectAttributes().find(attribute => attribute.name === name) || null;
}

export function updateV39EffectAttribute(attributeName, patch = {}) {
  const name = text(attributeName);
  if (!attributeNames.includes(name)) return null;
  const current = getV39EffectAttribute(name) || { name, ...defaultSetting() };
  const setting = normalizeSetting({ ...current, ...(patch || {}) });
  const standard = defaultSetting();
  const next = { ...overrides };
  if (sameSetting(setting, standard)) delete next[name];
  else next[name] = setting;
  overrides = next;
  persist();
  const updated = getV39EffectAttribute(name);
  window.dispatchEvent(new CustomEvent("v39:effect-attribute-settings-changed", { detail:{ attribute:updated, reason:"update" } }));
  return updated;
}

export function resetV39EffectAttribute(attributeName) {
  const name = text(attributeName);
  if (!attributeNames.includes(name)) return false;
  const next = { ...overrides };
  delete next[name];
  overrides = next;
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-attribute-settings-changed", { detail:{ attribute:getV39EffectAttribute(name), reason:"reset" } }));
  return true;
}

export function getV39EffectAttributeSettingsSnapshot() {
  const attributes = {};
  for (const attribute of getV39EffectAttributes()) {
    attributes[attribute.name] = {
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
      gradientSpeedPercentPerSecond:attribute.gradientSpeedPercentPerSecond
    };
  }
  return { schema:SCHEMA, version:VERSION, attributes };
}

export function importV39EffectAttributeSettings(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("属性設定JSONの形式が正しくありません。");
  if (parsed.schema && parsed.schema !== SCHEMA) throw new TypeError(`対応していない設定形式です: ${parsed.schema}`);
  const source = parsed.attributes;
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new TypeError("attributes がありません。");
  const valid = new Set(attributeNames);
  const next = {};
  let importedCount = 0;
  let skippedCount = 0;
  for (const [name, raw] of Object.entries(source)) {
    if (!valid.has(name)) {
      skippedCount += 1;
      continue;
    }
    const setting = normalizeSetting(raw);
    if (!sameSetting(setting, defaultSetting())) next[name] = setting;
    importedCount += 1;
  }
  overrides = next;
  persist();
  window.dispatchEvent(new CustomEvent("v39:effect-attribute-settings-changed", { detail:{ reason:"import", importedCount, skippedCount } }));
  return { importedCount, skippedCount };
}

export const V39_EFFECT_ATTRIBUTE_SETTINGS_STORAGE_KEY = STORAGE_KEY;
export const V39_EFFECT_ATTRIBUTE_SETTINGS_SCHEMA = SCHEMA;
export const V39_EFFECT_ATTRIBUTE_SETTINGS_VERSION = VERSION;
