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
const PREVIEW_BASE_SIZE_PX = 300; // Settings-only maximum frame size; combat sizing is unchanged.
const PREVIEW_PADDING_PX = 10;
const SETTINGS_TABS = Object.freeze(["basic", "color", "motion", "data"]);
const BASE_COLORS = Object.freeze([
  ["#FFFFFF", "白"], ["#000000", "黒"], ["#FF3B1F", "赤"], ["#FF8C00", "橙"],
  ["#FFD54A", "黄"], ["#4CAF50", "緑"], ["#00BCD4", "水色"], ["#2196F3", "青"],
  ["#9C27B0", "紫"], ["#FF80AB", "桃"], ["#795548", "茶"], ["#9E9E9E", "灰"]
]);

let selectedEffectName = "";
let activeSettingsTab = "basic";
let rendering = false;
let previewGame = null;
let previewPlayer = null;
let previewBootPromise = null;
let previewReplayTimer = null;
let previewScheduleTimer = null;
let previewRequestId = 0;
let playbackMode = "once";
let previewFrameIndex = 0;
let previewBounds = null;

function element(id) {
  return document.getElementById(id);
}

function installStyles() {
  if (element("v39-effect-settings-style")) return;
  const style = document.createElement("style");
  style.id = "v39-effect-settings-style";
  style.textContent = `
    #v39-effect-settings-panel{height:100%;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,42%) minmax(0,1fr);background:#0e171b;color:#e7efec}
    #v39-effect-settings-panel[hidden]{display:none!important}
    .v39-effect-settings-head{min-height:42px;display:flex;align-items:center;gap:8px;padding:5px 7px;border-bottom:1px solid #3a4c53;background:#142126}
    .v39-effect-settings-head strong{font-size:var(--font-body)}
    .v39-effect-settings-back{min-height:34px;border:1px solid #4b626b;border-radius:6px;background:#18282e;color:#e8f2f0;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    .v39-effect-preview-pane{min-height:0;display:grid;grid-template-rows:auto auto minmax(0,1fr);gap:7px;padding:7px;border-bottom:1px solid #354950;background:linear-gradient(180deg,#101b20,#0a1115)}
    .v39-effect-playback-controls,.v39-effect-frame-controls{display:flex;align-items:center;gap:5px;min-width:0}
    .v39-effect-playback-controls select{min-width:0;flex:1;background:#0b1519;color:#eef5f2;border:1px solid #536a72;border-radius:6px;min-height:32px;font:inherit}
    .v39-effect-frame-controls{flex:2}.v39-effect-frame-controls[hidden]{display:none}
    .v39-effect-frame-controls input{width:100%;min-width:30px}.v39-effect-frame-controls button{padding:3px 7px;min-height:32px;font:inherit;background:#173039;color:#eef8f5;border:1px solid #4f6b74;border-radius:6px}
    .v39-effect-frame-controls output{white-space:nowrap;font-size:var(--font-secondary)}
    .v39-effect-preview-toolbar{display:flex;align-items:center;gap:7px;min-width:0}
    .v39-effect-preview-selector{min-width:0;flex:1;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:7px;color:#c8d6d7;font-size:var(--font-secondary);font-weight:800}
    .v39-effect-preview-selector select{width:100%;min-width:0;min-height:38px;border:1px solid #536a72;border-radius:7px;background:#0b1519;color:#eef5f2;padding:4px 7px;font:inherit}
    .v39-effect-preview-replay{flex:0 0 auto;min-height:38px;border:1px solid #4f6b74;border-radius:7px;background:#173039;color:#eef8f5;padding:4px 10px;font:inherit;font-weight:800;cursor:pointer}
    #v39-effect-preview-stage{position:relative;min-height:0;overflow:hidden;border:1px solid #31464d;border-radius:10px;background:radial-gradient(circle at 50% 50%,rgba(50,76,84,.34),rgba(5,10,13,.98) 68%);box-shadow:inset 0 0 28px rgba(0,0,0,.5)}
    #v39-effect-preview-stage::before,#v39-effect-preview-stage::after{content:"";position:absolute;z-index:0;pointer-events:none;background:rgba(119,161,170,.1)}
    #v39-effect-preview-stage::before{left:50%;top:8%;bottom:8%;width:1px}
    #v39-effect-preview-stage::after{top:50%;left:8%;right:8%;height:1px}
    #v39-effect-preview-stage canvas{position:absolute!important;z-index:1;inset:0;display:block!important;width:100%!important;height:100%!important;object-fit:contain}
    .v39-effect-preview-placeholder{position:absolute;z-index:2;inset:0;display:grid;place-items:center;color:#83999d;font-size:var(--font-secondary);pointer-events:none}
    #v39-effect-preview-stage.is-ready .v39-effect-preview-placeholder{display:none}
    #v39-effect-gradient-guides{position:absolute;inset:0;width:100%;height:100%;z-index:3;pointer-events:none;overflow:hidden}
    #v39-effect-gradient-guides[hidden]{display:none}
    #v39-effect-gradient-guides text{font-size:var(--font-secondary);font-weight:800;paint-order:stroke;stroke:#071015;stroke-width:3px;stroke-linejoin:round}
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
    #v39-effect-settings-status{min-height:28px;margin:0;padding:5px 8px;border-top:1px solid #293b41;background:#0a1216;color:#a9bdc0;font-size:var(--font-secondary);line-height:1.4}
    #v39-effect-settings-status.is-error{color:#f3a092;background:#2c1715}
    @media(max-width:600px){
      .v39-effect-settings-head{min-height:40px;padding:4px 6px}
      .v39-effect-preview-pane{padding:5px;gap:5px}
      .v39-effect-preview-selector{grid-template-columns:1fr;gap:3px}.v39-effect-preview-selector>span{display:none}
      .v39-effect-preview-selector select,.v39-effect-preview-replay{min-height:40px}
      .v39-effect-settings-tab{min-height:44px;font-size:var(--font-compact)}
      .v39-effect-settings-tabpanel{padding:6px}
      .v39-effect-setting-row{grid-template-columns:1fr;gap:5px;padding:7px}
      .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"]{min-height:40px}
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
    </header>
    <section class="v39-effect-preview-pane" aria-label="エフェクトプレビュー">
      <div class="v39-effect-preview-toolbar">
        <label class="v39-effect-preview-selector"><span>対象</span><select id="v39-effect-setting-source" aria-label="対象エフェクト"></select></label>
        <button type="button" id="v39-effect-setting-preview-local" class="v39-effect-preview-replay">▶ 再生</button>
      </div>
      <div class="v39-effect-playback-controls">
        <select id="v39-effect-playback-mode" aria-label="再生方式"><option value="once">1回再生</option><option value="loop">ループ</option><option value="frame">コマ切り替え</option></select>
        <div id="v39-effect-frame-controls" class="v39-effect-frame-controls" hidden>
          <button type="button" id="v39-effect-frame-prev" aria-label="前のコマ">◀</button>
          <input type="range" id="v39-effect-frame-slider" aria-label="コマ位置" min="0" max="0" value="0">
          <button type="button" id="v39-effect-frame-next" aria-label="次のコマ">▶</button>
          <output id="v39-effect-frame-count">1/1</output>
        </div>
      </div>
      <div id="v39-effect-preview-stage"><div class="v39-effect-preview-placeholder">プレビューを準備中…</div><svg id="v39-effect-gradient-guides" aria-label="グラデーションの基準位置" hidden></svg></div>
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
  renderGradientGuides();
  if (previewPanelVisible() && (next === "color" || next === "motion")) schedulePanelPreview(0);
}

function renderGradientGuides(bounds = previewBounds) {
  if (bounds) previewBounds = bounds;
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
  svg.innerHTML = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="none" stroke="#c4d1d4" stroke-dasharray="4 4"/>${guides}<text x="6" y="16" fill="#ecf5f1">${axis}（移動前の基準）</text>`;
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
}

function previewPanelVisible() {
  const panel = element("v39-effect-settings-panel");
  return panel instanceof HTMLElement && panel.hidden === false && panel.getAttribute("aria-hidden") !== "true";
}

async function previewSources(descriptor) {
  const requestId = previewRequestId;
  const host = element("v39-effect-preview-stage");
  const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
  previewGame.scale.resize(width, height);
  const availableWidth = Math.max(1, width - PREVIEW_PADDING_PX * 2);
  const availableHeight = Math.max(1, height - PREVIEW_PADDING_PX * 2);
  const sources = [];
  for (const source of descriptor.sequenceSources) {
    const key = await previewPlayer.loadTexture(source.src);
    const image = previewGame.textures.get(key).getSourceImage();
    const layout = resolveEffectSheetLayout(image.width, image.height, previewPlayer.options);
    const scale = Math.min(PREVIEW_BASE_SIZE_PX / Math.max(layout.frameWidth, layout.frameHeight), availableWidth / layout.frameWidth, availableHeight / layout.frameHeight);
    sources.push({ ...source, sourceScaleMultiplier:scale, frameWidth:layout.frameWidth, frameHeight:layout.frameHeight });
  }
  const first = sources[0], multiplier = descriptor.scaleMultiplierPercent / 100;
  if (first && requestId === previewRequestId && previewPanelVisible()) renderGradientGuides({ x:width / 2, y:height / 2,
    width:first.frameWidth * first.sourceScaleMultiplier * multiplier,
    height:first.frameHeight * first.sourceScaleMultiplier * multiplier });
  return sources;
}

function playPanelPreview() {
  if (!previewPanelVisible() || !previewPlayer || !selectedEffectName) return false;
  const descriptor = resolveV39EffectPlaybackDescriptor(selectedEffectName);
  if (!descriptor) {
    setStatus("プレビュー用エフェクトを解決できませんでした。", true);
    return false;
  }
  const scaleMultiplier = Math.max(0.1, Number(descriptor.scaleMultiplierPercent || 100) / 100);
  window.clearTimeout(previewReplayTimer);
  const requestId = ++previewRequestId;
  previewGame.loop.wake();
  setStatus(`${selectedEffectName} を再生中…`);
  let playbackError = null;
  void previewSources(descriptor).then(sources => {
    if (requestId !== previewRequestId || !previewPanelVisible()) return false;
    return previewPlayer.play({
      x:previewGame.scale.width / 2,
      y:previewGame.scale.height / 2,
      sequenceSources:sources,
      scalePercent:previewPlayer.options.baseScalePercent * scaleMultiplier,
      angleDeg:0,
      tint:descriptor.tint,
      gradientEnabled:descriptor.gradientEnabled,
      gradientColorA:descriptor.gradientColorA,
      gradientColorB:descriptor.gradientColorB,
      gradientDirection:descriptor.gradientDirection,
      gradientStartPercent:descriptor.gradientStartPercent,
      gradientEndPercent:descriptor.gradientEndPercent,
      gradientSpeedPercentPerSecond:descriptor.gradientSpeedPercentPerSecond,
      colorStrengthPercent:descriptor.colorStrengthPercent,
      renderStyle:"soft",
      showPreviousFrameGhost:true,
      totalDurationMs:1500,
      sequenceGapMs:10,
      depth:10,
      displayName:"v39-effect-settings-preview",
      onError:error => { playbackError = error; },
      onFrame:renderGradientGuides
    });
  }).then(played => {
    // Replay only after the entire base + decoration sequence has finished.
    if (requestId !== previewRequestId || !previewPanelVisible()) return;
    if (!played || playbackError) {
      console.error("[エフェクト設定] 再生失敗", playbackError);
      setStatus("エフェクト画像を読み込めませんでした。", true);
      return;
    }
    setStatus(`${selectedEffectName} の再生完了`);
    if (playbackMode === "loop") previewReplayTimer = window.setTimeout(playPanelPreview, 300);
    else if (playbackMode === "frame") void showPanelFrame();
  }).catch(error => {
    if (requestId !== previewRequestId) return;
    console.error("[エフェクト設定] 画面内プレビュー失敗", error);
    setStatus("画面内プレビューに失敗しました。", true);
  });
  return true;
}

function schedulePanelPreview(delay = 80) {
  if (previewScheduleTimer) window.clearTimeout(previewScheduleTimer);
  previewScheduleTimer = window.setTimeout(() => {
    previewScheduleTimer = null;
    if (playbackMode === "frame") void showPanelFrame();
    else if (previewPanelVisible() && ["color", "motion"].includes(activeSettingsTab)) {
      const requestId = previewRequestId;
      void ensurePreviewGame().then(() => {
        if (requestId === previewRequestId && previewPanelVisible()) return previewSources(resolveV39EffectPlaybackDescriptor(selectedEffectName));
      }).catch(error => {
        if (requestId === previewRequestId) setStatus("基準位置を読み込めませんでした。", true);
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
    // Game construction finishes before Scene.create; await the usable player.
    return new Promise(resolve => {
      previewGame = new Phaser.Game({
        type:Phaser.AUTO,
        parent:host,
        width:PREVIEW_WIDTH,
        height:PREVIEW_HEIGHT,
        backgroundColor:"#081014",
        render:{ antialias:true, pixelArt:false, roundPixels:false },
        scene:{
          create:function createEffectSettingsPreviewScene() {
            previewPlayer = new PhaserEffectPlayer(this, { totalDurationMs:1500, sequenceGapMs:10, depth:10 });
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
    setStatus("プレビューの初期化に失敗しました。", true);
    return null;
  });
  return previewBootPromise;
}

function preparePreview() {
  void ensurePreviewGame().then(game => {
    if (!game || !previewPanelVisible()) return;
    const host = element("v39-effect-preview-stage");
    game.scale.resize(Math.max(1, host.clientWidth), Math.max(1, host.clientHeight));
    game.loop.wake();
    if (playbackMode === "frame") schedulePanelPreview(0);
  });
}

function stopPanelPlayback() {
  previewRequestId += 1;
  window.clearTimeout(previewReplayTimer);
  window.clearTimeout(previewScheduleTimer);
  previewReplayTimer = null;
  previewScheduleTimer = null;
  previewPlayer?.stop();
}

async function showPanelFrame() {
  const requestId = ++previewRequestId;
  try {
    await ensurePreviewGame();
    if (!previewPanelVisible() || requestId !== previewRequestId) return;
    const descriptor = resolveV39EffectPlaybackDescriptor(selectedEffectName);
    const frames = [];
    const sources = await previewSources(descriptor);
    if (requestId !== previewRequestId || !previewPanelVisible()) return;
    for (const source of sources) {
      const key = await previewPlayer.loadTexture(source.src);
      if (requestId !== previewRequestId) return;
      const image = previewGame.textures.get(key).getSourceImage();
      const layout = resolveEffectSheetLayout(image.width, image.height, previewPlayer.options);
      for (let index = 0; index < layout.frameCount; index++) frames.push({ source, index });
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
      x:previewGame.scale.width / 2, y:previewGame.scale.height / 2,
      scalePercent:previewPlayer.options.baseScalePercent * descriptor.scaleMultiplierPercent / 100,
      renderStyle:"soft", depth:10, displayName:"v39-effect-settings-preview", onFrame:renderGradientGuides
    });
  } catch (error) {
    if (requestId !== previewRequestId) return;
    console.error("[エフェクト設定] コマ表示失敗", error);
    setStatus("コマを表示できませんでした。", true);
  }
}

function renderSetting() {
  stopPanelPlayback();
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
    if (source) source.value = selectedEffectName;
    if (base) base.value = setting.baseEffect;
    if (decoration) decoration.value = setting.decorationEffect;
    if (colorMode) colorMode.value = setting.gradientEnabled ? "gradient" : setting.tint ? "tint" : "none";
    if (tint) tint.value = setting.tint || "#FFFFFF";
    if (tintCode) tintCode.textContent = setting.tint || "なし";
    if (gradientA) gradientA.value = setting.gradientColorA;
    if (gradientB) gradientB.value = setting.gradientColorB;
    if (gradientACode) gradientACode.textContent = setting.gradientColorA;
    if (gradientBCode) gradientBCode.textContent = setting.gradientColorB;
    if (gradientDirection) gradientDirection.value = setting.gradientDirection;
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
  updateV39EffectSetting(selectedEffectName, {
    baseEffect:element("v39-effect-setting-base")?.value,
    decorationEffect:element("v39-effect-setting-decoration")?.value,
    tint:tintValue,
    gradientEnabled:colorMode === "gradient",
    gradientColorA:element("v39-effect-setting-gradient-a")?.value,
    gradientColorB:element("v39-effect-setting-gradient-b")?.value,
    gradientDirection:element("v39-effect-setting-gradient-direction")?.value,
    gradientStartPercent:element("v39-effect-setting-gradient-start")?.value,
    gradientEndPercent:element("v39-effect-setting-gradient-end")?.value,
    colorStrengthPercent:element("v39-effect-setting-strength")?.value,
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
  void Promise.resolve(play({
    effectName:selectedEffectName,
    tileX:x,
    tileY:y,
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
  preparePreview();
}

function closePanel() {
  const menu = element("v39-manage-menu");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  stopPanelPlayback();
  previewGame?.loop.sleep();
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
  element("v39-effect-setting-preview-local")?.addEventListener("click", () => {
    stopPanelPlayback();
    void ensurePreviewGame().then(() => playPanelPreview());
  });
  element("v39-effect-playback-mode")?.addEventListener("change", event => {
    stopPanelPlayback();
    playbackMode = event.target.value;
    element("v39-effect-frame-controls").hidden = playbackMode !== "frame";
    if (playbackMode === "frame") void showPanelFrame();
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
  window.closeV39EffectSettings = closePanel;
  window.refreshV39EffectSettingsPreview = () => {
    void ensurePreviewGame().then(() => schedulePanelPreview(0));
  };
}

install();
