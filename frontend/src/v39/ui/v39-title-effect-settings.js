function element(id) {
  return document.getElementById(id);
}
function ensureTitleEntry() {
  const settings = element("v39-start-settings");
  if (!(settings instanceof HTMLElement) || element("v39-title-effect-settings-open")) return;

  const button = document.createElement("button");
  button.type = "button";
  button.id = "v39-title-effect-settings-open";
  button.textContent = "エフェクト設定";
  button.addEventListener("click", openFromTitle);
  settings.appendChild(button);
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
  ensureTitleEntry();
  window.addEventListener("v39:play-mode-opened", ensureTitleEntry);
  window.openV39TitleEffectSettings = openFromTitle;
  window.closeV39TitleEffectSettings = closeTitleSettings;
}

install();
