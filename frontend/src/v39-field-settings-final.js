const FIELD_SETTINGS_STORAGE_KEY = "v39-field-settings-v1";

const DEFAULT_FIELD_SETTINGS = Object.freeze({
  mapSize: "60x60",
  patternId: "realistic",
  mountainMode: "random",
  enemySpawnTileDivisor: 40,
  islandCustomSettings: {
    enabled: false,
    largeIslandCount: 2,
    isletCountMin: 1,
    isletCountMax: 4,
    targetLandRatio: 0.5,
    largeIslandMinGap: 6,
    riverPerContinentMin: 3,
    riverPerContinentMax: 4,
    worldWrapEnabled: true
  }
});

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadFieldSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(FIELD_SETTINGS_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return deepClone(DEFAULT_FIELD_SETTINGS);
    return {
      ...deepClone(DEFAULT_FIELD_SETTINGS),
      ...saved,
      islandCustomSettings: {
        ...deepClone(DEFAULT_FIELD_SETTINGS.islandCustomSettings),
        ...(saved.islandCustomSettings || {})
      }
    };
  } catch {
    return deepClone(DEFAULT_FIELD_SETTINGS);
  }
}

function saveFieldSettings(settings) {
  localStorage.setItem(FIELD_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function parseMapSize(value) {
  const [wRaw, hRaw] = String(value || "60x60").split("x");
  return { w: Number(wRaw) || 60, h: Number(hRaw) || 60 };
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Math.max(min, Math.min(max, Number.isFinite(n) ? n : fallback));
}

function createStyles() {
  if (document.getElementById("v39-field-settings-final-style")) return;
  const style = document.createElement("style");
  style.id = "v39-field-settings-final-style";
  style.textContent = `
#v39-field-settings-modal{position:fixed;inset:0;z-index:10050;display:none;place-items:center;padding:max(8px,var(--safe-t,0px)) max(8px,var(--safe-r,0px)) max(8px,var(--safe-b,0px)) max(8px,var(--safe-l,0px));background:rgba(1,5,8,.82);backdrop-filter:blur(3px)}
#v39-field-settings-modal.open{display:grid}
#v39-field-settings-dialog{width:min(860px,100%);height:min(760px,100%);max-height:calc(100svh - 16px);display:grid;grid-template-rows:48px minmax(0,1fr) auto;border:1px solid #46575e;border-radius:10px;background:linear-gradient(180deg,#111c20,#0a1216);box-shadow:0 18px 50px rgba(0,0,0,.62);overflow:hidden;color:#e8efec}
.v39-field-settings-head{display:flex;align-items:center;gap:8px;padding:8px 10px;border-bottom:1px solid #34444a;background:#111c21}.v39-field-settings-head h2{font-size:15px;margin:0}.v39-field-settings-head small{font-size:13px;color:#829499}.v39-field-settings-head button{margin-left:auto;width:34px;height:30px;border:1px solid #46575d;border-radius:7px;background:#172429;color:#e8efec}
.v39-field-settings-body{min-height:0;overflow:auto;padding:10px;display:grid;gap:10px;align-content:start}.v39-field-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v39-field-setting-card{padding:9px;border:1px solid #34444a;border-radius:8px;background:#111a1e;display:grid;gap:6px}.v39-field-setting-card>span,.v39-island-grid label>span{font-size:13px;color:#aebbbd;font-weight:700}.v39-field-setting-card select,.v39-field-setting-card input,.v39-island-grid input{width:100%;min-height:36px;border:1px solid #46575d;border-radius:7px;background:#162227;color:#e8efec;padding:6px 8px}.v39-field-setting-card small{font-size:13px;color:#7f9196;line-height:1.5}.v39-section-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800}.v39-section-title label{margin-left:auto;font-size:13px;font-weight:600}.v39-island-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.v39-island-grid label{display:grid;gap:4px;padding:7px;border:1px solid #2f3f45;border-radius:7px;background:#0e171b}.v39-island-grid.is-disabled{opacity:.45;pointer-events:none}.v39-range-pair{display:grid;grid-template-columns:1fr auto 1fr;gap:5px;align-items:center}.v39-field-settings-actions{display:flex;gap:8px;padding:9px 10px;border-top:1px solid #34444a;background:#0d161a}.v39-field-settings-actions button{min-height:40px;border:1px solid #4c6067;border-radius:8px;background:#172329;color:#e8efec;padding:0 14px;font-weight:800}.v39-field-settings-actions .primary{margin-left:auto;border-color:#66b7c6;background:#17414a}.v39-field-settings-actions .danger{border-color:#66504b;background:#261b18}.v39-field-settings-status{font-size:13px;color:#91a4a9;align-self:center}
@media(max-width:700px){#v39-field-settings-dialog{width:100%;height:100%;max-height:none;border-radius:6px}.v39-field-settings-grid{grid-template-columns:1fr}.v39-island-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v39-field-settings-actions{position:sticky;bottom:0}.v39-field-settings-head small{display:none}}
`;
  document.head.appendChild(style);
}

function createModal() {
  document.getElementById("v39-field-settings-placeholder")?.remove();
  document.getElementById("v39-field-settings-modal")?.remove();

  const overlay = document.createElement("div");
  overlay.id = "v39-field-settings-modal";
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <section id="v39-field-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="v39-field-settings-title">
      <header class="v39-field-settings-head">
        <div><h2 id="v39-field-settings-title">フィールド設定</h2><small>旧フィールド生成ルールをそのまま使用</small></div>
        <button type="button" data-field-close aria-label="閉じる">×</button>
      </header>
      <div class="v39-field-settings-body">
        <div class="v39-field-settings-grid">
          <label class="v39-field-setting-card"><span>マップサイズ</span>
            <select id="v39-field-map-size">
              <option value="30x40">下限 30×40（1200マス）</option>
              <option value="36x36">標準 36×36（1296マス / 推奨）</option>
              <option value="48x48">大 48×48（2304マス）</option>
              <option value="60x60">特大 60×60（3600マス）</option>
              <option value="72x72">超特大 72×72（5184マス）</option>
              <option value="83x83">最大 83×83（6889マス）</option>
            </select>
          </label>
          <label class="v39-field-setting-card"><span>島形状パターン</span>
            <select id="v39-field-pattern">
              <option value="realistic">リアル島</option>
              <option value="balanced">標準諸島</option>
              <option value="continent">大陸型</option>
              <option value="archipelago">多島海</option>
              <option value="twins">双子島</option>
              <option value="chain">列島型</option>
            </select>
          </label>
          <label class="v39-field-setting-card"><span>山岳モード</span>
            <select id="v39-field-mountain">
              <option value="random">ランダム（単峰 / 群峰 / 混合）</option>
              <option value="single">単峰 固定</option>
              <option value="multi">群峰 固定</option>
              <option value="mixed">混合 固定</option>
            </select>
          </label>
          <label class="v39-field-setting-card"><span>敵出現密度</span>
            <input id="v39-field-enemy-divisor" type="number" min="20" max="60" step="5">
            <small>敵数 = 出現可能マス数 ÷ 設定値。20ほど多く、60ほど少なくなります。</small>
          </label>
          <div class="v39-field-setting-card"><span>ワールド端接続</span><label><input type="checkbox" id="v39-field-wrap"> 左右上下の端を接続する</label><small>旧カスタム設定の worldWrapEnabled を使用します。</small></div>
        </div>

        <section class="v39-field-setting-card">
          <div class="v39-section-title">島カスタム設定 <label><input type="checkbox" id="v39-field-custom-enabled"> 使用する</label></div>
          <small>ON時は島形状パターンを土台に、大島・孤島構成と目標陸地率を上書きします。</small>
          <div class="v39-island-grid" id="v39-field-custom-grid">
            <label><span>大島の数</span><input id="v39-field-large-islands" type="number" min="1" max="8" step="1"></label>
            <label><span>大島間の最小距離</span><input id="v39-field-island-gap" type="number" min="2" max="12" step="1"></label>
            <label><span>目標陸地率（%）</span><input id="v39-field-land-percent" type="number" min="25" max="60" step="1"></label>
            <label><span>孤島数</span><div class="v39-range-pair"><input id="v39-field-islet-min" type="number" min="0" max="12" step="1"><b>〜</b><input id="v39-field-islet-max" type="number" min="0" max="12" step="1"></div></label>
            <label><span>大陸あたり川本数</span><div class="v39-range-pair"><input id="v39-field-river-min" type="number" min="1" max="12" step="1"><b>〜</b><input id="v39-field-river-max" type="number" min="1" max="12" step="1"></div></label>
          </div>
        </section>
      </div>
      <footer class="v39-field-settings-actions">
        <span class="v39-field-settings-status" id="v39-field-settings-status">未生成</span>
        <button type="button" class="danger" id="v39-field-settings-reset">初期値</button>
        <button type="button" data-field-close>キャンセル</button>
        <button type="button" class="primary" id="v39-field-generate">生成</button>
      </footer>
    </section>`;
  document.body.appendChild(overlay);
  return overlay;
}

function boot() {
  createStyles();
  let settings = loadFieldSettings();
  const overlay = createModal();
  const get = id => document.getElementById(id);

  const sync = () => {
    get("v39-field-map-size").value = settings.mapSize;
    get("v39-field-pattern").value = settings.patternId;
    get("v39-field-mountain").value = settings.mountainMode;
    get("v39-field-enemy-divisor").value = Math.round(clampNumber(settings.enemySpawnTileDivisor, 20, 60, 40));
    get("v39-field-custom-enabled").checked = !!settings.islandCustomSettings.enabled;
    get("v39-field-wrap").checked = settings.islandCustomSettings.worldWrapEnabled !== false;
    get("v39-field-large-islands").value = settings.islandCustomSettings.largeIslandCount;
    get("v39-field-island-gap").value = settings.islandCustomSettings.largeIslandMinGap;
    get("v39-field-land-percent").value = Math.round(settings.islandCustomSettings.targetLandRatio * 100);
    get("v39-field-islet-min").value = settings.islandCustomSettings.isletCountMin;
    get("v39-field-islet-max").value = settings.islandCustomSettings.isletCountMax;
    get("v39-field-river-min").value = settings.islandCustomSettings.riverPerContinentMin;
    get("v39-field-river-max").value = settings.islandCustomSettings.riverPerContinentMax;
    get("v39-field-custom-grid").classList.toggle("is-disabled", !settings.islandCustomSettings.enabled);
  };

  const read = () => {
    const isletA = clampNumber(get("v39-field-islet-min").value, 0, 12, 1);
    const isletB = clampNumber(get("v39-field-islet-max").value, 0, 12, 4);
    const riverA = clampNumber(get("v39-field-river-min").value, 1, 12, 3);
    const riverB = clampNumber(get("v39-field-river-max").value, 1, 12, 4);
    settings = {
      mapSize: get("v39-field-map-size").value,
      patternId: get("v39-field-pattern").value,
      mountainMode: get("v39-field-mountain").value,
      enemySpawnTileDivisor: Math.round(clampNumber(get("v39-field-enemy-divisor").value, 20, 60, 40)),
      islandCustomSettings: {
        enabled: get("v39-field-custom-enabled").checked,
        worldWrapEnabled: get("v39-field-wrap").checked,
        largeIslandCount: Math.round(clampNumber(get("v39-field-large-islands").value, 1, 8, 2)),
        largeIslandMinGap: Math.round(clampNumber(get("v39-field-island-gap").value, 2, 12, 6)),
        targetLandRatio: clampNumber(get("v39-field-land-percent").value, 25, 60, 50) / 100,
        isletCountMin: Math.round(Math.min(isletA, isletB)),
        isletCountMax: Math.round(Math.max(isletA, isletB)),
        riverPerContinentMin: Math.round(Math.min(riverA, riverB)),
        riverPerContinentMax: Math.round(Math.max(riverA, riverB))
      }
    };
    return settings;
  };

  const open = () => {
    sync();
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
  };

  overlay.querySelectorAll("[data-field-close]").forEach(button => button.addEventListener("click", close));
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  get("v39-field-custom-enabled").addEventListener("change", () => {
    settings.islandCustomSettings.enabled = get("v39-field-custom-enabled").checked;
    get("v39-field-custom-grid").classList.toggle("is-disabled", !settings.islandCustomSettings.enabled);
  });
  get("v39-field-settings-reset").addEventListener("click", () => { settings = deepClone(DEFAULT_FIELD_SETTINGS); sync(); });
  get("v39-field-generate").addEventListener("click", () => {
    const next = read();
    const { w, h } = parseMapSize(next.mapSize);
    if (typeof window.generateFieldFromSettings !== "function") {
      get("v39-field-settings-status").textContent = "フィールドruntime待機中";
      return;
    }
    get("v39-field-settings-status").textContent = "生成中…";
    try {
      window.generateFieldFromSettings({
        w,
        h,
        patternId:next.patternId,
        mountainMode:next.mountainMode,
        enemySpawnTileDivisor:next.enemySpawnTileDivisor,
        islandCustomSettings:next.islandCustomSettings
      });
      if (window.__v39FieldRuntime?.settings) {
        window.__v39FieldRuntime.settings.enemySpawnTileDivisor = next.enemySpawnTileDivisor;
      }
      saveFieldSettings(next);
      get("v39-field-settings-status").textContent = `${w}×${h} / 敵密度 ÷${next.enemySpawnTileDivisor} 生成完了`;
      close();
    } catch (error) {
      console.error("[v39-field-settings-final] generation failed", error);
      get("v39-field-settings-status").textContent = "生成失敗";
    }
  });

  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("#v39-manage-field-settings") : null;
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);

  window.addEventListener("keydown", e => { if (e.key === "Escape" && overlay.classList.contains("open")) close(); });
  window.openFieldSettingsModal = open;
  window.closeFieldSettingsModal = close;
  window.getV39FieldSettings = () => deepClone(settings);

  sync();
  const maybeOpenInitial = () => {
    const generated = !!window.__v39FieldRuntime?.mapData;
    if (!generated) open();
  };
  if (typeof window.generateFieldFromSettings === "function") maybeOpenInitial();
  else window.addEventListener("v39:field-runtime-ready", maybeOpenInitial, { once:true });
}

boot();