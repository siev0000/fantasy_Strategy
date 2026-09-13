import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import {
  MAP_ENTITY_SIZE_RULES,
  tileRelativePx,
  readableEntityScale
} from "./lib/map-entity-size-rules.js";

const LAYER_DEPTH = 12;
let markerContainer = null;
let refreshTimer = null;
let markerScaleScene = null;
let markerScaleHandler = null;
const readableMarkers = new Map();

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

function refreshReadableMarkerScales(scene = markerScaleScene) {
  if (!scene) return;
  for (const [marker, metrics] of readableMarkers) {
    if (!marker?.active || typeof marker.setScale !== "function") continue;
    marker.setScale(readableEntityScale(scene, metrics));
  }
}

function registerReadableMarker(scene, marker, metrics) {
  if (!marker) return marker;
  readableMarkers.set(marker, metrics || {});
  marker.setScale?.(readableEntityScale(scene, metrics));
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

  const rule = MAP_ENTITY_SIZE_RULES.base;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const iconSize = tileRelativePx(rule.iconTiles);
  const labelFontSize = tileRelativePx(rule.labelFontTiles);
  const labelOffset = tileRelativePx(rule.labelOffsetTiles);
  const c = tileCenter(x, y);
  const marker = registerReadableMarker(scene, scene.add.container(c.x, c.y), {
    worldDiameterPx: diameter,
    worldFontPx: labelFontSize,
    minScreenDiameterPx: rule.minScreenDiameterPx,
    minScreenFontPx: rule.minScreenFontPx
  });

  const g = scene.add.graphics();
  g.fillStyle(0x071014, 0.96);
  g.lineStyle(Math.max(2, tileRelativePx(0.045)), 0xf0cf79, 1);
  g.fillCircle(0, 0, radius);
  g.strokeCircle(0, 0, radius);

  const roofHalf = iconSize * 0.36;
  const roofTop = -iconSize * 0.34;
  const roofBottom = iconSize * 0.06;
  const bodyHalfWidth = iconSize * 0.25;
  const bodyHeight = iconSize * 0.31;
  g.fillStyle(0xf0cf79, 1);
  g.fillTriangle(-roofHalf, roofBottom, 0, roofTop, roofHalf, roofBottom);
  g.fillRect(-bodyHalfWidth, roofBottom, bodyHalfWidth * 2, bodyHeight);
  g.fillStyle(0x071014, 1);
  g.fillRect(-iconSize * 0.07, roofBottom + bodyHeight * 0.42, iconSize * 0.14, bodyHeight * 0.58);

  const label = scene.add.text(0, labelOffset, village.name || "拠点", {
    fontSize: `${labelFontSize}px`,
    fontStyle: "bold",
    color: "#fff0bd",
    stroke: "#071014",
    strokeThickness: Math.max(4, tileRelativePx(0.08)),
    backgroundColor: "#071014",
    padding: { x: Math.max(4, tileRelativePx(0.07)), y: Math.max(2, tileRelativePx(0.03)) }
  }).setOrigin(0.5, 0);

  marker.add([g, label]);
  container.add(marker);
}

function clusterOffsets(count) {
  if (count <= 1) return [{ x: 0, y: 0 }];
  const rule = MAP_ENTITY_SIZE_RULES.cluster;
  const radius = tileRelativePx(count <= 4 ? rule.offsetTilesSmall : rule.offsetTilesLarge);
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
      const rule = MAP_ENTITY_SIZE_RULES.unit;
      const diameter = tileRelativePx(selected ? rule.selectedDiameterTiles : rule.diameterTiles);
      const radius = diameter / 2;
      const glyphFontSize = tileRelativePx(rule.glyphFontTiles);

      const marker = registerReadableMarker(scene, scene.add.container(cx, cy), {
        worldDiameterPx: diameter,
        worldFontPx: glyphFontSize,
        minScreenDiameterPx: rule.minScreenDiameterPx,
        minScreenFontPx: rule.minScreenFontPx
      });
      const bg = scene.add.circle(0, 0, radius, selected ? 0x174653 : 0x152b34, 0.98)
        .setStrokeStyle(
          Math.max(selected ? 3 : 2, tileRelativePx(selected ? 0.055 : 0.04)),
          selected ? 0xffdd72 : 0x8bd5e4,
          1
        );
      const glyph = scene.add.text(0, -0.5, String(unit.icon || unit.name || "人").slice(0, 2), {
        fontSize: `${glyphFontSize}px`,
        fontStyle: "bold",
        color: "#e8f7fb"
      }).setOrigin(0.5);

      marker.add([bg, glyph]);
      marker.setSize(diameter, diameter);
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
      const more = scene.add.text(
        center.x + tileRelativePx(0.45),
        center.y + tileRelativePx(0.45),
        `+${group.length - visible.length}`,
        {
          fontSize: `${tileRelativePx(0.24)}px`,
          fontStyle: "bold",
          color: "#ffffff",
          backgroundColor: "#0b1519",
          padding: { x: 3, y: 2 }
        }
      ).setOrigin(0.5);
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