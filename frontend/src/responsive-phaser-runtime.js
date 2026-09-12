import Phaser from "phaser";

const MIN_VIEW_SIZE = 120;
const PORTRAIT_BOTTOM_PANEL_MAX_WIDTH = 900;
const installedGames = new WeakSet();
const observers = new WeakMap();
const resizeRafIds = new WeakMap();

function clampSize(value) {
  return Math.max(MIN_VIEW_SIZE, Math.floor(Number(value) || 0));
}

function shouldUseBottomPanelLayout() {
  if (typeof window === "undefined") return false;
  const width = Math.max(1, window.innerWidth || 1);
  const height = Math.max(1, window.innerHeight || 1);
  return width <= PORTRAIT_BOTTOM_PANEL_MAX_WIDTH && height > width;
}

function resolveFieldRoot(game) {
  const canvas = game?.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const root = canvas.parentElement;
  const panel = root?.closest?.(".phaser-map-panel");
  if (panel instanceof HTMLElement) {
    const useBottomPanel = shouldUseBottomPanelLayout();
    panel.classList.toggle("responsive-portrait-layout", useBottomPanel);
    panel.classList.toggle("responsive-landscape-layout", !useBottomPanel);
  }
  return root instanceof HTMLElement ? root : null;
}

function captureCameraWorldCenter(camera) {
  if (!camera) return null;
  const centerX = Number(camera.worldView?.centerX);
  const centerY = Number(camera.worldView?.centerY);
  if (Number.isFinite(centerX) && Number.isFinite(centerY)) {
    return { x: centerX, y: centerY };
  }
  return null;
}

function resolveCameraBounds(camera) {
  if (!camera) return null;
  let raw = null;
  if (typeof camera.getBounds === "function") {
    try {
      raw = camera.getBounds();
    } catch {
      raw = null;
    }
  }
  if (!raw && camera._bounds) raw = camera._bounds;
  if (!raw) return null;

  const x = Number(raw.x);
  const y = Number(raw.y);
  const width = Number(raw.width);
  const height = Number(raw.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return {
    x,
    y,
    width,
    height,
    right: x + width,
    bottom: y + height,
    centerX: x + (width / 2),
    centerY: y + (height / 2)
  };
}

function clampCameraCenterToBounds(camera, previousCenter, viewportWidth, viewportHeight, zoom) {
  const bounds = resolveCameraBounds(camera);
  if (!bounds) return previousCenter;

  const safeZoom = Math.max(0.0001, Number(zoom) || 1);
  const viewWorldWidth = Math.max(1, Number(viewportWidth) / safeZoom);
  const viewWorldHeight = Math.max(1, Number(viewportHeight) / safeZoom);
  const halfW = viewWorldWidth / 2;
  const halfH = viewWorldHeight / 2;

  let x = Number(previousCenter?.x);
  let y = Number(previousCenter?.y);
  if (!Number.isFinite(x)) x = bounds.centerX;
  if (!Number.isFinite(y)) y = bounds.centerY;

  // If the world is smaller than the available field, keep it centered instead of
  // pinning it to one edge and showing a large empty strip on the opposite side.
  if (bounds.width <= viewWorldWidth) {
    x = bounds.centerX;
  } else {
    x = Math.min(bounds.right - halfW, Math.max(bounds.x + halfW, x));
  }

  if (bounds.height <= viewWorldHeight) {
    y = bounds.centerY;
  } else {
    y = Math.min(bounds.bottom - halfH, Math.max(bounds.y + halfH, y));
  }

  return { x, y };
}

function resolveFieldViewport(root) {
  const rect = root.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const header = root.querySelector(".field-overlay-header");
  let headerHeight = 0;
  if (header instanceof HTMLElement) {
    const style = window.getComputedStyle(header);
    if (style.display !== "none" && style.visibility !== "hidden") {
      headerHeight = Math.max(0, Math.round(header.getBoundingClientRect().height || 0));
    }
  }

  const width = clampSize(rect.width);
  const availableHeight = Math.max(MIN_VIEW_SIZE, rect.height - headerHeight);
  const height = clampSize(availableHeight);

  return {
    width,
    height,
    top: Math.max(0, headerHeight)
  };
}

function applyResponsivePhaserSize(game) {
  const root = resolveFieldRoot(game);
  const canvas = game?.canvas;
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !game?.scale) return;

  const viewport = resolveFieldViewport(root);
  if (!viewport) return;
  const { width, height, top } = viewport;

  const snapshots = [];
  for (const scene of game.scene?.getScenes?.(true) || []) {
    for (const camera of scene?.cameras?.cameras || []) {
      snapshots.push({
        camera,
        center: captureCameraWorldCenter(camera),
        zoom: Math.max(0.0001, Number(camera?.zoom) || 1)
      });
    }
  }

  const currentWidth = Math.round(Number(game.scale.width || game.config?.width || 0));
  const currentHeight = Math.round(Number(game.scale.height || game.config?.height || 0));
  if (currentWidth !== width || currentHeight !== height) {
    if (game.config) {
      game.config.width = width;
      game.config.height = height;
    }
    game.scale.resize?.(width, height);
  }

  canvas.style.setProperty("position", "absolute", "important");
  canvas.style.setProperty("left", "0", "important");
  canvas.style.setProperty("right", "0", "important");
  canvas.style.setProperty("top", `${top}px`, "important");
  canvas.style.setProperty("bottom", "auto", "important");
  canvas.style.setProperty("width", "100%", "important");
  canvas.style.setProperty("height", `${height}px`, "important");
  canvas.style.setProperty("max-width", "none", "important");
  canvas.style.setProperty("max-height", "none", "important");

  for (const { camera, center, zoom } of snapshots) {
    camera?.setSize?.(width, height);
    camera?.setZoom?.(zoom);
    const nextCenter = clampCameraCenterToBounds(camera, center, width, height, zoom);
    if (nextCenter && Number.isFinite(nextCenter.x) && Number.isFinite(nextCenter.y)) {
      camera?.centerOn?.(nextCenter.x, nextCenter.y);
    }
  }
}

function scheduleResponsiveResize(game) {
  if (!game || typeof window === "undefined") return;
  const previous = resizeRafIds.get(game);
  if (previous) window.cancelAnimationFrame(previous);
  const next = window.requestAnimationFrame(() => {
    resizeRafIds.delete(game);
    applyResponsivePhaserSize(game);
  });
  resizeRafIds.set(game, next);
}

function attachResponsiveResize(game) {
  if (!game || installedGames.has(game) || typeof window === "undefined") return;
  installedGames.add(game);

  const tryAttach = () => {
    const root = resolveFieldRoot(game);
    if (!(root instanceof HTMLElement)) {
      window.requestAnimationFrame(tryAttach);
      return;
    }

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => scheduleResponsiveResize(game))
      : null;
    observer?.observe(root);

    const stage = root.closest?.(".phaser-stage");
    if (stage instanceof HTMLElement) observer?.observe(stage);

    const header = root.querySelector(".field-overlay-header");
    if (header instanceof HTMLElement) observer?.observe(header);

    const onWindowResize = () => scheduleResponsiveResize(game);
    window.addEventListener("resize", onWindowResize, { passive: true });
    window.addEventListener("orientationchange", onWindowResize, { passive: true });

    observers.set(game, {
      observer,
      dispose() {
        observer?.disconnect();
        window.removeEventListener("resize", onWindowResize);
        window.removeEventListener("orientationchange", onWindowResize);
      }
    });

    scheduleResponsiveResize(game);
    window.setTimeout(() => scheduleResponsiveResize(game), 80);
    window.setTimeout(() => scheduleResponsiveResize(game), 240);
  };

  tryAttach();
}

export function installResponsivePhaserRuntime() {
  if (typeof window === "undefined") return;
  const proto = Phaser?.Game?.prototype;
  if (!proto || proto.__responsiveViewportPatched) return;
  proto.__responsiveViewportPatched = true;

  const originalBoot = proto.boot;
  proto.boot = function responsiveViewportBoot(...args) {
    const result = originalBoot.apply(this, args);
    attachResponsiveResize(this);
    return result;
  };

  const originalDestroy = proto.destroy;
  proto.destroy = function responsiveViewportDestroy(...args) {
    observers.get(this)?.dispose?.();
    observers.delete(this);
    const rafId = resizeRafIds.get(this);
    if (rafId && typeof window !== "undefined") window.cancelAnimationFrame(rafId);
    resizeRafIds.delete(this);
    return originalDestroy.apply(this, args);
  };
}
