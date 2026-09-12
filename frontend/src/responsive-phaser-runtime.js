import Phaser from "phaser";

const MIN_VIEW_SIZE = 120;
const installedGames = new WeakSet();
const observers = new WeakMap();
const resizeRafIds = new WeakMap();

function clampSize(value) {
  const num = Math.floor(Number(value) || 0);
  return Math.max(MIN_VIEW_SIZE, num);
}

function resolveViewportParts(game) {
  const canvas = game?.canvas;
  const root = canvas?.parentElement;
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

function applyResponsivePhaserSize(game) {
  const parts = resolveViewportParts(game);
  if (!parts || !game?.scale) return;
  const { canvas, left, top, width, height } = parts;

  canvas.style.position = "absolute";
  canvas.style.left = `${left}px`;
  canvas.style.top = `${top}px`;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  canvas.style.maxWidth = "none";
  canvas.style.maxHeight = "none";

  const currentWidth = Math.round(Number(game.scale.width || game.config?.width || 0));
  const currentHeight = Math.round(Number(game.scale.height || game.config?.height || 0));
  if (currentWidth === width && currentHeight === height) return;

  if (game.config) {
    game.config.width = width;
    game.config.height = height;
  }
  if (typeof game.scale.resize === "function") {
    game.scale.resize(width, height);
  }

  const scenes = game.scene?.getScenes?.(true) || [];
  for (const scene of scenes) {
    const cameras = scene?.cameras?.cameras || [];
    for (const camera of cameras) {
      camera?.setSize?.(width, height);
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
    const root = game?.canvas?.parentElement;
    if (!(root instanceof HTMLElement)) {
      window.requestAnimationFrame(tryAttach);
      return;
    }

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => scheduleResponsiveResize(game))
      : null;
    observer?.observe(root);

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
