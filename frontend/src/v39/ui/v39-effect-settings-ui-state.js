const STORAGE_KEY = "v39-effect-settings-ui-state-v1";
const MODE_ID = "v39-effect-composite-mode";
const SELECT_ID = "v39-effect-composite-selector";

let installed = false;
let restoring = false;
let preservedFrameIndex = 0;

function element(id) {
  return document.getElementById(id);
}

function readState() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function currentMode() {
  const pressed = element(MODE_ID)?.querySelector?.('button[aria-pressed="true"]');
  return pressed?.dataset?.mode || "category";
}

function currentTab() {
  return document.querySelector('[data-v39-effect-tab][aria-selected="true"]')?.dataset?.v39EffectTab || "basic";
}

function writeState(patch = {}) {
  if (restoring) return;
  const previous = readState();
  const next = {
    ...previous,
    mode:currentMode(),
    selectedValue:element(SELECT_ID)?.value || previous.selectedValue || "",
    tab:currentTab(),
    playbackMode:element("v39-effect-playback-mode")?.value || previous.playbackMode || "once",
    frameIndex:Number(element("v39-effect-frame-slider")?.value ?? previous.frameIndex ?? 0),
    ...patch
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    console.warn("[エフェクト設定] UI状態キャッシュ保存に失敗しました", error);
  }
}

function restoreFrameIndex(frameIndex, retries = 8) {
  const slider = element("v39-effect-frame-slider");
  if (!(slider instanceof HTMLInputElement)) return;
  const max = Math.max(0, Number(slider.max || 0));
  if (max <= 0 && frameIndex > 0 && retries > 0) {
    window.setTimeout(() => restoreFrameIndex(frameIndex, retries - 1), 80);
    return;
  }
  const value = Math.max(0, Math.min(frameIndex, max));
  slider.value = String(value);
  slider.dispatchEvent(new Event("input", { bubbles:true }));
  preservedFrameIndex = value;
}

function preserveFrameAcrossSelectorChange(select) {
  select.addEventListener("change", () => {
    preservedFrameIndex = Math.max(0, Number(element("v39-effect-frame-slider")?.value || 0));
  }, true);
  select.addEventListener("change", () => {
    writeState({ selectedValue:select.value, frameIndex:preservedFrameIndex });
    window.setTimeout(() => restoreFrameIndex(preservedFrameIndex), 0);
  });
}

function bindCacheEvents() {
  element(MODE_ID)?.addEventListener("click", () => window.setTimeout(() => writeState(), 0));
  const select = element(SELECT_ID);
  if (select instanceof HTMLSelectElement) preserveFrameAcrossSelectorChange(select);

  element("v39-effect-playback-mode")?.addEventListener("change", () => writeState());
  element("v39-effect-frame-slider")?.addEventListener("input", event => {
    preservedFrameIndex = Math.max(0, Number(event.target.value || 0));
    writeState({ frameIndex:preservedFrameIndex });
  });
  for (const id of ["v39-effect-frame-prev", "v39-effect-frame-next"]) {
    element(id)?.addEventListener("click", () => window.setTimeout(() => {
      preservedFrameIndex = Math.max(0, Number(element("v39-effect-frame-slider")?.value || 0));
      writeState({ frameIndex:preservedFrameIndex });
    }, 0));
  }
  for (const tab of document.querySelectorAll("[data-v39-effect-tab]")) {
    tab.addEventListener("click", () => window.setTimeout(() => writeState(), 0));
  }
}

function restoreState() {
  const state = readState();
  restoring = true;
  try {
    const modeButton = element(MODE_ID)?.querySelector?.(`button[data-mode="${state.mode || "category"}"]`);
    if (modeButton instanceof HTMLButtonElement && modeButton.getAttribute("aria-pressed") !== "true") modeButton.click();

    const select = element(SELECT_ID);
    if (select instanceof HTMLSelectElement && state.selectedValue && [...select.options].some(option => option.value === state.selectedValue)) {
      select.value = state.selectedValue;
      select.dispatchEvent(new Event("change", { bubbles:true }));
    }

    const playback = element("v39-effect-playback-mode");
    if (playback instanceof HTMLSelectElement && state.playbackMode && [...playback.options].some(option => option.value === state.playbackMode)) {
      playback.value = state.playbackMode;
      playback.dispatchEvent(new Event("change", { bubbles:true }));
    }

    const tab = document.querySelector(`[data-v39-effect-tab="${state.tab || "basic"}"]`);
    if (tab instanceof HTMLButtonElement && !tab.hidden) tab.click();

    preservedFrameIndex = Math.max(0, Number(state.frameIndex || 0));
    window.setTimeout(() => restoreFrameIndex(preservedFrameIndex), 0);
  } finally {
    window.setTimeout(() => { restoring = false; }, 0);
  }
}

function install() {
  if (installed) return;
  const select = element(SELECT_ID);
  const slider = element("v39-effect-frame-slider");
  if (!(select instanceof HTMLSelectElement) || !(slider instanceof HTMLInputElement)) {
    window.setTimeout(install, 80);
    return;
  }
  installed = true;
  bindCacheEvents();
  restoreState();
}

install();

export const V39_EFFECT_SETTINGS_UI_STATE_STORAGE_KEY = STORAGE_KEY;
