import Phaser from "phaser";

const MIN_VIEW_SIZE = 120;
const installedGames = new WeakSet();
const observers = new WeakMap();
const resizeRafIds = new WeakMap();

function clampSize(value) {
  const num = Math.floor(Number(value) || 0);
  return Math.max(MIN_VIEW_SIZE, num);
}

function forceViewportContainerChain(canvas) {
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const mapRoot = canvas.parentElement;
  const stage = mapRoot?.closest?.(".phaser-stage");
  const panel = mapRoot?.closest?.(".phaser-map-panel");
  const app = mapRoot?.closest?.(".app");

  if (app instanceof HTMLElement) {
    app.style.setProperty("position", "fixed", "important");
    app.style.setProperty("inset", "0", "important");
    app.style.setProperty("left", "0", "important");
    app.style.setProperty("top", "0", "important");
    app.style.setProperty("right", "0", "important");
    app.style.setProperty("bottom", "0", "important");
    app.style.setProperty("width", "100vw", "important");
    app.style.setProperty("height", "100dvh", "important");
    app.style.setProperty("min-height", "100dvh", "important");
    app.style.setProperty("max-height", "100dvh", "important");
    app.style.setProperty("transform", "none", "important");
  }

  if (panel instanceof HTMLElement) {
    panel.style.setProperty("position", "absolute", "important");
    panel.style.setProperty("inset", "0", "important");
    panel.style.setProperty("width", "100%", "important");
    panel.style.setProperty("height", "100%", "important");
    panel.style.setProperty("min-height", "0", "important");
    panel.style.setProperty("max-height", "none", "important");
    panel.style.setProperty("margin", "0", "important");
  }

  if (stage instanceof HTMLElement) {
    stage.style.setProperty("position", "absolute", "important");
    stage.style.setProperty("inset", "0", "important");
    stage.style.setProperty("width", "100%", "important");
    stage.style.setProperty("height", "100%", "important");
    stage.style.setProperty("min-height", "0", "important");
    stage.style.setProperty("max-height", "none", "important");
  }

  if (mapRoot instanceof HTMLElement) {
    mapRoot.style.setProperty("position", "absolute", "important");
    mapRoot.style.setProperty("inset", "0", "important");
    mapRoot.style.setProperty("width", "100%", "important");
    mapRoot.style.setProperty("height", "100%", "important");
    mapRoot.style.setProperty("min-height", "0", "important");
    mapRoot.style.setProperty("max-height", "none", "important");
  }

  return mapRoot instanceof HTMLElement ? mapRoot : null;
}

function resolveViewportParts(game) {
  const canvas = game?.canvas;
  const root = forceViewportContainerChain(canvas);
  if (!(canvas instanceof HTMLCanvasElement) || !(root instanceof HTMLElement)) return null;

  const rootRect = root.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0) return null;

  const header = root.querySelector(".field-overlay-header");
  const commandPanel = root.querySelector(".field-footer-tabs-overlay");
  const headerRect = header instanceof HTMLElement ? header.getBoundingClientRect() : null;
  const panelRect = commandPanel instanceof HTMLElement ? commandPanel.getBoundingClientRect() : null;
  const portrait = window.matchMedia?.("(orientation: portrait)")?.matches ?? (window.innerHeight > window.innerWidth);

  const headerHeight = Math.max(0, Math.round(headerRect?.height || 0));
  let left = 0;
  let top = headerHeight;
  let width = rootRect.width;
  let height = rootRect.height - headerHeight;

  if (portrait) {
    const panelHeight = Math.max(0, Math.round(panelRect?.height || 0));
    height -= panelHeight;
  } else {
    const panelWidth = Math.max(0, Math.round(panelRect?.width || 0));
    width -= panelWidth;
  }

  return {
    root,
    canvas,
    left,
    top,
    width: clampSize(width),
    height: clampSize(height)
  };
}

function captureCameraWorldCenter(camera) {
  if (!camera) return null;

  const worldView = camera.worldView;
  const worldViewCenterX = Number(worldView?.centerX);
  const worldViewCenterY = Number(worldView?.centerY);
  if (Number.isFinite(worldViewCenterX) && Number.isFinite(worldViewCenterY)) {
    return { x: worldViewCenterX, y: worldViewCenterY };
  }

  const zoom = Math.max(0.0001, Number(camera.zoom) || 1);
  const scrollX = Number(camera.scrollX);
  const scrollY = Number(camera.scrollY);
  const viewWidth = Number(camera.width);
  const viewHeight = Number(camera.height);
  if (
    Number.isFinite(scrollX)
    && Number.isFinite(scrollY)
    && Number.isFinite(viewWidth)
    && Number.isFinite(viewHeight)
  ) {
    return {
      x: scrollX + (viewWidth / zoom) / 2,
      y: scrollY + (viewHeight / zoom) / 2
    };
  }

  return null;
}

function applyResponsivePhaserSize(game) {
  const parts = resolveViewportParts(game);
  if (!parts || !game?.scale) return;
  const { canvas, left, top, width, height } = parts;

  canvas.style.setProperty("position", "absolute", "important");
  canvas.style.setProperty("left", `${left}px`, "important");
  canvas.style.setProperty("top", `${top}px`, "important");
  canvas.style.setProperty("width", `${width}px`, "important");
  canvas.style.setProperty("height", `${height}px`, "important");
  canvas.style.setProperty("max-width", "none", "important");
  canvas.style.setProperty("max-height", "none", "important");

  const scenes = game.scene?.getScenes?.(true) || [];
  const cameraSnapshots = [];
  for (const scene of scenes) {
    const cameras = scene?.cameras?.cameras || [];
    for (const camera of cameras) {
      cameraSnapshots.push({
        camera,
        center: captureCameraWorldCenter(camera)
      });
    }
  }

  const currentWidth = Math.round(Number(game.scale.width || game.config?.width || 0));
  const currentHeight = Math.round(Number(game.scale.height || game.config?.height || 0));
  const sizeChanged = currentWidth !== width || currentHeight !== height;

  if (sizeChanged) {
    if (game.config) {
      game.config.width = width;
      game.config.height = height;
    }
    if (typeof game.scale.resize === "function") {
      game.scale.resize(width, height);
    }
  }

  for (const { camera, center } of cameraSnapshots) {
    camera?.setSize?.(width, height);
    if (center && Number.isFinite(center.x) && Number.isFinite(center.y)) {
      camera?.centerOn?.(center.x, center.y);
    }
  }
}

function scheduleResponsiveResize(game) {
  if (!game || typeof window === "undefined") return;
  const oldId = resizeRafIds.get(game);
  if (oldId) window.cancelAnimationFrame(oldId);
  const id = window.requestAnimationFrame(() => {
    resizeRafIds.delete(game);
    applyResponsivePhaserSize(game);
  });
  resizeRafIds.set(game, id);
}

function attachResponsiveResize(game) {
  if (!game || installedGames.has(game) || typeof window === "undefined") return;
  installedGames.add(game);

  const tryAttach = () => {
    const root = forceViewportContainerChain(game?.canvas);
    if (!(root instanceof HTMLElement)) {
      window.requestAnimationFrame(tryAttach);
      return;
    }

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => scheduleResponsiveResize(game))
      : null;
    observer?.observe(root);

    const stage = root.closest?.(".phaser-stage");
    const panelRoot = root.closest?.(".phaser-map-panel");
    const appRoot = root.closest?.(".app");
    if (stage instanceof HTMLElement) observer?.observe(stage);
    if (panelRoot instanceof HTMLElement) observer?.observe(panelRoot);
    if (appRoot instanceof HTMLElement) observer?.observe(appRoot);

    const header = root.querySelector(".field-overlay-header");
    const panel = root.querySelector(".field-footer-tabs-overlay");
    if (header instanceof HTMLElement) observer?.observe(header);
    if (panel instanceof HTMLElement) observer?.observe(panel);

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
    const record = observers.get(this);
    record?.dispose?.();
    observers.delete(this);
    const rafId = resizeRafIds.get(this);
    if (rafId && typeof window !== "undefined") window.cancelAnimationFrame(rafId);
    resizeRafIds.delete(this);
    return originalDestroy.apply(this, args);
  };
}
