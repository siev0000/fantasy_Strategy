function waitForManagePanel() {
  return new Promise(resolve => {
    const poll = () => {
      const panel = document.getElementById("footManage");
      if (panel instanceof HTMLElement) {
        resolve(panel);
        return;
      }
      window.setTimeout(poll, 30);
    };
    poll();
  });
}

function createPlaceholderModal() {
  const existing = document.getElementById("v39-field-settings-placeholder");
  if (existing instanceof HTMLElement) {
    return {
      open() {
        existing.style.display = "flex";
        existing.setAttribute("aria-hidden", "false");
      },
      close() {
        existing.style.display = "none";
        existing.setAttribute("aria-hidden", "true");
      }
    };
  }

  const overlay = document.createElement("div");
  overlay.id = "v39-field-settings-placeholder";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "10000",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px",
    background: "rgba(1, 5, 8, 0.78)",
    backdropFilter: "blur(3px)"
  });

  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "v39-field-settings-title");
  Object.assign(dialog.style, {
    width: "min(680px, 100%)",
    maxHeight: "min(760px, calc(100dvh - 28px))",
    overflow: "auto",
    border: "1px solid #45565d",
    borderRadius: "10px",
    background: "linear-gradient(180deg, rgba(20,31,36,.99), rgba(7,14,18,.99))",
    boxShadow: "0 20px 60px rgba(0,0,0,.55)",
    color: "#e8efec"
  });

  dialog.innerHTML = `
    <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #34444a;position:sticky;top:0;background:#111c21;z-index:1">
      <div>
        <div id="v39-field-settings-title" style="font-weight:800;font-size:16px">フィールド設定</div>
        <div style="margin-top:2px;font-size:13px;color:#92a2a6">カスタムフィールド生成（仮画面）</div>
      </div>
      <button type="button" id="v39-close-field-settings" style="border:1px solid #526269;border-radius:7px;background:#19262b;color:#e8efec;padding:7px 11px;cursor:pointer">閉じる</button>
    </header>
    <div style="padding:14px;display:grid;gap:12px">
      <div style="padding:12px;border:1px solid #34444a;border-radius:8px;background:rgba(255,255,255,.025)">
        <div style="font-size:13px;font-weight:700;margin-bottom:5px">現在は仮画面です</div>
        <div style="font-size:13px;line-height:1.7;color:#b8c5c8">ここへ以前の画面で使用していたフィールドカスタム設定を移植します。設定後に「生成」を押して初めてフィールドを作成する流れにします。</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">マップサイズ（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">島構成（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">山岳設定（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">河川設定（未接続）</div>
      </div>
      <button type="button" disabled style="width:100%;padding:11px;border:1px solid #45565d;border-radius:8px;background:#233137;color:#718085;font-weight:800">生成（未接続）</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  };
  const open = () => {
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
  };

  dialog.querySelector("#v39-close-field-settings")?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.style.display !== "none") close();
  });

  return { open, close };
}

const DISPLAY_SETTINGS_STORAGE_KEY = "v39-display-settings-v1";
const DEFAULT_DISPLAY_SETTINGS = Object.freeze({
  fontScalePercent: 100,
  heightOutlineOnly: true,
  heightShading: true,
  showZoomControls: true,
  reduceMotion: false
});

function loadDisplaySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY) || "null");
    return { ...DEFAULT_DISPLAY_SETTINGS, ...(saved && typeof saved === "object" ? saved : {}) };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

function saveDisplaySettings(settings) {
  localStorage.setItem(DISPLAY_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function applyDisplaySettings(settings) {
  const root = document.documentElement;
  root.dataset.v39FontScale = String(settings.fontScalePercent / 100);
  root.classList.toggle("v39-hide-map-zoom-controls", !settings.showZoomControls);
  root.classList.toggle("v39-reduce-motion", settings.reduceMotion);
  window.dispatchEvent(new CustomEvent("v39:display-settings-changed", { detail: { ...settings } }));
  window.dispatchEvent(new Event("resize"));
}

function installDisplaySettings(managePanel) {
  const menu = managePanel.querySelector("#v39-manage-menu");
  const settingsPanel = managePanel.querySelector("#v39-display-settings-panel");
  const openButton = managePanel.querySelector("#v39-manage-display-settings");
  const backButton = managePanel.querySelector("#v39-display-settings-back");
  const fontInput = managePanel.querySelector("#v39-font-size");
  const fontOutput = managePanel.querySelector("#v39-font-size-value");
  const outlineInput = managePanel.querySelector("#v39-height-outline-only");
  const shadingInput = managePanel.querySelector("#v39-height-shading");
  const zoomInput = managePanel.querySelector("#v39-show-zoom-controls");
  const motionInput = managePanel.querySelector("#v39-reduce-motion");
  const resetButton = managePanel.querySelector("#v39-display-settings-reset");
  if (!(menu instanceof HTMLElement) || !(settingsPanel instanceof HTMLElement) || !(openButton instanceof HTMLButtonElement)) {
    throw new Error("display settings elements are missing from #footManage");
  }

  let settings = loadDisplaySettings();
  const syncControls = () => {
    if (fontInput instanceof HTMLInputElement) fontInput.value = String(settings.fontScalePercent);
    if (fontOutput instanceof HTMLOutputElement) fontOutput.value = `${settings.fontScalePercent}%`;
    if (outlineInput instanceof HTMLInputElement) outlineInput.checked = settings.heightOutlineOnly;
    if (shadingInput instanceof HTMLInputElement) shadingInput.checked = settings.heightShading;
    if (zoomInput instanceof HTMLInputElement) zoomInput.checked = settings.showZoomControls;
    if (motionInput instanceof HTMLInputElement) motionInput.checked = settings.reduceMotion;
  };
  const commit = patch => {
    settings = { ...settings, ...patch };
    saveDisplaySettings(settings);
    syncControls();
    applyDisplaySettings(settings);
  };
  const showSettings = () => {
    menu.hidden = true;
    settingsPanel.hidden = false;
    settingsPanel.setAttribute("aria-hidden", "false");
  };
  const showMenu = () => {
    menu.hidden = false;
    settingsPanel.hidden = true;
    settingsPanel.setAttribute("aria-hidden", "true");
  };

  openButton.addEventListener("click", showSettings);
  backButton?.addEventListener("click", showMenu);
  fontInput?.addEventListener("input", () => commit({ fontScalePercent: Number(fontInput.value) || 100 }));
  outlineInput?.addEventListener("change", () => commit({ heightOutlineOnly: outlineInput.checked }));
  shadingInput?.addEventListener("change", () => commit({ heightShading: shadingInput.checked }));
  zoomInput?.addEventListener("change", () => commit({ showZoomControls: zoomInput.checked }));
  motionInput?.addEventListener("change", () => commit({ reduceMotion: motionInput.checked }));
  resetButton?.addEventListener("click", () => {
    settings = { ...DEFAULT_DISPLAY_SETTINGS };
    saveDisplaySettings(settings);
    syncControls();
    applyDisplaySettings(settings);
  });

  syncControls();
  applyDisplaySettings(settings);
  window.getV39DisplaySettings = () => ({ ...settings });
}

async function bootFieldSettingsEntry() {
  const managePanel = await waitForManagePanel();
  installDisplaySettings(managePanel);

  // Fixed management buttons belong to the static v39 HTML. This runtime only
  // connects behavior and never recreates those buttons.
  const button = document.getElementById("v39-manage-field-settings");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("#v39-manage-field-settings is missing from the stable v39 HTML");
  }

  const modal = createPlaceholderModal();
  if (button.dataset.v39Bound !== "1") {
    button.dataset.v39Bound = "1";
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      modal.open();
    });
  }

  window.openFieldSettingsModal = modal.open;
}

bootFieldSettingsEntry().catch(error => {
  console.error("[v39-field-settings-entry] boot failed", error);
});
