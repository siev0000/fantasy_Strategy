let titleMode = false;
let originalParent = null;
let originalNextSibling = null;
let titleHost = null;
let defaultBackLabel = "← 管理";

function element(id) {
  return document.getElementById(id);
}

function installStyles() {
  if (element("v39-title-effect-settings-style")) return;
  const style = document.createElement("style");
  style.id = "v39-title-effect-settings-style";
  style.textContent = `
    #v39-title-effect-settings-host{
      position:fixed;inset:0;z-index:10160;display:grid;place-items:center;padding:18px;
      background:rgba(2,8,11,.9);backdrop-filter:blur(4px)
    }
    #v39-title-effect-settings-host #v39-effect-settings-panel{
      width:min(760px,96vw);height:min(860px,94vh);min-height:0;
      border:1px solid #49616a;border-radius:12px;overflow:hidden;
      box-shadow:0 22px 70px rgba(0,0,0,.58)
    }
    #v39-title-effect-settings-entry{margin-top:10px}
    #v39-title-effect-settings-entry .v39-play-mode-options{grid-template-columns:1fr}
    @media(max-width:600px){
      #v39-title-effect-settings-host{padding:0}
      #v39-title-effect-settings-host #v39-effect-settings-panel{
        width:100%;height:100%;border-radius:0;border-left:0;border-right:0
      }
    }
  `;
  document.head.appendChild(style);
}

function ensureTitleEntry() {
  const modal = element("v39-play-mode-select");
  const dialog = modal?.querySelector(".v39-play-mode-dialog");
  if (!(dialog instanceof HTMLElement) || element("v39-title-effect-settings-entry")) return;

  const section = document.createElement("section");
  section.id = "v39-title-effect-settings-entry";
  section.className = "v39-play-mode-group";
  section.innerHTML = `
    <h3>設定</h3>
    <div class="v39-play-mode-options multiplayer">
      <button type="button" id="v39-title-effect-settings-open">
        <strong>エフェクト設定</strong>
        <small>色・グラデーション・Scale・JSON入出力をゲーム開始前に調整します。</small>
      </button>
    </div>`;
  dialog.appendChild(section);
  element("v39-title-effect-settings-open")?.addEventListener("click", openFromTitle);
}

function ensureHost() {
  titleHost?.remove();
  const host = document.createElement("div");
  host.id = "v39-title-effect-settings-host";
  host.setAttribute("role", "dialog");
  host.setAttribute("aria-modal", "true");
  host.setAttribute("aria-label", "エフェクト設定");
  document.body.appendChild(host);
  titleHost = host;
  return host;
}

function openFromTitle() {
  const panel = element("v39-effect-settings-panel");
  const back = element("v39-effect-settings-back");
  if (!(panel instanceof HTMLElement) || typeof window.openV39EffectSettings !== "function") return false;

  if (!titleMode) {
    originalParent = panel.parentNode;
    originalNextSibling = panel.nextSibling;
    defaultBackLabel = back?.textContent || "← 管理";
  }

  // プレビューは実際に表示されるホストへ移動した後で初期化する。
  // 非表示の管理領域上で Phaser を起動してから DOM を移動すると、
  // タイトル画面ではプレビューCanvas/画像ロードが安定しない。
  ensureHost().appendChild(panel);
  titleMode = true;
  if (back) back.textContent = "← タイトル";
  window.openV39EffectSettings();
  return true;
}

function closeTitleSettings() {
  if (!titleMode) return false;
  const panel = element("v39-effect-settings-panel");
  const back = element("v39-effect-settings-back");

  if (panel) {
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    if (originalParent) {
      if (originalNextSibling?.parentNode === originalParent) originalParent.insertBefore(panel, originalNextSibling);
      else originalParent.appendChild(panel);
    }
  }

  const menu = element("v39-manage-menu");
  if (menu) menu.hidden = false;
  if (back) back.textContent = defaultBackLabel;

  titleHost?.remove();
  titleHost = null;
  titleMode = false;
  originalParent = null;
  originalNextSibling = null;
  return true;
}

function bindBackCapture() {
  element("v39-effect-settings-back")?.addEventListener("click", event => {
    if (!titleMode) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closeTitleSettings();
  }, true);
}

function install() {
  installStyles();
  ensureTitleEntry();
  bindBackCapture();
  window.addEventListener("v39:bootstrap-complete", ensureTitleEntry);
  window.openV39TitleEffectSettings = openFromTitle;
  window.closeV39TitleEffectSettings = closeTitleSettings;
}

install();
