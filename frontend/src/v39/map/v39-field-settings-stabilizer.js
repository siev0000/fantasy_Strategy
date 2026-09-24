function bindCompletedFieldSettingsApi() {
  document.getElementById("v39-field-settings-placeholder")?.remove();
  const modal = document.getElementById("v39-field-settings-modal");
  if (!(modal instanceof HTMLElement)) return;
  // 最終設定画面は開くたびに状態を入力欄へ同期する。ここでAPIを上書きしない。
  if (modal.dataset.v39FinalSettings === "1") return;
  window.openFieldSettingsModal = () => {
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  };
  window.closeFieldSettingsModal = () => {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  };
}

queueMicrotask(bindCompletedFieldSettingsApi);
window.setTimeout(bindCompletedFieldSettingsApi, 0);
window.setTimeout(bindCompletedFieldSettingsApi, 100);
