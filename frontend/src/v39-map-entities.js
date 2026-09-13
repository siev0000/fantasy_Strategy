import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import {
  MAP_ENTITY_SIZE_RULES,
  tileRelativePx
} from "./lib/map-entity-size-rules.js";

const LAYER_DEPTH = 12;
const UNIT_IMAGE_FILL = 0.95;
const HUMAN_RACE_NAME = "只人";
const HUMAN_CLASS_IMAGE_FILES = Object.freeze({
  "アーチャー": "アーチャー.webp",
  "ウィザード": "ウィザード.webp",
  "ウォーウィザード": "ウォーウィザード.webp",
  "クレリック": "クレリック.webp",
  "ソルジャー": "ソルジャー.webp",
  "デスィード": "デスィード.webp",
  "ナイト": "ナイト.png",
  "ニンジャ": "ニンジャ.webp",
  "ビルダー": "ビルダー.webp",
  "ファイター": "ファイター.webp",
  "ファーマー": "ファーマー.webp",
  "フェンサー": "フェンサー.webp",
  "ヘルパー": "ヘルパー.webp",
  "ホーリーナイト": "ホーリーナイト.webp",
  "モンク": "モンク.webp",
  "レンジャー": "レンジャー.webp",
  "ローグ": "ローグ.webp",
  "武士の戦士": "武士の戦士.webp"
});

let markerContainer = null;
let refreshTimer = null;
const textureLoadState = new WeakMap();

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

function clearMarkers() {
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
  const c = tileCenter(x, y);

  // Map entities are world-space objects: no inverse zoom compensation.
  // They scale exactly with the tile. Names/details are shown elsewhere after tile selection.
  const marker = scene.add.container(c.x, c.y);
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

  marker.add(g);
  container.add(marker);
}

function selectUnit(unit) {
  if (!unit?.id || typeof window.updateV39ActiveFactionState !== "function") return;
  window.updateV39ActiveFactionState({ selectedUnitId: unit.id }, { reason: "map-unit-selected" });
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail: { unitId: unit.id, unit } }));
}

function unitGroupsByTile(units) {
  const groups = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    const x = finiteCoord(unit?.x);
    const y = finiteCoord(unit?.y);
    if (x === null || y === null) continue;
    const key = `${x},${y}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return groups;
}

function representativeUnit(group, selectedUnitId) {
  if (!Array.isArray(group) || !group.length) return null;
  return group.find(unit => unit?.id === selectedUnitId) || group[0];
}

function unitArtwork(unit) {
  if (String(unit?.race || "").trim() !== HUMAN_RACE_NAME) return null;
  const className = String(unit?.className || "").trim();
  const fileName = HUMAN_CLASS_IMAGE_FILES[className];
  if (!fileName) return null;
  return {
    textureKey: `v39-unit-${HUMAN_RACE_NAME}-${className}`,
    url: `/assets/images/units/${HUMAN_RACE_NAME}/${fileName}`
  };
}

function sceneTextureStates(scene) {
  let states = textureLoadState.get(scene);
  if (!states) {
    states = new Map();
    textureLoadState.set(scene, states);
  }
  return states;
}

function ensureUnitTexture(scene, artwork) {
  if (!artwork || !scene?.textures) return false;
  if (scene.textures.exists?.(artwork.textureKey)) return true;

  const states = sceneTextureStates(scene);
  const state = states.get(artwork.textureKey);
  if (state === "loading" || state === "failed") return false;

  states.set(artwork.textureKey, "loading");
  const image = new Image();
  image.onload = () => {
    try {
      if (!scene.textures.exists(artwork.textureKey)) {
        scene.textures.addImage(artwork.textureKey, image);
      }
      states.set(artwork.textureKey, "loaded");
      scheduleRefresh();
    } catch (error) {
      states.set(artwork.textureKey, "failed");
      console.error("[v39-map-entities] unit texture registration failed", artwork.url, error);
    }
  };
  image.onerror = () => {
    states.set(artwork.textureKey, "failed");
    console.error(`[v39-map-entities] failed to load ${artwork.url}`);
  };
  image.src = artwork.url;
  return false;
}

function addSelectionRing(scene, marker, radius, selected) {
  if (!selected) return;
  const ring = scene.add.circle(0, 0, radius, 0x000000, 0)
    .setStrokeStyle(Math.max(3, tileRelativePx(0.055)), 0xffdd72, 1);
  marker.add(ring);
}

function addUnitArtwork(scene, marker, unit, diameter) {
  const artwork = unitArtwork(unit);
  if (!artwork || !ensureUnitTexture(scene, artwork)) return false;

  const image = scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const target = diameter * UNIT_IMAGE_FILL;
  const scale = Math.min(target / sourceWidth, target / sourceHeight);
  image.setScale(scale);
  marker.add(image);
  return true;
}

function addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected) {
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
}

function drawUnitGroup(scene, container, group, selectedUnitId) {
  const unit = representativeUnit(group, selectedUnitId);
  if (!unit) return;

  const x = finiteCoord(unit.x);
  const y = finiteCoord(unit.y);
  if (x === null || y === null) return;

  const selected = unit.id === selectedUnitId;
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const center = tileCenter(x, y);

  // One tile renders only one icon. No count/name text is permanently attached to the map.
  // Unit markers stay in world-space and scale exactly with their tile.
  const marker = scene.add.container(center.x, center.y);
  const artworkAdded = addUnitArtwork(scene, marker, unit, diameter);

  if (artworkAdded) {
    addSelectionRing(scene, marker, radius, selected);
  } else {
    addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected);
  }

  marker.setSize(diameter, diameter);
  marker.setInteractive({ useHandCursor: true });
  marker.on("pointerdown", (_pointer, _lx, _ly, event) => {
    event?.stopPropagation?.();
    selectUnit(unit);
  });
  container.add(marker);
}

function drawUnits(scene, container, units, selectedUnitId) {
  const list = Array.isArray(units) ? units : [];
  for (const group of unitGroupsByTile(list).values()) {
    drawUnitGroup(scene, container, group, selectedUnitId);
  }
}

function renderMarkers() {
  const scene = activeScene();
  const faction = activeFaction();
  if (!scene || !faction) return false;

  clearMarkers();
  markerContainer = scene.add.container(0, 0).setDepth(LAYER_DEPTH);
  drawBase(scene, markerContainer, faction.village);
  drawUnits(scene, markerContainer, faction.units, faction.selectedUnitId);
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