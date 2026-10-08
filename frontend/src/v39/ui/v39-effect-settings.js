import {
  V39_EFFECT_SCALE_MAX,
  V39_EFFECT_SCALE_MIN,
  getV39EffectSetting,
  getV39EffectSettingsCatalog,
  getV39EffectSettingsSnapshot,
  importV39EffectSettings,
  resetV39EffectSetting,
  updateV39EffectSetting
} from "../../lib/v39-effect-settings.js";

let selectedEffectName = "";
let rendering = false;

function element(id) {
  return document.getElementById(id);
}

function installStyles() {
  if (element("v39-effect-settings-style")) return;
  const style = document.createElement("style");
  style.id = "v39-effect-settings-style";
  style.textContent = `
    #v39-effect-settings-panel{height:100%;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto minmax(0,1fr);background:#0e171b;color:#e7efec}
    #v39-effect-settings-panel[hidden]{display:none!important}
    .v39-effect-settings-head{min-height:38px;display:flex;align-items:center;gap:8px;padding:5px 7px;border-bottom:1px solid #3a4c53;background:#142126}
    .v39-effect-settings-head strong{font-size:var(--font-body)}
    .v39-effect-settings-back{min-height:28px;border:1px solid #4b626b;border-radius:6px;background:#18282e;color:#e8f2f0;font:inherit;font-weight:800;cursor:pointer}
    .v39-effect-settings-body{min-height:0;overflow:auto;padding:7px;display:grid;gap:7px;align-content:start}
    .v39-effect-settings-note{margin:0;padding:6px 8px;border:1px solid #31464d;border-radius:7px;background:#101d22;color:#aebec1;font-size:var(--font-secondary);line-height:1.45}
    .v39-effect-setting-row{display:grid;grid-template-columns:minmax(105px,.7fr) minmax(0,1.3fr);align-items:center;gap:7px;padding:6px 8px;border:1px solid #33474e;border-radius:7px;background:#111d22}
    .v39-effect-setting-row>span{font-size:var(--font-secondary);font-weight:800;color:#c7d4d5}
    .v39-effect-setting-row select,.v39-effect-setting-row input[type="number"]{width:100%;min-width:0;min-height:30px;border:1px solid #50646b;border-radius:5px;background:#0d171b;color:#eef5f2;padding:3px 6px;font:inherit}
    .v39-effect-tint-controls{display:grid;grid-template-columns:auto 48px minmax(0,1fr);align-items:center;gap:6px}
    .v39-effect-tint-controls input[type="color"]{width:46px;height:30px;padding:2px;border:1px solid #50646b;border-radius:5px;background:#0d171b}
    .v39-effect-tint-code{color:#a9b8ba;font-size:var(--font-secondary);font-variant-numeric:tabular-nums}
    .v39-effect-settings-actions{display:flex;flex-wrap:wrap;gap:6px;padding:2px 0}
    .v39-effect-settings-actions button{min-height:32px;border:1px solid #49646d;border-radius:6px;background:#173039;color:#eef8f5;padding:5px 9px;font:inherit;font-size:var(--font-secondary);font-weight:800;cursor:pointer}
    .v39-effect-settings-actions button:hover{background:#1d424b;border-color:#76cedb}
    #v39-effect-settings-status{min-height:22px;margin:0;padding:4px 7px;border-radius:5px;background:#0c1519;color:#a9bdc0;font-size:var(--font-secondary);line-height:1.4}
    #v39-effect-settings-status.is-error{color:#f3a092;background:#2c1715}
    @media(max-width:600px){
      .v39-effect-setting-row{grid-template-columns:1fr;gap:4px;padding:6px}
      .v39-effect-settings-body{padding:5px}
      .v39-effect-settings-actions button{flex:1 1 calc(50% - 6px)}
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
    <div class="v39-effect-settings-body">
      <p class="v39-effect-settings-note">実際のエフェクトカタログを編集します。変更はブラウザ内へ自動保存され、戦闘再生へ即時反映されます。</p>
      <label class="v39-effect-setting-row"><span>対象エフェクト</span><select id="v39-effect-setting-source"></select></label>
      <label class="v39-effect-setting-row"><span>基本形状</span><select id="v39-effect-setting-base"></select></label>
      <label class="v39-effect-setting-row"><span>追加装飾</span><select id="v39-effect-setting-decoration"></select></label>
      <label class="v39-effect-setting-row"><span>Tint / 色調</span><span class="v39-effect-tint-controls"><input type="checkbox" id="v39-effect-setting-tint-enabled" aria-label="Tintを使用"><input type="color" id="v39-effect-setting-tint" value="#FFFFFF"><output id="v39-effect-setting-tint-code" class="v39-effect-tint-code">なし</output></span></label>
      <label class="v39-effect-setting-row"><span>基準Scale倍率</span><input type="number" id="v39-effect-setting-scale" min="${V39_EFFECT_SCALE_MIN}" max="${V39_EFFECT_SCALE_MAX}" step="5" value="100"></label>
      <div class="v39-effect-settings-actions">
        <button type="button" id="v39-effect-setting-preview">▶ 実マップでプレビュー</button>
        <button type="button" id="v39-effect-setting-reset">↺ この設定を初期化</button>
        <button type="button" id="v39-effect-settings-export">JSON書き出し</button>
        <button type="button" id="v39-effect-settings-import">JSON読み込み</button>
        <input type="file" id="v39-effect-settings-file" accept=".json,application/json" hidden>
      </div>
      <p id="v39-effect-settings-status" aria-live="polite"></p>
    </div>`;
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
    const scale = element("v39-effect-setting-scale");
    if (source) source.value = selectedEffectName;
    if (base) base.value = setting.baseEffect;
    if (decoration) decoration.value = setting.decorationEffect;
    if (tintEnabled) tintEnabled.checked = !!setting.tint;
    if (tint) {
      tint.value = setting.tint || "#FFFFFF";
      tint.disabled = !setting.tint;
    }
    if (tintCode) tintCode.textContent = setting.tint || "なし";
    if (scale) scale.value = String(setting.scaleMultiplierPercent);
    setStatus(`自動保存: ON / 変更済み ${settingCount()}件`);
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
    scaleMultiplierPercent:element("v39-effect-setting-scale")?.value
  });
  renderSetting();
}

function previewCurrentEffect() {
  const map = window.__v39FieldRuntime?.mapData;
  const play = window.playV39MapEffect;
  if (!map || typeof play !== "function") {
    setStatus("マップ生成後にプレビューできます。", true);
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
    console.error("[エフェクト設定] プレビュー失敗", error);
    setStatus("プレビューに失敗しました。", true);
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
}

function closePanel() {
  const menu = element("v39-manage-menu");
  const panel = element("v39-effect-settings-panel");
  if (!menu || !panel) return;
  panel.hidden = true;
  panel.setAttribute("aria-hidden", "true");
  menu.hidden = false;
}

function bindControls() {
  element("v39-manage-effect-settings")?.addEventListener("click", openPanel);
  element("v39-effect-settings-back")?.addEventListener("click", closePanel);
  element("v39-effect-setting-source")?.addEventListener("change", event => {
    selectedEffectName = event.target.value;
    renderSetting();
  });
  element("v39-effect-setting-base")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-decoration")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-tint-enabled")?.addEventListener("change", event => {
    const tint = element("v39-effect-setting-tint");
    if (tint) tint.disabled = !event.target.checked;
    saveCurrentSetting();
  });
  element("v39-effect-setting-tint")?.addEventListener("input", saveCurrentSetting);
  element("v39-effect-setting-scale")?.addEventListener("change", saveCurrentSetting);
  element("v39-effect-setting-preview")?.addEventListener("click", previewCurrentEffect);
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
  renderSetting();
  window.openV39EffectSettings = openPanel;
}

install();
