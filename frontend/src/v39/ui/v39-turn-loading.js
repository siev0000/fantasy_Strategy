let overlay = null;

export function showV39TurnLoading(message) {
  if (!overlay) {
    const style = document.createElement("style");
    style.textContent = `#v39-turn-loading{position:fixed;inset:0;z-index:1000100;cursor:progress;display:flex;justify-content:center;align-items:flex-start;padding-top:70px;box-sizing:border-box;background:#0001}
      #v39-turn-loading[hidden]{display:none}#v39-turn-loading span{padding:10px 16px;border:1px solid #69bbc8;border-radius:8px;background:#10232a;color:#e7f6f8;font-size:var(--font-body,15px);box-shadow:0 3px 12px #0008}`;
    document.head.append(style);
    overlay = document.createElement("div");
    overlay.id = "v39-turn-loading";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = "<span></span>";
    document.body.append(overlay);
    overlay.addEventListener("click", event => event.stopPropagation());
  }
  overlay.hidden = !message;
  overlay.querySelector("span").textContent = message || "";
  document.getElementById("app")?.setAttribute("aria-busy", String(Boolean(message)));
}

// 重い同期処理の前に、ロード表示をブラウザーへ描画させる。
export const paintV39TurnLoading = () => new Promise(resolve => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));

export function updateV39TurnLoading(message) {
  if (overlay && !overlay.hidden) showV39TurnLoading(message);
}

window.addEventListener("v39:enemy-ai-progress", event => {
  if (!overlay || overlay.hidden) return;
  const { processed, total, percent } = event.detail || {};
  showV39TurnLoading(`敵AI計算中 ${processed} / ${total} (${percent}%)`);
});
