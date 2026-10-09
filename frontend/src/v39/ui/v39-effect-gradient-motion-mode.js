import { PhaserEffectPlayer } from "../../../../配布用/アニメーション再生機能/phaser-effect-player.mjs";
import { getV39EffectSetting, updateV39EffectSetting } from "../../lib/v39-effect-settings.js";

const CONTROL_ID = "v39-effect-setting-gradient-motion-mode";
const PATCH_FLAG = "__v39GradientMotionModePatched";

function element(id) {
  return document.getElementById(id);
}

function selectedEffectName() {
  return String(element("v39-effect-setting-source")?.value || "").trim();
}

function ensureControl() {
  const direction = element("v39-effect-setting-gradient-direction");
  const row = direction?.closest?.(".v39-effect-setting-row");
  const panel = direction?.closest?.('[data-v39-effect-panel="motion"]');
  if (!(row instanceof HTMLElement) || !(panel instanceof HTMLElement)) return null;

  let select = element(CONTROL_ID);
  if (select instanceof HTMLSelectElement) return select;

  const label = document.createElement("label");
  label.className = "v39-effect-setting-row";
  label.innerHTML = `
    <span>移動方式</span>
    <select id="${CONTROL_ID}" aria-label="グラデーション移動方式">
      <option value="fixed">固定</option>
      <option value="scroll">一方向</option>
      <option value="wave">往復循環</option>
    </select>`;
  panel.insertBefore(label, row);
  select = element(CONTROL_ID);
  select?.addEventListener("change", () => {
    const effectName = selectedEffectName();
    if (!effectName) return;
    updateV39EffectSetting(effectName, { gradientMotionMode:select.value });
  });
  return select;
}

function syncControl() {
  const select = ensureControl();
  const effectName = selectedEffectName();
  if (!(select instanceof HTMLSelectElement) || !effectName) return;
  const setting = getV39EffectSetting(effectName);
  select.value = setting.gradientMotionMode || "fixed";
  select.disabled = setting.gradientEnabled !== true;

  const fixed = select.value === "fixed";
  const direction = element("v39-effect-setting-gradient-direction");
  const speed = element("v39-effect-setting-gradient-speed");
  if (direction) direction.disabled = setting.gradientEnabled !== true || fixed;
  if (speed) speed.disabled = setting.gradientEnabled !== true || fixed;
}

function patchSettingsPreviewPlayback() {
  const prototype = PhaserEffectPlayer?.prototype;
  if (!prototype || prototype[PATCH_FLAG]) return;
  const originalPlay = prototype.play;
  prototype.play = function playWithV39GradientMotionMode(request = {}) {
    if (request?.displayName === "v39-effect-settings-preview" && request.gradientMotionMode === undefined) {
      const effectName = selectedEffectName();
      if (effectName) {
        const setting = getV39EffectSetting(effectName);
        request = { ...request, gradientMotionMode:setting.gradientMotionMode };
      }
    }
    return originalPlay.call(this, request);
  };
  Object.defineProperty(prototype, PATCH_FLAG, { value:true, configurable:false, enumerable:false });
}

function bind() {
  const source = element("v39-effect-setting-source");
  source?.addEventListener("change", () => window.setTimeout(syncControl, 0));
  window.addEventListener("v39:effect-settings-changed", () => window.setTimeout(syncControl, 0));
  for (const button of document.querySelectorAll('[data-v39-effect-tab="motion"]')) {
    button.addEventListener("click", () => window.setTimeout(syncControl, 0));
  }
}

function install() {
  patchSettingsPreviewPlayback();
  ensureControl();
  bind();
  syncControl();
}

install();
