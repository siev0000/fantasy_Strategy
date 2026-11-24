// 初回の開始導線だけを担当する。ゲーム状態・通信状態はここでは変更しない。
import "./v39-cave-test.js";
import {openV39EnchantmentColorSettings} from "../unit/v39-enchantment-color-settings.js";
import {openV39AudioSettings} from "../ui/v39-audio-settings.js";
const PLAY_MODE_OPTIONS = Object.freeze({
  "single-normal":{ label:"通常プレイ", description:"テストデータを使わず、新規ゲームとして開始します。" },
  "single-test":{ label:"テストプレイ", description:"通常プレイと同じ流れ・ルールで開始し、テストデータとテスト操作を追加します。" },
  multiplayer:{ label:"通常プレイ", description:"ルームを作成または参加し、テストデータなしで開始します。" }
});

let modal = null;
let selectedPlayMode = "";
let loadingSave = false;
let loadingFixedMap = false;
let editingFixedMap = false;

function createStyles() {
  if (document.getElementById("v39-play-mode-select-style")) return;
  const style = document.createElement("style");
  style.id = "v39-play-mode-select-style";
  style.textContent = `
#v39-play-mode-select{position:fixed;inset:0;z-index:10140;display:none;place-items:center;padding:14px;background:rgba(1,5,8,.84);backdrop-filter:blur(3px)}#v39-play-mode-select.open{display:grid}.v39-play-mode-dialog{width:min(560px,100%);max-height:calc(100dvh - 28px);overflow:auto;padding:18px;border:1px solid #4b666d;border-radius:12px;background:linear-gradient(180deg,#142126,#0a1216);box-shadow:0 20px 56px rgba(0,0,0,.6);color:#e8efec}.v39-play-mode-dialog h2{margin:0;font-size:var(--font-heading)}.v39-play-mode-dialog>p{margin:6px 0 14px;color:#a5b7ba;font-size:var(--font-secondary)}.v39-play-mode-group{display:grid;gap:8px;margin-top:10px}.v39-play-mode-group h3{margin:0;color:#c6d6d8;font-size:var(--font-size-14)}.v39-play-mode-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v39-play-mode-options.single button{min-height:116px}.v39-play-mode-options.multiplayer{grid-template-columns:1fr}.v39-play-mode-options button{min-height:104px;display:grid;align-content:center;gap:8px;border:1px solid #4c6971;border-radius:10px;background:#13262c;color:#eaf4f2;padding:14px;text-align:left}.v39-play-mode-options button:hover{border-color:#76cad7;background:#17343b}.v39-play-mode-options strong{font-size:var(--font-size-18)}.v39-play-mode-options small{color:#a7c0c3;font-size:var(--font-compact);line-height:1.5}@media(max-width:500px){.v39-play-mode-dialog{padding:15px;border-radius:8px}.v39-play-mode-options{grid-template-columns:1fr}.v39-play-mode-options button{min-height:88px}}
`;
  style.textContent += `
.v39-play-mode-dialog .v39-play-mode-reference {
  width:100%; min-height:38px; margin-top:12px; padding:6px 10px;
  border:1px solid #4c6971; border-radius:8px; background:#13262c; color:#eaf4f2;
  font:inherit; text-align:left;
}
.v39-play-mode-dialog .v39-play-mode-reference:is(:hover,:focus-visible) { border-color:#76cad7; background:#17343b; }
.v39-play-mode-settings:not([hidden]) { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin-top:6px; }
.v39-play-mode-settings .v39-play-mode-reference { margin-top:0; }
.v39-play-mode-reference-status { display:block; margin-top:4px; color:#efaa96; }
.v39-play-mode-reference-status:empty { display:none; }
[data-v39-fixed-map-status] { white-space:pre-line; }
`;
  document.head.appendChild(style);
}

function createModal() {
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "v39-play-mode-select";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <section class="v39-play-mode-dialog" role="dialog" aria-modal="true" aria-labelledby="v39-play-mode-title">
      <h2 id="v39-play-mode-title">プレイ形式を選択</h2>
      <p>ゲーム開始設定の前に、遊び方を選択してください。</p>
      <section class="v39-play-mode-group">
        <div class="v39-play-mode-options multiplayer">
          <button type="button" data-v39-start-load><strong>セーブデータから再開</strong><small>保存したゲームを読み込みます。</small></button>
        </div>
        <input id="v39-start-save-file" type="file" accept="application/json,.json" hidden>
        <output id="v39-start-save-status" role="status"></output>
      </section>
      <section class="v39-play-mode-group">
        <h3>シングルプレイ</h3>
        <div class="v39-play-mode-options single">
          <button type="button" data-v39-play-mode="single-normal"><strong>${PLAY_MODE_OPTIONS["single-normal"].label}</strong><small>${PLAY_MODE_OPTIONS["single-normal"].description}</small></button>
          <button type="button" data-v39-play-mode="single-test"><strong>${PLAY_MODE_OPTIONS["single-test"].label}</strong><small>${PLAY_MODE_OPTIONS["single-test"].description}</small></button>
          <button type="button" data-v39-start-fixed-map><strong>固定マップで開始</strong><small>固定マップのJSONを選び、ターン1から始めます。</small></button>
          <button type="button" data-v39-edit-fixed-map><strong>固定マップ作成</strong><small>地形と勢力を配置し、JSONに保存します。</small></button>
          <button type="button" data-v39-test-tools><strong>テスト操作</strong><small>召喚・呼集、輸送・道具・支援、侵入・再巣化などの専用テストを選択します。</small></button>
          <button type="button" data-v39-cave-test><strong>洞窟生成テスト</strong><small>洞窟の形状・出入口・モンスター配置を確認します。</small></button>
        </div>
        <input id="v39-start-fixed-map-file" type="file" accept="application/json,.json" hidden>
        <output class="v39-play-mode-reference-status" data-v39-fixed-map-status role="status"></output>
      </section>
      <section class="v39-play-mode-group">
        <h3>マルチプレイ</h3>
        <div class="v39-play-mode-options multiplayer">
          <button type="button" data-v39-play-mode="multiplayer"><strong>${PLAY_MODE_OPTIONS.multiplayer.label}</strong><small>${PLAY_MODE_OPTIONS.multiplayer.description}</small></button>
        </div>
      </section>
      <button type="button" class="v39-play-mode-reference" data-v39-start-settings aria-expanded="false" aria-controls="v39-start-settings">設定</button>
      <div id="v39-start-settings" class="v39-play-mode-settings" hidden>
        <button type="button" class="v39-play-mode-reference" data-v39-equipment-icon-reference>アイコン設定</button>
        <button type="button" class="v39-play-mode-reference" data-v39-start-enchantment-colors>付与カラー設定</button>
        <button type="button" class="v39-play-mode-reference" data-v39-start-audio data-audio-se="open">音量設定</button>
        <button type="button" class="v39-play-mode-reference" data-v39-start-name-generator>名前作成</button>
      </div>
      <output class="v39-play-mode-reference-status" data-v39-start-name-generator-status role="status"></output>
      <output class="v39-play-mode-reference-status" data-v39-equipment-icon-reference-status role="status"></output>
    </section>`;
  document.body.appendChild(modal);
  const saveInput = modal.querySelector("#v39-start-save-file");
  saveInput.addEventListener("change", async () => {
    const file = saveInput.files?.[0];
    if (!file || loadingSave) return;
    const status = modal.querySelector("#v39-start-save-status");
    const buttons = [...modal.querySelectorAll("button")];
    loadingSave = true;
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = "セーブデータ読込中…";
    try {
      if (typeof window.importV39SaveJson !== "function") throw new Error("ゲームの準備中です。少し待ってから再度読み込んでください。");
      window.importV39SaveJson(await file.text());
      status.textContent = "セーブデータを読み込みました";
      closePlayModeSelection();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : "読込に失敗しました";
    } finally {
      loadingSave = false;
      saveInput.value = "";
      buttons.forEach(button => { button.disabled = false; });
    }
  });
  const settingsButton = modal.querySelector("[data-v39-start-settings]");
  const settingsMenu = modal.querySelector("#v39-start-settings");
  settingsButton.addEventListener("click", () => {
    settingsMenu.hidden = !settingsMenu.hidden;
    settingsButton.setAttribute("aria-expanded", String(!settingsMenu.hidden));
  });
  modal.querySelector("[data-v39-start-enchantment-colors]").addEventListener("click", () => {
    void openV39EnchantmentColorSettings();
  });
  modal.querySelector("[data-v39-start-audio]").addEventListener("click",openV39AudioSettings);
  const nameGeneratorButton = modal.querySelector("[data-v39-start-name-generator]");
  nameGeneratorButton.addEventListener("click", () => { void openNameGeneratorFromStart(nameGeneratorButton); });
  const fixedMapInput = modal.querySelector("#v39-start-fixed-map-file");
  const fixedMapStatus = modal.querySelector("[data-v39-fixed-map-status]");
  modal.querySelector("[data-v39-start-fixed-map]").addEventListener("click", () => fixedMapInput.click());
  fixedMapInput.addEventListener("change", async () => {
    const file = fixedMapInput.files?.[0];
    fixedMapInput.value = "";
    if (!file || loadingFixedMap) return;
    fixedMapStatus.textContent = "固定マップを読み込んでいます…";
    try {
      await runFixedMapStart(await file.text());
      fixedMapStatus.textContent = "";
    } catch (error) {
      fixedMapStatus.textContent = error.message;
    }
  });
  modal.querySelector("[data-v39-edit-fixed-map]").addEventListener("click", event => {
    void openFixedMapEditor(event.currentTarget, fixedMapStatus);
  });
  modal.addEventListener("click", event => {
    if (loadingSave || loadingFixedMap) return;
    const iconReference = event.target instanceof Element ? event.target.closest("[data-v39-equipment-icon-reference]") : null;
    if (iconReference) {
      void openEquipmentIconReference(iconReference);
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-v39-start-load]")) {
      saveInput.click();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-v39-test-tools]")) {
      void openTestToolsFromStart();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-v39-cave-test]")) {
      closePlayModeSelection();
      window.dispatchEvent(new CustomEvent("v39:cave-test-requested"));
      return;
    }
    const button = event.target instanceof Element ? event.target.closest("[data-v39-play-mode]") : null;
    if (!(button instanceof HTMLElement)) return;
    selectPlayMode(button.dataset.v39PlayMode);
  });
  return modal;
}

async function runFixedMapStart(input) {
  if (loadingFixedMap) throw new Error("固定マップを読み込んでいます。");
  loadingFixedMap = true;
  try {
    const {parseV39FixedMap,buildV39FixedMapStart} = await import("../../lib/v39-fixed-map.js");
    const setup = buildV39FixedMapStart(typeof input === "string" ? parseV39FixedMap(input) : input);
    if (typeof window.startV39FixedMapSession !== "function" || typeof window.loadV39FieldSnapshot !== "function") {
      throw new Error("ゲームの準備中です。少し待ってから再度お試しください。");
    }
    await window.setV39TestMode?.(false);
    selectedPlayMode = "single-normal";
    window.startV39FixedMapSession(setup);
    closePlayModeSelection();
  } finally {
    loadingFixedMap = false;
  }
}

async function openFixedMapEditor(button, status) {
  if (loadingSave || loadingFixedMap || button.disabled) return;
  button.disabled = true;
  status.textContent = "";
  let host;
  let app;
  let restore;
  try {
    const [{createApp},{default:Editor}] = await Promise.all([
      import("vue"),import("../../components/V39FixedMapEditor.vue")
    ]);
    if (loadingSave || loadingFixedMap || !modal.classList.contains("open")) return;
    if (!document.querySelector(".footer-body") || typeof window.startV39FixedMapSession !== "function"
      || typeof window.loadV39FieldSnapshot !== "function") {
      throw new Error("ゲームの準備中です。少し待ってから再度お試しください。");
    }
    const oldState = window.getV39GameState();
    const {mapData:oldMap,settings:oldSettings} = window.__v39FieldRuntime ?? {};
    restore = () => {
      window.clearV39GameState({silent:true});
      window.setV39GameState(oldState,{reason:"save-loaded"});
      if (oldMap) window.loadV39FieldSnapshot(oldMap,oldSettings,{worldId:oldState.activeWorldId});
    };
    host = document.createElement("div");
    document.body.append(host);
    const close = () => {
      app.unmount();
      host.remove();
      editingFixedMap = false;
      document.body.classList.remove("v39-fixed-map-editing");
    };
    app = createApp(Editor,{
      onClose:() => {
        close();
        restore();
        window.activateV39FooterTab?.("squad");
        openPlayModeSelection();
        button.focus();
      },
      onStart:async (data, reportError) => {
        try {
          await runFixedMapStart(data);
          close();
          window.activateV39FooterTab?.("squad");
        } catch (error) {
          reportError(error);
        }
      }
    });
    editingFixedMap = true;
    document.body.classList.add("v39-fixed-map-editing");
    closePlayModeSelection();
    app.mount(host);
  } catch (error) {
    app?.unmount();
    host?.remove();
    editingFixedMap = false;
    document.body.classList.remove("v39-fixed-map-editing");
    restore?.();
    openPlayModeSelection();
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

function normalizePlayMode(value) {
  if (value === "multiplayer") return "multiplayer";
  if (value === "single-test") return "single-test";
  return "single-normal";
}

function openPlayModeSelection() {
  createStyles();
  createModal();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  window.dispatchEvent(new CustomEvent("v39:play-mode-opened"));
}

function closePlayModeSelection() {
  const wasOpen = modal?.classList.contains("open");
  modal?.classList.remove("open");
  modal?.setAttribute("aria-hidden", "true");
  if (wasOpen) window.dispatchEvent(new CustomEvent("v39:play-mode-closed"));
}

async function openNameGeneratorFromStart(button) {
  if (loadingSave || loadingFixedMap || button.disabled) return;
  button.disabled = true;
  const status = modal.querySelector("[data-v39-start-name-generator-status]");
  status.textContent = "";
  let host;
  let app;
  try {
    const [{createApp},{default:NameGeneratorModal}] = await Promise.all([
      import("vue"), import("../../components/NameGeneratorModal.vue")
    ]);
    if (loadingSave || loadingFixedMap || !modal.classList.contains("open")) return;
    host = document.createElement("div");
    document.body.appendChild(host);
    app = createApp(NameGeneratorModal, {
      show: true,
      onClose: () => {
        app.unmount();
        host.remove();
        openPlayModeSelection();
        button.focus();
      }
    });
    app.mount(host);
    closePlayModeSelection();
  } catch (error) {
    app?.unmount();
    host?.remove();
    status.textContent = "名前作成画面を読み込めませんでした。";
    console.error("[名前作成]", error);
  } finally {
    button.disabled = false;
  }
}

async function openEquipmentIconReference(button) {
  if (button.disabled) return;
  button.disabled = true;
  const status = modal.querySelector("[data-v39-equipment-icon-reference-status]");
  status.textContent = "";
  let host;
  try {
    const [{ createApp }, { default: EquipmentIconReferenceModal }] = await Promise.all([
      import("vue"), import("../../components/EquipmentIconReferenceModal.vue")
    ]);
    if (loadingSave || !modal.classList.contains("open")) return;
    host = document.createElement("div");
    document.body.appendChild(host);
    const app = createApp(EquipmentIconReferenceModal, {
      show:true,
      onClose:() => {
        app.unmount();
        host.remove();
        openPlayModeSelection();
        button.focus();
      }
    });
    app.mount(host);
    closePlayModeSelection();
  } catch (error) {
    host?.remove();
    status.textContent = "装備アイコン一覧を読み込めませんでした。";
    console.error("[装備アイコン一覧]", error);
  } finally {
    button.disabled = false;
  }
}

async function openTestToolsFromStart() {
  selectedPlayMode = "single-test";
  try {
    await window.setV39TestMode?.(true);
  } catch (error) {
    console.error("[v39 play mode] test mode enable failed", error);
    return;
  }
  closePlayModeSelection();
  window.requestAnimationFrame(() => window.openV39TestTools?.());
}

function selectPlayMode(value) {
  const playMode = normalizePlayMode(value);
  selectedPlayMode = playMode;
  window.setV39TestMode?.(playMode === "single-test");
  closePlayModeSelection();
  window.dispatchEvent(new CustomEvent("v39:play-mode-selected", { detail:{ playMode } }));
  if (playMode === "multiplayer") {
    window.openV39MultiplayerLobby?.({ mode:"create" });
    return;
  }
  if (window.openV39PreMapSovereignSetup?.({ playMode, playerId:"player-1" })) {
    return;
  }
  window.openFieldSettingsModal?.({ playMode });
}

function boot() {
  createStyles();
  createModal();
  window.openV39PlayModeSelection = openPlayModeSelection;
  window.closeV39PlayModeSelection = closePlayModeSelection;
  window.getV39PlayMode = () => selectedPlayMode;
  window.isV39FixedMapEditing = () => editingFixedMap;
}

boot();
