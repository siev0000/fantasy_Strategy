export function createMapRenderScheduler(renderFn, options = {}) {
  const runRender = typeof renderFn === "function" ? renderFn : (() => {});
  const resolveMinFrameIntervalMs = typeof options?.resolveMinFrameIntervalMs === "function"
    ? options.resolveMinFrameIntervalMs
    : (() => 0);
  let frameHandle = null;
  let queued = false;
  let suspended = false;
  let lastRenderAtMs = 0;

  function cancelFrame(handle) {
    if (typeof window === "undefined") return;
    if (typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(handle);
      return;
    }
    window.clearTimeout(handle);
  }

  function requestFrame(callback) {
    if (typeof window === "undefined") {
      callback();
      return null;
    }
    if (typeof window.requestAnimationFrame === "function") {
      return window.requestAnimationFrame(callback);
    }
    return window.setTimeout(callback, 16);
  }

  function flush() {
    frameHandle = null;
    if (!queued) return;
    if (suspended) return;
    const nowMs = Date.now();
    const minIntervalMs = Math.max(0, Math.floor(Number(resolveMinFrameIntervalMs()) || 0));
    const elapsedMs = nowMs - lastRenderAtMs;
    if (elapsedMs < minIntervalMs) {
      const delay = Math.max(1, minIntervalMs - elapsedMs);
      frameHandle = window.setTimeout(flush, delay);
      return;
    }
    queued = false;
    lastRenderAtMs = nowMs;
    runRender();
  }

  function requestRender() {
    queued = true;
    if (suspended) return;
    if (frameHandle != null) return;
    frameHandle = requestFrame(flush);
  }

  function renderNow() {
    if (suspended) {
      queued = true;
      return;
    }
    if (frameHandle != null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    queued = false;
    lastRenderAtMs = Date.now();
    runRender();
  }

  function setSuspended(nextSuspended) {
    const normalized = !!nextSuspended;
    if (suspended === normalized) return;
    suspended = normalized;
    if (suspended) {
      if (frameHandle != null) {
        cancelFrame(frameHandle);
        frameHandle = null;
      }
      return;
    }
    if (queued && frameHandle == null) {
      frameHandle = requestFrame(flush);
    }
  }

  function dispose() {
    if (frameHandle != null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    queued = false;
  }

  return {
    requestRender,
    renderNow,
    setSuspended,
    dispose
  };
}
