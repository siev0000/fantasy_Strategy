<script setup>
import { computed, ref, watch } from "vue";
import effectList320 from "../../../assets/effect/320×240/effect_list.json";
import effectListAnimation1 from "../../../assets/effect/アニメーション1/effect_list.json";

const rawEffectModules320 = import.meta.glob("../../../assets/effect/320×240/*.{webp,png,jpg,jpeg,avif,gif}", {
  eager: true,
  import: "default"
});
const rawEffectModulesAnimation1 = import.meta.glob("../../../assets/effect/アニメーション1/*.{webp,png,jpg,jpeg,avif,gif}", {
  eager: true,
  import: "default"
});

const effectSrcByName = new Map();
for (const [path, src] of Object.entries({ ...rawEffectModules320, ...rawEffectModulesAnimation1 })) {
  const fileName = path.split("/").pop() || "";
  const baseName = fileName.replace(/\.(webp|png|jpg|jpeg|avif|gif)$/i, "");
  const srcText = String(src || "").trim();
  if (!baseName || !srcText || effectSrcByName.has(baseName)) continue;
  effectSrcByName.set(baseName, srcText);
}
const mergedEffectList = [
  ...(Array.isArray(effectList320) ? effectList320 : []),
  ...(Array.isArray(effectListAnimation1) ? effectListAnimation1 : [])
];
const effectNameOptions = mergedEffectList
  .map(name => String(name || "").trim())
  .filter((name, index, arr) => name.length > 0 && arr.indexOf(name) === index && effectSrcByName.has(name));
const EFFECT_RENDER_STYLE_OPTIONS = Object.freeze([
  { key: "soft", label: "ぼかし" },
  { key: "rect", label: "四角" },
  { key: "none", label: "なし" }
]);
const EFFECT_SPRITE_UNIT = 120;
const EFFECT_VERTICAL_SPLIT_TARGET_WIDTH = 320;
const EFFECT_VERTICAL_SPLIT_FRAME_HEIGHT = 120;

const props = defineProps({
  canPlay: {
    type: Boolean,
    default: true
  },
  inline: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(["play-request"]);

const selectedEffectName = ref(effectNameOptions[0] || "");
const angleDeg = ref(0);
const scalePercent = ref(50);
const tintHex = ref("#ffffff");
const colorStrengthPercent = ref(100);
const hueAnimationDegPerFrame = ref(0);
const grayscaleBase = ref(false);
const renderStyle = ref("soft");
const frameCount = ref(1);
const selectedFrameIndex = ref(0);
const frameOffsetX = ref(0);
const frameOffsetY = ref(0);
const showPreviousFrameGhost = ref(true);
const frameOffsetMap = ref({});

function playSelectedEffect() {
  if (!props.canPlay) return;
  const name = String(selectedEffectName.value || "");
  const src = effectSrcByName.get(name);
  if (!src) return;
  emit("play-request", {
    name,
    src,
    angleDeg: normalizedAngleDeg.value,
    scalePercent: normalizedScalePercent.value,
    tint: normalizedTintColor.value,
    colorStrengthPercent: normalizedColorStrengthPercent.value,
    hueAnimationDegPerFrame: normalizedHueAnimationDegPerFrame.value,
    grayscaleBase: normalizedGrayscaleBase.value,
    renderStyle: normalizedRenderStyle.value,
    showPreviousFrameGhost: normalizedShowPreviousFrameGhost.value,
    frameOffsets: normalizedFrameOffsets.value
  });
}

const normalizedAngleDeg = computed(() => {
  const raw = Number(angleDeg.value);
  if (!Number.isFinite(raw)) return 0;
  const normalized = raw % 360;
  return normalized < 0 ? normalized + 360 : normalized;
});

const normalizedScalePercent = computed(() => {
  const raw = Number(scalePercent.value);
  if (!Number.isFinite(raw)) return 50;
  return Math.min(400, Math.max(10, Math.round(raw)));
});

const normalizedTintColor = computed(() => {
  const text = String(tintHex.value || "").trim();
  const body = text.startsWith("#") ? text.slice(1) : text;
  if (!/^[0-9a-fA-F]{6}$/.test(body)) return 0xffffff;
  return Number.parseInt(body, 16);
});
const normalizedColorStrengthPercent = computed(() => {
  const raw = Number(colorStrengthPercent.value);
  if (!Number.isFinite(raw)) return 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
});
const normalizedHueAnimationDegPerFrame = computed(() => {
  const raw = Number(hueAnimationDegPerFrame.value);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(-180, Math.min(180, raw));
});
const normalizedGrayscaleBase = computed(() => !!grayscaleBase.value);
const normalizedRenderStyle = computed(() => {
  const key = String(renderStyle.value || "").trim();
  return EFFECT_RENDER_STYLE_OPTIONS.some(row => row.key === key) ? key : "soft";
});
const normalizedShowPreviousFrameGhost = computed(() => !!showPreviousFrameGhost.value);
const normalizedFrameOffsets = computed(() => {
  const out = {};
  for (const [key, value] of Object.entries(frameOffsetMap.value || {})) {
    const frameIndex = Math.floor(Number(key));
    if (!Number.isFinite(frameIndex) || frameIndex < 0) continue;
    const x = Number(value?.x);
    const y = Number(value?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x === 0 && y === 0) continue;
    out[frameIndex] = { x: Math.round(x), y: Math.round(y) };
  }
  return out;
});

function resolveFrameCountByImageSize(widthRaw, heightRaw) {
  const sourceW = Math.max(0, Math.floor(Number(widthRaw) || 0));
  const sourceH = Math.max(0, Math.floor(Number(heightRaw) || 0));
  if (sourceW <= 0 || sourceH <= 0) return 1;
  const isHorizontal = sourceW > sourceH;
  const isFixed320VerticalSplit = sourceW === EFFECT_VERTICAL_SPLIT_TARGET_WIDTH
    && sourceH >= (EFFECT_VERTICAL_SPLIT_FRAME_HEIGHT * 2);
  if (isFixed320VerticalSplit) {
    return Math.max(1, Math.floor(sourceH / EFFECT_VERTICAL_SPLIT_FRAME_HEIGHT));
  }
  if (isHorizontal) {
    if (sourceH > 0 && (sourceW % sourceH) === 0) return Math.max(1, Math.floor(sourceW / sourceH));
    return Math.max(1, Math.floor(sourceW / EFFECT_SPRITE_UNIT));
  }
  if (sourceW > 0 && (sourceH % sourceW) === 0) return Math.max(1, Math.floor(sourceH / sourceW));
  return Math.max(1, Math.floor(sourceH / EFFECT_SPRITE_UNIT));
}

function syncFrameOffsetInputs() {
  const frameIndex = Math.max(0, Math.floor(Number(selectedFrameIndex.value) || 0));
  const offset = frameOffsetMap.value?.[frameIndex] || { x: 0, y: 0 };
  frameOffsetX.value = Math.round(Number(offset.x) || 0);
  frameOffsetY.value = Math.round(Number(offset.y) || 0);
}

function applyCurrentFrameOffset() {
  const frameIndex = Math.max(0, Math.floor(Number(selectedFrameIndex.value) || 0));
  const x = Math.round(Number(frameOffsetX.value) || 0);
  const y = Math.round(Number(frameOffsetY.value) || 0);
  const next = { ...(frameOffsetMap.value || {}) };
  if (x === 0 && y === 0) {
    delete next[frameIndex];
  } else {
    next[frameIndex] = { x, y };
  }
  frameOffsetMap.value = next;
}

function clearCurrentFrameOffset() {
  const frameIndex = Math.max(0, Math.floor(Number(selectedFrameIndex.value) || 0));
  const next = { ...(frameOffsetMap.value || {}) };
  delete next[frameIndex];
  frameOffsetMap.value = next;
  frameOffsetX.value = 0;
  frameOffsetY.value = 0;
}

async function refreshFrameMetaForSelectedEffect() {
  const name = String(selectedEffectName.value || "").trim();
  const src = effectSrcByName.get(name);
  if (!src) {
    frameCount.value = 1;
    selectedFrameIndex.value = 0;
    frameOffsetX.value = 0;
    frameOffsetY.value = 0;
    return;
  }
  const count = await new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(resolveFrameCountByImageSize(img.width, img.height));
    img.onerror = () => resolve(1);
    img.src = src;
  });
  frameCount.value = Math.max(1, Math.floor(Number(count) || 1));
  selectedFrameIndex.value = Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(selectedFrameIndex.value) || 0)));
  syncFrameOffsetInputs();
}

watch(selectedEffectName, () => {
  void refreshFrameMetaForSelectedEffect();
}, { immediate: true });

watch(selectedFrameIndex, () => {
  selectedFrameIndex.value = Math.max(0, Math.min(frameCount.value - 1, Math.floor(Number(selectedFrameIndex.value) || 0)));
  syncFrameOffsetInputs();
});

const overlayClass = computed(() => (props.inline ? "inline" : "floating"));
const showAdvancedControls = computed(() => !props.inline);

</script>

<template>
  <div class="effect-player-overlay" :class="overlayClass">
    <label class="effect-player-select-wrap">
      <span>エフェクト</span>
      <select v-model="selectedEffectName">
        <option v-for="name in effectNameOptions" :key="`effect-option-${name}`" :value="name">
          {{ name }}
        </option>
      </select>
    </label>
    <label class="effect-angle-wrap">
      <span>向き(°)</span>
      <input v-model.number="angleDeg" type="number" min="0" max="360" step="1" />
    </label>
    <label class="effect-scale-wrap">
      <span>サイズ(%)</span>
      <input v-model.number="scalePercent" type="number" min="10" max="400" step="10" />
    </label>
    <label class="effect-render-style-wrap">
      <span>再生形式</span>
      <select v-model="renderStyle">
        <option v-for="row in EFFECT_RENDER_STYLE_OPTIONS" :key="`effect-render-style-${row.key}`" :value="row.key">
          {{ row.label }}
        </option>
      </select>
    </label>
    <label v-if="showAdvancedControls" class="effect-frame-index-wrap">
      <span>補正フレーム</span>
      <input v-model.number="selectedFrameIndex" type="number" min="0" :max="Math.max(0, frameCount - 1)" step="1" />
    </label>
    <label v-if="showAdvancedControls" class="effect-frame-offset-wrap">
      <span>補正X</span>
      <input v-model.number="frameOffsetX" type="number" step="1" />
    </label>
    <label v-if="showAdvancedControls" class="effect-frame-offset-wrap">
      <span>補正Y</span>
      <input v-model.number="frameOffsetY" type="number" step="1" />
    </label>
    <label class="effect-tint-wrap">
      <span>カラー選択</span>
      <input v-model="tintHex" type="color" />
    </label>
    <label v-if="showAdvancedControls" class="effect-color-strength-wrap">
      <span>カラー強度(%)</span>
      <input v-model.number="colorStrengthPercent" type="number" min="0" max="100" step="5" />
    </label>
    <label v-if="showAdvancedControls" class="effect-hue-anim-wrap">
      <span>色相アニメ(deg/フレーム)</span>
      <input v-model.number="hueAnimationDegPerFrame" type="number" min="-180" max="180" step="0.1" />
    </label>
    <label v-if="showAdvancedControls" class="effect-grayscale-wrap">
      <input v-model="grayscaleBase" type="checkbox" />
      <span>色を消す(灰色ベース)</span>
    </label>
    <div v-if="showAdvancedControls" class="effect-frame-offset-actions">
      <button type="button" class="secondary" @click="applyCurrentFrameOffset">補正保存</button>
      <button type="button" class="secondary" @click="clearCurrentFrameOffset">補正クリア</button>
      <small>{{ frameCount }}f / 保存{{ Object.keys(frameOffsetMap).length }}</small>
    </div>
    <label v-if="showAdvancedControls" class="effect-prev-ghost-wrap">
      <input v-model="showPreviousFrameGhost" type="checkbox" />
      <span>前フレーム半透明</span>
    </label>
    <div v-if="showAdvancedControls" class="effect-output-line">
      <span>出力:</span>
      <label class="effect-output-inline">
        <span>色</span>
        <input v-model="tintHex" type="color" />
      </label>
      <label class="effect-output-inline">
        <span>強度</span>
        <input v-model.number="colorStrengthPercent" type="number" min="0" max="100" step="5" />
      </label>
      <small>色相{{ normalizedHueAnimationDegPerFrame }}deg/f</small>
    </div>
    <button
      type="button"
      class="secondary"
      :disabled="!selectedEffectName || !canPlay"
      @click="playSelectedEffect"
    >
      再生
    </button>
  </div>
</template>

<style scoped>
.effect-player-overlay {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid rgba(221, 188, 124, 0.55);
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(11, 18, 29, 0.9), rgba(9, 12, 20, 0.9));
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.effect-player-overlay.floating {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  z-index: 27;
}

.effect-player-overlay.inline {
  position: relative;
  width: 100%;
  max-width: 100%;
  transform: none;
  left: auto;
  bottom: auto;
  box-sizing: border-box;
  gap: 6px;
  padding: 6px;
}

.effect-player-overlay.inline .effect-player-select-wrap {
  min-width: 0;
  flex: 1 1 100%;
}

.effect-player-overlay.inline .effect-player-select-wrap select {
  width: 100%;
}

.effect-player-select-wrap {
  display: grid;
  gap: 4px;
  min-width: min(320px, calc(100vw - 110px));
  color: #f2e6c9;
  font-size: 12px;
}

.effect-player-select-wrap select {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-angle-wrap {
  display: grid;
  gap: 4px;
  width: 96px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-angle-wrap input {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-scale-wrap {
  display: grid;
  gap: 4px;
  width: 96px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-scale-wrap input {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-render-style-wrap {
  display: grid;
  gap: 4px;
  width: 104px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-render-style-wrap select {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-frame-index-wrap,
.effect-frame-offset-wrap {
  display: grid;
  gap: 4px;
  width: 88px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-frame-index-wrap input,
.effect-frame-offset-wrap input {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-frame-offset-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.effect-frame-offset-actions small {
  color: #f2e6c9;
  font-size: 11px;
}

.effect-prev-ghost-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-tint-wrap {
  display: grid;
  gap: 4px;
  width: 72px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-tint-wrap input {
  width: 100%;
  height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  padding: 2px 4px;
}

.effect-color-strength-wrap,
.effect-hue-anim-wrap {
  display: grid;
  gap: 4px;
  width: 124px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-color-strength-wrap input,
.effect-hue-anim-wrap input {
  min-height: 30px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 7px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 12px;
  padding: 4px 8px;
}

.effect-grayscale-wrap {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #f2e6c9;
  font-size: 12px;
}

.effect-output-line {
  color: #f2e6c9;
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.effect-output-inline {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.effect-output-inline input[type="color"] {
  width: 32px;
  height: 22px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 5px;
  background: rgba(255, 247, 229, 0.92);
  padding: 1px;
}

.effect-output-inline input[type="number"] {
  width: 56px;
  min-height: 22px;
  border: 1px solid rgba(207, 171, 111, 0.6);
  border-radius: 5px;
  background: rgba(255, 247, 229, 0.92);
  color: #2f2517;
  font-size: 11px;
  padding: 2px 4px;
}

@media (max-width: 768px) {
  .effect-player-overlay.floating {
    bottom: 12px;
    width: calc(100% - 20px);
    max-width: 420px;
    padding: 8px;
  }

  .effect-player-select-wrap {
    min-width: 0;
    flex: 1;
  }
}
</style>
