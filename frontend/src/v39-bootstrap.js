// Load the v39 runtime in ordered groups so startup progress is visible without changing module order.
const BOOTSTRAP_STAGES = Object.freeze([
  { label:"基本システム", loadedModules:19, load:() => import("./v39-bootstrap-core.js") },
  { label:"ゲームシステム", loadedModules:38, load:() => import("./v39-bootstrap-game.js") },
  { label:"画面・地形UI", loadedModules:49, load:() => import("./v39-bootstrap-final.js") }
]);
const BOOTSTRAP_MODULE_COUNT = 49;

function installLoadingOverlay() {
  if (!document.getElementById("v39-bootstrap-loading-style")) {
    const style = document.createElement("style");
    style.id = "v39-bootstrap-loading-style";
    style.textContent = `
      #v39-bootstrap-loading{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at 50% 42%,rgba(24,39,44,.98),rgba(3,9,12,.995));color:#e8efec;font-family:"Noto Sans JP","Yu Gothic",Meiryo,sans-serif;transition:opacity .2s ease}
      #v39-bootstrap-loading.is-complete{opacity:0;pointer-events:none}
      .v39-bootstrap-loading-card{width:min(520px,88vw);display:grid;gap:12px;padding:18px 20px;border:1px solid #43565d;border-radius:12px;background:rgba(12,24,29,.96);box-shadow:0 18px 54px rgba(0,0,0,.48)}
      .v39-bootstrap-loading-head{display:flex;align-items:end;justify-content:space-between;gap:14px}
      .v39-bootstrap-loading-head strong{font-size:18px}.v39-bootstrap-loading-head b{font-size:28px;color:#7bd7e6;font-variant-numeric:tabular-nums}
      .v39-bootstrap-loading-track{height:14px;overflow:hidden;border:1px solid #50656d;border-radius:999px;background:#0a1317}
      .v39-bootstrap-loading-bar{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#3b8da0,#6ed3df);transition:width .22s ease}
      .v39-bootstrap-loading-stage{margin:0;color:#aebec1;font-size:13px;line-height:1.45}
      #v39-bootstrap-loading.is-error .v39-bootstrap-loading-head b{color:#ef8c7b}
      #v39-bootstrap-loading.is-error .v39-bootstrap-loading-bar{background:#c96a5d}
      @media(max-width:520px){.v39-bootstrap-loading-card{width:min(92vw,420px);padding:15px}.v39-bootstrap-loading-head strong{font-size:16px}.v39-bootstrap-loading-head b{font-size:24px}}
    `;
    document.head.appendChild(style);
  }
  const existing = document.getElementById("v39-bootstrap-loading");
  if (existing) return existing;
  const overlay = document.createElement("div");
  overlay.id = "v39-bootstrap-loading";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="v39-bootstrap-loading-card">
      <div class="v39-bootstrap-loading-head"><strong>ゲームを読み込み中</strong><b data-v39-load-percent>0%</b></div>
      <div class="v39-bootstrap-loading-track" aria-hidden="true"><div class="v39-bootstrap-loading-bar" data-v39-load-bar></div></div>
      <p class="v39-bootstrap-loading-stage" data-v39-load-stage>起動準備中...</p>
    </div>`;
  document.body.appendChild(overlay);
  return overlay;
}

function setLoadingProgress(overlay, percent, stageText) {
  const safePercent = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  const percentElement = overlay?.querySelector?.("[data-v39-load-percent]");
  const bar = overlay?.querySelector?.("[data-v39-load-bar]");
  const stage = overlay?.querySelector?.("[data-v39-load-stage]");
  if (percentElement) percentElement.textContent = `${safePercent}%`;
  if (bar instanceof HTMLElement) bar.style.width = `${safePercent}%`;
  if (stage) stage.textContent = String(stageText || "読み込み中...");
  window.dispatchEvent(new CustomEvent("v39:bootstrap-progress", { detail:{ percent:safePercent, stage:String(stageText || "") } }));
}

function nextPaint() {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

async function bootstrap() {
  const overlay = installLoadingOverlay();
  setLoadingProgress(overlay, 3, "起動準備中...");
  try {
    let loadedModules = 0;
    for (const stage of BOOTSTRAP_STAGES) {
      const beforePercent = Math.max(3, Math.floor((loadedModules / BOOTSTRAP_MODULE_COUNT) * 98));
      setLoadingProgress(overlay, beforePercent, `${stage.label}を読み込み中... (${loadedModules}/${BOOTSTRAP_MODULE_COUNT})`);
      await stage.load();
      loadedModules = stage.loadedModules;
      const completedPercent = Math.min(98, Math.floor((loadedModules / BOOTSTRAP_MODULE_COUNT) * 98));
      setLoadingProgress(overlay, completedPercent, `${stage.label}を読み込みました (${loadedModules}/${BOOTSTRAP_MODULE_COUNT})`);
      await nextPaint();
    }
    document.querySelector(".footer")?.setAttribute("data-v39-ready", "true");
    setLoadingProgress(overlay, 100, "起動完了");
    window.dispatchEvent(new CustomEvent("v39:bootstrap-complete", { detail:{ modules:BOOTSTRAP_MODULE_COUNT } }));
    await nextPaint();
    await nextPaint();
    overlay.classList.add("is-complete");
    window.setTimeout(() => {
      overlay.remove();
      document.getElementById("v39-bootstrap-loading-style")?.remove();
    }, 240);
  } catch (error) {
    overlay.classList.add("is-error");
    const stage = overlay.querySelector("[data-v39-load-stage]");
    if (stage) stage.textContent = `読み込みに失敗しました: ${String(error?.message || error || "不明なエラー")}`;
    console.error("[v39 bootstrap] failed", error);
  }
}

bootstrap();
