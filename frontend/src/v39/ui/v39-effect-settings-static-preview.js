// Drawing only. Playback, visibility and cancellation are owned by v39-effect-settings.js.
import { resolveEffectSheetLayout } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { resolveV39EffectPlaybackDescriptor } from "../combat/v39-effect-player.js";
import { effectPreviewGeometry } from "./v39-effect-preview-combatants.js";
import { V39_EFFECT_BASE_SCALE_PERCENT } from "../../lib/v39-effect-transform.js";

const CANVAS_ID = "v39-effect-idle-preview";
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

export function updateGradientSideLabels() {
  const direction = element("v39-effect-setting-gradient-direction")?.value || "up";
  const horizontal = direction === "left" || direction === "right";
  const labelA = element("v39-effect-setting-gradient-a")?.closest("label")?.querySelector("span");
  const labelB = element("v39-effect-setting-gradient-b")?.closest("label")?.querySelector("span");
  if (labelA) labelA.textContent = horizontal ? "色A（左・0%側）" : "色A（上・0%側）";
  if (labelB) labelB.textContent = horizontal ? "色B（右・100%側）" : "色B（下・100%側）";
  const directionControl = element("v39-effect-setting-gradient-direction");
  if (directionControl) directionControl.title = "移動方向は色が流れる方向です。A/Bの基準位置は反転しません。";
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
    // A/Bの基準位置は再生本体と同じく固定する。
    // 縦: A=上(0%) / B=下(100%)、横: A=左(0%) / B=右(100%)。
    // gradientDirection は色が流れる方向だけを表し、基準位置は反転しない。
    const gradient = horizontal
      ? context.createLinearGradient(x, y, x + width, y)
      : context.createLinearGradient(x, y, x, y + height);
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

export async function drawIdlePreview({ fullImage = false } = {}) {
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
    const geometry = effectPreviewGeometry(element("v39-effect-preview-stage"), descriptor);
    const scale = fullImage ? baseScale : geometry.zoom * V39_EFFECT_BASE_SCALE_PERCENT / 100 * settingScale * source.sourceScaleMultiplier;
    const drawWidth = Math.max(1, sourceWidth * scale);
    const drawHeight = Math.max(1, sourceHeight * scale);
    const x = (fullImage ? canvasWidth / 2 : geometry.x) - drawWidth / 2;
    const y = (fullImage ? canvasHeight / 2 : geometry.y) - drawHeight / 2;
    context.save();
    if (!fullImage) {
      context.translate(geometry.x, geometry.y);
      context.rotate(geometry.angleDeg * Math.PI / 180);
      context.translate(-geometry.x, -geometry.y);
    }
    context.drawImage(image, 0, 0, sourceWidth, sourceHeight, x, y, drawWidth, drawHeight);
    if (!fullImage) applyFirstFrameColor(context, descriptor, x, y, drawWidth, drawHeight);
    context.restore();
    canvas.style.display = "block";
    element("v39-effect-preview-stage")?.classList.add("is-ready");
    return true;
  } catch (error) {
    console.error("[エフェクト設定] 静止プレビュー失敗", error);
    return false;
  }
}

export function hideIdlePreview() {
  drawRequestId++;
  const canvas = element(CANVAS_ID);
  if (canvas) canvas.style.display = "none";
}
