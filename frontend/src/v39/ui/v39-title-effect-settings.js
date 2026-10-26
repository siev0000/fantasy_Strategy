function element(id) {
  return document.getElementById(id);
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

function openFromTitle() {
  if (typeof window.openV39EffectSettings !== "function") return false;
  window.openV39EffectSettings({returnTo:"title"});
  return true;
}

function closeTitleSettings() {
  const host = element("v39-effect-settings-host");
  if (!host || host.hidden || element("v39-effect-settings-back")?.textContent !== "← タイトル") return false;
  window.closeV39EffectSettings?.();
  return true;
}

function install() {
  const style = document.createElement("style");
  style.id = "v39-title-effect-settings-style";
  style.textContent = `#v39-title-effect-settings-entry{margin-top:10px}
    #v39-title-effect-settings-entry .v39-play-mode-options{grid-template-columns:1fr}`;
  document.head.appendChild(style);
  ensureTitleEntry();
  window.addEventListener("v39:bootstrap-complete", ensureTitleEntry);
  window.openV39TitleEffectSettings = openFromTitle;
  window.closeV39TitleEffectSettings = closeTitleSettings;
}

install();