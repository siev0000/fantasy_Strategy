import { facilityDefinitions } from "../../lib/v39-economy-rules.js";
import { getFactionSettlements } from "../../lib/settlement-state.js";
import {
  resolveDetectionGroupSense,
  resolveDetectionScoutValue,
  resolveEffectiveScoutAtDistance
} from "../../lib/v39-detection-rules.js";
import {
  BASE_VILLAGE_SCOUT_RANGE,
  FACTION_BORDER_COLOR_PALETTE,
  HEX_TILE_CONFIG,
  MAP_BOUNDARY_DASH_CONFIG
} from "../../lib/phaser-map-panel-config.js";

const FOG_LAYER_NAME = "v39-unexplored-fog-layer";
const SCOUT_LAYER_NAME = "v39-scout-boundary-layer";
const UNIT_SCOUT_LAYER_NAME = "v39-unit-scout-boundary-layer";
const TERRITORY_LAYER_NAME = "v39-own-territory-boundary-layer";
const NEST_TERRITORY_LAYER_NAME = "v39-nest-territory-boundary-layer";
const NEUTRAL_VILLAGE_TERRITORY_LAYER_NAME = "v39-neutral-village-territory-boundary-layer";
const UNIT_VISION_BASE_RANGE = 1;
const UNIT_VISION_SCOUT_STEP = 75;
const FOG_COLOR = 0x071014;
const FOG_ALPHA = 0.76;
const SCOUT_COLOR = 0x9edff2;
const SCOUT_ALPHA = 0.35;
const SCOUT_WIDTH = 1;
const TERRITORY_ALPHA = 0.9;
const TERRITORY_WIDTH = 2.4;
const NEST_TERRITORY_COLOR = 0xe67558;
const NEST_TERRITORY_ALPHA = 0.78;
const NEST_TERRITORY_WIDTH = 2.4;
const NEUTRAL_VILLAGE_TERRITORY_COLOR = 0xe7c66f;
const NEUTRAL_VILLAGE_TERRITORY_ALPHA = 0.72;
const NEUTRAL_VILLAGE_TERRITORY_WIDTH = 2;
const RETRY_MS = 20;
const RETRY_LIMIT = 180;

let renderRequestId = 0;
let lastSnapshot = {
  exploredTileKeys:new Set(),
  currentVisionTileKeys:new Set(),
  detectedEntityIds:new Set(),
  detectionByTile:new Map()
};

function coordKey(x, y) {
  return `${x},${y}`;
}

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function hexPoints(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const halfW = width / 2;
  const upperY = height - rowStep;
  const lowerY = rowStep;
  const left = (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  return [
    { x:left + halfW, y:top },
    { x:left + width, y:top + upperY },
    { x:left + width, y:top + lowerY },
    { x:left + halfW, y:top + height },
    { x:left, y:top + lowerY },
    { x:left, y:top + upperY }
  ];
}

function activeScene() {
  const scenes = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true) || [];
  return scenes.find(scene => scene?.sys?.isActive?.() !== false) || scenes[0] || null;
}

function gameState() {
  return typeof window.getV39GameState === "function" ? window.getV39GameState() : null;
}

function activePlayer(state) {
  return state?.players?.find(player => player?.id === state.activePlayerId) || state?.players?.[0] || null;
}

function isTestMode() {
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

function removeLayer(scene, name) {
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === name) child.destroy();
  }
}

function wrappedCoord(value, size) {
  return ((value % size) + size) % size;
}

function neighborEdges(data, x, y) {
  const odd = y % 2 === 1;
  const rows = odd
    ? [
        { dx:0, dy:-1, edge:5 }, { dx:1, dy:-1, edge:0 },
        { dx:1, dy:0, edge:1 }, { dx:1, dy:1, edge:2 },
        { dx:0, dy:1, edge:3 }, { dx:-1, dy:0, edge:4 }
      ]
    : [
        { dx:-1, dy:-1, edge:5 }, { dx:0, dy:-1, edge:0 },
        { dx:1, dy:0, edge:1 }, { dx:0, dy:1, edge:2 },
        { dx:-1, dy:1, edge:3 }, { dx:-1, dy:0, edge:4 }
      ];
  return rows.map(row => {
    let nx = x + row.dx;
    let ny = y + row.dy;
    const outside = nx < 0 || ny < 0 || nx >= data.w || ny >= data.h;
    if (outside && data.worldWrapEnabled) {
      nx = wrappedCoord(nx, data.w);
      ny = wrappedCoord(ny, data.h);
    }
    return { x:nx, y:ny, edge:row.edge, outside:outside && !data.worldWrapEnabled };
  });
}

function addVisionRange(data, sourceX, sourceY, range, output, detectionByTile = null, scoutValue = 0) {
  if (sourceX === null || sourceX === undefined || sourceX === ""
    || sourceY === null || sourceY === undefined || sourceY === "") return;
  const sx = Math.floor(Number(sourceX));
  const sy = Math.floor(Number(sourceY));
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx >= data.w || sy >= data.h) return;
  const maxDistance = Math.max(0, Math.floor(Number(range) || 0));
  const startKey = coordKey(sx, sy);
  const visited = new Set([startKey]);
  const queue = [{ x:sx, y:sy, distance:0 }];
  output.add(startKey);
  if (detectionByTile instanceof Map) {
    const previousScout = Number(detectionByTile.get(startKey));
    detectionByTile.set(startKey, Math.max(
      Number.isFinite(previousScout) ? previousScout : Number.NEGATIVE_INFINITY,
      resolveEffectiveScoutAtDistance(scoutValue, 0)
    ));
  }
  while (queue.length) {
    const current = queue.shift();
    if (current.distance >= maxDistance) continue;
    for (const neighbor of neighborEdges(data, current.x, current.y)) {
      if (neighbor.outside) continue;
      const key = coordKey(neighbor.x, neighbor.y);
      if (visited.has(key)) continue;
      visited.add(key);
      output.add(key);
      const distance = current.distance + 1;
      if (detectionByTile instanceof Map) {
        const previousScout = Number(detectionByTile.get(key));
        detectionByTile.set(key, Math.max(
          Number.isFinite(previousScout) ? previousScout : Number.NEGATIVE_INFINITY,
          resolveEffectiveScoutAtDistance(scoutValue, distance)
        ));
      }
      queue.push({ x:neighbor.x, y:neighbor.y, distance });
    }
  }
}

function unitVisionRange(unit) {
  const scout = resolveDetectionScoutValue(unit);
  return UNIT_VISION_BASE_RANGE + Math.max(0, Math.floor(scout / UNIT_VISION_SCOUT_STEP));
}

function livingUnit(unit) {
  const hp = Number(unit?.currentHp ?? unit?.hp);
  return unit?.state !== "死亡" && unit?.condition !== "死亡" && (!Number.isFinite(hp) || hp > 0);
}

function unitsByTile(units = [], { livingOnly = false } = {}) {
  const groups = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    if (livingOnly && !livingUnit(unit)) continue;
    const x = Math.floor(Number(unit?.x));
    const y = Math.floor(Number(unit?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = coordKey(x, y);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return groups;
}

function buildCurrentVision(data, faction, state, playerId) {
  const visible = new Set();
  const detectionByTile = new Map();
  const settlements = getFactionSettlements(faction);
  for (const settlement of settlements) {
    if (settlement?.placed) addVisionRange(data, settlement.x, settlement.y, BASE_VILLAGE_SCOUT_RANGE, visible, detectionByTile, 0);
  }
  for (const units of unitsByTile(faction?.units, { livingOnly:true }).values()) {
    const sense = resolveDetectionGroupSense(units);
    const lead = units[0];
    const range = units.reduce((max, unit) => Math.max(max, unitVisionRange(unit)), UNIT_VISION_BASE_RANGE);
    addVisionRange(data, lead.x, lead.y, range, visible, detectionByTile, sense.scout);
  }
  const definitions = new Map(facilityDefinitions().map(definition => [definition.name, definition]));
  for (const settlement of settlements) {
    for (const [key, names] of Object.entries(settlement?.tileFacilityMap || {})) {
      if (String(state?.territoryOwnerByTile?.[key] || "") !== String(playerId || "")) continue;
      const scout = (Array.isArray(names) ? names : []).reduce((sum, name) => sum + Math.max(0, Number(definitions.get(String(name))?.effects?.索敵) || 0), 0);
      if (scout <= 0) continue;
      const [x, y] = key.split(",").map(Number);
      addVisionRange(data, x, y, UNIT_VISION_BASE_RANGE + Math.floor(scout / UNIT_VISION_SCOUT_STEP), visible, detectionByTile, scout);
    }
  }
  return { visible, detectionByTile };
}

function detectedEntityIdsForGroups(groups, currentVision, detectionByTile) {
  const detected = new Set();
  for (const [key, units] of groups.entries()) {
    if (!currentVision.has(key)) continue;
    const observerScout = Number(detectionByTile.get(key));
    if (!Number.isFinite(observerScout)) continue;
    if (units.every(unit => !livingUnit(unit))) {
      for (const unit of units) {
        const id = String(unit?.id ?? unit?.unitId ?? unit?.characterId ?? "").trim();
        if (id) detected.add(id);
      }
      continue;
    }
    const targetSense = resolveDetectionGroupSense(units);
    if (observerScout < targetSense.stealth) continue;
    for (const unit of units) {
      const id = String(unit?.id ?? unit?.unitId ?? unit?.characterId ?? "").trim();
      if (id) detected.add(id);
    }
  }
  return detected;
}

function buildDetectedEntityIds(state, playerId, currentVision, detectionByTile) {
  const detected = detectedEntityIdsForGroups(
    unitsByTile(state?.enemies),
    currentVision,
    detectionByTile
  );
  for (const player of Array.isArray(state?.players) ? state.players : []) {
    if (String(player?.id || "") === String(playerId || "")) continue;
    const ids = detectedEntityIdsForGroups(
      unitsByTile(player?.factionState?.units),
      currentVision,
      detectionByTile
    );
    for (const id of ids) detected.add(id);
  }
  return detected;
}

function persistVisibilityTiles(faction, explored, currentVision) {
  const oldKeys = Array.isArray(faction?.visibility?.exploredTileKeys)
    ? faction.visibility.exploredTileKeys.map(String)
    : [];
  const oldVisibleKeys = Array.isArray(faction?.visibility?.visibleTileKeys)
    ? faction.visibility.visibleTileKeys.map(String)
    : [];
  const exploredUnchanged = oldKeys.length === explored.size && oldKeys.every(key => explored.has(key));
  const visibleUnchanged = oldVisibleKeys.length === currentVision.size && oldVisibleKeys.every(key => currentVision.has(key));
  if (exploredUnchanged && visibleUnchanged) return;
  window.updateV39ActiveFactionState?.({
    visibility: {
      ...faction.visibility,
      exploredTileKeys: [...explored].sort(),
      visibleTileKeys: [...currentVision].sort()
    }
  }, { reason:"visibility-updated" });
}

function revealMovementPath(event) {
  const data = window.__v39FieldRuntime?.mapData;
  const path = Array.isArray(event?.detail?.path) ? event.detail.path : [];
  if (!data?.grid || path.length <= 1) {
    scheduleRender();
    return;
  }

  const state = gameState();
  const player = activePlayer(state);
  const faction = player?.factionState;
  const movedUnitId = String(event?.detail?.unitId || "");
  const unit = (Array.isArray(faction?.units) ? faction.units : [])
    .find(row => String(row?.id ?? row?.unitId ?? row?.characterId ?? "") === movedUnitId);
  if (!faction || !unit || !livingUnit(unit)) {
    scheduleRender();
    return;
  }

  const explored = new Set(
    (Array.isArray(faction.visibility?.exploredTileKeys) ? faction.visibility.exploredTileKeys : []).map(String)
  );
  const beforeSize = explored.size;
  const visionRange = unitVisionRange(unit);

  // Normal movement sends every traversed hex in path, so each step contributes its scouting range.
  // Teleport-type movement can keep the jump behavior by sending no intermediate path nodes
  // (or only source/destination), which deliberately leaves the skipped corridor unexplored.
  for (const node of path) addVisionRange(data, node?.x, node?.y, visionRange, explored);

  if (explored.size === beforeSize) {
    scheduleRender();
    return;
  }

  window.updateV39ActiveFactionState?.({
    visibility:{
      ...faction.visibility,
      exploredTileKeys:[...explored].sort()
    }
  }, { reason:"visibility-movement-path" });
}

function resetVisibilityForNewField(event) {
  if (event?.detail?.restored === true) {
    scheduleRender();
    return;
  }
  const state = gameState();
  if (!state?.players?.length) {
    scheduleRender();
    return;
  }
  const emptyVisibility = {
    exploredTileKeys:[],
    visibleTileKeys:[],
    spottedEnemyTileKeys:[],
    spottedFactionTileKeys:[],
    alertedEnemyTileKeys:[],
    alertedFactionTileKeys:[]
  };
  const players = state.players.map(player => ({
    ...player,
    factionState:{ ...player.factionState, visibility:emptyVisibility }
  }));
  window.setV39GameState?.({ players }, { reason:"visibility-new-field" });
  scheduleRender();
}

function drawEdge(graphics, points, edgeIndex, style) {
  const pair = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]][edgeIndex];
  const start = points[pair[0]];
  const end = points[pair[1]];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const dashLength = Math.max(1, Number(style?.dashLength) || 1);
  const gapLength = Math.max(0, Number(style?.gapLength) || 0);
  if (gapLength <= 0 || length <= dashLength) {
    graphics.lineBetween(start.x, start.y, end.x, end.y);
    return;
  }
  for (let offset = 0; offset < length; offset += dashLength + gapLength) {
    const dashEnd = Math.min(length, offset + dashLength);
    graphics.lineBetween(
      start.x + (dx * offset / length),
      start.y + (dy * offset / length),
      start.x + (dx * dashEnd / length),
      start.y + (dy * dashEnd / length)
    );
  }
}

function drawOuterBoundary(graphics, data, tileKeys, style) {
  graphics.lineStyle(style.width, style.color, style.alpha);
  for (const key of tileKeys) {
    const [x, y] = key.split(",").map(Number);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < 0 || y < 0 || x >= data.w || y >= data.h) continue;
    const points = hexPoints(x, y);
    for (const neighbor of neighborEdges(data, x, y)) {
      if (!neighbor.outside && tileKeys.has(coordKey(neighbor.x, neighbor.y))) continue;
      drawEdge(graphics, points, neighbor.edge, style);
    }
  }
}

function drawUnitScoutBoundaries(graphics, data, units) {
  // 同じマス・同じ索敵範囲の部隊員は1本の枠線にまとめる。
  const renderedRanges = new Set();
  for (const unit of Array.isArray(units) ? units : []) {
    if (!livingUnit(unit)) continue;
    const x = Math.floor(Number(unit?.x));
    const y = Math.floor(Number(unit?.y));
    const range = unitVisionRange(unit);
    const identity = `${x},${y},${range}`;
    if (!Number.isInteger(x) || !Number.isInteger(y) || renderedRanges.has(identity)) continue;
    renderedRanges.add(identity);
    const tileKeys = new Set();
    addVisionRange(data, x, y, range, tileKeys);
    drawOuterBoundary(graphics, data, tileKeys, {
      width:SCOUT_WIDTH,
      color:SCOUT_COLOR,
      alpha:SCOUT_ALPHA,
      ...MAP_BOUNDARY_DASH_CONFIG
    });
  }
  return renderedRanges.size;
}

function nestTerritoryTileKeys(data, nest) {
  const result = new Set();
  const radius = Math.max(1, Math.floor(Number(nest?.territoryRadius) || 1));
  addVisionRange(data, nest?.x, nest?.y, radius, result);
  return result;
}

function renderVisibilityLayers() {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const scene = activeScene();
  const state = gameState();
  const player = activePlayer(state);
  const faction = player?.factionState;
  if (!data?.grid || !scene?.add || !faction) return false;

  removeLayer(scene, FOG_LAYER_NAME);
  removeLayer(scene, SCOUT_LAYER_NAME);
  removeLayer(scene, UNIT_SCOUT_LAYER_NAME);
  removeLayer(scene, TERRITORY_LAYER_NAME);
  removeLayer(scene, NEST_TERRITORY_LAYER_NAME);
  removeLayer(scene, NEUTRAL_VILLAGE_TERRITORY_LAYER_NAME);

  const vision = buildCurrentVision(data, faction, state, player.id);
  const currentVision = vision.visible;
  const detectedEntityIds = buildDetectedEntityIds(state, player.id, currentVision, vision.detectionByTile);
  const explored = new Set(
    (Array.isArray(faction.visibility?.exploredTileKeys) ? faction.visibility.exploredTileKeys : []).map(String)
  );
  for (const key of currentVision) explored.add(key);
  lastSnapshot = {
    exploredTileKeys:explored,
    currentVisionTileKeys:currentVision,
    detectedEntityIds,
    detectionByTile:vision.detectionByTile
  };

  const testMode = isTestMode();
  let unexploredCount = Math.max(0, (Number(data.w) * Number(data.h)) - explored.size);

  const unitScout = scene.add.graphics().setDepth(15).setName(UNIT_SCOUT_LAYER_NAME);
  const unitScoutBoundaryCount = drawUnitScoutBoundaries(unitScout, data, faction.units);

  if (!testMode) {
    const fog = scene.add.graphics().setDepth(14).setName(FOG_LAYER_NAME);
    fog.fillStyle(FOG_COLOR, FOG_ALPHA);
    fog.lineStyle(1, 0x6d858d, 0.28);
    unexploredCount = 0;
    for (let y = 0; y < data.h; y += 1) {
      for (let x = 0; x < data.w; x += 1) {
        if (explored.has(coordKey(x, y))) continue;
        const points = hexPoints(x, y);
        fog.fillPoints(points, true);
        const centerX = (points[0].x + points[3].x) / 2;
        const centerY = (points[0].y + points[3].y) / 2;
        fog.beginPath();
        fog.moveTo(centerX - 1.5, centerY);
        fog.lineTo(centerX + 1.5, centerY);
        fog.strokePath();
        unexploredCount += 1;
      }
    }

    const scout = scene.add.graphics().setDepth(15.1).setName(SCOUT_LAYER_NAME);
    drawOuterBoundary(scout, data, currentVision, {
      width:SCOUT_WIDTH,
      color:SCOUT_COLOR,
      alpha:SCOUT_ALPHA,
      ...MAP_BOUNDARY_DASH_CONFIG
    });
  }

  const visibleNests = (Array.isArray(state.enemyNests) ? state.enemyNests : []).filter(nest => {
    const key = coordKey(Math.floor(Number(nest?.x)), Math.floor(Number(nest?.y)));
    return testMode || currentVision.has(key);
  });
  const nestTerritory = scene.add.graphics().setDepth(13).setName(NEST_TERRITORY_LAYER_NAME);
  for (const nest of visibleNests) {
    drawOuterBoundary(nestTerritory, data, nestTerritoryTileKeys(data, nest), {
      width:NEST_TERRITORY_WIDTH,
      color:NEST_TERRITORY_COLOR,
      alpha:NEST_TERRITORY_ALPHA,
      ...MAP_BOUNDARY_DASH_CONFIG
    });
  }

  const visibleVillages = (Array.isArray(state.neutralVillages) ? state.neutralVillages : []).filter(village => {
    const key = coordKey(Math.floor(Number(village?.x)), Math.floor(Number(village?.y)));
    return testMode || explored.has(key);
  });
  const villageTerritory = scene.add.graphics().setDepth(13).setName(NEUTRAL_VILLAGE_TERRITORY_LAYER_NAME);
  for (const village of visibleVillages) {
    const tileKeys = new Set(Array.isArray(village?.territoryTileKeys) && village.territoryTileKeys.length
      ? village.territoryTileKeys.map(String)
      : nestTerritoryTileKeys(data, { ...village, territoryRadius:1 }));
    drawOuterBoundary(villageTerritory, data, tileKeys, {
      width:NEUTRAL_VILLAGE_TERRITORY_WIDTH,
      color:NEUTRAL_VILLAGE_TERRITORY_COLOR,
      alpha:NEUTRAL_VILLAGE_TERRITORY_ALPHA,
      ...MAP_BOUNDARY_DASH_CONFIG
    });
  }

  const ownTerritory = new Set(
    Object.entries(state.territoryOwnerByTile || {})
      .filter(([, ownerId]) => String(ownerId) === String(player.id))
      .map(([key]) => key)
  );
  const playerIndex = Math.max(0, state.players.findIndex(row => row?.id === player.id));
  const territory = scene.add.graphics().setDepth(16).setName(TERRITORY_LAYER_NAME);
  drawOuterBoundary(territory, data, ownTerritory, {
      width:TERRITORY_WIDTH,
      color:FACTION_BORDER_COLOR_PALETTE[playerIndex % FACTION_BORDER_COLOR_PALETTE.length],
      alpha:TERRITORY_ALPHA,
      ...MAP_BOUNDARY_DASH_CONFIG
  });

  window.__v39VisibilityStatus = {
    rendered:true,
    testMode,
    currentVisionCount:currentVision.size,
    detectedEntityCount:detectedEntityIds.size,
    exploredCount:explored.size,
    unexploredCount,
    ownTerritoryCount:ownTerritory.size,
    visibleNestTerritoryCount:visibleNests.length,
    visibleNeutralVillageTerritoryCount:visibleVillages.length,
    unitScoutBoundaryCount,
    scoutRanges:(faction.units || []).filter(livingUnit).map(unit => ({
      id:String(unit.id || ""),
      range:unitVisionRange(unit)
    }))
  };
  persistVisibilityTiles(faction, explored, currentVision);
  return true;
}

function scheduleRender() {
  const requestId = ++renderRequestId;
  let attempt = 0;
  const tryRender = () => {
    if (requestId !== renderRequestId) return;
    if (renderVisibilityLayers()) return;
    attempt += 1;
    if (attempt < RETRY_LIMIT && window.__v39FieldRuntime?.mapData) {
      window.setTimeout(tryRender, RETRY_MS);
    }
  };
  tryRender();
}

window.getV39VisibilitySnapshot = () => ({
  exploredTileKeys:new Set(lastSnapshot.exploredTileKeys),
  currentVisionTileKeys:new Set(lastSnapshot.currentVisionTileKeys),
  detectedEntityIds:new Set(lastSnapshot.detectedEntityIds)
});
window.isV39TileExplored = (x, y) => lastSnapshot.exploredTileKeys.has(coordKey(x, y));
window.isV39TileInCurrentVision = (x, y) => lastSnapshot.currentVisionTileKeys.has(coordKey(x, y));
window.isV39EntityDetected = entityOrId => {
  const id = typeof entityOrId === "object"
    ? String(entityOrId?.id ?? entityOrId?.unitId ?? entityOrId?.characterId ?? "").trim()
    : String(entityOrId ?? "").trim();
  return !!id && lastSnapshot.detectedEntityIds.has(id);
};
window.getV39VisibilityStatus = () => ({ ...(window.__v39VisibilityStatus || {}) });
window.renderV39Visibility = scheduleRender;

window.addEventListener("v39:field-generated", resetVisibilityForNewField);
window.addEventListener("v39:game-state-changed", scheduleRender);
window.addEventListener("v39:initial-placement-complete", scheduleRender);
window.addEventListener("v39:unit-moved", revealMovementPath);
window.addEventListener("v39:display-settings-changed", scheduleRender);

if (window.__v39FieldRuntime?.mapData) scheduleRender();
