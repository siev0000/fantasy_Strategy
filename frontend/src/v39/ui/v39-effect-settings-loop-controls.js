const LOWER_REPLAY_ID = "v39-effect-setting-preview-lower";
const STYLE_ID = "v39-effect-setting-preview-lower-style";
let loopActive = false;
let restartTimer = null;
let observer = null;

function element(id) {
  return document.getElementById(id);
}

function playbackMode() {
  return element("v39-effect-playback-mode")?.value || "once";
}

function panelVisible() {
  const panel = element("v39-effect-settings-panel");
  return panel instanceof HTMLElement && !panel.hidden && panel.getAttribute("aria-hidden") !== "true";
}

function installStyles() {
  if (element(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .v39-effect-settings-tabs{grid-template-columns:repeat(4,minmax(0,1fr)) auto!important}
    #${LOWER_REPLAY_ID}{min-width:68px;min-height:42px;border:0;border-left:1px solid #2b3c42;background:#173039;color:#eef8f5;padding:5px 9px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    #${LOWER_REPLAY_ID}:hover{background:#1d424b;color:#fff}
    @media(max-width:600px){#${LOWER_REPLAY_ID}{min-width:60px;min-height:44px;padding:4px 7px;font-size:var(--font-compact)}}
  `;
  document.head.appendChild(style);
}

function syncLowerLabel() {
  const button = element(LOWER_REPLAY_ID);
  if (!button) return;
  button.textContent = playbackMode() === "loop" && loopActive ? "■ 停止" : "▶ 再生";
}

function clickPrimaryReplay() {
  element("v39-effect-setting-preview-local")?.click();
}

function scheduleLoopRestart(delay = 0) {
  if (!loopActive || playbackMode() !== "loop" || !panelVisible()) return;
  window.clearTimeout(restartTimer);
  restartTimer = window.setTimeout(() => {
    restartTimer = null;
    if (!loopActive || playbackMode() !== "loop" || !panelVisible()) return;
    clickPrimaryReplay();
  }, Math.max(0, Number(delay) || 0));
}

function ensureLowerReplay() {
  const tabs = document.querySelector(".v39-effect-settings-tabs");
  if (!(tabs instanceof HTMLElement)) return false;
  installStyles();
  let button = element(LOWER_REPLAY_ID);
  if (!(button instanceof HTMLButtonElement)) {
    button = document.createElement("button");
    button.type = "button";
    button.id = LOWER_REPLAY_ID;
    button.setAttribute("aria-label", "エフェクトを再生");
    button.addEventListener("click", () => {
      if (playbackMode() === "loop" && loopActive) {
        loopActive = false;
        const mode = element("v39-effect-playback-mode");
        if (mode instanceof HTMLSelectElement) {
          mode.value = "once";
          mode.dispatchEvent(new Event("change", { bubbles:true }));
          mode.value = "loop";
          mode.dispatchEvent(new Event("change", { bubbles:true }));
        }
        syncLowerLabel();
        return;
      }
      loopActive = playbackMode() === "loop";
      clickPrimaryReplay();
      syncLowerLabel();
    });
    tabs.appendChild(button);
  }
  syncLowerLabel();
  return true;
}

function bindGlobalEvents() {
  document.addEventListener("click", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === "v39-effect-setting-preview-local") {
      loopActive = playbackMode() === "loop";
      syncLowerLabel();
      return;
    }
    if (target.id === "v39-effect-settings-back" || target.closest("#v39-effect-settings-back")) {
      loopActive = false;
      syncLowerLabel();
      return;
    }
    if (target.matches("#v39-effect-composite-mode button")) {
      scheduleLoopRestart(0);
    }
  }, true);

  document.addEventListener("change", event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.id === "v39-effect-playback-mode") {
      if (playbackMode() !== "loop") loopActive = false;
      syncLowerLabel();
      return;
    }
    if ([
      "v39-effect-composite-selector",
      "v39-effect-setting-source",
      "v39-effect-setting-base",
      "v39-effect-setting-decoration"
    ].includes(target.id)) {
      scheduleLoopRestart(0);
    }
  }, true);

  window.addEventListener("v39:effect-settings-changed", () => scheduleLoopRestart(0));
  window.addEventListener("v39:effect-category-settings-changed", () => scheduleLoopRestart(0));
  window.addEventListener("v39:effect-attribute-settings-changed", () => scheduleLoopRestart(0));
}

function install() {
  if (!ensureLowerReplay()) {
    if (!observer && document.body) {
      observer = new MutationObserver(() => {
        if (!ensureLowerReplay()) return;
        observer?.disconnect();
        observer = null;
      });
      observer.observe(document.body, { childList:true, subtree:true });
    }
  }
  bindGlobalEvents();
}

install();
