import {getV39EffectSettingsCatalog,normalizeV39EffectEditorSetting} from "./v39-effect-settings.js";
import {resolveV39EffectSequence,V39_EFFECT_SEQUENCE_LIMIT} from "./v39-effect-sequence.js";

const STORAGE_KEY = "v39-magic-effect-settings-v1";
const text = value => String(value ?? "").trim();
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

function magicKey(row) {
  const name = text(row?.名前);
  if (!name || text(row.行動).toUpperCase() !== "A" ||
      (!text(row.攻撃手段).includes("魔法") && !text(row.判定).includes("魔"))) return "";
  const id = text(row.ID);
  return id ? `id:${id}` : JSON.stringify([name,text(row.系統),text(row.攻撃手段),text(row.判定)]);
}

const spells = new Map();
const legacySpellKeys = new Map();
export function setV39MagicEffectSkillCatalog(rows) {
  spells.clear();
  legacySpellKeys.clear();
  const ambiguous = new Set();
  const nameCounts = new Map();
  for (const row of rows) {
    const key = magicKey(row);
    if (!key) continue;
    const name = text(row.名前);
    nameCounts.set(name,(nameCounts.get(name) ?? 0)+1);
    if (ambiguous.has(key)) continue;
    if (spells.has(key)) {
      spells.delete(key);
      ambiguous.add(key);
      continue;
    }
    spells.set(key,{key,name,system:text(row.系統),row});
  }
  for (const {key,name} of spells.values()) {
    if (nameCounts.get(name) === 1) legacySpellKeys.set(name,key);
  }
  // Earlier releases stored settings by display name. Only carry over unambiguous names.
  const migrated = Object.entries(legacySettings).flatMap(([name,setting])=>{
    const key = legacySpellKeys.get(name);
    return key ? [[key,setting]] : [];
  });
  if (migrated.length) settings = {...Object.fromEntries(migrated),...settings};
  legacySettings = {};
}

function readState() {
  try {
    const data = JSON.parse(globalThis.window?.localStorage?.getItem(STORAGE_KEY) ?? "null");
    return data?.version === 1 ? data : {};
  } catch {
    return {};
  }
}

const cached = readState();
let settings = isRecord(cached.spells) ? cached.spells : {};
let legacySettings = isRecord(cached.magic) ? cached.magic : {};
function persist() {
  try {
    globalThis.window?.localStorage?.setItem(STORAGE_KEY,JSON.stringify({version:1,spells:settings}));
  } catch (error) {
    console.warn("[魔法別エフェクト] ブラウザ保存に失敗しました",error);
  }
}

function validateShape(raw, template, location) {
  if (!isRecord(raw)) throw new TypeError(`${location} の形式が正しくありません。`);
  for (const [key,value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const expected = template[key];
    if (key === "sequenceSteps" && Array.isArray(value) && value.length <= V39_EFFECT_SEQUENCE_LIMIT) {
      for (const step of value) validateShape(step,template.sequenceSteps[0],location);
    } else if (key === "decorationTransform" && isRecord(value)) {
      validateShape(value,template.sequenceSteps[0],location);
    } else if (!Object.hasOwn(template,key) || typeof value !== typeof expected ||
      (typeof value === "number" && !Number.isFinite(value)) || (typeof value === "object")) {
      throw new TypeError(`${location} の ${key} が正しくありません。`);
    }
  }
}

export function normalizeV39MagicEffect(raw, catalog = getV39EffectSettingsCatalog()) {
  if (!catalog.length || !catalog.includes(raw?.baseEffect)) return null;
  const setting = normalizeV39EffectEditorSetting(raw.baseEffect,raw);
  return {...setting,playbackSpeedPercent:Math.max(25,Math.min(400,Math.round(Number(raw.playbackSpeedPercent)||100)))};
}

export function getV39MagicEffectSpells() {
  return [...spells.values()];
}

export function getV39MagicEffectSetting(key) {
  return spells.has(key) && Object.hasOwn(settings,key) ? normalizeV39MagicEffect(settings[key]) : null;
}

export function updateV39MagicEffectSetting(key, raw) {
  if (!spells.has(key)) return false;
  const setting = normalizeV39MagicEffect(raw);
  if (!setting) return false;
  settings = {...settings,[key]:setting};
  persist();
  return true;
}

export function resetV39MagicEffectSetting(key) {
  if (!Object.hasOwn(settings,key)) return;
  const next = {...settings};
  delete next[key];
  settings = next;
  persist();
}

export function getV39MagicEffectSnapshot() {
  return Object.fromEntries([...spells.keys()].flatMap(key=>{
    const setting=getV39MagicEffectSetting(key);
    return setting ? [[key,setting]] : [];
  }));
}

// Validate first so an invalid spell does not partially overwrite the composite settings.
export function prepareV39MagicEffectImport(data, {legacy = false} = {}) {
  if (!isRecord(data)) throw new TypeError("魔法別設定の形式が正しくありません。");
  const catalog = getV39EffectSettingsCatalog();
  const base = catalog[0];
  const step = resolveV39EffectSequence({baseEffect:base})[0];
  const template = {...normalizeV39MagicEffect({baseEffect:base}),sequenceSteps:[step]};
  if (legacy) Object.assign(template,{shakeStartPercent:0,shakeEndPercent:15,damageMomentPercent:75});
  const imports = new Map();
  let skippedCount = 0;
  for (const [identifier,raw] of Object.entries(data)) {
    const key = legacy ? legacySpellKeys.get(identifier) : identifier;
    const spell = spells.get(key);
    if (!spell) {
      skippedCount++;
      continue;
    }
    validateShape(raw,template,spell.name);
    const assets = [raw.baseEffect,raw.decorationEffect,raw.hitEffectName,...(raw.sequenceSteps ?? []).map(item=>item.effectName)];
    if (!raw.baseEffect || assets.some(name=>name && !catalog.includes(name))) {
      skippedCount++;
      continue;
    }
    imports.set(key,normalizeV39MagicEffect(raw));
  }
  return {
    importedCount:imports.size,skippedCount,
    apply() {
      if (!imports.size) return;
      settings = {...settings,...Object.fromEntries(imports)};
      persist();
    }
  };
}

export function resolveV39MagicEffectOverride(row) {
  return getV39MagicEffectSetting(magicKey(row));
}
