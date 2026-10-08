import { resolveEffectSheetLayout } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { resolveV39EffectPlaybackDescriptor } from "../combat/v39-effect-player.js";

const CANVAS_ID = "v39-effect-idle-preview";
const FULL_IMAGE_MODE = "full-image";
const PLAYBACK_DURATION_MS = 1500;
const SEQUENCE_GAP_MS = 10;
let restoreTimer = null;
let drawRequestId = 0;
const imageCache = new Map();

function element(id) {
  return document.getElementById(id);
}

function panelVisible() {
  const panel = element("v39-effect-settings-panel");
  return panel instanceof HTMLElement && panel.hidden === false && panel.getAttribute("aria-hidden") !== "true";
}

function ensureCanvas() {
  const stage = element("v39-effect-preview-stage");
  if (!(stage instanceof HTMLElement)) return null;
  let canvas = element(CANVAS_ID);
  if (!(canvas instanceof HTMLCanvasElement)) {
    canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.setAttribute("aria-label", "エフェクト静止プレビュー");
    Object.assign(canvas.style, {
      position:"absolute",
      inset:"0",
      width:"100%",
      height:"100%",
      zIndex:"2",
      display:"block",
      pointerEvents:"none"
    });
    stage.appendChild(canvas);
  }
  return canvas;
}

function ensureFullImageMode() {
  const select = element("v39-effect-playback-mode");
  if (!(select instanceof HTMLSelectElement)) return;
  if (![...select.options].some(option => option.value === FULL_IMAGE_MODE)) {
    const option = document.createElement("option");
    option.value = FULL_IMAGE_MODE;
    option.textContent = "元画像全体";
    select.appendChild(option);
  }
}

function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`エフェクト画像を読み込めません: ${src}`));
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

function fitCanvas(canvas) {
  const stage = element("v39-effect-preview-stage");
  const width = Math.max(1, Math.round(stage?.clientWidth || 480));
  const height = Math.max(1, Math.round(stage?.clientHeight || 280));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  return { width, height };
}

function hex(value, fallback = "#ffffff") {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function applyFirstFrameColor(context, descriptor, x, y, width, height) {
  const strength = Math.max(0, Math.min(100, Number(descriptor.colorStrengthPercent ?? 100))) / 100;
  if (strength <= 0) return;
  context.save();
  context.globalCompositeOperation = "source-atop";
  context.globalAlpha = strength;
  if (descriptor.gradientEnabled) {
    const horizontal = ["left", "right"].includes(descriptor.gradientDirection);
    const reverse = ["up", "left"].includes(descriptor.gradientDirection);
    const gradient = horizontal
      ? context.createLinearGradient(reverse ? x + width : x, y, reverse ? x : x + width, y)
      : context.createLinearGradient(x, reverse ? y + height : y, x, reverse ? y : y + height);
    const start = Math.max(0, Math.min(100, Number(descriptor.gradientStartPercent ?? 0))) / 100;
    const end = Math.max(start, Math.min(100, Number(descriptor.gradientEndPercent ?? 100))) / 100;
    gradient.addColorStop(0, hex(descriptor.gradientColorA));
    if (start > 0) gradient.addColorStop(start, hex(descriptor.gradientColorA));
    if (end > start) gradient.addColorStop(end, hex(descriptor.gradientColorB));
    gradient.addColorStop(1, hex(descriptor.gradientColorB));
    context.fillStyle = gradient;
  } else if (descriptor.tint) {
    context.fillStyle = hex(descriptor.tint);
  } else {
    context.restore();
    return;
  }
  context.fillRect(x, y, width, height);
  context.restore();
}

async function drawIdlePreview({ fullImage = false } = {}) {
  if (!panelVisible()) return false;
  const canvas = ensureCanvas();
  const selected = element("v39-effect-setting-source")?.value;
  if (!(canvas instanceof HTMLCanvasElement) || !selected) return false;
  const descriptor = resolveV39EffectPlaybackDescriptor(selected);
  const source = descriptor?.sequenceSources?.[0];
  if (!descriptor || !source?.src) return false;
  const requestId = ++drawRequestId;
  try {
    const image = await loadImage(source.src);
    if (requestId !== drawRequestId || !panelVisible()) return false;
    const { width:canvasWidth, height:canvasHeight } = fitCanvas(canvas);
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    const layout = resolveEffectSheetLayout(image.width, image.height);
    const sourceWidth = fullImage ? image.width : Math.max(1, layout.frameWidth || image.width);
    const sourceHeight = fullImage ? image.height : Math.max(1, layout.frameHeight || image.height);
    const padding = 12;
    const baseScale = Math.min((canvasWidth - padding * 2) / sourceWidth, (canvasHeight - padding * 2) / sourceHeight);
    const settingScale = fullImage ? 1 : Math.max(0.1, Number(descriptor.scaleMultiplierPercent || 100) / 100);
    const scale = Math.max(0.01, Math.min(baseScale * settingScale * Math.max(0.01, Number(source.sourceScaleMultiplier || 1)), baseScale * 3));
    const drawWidth = Math.max(1, sourceWidth * scale);
    const drawHeight = Math.max(1, sourceHeight * scale);
    const x = (canvasWidth - drawWidth) / 2;
    const y = (canvasHeight - drawHeight) / 2;
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, x, y, drawWidth, drawHeight);
    if (!fullImage) applyFirstFrameColor(context, descriptor, x, y, drawWidth, drawHeight);
    canvas.style.display = "block";
    element("v39-effect-preview-stage")?.classList.add("is-ready");
    return true;
  } catch (error) {
    console.error("[エフェクト設定] 静止プレビュー失敗", error);
    return false;
  }
}

function hideIdlePreview() {
  window.clearTimeout(restoreTimer);
  const canvas = element(CANVAS_ID);
  if (canvas) canvas.style.display = "none";
}

function currentMode() {
  return element("v39-effect-playback-mode")?.value || "once";
}

function refreshIdlePreview() {
  window.clearTimeout(restoreTimer);
  const mode = currentMode();
  if (mode === "frame") {
    hideIdlePreview();
    return;
  }
  void drawIdlePreview({ fullImage:mode === FULL_IMAGE_MODE });
}

function scheduleRestoreAfterOnce() {
  if (currentMode() !== "once") return;
  const selected = element("v39-effect-setting-source")?.value;
  const descriptor = resolveV39EffectPlaybackDescriptor(selected);
  const count = Math.max(1, descriptor?.sequenceSources?.length || 1);
  window.clearTimeout(restoreTimer);
  restoreTimer = window.setTimeout(refreshIdlePreview, count * PLAYBACK_DURATION_MS + Math.max(0, count - 1) * SEQUENCE_GAP_MS + 80);
}

function bind() {
  ensureFullImageMode();
  const panel = element("v39-effect-settings-panel");
  if (panel instanceof HTMLElement) {
    new MutationObserver(() => {
      if (panelVisible()) window.requestAnimationFrame(refreshIdlePreview);
      else hideIdlePreview();
    }).observe(panel, { attributes:true, attributeFilter:["hidden", "aria-hidden"] });
  }

  element("v39-effect-setting-source")?.addEventListener("change", () => window.setTimeout(refreshIdlePreview, 0));
  element("v39-effect-playback-mode")?.addEventListener("change", () => window.setTimeout(refreshIdlePreview, 0));
  window.addEventListener("v39:effect-settings-changed", () => {
    if (panelVisible()) window.setTimeout(refreshIdlePreview, 0);
  });

  element("v39-effect-setting-preview-local")?.addEventListener("click", event => {
    if (currentMode() === FULL_IMAGE_MODE) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void drawIdlePreview({ fullImage:true });
      return;
    }
    hideIdlePreview();
    scheduleRestoreAfterOnce();
  }, true);

  if (panelVisible()) refreshIdlePreview();
}

function install() {
  ensureCanvas();
  ensureFullImageMode();
  bind();
}

install();
