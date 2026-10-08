const STORAGE_KEY = "v39-effect-settings-v1";
const SCHEMA_NAME = "v39-effect-settings";
const SCHEMA_VERSION = 3;
const SCALE_MIN = 10;
const SCALE_MAX = 400;
const GRADIENT_SPEED_MIN = 0;
const GRADIENT_SPEED_MAX = 500;
const GRADIENT_DIRECTIONS = Object.freeze(["up", "down", "left", "right"]);
const DEFAULT_GRADIENT_COLOR_A = "#FF3B1F";
const DEFAULT_GRADIENT_COLOR_B = "#FFD54A";
const DEFAULT_GRADIENT_DIRECTION = "up";
const DEFAULT_GRADIENT_SPEED = 80;

let effectCatalog = [];
let effectCatalogSet = new Set();
let state = loadState();

function text(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(min, Math.min(max, safe));
}

function normalizeTint(value) {
  const body = text(value).replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(body) ? `#${body.toUpperCase()}` : "";
}

function normalizeGradientColor(value, fallback) {
  return normalizeTint(value) || fallback;
}

function normalizeGradientDirection(value) {
  const direction = text(value, DEFAULT_GRADIENT_DIRECTION).toLowerCase();
  return GRADIENT_DIRECTIONS.includes(direction) ? direction : DEFAULT_GRADIENT_DIRECTION;
}

function loadState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { effects:{} };
    const effects = parsed.effects && typeof parsed.effects === "object" && !Array.isArray(parsed.effects)
      ? parsed.effects
      : {};
    return { effects:{ ...effects } };
  } catch {
    return { effects:{} };
  }
}

function persistState() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:SCHEMA_VERSION, effects:state.effects }));
  } catch (error) {
    console.warn("[エフェクト設定] localStorage保存に失敗しました", error);
  }
}

function defaultSetting(effectName) {
  const name = text(effectName, "斬撃");
  return {
    effectName:name,
    baseEffect:name,
    decorationEffect:"",
    tint:"",
    gradientEnabled:false,
    gradientColorA:DEFAULT_GRADIENT_COLOR_A,
    gradientColorB:DEFAULT_GRADIENT_COLOR_B,
    gradientDirection:DEFAULT_GRADIENT_DIRECTION,
    gradientStartPercent:0,
    gradientEndPercent:100,
    colorStrengthPercent:100,
    gradientSpeedPercentPerSecond:DEFAULT_GRADIENT_SPEED,
    scaleMultiplierPercent:100,
    customized:false
  };
}

function normalizeSetting(effectName, rawSetting = {}) {
  const defaults = defaultSetting(effectName);
  const rawBase = text(rawSetting?.baseEffect, defaults.baseEffect);
  const rawDecoration = text(rawSetting?.decorationEffect);
  const baseEffect = effectCatalogSet.size > 0 && !effectCatalogSet.has(rawBase) ? defaults.baseEffect : rawBase;
  const decorationEffect = rawDecoration && effectCatalogSet.size > 0 && !effectCatalogSet.has(rawDecoration) ? "" : rawDecoration;
  const oldHeight = clampNumber(rawSetting?.gradientHeightPercent, 0, 100, 50);
  const start = clampNumber(rawSetting?.gradientStartPercent, 0, 100, Math.max(0, oldHeight - 50));
  const end = clampNumber(rawSetting?.gradientEndPercent, 0, 100, Math.min(100, oldHeight + 50));
  return {
    effectName:defaults.effectName,
    baseEffect,
    decorationEffect,
    tint:normalizeTint(rawSetting?.tint),
    gradientEnabled:rawSetting?.gradientEnabled === true,
    gradientColorA:normalizeGradientColor(rawSetting?.gradientColorA, DEFAULT_GRADIENT_COLOR_A),
    gradientColorB:normalizeGradientColor(rawSetting?.gradientColorB, DEFAULT_GRADIENT_COLOR_B),
    gradientDirection:normalizeGradientDirection(rawSetting?.gradientDirection),
    gradientStartPercent:Math.min(start, end),
    gradientEndPercent:Math.max(start, end),
    colorStrengthPercent:clampNumber(rawSetting?.colorStrengthPercent, 0, 100, 100),
    gradientSpeedPercentPerSecond:Math.round(clampNumber(
      rawSetting?.gradientSpeedPercentPerSecond,
      GRADIENT_SPEED_MIN,
      GRADIENT_SPEED_MAX,
      DEFAULT_GRADIENT_SPEED
    )),
    scaleMultiplierPercent:Math.round(clampNumber(rawSetting?.scaleMultiplierPercent, SCALE_MIN, SCALE_MAX, 100)),
    customized:true
  };
}

function isDefaultSetting(setting) {
  return setting.baseEffect === setting.effectName
    && setting.decorationEffect === ""
    && setting.tint === ""
    && setting.gradientEnabled !== true
    && setting.gradientStartPercent === 0
    && setting.gradientEndPercent === 100
    && setting.colorStrengthPercent === 100
    && setting.scaleMultiplierPercent === 100;
}

function serializableSetting(setting) {
  return {
    baseEffect:setting.baseEffect,
    decorationEffect:setting.decorationEffect,
    tint:setting.tint,
    gradientEnabled:setting.gradientEnabled === true,
    gradientColorA:setting.gradientColorA,
    gradientColorB:setting.gradientColorB,
    gradientDirection:setting.gradientDirection,
    gradientStartPercent:setting.gradientStartPercent,
    gradientEndPercent:setting.gradientEndPercent,
    colorStrengthPercent:setting.colorStrengthPercent,
    gradientSpeedPercentPerSecond:setting.gradientSpeedPercentPerSecond,
    scaleMultiplierPercent:setting.scaleMultiplierPercent
  };
}

function emitChanged(detail = {}) {
  window.dispatchEvent(new CustomEvent("v39:effect-settings-changed", {
    detail:{ ...detail, customizedCount:Object.keys(state.effects).length }
  }));
}

export function setV39EffectSettingsCatalog(names = []) {
  effectCatalog = [...new Set((Array.isArray(names) ? names : []).map(name => text(name)).filter(Boolean))];
  effectCatalogSet = new Set(effectCatalog);
  const sanitized = {};
  for (const [effectName, rawSetting] of Object.entries(state.effects || {})) {
    if (!effectCatalogSet.has(effectName)) continue;
    const normalized = normalizeSetting(effectName, rawSetting);
    if (!isDefaultSetting(normalized)) sanitized[effectName] = serializableSetting(normalized);
  }
  state = { effects:sanitized };
  persistState();
  return getV39EffectSettingsCatalog();
}

export function getV39EffectSettingsCatalog() {
  return [...effectCatalog];
}

export function getV39EffectSetting(effectName) {
  const name = text(effectName, "斬撃");
  if (!effectCatalogSet.has(name)) return defaultSetting(name);
  const raw = state.effects?.[name];
  if (!raw) return defaultSetting(name);
  return normalizeSetting(name, raw);
}

export function updateV39EffectSetting(effectName, patch = {}) {
  const name = text(effectName);
  if (!name || !effectCatalogSet.has(name)) return null;
  const current = getV39EffectSetting(name);
  const normalized = normalizeSetting(name, { ...current, ...patch });
  const nextEffects = { ...state.effects };
  if (isDefaultSetting(normalized)) delete nextEffects[name];
  else nextEffects[name] = serializableSetting(normalized);
  state = { effects:nextEffects };
  persistState();
  emitChanged({ effectName:name, setting:getV39EffectSetting(name), reason:"update" });
  return getV39EffectSetting(name);
}

export function resetV39EffectSetting(effectName) {
  const name = text(effectName);
  if (!name || !effectCatalogSet.has(name)) return false;
  if (!state.effects?.[name]) return true;
  const nextEffects = { ...state.effects };
  delete nextEffects[name];
  state = { effects:nextEffects };
  persistState();
  emitChanged({ effectName:name, setting:getV39EffectSetting(name), reason:"reset" });
  return true;
}

export function getV39EffectSettingsSnapshot() {
  return {
    schema:SCHEMA_NAME,
    version:SCHEMA_VERSION,
    effects:JSON.parse(JSON.stringify(state.effects || {}))
  };
}

export function importV39EffectSettings(input) {
  const parsed = typeof input === "string" ? JSON.parse(input) : input;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("エフェクト設定JSONの形式が正しくありません。");
  }
  if (parsed.schema && parsed.schema !== SCHEMA_NAME) {
    throw new TypeError(`対応していない設定形式です: ${parsed.schema}`);
  }
  const version = Number(parsed.version ?? 1);
  if (!Number.isFinite(version) || version > SCHEMA_VERSION) {
    throw new TypeError(`対応していないエフェクト設定バージョンです: ${parsed.version}`);
  }
  const rawEffects = parsed.effects;
  if (!rawEffects || typeof rawEffects !== "object" || Array.isArray(rawEffects)) {
    throw new TypeError("effects がありません。");
  }

  const imported = {};
  let importedCount = 0;
  let skippedCount = 0;
  for (const [effectName, rawSetting] of Object.entries(rawEffects)) {
    if (!effectCatalogSet.has(effectName)) {
      skippedCount += 1;
      continue;
    }
    const normalized = normalizeSetting(effectName, rawSetting);
    if (isDefaultSetting(normalized)) continue;
    imported[effectName] = serializableSetting(normalized);
    importedCount += 1;
  }
  state = { effects:imported };
  persistState();
  emitChanged({ reason:"import", importedCount, skippedCount });
  return { importedCount, skippedCount, customizedCount:Object.keys(imported).length };
}

export function resolveV39EffectPlaybackSettings(rawEffectName) {
  const rawName = text(rawEffectName, "斬撃");
  if (!effectCatalogSet.has(rawName)) {
    return {
      requestedEffect:rawName,
      sequenceName:rawName,
      tint:"",
      gradientEnabled:false,
      gradientColorA:DEFAULT_GRADIENT_COLOR_A,
      gradientColorB:DEFAULT_GRADIENT_COLOR_B,
      gradientDirection:DEFAULT_GRADIENT_DIRECTION,
      gradientStartPercent:0,
      gradientEndPercent:100,
      colorStrengthPercent:100,
      gradientSpeedPercentPerSecond:DEFAULT_GRADIENT_SPEED,
      scaleMultiplierPercent:100
    };
  }
  const setting = getV39EffectSetting(rawName);
  return {
    requestedEffect:rawName,
    sequenceName:[setting.baseEffect, setting.decorationEffect].filter(Boolean).join(":"),
    tint:setting.tint,
    gradientEnabled:setting.gradientEnabled,
    gradientColorA:setting.gradientColorA,
    gradientColorB:setting.gradientColorB,
    gradientDirection:setting.gradientDirection,
    gradientStartPercent:setting.gradientStartPercent,
    gradientEndPercent:setting.gradientEndPercent,
    colorStrengthPercent:setting.colorStrengthPercent,
    gradientSpeedPercentPerSecond:setting.gradientSpeedPercentPerSecond,
    scaleMultiplierPercent:setting.scaleMultiplierPercent
  };
}

export const V39_EFFECT_SETTINGS_STORAGE_KEY = STORAGE_KEY;
export const V39_EFFECT_SETTINGS_SCHEMA = SCHEMA_NAME;
export const V39_EFFECT_SETTINGS_VERSION = SCHEMA_VERSION;
export const V39_EFFECT_SCALE_MIN = SCALE_MIN;
export const V39_EFFECT_SCALE_MAX = SCALE_MAX;
export const V39_EFFECT_GRADIENT_SPEED_MIN = GRADIENT_SPEED_MIN;
export const V39_EFFECT_GRADIENT_SPEED_MAX = GRADIENT_SPEED_MAX;
export const V39_EFFECT_GRADIENT_DIRECTIONS = GRADIENT_DIRECTIONS;
