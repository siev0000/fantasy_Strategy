const ENABLED = import.meta.env.DEV || import.meta.env.MODE === "teston";
const UPDATE_INTERVAL_MS = 1000;

function formatMemory(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return "N/A";
  const megaBytes = value / (1024 * 1024);
  return `${megaBytes >= 100 ? megaBytes.toFixed(0) : megaBytes.toFixed(1)} MB`;
}

function install() {
  if (!ENABLED || document.getElementById("v39-memory-monitor")) return;
  const monitor = document.createElement("output");
  monitor.id = "v39-memory-monitor";
  monitor.textContent = "メモリ:N/A";
  monitor.setAttribute("aria-label", "使用メモリ");
  Object.assign(monitor.style, {
    position:"fixed",
    top:"4px",
    right:"6px",
    zIndex:"1000",
    color:"#68e08c",
    fontSize:"15px",
    fontWeight:"800",
    lineHeight:"1.2",
    pointerEvents:"none",
    textShadow:"0 1px 2px #000"
  });
  document.body.appendChild(monitor);

  const update = () => {
    monitor.textContent = `メモリ:${formatMemory(performance?.memory?.usedJSHeapSize)}`;
  };
  update();
  const intervalId = window.setInterval(update, UPDATE_INTERVAL_MS);
  window.addEventListener("pagehide", () => window.clearInterval(intervalId), { once:true });
}

install();
