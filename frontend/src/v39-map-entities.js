import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";
import { getSelectedSettlement } from "./lib/settlement-state.js";
import {
  MAP_ENTITY_SIZE_RULES,
  tileRelativePx
} from "./lib/map-entity-size-rules.js";
import {
  resolveEnemyArtwork,
  resolveSettlementArtwork,
  resolveUnitArtwork
} from "./lib/map-entity-artwork.js";

const LAYER_DEPTH = 12;
const UNIT_IMAGE_FILL = 0.95;
const ENEMY_IMAGE_FILL = 0.95;

let markerContainer = null;
let refreshTimer = null;
const markerByEntityId = new Map();
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

function gameState() {
  try {
    return typeof window.getV39GameState === "function"
      ? window.getV39GameState()
      : null;
  } catch {
    return null;
  }
}

function isTestMode() {
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

function finiteCoord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

function clearMarkers() {
  if (markerContainer?.destroy) markerContainer.destroy(true);
  markerContainer = null;
  markerByEntityId.clear();
}

function drawBase(scene, container, village) {
  if (!village?.placed) return;
  const x = finiteCoord(village.x);
  const y = finiteCoord(village.y);
  if (x === null || y === null) return;

  const c = tileCenter(x, y);
  const marker = scene.add.container(c.x, c.y).setName("v39-settlement-marker");
  const artwork = resolveSettlementArtwork(village);
  const oldSpecSize = Number(artwork?.sizePx) || tileRelativePx(MAP_ENTITY_SIZE_RULES.base.diameterTiles);
  if (artwork && ensureArtworkTexture(scene, artwork)) {
    marker.add(scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5).setDisplaySize(oldSpecSize, oldSpecSize));
  } else {
    marker.add(scene.add.text(0, 0, "⌂", {
      fontSize: `${tileRelativePx(0.3)}px`,
      fontStyle: "bold",
      color: "#f0cf79",
      stroke: "#071014",
      strokeThickness: 2
    }).setOrigin(0.5));
  }
  container.add(marker);
}

function drawBases(scene, container, settlements, activeVillage) {
  const seen = new Set();
  for (const settlement of [...(Array.isArray(settlements) ? settlements : []), activeVillage]) {
    if (!settlement) continue;
    const x = finiteCoord(settlement.x);
    const y = finiteCoord(settlement.y);
    if (x === null || y === null) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const isOwnBase = settlement.id === activeVillage?.id || settlement.ownerPlayerId === gameState()?.activePlayerId;
    if (!isOwnBase && window.isV39TileExplored?.(x, y) === false) continue;
    seen.add(key);
    drawBase(scene, container, { ...settlement, placed: settlement.placed !== false });
  }
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

function sceneTextureStates(scene) {
  let states = textureLoadState.get(scene);
  if (!states) {
    states = new Map();
    textureLoadState.set(scene, states);
  }
  return states;
}

function ensureArtworkTexture(scene, artwork) {
  if (!artwork || !scene?.textures) return false;
  if (scene.textures.exists?.(artwork.textureKey)) return true;

  const states = sceneTextureStates(scene);
  const state = states.get(artwork.textureKey);
  if (state === "loading" || state === "failed") return false;

  states.set(artwork.textureKey, "loading");
  const image = new Image();
  image.onload = () => {
    try {
      if (!scene?.sys?.isActive?.() || !scene?.game?.renderer) return;
      if (!scene.textures.exists(artwork.textureKey)) {
        scene.textures.addImage(artwork.textureKey, image);
      }
      states.set(artwork.textureKey, "loaded");
      scheduleRefresh();
    } catch (error) {
      states.set(artwork.textureKey, "failed");
      console.error("[v39-map-entities] texture registration failed", artwork.src, error);
    }
  };
  image.onerror = () => {
    states.set(artwork.textureKey, "failed");
    console.error(`[v39-map-entities] failed to load ${artwork.src}`);
  };
  image.src = artwork.src;
  return false;
}

function addSelectionRing(scene, marker, radius, selected) {
  if (!selected) return;
  const ring = scene.add.circle(0, 0, radius, 0x000000, 0)
    .setStrokeStyle(Math.max(3, tileRelativePx(0.055)), 0xffdd72, 1);
  marker.add(ring);
}

function addUnitArtwork(scene, marker, unit, diameter) {
  const artwork = resolveUnitArtwork(unit);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return false;

  const image = scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const target = diameter * UNIT_IMAGE_FILL;
  const scale = Math.min(target / sourceWidth, target / sourceHeight);
  image.setScale(scale);
  if (unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0) image.setTint(0x777f82).setAlpha(0.72);
  marker.add(image);
  return true;
}

function addDeadMark(scene, marker, unit, radius) {
  const hp = Number(unit?.hp ?? unit?.currentHp);
  if (unit?.state !== "死亡" && (!Number.isFinite(hp) || hp > 0)) return;
  marker.add(scene.add.text(radius * 0.48, -radius * 0.48, "×", {
    fontSize:`${Math.max(14, radius * 0.72)}px`, fontStyle:"bold", color:"#fff4f1",
    stroke:"#681e1e", strokeThickness:Math.max(2, radius * 0.1)
  }).setOrigin(0.5));
}

function addEnemyArtwork(scene, marker, enemy, diameter) {
  const artwork = resolveEnemyArtwork(enemy);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return false;
  const image = scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
  const sourceWidth = Math.max(1, Number(image.width) || 1);
  const sourceHeight = Math.max(1, Number(image.height) || 1);
  const target = diameter * ENEMY_IMAGE_FILL;
  image.setScale(Math.min(target / sourceWidth, target / sourceHeight));
  if (enemy?.state === "死亡" || Number(enemy?.hp ?? enemy?.currentHp) <= 0) image.setTint(0x777f82).setAlpha(0.72);
  marker.add(image);
  return true;
}

function addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected) {
  const dead = unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0;
  const bg = scene.add.circle(0, 0, radius, dead ? 0x555b5d : selected ? 0x174653 : 0x152b34, dead ? 0.72 : 0.98)
    .setStrokeStyle(
      Math.max(selected ? 3 : 2, tileRelativePx(selected ? 0.055 : 0.04)),
      selected ? 0xffdd72 : 0x8bd5e4,
      1
    );
  const glyph = scene.add.text(0, -0.5, String(unit.icon || "◆").slice(0, 2), {
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
  const marker = scene.add.container(center.x, center.y).setName("v39-player-unit-marker");
  for (const member of group) {
    const id = String(member?.id || "").trim();
    if (id) markerByEntityId.set(id, marker);
  }
  const artworkAdded = addUnitArtwork(scene, marker, unit, diameter);

  if (artworkAdded) {
    addSelectionRing(scene, marker, radius, selected);
  } else {
    addFallbackUnitGlyph(scene, marker, unit, radius, glyphFontSize, selected);
  }
  addDeadMark(scene, marker, unit, radius);

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

function drawForeignUnits(scene, container, players, activePlayerId) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  for (const player of Array.isArray(players) ? players : []) {
    if (player?.id === activePlayerId) continue;
    for (const group of unitGroupsByTile(player?.factionState?.units).values()) {
      const unit = representativeUnit(group, "");
      const x = finiteCoord(unit?.x);
      const y = finiteCoord(unit?.y);
      if (!unit || x === null || y === null || window.isV39TileInCurrentVision?.(x, y) === false) continue;
      if (!group.some(member => window.isV39EntityDetected?.(member) !== false)) continue;
      const center = tileCenter(x, y);
      const marker = scene.add.container(center.x, center.y).setName("v39-foreign-unit-marker");
      for (const member of group) {
        const id = String(member?.id || "").trim();
        if (id) markerByEntityId.set(id, marker);
      }
      if (!addUnitArtwork(scene, marker, unit, diameter)) {
        const dead = unit?.state === "死亡" || Number(unit?.hp ?? unit?.currentHp) <= 0;
        const bg = scene.add.circle(0, 0, radius, dead ? 0x555b5d : 0x35252c, 0.96)
          .setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe19aaf, 1);
        const glyph = scene.add.text(0, -0.5, String(unit?.icon || "◆").slice(0, 2), {
          fontSize:`${glyphFontSize}px`, fontStyle:"bold", color:"#fff0f5"
        }).setOrigin(0.5);
        marker.add([bg, glyph]);
      } else {
        marker.add(scene.add.circle(0, 0, radius, 0x000000, 0).setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe19aaf, 0.9));
      }
      addDeadMark(scene, marker, unit, radius);
      container.add(marker);
    }
  }
}

function drawEnemies(scene, container, enemies) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const revealAllEnemies = isTestMode();
  for (const group of unitGroupsByTile(enemies).values()) {
    const enemy = representativeUnit(group, "");
    if (!enemy) continue;
    const x = finiteCoord(enemy.x);
    const y = finiteCoord(enemy.y);
    if (x === null || y === null) continue;
    if (!revealAllEnemies && window.isV39TileInCurrentVision?.(x, y) === false) continue;
    if (!revealAllEnemies && !group.some(member => window.isV39EntityDetected?.(member) !== false)) continue;
    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-enemy-marker");
    for (const member of group) {
      const id = String(member?.id || "").trim();
      if (id) markerByEntityId.set(id, marker);
    }
    if (!addEnemyArtwork(scene, marker, enemy, diameter)) {
      const bg = scene.add.circle(0, 0, radius, 0x3a1717, 0.98)
        .setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe89090, 1);
      const glyph = scene.add.text(0, -0.5, "◆", {
        fontSize: `${glyphFontSize}px`,
        fontStyle: "bold",
        color: "#fff0e8"
      }).setOrigin(0.5);
      marker.add([bg, glyph]);
    }
    addDeadMark(scene, marker, enemy, radius);
    container.add(marker);
  }
}

function drawWanderers(scene, container, groups, activePlayerId) {
  const diameter = tileRelativePx(MAP_ENTITY_SIZE_RULES.unit.diameterTiles * 0.72);
  for (const group of Array.isArray(groups) ? groups : []) {
    const x = finiteCoord(group?.x);
    const y = finiteCoord(group?.y);
    if (x === null || y === null || !group?.discoveredByPlayerIds?.includes(activePlayerId) || window.isV39TileInCurrentVision?.(x, y) === false) continue;
    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-wanderer-marker");
    marker.add([
      scene.add.circle(0, 0, diameter / 2, 0x66552d, 0.96).setStrokeStyle(2, 0xf0d58a, 1),
      scene.add.text(0, 0, "旅", { fontSize:`${tileRelativePx(0.27)}px`, fontStyle:"bold", color:"#fff0bd" }).setOrigin(0.5)
    ]);
    markerByEntityId.set(String(group.id || "").trim(), marker);
    container.add(marker);
  }
}

function renderMarkers() {
  const scene = activeScene();
  const faction = activeFaction();
  const state = gameState();
  if (!scene || !faction) return false;

  clearMarkers();
  markerContainer = scene.add.container(0, 0).setDepth(LAYER_DEPTH).setName("v39-entity-layer");
  drawBases(scene, markerContainer, state?.settlements, getSelectedSettlement(faction));
  drawUnits(scene, markerContainer, faction.units, faction.selectedUnitId);
  drawForeignUnits(scene, markerContainer, state?.players, state?.activePlayerId);
  drawEnemies(scene, markerContainer, state?.enemies);
  drawWanderers(scene, markerContainer, state?.wandererGroups, state?.activePlayerId);
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
  window.addEventListener("v39:display-settings-changed", () => scheduleRefresh());
  window.refreshV39MapEntities = () => renderMarkers();
  window.getV39MapEntityMarker = entityId => markerByEntityId.get(String(entityId || "").trim()) || null;
  scheduleRefresh(100);
}

install();
