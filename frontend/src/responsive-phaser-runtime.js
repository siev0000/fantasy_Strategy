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

function applyResponsivePhaserSize(game) {
  const root = resolveFieldRoot(game);
  const canvas = game?.canvas;
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement) || !game?.scale) return;

  const rect = root.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;

  const width = clampSize(rect.width);
  const height = clampSize(rect.height);

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
  canvas.style.setProperty("inset", "0", "important");
  canvas.style.setProperty("width", "100%", "important");
  canvas.style.setProperty("height", "100%", "important");
  canvas.style.setProperty("max-width", "none", "important");
  canvas.style.setProperty("max-height", "none", "important");

  for (const { camera, center, zoom } of snapshots) {
    camera?.setSize?.(width, height);
    camera?.setZoom?.(zoom);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
      camera?.centerOn?.(center.x, center.y);
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
