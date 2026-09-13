import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const LAYER_DEPTH = 12;
const BASE_TARGET_SCREEN_SCALE = 1.75;
const MIN_READABLE_MARKER_SCALE = 1;
const MAX_READABLE_MARKER_SCALE = 24;
let markerContainer = null;
let refreshTimer = null;
let markerScaleScene = null;
let markerScaleHandler = null;
const readableMarkers = new Set();

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
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  if (!game?.scene) return null;
  return game.scene.getScenes(true)?.[0] || null;
}

function activeFaction() {
  try {
    return typeof window.getV39ActiveFactionState === "function"
      ? window.getV39ActiveFactionState()
      : null;
  } catch {
    return null;
  }
}

function finiteCoord(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

function readableMarkerScale(scene) {
  const zoom = Number(scene?.cameras?.main?.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) return BASE_TARGET_SCREEN_SCALE;
  return Math.max(
    MIN_READABLE_MARKER_SCALE,
    Math.min(MAX_READABLE_MARKER_SCALE, BASE_TARGET_SCREEN_SCALE / zoom)
  );
}

function refreshReadableMarkerScales(scene = markerScaleScene) {
  if (!scene) return;
  const scale = readableMarkerScale(scene);
  for (const marker of readableMarkers) {
    if (!marker?.active || typeof marker.setScale !== "function") continue;
    marker.setScale(scale);
  }
}

function registerReadableMarker(scene, marker) {
  if (!marker) return marker;
  readableMarkers.add(marker);
  marker.setScale?.(readableMarkerScale(scene));
  return marker;
}

function detachMarkerScaleUpdater() {
  if (markerScaleScene?.events && markerScaleHandler) {
    markerScaleScene.events.off("update", markerScaleHandler);
  }
  markerScaleScene = null;
  markerScaleHandler = null;
  readableMarkers.clear();
}

function attachMarkerScaleUpdater(scene) {
  detachMarkerScaleUpdater();
  markerScaleScene = scene;
  markerScaleHandler = () => refreshReadableMarkerScales(scene);
  scene.events.on("update", markerScaleHandler);
}

function clearMarkers() {
  detachMarkerScaleUpdater();
  if (markerContainer?.destroy) markerContainer.destroy(true);
  markerContainer = null;
}

function drawBase(scene, container, village) {
  if (!village?.placed) return;
  const x = finiteCoord(village.x);
  const y = finiteCoord(village.y);
  if (x === null || y === null) return;

  const c = tileCenter(x, y);
  const marker = registerReadableMarker(scene, scene.add.container(c.x, c.y));

  const g = scene.add.graphics();
  g.fillStyle(0x071014, 0.96);
  g.lineStyle(3, 0xf0cf79, 1);
  g.fillCircle(0, 0, 22);
  g.strokeCircle(0, 0, 22);
  g.fillStyle(0xf0cf79, 1);
  g.fillTriangle(-13, 3, 0, -13, 13, 3);
  g.fillRect(-9, 3, 18, 12);
  g.fillStyle(0x071014, 1);
  g.fillRect(-3, 8, 6, 7);

  const label = scene.add.text(0, 27, village.name || "拠点", {
    fontSize: "14px",
    fontStyle: "bold",
    color: "#fff0bd",
    stroke: "#071014",
    strokeThickness: 5,
    backgroundColor: "#071014",
    padding: { x: 4, y: 2 }
  }).setOrigin(0.5, 0);

  marker.add([g, label]);
  container.add(marker);
}

function clusterOffsets(count) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const radius = count <= 4 ? 10 : 12;
  return Array.from({ length: count }, (_, index) => {
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / count);
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  });
}

function selectUnit(unit) {
  if (!unit?.id || typeof window.updateV39ActiveFactionState !== "function") return;
  window.updateV39ActiveFactionState({ selectedUnitId: unit.id }, { reason: "map-unit-selected" });
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail: { unitId: unit.id, unit } }));
}

function drawUnits(scene, container, units, selectedUnitId) {
  const groups = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    const x = finiteCoord(unit?.x);
    const y = finiteCoord(unit?.y);
    if (x === null || y === null) continue;
    const key = `${x},${y}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }

  for (const group of groups.values()) {
    const visible = group.slice(0, 5);
    const offsets = clusterOffsets(visible.length);
    visible.forEach((unit, index) => {
      const x = finiteCoord(unit.x);
      const y = finiteCoord(unit.y);
      const center = tileCenter(x, y);
      const offset = offsets[index];
      const cx = center.x + offset.x;
      const cy = center.y + offset.y;
      const selected = unit.id === selectedUnitId;

      const marker = scene.add.container(cx, cy);
      const bg = scene.add.circle(0, 0, selected ? 8 : 7, selected ? 0x174653 : 0x152b34, 0.98)
        .setStrokeStyle(selected ? 3 : 2, selected ? 0xffdd72 : 0x8bd5e4, 1);
      const glyph = scene.add.text(0, -0.5, String(unit.icon || unit.name || "人").slice(0, 2), {
        fontSize: selected ? "9px" : "8px",
        fontStyle: "bold",
        color: "#e8f7fb"
      }).setOrigin(0.5);

      marker.add([bg, glyph]);
      marker.setSize(20, 20);
      marker.setInteractive({ useHandCursor: true });
      marker.on("pointerdown", (_pointer, _lx, _ly, event) => {
        event?.stopPropagation?.();
        selectUnit(unit);
      });
      container.add(marker);
    });

    if (group.length > visible.length) {
      const first = group[0];
      const center = tileCenter(finiteCoord(first.x), finiteCoord(first.y));
      const more = scene.add.text(center.x + 12, center.y + 10, `+${group.length - visible.length}`, {
        fontSize: "8px",
        fontStyle: "bold",
        color: "#ffffff",
        backgroundColor: "#0b1519",
        padding: { x: 2, y: 1 }
      }).setOrigin(0.5);
      container.add(more);
    }
  }
}

function renderMarkers() {
  const scene = activeScene();
  const faction = activeFaction();
  if (!scene || !faction) return false;

  clearMarkers();
  markerContainer = scene.add.container(0, 0).setDepth(LAYER_DEPTH);
  attachMarkerScaleUpdater(scene);
  drawBase(scene, markerContainer, faction.village);
  drawUnits(scene, markerContainer, faction.units, faction.selectedUnitId);
  refreshReadableMarkerScales(scene);
  return true;
}

function scheduleRefresh(delay = 0) {
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (renderMarkers()) return;
    refreshTimer = window.setTimeout(() => renderMarkers(), 80);
  }, delay);
}

function install() {
  window.addEventListener("v39:field-generated", () => scheduleRefresh(60));
  window.addEventListener("v39:game-state-changed", () => scheduleRefresh());
  window.addEventListener("v39:initial-placement-complete", () => scheduleRefresh());
  window.addEventListener("v39:unit-selected", () => scheduleRefresh());
  window.refreshV39MapEntities = () => renderMarkers();
  scheduleRefresh(100);
}

install();
