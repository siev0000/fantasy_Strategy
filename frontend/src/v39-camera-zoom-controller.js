import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import { resolveEffectiveMaxZoomFactor } from "./lib/map-camera-zoom-rules.js";

const pointers = new Map();
let lastRelativeZoom = 1;
let resizeFrame = 0;

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  return game?.scene?.getScenes?.(true)?.[0] || null;
}

function fieldHost() {
  return document.getElementById("v39-phaser-field");
}

function mapSize() {
  const runtime = window.__v39FieldRuntime;
  return {
    w: Math.max(1, Number(runtime?.settings?.w ?? runtime?.mapData?.w ?? runtime?.mapWidth) || 36),
    h: Math.max(1, Number(runtime?.settings?.h ?? runtime?.mapData?.h ?? runtime?.mapHeight) || 36)
  };
}

function userMaxFactor() {
  const fromBridge = window.getV39DisplaySettings?.()?.maxZoomFactor;
  if (Number.isFinite(Number(fromBridge))) return Number(fromBridge);
  try {
    const saved = JSON.parse(localStorage.getItem("v39-display-settings-v1") || "null") || {};
    return Number(saved.maxZoomFactor) || 16;
  } catch {
    return 16;
  }
}

function effectiveMaxFactor() {
  const { w, h } = mapSize();
  return resolveEffectiveMaxZoomFactor({ w, h, userMaxZoomFactor: userMaxFactor() });
}

function maxZoom(scene) {
  const fit = Math.max(0.0001, Number(scene?.v39FitZoom) || Number(scene?.cameras?.main?.zoom) || 1);
  return fit * effectiveMaxFactor();
}

function worldSize() {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  const w = Math.max(1, Number(data?.w ?? runtime?.mapWidth) || 1);
  const h = Math.max(1, Number(data?.h ?? runtime?.mapHeight) || 1);
  return {
    width: (w * width) + oddRowOffsetX + 2,
    height: ((h - 1) * rowStep) + height + 2
  };
}

function clampCamera(scene) {
  const camera = scene?.cameras?.main;
  if (!camera) return;
  camera.preRender?.();
  const size = worldSize();
  const a = camera.getWorldPoint(0, 0);
  const b = camera.getWorldPoint(camera.width, camera.height);
  const viewWidth = b.x - a.x;
  const viewHeight = b.y - a.y;
  if (viewWidth < size.width) {
    if (a.x < 0) camera.scrollX += -a.x;
    else if (b.x > size.width) camera.scrollX += size.width - b.x;
  }
  if (viewHeight < size.height) {
    if (a.y < 0) camera.scrollY += -a.y;
    else if (b.y > size.height) camera.scrollY += size.height - b.y;
  }
}

function screenPoint(camera, clientX, clientY) {
  const host = fieldHost();
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (clientX - rect.left) * (camera.width / rect.width),
    y: (clientY - rect.top) * (camera.height / rect.height)
  };
}

function captureZoom(clientX, clientY, factor) {
  const scene = activeScene();
  const camera = scene?.cameras?.main;
  if (!camera) return null;
  const point = screenPoint(camera, clientX, clientY);
  if (!point) return null;
  return {
    scene,
    camera,
    point,
    beforeZoom: Number(camera.zoom) || 1,
    beforeWorld: camera.getWorldPoint(point.x, point.y),
    factor: Number(factor) || 1
  };
}

function applyCapturedZoom(snapshot) {
  if (!snapshot) return;
  const scene = snapshot.scene;
  const camera = scene?.cameras?.main;
  if (!camera || camera !== snapshot.camera || scene !== activeScene()) return;

  const fit = Math.max(0.0001, Number(scene.v39FitZoom) || snapshot.beforeZoom);
  const target = Math.max(fit, Math.min(maxZoom(scene), snapshot.beforeZoom * snapshot.factor));
  camera.setZoom(target);
  camera.preRender?.();
  const afterWorld = camera.getWorldPoint(snapshot.point.x, snapshot.point.y);
  camera.scrollX += snapshot.beforeWorld.x - afterWorld.x;
  camera.scrollY += snapshot.beforeWorld.y - afterWorld.y;
  scene.v39RequestedZoom = target;
  lastRelativeZoom = target / fit;
  clampCamera(scene);
}

function scheduleCapturedZoom(snapshot) {
  if (!snapshot) return;
  queueMicrotask(() => applyCapturedZoom(snapshot));
}

function zoomAroundCenterTo(targetZoom) {
  const scene = activeScene();
  const camera = scene?.cameras?.main;
  const host = fieldHost();
  if (!camera || !host) return;
  const rect = host.getBoundingClientRect();
  const point = screenPoint(camera, rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!point) return;
  const beforeWorld = camera.getWorldPoint(point.x, point.y);
  const fit = Math.max(0.0001, Number(scene.v39FitZoom) || camera.zoom);
  const target = Math.max(fit, Math.min(maxZoom(scene), Number(targetZoom) || fit));
  camera.setZoom(target);
  camera.preRender?.();
  const afterWorld = camera.getWorldPoint(point.x, point.y);
  camera.scrollX += beforeWorld.x - afterWorld.x;
  camera.scrollY += beforeWorld.y - afterWorld.y;
  scene.v39RequestedZoom = target;
  lastRelativeZoom = target / fit;
  clampCamera(scene);
}

window.addEventListener("wheel", event => {
  const host = fieldHost();
  if (!host || !(event.target instanceof Node) || !host.contains(event.target)) return;
  scheduleCapturedZoom(captureZoom(event.clientX, event.clientY, event.deltaY < 0 ? 1.16 : 1 / 1.16));
}, { capture: true, passive: true });

document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("#v39-map-camera-controls [data-map-zoom]") : null;
  if (!button) return;
  const host = fieldHost();
  if (!host) return;
  const rect = host.getBoundingClientRect();
  const factor = button.getAttribute("data-map-zoom") === "in" ? 1.3 : 1 / 1.3;
  scheduleCapturedZoom(captureZoom(rect.left + rect.width / 2, rect.top + rect.height / 2, factor));
}, true);

window.addEventListener("dblclick", event => {
  const host = fieldHost();
  if (!host || !(event.target instanceof Node) || !host.contains(event.target)) return;
  scheduleCapturedZoom(captureZoom(event.clientX, event.clientY, 1.5));
}, { capture: true });

window.addEventListener("pointerdown", event => {
  const host = fieldHost();
  if (!host || !(event.target instanceof Node) || !host.contains(event.target)) return;
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
}, { capture: true });

window.addEventListener("pointermove", event => {
  if (!pointers.has(event.pointerId)) return;
  const before = [...pointers.values()];
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const after = [...pointers.values()];
  if (before.length < 2 || after.length < 2) return;

  const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
  const newDistance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
  if (!(oldDistance > 0) || !(newDistance > 0)) return;
  const centerX = (after[0].x + after[1].x) / 2;
  const centerY = (after[0].y + after[1].y) / 2;
  scheduleCapturedZoom(captureZoom(centerX, centerY, newDistance / oldDistance));
}, { capture: true });

const releasePointer = event => pointers.delete(event.pointerId);
window.addEventListener("pointerup", releasePointer, { capture: true });
window.addEventListener("pointercancel", releasePointer, { capture: true });

window.addEventListener("v39:field-generated", () => {
  pointers.clear();
  lastRelativeZoom = 1;
});

window.addEventListener("v39:display-settings-changed", () => {
  const scene = activeScene();
  const camera = scene?.cameras?.main;
  if (!camera) return;
  const limit = maxZoom(scene);
  if (camera.zoom > limit) zoomAroundCenterTo(limit);
});

window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = requestAnimationFrame(() => {
      const scene = activeScene();
      if (!scene) return;
      const fit = Math.max(0.0001, Number(scene.v39FitZoom) || scene.cameras.main.zoom);
      zoomAroundCenterTo(fit * lastRelativeZoom);
    });
  });
});

window.getV39EffectiveMaxZoomFactor = () => effectiveMaxFactor();
