import {
  HEX_TILE_CONFIG,
  TERRITORY_RESIDENTIAL_LEVEL_CONFIG,
  TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS
} from "../../lib/phaser-map-panel-config.js";
import { getIconSrcByName, hasIconName } from "../../lib/icon-library.js";

const OVERLAY_NAME = "v39-victory-landmark-overlay";
const OVERLAY_DEPTH = 11;
let renderRequestId = 0;
let lastSignature = null;

const text = value => String(value ?? "").trim();

function tileCenter(x, y) {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return {
    x:(x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y:(y * rowStep) + height / 2
  };
}

function tileHexPoints(x, y) {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  const left = (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  const upperY = height - rowStep;
  return [
    { x:left + width / 2, y:top },
    { x:left + width, y:top + upperY },
    { x:left + width, y:top + rowStep },
    { x:left + width / 2, y:top + height },
    { x:left, y:top + rowStep },
    { x:left, y:top + upperY }
  ];
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  const scenes = game?.scene?.getScenes?.(true) || [];
  return scenes.find(scene => scene?.sys?.isActive?.() !== false) || scenes[0] || null;
}

function visibleMarkers(state) {
  const player = (state?.players || []).find(row => text(row?.id) === text(state?.activePlayerId)) || state?.players?.[0];
  const discovered = player?.factionState?.exploration?.discoveredFeaturesByTile || {};
  const testMode = window.isV39TestMode?.() === true || window.getV39DisplaySettings?.()?.testMode === true;
  return Object.values(state?.victoryLandmarksByTile || {})
    .filter(site => text(site?.kind) === "victory-landmark" && (discovered?.[text(site?.key)] || testMode))
    .map(site => ({ ...site, discovered:!!discovered?.[text(site?.key)], testMode }))
    .sort((left, right) => text(left?.id).localeCompare(text(right?.id), "ja"));
}

function imageName(marker) {
  // All landmark patterns use an existing image asset; the label identifies the unique site.
  return ({
    "太陽の山":"太陽",
    "黄昏の樹":"森",
    "星の火口":"星",
    "宇宙の海":"宇宙"
  })[text(marker?.name)] || "";
}

function addArtwork(scene, container, marker, center, radius) {
  const name = imageName(marker);
  if (!name || !hasIconName(name)) return false;
  const key = `v39-victory-landmark:${name}`;
  if (!scene.textures.exists(key)) {
    const image = new Image();
    image.onload = () => { if (scene?.sys?.isActive?.() && !scene.textures.exists(key)) { scene.textures.addImage(key, image); lastSignature = null; scheduleRender(); } };
    image.src = getIconSrcByName(name);
    return false;
  }
  const image = scene.add.image(center.x, center.y, key).setOrigin(0.5);
  const metropolisSize = Number(TERRITORY_RESIDENTIAL_LEVEL_CONFIG?.[TERRITORY_RESIDENTIAL_LEVEL_METROPOLIS]?.markerIconSize);
  const displaySize = Number.isFinite(metropolisSize) && metropolisSize > 0 ? metropolisSize : radius * 4;
  image.setDisplaySize(displaySize, displaySize);
  container.add(image);
  return true;
}

function destroyOverlay(scene) {
  for (const child of [...(scene?.children?.list || [])]) if (child?.name === OVERLAY_NAME) child.destroy();
}

function addTestHighlight(scene, container, marker) {
  if (!marker.testMode) return;
  const highlight = scene.add.graphics().setName("v39-victory-landmark-test-highlight");
  // TEST ON では大都市相当の占有7マス全体を強調する。
  const occupied = Array.isArray(marker?.occupiedTileKeys) && marker.occupiedTileKeys.length
    ? marker.occupiedTileKeys
    : [`${marker.x},${marker.y}`];
  highlight.fillStyle(0xffd52a, 0.4);
  highlight.lineStyle(5, 0xfff19a, 1);
  for (const key of occupied) {
    const [x, y] = String(key).split(",").map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const points = tileHexPoints(x, y);
    highlight.fillPoints(points, true);
    highlight.strokePoints(points, true);
  }
  container.add(highlight);
}

function addMarker(scene, container, marker) {
  const center = tileCenter(Number(marker.x), Number(marker.y));
  const radius = Math.max(5, Math.min(Number(HEX_TILE_CONFIG?.width) || 40, Number(HEX_TILE_CONFIG?.height) || 48) * 0.16);
  addTestHighlight(scene, container, marker);
  const hasArtwork = addArtwork(scene, container, marker, center, radius);
  if (!marker.discovered && hasArtwork) container.list.at(-1)?.setAlpha?.(0.72);
  const ring = scene.add.circle(center.x, center.y, radius, 0x5a3c0d, 0.88)
    .setStrokeStyle(Math.max(1, radius * 0.2), 0xffd56b, 1);
  const label = scene.add.text(center.x, center.y - radius - 2, text(marker.name), {
    fontFamily:"serif", fontSize:`${Math.max(9, Math.floor(radius * 1.3))}px`, fontStyle:"bold", color:"#fff3bd",
    stroke:"#1b1106", strokeThickness:2
  }).setOrigin(0.5, 1);
  container.add([ring, label]);
}

function render() {
  const state = window.getV39GameState?.();
  const scene = activeScene();
  if (!state || !scene?.add) return false;
  const markers = visibleMarkers(state);
  const signature = markers.map(marker => `${marker.id}:${marker.key}:${marker.name}:${marker.discovered}:${marker.testMode}`).join("|");
  if (signature === lastSignature && (scene.children?.list || []).some(child => child?.name === OVERLAY_NAME)) return true;
  lastSignature = signature;
  destroyOverlay(scene);
  const container = scene.add.container(0, 0).setDepth(OVERLAY_DEPTH).setName(OVERLAY_NAME);
  for (const marker of markers) addMarker(scene, container, marker);
  window.__v39VictoryLandmarkIconStatus = { rendered:true, markerCount:markers.length };
  return true;
}

function scheduleRender() {
  const requestId = ++renderRequestId;
  let attempts = 0;
  const tryRender = () => {
    if (requestId !== renderRequestId) return;
    if (render()) return;
    attempts += 1;
    if (attempts < 180 && window.__v39FieldRuntime?.mapData) window.setTimeout(tryRender, 16);
  };
  tryRender();
}

window.addEventListener("v39:field-generated", () => { lastSignature = null; scheduleRender(); });
window.addEventListener("v39:game-state-changed", scheduleRender);
window.addEventListener("v39:map-render-batch-ended", scheduleRender);
window.renderV39VictoryLandmarkIcons = scheduleRender;
window.getV39VictoryLandmarkIconStatus = () => ({ ...(window.__v39VictoryLandmarkIconStatus || {}) });
if (window.__v39FieldRuntime?.mapData) scheduleRender();
