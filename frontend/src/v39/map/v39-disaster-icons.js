import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { V39_PROVISIONAL_DISASTER_BALANCE } from "../../lib/v39-gameplay-balance.js";

const OVERLAY_NAME = "v39-disaster-icon-overlay";
const OVERLAY_DEPTH = 11;
const RETRY_MS = 16;
const RETRY_LIMIT = 180;
let renderRequestId = 0;
let lastSignature = null;

const text = value => String(value ?? "").trim();
const integer = value => Math.floor(Number(value) || 0);

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x:(x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y:(y * rowStep) + height / 2
  };
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  const scenes = game?.scene?.getScenes?.(true) || [];
  return scenes.find(scene => scene?.sys?.isActive?.() !== false) || scenes[0] || null;
}

function currentTurn(state) {
  return Math.max(1, integer(state?.timeline?.turnNumber));
}

function activeEvents(state) {
  const turn = currentTurn(state);
  return (state?.worldEnvironment?.activeDisasters || []).filter(event => (
    event && integer(event?.expiresAtTurn) >= turn && Array.isArray(event?.tileKeys)
  ));
}

function eventIcon(event) {
  return text(event?.icon)
    || text(V39_PROVISIONAL_DISASTER_BALANCE.rulesById?.[text(event?.disasterId)]?.icon)
    || "!";
}

function collectMarkers(state) {
  const byTile = new Map();
  for (const event of activeEvents(state)) {
    for (const key of event.tileKeys) {
      const [x, y] = text(key).split(",").map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const marker = byTile.get(key);
      if (marker) {
        marker.count += 1;
        marker.names.push(text(event?.name) || "災害");
      } else {
        byTile.set(key, {
          key, x:integer(x), y:integer(y), icon:eventIcon(event), count:1,
          names:[text(event?.name) || "災害"]
        });
      }
    }
  }
  return [...byTile.values()].sort((left, right) => left.key.localeCompare(right.key, "ja"));
}

function signature(markers) {
  return markers.map(marker => `${marker.key}:${marker.icon}:${marker.count}:${marker.names.join("/")}`).join("|");
}

function destroyOverlay(scene) {
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === OVERLAY_NAME) child.destroy();
  }
}

function hasOverlay(scene) {
  return (scene?.children?.list || []).some(child => child?.name === OVERLAY_NAME);
}

function addMarker(scene, container, marker) {
  const { width, height } = tileMetrics();
  const center = tileCenter(marker.x, marker.y);
  const radius = Math.max(6, Math.min(width, height) * 0.18);
  const x = center.x + (width * 0.24);
  const y = center.y - (height * 0.24);
  const circle = scene.add.circle(x, y, radius, 0x30130f, 0.92)
    .setStrokeStyle(Math.max(1, radius * 0.16), 0xffc969, 1)
    .setName(`v39-disaster-icon:${marker.key}`)
    .setData("disasterNames", marker.names);
  const label = scene.add.text(x, y - 0.5, marker.icon, {
    fontFamily:"sans-serif",
    fontSize:`${Math.max(10, Math.floor(radius * 1.45))}px`,
    fontStyle:"bold",
    color:"#fff1b2",
    stroke:"#1a0c0a",
    strokeThickness:2
  }).setOrigin(0.5).setName(`v39-disaster-icon-label:${marker.key}`);
  container.add([circle, label]);
  if (marker.count > 1) {
    const count = scene.add.text(x + radius * 0.72, y + radius * 0.72, String(marker.count), {
      fontFamily:"sans-serif", fontSize:`${Math.max(8, Math.floor(radius))}px`, fontStyle:"bold", color:"#ffffff",
      stroke:"#1a0c0a", strokeThickness:2
    }).setOrigin(0.5);
    container.add(count);
  }
}

function render() {
  const state = window.getV39GameState?.();
  const scene = activeScene();
  if (!state || !scene?.add) return false;
  const markers = collectMarkers(state);
  const nextSignature = signature(markers);
  if (nextSignature === lastSignature && hasOverlay(scene)) return true;
  lastSignature = nextSignature;
  destroyOverlay(scene);
  const container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setName(OVERLAY_NAME);
  for (const marker of markers) addMarker(scene, container, marker);
  window.__v39DisasterIconStatus = { rendered:true, markerCount:markers.length, activeEventCount:activeEvents(state).length };
  return true;
}

function scheduleRender() {
  const requestId = ++renderRequestId;
  let attempts = 0;
  const tryRender = () => {
    if (requestId !== renderRequestId) return;
    if (render()) return;
    attempts += 1;
    if (attempts < RETRY_LIMIT && window.__v39FieldRuntime?.mapData) window.setTimeout(tryRender, RETRY_MS);
  };
  tryRender();
}

function install() {
  window.addEventListener("v39:field-generated", () => { lastSignature = null; scheduleRender(); });
  window.addEventListener("v39:game-state-changed", scheduleRender);
  window.addEventListener("v39:natural-events-resolved", scheduleRender);
  window.addEventListener("v39:map-render-batch-ended", scheduleRender);
  window.renderV39DisasterIcons = scheduleRender;
  window.getV39DisasterIconStatus = () => ({ ...(window.__v39DisasterIconStatus || {}) });
  if (window.__v39FieldRuntime?.mapData) scheduleRender();
}

install();
