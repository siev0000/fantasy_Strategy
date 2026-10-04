let activeUpdate = null;

const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

function createOverlay(field) {
  if (!document.getElementById("v39-field-update-loading-style")) {
    const style = document.createElement("style");
    style.id = "v39-field-update-loading-style";
    style.textContent = `#v39-field-update-loading{position:absolute;inset:0;z-index:100000;display:grid;place-items:center;background:#07101466;cursor:progress}
      #v39-field-update-loading span{display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid #69bbc8;border-radius:8px;background:#10232a;color:#e7f6f8;font-size:var(--font-body,15px)}
      #v39-field-update-loading span::before{content:"";width:16px;height:16px;border:2px solid #69bbc844;border-top-color:#69bbc8;border-radius:50%;animation:v39-field-update-spin .8s linear infinite}
      @keyframes v39-field-update-spin{to{transform:rotate(360deg)}}`;
    document.head.append(style);
  }
  const overlay = document.createElement("div");
  overlay.id = "v39-field-update-loading";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  const label = document.createElement("span");
  label.textContent = "更新中…";
  overlay.append(label);
  overlay.addEventListener("click", event => event.stopPropagation());
  field.append(overlay);
  return overlay;
}

// 同時に複数の再描画を始めない。呼び出し側は完了/失敗をawaitできる。
export function runV39FieldUpdate(task, { controls = [] } = {}) {
  if (activeUpdate) return activeUpdate;
  const field = document.querySelector(".playfield");
  if (!field || !window.__v39FieldRuntime?.mapData) {
    try { return Promise.resolve(task()); } catch (error) { return Promise.reject(error); }
  }
  const overlay = createOverlay(field);
  const oldBusy = field.getAttribute("aria-busy");
  const disabled = controls.map(control => [control, control.disabled]);
  for (const [control] of disabled) control.disabled = true;
  field.setAttribute("aria-busy", "true");
  const lock = window.beginV39MapInputLock?.("display-update");
  activeUpdate = (async () => {
    try {
      // 同期処理でメインスレッドが塞がる前にロード表示を描画する。
      await paint();
      const result = await task();
      await window.waitForV39MapRenderSettled?.();
      // 視界更新後に予約されたマーカー描画まで待つ。
      await paint();
      return result;
    } finally {
      overlay.remove();
      if (oldBusy === null) field.removeAttribute("aria-busy");
      else field.setAttribute("aria-busy", oldBusy);
      for (const [control, wasDisabled] of disabled) control.disabled = wasDisabled;
      if (lock) window.endV39MapInputLock?.(lock, "display-update-complete");
      activeUpdate = null;
    }
  })();
  return activeUpdate;
}

window.isV39FieldUpdating = () => activeUpdate !== null;
