export function createMapRenderScheduler(renderFn) {
  const runRender = typeof renderFn === "function" ? renderFn : (() => {});
  let frameHandle = null;
  let queued = false;

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
    queued = false;
    runRender();
  }

  function requestRender() {
    queued = true;
    if (frameHandle != null) return;
    frameHandle = requestFrame(flush);
  }

  function renderNow() {
    if (frameHandle != null) {
      cancelFrame(frameHandle);
      frameHandle = null;
    }
    queued = false;
    runRender();
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
    dispose
  };
}
