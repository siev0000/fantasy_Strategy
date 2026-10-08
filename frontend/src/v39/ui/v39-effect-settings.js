import { PhaserEffectPlayer, resolveEffectSheetLayout } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { resolveV39EffectPlaybackDescriptor } from "../combat/v39-effect-player.js";
import {
  V39_EFFECT_GRADIENT_SPEED_MAX,
  V39_EFFECT_GRADIENT_SPEED_MIN,
  V39_EFFECT_SCALE_MAX,
  V39_EFFECT_SCALE_MIN,
  getV39EffectSetting,
  getV39EffectSettingsCatalog,
  getV39EffectSettingsSnapshot,
  importV39EffectSettings,
  resetV39EffectSetting,
  updateV39EffectSetting
} from "../../lib/v39-effect-settings.js";

const PREVIEW_WIDTH = 480;
const PREVIEW_HEIGHT = 280;
const PREVIEW_BASE_SCALE_PERCENT = 55;
const PREVIEW_MODE_STORAGE_KEY = "v39-effect-preview-mode-v1";
const PREVIEW_MODES = Object.freeze(["animation", "first-frame", "full-image"]);
const SETTINGS_TABS = Object.freeze(["basic", "color", "motion", "data"]);

let selectedEffectName = "";
let activeSettingsTab = "basic";
let previewMode = loadPreviewMode();
let rendering = false;
let previewGame = null;
let previewPlayer = null;
let previewBootPromise = null;
let previewReplayTimer = null;
let previewScheduleTimer = null;
let previewPlaybackPromise = null;
let previewPlaybackQueued = false;
let previewGeneration = 0;
const previewImageCache = new Map();

function element(id) {
  return document.getElementById(id);
}

function loadPreviewMode() {
  try {
    const stored = localStorage.getItem(PREVIEW_MODE_STORAGE_KEY);
    return PREVIEW_MODES.includes(stored) ? stored : "animation";
  } catch {
    return "animation";
  }
}

function savePreviewMode(value) {
  previewMode = PREVIEW_MODES.includes(value) ? value : "animation";
  try { localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, previewMode); } catch { /* noop */ }
}

function installStyles() {
  if (element("v39-effect-settings-style")) return;
  const style = document.createElement("style");
  style.id = "v39-effect-settings-style";
  style.textContent = `
    #v39-effect-settings-panel{height:100%;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(220px,42%) minmax(0,1fr);background:#0e171b;color:#e7efec}
    #v39-effect-settings-panel[hidden]{display:none!important}
    .v39-effect-settings-head{min-height:42px;display:flex;align-items:center;gap:8px;padding:5px 7px;border-bottom:1px solid #3a4c53;background:#142126}
    .v39-effect-settings-head strong{font-size:var(--font-body)}
    .v39-effect-settings-back{min-height:34px;border:1px solid #4b626b;border-radius:6px;background:#18282e;color:#e8f2f0;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    .v39-effect-preview-pane{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);gap:7px;padding:7px;border-bottom:1px solid #354950;background:linear-gradient(180deg,#101b20,#0a1115)}
    .v39-effect-preview-toolbar{display:grid;grid-template-columns:minmax(0,1fr) minmax(132px,.55fr) auto;align-items:center;gap:7px;min-width:0}
    .v39-effect-preview-selector{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;color:#c8d6d7;font-size:var(--font-secondary);font-weight:800}
    .v39-effect-preview-selector select,.v39-effect-preview-mode{width:100%;min-width:0;min-height:38px;border:1px solid #536a72;border-radius:7px;background:#0b1519;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-preview-replay{min-height:38px;border:1px solid #4f6b74;border-radius:7px;background:#173039;color:#eef8f5;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    #v39-effect-preview-stage{position:relative;min-height:0;overflow:hidden;border:1px solid #31464d;border-radius:10px;background:radial-gradient(circle at 50% 50%,rgba(50,76,84,.34),rgba(5,10,13,.98) 68%);box-shadow:inset 0 0 28px rgba(0,0,0,.5)}
    #v39-effect-preview-stage::before,#v39-effect-preview-stage::after{content:"";position:absolute;z-index:0;pointer-events:none;background:rgba(119,161,170,.1)}
    #v39-effect-preview-stage::before{left:50%;top:8%;bottom:8%;width:1px}
    #v39-effect-preview-stage::after{top:50%;left:8%;right:8%;height:1px}
    #v39-effect-static-preview{position:absolute;z-index:1;inset:0;width:100%;height:100%;display:block}
    #v39-effect-preview-stage canvas:not(#v39-effect-static-preview){position:absolute!important;z-index:2;inset:0;display:block!important;width:100%!important;height:100%!important;object-fit:contain;background:transparent!important}
    .v39-effect-preview-placeholder{position:absolute;z-index:3;inset:0;display:grid;place-items:center;color:#83999d;font-size:var(--font-secondary);pointer-events:none}
    #v39-effect-preview-stage.is-ready .v39-effect-preview-placeholder{display:none}
    .v39-effect-settings-lower{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#0d161a}
    .v39-effect-settings-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));border-bottom:1px solid #354950;background:#111d22}
    .v39-effect-settings-tab{min-width:0;min-height:42px;border:0;border-right:1px solid #2b3c42;background:#111d22;color:#9eb0b3;padding:5px 3px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    .v39-effect-settings-tab:last-child{border-right:0}.v39-effect-settings-tab[aria-selected="true"]{background:#1b343b;color:#eff9f7;box-shadow:inset 0 -2px #70c5d2}
    .v39-effect-settings-body{min-height:0;overflow:hidden}
    .v39-effect-settings-tabpanel{height:100%;min-height:0;overflow:auto;padding:7px;display:grid;gap:7px;align-content:start;overscroll-behavior:contain}
    .v39-effect-settings-tabpanel[hidden]{display:none!important}
    .v39-effect-settings-note{margin:0;padding:7px 8px;border:1px solid #31464d;border-radius:7px;background:#101d22;color:#aebec1;font-size:var(--font-secondary);line-height:1.45}
    .v39-effect-setting-row{display:grid;grid-template-columns:minmax(105px,.7fr) minmax(0,1.3fr);align-items:center;gap:7px;padding:7px 8px;border:1px solid #33474e;border-radius:7px;background:#111d22}
    .v39-effect-setting-row>span:first-child{font-size:var(--font-secondary);font-weight:800;color:#c7d4d5}
    .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"]{width:100%;min-width:0;min-height:38px;border:1px solid #50646b;border-radius:6px;background:#0d171b;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-setting-row input:disabled,.v39-effect-setting-row select:disabled{opacity:.45;cursor:not-allowed}
    .v39-effect-tint-controls{display:grid;grid-template-columns:auto 52px minmax(0,1fr);align-items:center;gap:7px}
    .v39-effect-tint-controls input[type="checkbox"],.v39-effect-gradient-switch input[type="checkbox"]{width:20px;height:20px}
    .v39-effect-tint-controls input[type="color"]{width:50px;height:38px;padding:2px;border:1px solid #50646b;border-radius:6px;background:#0d171b}
    .v39-effect-tint-code{color:#a9b8ba;font-size:var(--font-secondary);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
    .v39-effect-gradient-switch{display:flex;align-items:center;gap:8px;min-height:38px;color:#dce8e6;font-size:var(--font-secondary);font-weight:800}
    .v39-effect-gradient-speed{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px}
    .v39-effect-gradient-speed small{color:#9fb0b3;font-size:var(--font-secondary);white-space:nowrap}
    .v39-effect-settings-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
    .v39-effect-settings-actions button{min-height:42px;border:1px solid #49646d;border-radius:7px;background:#173039;color:#eef8f5;padding:6px 8px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    .v39-effect-settings-actions button:hover,.v39-effect-preview-replay:hover{background:#1d424b;border-color:#76cedb}
    #v39-effect-settings-status{min-height:28px;margin:0;padding:5px 8px;border-top:1px solid #293b41;background:#0a1216;color:#a9bdc0;font-size:var(--font-secondary);line-height:1.4}
    #v39-effect-settings-status.is-error{color:#f3a092;background:#2c1715}
    @media(max-width:600px){
      #v39-effect-settings-panel{grid-template-rows:auto minmax(220px,42dvh) minmax(0,1fr)}
      .v39-effect-settings-head{min-height:40px;padding:4px 6px}
      .v39-effect-preview-pane{padding:5px;gap:5px}
      .v39-effect-preview-toolbar{grid-template-columns:minmax(0,1fr) minmax(116px,.62fr);grid-template-areas:"effect mode" "replay replay"}
      .v39-effect-preview-selector{grid-area:effect;grid-template-columns:1fr;gap:3px}.v39-effect-preview-selector>span{display:none}
      .v39-effect-preview-mode{grid-area:mode}.v39-effect-preview-replay{grid-area:replay}
      .v39-effect-preview-selector select,.v39-effect-preview-mode,.v39-effect-preview-replay{min-height:40px}
      .v39-effect-settings-tab{min-height:44px;font-size:var(--font-compact)}
      .v39-effect-settings-tabpanel{padding:6px}
      .v39-effect-setting-row{grid-template-columns:1fr;gap:5px;padding:7px}
      .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"]{min-height:40px}
      .v39-effect-settings-actions button{min-height:44px}
    }
    @media(max-height:620px){#v39-effect-settings-panel{grid-template-rows:auto minmax(180px,38dvh) minmax(0,1fr)}}
  `;
  document.head.appendChild(style);
}

function createOption(value, label = value) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  return option;
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
    </header>
    <section class="v39-effect-preview-pane" aria-label="エフェクトプレビュー">
      <div class="v39-effect-preview-toolbar">
        <label class="v39-effect-preview-selector"><span>対象</span><select id="v39-effect-setting-source" aria-label="対象エフェクト"></select></label>
        <select id="v39-effect-preview-mode" class="v39-effect-preview-mode" aria-label="プレビュー表示方式">
          <option value="animation">アニメ再生</option>
          <option value="first-frame">1枚目固定</option>
          <option value="full-image">元画像全体</option>
        </select>
        <button type="button" id="v39-effect-setting-preview-local" class="v39-effect-preview-replay">▶ 再生 / 更新</button>
      </div>
      <div id="v39-effect-preview-stage">
        <canvas id="v39-effect-static-preview" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" aria-label="エフェクト静止プレビュー"></canvas>
        <div class="v39-effect-preview-placeholder">プレビューを準備中…</div>
      </div>
    </section>
    <section class="v39-effect-settings-lower">
      <nav class="v39-effect-settings-tabs" aria-label="設定カテゴリ" role="tablist">
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="basic" role="tab" aria-selected="true">基本</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="color" role="tab" aria-selected="false">色</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="motion" role="tab" aria-selected="false">動き</button>
        <button type="button" class="v39-effect-settings-tab" data-v39-effect-tab="data" role="tab" aria-selected="false">保存</button>
      </nav>
      <div class="v39-effect-settings-body">
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="basic" role="tabpanel">
          <label class="v39-effect-setting-row"><span>基本形状</span><select id="v39-effect-setting-base"></select></label>
          <label class="v39-effect-setting-row"><span>追加装飾</span><select id="v39-effect-setting-decoration"></select></label>
          <label class="v39-effect-setting-row"><span>基準Scale倍率</span><input type="number" id="v39-effect-setting-scale" min="${V39_EFFECT_SCALE_MIN}" max="${V39_EFFECT_SCALE_MAX}" step="5" value="100"></label>
          <div class="v39-effect-settings-actions"><button type="button" id="v39-effect-setting-reset">↺ この設定を初期化</button></div>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="color" role="tabpanel" hidden>
          <label class="v39-effect-setting-row"><span>Tint / 単色</span><span class="v39-effect-tint-controls"><input type="checkbox" id="v39-effect-setting-tint-enabled" aria-label="Tintを使用"><input type="color" id="v39-effect-setting-tint" value="#FFFFFF"><output id="v39-effect-setting-tint-code" class="v39-effect-tint-code">なし</output></span></label>
          <label class="v39-effect-setting-row"><span>グラデーション</span><span class="v39-effect-gradient-switch"><input type="checkbox" id="v39-effect-setting-gradient-enabled">2色グラデーションを使用</span></label>
          <label class="v39-effect-setting-row"><span>グラデーション色A</span><span class="v39-effect-tint-controls"><span></span><input type="color" id="v39-effect-setting-gradient-a" value="#FF3B1F"><output id="v39-effect-setting-gradient-a-code" class="v39-effect-tint-code">#FF3B1F</output></span></label>
          <label class="v39-effect-setting-row"><span>グラデーション色B</span><span class="v39-effect-tint-controls"><span></span><input type="color" id="v39-effect-setting-gradient-b" value="#FFD54A"><output id="v39-effect-setting-gradient-b-code" class="v39-effect-tint-code">#FFD54A</output></span></label>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="motion" role="tabpanel" hidden>
          <label class="v39-effect-setting-row"><span>移動方向</span><select id="v39-effect-setting-gradient-direction"><option value="up">上へ</option><option value="down">下へ</option><option value="left">左へ</option><option value="right">右へ</option></select></label>
          <label class="v39-effect-setting-row"><span>移動速度</span><span class="v39-effect-gradient-speed"><input type="number" id="v39-effect-setting-gradient-speed" min="${V39_EFFECT_GRADIENT_SPEED_MIN}" max="${V39_EFFECT_GRADIENT_SPEED_MAX}" step="10" value="80"><small>% / 秒</small></span></label>
          <p class="v39-effect-settings-note">グラデーションがOFFの場合、移動方向と速度は無効になります。</p>
        </section>
        <section class="v39-effect-settings-tabpanel" data-v39-effect-panel="data" role="tabpanel" hidden>
          <p class="v39-effect-settings-note">変更はブラウザ内へ自動保存され、戦闘再生へ即時反映されます。プレビュー表示方式は編集画面だけの設定で、ゲーム側のJSONには含めません。</p>
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
  manage.appendChild(panel);
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

function switchSettingsTab(tabName) {
  const next = SETTINGS_TABS.includes(tabName) ? tabName : "basic";
  activeSettingsTab = next;
  for (const button of document.querySelectorAll("[data-v39-effect-tab]")) {
    button.setAttribute("aria-selected", button.dataset.v39EffectTab === next ? "true" : "false");
  }
  for (const panel of document.querySelectorAll("[data-v39-effect-panel]")) {
    panel.hidden = panel.dataset.v39EffectPanel !== next;
  }
}

function applyColorControlState(setting) {
  const gradientEnabled = setting?.gradientEnabled === true;
  const tintEnabled = element("v39-effect-setting-tint-enabled");
  const tint = element("v39-effect-setting-tint");
  const tintCode = element("v39-effect-setting-tint-code");
  if (tintEnabled) tintEnabled.disabled = gradientEnabled;
  if (tint) tint.disabled = gradientEnabled || tintEnabled?.checked !== true;
  if (tintCode && gradientEnabled) tintCode.textContent = "グラデーション優先";
  for (const id of ["v39-effect-setting-gradient-a","v39-effect-setting-gradient-b","v39-effect-setting-gradient-direction","v39-effect-setting-gradient-speed"]) {
    const control = element(id);
    if (control) control.disabled = !gradientEnabled;
  }
}

function previewPanelVisible() {
  const panel = element("v39-effect-settings-panel");
  return panel instanceof HTMLElement && panel.hidden === false && panel.getAttribute("aria-hidden") !== "true";
}

function hexToCss(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function loadPreviewImage(src) {
  if (!src) return Promise.reject(new Error("プレビュー画像URLがありません"));
  if (previewImageCache.has(src)) return previewImageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`プレビュー画像を読み込めません: ${src}`));
    image.src = src;
  });
  previewImageCache.set(src, promise);
  return promise;
}

function previewGradient(context, descriptor) {
  const direction = descriptor.gradientDirection || "up";
  if (direction === "left") return context.createLinearGradient(PREVIEW_WIDTH, 0, 0, 0);
  if (direction === "right") return context.createLinearGradient(0, 0, PREVIEW_WIDTH, 0);
  if (direction === "down") return context.createLinearGradient(0, 0, 0, PREVIEW_HEIGHT);
  return context.createLinearGradient(0, PREVIEW_HEIGHT, 0, 0);
}

function applyStaticColor(context, descriptor) {
  if (descriptor.gradientEnabled) {
    context.globalCompositeOperation = "source-atop";
    const gradient = previewGradient(context, descriptor);
    gradient.addColorStop(0, hexToCss(descriptor.gradientColorA));
    gradient.addColorStop(0.5, hexToCss(descriptor.gradientColorB));
    gradient.addColorStop(1, hexToCss(descriptor.gradientColorA));
    context.fillStyle = gradient;
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.globalCompositeOperation = "source-over";
    return;
  }
  if (descriptor.tint) {
    context.globalCompositeOperation = "source-atop";
    context.fillStyle = hexToCss(descriptor.tint);
    context.fillRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    context.globalCompositeOperation = "source-over";
  }
}

async function drawStaticPreview(mode = previewMode) {
  const canvas = element("v39-effect-static-preview");
  const host = element("v39-effect-preview-stage");
  if (!(canvas instanceof HTMLCanvasElement) || !host || !selectedEffectName) return false;
  const context = canvas.getContext("2d");
  if (!context) return false;
  const descriptor = resolveV39EffectPlaybackDescriptor(selectedEffectName);
  const source = descriptor?.sequenceSources?.[0];
  if (!descriptor || !source?.src) {
    setStatus("プレビュー用エフェクトを解決できませんでした。", true);
    return false;
  }
  try {
    const image = await loadPreviewImage(source.src);
    context.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    const fullImage = mode === "full-image";
    const layout = resolveEffectSheetLayout(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const sourceWidth = fullImage ? image.width : layout.frameWidth || image.width;
    const sourceHeight = fullImage ? image.height : layout.frameHeight || image.height;
    const padding = fullImage ? 18 : 28;
    const fitScale = Math.min((PREVIEW_WIDTH - padding * 2) / sourceWidth, (PREVIEW_HEIGHT - padding * 2) / sourceHeight);
    const effectScale = fullImage ? 1 : Math.max(0.1, Number(descriptor.scaleMultiplierPercent || 100) / 100);
    const scale = Math.min(fitScale * effectScale * Math.max(0.01, Number(source.sourceScaleMultiplier || 1)), fitScale * 2.5);
    const drawWidth = Math.max(1, sourceWidth * scale);
    const drawHeight = Math.max(1, sourceHeight * scale);
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, (PREVIEW_WIDTH - drawWidth) / 2, (PREVIEW_HEIGHT - drawHeight) / 2, drawWidth, drawHeight);
    applyStaticColor(context, descriptor);
    host.classList.add("is-ready");
    return true;
  } catch (error) {
    console.error("[エフェクト設定] 静止プレビュー失敗", error);
    setStatus(`静止プレビュー失敗: ${String(error?.message || error)}`, true);
    return false;
  }
}

function stopPreviewLoop() {
  if (previewReplayTimer) window.clearInterval(previewReplayTimer);
  previewReplayTimer = null;
  previewGeneration += 1;
  previewPlaybackQueued = false;
  previewPlayer?.stop?.();
}

async function playPanelPreview() {
  if (!previewPanelVisible() || !selectedEffectName) return false;
  await drawStaticPreview(previewMode === "full-image" ? "full-image" : "first-frame");
  if (previewMode !== "animation") {
    if (previewGame?.canvas) previewGame.canvas.style.display = "none";
    return true;
  }
  if (!previewPlayer) return false;
  if (previewPlaybackPromise) {
    previewPlaybackQueued = true;
    return true;
  }
  if (previewGame?.canvas) previewGame.canvas.style.display = "block";
  const descriptor = resolveV39EffectPlaybackDescriptor(selectedEffectName);
  if (!descriptor) return false;

  const generation = previewGeneration;
  let playbackError = null;
  const scaleMultiplier = Math.max(0.1, Number(descriptor.scaleMultiplierPercent || 100) / 100);
  previewPlaybackPromise = Promise.resolve(previewPlayer.play({
    x:PREVIEW_WIDTH / 2,
    y:PREVIEW_HEIGHT / 2,
    sequenceSources:descriptor.sequenceSources,
    scalePercent:PREVIEW_BASE_SCALE_PERCENT * scaleMultiplier,
    angleDeg:0,
    tint:descriptor.tint,
    gradientEnabled:descriptor.gradientEnabled,
    gradientColorA:descriptor.gradientColorA,
    gradientColorB:descriptor.gradientColorB,
    gradientDirection:descriptor.gradientDirection,
    gradientSpeedPercentPerSecond:descriptor.gradientSpeedPercentPerSecond,
    colorStrengthPercent:100,
    renderStyle:"soft",
    showPreviousFrameGhost:true,
    totalDurationMs:1500,
    sequenceGapMs:10,
    depth:10,
    displayName:"v39-effect-settings-preview",
    onError:error => { playbackError = error; }
  })).then(played => {
    if (generation !== previewGeneration || !previewPanelVisible() || previewMode !== "animation") return played;
    if (!played && playbackError) {
      const message = String(playbackError?.message || playbackError);
      console.error("[エフェクト設定] 画面内プレビュー失敗", playbackError);
      setStatus(`アニメ再生失敗: ${message} / 1枚目を表示中`, true);
    } else if (!played) {
      setStatus("アニメ再生がキャンセルされました。1枚目を表示しています。", false);
    }
    return played;
  }).catch(error => {
    if (generation !== previewGeneration) return false;
    console.error("[エフェクト設定] 画面内プレビュー失敗", error);
    setStatus(`アニメ再生失敗: ${String(error?.message || error)} / 1枚目を表示中`, true);
    return false;
  }).finally(() => {
    previewPlaybackPromise = null;
    if (previewPlaybackQueued && generation === previewGeneration && previewPanelVisible() && previewMode === "animation") {
      previewPlaybackQueued = false;
      schedulePanelPreview(40);
    }
  });

  return previewPlaybackPromise;
}

function schedulePanelPreview(delay = 80) {
  if (previewScheduleTimer) window.clearTimeout(previewScheduleTimer);
  previewScheduleTimer = window.setTimeout(() => {
    previewScheduleTimer = null;
    void refreshPreviewDisplay();
  }, Math.max(0, Number(delay) || 0));
}

function ensurePreviewGame() {
  if (previewGame) return Promise.resolve(previewGame);
  if (previewBootPromise) return previewBootPromise;
  const host = element("v39-effect-preview-stage");
  if (!(host instanceof HTMLElement)) return Promise.resolve(null);
  previewBootPromise = import("phaser").then(module => {
    const Phaser = module.default || module;
    if (!document.body.contains(host)) return null;
    previewGame = new Phaser.Game({
      type:Phaser.CANVAS,
      transparent:true,
      parent:host,
      width:PREVIEW_WIDTH,
      height:PREVIEW_HEIGHT,
      render:{ antialias:true, pixelArt:false, roundPixels:false },
      scene:{ create:function createEffectSettingsPreviewScene() {
        previewPlayer = new PhaserEffectPlayer(this, { totalDurationMs:1500, sequenceGapMs:10, depth:10 });
        if (previewGame?.canvas) previewGame.canvas.style.background = "transparent";
      } }
    });
    return previewGame;
  }).catch(error => {
    previewBootPromise = null;
    console.error("[エフェクト設定] アニメプレビュー初期化失敗", error);
    setStatus(`アニメプレビュー初期化失敗: ${String(error?.message || error)} / 静止表示は利用できます。`, true);
    return null;
  });
  return previewBootPromise;
}

async function refreshPreviewDisplay() {
  if (!previewPanelVisible()) return;
  const modeControl = element("v39-effect-preview-mode");
  if (modeControl) modeControl.value = previewMode;
  await drawStaticPreview(previewMode === "full-image" ? "full-image" : "first-frame");
  if (previewMode !== "animation") {
    if (previewGame?.canvas) previewGame.canvas.style.display = "none";
    return;
  }
  await ensurePreviewGame();
  await playPanelPreview();
}

function startPreviewLoop() {
  stopPreviewLoop();
  void refreshPreviewDisplay();
  if (previewMode !== "animation") return;
  previewReplayTimer = window.setInterval(() => {
    if (document.visibilityState === "hidden" || !previewPanelVisible() || previewMode !== "animation") return;
    void playPanelPreview();
  }, 1900);
}

function renderSetting() {
  const catalog = getV39EffectSettingsCatalog();
  if (!catalog.length) {
    setStatus("エフェクトカタログが空です。", true);
    return;
  }
  if (!catalog.includes(selectedEffectName)) selectedEffectName = catalog[0];
  const setting = getV39EffectSetting(selectedEffectName);
  rendering = true;
  try {
    const source = element("v39-effect-setting-source");
    const base = element("v39-effect-setting-base");
    const decoration = element("v39-effect-setting-decoration");
    const tintEnabled = element("v39-effect-setting-tint-enabled");
    const tint = element("v39-effect-setting-tint");
    const tintCode = element("v39-effect-setting-tint-code");
    const gradientEnabled = element("v39-effect-setting-gradient-enabled");
    const gradientA = element("v39-effect-setting-gradient-a");
    const gradientB = element("v39-effect-setting-gradient-b");
    const gradientACode = element("v39-effect-setting-gradient-a-code");
    const gradientBCode = element("v39-effect-setting-gradient-b-code");
    const gradientDirection = element("v39-effect-setting-gradient-direction");
    const gradientSpeed = element("v39-effect-setting-gradient-speed");
    const scale = element("v39-effect-setting-scale");
    if (source) source.value = selectedEffectName;
    if (base) base.value = setting.baseEffect;
    if (decoration) decoration.value = setting.decorationEffect;
    if (tintEnabled) tintEnabled.checked = !!setting.tint;
    if (tint) tint.value = setting.tint || "#FFFFFF";
    if (tintCode) tintCode.textContent = setting.tint || "なし";
    if (gradientEnabled) gradientEnabled.checked = setting.gradientEnabled === true;
    if (gradientA) gradientA.value = setting.gradientColorA;
    if (gradientB) gradientB.value = setting.gradientColorB;
    if (gradientACode) gradientACode.textContent = setting.gradientColorA;
    if (gradientBCode) gradientBCode.textContent = setting.gradientColorB;
    if (gradientDirection) gradientDirection.value = setting.gradientDirection;
    if (gradientSpeed) gradientSpeed.value = String(setting.gradientSpeedPercentPerSecond);
    if (scale) scale.value = String(setting.scaleMultiplierPercent);
    const mode = element("v39-effect-preview-mode");
    if (mode) mode.value = previewMode;
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
  const tintEnabled = element("v39-effect-setting-tint-enabled")?.checked === true;
  const tintValue = tintEnabled ? element("v39-effect-setting-tint")?.value : "";
  updateV39EffectSetting(selectedEffectName, {
    baseEffect:element("v39-effect-setting-base")?.value,
    decorationEffect:element("v39-effect-setting-decoration")?.value,
    tint:tintValue,
    gradientEnabled:element("v39-effect-setting-gradient-enabled")?.checked === true,
    gradientColorA:element("v39-effect-setting-gradient-a")?.value,
    gradientColorB:element("v39-effect-setting-gradient-b")?.value,
    gradientDirection:element("v39-effect-setting-gradient-direction")?.value,
    gradientSpeedPercentPerSecond:element("v39-effect-setting-gradient-speed")?.value,
    scaleMultiplierPercent:element("v39-effect-setting-scale")?.value
  });
  renderSetting();
}

function previewCurrentEffectOnMap() {
  const map = window.__v39FieldRuntime?.mapData;
  const play = window.playV39MapEffect;
  if (!map || typeof play !== "function") {
    setStatus("実マップ確認はマップ生成後に使用できます。", true);
    return;
  }
  const x = Math.max(0, Math.floor(Number(map.w || 1) / 2));
  const y = Math.max(0, Math.floor(Number(map.h || 1) / 2));
  setStatus(`${selectedEffectName} をマップ中央で再生します。`);
  void Promise.resolve(play({ effectName:selectedEffectName, tileX:x, tileY:y, allowInFog:true, scalePercent:50 })).catch(error => {
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

function openPanel() {
  const menu = element("v39-manage-menu");
  const displayPanel = element("v39-display-settings-panel");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  if (displayPanel) {
    displayPanel.hidden = true;
    displayPanel.setAttribute("aria-hidden", "true");
  }
  menu.hidden = true;
  panel.hidden = false;
  panel.setAttribute("aria-hidden", "false");
  renderSetting();
  startPreviewLoop();
}

function closePanel() {
  const menu = element("v39-manage-menu");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  stopPreviewLoop();
  menu.hidden = false;
}

function bindControls() {
  element("v39-manage-effect-settings")?.addEventListener("click", openPanel);
  element("v39-effect-settings-back")?.addEventListener("click", closePanel);
  for (const button of document.querySelectorAll("[data-v39-effect-tab]")) {
    button.addEventListener("click", () => switchSettingsTab(button.dataset.v39EffectTab));
  }
  element("v39-effect-setting-source")?.addEventListener("change", event => {
    selectedEffectName = event.target.value;
    renderSetting();
  });
  element("v39-effect-preview-mode")?.addEventListener("change", event => {
    savePreviewMode(event.target.value);
    startPreviewLoop();
  });
  element("v39-effect-setting-base")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-decoration")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-tint-enabled")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-tint")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-gradient-enabled")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-gradient-a")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-gradient-b")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-gradient-direction")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-gradient-speed")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-scale")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-preview-local")?.addEventListener("click", () => void refreshPreviewDisplay());
  element("v39-effect-setting-preview")?.addEventListener("click", previewCurrentEffectOnMap);
  element("v39-effect-setting-reset")?.addEventListener("click", () => {
    if (!selectedEffectName) return;
    resetV39EffectSetting(selectedEffectName);
    renderSetting();
    setStatus(`${selectedEffectName} を初期設定へ戻しました。`);
  });
  element("v39-effect-settings-export")?.addEventListener("click", exportJson);
  element("v39-effect-settings-import")?.addEventListener("click", () => element("v39-effect-settings-file")?.click());
  element("v39-effect-settings-file")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    void importJsonFile(file);
    event.target.value = "";
  });
  window.addEventListener("v39:effect-settings-changed", () => {
    if (!element("v39-effect-settings-panel")?.hidden) renderSetting();
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
  fillSelect(element("v39-effect-setting-decoration"), catalog, { includeNone:true });
  bindControls();
  switchSettingsTab(activeSettingsTab);
  renderSetting();
  window.openV39EffectSettings = openPanel;
  window.refreshV39EffectSettingsPreview = () => schedulePanelPreview(0);
}

install();
