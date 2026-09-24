// 初回の開始導線だけを担当する。ゲーム状態・通信状態はここでは変更しない。
const PLAY_MODE_OPTIONS = Object.freeze({
  "single-normal":{ label:"通常プレイ", description:"テストデータを使わず、新規ゲームとして開始します。" },
  "single-test":{ label:"テストプレイ", description:"テストゲーム状態とテスト操作を使って確認します。" },
  multiplayer:{ label:"通常プレイ", description:"ルームを作成または参加し、テストデータなしで開始します。" }
});

let modal = null;
let selectedPlayMode = "";

function createStyles() {
  if (document.getElementById("v39-play-mode-select-style")) return;
  const style = document.createElement("style");
  style.id = "v39-play-mode-select-style";
  style.textContent = `
#v39-play-mode-select{position:fixed;inset:0;z-index:10140;display:none;place-items:center;padding:14px;background:rgba(1,5,8,.84);backdrop-filter:blur(3px)}#v39-play-mode-select.open{display:grid}.v39-play-mode-dialog{width:min(560px,100%);padding:18px;border:1px solid #4b666d;border-radius:12px;background:linear-gradient(180deg,#142126,#0a1216);box-shadow:0 20px 56px rgba(0,0,0,.6);color:#e8efec}.v39-play-mode-dialog h2{margin:0;font-size:20px}.v39-play-mode-dialog>p{margin:6px 0 14px;color:#a5b7ba;font-size:13px}.v39-play-mode-group{display:grid;gap:8px;margin-top:10px}.v39-play-mode-group h3{margin:0;color:#c6d6d8;font-size:14px}.v39-play-mode-options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.v39-play-mode-options.single button{min-height:116px}.v39-play-mode-options.multiplayer{grid-template-columns:1fr}.v39-play-mode-options button{min-height:104px;display:grid;align-content:center;gap:8px;border:1px solid #4c6971;border-radius:10px;background:#13262c;color:#eaf4f2;padding:14px;text-align:left}.v39-play-mode-options button:hover{border-color:#76cad7;background:#17343b}.v39-play-mode-options strong{font-size:18px}.v39-play-mode-options small{color:#a7c0c3;font-size:12px;line-height:1.5}@media(max-width:500px){.v39-play-mode-dialog{padding:15px;border-radius:8px}.v39-play-mode-options{grid-template-columns:1fr}.v39-play-mode-options button{min-height:88px}}
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
        <h3>シングルプレイ</h3>
        <div class="v39-play-mode-options single">
          <button type="button" data-v39-play-mode="single-normal"><strong>${PLAY_MODE_OPTIONS["single-normal"].label}</strong><small>${PLAY_MODE_OPTIONS["single-normal"].description}</small></button>
          <button type="button" data-v39-play-mode="single-test"><strong>${PLAY_MODE_OPTIONS["single-test"].label}</strong><small>${PLAY_MODE_OPTIONS["single-test"].description}</small></button>
        </div>
      </section>
      <section class="v39-play-mode-group">
        <h3>マルチプレイ</h3>
        <div class="v39-play-mode-options multiplayer">
          <button type="button" data-v39-play-mode="multiplayer"><strong>${PLAY_MODE_OPTIONS.multiplayer.label}</strong><small>${PLAY_MODE_OPTIONS.multiplayer.description}</small></button>
        </div>
      </section>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-v39-play-mode]") : null;
    if (!(button instanceof HTMLElement)) return;
    selectPlayMode(button.dataset.v39PlayMode);
  });
  return modal;
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
}

function closePlayModeSelection() {
  modal?.classList.remove("open");
  modal?.setAttribute("aria-hidden", "true");
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
  window.openFieldSettingsModal?.({ playMode });
}

function boot() {
  createStyles();
  createModal();
  window.openV39PlayModeSelection = openPlayModeSelection;
  window.closeV39PlayModeSelection = closePlayModeSelection;
  window.getV39PlayMode = () => selectedPlayMode;
}

boot();
