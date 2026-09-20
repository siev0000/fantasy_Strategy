let hideTimer = 0;

export function showV39Feedback(message, options = {}) {
  const value = String(message ?? "").trim();
  if (!value) return false;
  if (options.log !== false) {
    window.pushV39SideRailMessage?.({
      channel:"notification",
      title:String(options.title || "通知"),
      message:value,
      tone:String(options.tone || "info"),
      meta:String(options.meta || "")
    });
  }
  if (options.banner === true) window.showV39TurnBanner?.(value);
  const toast = document.getElementById("toast");
  if (!(toast instanceof HTMLElement)) return false;
  toast.textContent = value;
  toast.classList.add("show");
  window.clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => toast.classList.remove("show"), Math.max(800, Number(options.durationMs) || 1800));
  return true;
}

window.showV39Feedback = showV39Feedback;
