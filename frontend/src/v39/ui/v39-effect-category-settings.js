import { createV39EffectDraftSync, V39_EFFECT_DRAFT_PATH } from '../../lib/v39-effect-local-draft.js';
import { getV39EffectSettingsSnapshot, importV39EffectSettings } from '../../lib/v39-effect-settings.js';
import { normalizeV39EffectTransform } from "../../lib/v39-effect-transform.js";
import { resolveV39CombatEffect } from "../../lib/v39-combat-effect-rules.js";
import { resolveV39EffectSequence } from "../../lib/v39-effect-sequence.js";
import {
  getV39MagicEffectSpells,getV39MagicEffectSetting,getV39MagicEffectSnapshot,normalizeV39MagicEffect,
  prepareV39MagicEffectImport,resetV39MagicEffectSetting,updateV39MagicEffectSetting
} from "../../lib/v39-magic-effect-settings.js";
import { configureV39EffectSettingsEditor, selectV39EffectSettingsProxy,setV39EffectPreviewSpeed } from "./v39-effect-settings.js";
import { installV39EffectSettingsUiState } from "./v39-effect-settings-ui-state.js";
import {
  getV39EffectSetting,
  getV39EffectSettingsCatalog,
  resolveV39EffectPlaybackSettings,
  registerV39EffectEditorProxy
} from "../../lib/v39-effect-settings.js";
import {
  getV39EffectCategories,
  getV39EffectCategory,
  getV39EffectCategorySettingsSnapshot,
  V39_EFFECT_CATEGORY_SETTINGS_VERSION,
  importV39EffectCategorySettings,
  resetV39EffectCategory,
  updateV39EffectCategory,
  addV39EffectCategory,
  renameV39EffectCategory
} from "../../lib/v39-effect-category-settings.js";
import {
  getV39EffectAttributes,
  getV39EffectAttribute,
  getV39EffectAttributeSettingsSnapshot,
  V39_EFFECT_ATTRIBUTE_SETTINGS_VERSION,
  importV39EffectAttributeSettings,
  loadV39EffectAttributes,
  resetV39EffectAttribute,
  updateV39EffectAttribute
} from "../../lib/v39-effect-attribute-settings.js";

const EDITOR_SELECT_ID = "v39-effect-composite-selector";
const MODE_ID = "v39-effect-composite-mode";
const STYLE_ID = "v39-effect-category-style";
const COMPOSITE_SCHEMA = "v39-effect-composite-settings";
const COMPOSITE_VERSION = 3;
const spells = getV39MagicEffectSpells();
const systems = [...new Set(spells.map(spell=>spell.system))].sort((a,b)=>a.localeCompare(b,"ja"));
let installed = false;
let installing = false;
let editorMode = "category";
let selectedCategoryId = "";
let selectedAttributeName = "";
let selectedSystem = systems[0] ?? "";
let selectedSpellKey = "";
let activeMagicSetting = null;
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
    #v39-effect-editor-view,#v39-effect-magic-selectors select{min-width:0;max-width:100%;min-height:36px;border:1px solid #536a72;border-radius:7px;background:#111d22;color:#edf5f4;padding:4px;font:inherit}
    #v39-effect-editor-view{margin-inline:auto}
    #v39-effect-magic-selectors{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,3fr);gap:5px;min-width:0;flex:1}
    #v39-effect-magic-selectors[hidden],.is-magic-mode #${MODE_ID},.is-magic-mode .v39-effect-preview-selector{display:none}
    #v39-effect-magic-selectors select{width:100%}
    #v39-effect-magic-preset{padding:5px 7px;border:1px solid #455c64;border-radius:7px;margin-bottom:5px}
    #v39-effect-magic-preset summary{cursor:pointer}
    #v39-effect-magic-preset .v39-effect-settings-actions{margin-top:5px}
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

function magicMode() {
  return element("v39-effect-editor-view")?.value === "magic";
}

function fillMagicSelectors() {
  const system = element("v39-effect-magic-system");
  const select = element("v39-effect-magic-spell");
  const settings = getV39MagicEffectSnapshot();
  system.replaceChildren(...systems.map(name=>{
    const rows = spells.filter(spell=>spell.system === name);
    return new Option(`${name || "系統なし"} ${rows.filter(spell=>settings[spell.key]).length}/${rows.length}`,name);
  }));
  system.value = selectedSystem;
  const rows = spells.filter(spell=>spell.system === selectedSystem);
  if (!rows.some(spell=>spell.key === selectedSpellKey)) selectedSpellKey = rows[0]?.key ?? "";
  select.replaceChildren(...rows.map(spell=>{
    const duplicate = rows.filter(row=>row.name === spell.name).length > 1;
    const suffix = duplicate ? `（${[spell.row.ID,spell.row.攻撃手段,spell.row.判定].filter(Boolean).join("・")}）` : "";
    return new Option(`${settings[spell.key] ? "✓" : "○"} ${spell.name}${suffix}`,spell.key);
  }));
  select.value = selectedSpellKey;
  select.disabled = !rows.length;
}

function defaultMagicSetting(spell) {
  const catalog = getV39EffectSettingsCatalog();
  const automatic = resolveV39CombatEffect(spell.row,{},getV39EffectCategories(),getV39EffectAttributes(),{automatic:true});
  const inherited = {...resolveV39EffectPlaybackSettings(automatic.effectName),...automatic.settings};
  const steps = resolveV39EffectSequence(inherited).filter(step=>catalog.includes(step.effectName));
  const decoration = automatic.attributeName && getV39EffectAttribute(automatic.attributeName)?.decorationEffect;
  const separateDecoration = decoration && steps.length > 1 && steps.at(-1).effectName === decoration;
  const decorationTransform = separateDecoration ? steps.pop() : undefined;
  const baseEffect = steps[0]?.effectName || catalog[0];
  return normalizeV39MagicEffect({...inherited,baseEffect,sequenceSteps:steps,
    decorationEffect:separateDecoration ? decoration : "",decorationTransform});
}

function activateMagic({announce = true} = {}) {
  fillMagicSelectors();
  refreshMagicPresetControls();
  const spell = spells.find(row=>row.key === selectedSpellKey);
  if (!spell) {
    setStatus("魔法データがありません。",true);
    return false;
  }
  const saved = getV39MagicEffectSetting(spell.key);
  activeMagicSetting = saved || defaultMagicSetting(spell);
  if (!activeMagicSetting) return false;
  const proxy = registerV39EffectEditorProxy("@magic",activeMagicSetting.baseEffect);
  syncing = true;
  try {
    selectV39EffectSettingsProxy(proxy,activeMagicSetting,spell.name,`magic:${spell.key}`);
  } finally { syncing = false; }
  element("v39-effect-timing-playbackSpeedPercent").value = activeMagicSetting.playbackSpeedPercent;
  setV39EffectPreviewSpeed(activeMagicSetting.playbackSpeedPercent);
  applyModeVisibility();
  if (announce) setStatus(`${spell.name} / ${saved ? "個別設定済み" : "自動選択"}`);
  return true;
}

function saveMagicSetting(setting, speed = activeMagicSetting?.playbackSpeedPercent) {
  const normalized = normalizeV39MagicEffect({...setting,playbackSpeedPercent:speed});
  const wasSaved = !!getV39MagicEffectSetting(selectedSpellKey);
  if (!normalized || JSON.stringify(normalized) === JSON.stringify(activeMagicSetting)
      || !updateV39MagicEffectSetting(selectedSpellKey,normalized)) return;
  activeMagicSetting = normalized;
  if (!wasSaved) fillMagicSelectors();
  setStatus("この魔法の設定をブラウザに保存しました。");
}

function currentCategory() {
  return getV39EffectCategory(selectedCategoryId) || getV39EffectCategories()[0] || null;
}

function currentAttribute() {
  return getV39EffectAttribute(selectedAttributeName) || getV39EffectAttributes()[0] || null;
}

function proxyEffect(category = currentCategory()) {
  const catalog = getV39EffectSettingsCatalog();
  if (category?.custom || category?.independent) return registerV39EffectEditorProxy(`@category:${category.id}`, category.defaultEffect);
  if (catalog.includes(category?.defaultEffect)) return category.defaultEffect;
  if (catalog.includes(category?.baseEffect)) return category.baseEffect;
  return catalog[0] || "";
}

function categoryPreviewPatch(category) {
  return {
    grayscaleBase:false,brightnessPercent:100,
    ...normalizeV39EffectTransform(category),
    orientToAttack:category.orientToAttack === true,
    baseEffect:category.baseEffect,
    sequenceSteps:category.sequenceSteps,
    decorationTransform:category.decorationTransform,
    decorationEffect:"",
    tint:"",
    gradientEnabled:false,
    gradientMotionMode:"fixed",
    scaleMultiplierPercent:category.scaleMultiplierPercent
  };
}

function attributePreviewPatch(attribute, category = currentCategory()) {
  return {
    grayscaleBase:attribute.grayscaleBase !== false,brightnessPercent:attribute.brightnessPercent,
    ...normalizeV39EffectTransform(category),
    orientToAttack:category?.orientToAttack === true,
    baseEffect:category?.baseEffect || proxyEffect(category),
    sequenceSteps:category?.sequenceSteps,
    decorationTransform:category?.decorationTransform,
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

function refreshMagicPresetControls() {
  const section = element("v39-effect-magic-preset");
  if (!section?.open) return;
  const categorySelect = section.querySelector("[data-preset-category]");
  const attributeSelect = section.querySelector("[data-preset-attribute]");
  const categoryId = categorySelect.value || selectedCategoryId;
  const attributeName = attributeSelect.value;
  const categories = getV39EffectCategories();
  const attributes = getV39EffectAttributes();
  categorySelect.replaceChildren();
  for (const [label,custom] of [["追加したカテゴリ",true],["標準カテゴリ",false]]) {
    const options = categories.filter(category=>!!category.custom === custom);
    if (!options.length) continue;
    const group = document.createElement("optgroup");
    group.label = label;
    group.append(...options.map(({id,name})=>new Option(name,id)));
    categorySelect.append(group);
  }
  if (categories.some(({id})=>id === categoryId)) categorySelect.value = categoryId;
  attributeSelect.replaceChildren(new Option("なし",""),...attributes.map(({name})=>new Option(name,name)));
  if (attributes.some(({name})=>name === attributeName)) attributeSelect.value = attributeName;
  section.querySelector("button").disabled = !categories.length;
}

function installMagicPresetControls() {
  const section = document.createElement("details");
  section.id = "v39-effect-magic-preset";
  section.hidden = true;
  section.innerHTML = `
    <summary>既存の設定を使う</summary>
    <label class="v39-effect-setting-row"><span>カテゴリ</span><select data-preset-category></select></label>
    <label class="v39-effect-setting-row"><span>属性</span><select data-preset-attribute></select></label>
    <div class="v39-effect-settings-actions"><button type="button">この魔法に適用</button></div>`;
  const categorySelect = section.querySelector("[data-preset-category]");
  const attributeSelect = section.querySelector("[data-preset-attribute]");
  const apply = section.querySelector("button");
  section.addEventListener("toggle",refreshMagicPresetControls);
  apply.addEventListener("click",()=>{
    if (!magicMode() || !selectedSpellKey) return;
    const category = getV39EffectCategory(categorySelect.value);
    const attribute = getV39EffectAttribute(attributeSelect.value);
    if (!category) return;
    const setting = attribute ? attributePreviewPatch(attribute,category) : categoryPreviewPatch(category);
    if (!updateV39MagicEffectSetting(selectedSpellKey,{...setting,playbackSpeedPercent:category.playbackSpeedPercent})) {
      setStatus("設定に使える画像が見つかりません。",true);
      return;
    }
    activateMagic({announce:false});
    setStatus(`「${category.name}」${attribute ? `・「${attribute.name}」` : ""}を、この魔法に適用しました。`);
  });
  document.querySelector('[data-v39-effect-panel="basic"]').prepend(section);
}

function categoryPatchFromEffect(setting) {
  return {
    ...normalizeV39EffectTransform(setting),
    orientToAttack:setting.orientToAttack === true,
    baseEffect:setting.baseEffect,
    sequenceSteps:setting.sequenceSteps,
    scaleMultiplierPercent:setting.scaleMultiplierPercent
  };
}

function attributePatchFromEffect(setting) {
  return {
    grayscaleBase:setting.grayscaleBase === true,brightnessPercent:setting.brightnessPercent,
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

function syncCurrentFromProxy(event) {
  if (syncing) return;
  if (magicMode()) {
    if (event?.detail?.effectName === "@magic" && event.detail.reason === "update") saveMagicSetting(getV39EffectSetting("@magic"));
    return;
  }
  const category = currentCategory();
  const proxy = proxyEffect(category);
  if (!proxy || element("v39-effect-setting-source")?.value !== proxy) return;
  const setting = getV39EffectSetting(proxy);
  syncing = true;
  try {
    if (editorMode === "category") {
      const updated = updateV39EffectCategory(category?.id, categoryPatchFromEffect(setting));
      if (updated) setStatus(`カテゴリ「${updated.name}」を自動保存し、ゲームの戦闘へ反映しました。`);
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
  const spellMode = magicMode();
  const attributeMode = !spellMode && editorMode === "attribute";
  for(const key of ['playbackSpeedPercent','shakeStartPercent','shakeEndPercent','damageMomentPercent']){
    const row=element(`v39-effect-timing-${key}`)?.closest('label');
    if(row)row.hidden=attributeMode||(key!=='playbackSpeedPercent'&&(spellMode||currentCategory()?.group==='support'));
  }
  element("v39-effect-settings-panel").classList.toggle("is-attribute-mode", attributeMode);
  element("v39-effect-settings-panel").classList.toggle("is-magic-mode", spellMode);
  element("v39-effect-magic-selectors").hidden = !spellMode;
  const presets = element("v39-effect-magic-preset");
  presets.hidden = !spellMode || !selectedSpellKey;
  if (presets.hidden) presets.open = false;
  hiddenRow("v39-effect-setting-base", attributeMode);
  element("v39-effect-setting-sequence").hidden = attributeMode;
  hiddenRow("v39-effect-setting-scale", attributeMode);
  hiddenRow("v39-effect-setting-orientation", attributeMode);
  hiddenRow("v39-effect-setting-placement", attributeMode);
  hiddenRow("v39-effect-setting-power-axis", attributeMode);
  element("v39-effect-setting-placement-hint").hidden=attributeMode;

  hiddenRow("v39-effect-setting-decoration", !attributeMode && !spellMode);

  for (const tabName of ["color", "motion"]) {
    const tab = document.querySelector(`[data-v39-effect-tab="${tabName}"]`);
    if (tab instanceof HTMLElement) tab.hidden = !attributeMode && !spellMode;
  }
  const selectedHidden = [...document.querySelectorAll("[data-v39-effect-tab]")]
    .some(tab => tab.getAttribute("aria-selected") === "true" && tab.hidden);
  if (selectedHidden) document.querySelector('[data-v39-effect-tab="basic"]')?.click();

  const reset = element("v39-effect-setting-reset");
  if (element("v39-effect-category-add")) element("v39-effect-category-add").hidden = attributeMode || spellMode;
  const nameRow = element("v39-effect-category-name-row");
  if (nameRow) {
    nameRow.hidden = attributeMode || spellMode || !currentCategory()?.custom;
    element("v39-effect-category-name").value = currentCategory()?.name || "";
  }
  if (reset) reset.textContent = spellMode ? "↺ この魔法を初期化" : attributeMode ? "↺ この属性を初期化" : "↺ このカテゴリを初期化";
  const note = document.querySelector('[data-v39-effect-panel="data"] .v39-effect-settings-note');
  if (note) note.textContent = "カテゴリ・属性の共通設定と魔法別設定をまとめて書き出します。魔法別設定はブラウザに自動保存します。";
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
  if (magicMode()) return activateMagic({announce});
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
    selectV39EffectSettingsProxy(proxy, patch, category.custom || category.independent ? category.name : undefined, `${editorMode}:${category.id}:${editorMode === "attribute" ? selectedAttributeName : ""}`);
  } finally {
    syncing = false;
  }
  fillEditorSelector();
  updateModeButtons();
  for(const key of ['playbackSpeedPercent','shakeStartPercent','shakeEndPercent','damageMomentPercent']){
    const input=element(`v39-effect-timing-${key}`);
    if(input)input.value=String(category[key]);
  }
  setV39EffectPreviewSpeed(category.playbackSpeedPercent);
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
  if (!element("v39-effect-magic-selectors")) {
    const controls = document.createElement("div");
    controls.id = "v39-effect-magic-selectors";
    controls.hidden = true;
    controls.innerHTML = '<select id="v39-effect-magic-system" aria-label="魔法の系統"></select><select id="v39-effect-magic-spell" aria-label="魔法"></select>';
    toolbar.insertBefore(controls,label);
    controls.firstElementChild.addEventListener("change",event=>{
      selectedSystem = event.target.value;
      selectedSpellKey = "";
      activateMagic();
    });
    controls.lastElementChild.addEventListener("change",event=>{
      selectedSpellKey = event.target.value;
      activateMagic();
    });
    element("v39-effect-editor-view").addEventListener("change",()=>activateCurrent());
    installMagicPresetControls();
  }
  if (!element("v39-effect-category-add")) {
    const button = document.createElement("button");
    button.id = "v39-effect-category-add";
    button.className = "v39-effect-preview-replay";
    button.type = "button";
    button.textContent = "+";
    button.title = "基本カテゴリを追加";
    button.setAttribute("aria-label", "基本カテゴリを追加");
    button.addEventListener("click", () => {
      syncCurrentFromProxy();
      syncing = true;
      let category;
      try { category = addV39EffectCategory(currentCategory()?.baseEffect); }
      finally { syncing = false; }
      selectedCategoryId = category.id;
      activateCurrent();
      if (element('v39-effect-settings-panel').classList.contains('is-preview-header-collapsed')) element('v39-effect-preview-header-toggle').click();
      element("v39-effect-category-name").focus();
      element("v39-effect-category-name").select();
    });
    toolbar.insertBefore(button, element("v39-effect-setting-preview-local"));
    const row = document.createElement("label");
    row.id = "v39-effect-category-name-row";
    row.className = "v39-effect-setting-row";
    row.hidden = true;
    const caption = document.createElement("span");
    caption.textContent = "カテゴリ名";
    const input = document.createElement("input");
    input.id = "v39-effect-category-name";
    input.type = "text";
    input.addEventListener("change", () => renameV39EffectCategory(selectedCategoryId, input.value));
    row.append(caption, input);
    element('v39-effect-preview-controls').prepend(row);
  }
  if(!element('v39-effect-timing-playbackSpeedPercent')){
    const controls=element('v39-effect-preview-controls');
    for(const [key,label,min,max,step] of [
      ['playbackSpeedPercent','再生速度 (%)',25,400,5],
      ['shakeStartPercent','揺れ開始 (%)',0,100,1],
      ['shakeEndPercent','揺れ終了 (%)',0,100,1],
      ['damageMomentPercent','ダメージ表示 (%)',0,100,1]
    ]){
      const row=document.createElement('label');row.className='v39-effect-setting-row';
      const caption=document.createElement('span');caption.textContent=label;
      const input=document.createElement('input');input.type='number';input.id=`v39-effect-timing-${key}`;
      input.min=String(min);input.max=String(max);input.step=String(step);
      input.addEventListener('change',()=>{
        if (magicMode()) {
          if (key === "playbackSpeedPercent" && activeMagicSetting) {
            saveMagicSetting(getV39EffectSetting("@magic"),input.value);
            input.value = activeMagicSetting.playbackSpeedPercent;
            setV39EffectPreviewSpeed(activeMagicSetting.playbackSpeedPercent);
          }
          return;
        }
        if(editorMode!=='category')return;
        syncCurrentFromProxy();
        updateV39EffectCategory(selectedCategoryId,{[key]:Number(input.value)});
        activateCurrent({announce:false});
      });
      row.append(caption,input);controls.appendChild(row);
    }
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
    spells:getV39MagicEffectSnapshot(),
    exportedAt:new Date().toISOString()
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "v39-effect-composite-settings.json";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus(`カテゴリ ${Object.keys(payload.categories).length}件 / 属性 ${Object.keys(payload.attributes).length}件 / 魔法 ${Object.keys(payload.spells).length}件を書き出しました。`);
}

function validateSettingsMap(value, name) {
  const isRecord = item => item && typeof item === "object" && !Array.isArray(item);
  if (!isRecord(value) || Object.values(value).some(item=>!isRecord(item))) throw new TypeError(`${name} の形式が正しくありません。`);
}

function validateVersion(version, maximum) {
  if (version !== undefined && (!Number.isInteger(version) || version < 1 || version > maximum)) {
    throw new TypeError("対応していない設定JSONのバージョンです。");
  }
}

async function importCompositeJson(file) {
  if (!(file instanceof File)) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("設定JSONの形式が正しくありません。");
    let spellImport = null;
    let categoryResult = { importedCount:0, skippedCount:0 };
    let attributeResult = { importedCount:0, skippedCount:0 };
    if (parsed.schema === 'v39-effect-local-draft') {
      if (parsed.version !== 1) throw new Error('対応していないローカルJSONです。');
      validateSettingsMap(parsed.effects,"画像");
      validateSettingsMap(parsed.categories,"カテゴリ");
      validateSettingsMap(parsed.attributes,"属性");
      importV39EffectSettings({ effects:parsed.effects });
      categoryResult = importV39EffectCategorySettings({ categories:parsed.categories });
      attributeResult = importV39EffectAttributeSettings({ attributes:parsed.attributes });
    } else if (parsed.schema === COMPOSITE_SCHEMA || (!parsed.schema && parsed.categories && parsed.attributes)) {
      validateVersion(parsed.version,COMPOSITE_VERSION);
      validateSettingsMap(parsed.categories,"カテゴリ");
      validateSettingsMap(parsed.attributes,"属性");
      if (parsed.version === COMPOSITE_VERSION || Object.hasOwn(parsed,"spells")) {
        if (parsed.schema !== COMPOSITE_SCHEMA || parsed.version !== COMPOSITE_VERSION) throw new TypeError("魔法別設定にはバージョン3が必要です。");
        spellImport = prepareV39MagicEffectImport(parsed.spells);
      }
      categoryResult = importV39EffectCategorySettings({ categories:parsed.categories });
      attributeResult = importV39EffectAttributeSettings({ attributes:parsed.attributes });
      spellImport?.apply();
    } else if (parsed.schema === "v39-effect-category-settings") {
      validateVersion(parsed.version,V39_EFFECT_CATEGORY_SETTINGS_VERSION);
      validateSettingsMap(parsed.categories,"カテゴリ");
      categoryResult = importV39EffectCategorySettings(parsed);
    } else if (parsed.schema === "v39-effect-attribute-settings") {
      validateVersion(parsed.version,V39_EFFECT_ATTRIBUTE_SETTINGS_VERSION);
      validateSettingsMap(parsed.attributes,"属性");
      attributeResult = importV39EffectAttributeSettings(parsed);
    } else {
      throw new TypeError(`対応していない設定形式です: ${parsed.schema || "不明"}`);
    }
    fillEditorSelector();
    activateCurrent({ announce:false });
    const spellResult = spellImport ? ` / 魔法 ${spellImport.importedCount}件（未登録の魔法・素材 ${spellImport.skippedCount}件を除外）` : "";
    setStatus(`設定JSONを読み込みました。カテゴリ ${categoryResult.importedCount}件 / 属性 ${attributeResult.importedCount}件${spellResult}`);
  } catch (error) {
    console.error("[エフェクト共通設定] JSON読み込み失敗", error);
    setStatus(`設定JSON読み込み失敗: ${String(error?.message || error)}`, true);
  }
}

function configureSaveControls() {
  element("v39-effect-settings-export").textContent = "設定JSON書き出し";
  element("v39-effect-settings-import").textContent = "設定JSON読み込み";
  configureV39EffectSettingsEditor({
    exportJson:exportCompositeJson,
    importJsonFile:importCompositeJson,
    reset:() => {
      if (magicMode()) {
        resetV39MagicEffectSetting(selectedSpellKey);
        activateMagic();
        return;
      }
      if (editorMode === "category") {
        const category = currentCategory();
        if (!category) return;
        resetV39EffectCategory(category.id);
        activateCurrent({ announce:false });
        setStatus(`カテゴリ「${category.name}」をデフォルト設定へ戻しました。`);
      } else {
        const attribute = currentAttribute();
        if (!attribute) return;
        resetV39EffectAttribute(attribute.name);
        activateCurrent({ announce:false });
        setStatus(`属性「${attribute.name}」の共通設定を初期化しました。`);
      }
    }
  });
}
function installLocalDraft() {
  const pane = document.querySelector('[data-v39-effect-panel="data"]');
  const status = document.createElement('p'); status.className = 'v39-effect-settings-note';
  status.id = 'v39-effect-local-draft-status'; pane.prepend(status);
  const host=window.location.hostname;
  const localHost=['localhost','127.0.0.1','[::1]'].includes(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (!localHost) {
    status.textContent = 'ローカルJSON自動保存はPCまたは同一LANからの接続時のみ利用できます。外部接続ではブラウザ保存・JSON書出しを使用してください。'; return;
  }
  const snapshot = () => ({ schema:'v39-effect-local-draft', version:1,
    categories:getV39EffectCategorySettingsSnapshot().categories,
    attributes:getV39EffectAttributeSettingsSnapshot().attributes,
    effects:getV39EffectSettingsSnapshot().effects });
  const sync = createV39EffectDraftSync({ snapshot, fetch:window.fetch.bind(window), storage:window.localStorage,
    onStatus:message => { status.textContent = message; },
    hasLocalChanges:() => getV39EffectCategories().some(item=>item.customized||item.custom)||Object.keys(getV39EffectSettingsSnapshot().effects).length>0,
    apply:payload => {
      if (payload.schema !== 'v39-effect-local-draft' || payload.version !== 1) throw new Error('ローカルJSONの形式が正しくありません。');
      const wasSyncing = syncing; syncing = true;
      try {
        importV39EffectSettings({ effects:payload.effects });
        importV39EffectCategorySettings({ categories:payload.categories });
        importV39EffectAttributeSettings({ attributes:payload.attributes });
      } finally { syncing = wasSyncing; }
      activateCurrent({ announce:false });
    }
  });
  for (const event of ['v39:effect-settings-changed','v39:effect-category-settings-changed','v39:effect-attribute-settings-changed']) {
    window.addEventListener(event,event=>{if (event.detail?.effectName !== "@magic") sync.changed();});
  }
  const actions = document.createElement('div'); actions.className = 'v39-effect-settings-actions';
  const save = document.createElement('button'); save.type = 'button'; save.textContent = 'JSONへ保存';
  save.addEventListener('click', async () => {
    if (!sync.isReady()) await sync.start();
    const overwrite = sync.isBlocked();
    if (overwrite && !window.confirm('現在のブラウザ設定でローカルJSONを上書きしますか？')) return;
    await sync.flush({ overwrite });
  });
  const load = document.createElement('button'); load.type = 'button'; load.textContent = 'JSONを読込';
  load.addEventListener('click', async () => {
    if (sync.isDirty() && !window.confirm('ブラウザの未保存変更を破棄してローカルJSONを読み込みますか？')) return;
    await sync.reload();
  });
  actions.append(save, load); status.after(actions);
  const path = document.createElement('p'); path.className = 'v39-effect-settings-note'; path.textContent = '下書き: ' + V39_EFFECT_DRAFT_PATH + '（正式設定は上書きしません）'; actions.after(path);
  void sync.start();
}

async function install() {
  if (installed || installing) return;
  if (!ensureEditorUi()) return;
  installing = true;
  try {
    await loadV39EffectAttributes();
    fillEditorSelector();
    configureSaveControls();
    applyModeVisibility();
    updateModeButtons();
    installed = true;
    activateCurrent({ announce:false });

    window.addEventListener("v39:effect-settings-changed", syncCurrentFromProxy);
    window.addEventListener("v39:effect-category-settings-changed", event => {
      if (syncing) return;
      if (magicMode()) {
        activateMagic({announce:false});
        return;
      }
      const changedId = event.detail?.category?.id;
      if (!changedId || changedId === selectedCategoryId) activateCurrent({ announce:false });
    });
    window.addEventListener("v39:effect-attribute-settings-changed", event => {
      if (syncing) return;
      if (magicMode()) {
        activateMagic({announce:false});
        return;
      }
      if (editorMode !== "attribute") return;
      const changedName = event.detail?.attribute?.name;
      if (!changedName || changedName === selectedAttributeName) activateCurrent({ announce:false });
    });
    installV39EffectSettingsUiState();
    installLocalDraft();
  } catch (error) {
    console.error("[エフェクト属性設定] 属性一覧の初期化失敗", error);
    setStatus(`属性一覧を読み込めませんでした: ${String(error?.message || error)}`, true);
  } finally {
    installing = false;
  }
}

void install();
