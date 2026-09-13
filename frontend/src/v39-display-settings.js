import {
  MAP_CAMERA_ZOOM_RULES,
  normalizeUserMaxZoomFactor,
  resolveAutoMaxZoomFactor,
  resolveEffectiveMaxZoomFactor
} from "./lib/map-camera-zoom-rules.js";

const STORAGE_KEY = "v39-display-settings-v1";
const DEFAULTS = Object.freeze({
  fontScalePercent: 100,
  heightOutlineOnly: true,
  heightShading: true,
  showZoomControls: true,
  reduceMotion: false,
  maxZoomFactor: MAP_CAMERA_ZOOM_RULES.defaultUserMaxFactor
});

let settings = loadSettings();

function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") || {};
    const legacyFont = Number(saved.fontScale);
    return {
      ...DEFAULTS,
      ...saved,
      fontScalePercent: clamp(
        saved.fontScalePercent ?? (Number.isFinite(legacyFont) ? legacyFont * 100 : DEFAULTS.fontScalePercent),
        80,
        140,
        DEFAULTS.fontScalePercent
      ),
      maxZoomFactor: normalizeUserMaxZoomFactor(saved.maxZoomFactor)
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function currentMapSize() {
  const runtime = window.__v39FieldRuntime;
  const w = Number(runtime?.settings?.w ?? runtime?.mapData?.w ?? runtime?.mapWidth) || 36;
  const h = Number(runtime?.settings?.h ?? runtime?.mapData?.h ?? runtime?.mapHeight) || 36;
  return { w, h };
}

function ensureMaxZoomControl() {
  if (document.getElementById("v39-max-zoom-factor")) return;
  const grid = document.querySelector("#v39-display-settings-panel .display-settings-grid");
  if (!(grid instanceof HTMLElement)) return;

  const label = document.createElement("label");
  label.className = "display-setting";
  label.innerHTML = `
    <span class="display-setting-title">
      最大拡大倍率
      <output id="v39-max-zoom-value"></output>
    </span>
    <input type="range" id="v39-max-zoom-factor"
      min="${MAP_CAMERA_ZOOM_RULES.minUserMaxFactor}"
      max="${MAP_CAMERA_ZOOM_RULES.maxUserMaxFactor}"
      step="1"
      value="${settings.maxZoomFactor}">
    <small id="v39-max-zoom-note">大きいマップでは、タイルが小さくなりすぎないよう自動で最大倍率を引き上げます。</small>`;

  const zoomControlSetting = grid.querySelector("#v39-show-zoom-controls")?.closest(".display-setting");
  if (zoomControlSetting?.nextSibling) grid.insertBefore(label, zoomControlSetting.nextSibling);
  else grid.appendChild(label);
}

function updateMaxZoomText() {
  const out = document.getElementById("v39-max-zoom-value");
  const note = document.getElementById("v39-max-zoom-note");
  const { w, h } = currentMapSize();
  const autoFactor = resolveAutoMaxZoomFactor(w, h);
  const effectiveFactor = resolveEffectiveMaxZoomFactor({
    w,
    h,
    userMaxZoomFactor: settings.maxZoomFactor
  });
  if (out) out.textContent = `${settings.maxZoomFactor}× / 実効 ${effectiveFactor}×`;
  if (note) {
    note.textContent = `設定値 ${settings.maxZoomFactor}×。${w}×${h}マップの自動下限は ${autoFactor}×、実際の最大倍率は ${effectiveFactor}×です。`;
  }
}

function applySettings({ emit = true } = {}) {
  document.documentElement.dataset.v39FontScale = String(settings.fontScalePercent / 100);
  document.documentElement.classList.toggle("v39-reduce-motion", !!settings.reduceMotion);

  const font = document.getElementById("v39-font-size");
  const fontOut = document.getElementById("v39-font-size-value");
  const outline = document.getElementById("v39-height-outline-only");
  const shading = document.getElementById("v39-height-shading");
  const showZoom = document.getElementById("v39-show-zoom-controls");
  const reduceMotion = document.getElementById("v39-reduce-motion");
  const maxZoom = document.getElementById("v39-max-zoom-factor");

  if (font) font.value = String(settings.fontScalePercent);
  if (fontOut) fontOut.textContent = `${Math.round(settings.fontScalePercent)}%`;
  if (outline) outline.checked = settings.heightOutlineOnly !== false;
  if (shading) shading.checked = settings.heightShading !== false;
  if (showZoom) showZoom.checked = settings.showZoomControls !== false;
  if (reduceMotion) reduceMotion.checked = !!settings.reduceMotion;
  if (maxZoom) maxZoom.value = String(settings.maxZoomFactor);

  const controls = document.getElementById("v39-map-camera-controls");
  if (controls) controls.style.display = settings.showZoomControls === false ? "none" : "grid";

  updateMaxZoomText();
  if (emit) {
    window.dispatchEvent(new CustomEvent("v39:display-settings-changed", {
      detail: { ...settings, ...currentMapSize() }
    }));
    window.dispatchEvent(new Event("resize"));
  }
}

function updateSetting(key, value) {
  settings = { ...settings, [key]: value };
  saveSettings();
  applySettings();
}

function bindPanelNavigation() {
  const open = document.getElementById("v39-manage-display-settings");
  const back = document.getElementById("v39-display-settings-back");
  const menu = document.getElementById("v39-manage-menu");
  const panel = document.getElementById("v39-display-settings-panel");
  if (!open || !back || !menu || !panel) return;

  open.addEventListener("click", () => {
    menu.hidden = true;
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    updateMaxZoomText();
  });
  back.addEventListener("click", () => {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    menu.hidden = false;
  });
}

function bindControls() {
  document.getElementById("v39-font-size")?.addEventListener("input", event => {
    updateSetting("fontScalePercent", clamp(event.target.value, 80, 140, 100));
  });
  document.getElementById("v39-height-outline-only")?.addEventListener("change", event => {
    updateSetting("heightOutlineOnly", !!event.target.checked);
  });
  document.getElementById("v39-height-shading")?.addEventListener("change", event => {
    updateSetting("heightShading", !!event.target.checked);
  });
  document.getElementById("v39-show-zoom-controls")?.addEventListener("change", event => {
    updateSetting("showZoomControls", !!event.target.checked);
  });
  document.getElementById("v39-reduce-motion")?.addEventListener("change", event => {
    updateSetting("reduceMotion", !!event.target.checked);
  });
  document.getElementById("v39-max-zoom-factor")?.addEventListener("input", event => {
    updateSetting("maxZoomFactor", normalizeUserMaxZoomFactor(event.target.value));
  });
  document.getElementById("v39-display-settings-reset")?.addEventListener("click", () => {
    settings = { ...DEFAULTS };
    saveSettings();
    applySettings();
  });
}

function installReduceMotionStyle() {
  if (document.getElementById("v39-reduce-motion-style")) return;
  const style = document.createElement("style");
  style.id = "v39-reduce-motion-style";
  style.textContent = `.v39-reduce-motion *, .v39-reduce-motion *::before, .v39-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}`;
  document.head.appendChild(style);
}

function install() {
  ensureMaxZoomControl();
  installReduceMotionStyle();
  bindPanelNavigation();
  bindControls();
  applySettings({ emit: false });

  window.addEventListener("v39:field-generated", () => {
    updateMaxZoomText();
    requestAnimationFrame(() => applySettings({ emit: false }));
  });

  window.getV39DisplaySettings = () => ({ ...settings });
}

install();
