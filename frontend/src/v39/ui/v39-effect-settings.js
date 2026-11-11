import { resolveEffectSheetLayout, resolveEffectFrameRange, resolveEffectPowerAxes, resolveEffectSourceTransform, resolveEffectImpactPlacement, resolveEffectImpactPercent } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { installV39EffectImpactDrag, resolveV39EffectImpactGuide } from './v39-effect-impact-drag.js';
import { installV39EffectHeaderCollapse } from './v39-effect-header-collapse.js';
import { selectV39EffectPreviewSequence, resolveV39EffectSequence } from '../../lib/v39-effect-sequence.js';
import { renderV39EffectSequenceEditor } from './v39-effect-sequence-editor.js';
import { V39AreaEffectPlayer } from '../../lib/v39-area-effect-player.js';
import { resolveV39EffectPlaybackDescriptor } from "../combat/v39-effect-player.js";
import { effectPreviewGeometry, renderEffectPreviewCombatants, getV39EffectPreviewMapRequest, V39_EFFECT_PREVIEW_LIMITS } from "./v39-effect-preview-combatants.js";
import { installEffectImagePicker, openEffectImagePicker } from "./v39-effect-image-picker.js";
import { drawIdlePreview, hideIdlePreview, updateGradientSideLabels } from "./v39-effect-settings-static-preview.js";
import { V39_EFFECT_BASE_SCALE_PERCENT, V39_AREA_EFFECT_DEFAULT_DELAY_MS, V39_AREA_EFFECT_DELAY_LIMIT_MS } from "../../lib/v39-effect-transform.js";
import {
  V39_EFFECT_GRADIENT_SPEED_MAX,
  V39_EFFECT_GRADIENT_SPEED_MIN,
  V39_EFFECT_SCALE_MAX,
  V39_EFFECT_SCALE_MIN,
  getV39EffectSetting,
  getV39EffectSettingsCatalog,
  isV39EffectSettingsTarget,
  getV39EffectSettingsSnapshot,
  importV39EffectSettings,
  resetV39EffectSetting,
  updateV39EffectSetting
} from "../../lib/v39-effect-settings.js";

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 280;


const SETTINGS_TABS = Object.freeze(["basic", "color", "motion", "data"]);
const BASE_COLORS = Object.freeze([
  ["#FFFFFF", "白"], ["#000000", "黒"], ["#FF3B1F", "赤"], ["#FF8C00", "橙"],
  ["#FFD54A", "黄"], ["#4CAF50", "緑"], ["#00BCD4", "水色"], ["#2196F3", "青"],
  ["#9C27B0", "紫"], ["#FF80AB", "桃"], ["#795548", "茶"], ["#9E9E9E", "灰"]
]);

let selectedEffectName = "";
let activeSequenceIndex = -1;
let pickingImpact = false;
let draggingImpact = false;
let impactEditing = false;
let sequenceEditorKey = '';
let selectedPreviewOnly = false;

function selectedPreviewDescriptor() {
  return selectV39EffectPreviewSequence(resolveV39EffectPlaybackDescriptor(selectedEffectName),activeSequenceIndex,selectedPreviewOnly);
}
let activeSettingsTab = "basic";
let rendering = false;
let previewGame = null;
let previewPlayer = null;
let previewBootPromise = null;
let previewReplayTimer = null;
let previewScheduleTimer = null;
let previewRequestId = 0;
let playbackMode = "once";
let previewPlaying = false;
let loopRequested = false;
let sleepPending = false;
let previewFrameIndex = 0;
let previewSpeedPercent = 100;
export function setV39EffectPreviewSpeed(percent){
  previewSpeedPercent=Math.max(25,Math.min(400,Number(percent)||100));
  if(previewPanelVisible())schedulePanelPreview(0);
}
let previewBounds = null;
let editorActions = {};
let closeHandler = null;
let returnFocus = null;

export function configureV39EffectSettingsEditor(actions) { editorActions = actions; }
export function setV39EffectSettingsCloseHandler(handler) { closeHandler = handler; }
export function setV39EffectPreviewFrame(index) {
  previewFrameIndex = Math.max(0, Math.floor(Number(index) || 0));
  if (previewPanelVisible() && playbackMode === "frame") void showPanelFrame();
}

export function selectV39EffectSettingsProxy(name, patch, label, editorKey = name) {
  if (sequenceEditorKey !== editorKey) { pickingImpact=false;activeSequenceIndex = -1; selectedPreviewOnly = false; sequenceEditorKey = editorKey; }
  const source = element("v39-effect-setting-source");
  if (!source || !isV39EffectSettingsTarget(name)) return false;
  if (![...source.options].some(option => option.value === name)) source.add(new Option(label || name, name));
  if (label) [...source.options].find(option => option.value === name).textContent = label;
  selectedEffectName = name;
  source.value = name;
  previewFrameIndex = 0;
  rendering = true;
  try { updateV39EffectSetting(name, patch); }
  finally { rendering = false; }
  renderSetting();
  return true;
}

function element(id) {
  return document.getElementById(id);
}

function effectDisplayName() {
  return element("v39-effect-setting-source")?.selectedOptions[0]?.textContent || selectedEffectName;
}

function installStyles() {
  if (element("v39-effect-settings-style")) return;
  const style = document.createElement("style");
  style.id = "v39-effect-settings-style";
  style.textContent = `
    #v39-effect-settings-host{position:fixed;inset:0;z-index:10160;display:grid;place-items:center;background:rgba(2,8,11,.94);overflow:hidden}
    #v39-effect-settings-host[hidden]{display:none!important}
    #v39-effect-settings-host #v39-effect-settings-panel{width:min(1100px,100%);height:100%;max-height:100dvh;box-sizing:border-box}
    #v39-effect-settings-panel{height:100%;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(180px,42%) minmax(0,1fr);background:#0e171b;color:#e7efec}
    #v39-effect-settings-panel[hidden]{display:none!important}
    @media(min-width:650px) and (max-height:500px){
      #v39-effect-settings-host #v39-effect-settings-panel{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:auto minmax(0,1fr)}
      #v39-effect-settings-panel>.v39-effect-settings-head{grid-column:1/-1}
      #v39-effect-settings-panel>.v39-effect-preview-pane{grid-column:1;grid-row:2;border-bottom:0;border-right:1px solid #354950}
      #v39-effect-settings-panel>.v39-effect-settings-lower{grid-column:2;grid-row:2}
    }
    .v39-effect-settings-head{min-height:42px;display:flex;align-items:center;gap:8px;padding:5px 7px;border-bottom:1px solid #3a4c53;background:#142126}
    .v39-effect-settings-head strong{font-size:var(--font-body)}
    .v39-effect-settings-back{min-height:34px;border:1px solid #4b626b;border-radius:6px;background:#18282e;color:#e8f2f0;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    .v39-effect-preview-pane{min-height:0;min-width:0;display:grid;grid-template-rows:auto minmax(120px,1fr);gap:7px;padding:7px;border-bottom:1px solid #354950;background:linear-gradient(180deg,#101b20,#0a1115)}
    .v39-effect-preview-pane{overflow:hidden}
    #v39-effect-preview-controls{flex:0 1 auto;min-height:0;max-height:45%;overflow-y:auto;overflow-x:hidden;display:grid;gap:5px;padding:4px;border-bottom:1px solid #354950;overscroll-behavior:contain}
    #v39-effect-preview-header-toggle{margin-left:auto;flex-shrink:0;min-height:32px;padding:2px 7px;border:1px solid #536a72;border-radius:5px;background:#173039;color:#eef5f2;font:inherit;cursor:pointer}
    .is-preview-header-collapsed #v39-effect-preview-controls{display:none!important}
    .v39-effect-playback-controls,.v39-effect-frame-controls{display:flex;align-items:center;gap:5px;min-width:0}
    .v39-effect-playback-controls select{min-width:0;flex:1;background:#0b1519;color:#eef5f2;border:1px solid #536a72;border-radius:6px;min-height:32px;font:inherit}
    .v39-effect-frame-controls{flex:2}.v39-effect-frame-controls[hidden]{display:none}
    .v39-effect-frame-controls input{width:100%;min-width:30px}.v39-effect-frame-controls button{padding:3px 7px;min-height:32px;font:inherit;background:#173039;color:#eef8f5;border:1px solid #4f6b74;border-radius:6px}
    .v39-effect-frame-controls output{white-space:nowrap;font-size:var(--font-secondary)}
    .v39-effect-preview-toolbar{display:flex;align-items:center;gap:7px;min-width:0}
    .v39-effect-preview-range{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;min-width:0}
    .v39-effect-preview-range label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:4px;min-width:0;font-size:var(--font-secondary)}
    .v39-effect-preview-range input,.v39-effect-preview-range select{width:100%;min-width:0;min-height:30px;box-sizing:border-box;background:#0b1519;color:#eef5f2;border:1px solid #536a72;border-radius:5px;font:inherit}
    #v39-effect-preview-summary{position:absolute;left:5px;bottom:3px;z-index:4;pointer-events:none;color:#fff0b7;background:#0b1519bd;padding:2px 4px;font-size:var(--font-secondary)}
    .v39-effect-preview-camera{position:absolute;right:4px;top:4px;z-index:5;display:flex;align-items:center;gap:4px;background:#0b1519e8;padding:3px;border-radius:5px;font-size:var(--font-secondary)}
    .v39-effect-preview-camera input{width:48px;background:#0b1519;color:#eef5f2;border:1px solid #536a72;border-radius:4px;font:inherit}
    .v39-effect-preview-camera button{padding:3px 6px;font:inherit;background:#18343e;color:#eef5f2;border:1px solid #668995;border-radius:4px}
    .v39-effect-preview-combatants .is-attack-area polygon{fill:#775936;stroke:#e5ba6c}
    .v39-effect-preview-selector{min-width:0;flex:1;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;color:#c8d6d7;font-size:var(--font-secondary);font-weight:800}
    .v39-effect-preview-selector select{width:100%;min-width:0;min-height:38px;border:1px solid #536a72;border-radius:7px;background:#0b1519;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-preview-replay{flex:0 0 auto;min-height:38px;border:1px solid #4f6b74;border-radius:7px;background:#173039;color:#eef8f5;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    #v39-effect-preview-stage{position:relative;min-width:0;min-height:120px;overflow:hidden;border:1px solid #31464d;border-radius:10px;background:radial-gradient(circle at 50% 50%,rgba(50,76,84,.34),rgba(5,10,13,.98) 68%);box-shadow:inset 0 0 28px rgba(0,0,0,.5)}
    #v39-effect-preview-stage::before,#v39-effect-preview-stage::after{content:"";position:absolute;z-index:0;pointer-events:none;background:rgba(119,161,170,.1)}
    #v39-effect-preview-stage::before{left:50%;top:8%;bottom:8%;width:1px}
    #v39-effect-preview-stage::after{top:50%;left:8%;right:8%;height:1px}
    #v39-effect-preview-stage canvas{position:absolute!important;z-index:1;inset:0;width:100%!important;height:100%!important;object-fit:contain;pointer-events:none}
    .v39-effect-preview-placeholder{position:absolute;z-index:2;inset:0;display:grid;place-items:center;color:#83999d;font-size:var(--font-secondary);pointer-events:none}
    #v39-effect-preview-stage.is-ready .v39-effect-preview-placeholder{display:none}
    .v39-effect-preview-combatants{position:absolute;inset:0;z-index:0;pointer-events:none}
    .v39-effect-preview-combatants>div{position:absolute;transform:translate(-50%,-50%)}
    .v39-effect-preview-combatants img{position:absolute;inset:0;display:block;width:100%;height:100%;min-width:0;min-height:0;object-fit:contain;pointer-events:none}
    .v39-effect-preview-combatants [hidden]{display:none}.v39-effect-preview-combatants button{position:absolute;transform:translate(-50%,-50%);padding:0;min-height:0;min-width:0;border:0;background:none;pointer-events:auto;cursor:pointer;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.v39-effect-preview-combatants svg{width:100%;height:100%}.v39-effect-preview-combatants polygon{fill:#253c39;stroke:#779487;stroke-width:1}.v39-effect-preview-combatants [aria-pressed="true"] polygon{fill:#416055;stroke:#ffe28b;stroke-width:2}.v39-effect-preview-combatants span{color:#eef5f2;font-size:var(--font-secondary);text-shadow:0 1px 3px #000}
    #v39-effect-hit-image-picker{font:inherit;background:#173039;color:#edf7f4;border:1px solid #536a72;border-radius:5px;padding:5px}
    #v39-effect-attribute-base-row,#v39-effect-attribute-brightness-row{display:none}.is-attribute-mode #v39-effect-attribute-base-row,.is-attribute-mode #v39-effect-attribute-brightness-row{display:grid}
    #v39-effect-hit-specific[hidden]{display:none}
    #v39-effect-gradient-guides{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;overflow:hidden}
    #v39-effect-gradient-guides[hidden]{display:none}
    #v39-effect-gradient-guides text{font-size:var(--font-secondary);font-weight:800;paint-order:stroke;stroke:#071015;stroke-width:3px;stroke-linejoin:round}
    .v39-effect-settings-lower{min-height:0;min-width:0;display:grid;grid-template-columns:44px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr) auto;background:#0d161a}
    .v39-effect-settings-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;border-bottom:1px solid #354950;background:#111d22}
    #v39-effect-setting-preview-lower{min-width:68px;min-height:42px;border:0;border-left:1px solid #2b3c42;background:#173039;color:#eef8f5;padding:5px 9px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    #v39-effect-setting-preview-lower:hover{background:#1d424b;color:#fff}
    @media(max-width:600px){#v39-effect-setting-preview-lower{min-width:60px;min-height:44px;padding:4px 7px;font-size:var(--font-compact)}}
    .v39-effect-settings-tab{min-width:0;min-height:42px;border:0;border-right:1px solid #2b3c42;background:#111d22;color:#9eb0b3;padding:5px 3px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    .v39-effect-settings-tab:last-child{border-right:0}.v39-effect-settings-tab[aria-selected="true"]{background:#1b343b;color:#eff9f7;box-shadow:inset 0 -2px #70c5d2}
    .v39-effect-settings-lower>.v39-effect-settings-tabs,.v39-effect-settings-lower>.v39-effect-settings-body,.v39-effect-settings-lower>#v39-effect-settings-status{grid-column:2;min-width:0}
    .v39-effect-settings-body{min-height:0;display:flex;flex-direction:column;overflow:hidden}
    .v39-effect-settings-tabpanel{flex:1 1 0;height:auto;min-height:0;overflow:auto;padding:7px;display:grid;gap:7px;align-content:start;overscroll-behavior:contain}
    .v39-effect-settings-tabpanel[hidden]{display:none!important}
    .v39-effect-settings-note{margin:0;padding:7px 8px;border:1px solid #31464d;border-radius:7px;background:#101d22;color:#aebec1;font-size:var(--font-secondary);line-height:1.45}
    .v39-effect-setting-row{display:grid;grid-template-columns:minmax(105px,.7fr) minmax(0,1.3fr);align-items:center;gap:7px;padding:7px 8px;border:1px solid #33474e;border-radius:7px;background:#111d22}
    .v39-effect-setting-row[hidden]{display:none}
    .v39-effect-setting-row>span:first-child{font-size:var(--font-secondary);font-weight:800;color:#c7d4d5}
    .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"],.v39-effect-setting-row input[type="text"]{width:100%;min-width:0;min-height:38px;border:1px solid #50646b;border-radius:6px;background:#0d171b;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-setting-row input:disabled,.v39-effect-setting-row select:disabled{opacity:.45;cursor:not-allowed}
    #v39-effect-setting-sequence input,#v39-effect-setting-sequence select{min-width:0;min-height:32px;border:1px solid #50646b;border-radius:5px;background:#0d171b;color:#eef5f2;padding:3px 5px;font:inherit}
    #v39-effect-setting-sequence button{min-height:32px;border:1px solid #536a72;border-radius:5px;background:#173039;color:#edf7f4;padding:3px 7px;font:inherit;cursor:pointer}
    #v39-effect-setting-sequence button:disabled{opacity:.4;cursor:default}
    #v39-effect-setting-sequence label{min-width:0;font-size:var(--font-secondary);color:#c7d4d5}
    #v39-effect-sequence-tabs{grid-column:1;grid-row:1/-1;display:flex;flex-direction:column;align-items:stretch;gap:4px;min-width:0;min-height:0;overflow-y:auto;overflow-x:hidden;padding:4px 2px;border-right:1px solid #354950;overscroll-behavior:contain}
    #v39-effect-sequence-tabs button{flex:0 0 auto;box-sizing:border-box;width:100%;min-width:0;min-height:38px;padding:2px 3px;white-space:nowrap;font-size:var(--font-secondary);border:1px solid #536a72;border-radius:5px;background:#11252c;color:#dbe9e9;font:inherit;font-size:var(--font-secondary);cursor:pointer}
    #v39-effect-sequence-tabs [aria-selected="true"]{background:#244b55;border-color:#70d2e3;color:#fff}
    #v39-effect-sequence-tabs button:disabled{opacity:.4}
    #v39-effect-settings-panel.is-attribute-mode .v39-effect-settings-lower{grid-template-columns:minmax(0,1fr)}
    #v39-effect-settings-panel.is-attribute-mode .v39-effect-settings-lower>*{grid-column:1}
    .v39-effect-playback-controls{flex-wrap:wrap}
    #v39-effect-frame-controls{min-width:100%}
    #v39-effect-common-settings,#v39-effect-common-actions{display:grid;gap:7px}
    #v39-effect-settings-panel:not(.is-attribute-mode) #v39-effect-base-row{display:none}
    #v39-effect-settings-panel:not(.is-attribute-mode)[data-sequence-scope="step"] #v39-effect-common-settings,
    #v39-effect-settings-panel:not(.is-attribute-mode)[data-sequence-scope="step"] #v39-effect-common-actions,
    #v39-effect-settings-panel[data-sequence-scope="common"] #v39-effect-setting-sequence,
    #v39-effect-settings-panel.is-attribute-mode #v39-effect-sequence-tabs,
    #v39-effect-settings-panel.is-attribute-mode #v39-effect-setting-sequence,
    #v39-effect-settings-panel.is-attribute-mode #v39-effect-preview-scope{display:none}
    .v39-effect-colors{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .v39-effect-color-card{min-width:0;display:grid;gap:5px;padding:7px;border:1px solid #33474e;border-radius:7px;background:#111d22}
    .v39-effect-color-card>label{display:flex;align-items:center;gap:6px;font-size:var(--font-secondary)}
    .v39-effect-color-card input[type="color"]{width:44px;height:38px;padding:2px;border:1px solid #50646b;border-radius:6px;background:#0d171b;cursor:pointer}
    .v39-effect-color-card select{width:100%;min-width:0;min-height:38px;background:#0d171b;color:#eef5f2;border:1px solid #50646b;border-radius:6px;font:inherit}
    #v39-effect-color-single[hidden],#v39-effect-color-gradient[hidden],#v39-effect-color-strength[hidden]{display:none}
    #v39-effect-color-gradient{display:grid;gap:7px}
    [data-v39-effect-panel="color"] .v39-effect-setting-row{grid-template-columns:85px minmax(0,1fr)}
    .v39-effect-tint-code{color:#a9b8ba;font-size:var(--font-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .v39-effect-gradient-speed{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px}
    .v39-effect-gradient-speed small{color:#9fb0b3;font-size:var(--font-secondary);white-space:nowrap}
    .v39-effect-gradient-height{display:grid;grid-template-columns:minmax(0,1fr) 72px;align-items:center;gap:7px}.v39-effect-gradient-height input[type="range"]{width:100%;min-width:0}
    .v39-effect-settings-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .v39-effect-settings-actions button{min-height:42px;border:1px solid #49646d;border-radius:7px;background:#173039;color:#eef8f5;padding:6px 8px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    .v39-effect-settings-actions button:hover,.v39-effect-preview-replay:hover{background:#1d424b;border-color:#76cedb}
    #v39-effect-settings-status{min-height:28px;margin:0;padding:5px 8px;border-top:1px solid #293b41;background:#0a1216;color:#a9bdc0;font-size:var(--font-secondary);line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}
    #v39-effect-settings-status.is-error{color:#f3a092;background:#2c1715}
    @media(max-width:600px){
      .v39-effect-settings-head{min-height:34px;padding:3px 5px}
      .v39-effect-preview-pane{padding:5px;gap:5px}
      .v39-effect-preview-selector{grid-template-columns:1fr;gap:3px}.v39-effect-preview-selector>span{display:none}
      .v39-effect-preview-selector select,.v39-effect-preview-replay{min-height:40px}
      .v39-effect-settings-tab{min-height:44px;font-size:var(--font-compact)}
      .v39-effect-settings-tabpanel{padding:6px}
      .v39-effect-setting-row{grid-template-columns:1fr;gap:5px;padding:7px}
      .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"],.v39-effect-setting-row input[type="text"]{min-height:40px}
      .v39-effect-settings-actions button{min-height:44px}
    }
  `;
  document.head.appendChild(style);
}

function createOption(value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
}

function colorCard(id, label) {
  return `<div class="v39-effect-color-card"><label><span>${label}</span><input type="color" id="v39-effect-setting-${id}" value="#FFFFFF" aria-label="${label}の詳細指定"><output id="v39-effect-setting-${id}-code" class="v39-effect-tint-code"></output></label><select id="v39-effect-setting-${id}-preset" aria-label="${label}の基本色"><option value="">詳細指定</option>${BASE_COLORS.map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select></div>`;
}

function fillSelect(select, names, { includeNone = false } = {}) {
  if (!(select instanceof HTMLSelectElement)) return;
  select.replaceChildren();
  if (includeNone) select.appendChild(createOption("", "なし"));
  for (const name of names) select.appendChild(createOption(name));
}

function ensureMenuEntry() {
  const menu = element("v39-manage-menu");
  if (!(menu instanceof HTMLElement)) return null;
  let button = element("v39-manage-effect-settings");
  if (button) return button;
  button = document.createElement("button");
  button.type = "button";
  button.id = "v39-manage-effect-settings";
  button.className = "manage-tile";
  button.innerHTML = "<b>✦</b><span>エフェクト設定</span>";
  menu.appendChild(button);
  return button;
}

function ensurePanel() {
  const manage = element("footManage");
  if (!(manage instanceof HTMLElement)) return null;
  let panel = element("v39-effect-settings-panel");
  if (panel) return panel;
  panel = document.createElement("section");
  panel.id = "v39-effect-settings-panel";
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  panel.innerHTML = `
    <header class="v39-effect-settings-head">
      <button type="button" id="v39-effect-settings-back" class="v39-effect-settings-back">← 管理</button>
      <strong>エフェクト設定</strong>
      <button type="button" id="v39-effect-preview-header-toggle" aria-controls="v39-effect-preview-controls" aria-expanded="true">条件 ▴</button>
    </header>
    <section class="v39-effect-preview-pane" aria-label="エフェクトプレビュー">
      <div class="v39-effect-preview-toolbar">
        <label class="v39-effect-preview-selector"><span>対象</span><select id="v39-effect-setting-source" aria-label="対象エフェクト"></select></label>
        <button type="button" id="v39-effect-setting-preview-local" class="v39-effect-preview-replay">▶ 再生</button>
      </div>
      <div id="v39-effect-preview-stage"><div class="v39-effect-preview-placeholder">プレビューを準備中…</div><svg id="v39-effect-gradient-guides" aria-label="グラデーションの基準位置" hidden></svg><div class="v39-effect-preview-camera"><label>倍率 <input id="v39-effect-preview-zoom" type="number" min="${V39_EFFECT_PREVIEW_LIMITS.minimumZoomPercent}" max="${V39_EFFECT_PREVIEW_LIMITS.maximumZoomPercent}" value="${V39_EFFECT_PREVIEW_LIMITS.defaultZoomPercent}" aria-label="プレビュー倍率">%</label><button type="button" id="v39-effect-preview-fit">全体表示</button></div><output id="v39-effect-preview-summary"></output></div>
    </section>
    <section class="v39-effect-settings-lower">
      <nav id="v39-effect-sequence-tabs"></nav>
      <nav class="v39-effect-settings-tabs" aria-label="設定カテゴリ" role="tablist">
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="basic" role="tab" aria-selected="true">基本</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="color" role="tab" aria-selected="false">色</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="motion" role="tab" aria-selected="false">動き</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="data" role="tab" aria-selected="false">保存</button>
        <button type="button" id="v39-effect-setting-preview-lower" aria-label="エフェクトを再生">▶ 再生</button>
      </nav>
      <div class="v39-effect-settings-body">
      <div id="v39-effect-preview-controls">
      <div class="v39-effect-playback-controls">
        <select id="v39-effect-preview-scope" aria-label="再生対象"><option value="all">全体再生</option><option value="selected">このアニメのみ</option></select>
        <input type="hidden" id="v39-effect-preview-direction" value="0">
        <select id="v39-effect-playback-mode" aria-label="再生方式"><option value="once">1回再生</option><option value="loop">ループ</option><option value="frame">コマ切り替え</option><option value="full-image">元画像全体</option></select>
        <div id="v39-effect-frame-controls" class="v39-effect-frame-controls" hidden>
          <button type="button" id="v39-effect-frame-prev" aria-label="前のコマ">◀</button>
          <input type="range" id="v39-effect-frame-slider" aria-label="コマ位置" min="0" max="0" value="0">
          <button type="button" id="v39-effect-frame-next" aria-label="次のコマ">▶</button>
          <output id="v39-effect-frame-count">1/1</output>
        </div>
      </div>
      <div class="v39-effect-preview-range">
        <label>距離<input id="v39-effect-preview-distance" type="number" min="1" max="${V39_EFFECT_PREVIEW_LIMITS.maximumDistance}" value="1" aria-label="攻撃距離（マス）"></label>
        <label>範囲<select id="v39-effect-preview-shape" aria-label="攻撃範囲"><option value="single">単体</option><option value="circle">着弾円</option><option value="line">直線</option></select></label>
        <label>半径<input id="v39-effect-preview-radius" type="number" min="0" max="${V39_EFFECT_PREVIEW_LIMITS.maximumAreaRadius}" value="1" aria-label="範囲半径（マス）" disabled></label>
        <label>威力<input id="v39-effect-preview-power" type="number" min="0" max="10000" value="100" aria-label="威力補正プレビュー"></label>
      </div>
      </div>

        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="basic" role="tabpanel">
          <div id="v39-effect-common-settings">
          <label class="v39-effect-setting-row"><span>ヒット演出</span><select id="v39-effect-setting-hit-mode"><option value="none">なし</option><option value="common">共通（ヒットカテゴリ）</option><option value="specified">指定</option></select></label>
          <div id="v39-effect-hit-specific" class="v39-effect-setting-row" hidden><span>指定画像</span><select id="v39-effect-setting-hit-name" aria-label="ヒット画像"></select><button type="button" id="v39-effect-hit-image-picker">画像一覧</button></div>
          <div id="v39-effect-base-row" class="v39-effect-setting-row"><span>基本形状</span><select id="v39-effect-setting-base" aria-label="基本形状"></select></div>
          <label class="v39-effect-setting-row"><span>エフェクトの向き</span><select id="v39-effect-setting-orientation"><option value="fixed">固定向き</option><option value="attack">攻撃方向に回転（右が基準）</option></select></label>
          <label class="v39-effect-setting-row"><span>表示位置・伸長</span><select id="v39-effect-setting-placement"><option value="target">通常：着弾点に表示</option><option value="beam-x">発射元→対象へ伸長（横画像：左→右）</option><option value="beam-y">発射元→対象へ伸長（縦画像：上→下）</option></select></label>
          <label class="v39-effect-setting-row"><span>範囲エフェクト</span><select id="v39-effect-setting-area"><option value="center">中心に1つ（範囲に合わせて拡大）</option><option value="tiles">対象マスごと（通常サイズ）</option></select></label>
          <label class="v39-effect-setting-row"><span>マスごとの再生タイミング</span><select id="v39-effect-setting-area-timing"><option value="simultaneous">同時</option><option value="random">ランダムにずらす</option></select></label>
          <label class="v39-effect-setting-row"><span>ずらす幅（0〜指定値ms）</span><span class="v39-effect-gradient-height"><input type="range" id="v39-effect-setting-area-delay-slider" min="0" max="${V39_AREA_EFFECT_DELAY_LIMIT_MS}" step="1" value="${V39_AREA_EFFECT_DEFAULT_DELAY_MS}" aria-label="ランダム開始遅延の最大値"><input type="number" id="v39-effect-setting-area-delay" min="0" max="${V39_AREA_EFFECT_DELAY_LIMIT_MS}" step="1" value="${V39_AREA_EFFECT_DEFAULT_DELAY_MS}" aria-label="ランダム開始遅延（ms）"></span></label>
          <label class="v39-effect-setting-row"><span>威力による拡大方向</span><select id="v39-effect-setting-power-axis"><option value="both">縦横両方</option><option value="x">横だけ（画像基準）</option><option value="y">縦だけ（画像基準）</option></select></label>
          <p id="v39-effect-setting-placement-hint" class="v39-effect-setting-hint">伸長時は距離と攻撃方向に追従し、角度・位置補正は各番号タブで指定します。倍率は太さに適用し、範囲拡大は使いません。カテゴリ設定は実戦にも自動反映します（スキルのアニメ指定を優先）。</p>
          <label class="v39-effect-setting-row"><span>追加装飾</span><select id="v39-effect-setting-decoration"></select></label>
          </div>
          <section id="v39-effect-setting-sequence"><div id="v39-effect-sequence-list"></div><p class="v39-effect-settings-note">1つ目の終了後に次を再生。倍率は共通倍率への追加補正です。角度・位置は各アニメーション固有です。</p></section>
          <div id="v39-effect-common-actions">
          <label class="v39-effect-setting-row"><span>基準Scale倍率</span><input type="number" id="v39-effect-setting-scale" min="${V39_EFFECT_SCALE_MIN}" max="${V39_EFFECT_SCALE_MAX}" step="5" value="100"></label>
          <div class="v39-effect-settings-actions"><button type="button" id="v39-effect-setting-reset">↺ この設定を初期化</button></div>
          </div>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="color" role="tabpanel" hidden>
          <label id="v39-effect-attribute-brightness-row" class="v39-effect-setting-row"><span>光度 (%)</span><span class="v39-effect-gradient-height"><input id="v39-effect-setting-brightness-slider" type="range" min="0" max="200" step="1" value="100" aria-label="光度"><input id="v39-effect-setting-brightness" type="number" min="0" max="200" step="1" value="100" aria-label="光度の数値"></span></label>
          <label id="v39-effect-attribute-base-row" class="v39-effect-setting-row"><span>着色前の画像</span><select id="v39-effect-setting-grayscale"><option value="mono">モノクロ化</option><option value="original">元色を保持</option></select></label>
          <label class="v39-effect-setting-row"><span>着色方式</span><select id="v39-effect-setting-color-mode"><option value="none">なし</option><option value="tint">単色</option><option value="gradient">グラデーション</option></select></label>
          <div id="v39-effect-color-single" hidden>${colorCard("tint", "色")}</div>
          <div id="v39-effect-color-gradient" hidden>
          <div class="v39-effect-colors">${colorCard("gradient-a", "色A")}${colorCard("gradient-b", "色B")}</div>
          ${[["gradient-start", "開始位置", 0], ["gradient-end", "終了位置", 100]].map(([id, label, value]) => `
            <label class="v39-effect-setting-row"><span>${label} (%)</span><span class="v39-effect-gradient-height"><input type="range" id="v39-effect-setting-${id}-slider" min="0" max="100" step="1" value="${value}" aria-label="${label}"><input type="number" id="v39-effect-setting-${id}" min="0" max="100" step="1" value="${value}" aria-label="${label}の数値"></span></label>`).join("")}
          </div>
          <label id="v39-effect-color-strength" class="v39-effect-setting-row" hidden><span>着色強度 (%)</span><span class="v39-effect-gradient-height"><input type="range" id="v39-effect-setting-strength-slider" min="0" max="100" step="1" value="100" aria-label="着色強度"><input type="number" id="v39-effect-setting-strength" min="0" max="100" step="1" value="100" aria-label="着色強度の数値"></span></label>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="motion" role="tabpanel" hidden>
          <label class="v39-effect-setting-row"><span>移動方式</span><select id="v39-effect-setting-gradient-motion-mode" aria-label="グラデーション移動方式"><option value="fixed">固定</option><option value="scroll">一方向</option><option value="wave">往復循環</option></select></label>
          <label class="v39-effect-setting-row"><span>移動方向</span><select id="v39-effect-setting-gradient-direction"><option value="up">上へ</option><option value="down">下へ</option><option value="left">左へ</option><option value="right">右へ</option></select></label>
          <label class="v39-effect-setting-row"><span>移動速度</span><span class="v39-effect-gradient-speed"><input type="number" id="v39-effect-setting-gradient-speed" min="${V39_EFFECT_GRADIENT_SPEED_MIN}" max="${V39_EFFECT_GRADIENT_SPEED_MAX}" step="10" value="80"><small>% / 秒</small></span></label>
          <p class="v39-effect-settings-note">グラデーションがOFFの場合、移動方向と速度は無効になります。</p>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="data" role="tabpanel" hidden>
          <p class="v39-effect-settings-note">変更はブラウザ内へ自動保存され、戦闘再生へ即時反映されます。上のプレビューはタイトル画面でも使用できます。</p>
          <div class="v39-effect-settings-actions">
            <button type="button" id="v39-effect-setting-preview">実マップで確認</button>
            <button type="button" id="v39-effect-settings-export">JSON書き出し</button>
            <button type="button" id="v39-effect-settings-import">JSON読み込み</button>
            <input type="file" id="v39-effect-settings-file" accept=".json,application/json" hidden>
          </div>
        </section>
      </div>
      <p id="v39-effect-settings-status" aria-live="polite"></p>
    </section>`;
  const host = document.createElement("div");
  host.id = "v39-effect-settings-host";
  host.hidden = true;
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "エフェクト設定");
  host.appendChild(panel);
  document.body.appendChild(host);
  host.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closePanel(); }
    if (event.key !== "Tab") return;
    const controls = [...host.querySelectorAll('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')]
      .filter(node => node.getClientRects().length > 0);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  return panel;
}

function settingCount() {
  return Object.keys(getV39EffectSettingsSnapshot().effects || {}).length;
}

function setStatus(message, error = false) {
  const status = element("v39-effect-settings-status");
  if (!status) return;
  status.textContent = String(message || "");
  status.classList.toggle("is-error", error);
}

function previewSourceUrl(descriptor = selectedPreviewDescriptor()) {
  return descriptor?.sequenceSources?.[0]?.src || "不明";
}

function previewErrorMessage(error) {
  return String(error?.message || error || "不明なエラー");
}

function showPreviewFailure(label, error, descriptor = selectedPreviewDescriptor()) {
  setStatus(`${label}\nURL: ${previewSourceUrl(descriptor)}\n原因: ${previewErrorMessage(error)}`, true);
}

function switchSettingsTab(tabName) {
  const next = SETTINGS_TABS.includes(tabName) ? tabName : "basic";
  activeSettingsTab = next;
  for (const button of document.querySelectorAll("[data-v39-effect-tab]")) {
    button.setAttribute("aria-selected", button.dataset.v39EffectTab === next ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-v39-effect-panel]")) {
    panel.hidden = panel.dataset.v39EffectPanel !== next;
  }
  renderGradientGuides();
  if (previewPanelVisible() && (next === "color" || next === "motion")) schedulePanelPreview(0);
}

function renderGradientGuides(bounds = previewBounds) {
  if (bounds) previewBounds = bounds;
  const stage=element('v39-effect-preview-stage');
  let marker=element('v39-effect-impact-marker');
  if(stage && !marker){marker=document.createElement('div');marker.id='v39-effect-impact-marker';
    marker.textContent='＋';marker.title='ドラッグして着弾点を指定';marker.setAttribute('aria-label','着弾基準点をドラッグ');marker.style.cssText='position:absolute;pointer-events:auto;touch-action:none;cursor:grab;user-select:none;width:32px;height:32px;text-align:center;z-index:15;color:#ffdf4d;text-shadow:0 0 2px #000;font-size:24px;line-height:32px;transform:translate(-50%,-50%)';stage.append(marker);}
  if(marker){
    marker.hidden=!impactEditing || activeSequenceIndex<0 || !previewBounds || !previewGame?.scale || !previewPanelVisible() || playbackMode==='full-image';
    if(!marker.hidden && !draggingImpact){marker.style.left=((previewBounds.anchorX ?? previewBounds.x)/previewGame.scale.width*100)+'%';
      marker.style.top=((previewBounds.anchorY ?? previewBounds.y)/previewGame.scale.height*100)+'%';}
  }
  let impactGuide=element('v39-effect-impact-guide');
  if(stage && !impactGuide){
    impactGuide=document.createElementNS('http://www.w3.org/2000/svg','svg');impactGuide.id='v39-effect-impact-guide';
    impactGuide.setAttribute('aria-label','着弾点の設定可能範囲：画像1コマ');
    impactGuide.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:14;overflow:hidden';stage.append(impactGuide);
  }
  if(impactGuide){
    impactGuide.toggleAttribute('hidden',marker?.hidden ?? true);
    if(!marker?.hidden){
      impactGuide.setAttribute('viewBox',`0 0 ${previewGame.scale.width} ${previewGame.scale.height}`);
      const corners=resolveV39EffectImpactGuide(previewBounds);
      const points=corners.map(p=>`${p.x},${p.y}`).join(' ');
      const labels=corners.map(p=>`<text x="${p.x+4}" y="${p.y-5}">${p.percentX}%,${p.percentY}%</text>`).join('');
      impactGuide.innerHTML=`<polygon points="${points}" fill="none" stroke="#ffdf4d" stroke-width="1.5" stroke-dasharray="6 4"/><g fill="#ffdf4d" font-size="11" paint-order="stroke" stroke="#071015" stroke-width="3">${labels}<text x="6" y="16">設定可能範囲（画像1コマ）</text></g>`;
    }
  }
  const svg = element("v39-effect-gradient-guides");
  if (!svg) return;
  const setting = getV39EffectSetting(selectedEffectName);
  const hidden = !previewBounds || !setting.gradientEnabled || !["color", "motion"].includes(activeSettingsTab);
  svg.toggleAttribute("hidden", hidden);
  if (hidden) return;
  const { x, y, width, height } = previewBounds;
  const left = x - width / 2, top = y - height / 2;
  const horizontal = ["left", "right"].includes(setting.gradientDirection);
  const axis = horizontal ? "左0% → 右100%" : "上0% ↓ 下100%";
  svg.setAttribute("viewBox", `0 0 ${previewGame.scale.width} ${previewGame.scale.height}`);
  const guides = [[setting.gradientStartPercent, "開始", "#78e0ff"], [setting.gradientEndPercent, "終了", "#ffda78"]].map(([percent, name, color], index) => {
    const position = (horizontal ? left : top) + (horizontal ? width : height) * percent / 100;
    const line = horizontal
      ? `<line x1="${position}" x2="${position}" y1="${top}" y2="${top + height}"/>`
      : `<line x1="${left}" x2="${left + width}" y1="${position}" y2="${position}"/>`;
    const labelX = horizontal ? Math.max(4, Math.min(position + 4, previewGame.scale.width - 75)) : Math.max(4, left + 4);
    const labelY = horizontal ? Math.max(30, top + 16 + index * 17) : Math.max(30, Math.min(position + (index ? 16 : -4), previewGame.scale.height - 4));
    return `<g data-guide="${index ? "end" : "start"}" data-percent="${percent}" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 4">${line}<text x="${labelX}" y="${labelY}" fill="${color}" stroke-dasharray="none">${name} ${percent}%</text></g>`;
  }).join("");
  const angle = previewBounds.angleDeg ?? effectPreviewGeometry(element("v39-effect-preview-stage"), setting).angleDeg;
  svg.innerHTML = `<g transform="translate(${x} ${y}) scale(${previewBounds.screenScaleX ?? 1} ${previewBounds.screenScaleY ?? 1}) rotate(${angle}) scale(${previewBounds.flipX?-1:1} ${previewBounds.flipY?-1:1}) translate(${-x} ${-y})"><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#c4d1d4" stroke-dasharray="4 4"/>${guides}</g><text x="6" y="16" fill="#ecf5f1">${axis}（画像内の基準）</text>`;
}

function applyColorControlState(setting) {
  const gradientEnabled = setting?.gradientEnabled === true;
  element("v39-effect-color-single").hidden = gradientEnabled || !setting.tint;
  element("v39-effect-color-gradient").hidden = !gradientEnabled;
  element("v39-effect-color-strength").hidden = !gradientEnabled && !setting.tint;
  for (const id of ["tint", "gradient-a", "gradient-b"]) {
    const color = element(`v39-effect-setting-${id}`).value.toUpperCase();
    element(`v39-effect-setting-${id}-preset`).value = BASE_COLORS.some(([value]) => value === color) ? color : "";
  }

  for (const id of [
    "v39-effect-setting-gradient-a",
    "v39-effect-setting-gradient-b",
    "v39-effect-setting-gradient-direction",
    "v39-effect-setting-gradient-speed"
  ]) {
    const control = element(id);
    if (control) control.disabled = !gradientEnabled;
  }
  for (const name of ["gradient-start", "gradient-end"]) {
    for (const suffix of ["", "-slider"]) element(`v39-effect-setting-${name}${suffix}`).disabled = !gradientEnabled;
  }
  element("v39-effect-setting-gradient-motion-mode").disabled = !gradientEnabled;
  const fixed = setting.gradientMotionMode === "fixed";
  element("v39-effect-setting-gradient-direction").disabled = !gradientEnabled || fixed;
  element("v39-effect-setting-gradient-speed").disabled = !gradientEnabled || fixed;
  updateGradientSideLabels();
}

function previewPanelVisible() {
  const panel = element("v39-effect-settings-panel");
  return panel instanceof HTMLElement && panel.hidden === false && panel.getAttribute("aria-hidden") !== "true";
}

function syncPlaybackControls() {
  const button = element("v39-effect-setting-preview-lower");
  if (!button) return;
  const running = loopRequested && playbackMode === "loop";
  button.textContent = running ? "■ 停止" : "▶ 再生";
  button.setAttribute("aria-label", running ? "エフェクトを停止" : "エフェクトを再生");
  button.setAttribute("aria-pressed", String(running));
}

function sleepPreviewAfterRender() {
  if (!previewGame || sleepPending) return;
  sleepPending = true;
  previewGame.events.once("postrender", () => {
    sleepPending = false;
    if (!previewPlaying) previewGame.loop.sleep();
  });
  previewGame.loop.wake();
}

async function showIdlePreview() {
  if (!previewPanelVisible()) return;
  if(playbackMode !== 'full-image')return showPanelFrame();
  hideIdlePreview();
  await drawIdlePreview({ fullImage:true, descriptor:selectedPreviewDescriptor() });
  sleepPreviewAfterRender();
}

async function previewSources(descriptor) {
  const requestId = previewRequestId;
  const host = element("v39-effect-preview-stage");
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
  previewGame.scale.resize(width, height);
  const geometry = effectPreviewGeometry(host, descriptor);

  const sources = [];
  for (const source of descriptor.sequenceSources) {
    let key;
    try {
      key = await previewPlayer.loadTexture(source.src);
    } catch (error) {
      error.previewSource = source.src;
      throw error;
    }
    const image = previewGame.textures.get(key).getSourceImage();
    const layout = resolveEffectSheetLayout(image.width, image.height, previewPlayer.options);
    const scale = source.sourceScaleMultiplier * geometry.zoom;
    sources.push({ ...source, stepTransform:source.stepTransform?{...source.stepTransform,offsetX:source.stepTransform.offsetX*geometry.zoom,offsetY:source.stepTransform.offsetY*geometry.zoom}:undefined, sourceScaleMultiplier:scale, frameWidth:layout.frameWidth, frameHeight:layout.frameHeight });
  }
  const first = sources[0], multiplier = descriptor.scaleMultiplierPercent / 100;
  if (first && requestId === previewRequestId && previewPanelVisible()) {
    const bounds=effectPreviewGeometry(host,descriptor),scale=bounds.fitDiameterPx>0?bounds.fitDiameterPx/Math.min(first.frameWidth,first.frameHeight)
      :first.sourceScaleMultiplier*multiplier*V39_EFFECT_BASE_SCALE_PERCENT/100;
    const axes=resolveEffectPowerAxes(bounds);
    const sourceTransform=resolveEffectSourceTransform(first,{angleDeg:bounds.angleDeg},bounds);
    const stepScale=(Number(first.stepTransform?.scalePercent)||100)/100;
    renderGradientGuides(resolveEffectImpactPlacement({...bounds,...sourceTransform,screenScaleX:(first.stepTransform?.scaleXPercent ?? 100)/100,screenScaleY:(first.stepTransform?.scaleYPercent ?? 100)/100,width:(bounds.stretchAxis==='x'?bounds.stretchLengthPx:first.frameWidth*scale)*axes.x*stepScale,height:(bounds.stretchAxis==='y'?bounds.stretchLengthPx:first.frameHeight*scale)*axes.y*stepScale},first.stepTransform));
  }
  return sources;
}

function playPanelPreview() {
  if (!previewPanelVisible() || !previewPlayer || !selectedEffectName) return false;
  const descriptor = selectedPreviewDescriptor();
  if (!descriptor) {
    setStatus("プレビュー用エフェクトを解決できませんでした。", true);
    return false;
  }
  const scaleMultiplier = Math.max(0.1, Number(descriptor.scaleMultiplierPercent || 100) / 100);
  window.clearTimeout(previewReplayTimer);
  const requestId = ++previewRequestId;
  hideIdlePreview();
  previewPlaying = true;
  syncPlaybackControls();
  previewGame.loop.wake();
  setStatus(`${effectDisplayName()} を再生中…`);
  let playbackError = null;
  void previewSources(descriptor).then(sources => {
    if (requestId !== previewRequestId || !previewPanelVisible()) return false;
    return previewPlayer.play({
      ...effectPreviewGeometry(element("v39-effect-preview-stage"), descriptor),
      sequenceSources:sources,
      scalePercent:V39_EFFECT_BASE_SCALE_PERCENT * scaleMultiplier,
      tint:descriptor.tint,grayscaleBase:descriptor.grayscaleBase === true,brightnessPercent:descriptor.brightnessPercent,
      gradientEnabled:descriptor.gradientEnabled,
      gradientColorA:descriptor.gradientColorA,
      gradientColorB:descriptor.gradientColorB,
      gradientDirection:descriptor.gradientDirection,
      gradientMotionMode:descriptor.gradientMotionMode,
      gradientStartPercent:descriptor.gradientStartPercent,
      gradientEndPercent:descriptor.gradientEndPercent,
      gradientSpeedPercentPerSecond:descriptor.gradientSpeedPercentPerSecond,
      colorStrengthPercent:descriptor.colorStrengthPercent,
      renderStyle:"soft",
      showPreviousFrameGhost:true,
      totalDurationMs:Math.round(1500*100/previewSpeedPercent),
      sequenceGapMs:10,
      depth:10,
      displayName:"v39-effect-settings-preview",
      onError:error => { playbackError = error; },
      onFrame:renderGradientGuides
    });
  }).then(played => {
    // Replay only after the entire base + decoration sequence has finished.
    if (requestId !== previewRequestId || !previewPanelVisible()) return;
    previewPlaying = false;
    if (!played || playbackError) {
      loopRequested = false;
      syncPlaybackControls();
      sleepPreviewAfterRender();
      console.error("[エフェクト設定] 再生失敗", playbackError);
      showPreviewFailure("エフェクト再生に失敗しました。", playbackError || new Error("再生処理が false を返しました。"), descriptor);
      return;
    }
    setStatus(`${effectDisplayName()} の再生完了`);
    if (playbackMode === "loop" && loopRequested) {
      previewReplayTimer = window.setTimeout(playPanelPreview, 300);
      sleepPreviewAfterRender();
    }
    else if (playbackMode === "frame") void showPanelFrame();
    else void showIdlePreview();
  }).catch(error => {
    if (requestId !== previewRequestId) return;
    previewPlaying = false;
    loopRequested = false;
    syncPlaybackControls();
    sleepPreviewAfterRender();
    console.error("[エフェクト設定] 画面内プレビュー失敗", error);
    const source = error?.previewSource || previewSourceUrl(descriptor);
    setStatus(`画面内プレビューに失敗しました。\nURL: ${source}\n原因: ${previewErrorMessage(error)}`, true);
  });
  return true;
}

function schedulePanelPreview(delay = 80) {
  if (previewScheduleTimer) window.clearTimeout(previewScheduleTimer);
  previewScheduleTimer = window.setTimeout(() => {
    previewScheduleTimer = null;
    if (!previewPanelVisible()) return;
    if (loopRequested && playbackMode === "loop") {
      const requestId = previewRequestId;
      void ensurePreviewGame().then(() => { if (requestId === previewRequestId && loopRequested) playPanelPreview(); });
    } else if (playbackMode === "frame") void showPanelFrame();
    else {
      void showIdlePreview();
    }
    if (["color", "motion"].includes(activeSettingsTab) && playbackMode !== "frame") {
      const requestId = previewRequestId;
      const descriptor = selectedPreviewDescriptor();
      void ensurePreviewGame().then(() => {
        if (requestId === previewRequestId && previewPanelVisible()) return previewSources(descriptor);
      }).catch(error => {
        if (requestId === previewRequestId) showPreviewFailure("基準位置を読み込めませんでした。", error, descriptor);
      });
    }
  }, Math.max(0, Number(delay) || 0));
}

function ensurePreviewGame() {
  if (previewPlayer) return Promise.resolve(previewGame);
  if (previewBootPromise) return previewBootPromise;
  const host = element("v39-effect-preview-stage");
  if (!(host instanceof HTMLElement)) return Promise.resolve(null);

  previewBootPromise = import("phaser").then(module => {
    const Phaser = module.default || module;
    if (!document.body.contains(host)) return null;
    // Settings preview uses Canvas intentionally. The main field game keeps its own renderer.
    return new Promise(resolve => {
      previewGame = new Phaser.Game({
        type:Phaser.CANVAS,
        parent:host,
        width:PREVIEW_WIDTH,
        height:PREVIEW_HEIGHT,
        transparent:true,
        render:{ antialias:true, pixelArt:false, roundPixels:false },
        scene:{
          create:function createEffectSettingsPreviewScene() {
            previewPlayer = new V39AreaEffectPlayer(this, { totalDurationMs:1500, sequenceGapMs:10, depth:10 });
            host.classList.add("is-ready");
            if (!previewPanelVisible()) this.game.loop.sleep();
            resolve(this.game);
          }
        }
      });
    });
  }).catch(error => {
    previewBootPromise = null;
    console.error("[エフェクト設定] プレビュー初期化失敗", error);
    showPreviewFailure("プレビューの初期化に失敗しました。", error);
    return null;
  });
  return previewBootPromise;
}

function preparePreview() {
  void ensurePreviewGame().then(game => {
    if (!game || !previewPanelVisible()) return;
    const host = element("v39-effect-preview-stage");
    game.scale.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    schedulePanelPreview(0);
  });
}

function stopPanelPlayback() {
  previewRequestId += 1;
  window.clearTimeout(previewReplayTimer);
  window.clearTimeout(previewScheduleTimer);
  previewReplayTimer = null;
  previewScheduleTimer = null;
  previewPlayer?.stop();
  previewPlaying = false;
  loopRequested = false;
  hideIdlePreview();
  syncPlaybackControls();
  sleepPreviewAfterRender();
}

async function showPanelFrame() {
  if (!previewPanelVisible()) return;
  const requestId = ++previewRequestId;
  hideIdlePreview();
  previewPlaying = false;
  let descriptor = null;
  try {
    await ensurePreviewGame();
    if (!previewPanelVisible() || requestId !== previewRequestId) return;
    descriptor = selectedPreviewDescriptor();
    const frames = [];
    const sources = await previewSources(descriptor);
    if (requestId !== previewRequestId || !previewPanelVisible()) return;
    for (const source of sources) {
      const key = await previewPlayer.loadTexture(source.src);
      if (requestId !== previewRequestId) return;
      const image = previewGame.textures.get(key).getSourceImage();
      const layout = resolveEffectSheetLayout(image.width, image.height, previewPlayer.options);
      const range=resolveEffectFrameRange(layout.frameCount,source);
      for (let index = range.start; index <= range.end; index++) frames.push({ source, index });
    }
    previewFrameIndex = Math.max(0, Math.min(previewFrameIndex, frames.length - 1));
    const frame = frames[previewFrameIndex];
    const slider = element("v39-effect-frame-slider");
    slider.max = String(frames.length - 1);
    slider.value = String(previewFrameIndex);
    element("v39-effect-frame-count").textContent = `${previewFrameIndex + 1}/${frames.length}`;
    element("v39-effect-frame-prev").disabled = previewFrameIndex === 0;
    element("v39-effect-frame-next").disabled = previewFrameIndex === frames.length - 1;
    await previewPlayer.showFrame({ ...descriptor, sequenceSources:[frame.source], frameIndex:frame.index,
      ...effectPreviewGeometry(element("v39-effect-preview-stage"), descriptor),
      scalePercent:V39_EFFECT_BASE_SCALE_PERCENT * descriptor.scaleMultiplierPercent / 100,
      renderStyle:"soft", depth:10, displayName:"v39-effect-settings-preview", onFrame:renderGradientGuides
    });
    if (requestId === previewRequestId) sleepPreviewAfterRender();
  } catch (error) {
    if (requestId !== previewRequestId) return;
    console.error("[エフェクト設定] コマ表示失敗", error);
    const source = error?.previewSource || previewSourceUrl(descriptor);
    setStatus(`コマを表示できませんでした。\nURL: ${source}\n原因: ${previewErrorMessage(error)}`, true);
    sleepPreviewAfterRender();
  }
}

function renderSetting() {
  const resumeLoop = loopRequested && playbackMode === "loop";
  stopPanelPlayback();
  loopRequested = resumeLoop;
  syncPlaybackControls();
  const catalog = getV39EffectSettingsCatalog();
  if (!catalog.length) {
    setStatus("エフェクトカタログが空です。", true);
    return;
  }
  if (!isV39EffectSettingsTarget(selectedEffectName)) selectedEffectName = catalog[0];
  const setting = getV39EffectSetting(selectedEffectName);
  element("v39-effect-setting-orientation").value = setting.orientToAttack ? "attack" : "fixed";
  element("v39-effect-setting-placement").value = setting.placementMode;
  element("v39-effect-setting-area").value = setting.areaDisplay;
  element("v39-effect-setting-area-timing").value = setting.areaTiming;
  for (const suffix of ['', '-slider']) {
    const input = element('v39-effect-setting-area-delay' + suffix);
    input.value = setting.areaDelayMs;
    input.disabled = setting.areaTiming !== 'random' || setting.areaDisplay !== 'tiles' || setting.placementMode !== 'target';
  }
  element("v39-effect-setting-area-timing").disabled = setting.areaDisplay !== "tiles" || setting.placementMode !== "target";
  element("v39-effect-setting-area").disabled = setting.placementMode !== 'target';
  element("v39-effect-setting-power-axis").value = setting.powerScaleAxis;
  const beam=setting.placementMode!=='target';
  element("v39-effect-setting-orientation").disabled=beam;
  renderEffectPreviewCombatants(element("v39-effect-preview-stage"));
  rendering = true;
  try {
    const source = element("v39-effect-setting-source");
    const base = element("v39-effect-setting-base");
    const decoration = element("v39-effect-setting-decoration");
    const colorMode = element("v39-effect-setting-color-mode");
    const tint = element("v39-effect-setting-tint");
    const tintCode = element("v39-effect-setting-tint-code");
    const gradientA = element("v39-effect-setting-gradient-a");
    const gradientB = element("v39-effect-setting-gradient-b");
    const gradientACode = element("v39-effect-setting-gradient-a-code");
    const gradientBCode = element("v39-effect-setting-gradient-b-code");
    const gradientDirection = element("v39-effect-setting-gradient-direction");
    const gradientSpeed = element("v39-effect-setting-gradient-speed");
    const scale = element("v39-effect-setting-scale");
    const count = setting.sequenceSteps.length || 1;
    activeSequenceIndex = Math.max(-1,Math.min(activeSequenceIndex,count-1));
    if (activeSequenceIndex < 0) selectedPreviewOnly = false;
    element('v39-effect-settings-panel').dataset.sequenceScope = activeSequenceIndex < 0 ? 'common' : 'step';
    const scope = element('v39-effect-preview-scope');
    scope.disabled = activeSequenceIndex < 0;
    scope.value = selectedPreviewOnly ? 'selected' : 'all';
    renderV39EffectSequenceEditor(element('v39-effect-sequence-list'),setting,getV39EffectSettingsCatalog(),(steps,index,{live=false}={})=>{
      activeSequenceIndex = index;
      const previousRendering=rendering;
      if(live)rendering=true;
      try {updateV39EffectSetting(selectedEffectName,{sequenceSteps:steps,baseEffect:steps[0].effectName});}
      finally {rendering=previousRendering;}
      if(live)schedulePanelPreview(0);else renderSetting();
    }, {tabsHost:element('v39-effect-sequence-tabs'),activeIndex:activeSequenceIndex,impactEditing,onPickImage:(index,selected,onSelect)=>{
      const key=sequenceEditorKey;
      openEffectImagePicker({catalog:getV39EffectSettingsCatalog(),selected,returnFocus:element('v39-effect-sequence-list').querySelector('select'),
        onSelect:name=>{if(key===sequenceEditorKey && index===activeSequenceIndex){onSelect(name);element('v39-effect-sequence-list').querySelector('select')?.focus();}}});
    },onSetImpactPreview:editing=>{
      impactEditing=editing;pickingImpact=false;selectedPreviewOnly=true;previewBounds=null;
      playbackMode='frame';
      renderSetting();schedulePanelPreview(0);
      setStatus(editing?'基準点編集：画像上の十字をドラッグしてください。':'着弾確認：編集時と同じ位置・同じコマです。');
    },onPickImpact:index=>{
      impactEditing=true;activeSequenceIndex=index;selectedPreviewOnly=true;pickingImpact=true;previewBounds=null;playbackMode='frame';
      renderSetting();schedulePanelPreview(0);setStatus('プレビュー画像の着弾箇所をタップしてください。');
    },onSelect:index=>{
      pickingImpact=false;activeSequenceIndex = index;selectedPreviewOnly=index>=0;previewFrameIndex = 0;
      switchSettingsTab('basic'); renderSetting();
    }});
    if (source) source.value = selectedEffectName;
    if (base) base.value = setting.baseEffect;
    element('v39-effect-setting-hit-mode').value=setting.hitEffectMode || 'none';
    const hitSelect=element('v39-effect-setting-hit-name');
    hitSelect.replaceChildren();
    const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='選択してください';hitSelect.append(placeholder);
    for(const name of getV39EffectSettingsCatalog()){const option=document.createElement('option');option.value=name;option.textContent=name;hitSelect.append(option);}
    hitSelect.value=setting.hitEffectName || '';
    element('v39-effect-hit-specific').hidden=setting.hitEffectMode!=='specified';
    if (decoration) decoration.value = setting.decorationEffect;
    for(const id of ['v39-effect-setting-brightness','v39-effect-setting-brightness-slider'])element(id).value=String(setting.brightnessPercent ?? 100);
    element('v39-effect-setting-grayscale').value=setting.grayscaleBase?'mono':'original';
    if (colorMode) colorMode.value = setting.gradientEnabled ? "gradient" : setting.tint ? "tint" : "none";
    if (tint) tint.value = setting.tint || "#FFFFFF";
    if (tintCode) tintCode.textContent = setting.tint || "なし";
    if (gradientA) gradientA.value = setting.gradientColorA;
    if (gradientB) gradientB.value = setting.gradientColorB;
    if (gradientACode) gradientACode.textContent = setting.gradientColorA;
    if (gradientBCode) gradientBCode.textContent = setting.gradientColorB;
    if (gradientDirection) gradientDirection.value = setting.gradientDirection;
    element("v39-effect-setting-gradient-motion-mode").value = setting.gradientMotionMode;
    for (const [id, value] of [["gradient-start", setting.gradientStartPercent], ["gradient-end", setting.gradientEndPercent], ["strength", setting.colorStrengthPercent]]) {
      element(`v39-effect-setting-${id}`).value = String(value);
      element(`v39-effect-setting-${id}-slider`).value = String(value);
    }
    if (gradientSpeed) gradientSpeed.value = String(setting.gradientSpeedPercentPerSecond);
    if (scale) scale.value = String(setting.scaleMultiplierPercent);
    applyColorControlState(setting);
    switchSettingsTab(activeSettingsTab);
    setStatus(`自動保存: ON / 変更済み ${settingCount()}件`);
    schedulePanelPreview();
  } finally {
    rendering = false;
  }
}

function saveCurrentSetting() {
  if (rendering || !selectedEffectName) return;
  const colorMode = element("v39-effect-setting-color-mode")?.value;
  const tintEnabled = colorMode === "tint";
  const tintValue = tintEnabled ? element("v39-effect-setting-tint")?.value : "";
  rendering = true;
  try { updateV39EffectSetting(selectedEffectName, {
    baseEffect:element("v39-effect-setting-base")?.value,
    sequenceSteps:getV39EffectSetting(selectedEffectName).sequenceSteps.map((step,index)=>index===0?{...step,effectName:element("v39-effect-setting-base").value}:step),
    orientToAttack:element("v39-effect-setting-orientation")?.value === "attack",
    areaDisplay:element("v39-effect-setting-area").value,
    areaTiming:element("v39-effect-setting-area-timing").value,
    areaDelayMs:element("v39-effect-setting-area-delay").value,
    placementMode:element("v39-effect-setting-placement").value,
    powerScaleAxis:element("v39-effect-setting-power-axis").value,
    decorationEffect:element("v39-effect-setting-decoration")?.value,
    tint:tintValue,
    grayscaleBase:element("v39-effect-setting-grayscale").value === "mono",
    brightnessPercent:element("v39-effect-setting-brightness").value,
    gradientEnabled:colorMode === "gradient",
    gradientColorA:element("v39-effect-setting-gradient-a")?.value,
    gradientColorB:element("v39-effect-setting-gradient-b")?.value,
    gradientDirection:element("v39-effect-setting-gradient-direction")?.value,
    gradientMotionMode:element("v39-effect-setting-gradient-motion-mode")?.value,
    gradientStartPercent:element("v39-effect-setting-gradient-start")?.value,
    gradientEndPercent:element("v39-effect-setting-gradient-end")?.value,
    colorStrengthPercent:element("v39-effect-setting-strength")?.value,
    gradientSpeedPercentPerSecond:element("v39-effect-setting-gradient-speed")?.value,
    scaleMultiplierPercent:element("v39-effect-setting-scale")?.value
  }); } finally { rendering = false; }
  renderSetting();
}

function previewCurrentEffectOnMap() {
  const map = window.__v39FieldRuntime?.mapData;
  const play = window.playV39MapEffect;
  if (!map || typeof play !== "function") {
    setStatus("実マップ確認はマップ生成後に使用できます。", true);
    return;
  }
  const geometry=getV39EffectPreviewMapRequest(map);
  if(!geometry){setStatus('指定距離がマップ外です。距離を小さくしてください。',true);return;}
  setStatus(`${effectDisplayName()} を指定距離・${geometry.areaTiles.length}マスの範囲で再生します。`);
  closePanel();
  void Promise.resolve(play({
    effectName:selectedEffectName,
    previewSequenceIndex:selectedPreviewOnly && activeSequenceIndex>=0 ? activeSequenceIndex : undefined,
    ...geometry,
    allowInFog:true,
    scalePercent:50
  })).catch(error => {
    console.error("[エフェクト設定] 実マップ確認失敗", error);
    setStatus("実マップ確認に失敗しました。", true);
  });
}

function exportJson() {
  const payload = { ...getV39EffectSettingsSnapshot(), exportedAt:new Date().toISOString() };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type:"application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "v39-effect-settings.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus(`JSONを書き出しました。変更済み ${settingCount()}件`);
}

async function importJsonFile(file) {
  if (!(file instanceof File)) return;
  try {
    const result = importV39EffectSettings(await file.text());
    renderSetting();
    setStatus(`JSONを読み込みました。反映 ${result.importedCount}件 / 未登録名をスキップ ${result.skippedCount}件`);
  } catch (error) {
    console.error("[エフェクト設定] JSON読み込み失敗", error);
    setStatus(`JSON読み込み失敗: ${String(error?.message || error)}`, true);
  }
}

function openPanel(options = {}) {
  const menu = element("v39-manage-menu");
  const displayPanel = element("v39-display-settings-panel");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  if (panel.hidden) returnFocus = document.activeElement;
  element("v39-effect-settings-back").textContent = options.returnTo === "title" ? "← タイトル" : "← 管理";
  element("v39-effect-settings-host").hidden = false;
  if (displayPanel) {
    displayPanel.hidden = true;
    displayPanel.setAttribute("aria-hidden", "true");
  }
  menu.hidden = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  renderSetting();
  preparePreview();
  element("v39-effect-settings-back").focus({preventScroll:true});
}

function closePanel() {
  const menu = element("v39-manage-menu");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  stopPanelPlayback();
  element("v39-effect-settings-host").hidden = true;
  menu.hidden = false;
  closeHandler?.();
  if (returnFocus?.isConnected) returnFocus.focus({preventScroll:true});
  returnFocus = null;
}

function bindControls() {
  for (const id of ["area-delay"]) {
    for (const suffix of ["", "-slider"]) element(`v39-effect-setting-${id}${suffix}`).addEventListener("input", event => {
      element(`v39-effect-setting-${id}`).value = event.target.value;
      saveCurrentSetting();
    });
  }
  element("v39-effect-setting-orientation").addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-area-timing").addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-area").addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-placement").addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-power-axis").addEventListener("change", saveCurrentSetting);
  const updatePreviewGeometry = () => {
    const resumeLoop = loopRequested;
    stopPanelPlayback();
    loopRequested = resumeLoop;
    syncPlaybackControls();
    renderEffectPreviewCombatants(element("v39-effect-preview-stage"));
    schedulePanelPreview(0);
    window.dispatchEvent(new CustomEvent("v39:effect-preview-direction-changed"));
  };
  for(const id of ["direction","distance","shape","radius","zoom","power"])element(`v39-effect-preview-${id}`).addEventListener("change",updatePreviewGeometry);
  element("v39-effect-preview-fit").addEventListener("click",()=>{
    element("v39-effect-preview-zoom").value=String(Math.floor(effectPreviewGeometry(element("v39-effect-preview-stage")).fitZoom*100));
    updatePreviewGeometry();
  });
  installV39EffectImpactDrag(element('v39-effect-preview-stage'),{
    getContext:()=>{
      if(activeSequenceIndex<0 || !previewBounds || !previewGame?.scale)return null;
      if(!selectedPreviewOnly || !impactEditing){
        impactEditing=true;
        selectedPreviewOnly=true;playbackMode='frame';renderSetting();schedulePanelPreview(0);
        setStatus('基準点編集に切り替えました。十字をドラッグしてください。');return null;
      }
      pickingImpact=false;draggingImpact=true;
      return {bounds:previewBounds,width:previewGame.scale.width,height:previewGame.scale.height,
        index:activeSequenceIndex,effect:selectedEffectName};
    },
    onPreview:point=>{
      const marker=element('v39-effect-impact-marker');
      if(marker){marker.style.left=(point.x/previewGame.scale.width*100)+'%';marker.style.top=(point.y/previewGame.scale.height*100)+'%';}
    },
    onCommit:(value,context)=>{
      draggingImpact=false;
      if(context.effect!==selectedEffectName || context.index!==activeSequenceIndex){renderGradientGuides();return;}
      const steps=resolveV39EffectSequence({...getV39EffectSetting(selectedEffectName),decorationEffect:''});
      if(!steps[context.index])return;
      Object.assign(steps[context.index],value);updateV39EffectSetting(selectedEffectName,{sequenceSteps:steps});
      renderSetting();schedulePanelPreview(0);setStatus('着弾基準点を保存しました。');
    },
    onCancel:()=>{draggingImpact=false;renderGradientGuides();}
  });
  element('v39-effect-preview-stage').addEventListener('pointerdown',event=>{
    if(!pickingImpact || activeSequenceIndex<0 || !previewBounds || event.target.closest?.('.v39-effect-preview-camera'))return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=element('v39-effect-preview-stage').getBoundingClientRect();
    const point={x:(event.clientX-rect.left)*previewGame.scale.width/rect.width,y:(event.clientY-rect.top)*previewGame.scale.height/rect.height};
    const steps=resolveV39EffectSequence({...getV39EffectSetting(selectedEffectName),decorationEffect:''});
    if(!steps[activeSequenceIndex])return;
    Object.assign(steps[activeSequenceIndex],resolveEffectImpactPercent(previewBounds,point));
    pickingImpact=false;updateV39EffectSetting(selectedEffectName,{sequenceSteps:steps});renderSetting();schedulePanelPreview(0);
    setStatus('着弾基準点を保存しました。');
  },true);
  new ResizeObserver(() => { renderEffectPreviewCombatants(element("v39-effect-preview-stage")); schedulePanelPreview(0); window.dispatchEvent(new CustomEvent("v39:effect-preview-direction-changed")); })
    .observe(element("v39-effect-preview-stage"));
  element("v39-manage-effect-settings")?.addEventListener("click", openPanel);
  element("v39-effect-settings-back")?.addEventListener("click", closePanel);
  for (const button of document.querySelectorAll("[data-v39-effect-tab]")) {
    button.addEventListener("click", () => switchSettingsTab(button.dataset.v39EffectTab));
  }
  element("v39-effect-preview-scope").addEventListener("change", event => {
    selectedPreviewOnly = event.target.value === "selected"; previewFrameIndex = 0; renderSetting();
  });
  element("v39-effect-setting-source")?.addEventListener("change", event => {
    activeSequenceIndex = -1; selectedPreviewOnly = false; sequenceEditorKey = event.target.value;
    selectedEffectName = event.target.value;
    previewFrameIndex = 0;
    renderSetting();
  });
  element("v39-effect-setting-base")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-decoration")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-color-mode")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-tint")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-gradient-a")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-gradient-b")?.addEventListener("input", saveCurrentSetting);
  for (const id of ["tint", "gradient-a", "gradient-b"]) {
    element(`v39-effect-setting-${id}-preset`).addEventListener("change", event => {
      if (!event.target.value) {
        element(`v39-effect-setting-${id}`).click();
        return;
      }
      element(`v39-effect-setting-${id}`).value = event.target.value;
      saveCurrentSetting();
    });
  }
  element("v39-effect-setting-gradient-direction")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-gradient-motion-mode")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-gradient-speed")?.addEventListener("change", saveCurrentSetting);
  for (const id of ["gradient-start", "gradient-end", "strength"]) {
    for (const suffix of ["", "-slider"]) element(`v39-effect-setting-${id}${suffix}`).addEventListener("input", event => {
      element(`v39-effect-setting-${id}`).value = event.target.value;
      const start = element("v39-effect-setting-gradient-start"), end = element("v39-effect-setting-gradient-end");
      if (Number(start.value) > Number(end.value)) {
        if (id === "gradient-start") end.value = start.value;
        else start.value = end.value;
      }
      saveCurrentSetting();
    });
  }
  element("v39-effect-setting-scale")?.addEventListener("change", saveCurrentSetting);
  const startPlayback = () => {
    stopPanelPlayback();
    if (playbackMode === "full-image") { void showIdlePreview(); return; }
    loopRequested = playbackMode === "loop";
    syncPlaybackControls();
    const requestId = previewRequestId;
    void ensurePreviewGame().then(() => { if (requestId === previewRequestId) playPanelPreview(); });
  };
  element("v39-effect-setting-preview-local")?.addEventListener("click", startPlayback);
  element("v39-effect-setting-preview-lower")?.addEventListener("click", () => {
    if (loopRequested && playbackMode === "loop") {
      stopPanelPlayback();
      schedulePanelPreview(0);
    } else startPlayback();
  });
  element("v39-effect-playback-mode")?.addEventListener("change", event => {
    stopPanelPlayback();
    playbackMode = event.target.value;
    element("v39-effect-frame-controls").hidden = playbackMode !== "frame";
    if (playbackMode === "frame") void showPanelFrame();
    else schedulePanelPreview(0);
  });
  element("v39-effect-frame-slider")?.addEventListener("input", event => {
    previewFrameIndex = Number(event.target.value);
    void showPanelFrame();
  });
  for (const [id, offset] of [["v39-effect-frame-prev", -1], ["v39-effect-frame-next", 1]]) {
    element(id)?.addEventListener("click", () => {
      previewFrameIndex += offset;
      void showPanelFrame();
    });
  }
  element("v39-effect-setting-preview")?.addEventListener("click", previewCurrentEffectOnMap);
  element("v39-effect-setting-reset")?.addEventListener("click", () => {
    if (editorActions.reset) { editorActions.reset(); return; }
    if (!selectedEffectName) return;
    resetV39EffectSetting(selectedEffectName);
    renderSetting();
    setStatus(`${selectedEffectName} を初期設定へ戻しました。`);
  });
  element("v39-effect-settings-export")?.addEventListener("click", () => (editorActions.exportJson || exportJson)());
  element("v39-effect-settings-import")?.addEventListener("click", () => element("v39-effect-settings-file")?.click());
  element("v39-effect-settings-file")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    void (editorActions.importJsonFile || importJsonFile)(file);
    event.target.value = "";
  });
  window.addEventListener("v39:effect-settings-changed", () => {
    if (!rendering && !element("v39-effect-settings-panel")?.hidden) renderSetting();
  });
}

function install() {
  const catalog = getV39EffectSettingsCatalog();
  if (!catalog.length) {
    console.warn("[エフェクト設定] カタログ初期化前のため画面を作成できませんでした");
    return;
  }
  selectedEffectName = catalog[0];
  installStyles();
  ensureMenuEntry();
  ensurePanel();
  fillSelect(element("v39-effect-setting-source"), catalog);
  fillSelect(element("v39-effect-setting-base"), catalog);
  installEffectImagePicker();
  for(const id of ['v39-effect-setting-brightness','v39-effect-setting-brightness-slider'])element(id).addEventListener('input',event=>{
    if(event.target.value.trim()==='' || !Number.isFinite(Number(event.target.value)))return;
    const value=Math.min(200,Math.max(0,Number(event.target.value)));
    element('v39-effect-setting-brightness').value=String(value);element('v39-effect-setting-brightness-slider').value=String(value);
    const previous=rendering;rendering=true;
    try{updateV39EffectSetting(selectedEffectName,{brightnessPercent:value});}finally{rendering=previous;}
    schedulePanelPreview(0);
  });
  element("v39-effect-setting-grayscale").addEventListener("change",saveCurrentSetting);
  element('v39-effect-setting-hit-mode').addEventListener('change',event=>updateV39EffectSetting(selectedEffectName,{hitEffectMode:event.target.value}));
  element('v39-effect-setting-hit-name').addEventListener('change',event=>updateV39EffectSetting(selectedEffectName,{hitEffectName:event.target.value}));
  element('v39-effect-hit-image-picker').addEventListener('click',()=>{
    const key=sequenceEditorKey,name=selectedEffectName;
    openEffectImagePicker({catalog:getV39EffectSettingsCatalog(),selected:getV39EffectSetting(name).hitEffectName,
      returnFocus:element('v39-effect-hit-image-picker'),onSelect:hitEffectName=>{
        if(key===sequenceEditorKey && name===selectedEffectName)updateV39EffectSetting(name,{hitEffectMode:'specified',hitEffectName});
      }});
  });
  fillSelect(element("v39-effect-setting-decoration"), catalog, { includeNone:true });
  bindControls();
  installV39EffectHeaderCollapse({ panel:element('v39-effect-settings-panel'),toggle:element('v39-effect-preview-header-toggle'),storage:window.localStorage,
    compact:window.matchMedia('(max-width:600px)').matches,onChange:()=>window.requestAnimationFrame(()=>{
      renderEffectPreviewCombatants(element('v39-effect-preview-stage'));schedulePanelPreview(0);
    }) });
  switchSettingsTab(activeSettingsTab);
  renderSetting();
  window.openV39EffectSettings = openPanel;
  window.closeV39EffectSettings = closePanel;
  window.refreshV39EffectSettingsPreview = () => {
    if (previewPanelVisible()) schedulePanelPreview(0);
  };
  window.addEventListener('v39:display-settings-changed',event=>{
    if(event.detail?.changedKeys?.includes('effectPowerScale')&&previewPanelVisible()){
      renderEffectPreviewCombatants(element('v39-effect-preview-stage'));
      schedulePanelPreview(0);
    }
  });
}

install();
