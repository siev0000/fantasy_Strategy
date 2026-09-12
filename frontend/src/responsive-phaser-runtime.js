import Phaser from "phaser";

const MIN_VIEW_SIZE = 120;
const installedGames = new WeakSet();
const observers = new WeakMap();
const resizeRafIds = new WeakMap();

function clampSize(value) {
  return Math.max(MIN_VIEW_SIZE, Math.floor(Number(value) || 0));
}

function captureCameraWorldCenter(camera) {
  const x = Number(camera?.worldView?.centerX);
  const y = Number(camera?.worldView?.centerY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function clampCameraCenterToBounds(camera, center, width, height, zoom) {
  if (!camera || !center) return center;
  const bounds = camera.getBounds?.() || camera._bounds || null;
  const bx = Number(bounds?.x);
  const by = Number(bounds?.y);
  const bw = Number(bounds?.width);
  const bh = Number(bounds?.height);
  if (![bx, by, bw, bh].every(Number.isFinite) || bw <= 0 || bh <= 0) return center;

  const viewW = width / Math.max(0.0001, zoom);
  const viewH = height / Math.max(0.0001, zoom);
  const halfW = viewW / 2;
  const halfH = viewH / 2;
  const minX = bx + halfW;
  const maxX = bx + bw - halfW;
  const minY = by + halfH;
  const maxY = by + bh - halfH;

  return {
    x: minX > maxX ? bx + bw / 2 : Math.min(maxX, Math.max(minX, center.x)),
    y: minY > maxY ? by + bh / 2 : Math.min(maxY, Math.max(minY, center.y))
  };
}

function resolveShell(game) {
  const canvas = game?.canvas;
  if (!(canvas instanceof HTMLCanvasElement)) return null;
  const root = canvas.parentElement;
  if (!(root instanceof HTMLElement)) return null;
  const header = root.querySelector(".field-overlay-header");
  const footer = root.querySelector(".field-footer-tabs-overlay");
  return { root, canvas, header, footer };
}

function applyResponsivePhaserSize(game) {
  const shell = resolveShell(game);
  if (!shell || !game?.scale) return;
  const { root, canvas, header, footer } = shell;

  const rootRect = root.getBoundingClientRect();
  if (rootRect.width <= 0 || rootRect.height <= 0) return;

  const headerHeight = header instanceof HTMLElement
    ? Math.max(0, Math.round(header.getBoundingClientRect().height || 0))
    : 0;
  const footerHeight = footer instanceof HTMLElement
    ? Math.max(0, Math.round(footer.getBoundingClientRect().height || 0))
    : 0;

  const width = clampSize(rootRect.width);
  const height = clampSize(rootRect.height - headerHeight - footerHeight);

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
  canvas.style.setProperty("top", `${headerHeight}px`, "important");
  canvas.style.setProperty("bottom", `${footerHeight}px`, "important");
  canvas.style.setProperty("width", `${width}px`, "important");
  canvas.style.setProperty("height", `${height}px`, "important");
  canvas.style.setProperty("max-width", "none", "important");
  canvas.style.setProperty("max-height", "none", "important");

  for (const { camera, center, zoom } of snapshots) {
    camera?.setSize?.(width, height);
    camera?.setZoom?.(zoom);
    if (center) {
      const corrected = clampCameraCenterToBounds(camera, center, width, height, zoom);
      camera?.centerOn?.(corrected.x, corrected.y);
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
    const shell = resolveShell(game);
    if (!shell) {
      window.requestAnimationFrame(tryAttach);
      return;
    }

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => scheduleResponsiveResize(game))
      : null;

    observer?.observe(shell.root);
    if (shell.header instanceof HTMLElement) observer?.observe(shell.header);
    if (shell.footer instanceof HTMLElement) observer?.observe(shell.footer);

    const stage = shell.root.closest?.(".phaser-stage");
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
