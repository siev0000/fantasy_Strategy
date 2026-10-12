import { showV39SideNotice } from "./v39-notification-rail.js";

export function showV39Feedback(message, options = {}) {
  const value = String(message ?? "").trim();
  if (!value) return false;
  // banner指定でも別枠を重ねず、右側の共通通知を1件だけ出す。
  return showV39SideNotice(value,{...options,durationMs:options.durationMs || 1800});
}

window.showV39Feedback = showV39Feedback;
