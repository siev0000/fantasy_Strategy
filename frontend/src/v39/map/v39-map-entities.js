import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { getFactionSettlements, getSelectedSettlement } from "../../lib/settlement-state.js";
import { resolveVillageScaleDefinition } from "../../composables/villageCoreUtils.js";
import {
  MAP_ENTITY_SIZE_RULES,
  tileRelativePx
} from "../../lib/map-entity-size-rules.js";
import {
  resolveEnemyArtwork,
  resolveNestArtwork,
  resolveSettlementArtwork,
  resolveUnitArtwork
} from "../../lib/map-entity-artwork.js";

const STRUCTURE_LAYER_DEPTH = 10;
const UNIT_LAYER_DEPTH = 12;
const UNIT_IMAGE_FILL = 0.95;
const ENEMY_IMAGE_FILL = 0.95;
const TEST_UNDISCOVERED_ENEMY_ALPHA = 0.4;

let structureContainer = null;
let unitContainer = null;
let refreshTimer = null;
let refreshPendingDuringBatch = false;
let lastMarkerRenderSignature = null;
let markerArtworkVersion = 0;
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

function settlementOccupiedTiles(village) {
  const x = finiteCoord(village?.x);
  const y = finiteCoord(village?.y);
  if (x === null || y === null) return [];
  const centerKey = `${x},${y}`;
  const definition = resolveVillageScaleDefinition(village);
  const required = Math.max(1, Math.floor(Number(definition?.footprintTiles) || 1));
  const centerMap = village?.territoryResidentialCenterMap && typeof village.territoryResidentialCenterMap === "object"
    ? village.territoryResidentialCenterMap
    : {};
  const keys = [centerKey, ...Object.entries(centerMap)
    .filter(([tileKey, ownerKey]) => tileKey !== centerKey && String(ownerKey || "") === centerKey)
    .map(([tileKey]) => tileKey)];
  return [...new Set(keys)].slice(0, required).map(key => {
    const [tileX, tileY] = key.split(",").map(Number);
    return Number.isFinite(tileX) && Number.isFinite(tileY) ? { key, x:tileX, y:tileY } : null;
  }).filter(Boolean);
}

function settlementVisualBounds(village, baseSize) {
  const occupied = settlementOccupiedTiles(village);
  const fallback = tileCenter(village.x, village.y);
  if (occupied.length <= 1) {
    return { x:fallback.x, y:fallback.y, width:baseSize, height:baseSize, occupied };
  }
  const centers = occupied.map(tile => tileCenter(tile.x, tile.y));
  const xs = centers.map(point => point.x);
  const ys = centers.map(point => point.y);
  return {
    x:xs.reduce((sum, value) => sum + value, 0) / xs.length,
    y:ys.reduce((sum, value) => sum + value, 0) / ys.length,
    width:(Math.max(...xs) - Math.min(...xs)) + baseSize,
    height:(Math.max(...ys) - Math.min(...ys)) + baseSize,
    occupied
  };
}

function visualUnitSignature(unit) {
  if (!unit || typeof unit !== "object") return "";
  const profile = unit.combatProfile || {};
  return [
    unit.id ?? unit.unitId ?? unit.characterId,
    unit.x, unit.y, unit.name, unit.race, unit.raceName, unit.className, unit.class,
    unit.imageName, unit.image, unit.illustrationName, unit.画像,
    unit.icon, unit.iconName, unit.subIconName,
    unit.currentHp, unit.hp, unit.maxHp, unit.state, unit.condition,
    unit.unitType, profile.mode, profile.unitTypeLabel, profile.memberCount, profile.populationCost,
    unit.lastStealthBreakTurn, unit.lastStealthBreakReason
  ].map(value => String(value ?? "")).join("~");
}

function visualSettlementSignature(settlement) {
  if (!settlement || typeof settlement !== "object") return "";
  return [
    settlement.id, settlement.x, settlement.y, settlement.placed, settlement.ownerPlayerId,
    settlement.scaleKey, settlement.scaleLevel, settlement.scale, settlement.type,
    settlement.imageName, settlement.image, settlement.画像,
    ...Object.entries(settlement.territoryResidentialCenterMap || {}).sort().flat(),
    ...Object.entries(settlement.territoryTileModeMap || {}).sort().flat(),
    ...Object.entries(settlement.territoryTileConversionMap || {}).sort().flatMap(([key, value]) => [key, value?.targetMode, value?.remainingTurns]),
    ...Object.entries(settlement.tileFacilityMap || {}).sort().flatMap(([key, names]) => [key, ...(Array.isArray(names) ? names : [])]),
    ...(Array.isArray(settlement.constructionQueue) ? settlement.constructionQueue : []).flatMap(item => [item?.tileKey, item?.facilityName, item?.remainingTurns])
  ].map(value => String(value ?? "")).join("~");
}

function visualNestSignature(nest) {
  if (!nest || typeof nest !== "object") return "";
  return [
    nest.id, nest.x, nest.y, nest.imageName, nest.image, nest.画像, nest.nestType, nest.type,
    ...(Array.isArray(nest.unitIds) ? nest.unitIds : [])
  ].map(value => String(value ?? "")).join("~");
}

function markerRenderSignature(faction, state) {
  const players = Array.isArray(state?.players) ? state.players : [];
  const activeSettlement = getSelectedSettlement(faction);
  const playerUnits = Array.isArray(faction?.units) ? faction.units.map(visualUnitSignature).sort() : [];
  const foreignUnits = players
    .filter(player => String(player?.id || "") !== String(state?.activePlayerId || ""))
    .flatMap(player => Array.isArray(player?.factionState?.units) ? player.factionState.units.map(visualUnitSignature) : [])
    .sort();
  const neutralVillageUnits = (Array.isArray(state?.neutralVillages) ? state.neutralVillages : [])
    .flatMap(village => Array.isArray(village?.defenseUnits) ? village.defenseUnits.map(visualUnitSignature) : [])
    .sort();
  return [
    String(state?.activePlayerId || ""),
    String(faction?.selectedUnitId || ""),
    isTestMode() ? "test" : "normal",
    String(window.__v39VisibilityRenderVersion || 0),
    String(markerArtworkVersion),
    [...(Array.isArray(state?.settlements) ? state.settlements : []), activeSettlement].map(visualSettlementSignature).sort().join("|"),
    (Array.isArray(state?.enemyNests) ? state.enemyNests : []).map(visualNestSignature).sort().join("|"),
    playerUnits.join("|"),
    foreignUnits.join("|"),
    neutralVillageUnits.join("|"),
    (Array.isArray(state?.enemies) ? state.enemies : []).map(visualUnitSignature).sort().join("|"),
    (Array.isArray(state?.wandererGroups) ? state.wandererGroups : []).map(group => [
      group?.id, group?.x, group?.y, ...(Array.isArray(group?.discoveredByPlayerIds) ? group.discoveredByPlayerIds : [])
    ].map(value => String(value ?? "")).join("~")).sort().join("|")
  ].join(";");
}

function clearMarkers() {
  if (structureContainer?.destroy) structureContainer.destroy(true);
  if (unitContainer?.destroy) unitContainer.destroy(true);
  structureContainer = null;
  unitContainer = null;
  markerByEntityId.clear();
}

function hasActiveMarkerContainers(scene) {
  const children = scene?.children?.list || [];
  return structureContainer?.scene === scene
    && unitContainer?.scene === scene
    && children.includes(structureContainer)
    && children.includes(unitContainer);
}

function drawBase(scene, container, village) {
  if (!village?.placed) return;
  const x = finiteCoord(village.x);
  const y = finiteCoord(village.y);
  if (x === null || y === null) return;

  const artwork = resolveSettlementArtwork(village);
  const oldSpecSize = Number(artwork?.sizePx) || tileRelativePx(MAP_ENTITY_SIZE_RULES.base.diameterTiles);
  const bounds = settlementVisualBounds(village, oldSpecSize);
  const marker = scene.add.container(bounds.x, bounds.y).setName(
    village?.neutral === true ? "v39-neutral-village-marker" : "v39-settlement-marker"
  );
  marker.setData("settlementId", String(village?.settlementId || village?.id || ""));
  marker.setData("scaleKey", String(village?.scaleKey || ""));
  marker.setData("occupiedTileKeys", bounds.occupied.map(tile => tile.key));
  marker.setData("displayWidth", bounds.width);
  marker.setData("displayHeight", bounds.height);
  if (artwork && ensureArtworkTexture(scene, artwork)) {
    marker.add(scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5).setDisplaySize(bounds.width, bounds.height));
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
  // 選択中拠点は勢力状態側が正本。世界一覧に同座標の旧データが残っていても先に描画する。
  for (const settlement of [activeVillage, ...(Array.isArray(settlements) ? settlements : [])]) {
    if (!settlement) continue;
    const x = finiteCoord(settlement.x);
    const y = finiteCoord(settlement.y);
    if (x === null || y === null) continue;
    const key = `${x},${y}`;
    if (seen.has(key)) continue;
    const isOwnBase = settlement.id === activeVillage?.id || settlement.ownerPlayerId === gameState()?.activePlayerId;
    // 未探索の一般村はFogに隠す。ただしテストモードでは初期配置を確認できるよう全件表示する。
    if (!isOwnBase && !isTestMode() && window.isV39TileExplored?.(x, y) === false) continue;
    seen.add(key);
    drawBase(scene, container, { ...settlement, placed: settlement.placed !== false });
  }
}

function drawEnemyNests(scene, container, nests) {
  const revealAll = isTestMode();
  const rule = MAP_ENTITY_SIZE_RULES.nest;
  for (const nest of Array.isArray(nests) ? nests : []) {
    const x = finiteCoord(nest?.x);
    const y = finiteCoord(nest?.y);
    if (x === null || y === null) continue;
    if (!revealAll && window.isV39TileInCurrentVision?.(x, y) === false) continue;

    const memberCount = Array.isArray(nest?.unitIds) ? nest.unitIds.filter(Boolean).length : 0;
    const nestScale = memberCount === 1 ? Number(rule.singleMemberScale) || 1 : 1;
    const diameter = tileRelativePx(rule.diameterTiles * nestScale);
    const iconSize = tileRelativePx(rule.iconTiles * nestScale);
    const glyphFontSize = tileRelativePx(rule.glyphFontTiles * nestScale);

    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-enemy-nest-marker");
    const artwork = resolveNestArtwork(nest);
    if (artwork && ensureArtworkTexture(scene, artwork)) {
      const image = scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5).setAlpha(0.92);
      const scale = Math.min(iconSize / Math.max(1, Number(image.width)), iconSize / Math.max(1, Number(image.height)));
      image.setScale(scale);
      marker.add(image);
    } else {
      marker.add(scene.add.circle(0, 0, iconSize / 2, 0x54252a, 0.88));
      marker.add(scene.add.text(0, 0, "巣", {
        fontSize:`${glyphFontSize}px`, fontStyle:"bold", color:"#ffe8cf",
        stroke:"#351014", strokeThickness:3
      }).setOrigin(0.5));
    }
    marker.add(scene.add.circle(0, 0, diameter / 2, 0x000000, 0)
      .setStrokeStyle(Math.max(2, tileRelativePx(0.05)), 0xf0a06f, 0.95));
    markerByEntityId.set(String(nest.id || "").trim(), marker);
    container.add(marker);
  }
}

function firstCharacter(value, fallback = "施") {
  return Array.from(String(value || "").trim())[0] || fallback;
}

function addTileTextMarker(scene, container, tileKey, label, options = {}) {
  const [x, y] = String(tileKey || "").split(",").map(Number);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  const center = tileCenter(x, y);
  const marker = scene.add.container(
    center.x + (Number(options.offsetX) || 0),
    center.y + (Number(options.offsetY) || 0)
  ).setName(options.name || "v39-tile-text-marker");
  marker.setData("tileKey", tileKey);
  marker.setData("label", label);
  const radius = tileRelativePx(options.radiusTiles || 0.16);
  marker.add(scene.add.circle(0, 0, radius, options.fillColor || 0x28373b, options.fillAlpha ?? 0.96)
    .setStrokeStyle(Math.max(1.5, tileRelativePx(0.025)), options.strokeColor || 0xf0d28a, 1));
  marker.add(scene.add.text(0, options.subLabel ? -2 : 0, label, {
    fontSize:`${tileRelativePx(options.fontTiles || 0.2)}px`,
    fontStyle:"bold",
    color:options.textColor || "#fff5d8",
    stroke:"#071014",
    strokeThickness:2
  }).setOrigin(0.5));
  if (options.subLabel) {
    marker.add(scene.add.text(0, radius + 1, options.subLabel, {
      fontSize:`${tileRelativePx(0.12)}px`,
      fontStyle:"bold",
      color:"#fff2cb",
      stroke:"#071014",
      strokeThickness:2
    }).setOrigin(0.5, 0));
  }
  container.add(marker);
  return marker;
}

function drawSettlementTileMarkers(scene, container, faction) {
  const { width, height } = tileMetrics();
  const completedOffsetX = width * 0.28;
  const completedOffsetY = -height * 0.27;
  const pendingOffsetX = -width * 0.28;
  const pendingOffsetY = -height * 0.27;
  for (const settlement of getFactionSettlements(faction)) {
    for (const [tileKey, mode] of Object.entries(settlement?.territoryTileModeMap || {})) {
      if (String(mode) !== "settlement") continue;
      addTileTextMarker(scene, container, tileKey, "居", {
        name:"v39-residential-tile-marker",
        offsetX:width * 0.28,
        offsetY:height * 0.27,
        radiusTiles:0.115,
        fontTiles:0.145,
        fillColor:0x8a5725,
        strokeColor:0xffd99a
      });
    }
    for (const [tileKey, conversion] of Object.entries(settlement?.territoryTileConversionMap || {})) {
      const targetMode = String(conversion?.targetMode || "");
      addTileTextMarker(scene, container, tileKey, targetMode === "settlement" ? "居" : "資", {
        name:"v39-tile-conversion-marker",
        subLabel:`${Math.max(0, Math.floor(Number(conversion?.remainingTurns) || 0))}T`,
        radiusTiles:0.17,
        fontTiles:0.2,
        fillColor:0xb45e24,
        strokeColor:0xffd36d
      });
    }
    for (const [tileKey, facilityNames] of Object.entries(settlement?.tileFacilityMap || {})) {
      (Array.isArray(facilityNames) ? facilityNames : []).slice(0, 1).forEach(facilityName => {
        addTileTextMarker(scene, container, tileKey, firstCharacter(facilityName), {
          name:"v39-facility-marker",
          offsetX:completedOffsetX,
          offsetY:completedOffsetY,
          radiusTiles:0.14,
          fontTiles:0.18,
          fillColor:0x234d43,
          strokeColor:0xa9e2ba
        })?.setData("facilityName", String(facilityName || ""));
      });
    }
    for (const item of Array.isArray(settlement?.constructionQueue) ? settlement.constructionQueue : []) {
      addTileTextMarker(scene, container, item?.tileKey, firstCharacter(item?.facilityName), {
        name:"v39-facility-construction-marker",
        subLabel:`${Math.max(0, Math.floor(Number(item?.remainingTurns) || 0))}T`,
        offsetX:pendingOffsetX,
        offsetY:pendingOffsetY,
        radiusTiles:0.15,
        fontTiles:0.18,
        fillColor:0x8a5a24,
        strokeColor:0xffd36d
      })?.setData("facilityName", String(item?.facilityName || ""));
    }
  }
}

function selectUnit(unit) {
  if (window.isV39MapInputLocked?.() === true) return;
  const attackSession = window.getV39AttackSession?.();
  const targetX = finiteCoord(unit?.x);
  const targetY = finiteCoord(unit?.y);
  if (attackSession && targetX !== null && targetY !== null) {
    // During skill targeting, a friendly marker is a tile target, not a new actor selection.
    window.executeV39AttackAt?.(targetX, targetY);
    return;
  }
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
      markerArtworkVersion += 1;
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

  const frameKey = ensureArtworkSheetFrame(scene, artwork);
  const image = frameKey
    ? scene.add.image(0, 0, artwork.textureKey, frameKey).setOrigin(0.5)
    : scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
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

function militaryUnitMemberCount(unit) {
  const mode = String(unit?.combatProfile?.mode || "").trim();
  const type = `${unit?.unitType || ""} ${unit?.combatProfile?.unitTypeLabel || ""}`;
  if (mode !== "army" && mode !== "elite_army" && !type.includes("軍隊")) return 0;
  const memberCount = Math.floor(Number(unit?.combatProfile?.memberCount) || 0);
  const populationCost = Math.floor(Number(unit?.combatProfile?.populationCost) || 0);
  return Math.max(0, memberCount || populationCost);
}

function addMilitaryMemberCount(scene, marker, unit, radius) {
  const memberCount = militaryUnitMemberCount(unit);
  if (memberCount <= 0) return;
  const label = scene.add.text(radius * 0.68, -radius * 0.68, String(memberCount), {
    fontFamily:"Consolas, 'Courier New', monospace",
    fontStyle:"800",
    fontSize:`${Math.max(12, tileRelativePx(0.2))}px`,
    color:"#ffffff",
    stroke:"#09111f",
    strokeThickness:Math.max(3, tileRelativePx(0.05))
  }).setOrigin(0.5).setName("v39-military-unit-member-count");
  label.setResolution(2);
  marker.add(label);
}

function ensureArtworkSheetFrame(scene, artwork) {
  const frame = artwork?.sheetFrame;
  if (!frame || !scene?.textures?.exists?.(artwork.textureKey)) return "";

  const texture = scene.textures.get(artwork.textureKey);
  if (!texture) return "";

  const frameKey = String(
    frame.frameKey
    || `slot-${frame.sheetNumber ?? "sheet"}-${frame.slotNumber ?? 0}`
  );
  const hasFrame = typeof texture.has === "function"
    ? texture.has(frameKey)
    : Boolean(texture.frames?.[frameKey]);
  if (hasFrame) return frameKey;

  const source = texture.source?.[0];
  const sourceWidth = Math.max(1, Number(source?.width) || 1);
  const sourceHeight = Math.max(1, Number(source?.height) || 1);
  const columns = Math.max(1, Number(frame.columns) || 1);
  const rows = Math.max(1, Number(frame.rows) || 1);
  const width = sourceWidth / columns;
  const height = sourceHeight / rows;
  const x = Math.max(0, Number(frame.column) || 0) * width;
  const y = Math.max(0, Number(frame.row) || 0) * height;

  texture.add(frameKey, 0, x, y, width, height);
  return frameKey;
}

function addEnemyArtwork(scene, marker, enemy, diameter) {
  const artwork = resolveEnemyArtwork(enemy);
  if (!artwork || !ensureArtworkTexture(scene, artwork)) return false;

  const frameKey = ensureArtworkSheetFrame(scene, artwork);
  const image = frameKey
    ? scene.add.image(0, 0, artwork.textureKey, frameKey).setOrigin(0.5)
    : scene.add.image(0, 0, artwork.textureKey).setOrigin(0.5);
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
  addMilitaryMemberCount(scene, marker, unit, radius);

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
      if (!unit || x === null || y === null) continue;
      const normallyVisible = window.isV39TileInCurrentVision?.(x, y) !== false && group.some(member => window.isV39EntityDetected?.(member) !== false);
      if (!isTestMode() && !normallyVisible) continue;
      const center = tileCenter(x, y);
      const marker = scene.add.container(center.x, center.y).setName("v39-foreign-unit-marker");
      if (isTestMode() && !normallyVisible) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
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
      addMilitaryMemberCount(scene, marker, unit, radius);
      container.add(marker);
    }
  }
}

function drawNeutralVillageUnits(scene, container, villages) {
  const rule = MAP_ENTITY_SIZE_RULES.unit;
  const diameter = tileRelativePx(rule.diameterTiles);
  const radius = diameter / 2;
  const glyphFontSize = tileRelativePx(rule.glyphFontTiles);
  const revealAll = isTestMode();
  const units = (Array.isArray(villages) ? villages : [])
    .flatMap(village => Array.isArray(village?.defenseUnits) ? village.defenseUnits : []);

  for (const group of unitGroupsByTile(units).values()) {
    const unit = representativeUnit(group, "");
    const x = finiteCoord(unit?.x);
    const y = finiteCoord(unit?.y);
    if (!unit || x === null || y === null) continue;
    const normallyVisible = window.isV39TileInCurrentVision?.(x, y) !== false && group.some(member => window.isV39EntityDetected?.(member) !== false);
    if (!revealAll && !normallyVisible) continue;

    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-neutral-village-unit-marker");
    if (revealAll && !normallyVisible) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
    for (const member of group) {
      const id = String(member?.id || "").trim();
      if (id) markerByEntityId.set(id, marker);
    }

    if (!addUnitArtwork(scene, marker, unit, diameter)) {
      marker.add([
        scene.add.circle(0, 0, radius, 0x4a4021, 0.97)
          .setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe0c46c, 1),
        scene.add.text(0, -0.5, "兵", {
          fontSize:`${glyphFontSize}px`,
          fontStyle:"bold",
          color:"#fff1b6"
        }).setOrigin(0.5)
      ]);
    } else {
      marker.add(scene.add.circle(0, 0, radius, 0x000000, 0)
        .setStrokeStyle(Math.max(2, tileRelativePx(0.04)), 0xe0c46c, 0.95));
    }
    addDeadMark(scene, marker, unit, radius);
    addMilitaryMemberCount(scene, marker, unit, radius);
    container.add(marker);
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
    const inCurrentVision = window.isV39TileInCurrentVision?.(x, y) !== false;
    const detected = group.some(member => window.isV39EntityDetected?.(member) !== false);
    const visibleByNormalRules = inCurrentVision && detected;
    if (!revealAllEnemies && !visibleByNormalRules) continue;
    const center = tileCenter(x, y);
    const marker = scene.add.container(center.x, center.y).setName("v39-enemy-marker");
    if (revealAllEnemies && !visibleByNormalRules) marker.setAlpha(TEST_UNDISCOVERED_ENEMY_ALPHA);
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
    addMilitaryMemberCount(scene, marker, enemy, radius);
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

  const signature = markerRenderSignature(faction, state);
  if (signature === lastMarkerRenderSignature && hasActiveMarkerContainers(scene)) return true;
  lastMarkerRenderSignature = signature;

  clearMarkers();
  structureContainer = scene.add.container(0, 0).setDepth(STRUCTURE_LAYER_DEPTH).setName("v39-structure-layer");
  unitContainer = scene.add.container(0, 0).setDepth(UNIT_LAYER_DEPTH).setName("v39-unit-layer");
  drawBases(scene, structureContainer, state?.settlements, getSelectedSettlement(faction));
  drawEnemyNests(scene, structureContainer, state?.enemyNests);
  drawSettlementTileMarkers(scene, structureContainer, faction);
  drawUnits(scene, unitContainer, faction.units, faction.selectedUnitId);
  drawForeignUnits(scene, unitContainer, state?.players, state?.activePlayerId);
  drawNeutralVillageUnits(scene, unitContainer, state?.neutralVillages);
  drawEnemies(scene, unitContainer, state?.enemies);
  drawWanderers(scene, unitContainer, state?.wandererGroups, state?.activePlayerId);
  return true;
}

function scheduleRefresh(delay = 0) {
  if (window.isV39MapRenderBatchActive?.() === true) {
    refreshPendingDuringBatch = true;
    return false;
  }
  refreshPendingDuringBatch = false;
  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    if (window.isV39MapRenderBatchActive?.() === true) {
      refreshPendingDuringBatch = true;
      return;
    }
    if (renderMarkers()) return;
    refreshTimer = window.setTimeout(() => renderMarkers(), 80);
  }, delay);
  return true;
}

function install() {
  window.addEventListener("v39:field-generated", () => {
    lastMarkerRenderSignature = null;
    scheduleRefresh(60);
  });
  window.addEventListener("v39:game-state-changed", () => scheduleRefresh());
  window.addEventListener("v39:initial-placement-complete", () => scheduleRefresh());
  window.addEventListener("v39:unit-selected", () => scheduleRefresh());
  window.addEventListener("v39:display-settings-changed", () => scheduleRefresh());
  window.addEventListener("v39:visibility-rendered", () => scheduleRefresh());
  window.addEventListener("v39:map-render-batch-ended", event => {
    if (refreshPendingDuringBatch || event?.detail?.force === true) scheduleRefresh();
  });
  window.refreshV39MapEntities = () => renderMarkers();
  window.getV39MapEntityMarker = entityId => markerByEntityId.get(String(entityId || "").trim()) || null;
  scheduleRefresh(100);
}

install();
