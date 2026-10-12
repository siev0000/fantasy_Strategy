let overlay = null;

function alignLoadingToHeader() {
  const header = document.querySelector(".topbar");
  if (overlay && header) {
    // ヘッダーの実際の高さに追従し、端末や文字倍率による高さの違いも吸収する。
    overlay.style.setProperty("--v39-turn-loading-top",`${header.getBoundingClientRect().bottom}px`);
    const field = document.querySelector(".playfield");
    if (field) {
      const style = getComputedStyle(field);
      overlay.style.setProperty("--v39-turn-loading-right",style.getPropertyValue("--v39-side-log-width") || "0px");
      overlay.style.setProperty("--v39-turn-loading-left",style.getPropertyValue("--v39-feedback-left-clearance") || "0px");
    }
  }
}

export function showV39TurnLoading(message) {
  if (!overlay) {
    const style = document.createElement("style");
    style.textContent = `#v39-turn-loading{position:fixed;inset:0;z-index:1000100;cursor:progress;box-sizing:border-box;background:#0001}
      #v39-turn-loading[hidden]{display:none}#v39-turn-loading span{position:absolute;top:var(--v39-turn-loading-top);left:calc((100% + var(--v39-turn-loading-left,0px) - var(--v39-turn-loading-right,0px)) / 2);transform:translateX(-50%);max-width:calc(100% - var(--v39-turn-loading-left,0px) - var(--v39-turn-loading-right,0px) - 8px);box-sizing:border-box;padding:10px 16px;border:1px solid #69bbc8;border-radius:8px;background:#10232a;color:#e7f6f8;font-size:var(--font-body);box-shadow:0 3px 12px #0008}`;
    document.head.append(style);
    overlay = document.createElement("div");
    overlay.id = "v39-turn-loading";
    overlay.setAttribute("role", "status");
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = "<span></span>";
    document.body.append(overlay);
    alignLoadingToHeader();
    const header = document.querySelector(".topbar");
    if (header) new ResizeObserver(alignLoadingToHeader).observe(header);
    window.addEventListener("resize",alignLoadingToHeader);
    overlay.addEventListener("click", event => event.stopPropagation());
  }
  overlay.hidden = !message;
  overlay.querySelector("span").textContent = message || "";
  document.querySelector(".app")?.setAttribute("aria-busy", String(Boolean(message)));
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
