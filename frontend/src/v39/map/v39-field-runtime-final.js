import Phaser from "phaser";
import {focusV39MapTile} from './v39-map-focus.js';
import {hegemonyZoneAt} from '../../lib/v39-hegemony-areas.js';
import { visibleV39CaveTerrainLabel } from "../../lib/v39-cave-entrance-rules.js";
import { createTerrainMapData, terrainDefinitions } from "../../lib/map-generator.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { HEX_TILE_CONFIG, V39_FIELD_FOG_STYLE, FIELD_TERRAIN_OVERLAY_STYLE } from "../../lib/phaser-map-panel-config.js";
import { runWithSeededRandom } from "../../lib/seeded-random.js";
import { cacheStaticGraphicsLayer } from "./v39-static-graphics-cache.js";
import { installV39IdleRender } from "./v39-idle-render.js";
import { installV39CoordinateRuler } from "./v39-coordinate-ruler.js";
import { createV39VictoryLandmarkPlan } from "../../lib/v39-victory-landmarks.js";
import {ensureV39ClimateProfile} from '../../lib/v39-weather.js';
import {normalizeV39MapScope,normalizeV39ScopePattern} from '../../lib/v39-map-scope.js';
import {loadV39TerrainPatterns,drawV39TerrainPatterns,terrainHeightBrightness} from './v39-terrain-patterns.js';
import {resolveV39RiverFlowDirections} from '../../lib/v39-river-flow.js';
import {normalizeV39MapPurification} from '../../lib/v39-purification-rules.js';

const DEFAULT_MAX_ZOOM_FACTOR = 10;
const {snow:SNOW_STYLE,river:RIVER_STYLE}=FIELD_TERRAIN_OVERLAY_STYLE;
const terrainColorMap = new Map(
  (Array.isArray(terrainDefinitions) ? terrainDefinitions : []).map(row => [String(row?.key || ""), String(row?.color || "#607078")])
);

let playfield = null;
let referenceMap = null;
let host = null;
let game = null;
let currentData = null;
let currentSettings = null;
let activeFieldInputController = null;
const worldLayers = new Map();
let activeWorldLayerId = 'surface';
let worldLayerSequence = 0;
const mapRenderBatchTokens = new Set();
const mapInputLockTokens = new Set();
let mapRuntimeTokenSequence = 0;

function nextMapRuntimeToken(prefix) {
  mapRuntimeTokenSequence += 1;
  return `${prefix}:${mapRuntimeTokenSequence}`;
}

function beginMapRenderBatch(reason = "batch") {
  const token = nextMapRuntimeToken("render");
  mapRenderBatchTokens.add(token);
  window.dispatchEvent(new CustomEvent("v39:map-render-batch-started", {
    detail:{ token, reason:String(reason || "batch"), depth:mapRenderBatchTokens.size }
  }));
  return token;
}

function endMapRenderBatch(token, options = {}) {
  if (!token || !mapRenderBatchTokens.delete(token)) return false;
  const depth = mapRenderBatchTokens.size;
  if (depth === 0) {
    window.dispatchEvent(new CustomEvent("v39:map-render-batch-ended", {
      detail:{ reason:String(options.reason || "batch-complete"), force:options.force === true }
    }));
  }
  return true;
}

function beginMapInputLock(reason = "lock") {
  const token = nextMapRuntimeToken("input");
  mapInputLockTokens.add(token);
  window.dispatchEvent(new CustomEvent("v39:map-input-lock-changed", {
    detail:{ locked:true, reason:String(reason || "lock"), depth:mapInputLockTokens.size }
  }));
  return token;
}

function endMapInputLock(token, reason = "unlock") {
  if (!token || !mapInputLockTokens.delete(token)) return false;
  window.dispatchEvent(new CustomEvent("v39:map-input-lock-changed", {
    detail:{ locked:mapInputLockTokens.size > 0, reason:String(reason || "unlock"), depth:mapInputLockTokens.size }
  }));
  return true;
}

function waitForMapRenderSettled() {
  return new Promise(resolve => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    }, 0);
  });
}

function ensureBooleanGrid(data, key) {
  if (!data || !Number.isFinite(Number(data.w)) || !Number.isFinite(Number(data.h))) return;
  const w = Math.max(0, Math.floor(Number(data.w)));
  const h = Math.max(0, Math.floor(Number(data.h)));
  const source = Array.isArray(data[key]) ? data[key] : [];
  data[key] = Array.from({ length:h }, (_, y) => (
    Array.from({ length:w }, (_, x) => source?.[y]?.[x] === true)
  ));
}

function ensureSnowStateMaps(data) {
  normalizeV39MapPurification(data);
  ensureBooleanGrid(data, "snowCoverMap");
  ensureBooleanGrid(data, "snowfallMap");
  return data;
}

function tileMetrics() {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return { width, height, rowStep, oddRowOffsetX };
}

function worldSize(data = currentData) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const w = Math.max(1, Number(data?.w) || 1);
  const h = Math.max(1, Number(data?.h) || 1);
  return {
    width: (w * width) + oddRowOffsetX + 2,
    height: ((h - 1) * rowStep) + height + 2
  };
}

function hexPoints(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  const halfW = width / 2;
  const upperY = height - rowStep;
  const lowerY = rowStep;
  const left = (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0);
  const top = y * rowStep;
  return [
    left + halfW, top,
    left + width, top + upperY,
    left + width, top + lowerY,
    left + halfW, top + height,
    left, top + lowerY,
    left, top + upperY
  ];
}

function tileCenter(x, y) {
  const { width, height, rowStep, oddRowOffsetX } = tileMetrics();
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function colorNumber(hex) {
  try {
    return Phaser.Display.Color.HexStringToColor(String(hex || "#607078")).color;
  } catch {
    return 0x607078;
  }
}

function shadeColorByHeight(hex, level) {
  if (!hex?.startsWith?.("#") || !Number.isFinite(level)) return hex;
  const brightness = terrainHeightBrightness(level);
  const raw = Number.parseInt(hex.slice(1), 16);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function shadeSeaColorByDepth(hex, level) {
  if (!hex?.startsWith?.("#") || !Number.isFinite(level)) return hex;
  const raw = Number.parseInt(hex.slice(1), 16);
  const brightness = 1 - Math.min(0.62, Math.max(0, -Math.floor(level)) * 0.09);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function readDisplaySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("v39-display-settings-v1") || "null") || {};
    return {
      heightOutlineOnly: saved.heightOutlineOnly !== false,
      heightShading: saved.heightShading !== false,
      maxZoomFactor: Phaser.Math.Clamp(Number(saved.maxZoomFactor) || DEFAULT_MAX_ZOOM_FACTOR, 6, 16)
    };
  } catch {
    return { heightOutlineOnly: true, heightShading: true, maxZoomFactor: DEFAULT_MAX_ZOOM_FACTOR };
  }
}

function drawTerrain(scene, data, graphics = scene.add.graphics()) {
  const display = readDisplaySettings();
  graphics.setName("v39-terrain-layer");
  graphics.clear();
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = String(data.grid?.[y]?.[x] || "海");
      const appearance=hegemonyZoneAt(data,x,y);
      const base = appearance?.visualColor || (data.isUnderground ? (terrain==="岩壁"?"#26353b":"#929079") : terrainColorMap.get(terrain) || "#607078");
      const level = Number(data.heightLevelMap?.[y]?.[x]);
      const color = display.heightShading
        ? (terrain === "海" ? shadeSeaColorByDepth(base, level) : shadeColorByHeight(base, level))
        : base;
      const p = hexPoints(x, y);
      graphics.fillStyle(colorNumber(color), 1);
      graphics.fillPoints([
        { x:p[0], y:p[1] }, { x:p[2], y:p[3] }, { x:p[4], y:p[5] },
        { x:p[6], y:p[7] }, { x:p[8], y:p[9] }, { x:p[10], y:p[11] }
      ], true);
      if (!display.heightOutlineOnly) {
        graphics.lineStyle(1, 0x26353b, 0.95);
        graphics.strokePoints([
          { x:p[0], y:p[1] }, { x:p[2], y:p[3] }, { x:p[4], y:p[5] },
          { x:p[6], y:p[7] }, { x:p[8], y:p[9] }, { x:p[10], y:p[11] }
        ], true);
      }
    }
  }
  cacheStaticGraphicsLayer(scene, data, graphics, {
    name:"v39-terrain-layer",
    depth:0
  });
  drawV39TerrainPatterns(scene, data, display);
  return graphics;
}

function parsePoint(raw) {
  const [x, y] = String(raw || "").split(",").map(Number);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
function parseEdge(raw) {
  const [a, b] = String(raw || "").split("|");
  const pa = parsePoint(a); const pb = parsePoint(b);
  return pa && pb ? { a:pa, b:pb } : null;
}
function insetHexPoints(points, center, ratio) {
  const safeRatio = Math.max(0, Math.min(0.49, Number(ratio) || 0));
  const out = [];
  for (let i = 0; i < points.length; i += 2) {
    out.push(
      points[i] + (center.x - points[i]) * safeRatio,
      points[i + 1] + (center.y - points[i + 1]) * safeRatio
    );
  }
  return out;
}

function drawSnowCover(scene, data, graphics = scene.add.graphics().setDepth(1)) {
  graphics.setName("v39-snow-cover-layer");
  graphics.clear();
  for (let y = 0; y < Number(data?.h || 0); y += 1) {
    for (let x = 0; x < Number(data?.w || 0); x += 1) {
      if (data?.snowCoverMap?.[y]?.[x] !== true) continue;
      const points = hexPoints(x, y);
      const center = tileCenter(x, y);
      const outer = insetHexPoints(points, center, SNOW_STYLE.outerInset);
      const inner = insetHexPoints(points, center, SNOW_STYLE.innerInset);
      graphics.fillStyle(SNOW_STYLE.color, SNOW_STYLE.alpha);
      for (let side = 0; side < 6; side += 1) {
        const next = (side + 1) % 6;
        graphics.fillPoints([
          { x:outer[side * 2], y:outer[side * 2 + 1] },
          { x:outer[next * 2], y:outer[next * 2 + 1] },
          { x:inner[next * 2], y:inner[next * 2 + 1] },
          { x:inner[side * 2], y:inner[side * 2 + 1] }
        ], true);
      }
    }
  }
  return graphics;
}

function drawSnowfall(scene, data) {
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === "v39-snowfall-item") child.destroy();
  }
  const { width, height } = tileMetrics();
  for (let y = 0; y < Number(data?.h || 0); y += 1) {
    for (let x = 0; x < Number(data?.w || 0); x += 1) {
      if (data?.snowfallMap?.[y]?.[x] !== true) continue;
      const center = tileCenter(x, y);
      scene.add.text(
        center.x + width * 0.22,
        center.y - height * 0.20,
        "❄",
        { fontSize:"14px", fontStyle:"bold", color:"#f7fbff", stroke:"#38536a", strokeThickness:2 }
      ).setOrigin(0.5).setDepth(5).setName("v39-snowfall-item");
    }
  }
}

function drawRivers(scene, riverData, g = scene.add.graphics().setDepth(3).setName("v39-river-layer")) {
  const edges = new Set([
    ...(riverData?.cornerEdgeSet instanceof Set ? riverData.cornerEdgeSet : []),
    ...(riverData?.cornerWaterLinkSet instanceof Set ? riverData.cornerWaterLinkSet : [])
  ]);
  const falls = riverData?.cornerWaterfallEdgeSet instanceof Set ? riverData.cornerWaterfallEdgeSet : new Set();
  const signature=JSON.stringify([[...edges].sort(),[...(riverData?.cornerWaterLinkSet||[])].sort(),[...falls].sort()]);
  if(g.getData('signature')===signature)return g;
  g.clear().setData('signature',signature);
  const segments=[...edges].map(parseEdge).filter(Boolean),width=tileMetrics().width*RIVER_STYLE.widthRatio;
  const points=new Map();
  for(const edge of segments)for(const point of [edge.a,edge.b])points.set(`${point.x},${point.y}`,point);
  // Draw every bank first so connected segments never cut across another segment's water.
  for(const [size,color] of [[width+RIVER_STYLE.bankWidth*2,RIVER_STYLE.bankColor],[width,RIVER_STYLE.waterColor]]){
    g.lineStyle(size,color,RIVER_STYLE.alpha);g.fillStyle(color,RIVER_STYLE.alpha);
    for(const edge of segments)g.lineBetween(edge.a.x,edge.a.y,edge.b.x,edge.b.y);
    for(const point of points.values())g.fillCircle(point.x,point.y,size/2);
  }
  g.lineStyle(width*RIVER_STYLE.waterfallWidthRatio, RIVER_STYLE.waterfallColor, 1);
  for (const raw of falls) {
    const e = parseEdge(raw); if (!e) continue;
    g.lineBetween(e.a.x, e.a.y, e.b.x, e.b.y);
    g.fillStyle(0xffffff, 0.95); g.fillCircle((e.a.x + e.b.x)/2, (e.a.y + e.b.y)/2, 3);
  }
  const directions=resolveV39RiverFlowDirections(riverData);
  g.fillStyle(RIVER_STYLE.arrowColor,RIVER_STYLE.arrowAlpha);
  for(const direction of directions){
    const a=parsePoint(direction.from),b=parsePoint(direction.to);if(!a||!b)continue;
    const length=Math.hypot(b.x-a.x,b.y-a.y);if(!length)continue;
    const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const size=width*RIVER_STYLE.arrowLengthRatio,half=width*RIVER_STYLE.arrowWidthRatio/2;
    g.fillTriangle(mx+ux*size/2,my+uy*size/2,mx-ux*size/2-uy*half,my-uy*size/2+ux*half,mx-ux*size/2+uy*half,my-uy*size/2-ux*half);
  }
  g.setData('river',{segments:segments.length,width,bankWidth:RIVER_STYLE.bankWidth,arrows:directions.length});
  return g;
}

function drawSpecialTerrain(scene, data) {
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === "v39-special-terrain-item") child.destroy();
  }
  const labels = {
    "沼地":"沼",
    "湿地":"湿",
    "薬草の群生地":"草",
    "峡谷":"峡"
  };
  for (let y = 0; y < data.h; y += 1) for (let x = 0; x < data.w; x += 1) {
    const label = labels[String(data.specialMap?.[y]?.[x] || "")];
    if (!label) continue;
    const center = tileCenter(x, y);
    scene.add.text(center.x, center.y, label, { fontSize:"11px", fontStyle:"bold", color:"#f6f0d2", stroke:"#071014", strokeThickness:3 })
      .setOrigin(0.5).setDepth(4).setName("v39-special-terrain-item");
  }
}

function drawLava(scene, data, graphics = scene.add.graphics().setDepth(6)) {
  graphics.setName("v39-lava-layer");
  graphics.clear();
  const nodes = Array.isArray(data?.lavaFlowData?.nodeKeys) ? data.lavaFlowData.nodeKeys : [];
  const edges = Array.isArray(data?.lavaFlowData?.edgeKeys) ? data.lavaFlowData.edgeKeys : [];
  graphics.lineStyle(7, 0x7b210d, 0.86);
  for (const edgeKey of edges) {
    const edge = parseEdge(edgeKey);
    if (!edge) continue;
    const a = tileCenter(edge.a.x, edge.a.y);
    const b = tileCenter(edge.b.x, edge.b.y);
    graphics.lineBetween(a.x, a.y, b.x, b.y);
  }
  graphics.lineStyle(4, 0xf06b2a, 0.96);
  for (const edgeKey of edges) {
    const edge = parseEdge(edgeKey);
    if (!edge) continue;
    const a = tileCenter(edge.a.x, edge.a.y);
    const b = tileCenter(edge.b.x, edge.b.y);
    graphics.lineBetween(a.x, a.y, b.x, b.y);
  }
  for (const key of nodes) {
    const point = parsePoint(key);
    if (!point) continue;
    const center = tileCenter(point.x, point.y);
    graphics.fillStyle(0xff9a47, 0.98).fillCircle(center.x, center.y, 4);
    graphics.fillStyle(0xd83d17, 0.96).fillCircle(center.x, center.y, 2.3);
  }
  return graphics;
}

function fitCamera(scene) {
  const camera = scene.cameras.main;
  const size = worldSize();
  const fit = Math.max(0.05, Math.min(camera.width / size.width, camera.height / size.height) * 0.97);
  camera.removeBounds();
  camera.setZoom(fit);
  camera.centerOn(size.width / 2, size.height / 2);
  scene.v39FitZoom = fit;
  scene.v39RequestedZoom = fit;
}

function clampCamera(scene) {
  const camera = scene.cameras.main;
  camera.preRender();
  const size = worldSize();
  const a = camera.getWorldPoint(0, 0);
  const b = camera.getWorldPoint(camera.width, camera.height);
  const vw = b.x - a.x, vh = b.y - a.y;
  if (vw < size.width) {
    if (a.x < 0) camera.scrollX += -a.x;
    else if (b.x > size.width) camera.scrollX += size.width - b.x;
  }
  if (vh < size.height) {
    if (a.y < 0) camera.scrollY += -a.y;
    else if (b.y > size.height) camera.scrollY += size.height - b.y;
  }
}

function resolveTileAtWorld(data, wx, wy) {
  const { width, rowStep, oddRowOffsetX } = tileMetrics();
  const row = Math.floor(wy / rowStep);
  for (let y = row - 1; y <= row + 1; y += 1) {
    if (y < 0 || y >= data.h) continue;
    const col = Math.floor((wx - (y % 2 ? oddRowOffsetX : 0)) / width);
    for (let x = col - 1; x <= col + 1; x += 1) {
      if (x < 0 || x >= data.w) continue;
      const p = hexPoints(x, y);
      let inside = false;
      for (let i = 0, j = 10; i < 12; j = i, i += 2) {
        const xi=p[i], yi=p[i+1], xj=p[j], yj=p[j+1];
        if (((yi > wy) !== (yj > wy)) && wx < ((xj-xi)*(wy-yi))/((yj-yi)||Number.EPSILON)+xi) inside = !inside;
      }
      if (inside) return { x, y };
    }
  }
  return null;
}

function disposeFieldInput() {
  if (activeFieldInputController) {
    activeFieldInputController.abort();
    activeFieldInputController = null;
  }
  document.getElementById("v39-map-camera-controls")?.remove();
}

function installInput(scene, data) {
  disposeFieldInput();
  const camera = scene.cameras.main;
  const inputController = new AbortController();
  const disposeRuler = installV39CoordinateRuler(scene, host, data);
  activeFieldInputController = inputController;
  const inputSignal = inputController.signal;
  const pointers = new Map();
  const selection = scene.add.graphics().setDepth(20);
  const placementArea = scene.add.graphics().setDepth(19);
  const placementMask = scene.make.graphics({ x:0, y:0, add:false });
  const placementShade = scene.add.graphics().setDepth(18.9).setName("v39-initial-placement-shade").setVisible(false);
  const outsideMask = placementMask.createGeometryMask();
  outsideMask.setInvertAlpha(true);
  placementShade.setMask(outsideMask);
  let dragged = false;
  let lastTouchTap = null;

  const clientPoint = (cx, cy) => {
    const rect = host.getBoundingClientRect();
    return { x:(cx-rect.left)*(camera.width/rect.width), y:(cy-rect.top)*(camera.height/rect.height) };
  };
  const zoomAt = (cx, cy, factor) => {
    if (window.isV39MapInputLocked?.() === true) return;
    const p = clientPoint(cx, cy);
    const before = camera.getWorldPoint(p.x, p.y);
    const display = readDisplaySettings();
    const min = Number(scene.v39FitZoom) || camera.zoom;
    const current = Number(scene.v39RequestedZoom) || camera.zoom;
    scene.v39RequestedZoom = Phaser.Math.Clamp(current * factor, min, min * display.maxZoomFactor);
    camera.setZoom(scene.v39RequestedZoom); camera.preRender();
    const after = camera.getWorldPoint(p.x, p.y);
    camera.scrollX += before.x - after.x; camera.scrollY += before.y - after.y;
    clampCamera(scene);
  };
  const selectTile = (tile, focus = false) => {
    if (window.isV39MapInputLocked?.() === true) return;
    if (!Number.isInteger(tile?.x) || !Number.isInteger(tile?.y) || !data.grid?.[tile.y]?.[tile.x]) return;
    const selected = {
      x:tile.x, y:tile.y,
      terrain:String(data.grid?.[tile.y]?.[tile.x] || "海"),
      height:Number(data.heightLevelMap?.[tile.y]?.[tile.x]) || 0,
      special:String(data.specialMap?.[tile.y]?.[tile.x] || "")
    };
    if (window.getV39ActiveFactionState?.()?.villagePlacementMode
      && window.canPlaceV39InitialBase?.(selected) === false) return null;
    const hp = hexPoints(tile.x, tile.y);
    if (focus) {
      focusV39MapTile(tile);
    }
    selection.clear().lineStyle(4, 0xffdd72, 1).strokePoints([
      {x:hp[0],y:hp[1]},{x:hp[2],y:hp[3]},{x:hp[4],y:hp[5]},
      {x:hp[6],y:hp[7]},{x:hp[8],y:hp[9]},{x:hp[10],y:hp[11]}
    ], true);
    scene.v39SelectedTile = selected;
    const landTerrain = document.getElementById("landTerrain"); if (landTerrain) landTerrain.textContent = visibleV39CaveTerrainLabel(window.getV39ActiveFactionState?.(),data,selected.x,selected.y);
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:selected }));
    return selected;
  };
  const selectAt = (cx, cy) => {
    const p = clientPoint(cx, cy); const w = camera.getWorldPoint(p.x, p.y);
    const tile = resolveTileAtWorld(data, w.x, w.y);
    return tile ? selectTile(tile) : null;
  };
  const showPlacementTiles = (tiles, active = tiles.length > 0) => {
    placementArea.clear();
    placementMask.clear().fillStyle(0xffffff, 1);
    placementShade.clear().setVisible(active);
    placementShade.setData("allowedTileCount", tiles.length);
    if (active) {
      const size = worldSize(data);
      placementShade.fillStyle(V39_FIELD_FOG_STYLE.color, V39_FIELD_FOG_STYLE.alpha)
        .fillRect(0, 0, size.width, size.height);
    }
    placementArea.fillStyle(0x72cbd6, 0.18).lineStyle(2, 0x72cbd6, 0.75);
    for (const tile of tiles) {
      const points = hexPoints(tile.x, tile.y);
      const polygon = Array.from({ length:6 }, (_, i) => ({ x:points[i * 2], y:points[i * 2 + 1] }));
      placementArea.fillPoints(polygon, true).strokePoints(polygon, true);
      placementMask.fillPoints(polygon, true);
    }
  };
  scene.v39Input = { selectTile, selectTileAt:selectAt, zoomAt, showPlacementTiles };
  // create中はまだアクティブシーン一覧へ載らないため、最初の更新後に配置範囲を描画する。
  const inputReady = () => {
    window.dispatchEvent(new CustomEvent("v39:field-input-ready"));
  };
  scene.events.once(Phaser.Scenes.Events.POST_UPDATE, inputReady);

  host.addEventListener("wheel", e => { e.preventDefault(); if(!e.v39ZoomHandled)zoomAt(e.clientX,e.clientY,e.deltaY<0?1.16:1/1.16); }, { passive:false, signal:inputSignal });
  host.addEventListener("pointerdown", e => {
    if (window.isV39MapInputLocked?.() === true) return;
    if (e.pointerType==="mouse" && e.button!==0) return;
    pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    try { host.setPointerCapture?.(e.pointerId); } catch { /* Synthetic/cancelled pointers have no active capture. */ }
    dragged=false;
  }, { signal:inputSignal });
  host.addEventListener("pointermove", e => {
    if (window.isV39MapInputLocked?.() === true) return;
    const prev=pointers.get(e.pointerId); if(!prev)return;
    const old=[...pointers.values()]; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); const next=[...pointers.values()];
    if(next.length>=2){ const od=Math.hypot(old[0].x-old[1].x,old[0].y-old[1].y), nd=Math.hypot(next[0].x-next[1].x,next[0].y-next[1].y); if(od>0&&nd>0){if(!e.v39ZoomHandled)zoomAt((next[0].x+next[1].x)/2,(next[0].y+next[1].y)/2,nd/od);dragged=true;} return; }
    const dx=e.clientX-prev.x,dy=e.clientY-prev.y; if(Math.abs(dx)+Math.abs(dy)<1)return;
    camera.scrollX-=dx/camera.zoom; camera.scrollY-=dy/camera.zoom; clampCamera(scene); dragged=true;
  }, { signal:inputSignal });
  const finish=e=>{ const touch=e.pointerType!=="mouse", select=!dragged&&pointers.size===1; pointers.delete(e.pointerId); try { if(host.hasPointerCapture?.(e.pointerId))host.releasePointerCapture(e.pointerId); } catch { /* Pointer may already be cancelled. */ } if(select)selectAt(e.clientX,e.clientY); if(touch&&!dragged&&!pointers.size){const now=performance.now();if(lastTouchTap&&now-lastTouchTap.time<320&&Math.hypot(e.clientX-lastTouchTap.x,e.clientY-lastTouchTap.y)<28){zoomAt(e.clientX,e.clientY,1.5);lastTouchTap=null;}else lastTouchTap={time:now,x:e.clientX,y:e.clientY};} if(!pointers.size)dragged=false;};
  host.addEventListener("pointerup",finish,{ signal:inputSignal }); host.addEventListener("pointercancel",finish,{ signal:inputSignal });
  host.addEventListener("dblclick",e=>{e.preventDefault();if(!e.v39ZoomHandled)zoomAt(e.clientX,e.clientY,1.5);},{ signal:inputSignal });
  const handleKeyboard = e => {
    if (window.isV39MapInputLocked?.() === true) return;
    const target = e.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return;
    const rect = host.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (["+", "="].includes(e.key)) zoomAt(centerX, centerY, 1.16);
    else if (["-", "_"].includes(e.key)) zoomAt(centerX, centerY, 1 / 1.16);
    else if (e.key === "Enter") selectAt(centerX, centerY);
    else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
      const step = 60 / camera.zoom;
      if (e.key === "ArrowLeft") camera.scrollX -= step;
      if (e.key === "ArrowRight") camera.scrollX += step;
      if (e.key === "ArrowUp") camera.scrollY -= step;
      if (e.key === "ArrowDown") camera.scrollY += step;
      clampCamera(scene);
    } else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", handleKeyboard, { signal:inputSignal });
  const shutdownInput = () => inputController.abort();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, shutdownInput);
  inputSignal.addEventListener('abort', () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, shutdownInput);
    scene.events.off(Phaser.Scenes.Events.POST_UPDATE, inputReady);
    disposeRuler?.();
    placementShade.clearMask(true);
    placementMask.destroy();
    for (const item of [selection,placementArea,placementShade]) item.destroy();
    if (activeFieldInputController === inputController) activeFieldInputController = null;
    pointers.clear();
  }, {once:true});

  document.getElementById("v39-map-camera-controls")?.remove();
  const controls=document.createElement("div"); controls.id="v39-map-camera-controls";
  controls.innerHTML='<button type="button" data-map-zoom="in" aria-label="地図を拡大">＋</button><button type="button" data-map-zoom="out" aria-label="地図を縮小">−</button>';
  Object.assign(controls.style,{position:"absolute",left:"6px",bottom:"6px",zIndex:"24",display:"grid",gap:"4px"});
  controls.querySelectorAll("button").forEach(b=>Object.assign(b.style,{width:"38px",height:"38px",border:"1px solid #597078",borderRadius:"7px",background:"rgba(13,27,32,.94)",color:"#e8efec",fontSize:"23px"}));
  const centerZoom=f=>{const r=host.getBoundingClientRect();zoomAt(r.left+r.width/2,r.top+r.height/2,f);};
  controls.querySelector('[data-map-zoom="in"]')?.addEventListener("click",event=>{if(!event.v39ZoomHandled)centerZoom(1.3);});
  controls.querySelector('[data-map-zoom="out"]')?.addEventListener("click",event=>{if(!event.v39ZoomHandled)centerZoom(1/1.3);});
  playfield.appendChild(controls);
}

function terrainLayerSignature(data) {
  const display=readDisplaySettings();
  return JSON.stringify([data.w,data.h,data.isUnderground,data.grid,data.heightLevelMap,
    data.specialMap,data.snowCoverMap,data.snowfallMap,data.riverData,data.lavaFlowData,
    data.hegemonyAreaId,data.hegemonyZoneKeys,display.heightShading,display.heightOutlineOnly]);
}

function refreshWorldTerrain(entry) {
  const scene=entry.scene,data=entry.data,signature=terrainLayerSignature(data);
  if (!scene || entry.signature===signature) return;
  scene.v39TerrainGraphics=drawTerrain(scene,data,scene.v39TerrainGraphics);
  scene.v39SnowCoverGraphics=drawSnowCover(scene,data,scene.v39SnowCoverGraphics);
  scene.v39RiverGraphics=drawRivers(scene,data.riverData,scene.v39RiverGraphics);
  drawSpecialTerrain(scene,data);drawSnowfall(scene,data);
  scene.v39LavaGraphics=drawLava(scene,data,scene.v39LavaGraphics);
  entry.signature=signature;
  entry.terrainBuilds=(entry.terrainBuilds||0)+1;
}

function resizeWorldCamera(scene,data) {
  const oldZoom=Number(scene.v39RequestedZoom)||scene.cameras.main.zoom,size=worldSize(data);
  const fit=Math.max(.05,Math.min(scene.cameras.main.width/size.width,scene.cameras.main.height/size.height)*.97);
  scene.v39FitZoom=fit;
  scene.v39RequestedZoom=Phaser.Math.Clamp(oldZoom,fit,fit*readDisplaySettings().maxZoomFactor);
  scene.cameras.main.setZoom(scene.v39RequestedZoom);clampCamera(scene);
}

function restoreWorldCamera(entry) {
  if(!entry.camera)return;
  const scene=entry.scene,fit=scene.v39FitZoom;
  const zoom=Phaser.Math.Clamp(entry.camera.zoom,fit,fit*readDisplaySettings().maxZoomFactor);
  scene.cameras.main.setZoom(zoom).setScroll(entry.camera.scrollX,entry.camera.scrollY);
  scene.v39RequestedZoom=zoom;clampCamera(scene);
}

function worldSceneConfig(entry) {
  return {key:entry.key,create(){
    entry.scene=this;
    this.v39WorldId=entry.id;
    refreshWorldTerrain(entry);
    loadV39TerrainPatterns(this,()=>entry.data,readDisplaySettings);
    if(entry.id===activeWorldLayerId){fitCamera(this);restoreWorldCamera(entry);installInput(this,entry.data);}
    const redraw=event=>{
      const keys=event.detail?.changedKeys;
      if(keys&&!keys.some(key=>key==='heightOutlineOnly'||key==='heightShading'))return;
      entry.signature=null;
      if(this.sys.isActive())refreshWorldTerrain(entry);
    };
    const resize=()=>{if(this.sys.isActive())resizeWorldCamera(this,entry.data);};
    window.addEventListener('v39:display-settings-changed',redraw);
    this.scale.on('resize',resize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN,()=>{
      window.removeEventListener('v39:display-settings-changed',redraw);
      this.scale.off('resize',resize);
    });
    this.events.once(Phaser.Scenes.Events.CREATE,()=>{
      if(worldLayers.get(entry.id)!==entry){this.scene.stop();this.scene.remove();}
      else if(entry.id!==activeWorldLayerId)this.scene.sleep();
    });
  }};
}

function newWorldLayer(id,data) {
  const entry={id,key:`v39-world-${++worldLayerSequence}`,data,scene:null,signature:null,terrainBuilds:0};
  worldLayers.set(id,entry);
  return entry;
}

function createGame(data,worldId='surface') {
  worldLayers.clear();activeWorldLayerId=worldId;
  const entry=newWorldLayer(worldId,data);
  game=new Phaser.Game({
    type:Phaser.AUTO,parent:host,transparent:false,backgroundColor:'#081115',
    callbacks:{postBoot:installV39IdleRender},
    scale:{mode:Phaser.Scale.RESIZE,width:Math.max(1,host.clientWidth),height:Math.max(1,host.clientHeight)},
    scene:worldSceneConfig(entry)
  });
  return game;
}

function pruneWorldLayers() {
  if(!game)return;
  const state=window.getV39EnemyTurnState?.();
  const units=state?.players?.find(player=>player.id===state.activePlayerId)?.factionState?.units||[];
  const occupied=new Set(units.filter(unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡'
    &&Number(unit.x)>=0&&Number(unit.y)>=0).map(unit=>unit.worldId||'surface'));
  for(const [id,entry] of worldLayers){
    if(id===activeWorldLayerId||occupied.has(id))continue;
    game.scene.stop(entry.key);game.scene.remove(entry.key);worldLayers.delete(id);
  }
}

function activateWorldLayer(mapData,worldId,camera) {
  const previous=worldLayers.get(activeWorldLayerId);
  if(previous?.scene){
    const camera=previous.scene.cameras.main;
    previous.camera={zoom:camera.zoom,scrollX:camera.scrollX,scrollY:camera.scrollY};
    game.scene.sleep(previous.key);
  }
  disposeFieldInput();
  activeWorldLayerId=worldId;
  let entry=worldLayers.get(worldId);
  if(!entry){
    entry=newWorldLayer(worldId,mapData);entry.camera=camera;currentData=entry.data;
    if(window.__v39FieldRuntime)window.__v39FieldRuntime.mapData=currentData;
    game.scene.add(entry.key,worldSceneConfig(entry),true);
  }else{
    if(entry.data!==mapData){for(const key of Object.keys(entry.data))delete entry.data[key];Object.assign(entry.data,mapData);}
    currentData=entry.data;
    if(window.__v39FieldRuntime)window.__v39FieldRuntime.mapData=currentData;
    game.scene.wake(entry.key);
    if(camera)entry.camera=camera;
    if(entry.scene){
      refreshWorldTerrain(entry);
      resizeWorldCamera(entry.scene,entry.data);
      restoreWorldCamera(entry);
      installInput(entry.scene,entry.data);
    }
  }
  pruneWorldLayers();
  game.v39InvalidateRender?.();
}

export function updateV39FieldData(nextData, options = {}) {
  if (!currentData || !nextData || typeof nextData !== "object") return false;
  ensureSnowStateMaps(nextData);
  if(currentData!==nextData){
    for (const key of Object.keys(currentData)) delete currentData[key];
    Object.assign(currentData, nextData);
  }
  if (window.__v39FieldRuntime) window.__v39FieldRuntime.mapData = currentData;
  const scene = game?.scene?.getScenes?.(true)?.[0];
  if (scene) {
    refreshWorldTerrain(worldLayers.get(activeWorldLayerId));
    const selected = scene.v39SelectedTile;
    if (selected && Number.isFinite(Number(selected.x)) && Number.isFinite(Number(selected.y))) {
      const x = Math.floor(Number(selected.x));
      const y = Math.floor(Number(selected.y));
      scene.v39SelectedTile = {
        ...selected,
        terrain:String(currentData.grid?.[y]?.[x] || "海"),
        height:Number(currentData.heightLevelMap?.[y]?.[x]) || 0,
        special:String(currentData.specialMap?.[y]?.[x] || "")
      };
      const landTerrain = document.getElementById("landTerrain");
      if (landTerrain) landTerrain.textContent = visibleV39CaveTerrainLabel(window.getV39ActiveFactionState?.(),currentData,x,y);
    }
  }
  if (options.silent !== true) {
    window.dispatchEvent(new CustomEvent("v39:field-data-updated", { detail:{ mapData:currentData, reason:options.reason || "update" } }));
  }
  return true;
}

function setBooleanOverlayAt(mapKey, xRaw, yRaw, enabled, reason) {
  if (!currentData) return false;
  const x = Math.floor(Number(xRaw));
  const y = Math.floor(Number(yRaw));
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= Number(currentData.w) || y >= Number(currentData.h)) {
    return false;
  }
  const nextData = {
    ...currentData,
    [mapKey]:currentData[mapKey].map(row => [...row])
  };
  nextData[mapKey][y][x] = enabled === true;
  return updateV39FieldData(nextData, { reason });
}

export function setV39SnowCoverAt(x, y, covered = true) {
  return setBooleanOverlayAt("snowCoverMap", x, y, covered, "snow-cover");
}

export function setV39SnowfallAt(x, y, active = true) {
  return setBooleanOverlayAt("snowfallMap", x, y, active, "snowfall");
}

function normalizeSettings(input={}) {
  const w=Phaser.Math.Clamp(Math.round(Number(input.w)||60),30,100);
  const h=Phaser.Math.Clamp(Math.round(Number(input.h)||60),30,100);
  const allowedPatterns=new Set(["realistic","balanced","continent","archipelago","twins","chain"]);
  const allowedMountains=new Set(["random","single","multi","mixed"]);
  const custom=input.islandCustomSettings&&typeof input.islandCustomSettings==="object"?input.islandCustomSettings:{};
  const scope=normalizeV39MapScope(input);
  const min=Math.min(Number(custom.isletCountMin)||1,Number(custom.isletCountMax)||4),max=Math.max(Number(custom.isletCountMin)||1,Number(custom.isletCountMax)||4);
  return {
    w,h,
    ...scope,
    patternId:normalizeV39ScopePattern(allowedPatterns.has(input.patternId)?input.patternId:"realistic",scope.mapScope),
    mountainMode:allowedMountains.has(input.mountainMode)?input.mountainMode:"random",
    neutralVillageCount:Phaser.Math.Clamp(
      Math.round(Number(input.neutralVillageCount ?? V39_NEUTRAL_VILLAGE_BALANCE.initialVillageCount)),
      0,
      V39_NEUTRAL_VILLAGE_BALANCE.maxInitialVillageCount
    ),
    islandCustomSettings:{
      enabled:scope.mapScope==='island'?false:!!custom.enabled,
      largeIslandCount:scope.mapScope==='island'?1:Phaser.Math.Clamp(Math.round(Number(custom.largeIslandCount)||2),1,8),
      isletCountMin:scope.mapScope==='island'?0:Phaser.Math.Clamp(Math.round(min),0,12),
      isletCountMax:scope.mapScope==='island'?0:Phaser.Math.Clamp(Math.round(max),0,12),
      riverPerContinentMin:Phaser.Math.Clamp(Math.round(Math.min(Number(custom.riverPerContinentMin)||3,Number(custom.riverPerContinentMax)||4)),1,12),
      riverPerContinentMax:Phaser.Math.Clamp(Math.round(Math.max(Number(custom.riverPerContinentMin)||3,Number(custom.riverPerContinentMax)||4)),1,12),
      targetLandRatio:Phaser.Math.Clamp(Number(custom.targetLandRatio)||0.5,0.25,0.60),
      largeIslandMinGap:Phaser.Math.Clamp(Math.round(Number(custom.largeIslandMinGap)||6),2,12),
      worldWrapEnabled:scope.mapScope==='island'?false:custom.worldWrapEnabled!==false
    }
  };
}

export function generateFieldFromSettings(input={}) {
  if (!host) throw new Error("v39 field host is not ready");
  const settings=normalizeSettings(input);
  currentSettings=settings;
  const victoryLandmarkPlan=createV39VictoryLandmarkPlan(settings,{patternId:settings.patternId});
  currentData=ensureSnowStateMaps(createTerrainMapData({ ...settings, victoryLandmarkPlan }));
  ensureV39ClimateProfile(currentData);
  disposeFieldInput();
  if(game){ game.destroy(true); game=null; host.replaceChildren(); }
  createGame(currentData);
  const chip=playfield.querySelector(".map-chip");
  if(chip) chip.textContent=`${settings.w}×${settings.h} / ${settings.patternId} / ${settings.mountainMode}`;
  window.__v39FieldRuntime={game,mapData:currentData,settings,mapWidth:settings.w,mapHeight:settings.h,patternId:settings.patternId,mountainMode:settings.mountainMode};
  window.dispatchEvent(new CustomEvent("v39:field-generated",{detail:{settings,mapData:currentData}}));
  return currentData;
}

export function generateV39TestFieldWithSeed(input={}, seed="v39-test-seed") {
  return runWithSeededRandom(seed, () => {
    const data = generateFieldFromSettings(input);
    data.generationSeed = String(seed);
    return data;
  });
}

export function loadV39FieldSnapshot(mapData, inputSettings={}, options={}) {
  if (!host || !mapData || typeof mapData !== "object" || !Array.isArray(mapData.grid)) {
    throw new Error("復元できるフィールドデータがありません");
  }
  const settings=normalizeSettings({
    ...inputSettings,
    ...normalizeV39MapScope(mapData),
    w:Number(mapData.w)||inputSettings.w,
    h:Number(mapData.h)||inputSettings.h
  });
  settings.w=Number(mapData.w);
  settings.h=Number(mapData.h);
  currentSettings=settings;
  currentData=ensureSnowStateMaps(mapData);
  ensureV39ClimateProfile(currentData);
  if(options.layerChange&&options.worldId&&game&&!options.resetWorldLayers){
    activateWorldLayer(currentData,String(options.worldId),options.camera);
  }else{
    disposeFieldInput();
    if(game){ game.destroy(true); game=null; host.replaceChildren(); }
    createGame(currentData,options.worldId||'surface');
  }
  const chip=playfield.querySelector(".map-chip");
  if(chip) chip.textContent=`${settings.w}×${settings.h} / ${settings.patternId} / 復元`;
  window.__v39FieldRuntime={game,mapData:currentData,settings,mapWidth:settings.w,mapHeight:settings.h,patternId:settings.patternId,mountainMode:settings.mountainMode};
  if(options.layerChange){
    window.dispatchEvent(new CustomEvent("v39:field-layer-changed",{detail:{settings,mapData:currentData}}));
    window.dispatchEvent(new CustomEvent("v39:field-data-updated",{detail:{mapData:currentData,reason:"world-layer"}}));
  }else window.dispatchEvent(new CustomEvent("v39:field-generated",{detail:{settings,mapData:currentData,restored:true}}));
  return currentData;
}

async function boot(){
  while(!(document.querySelector(".playfield") instanceof HTMLElement)||!document.getElementById("map")) await new Promise(r=>setTimeout(r,25));
  playfield=document.querySelector(".playfield"); referenceMap=document.getElementById("map");
  document.getElementById("v39-phaser-field")?.remove();
  host=document.createElement("div"); host.id="v39-phaser-field"; Object.assign(host.style,{position:"absolute",inset:"0",zIndex:"1",overflow:"hidden",background:"#081115",touchAction:"none"});
  referenceMap.style.visibility="hidden"; referenceMap.style.pointerEvents="none"; playfield.prepend(host);
  const chip=playfield.querySelector(".map-chip"); if(chip) chip.textContent="フィールド未生成 / 管理 → フィールド設定";
  window.generateFieldFromSettings=generateFieldFromSettings;
  window.generateV39TestFieldWithSeed=generateV39TestFieldWithSeed;
  window.loadV39FieldSnapshot=loadV39FieldSnapshot;
  window.updateV39FieldData=updateV39FieldData;
  window.setV39SnowCoverAt=setV39SnowCoverAt;
  window.setV39SnowfallAt=setV39SnowfallAt;
  window.beginV39MapRenderBatch=beginMapRenderBatch;
  window.endV39MapRenderBatch=endMapRenderBatch;
  window.isV39MapRenderBatchActive=()=>mapRenderBatchTokens.size > 0;
  window.beginV39MapInputLock=beginMapInputLock;
  window.endV39MapInputLock=endMapInputLock;
  window.isV39MapInputLocked=()=>mapInputLockTokens.size > 0;
  window.waitForV39MapRenderSettled=waitForMapRenderSettled;
  window.getV39WorldLayerCacheStatus=()=>[...worldLayers.values()].map(entry=>({worldId:entry.id,sceneKey:entry.key,
    active:entry.id===activeWorldLayerId,terrainBuilds:entry.terrainBuilds,children:entry.scene?.children?.list?.length||0}));
  let pruneQueued=false;
  window.addEventListener('v39:game-state-changed',()=>{
    if(pruneQueued)return;pruneQueued=true;
    queueMicrotask(()=>{pruneQueued=false;pruneWorldLayers();});
  });
  window.__v39FieldRuntime={game:null,mapData:null,settings:null};
  window.render_game_to_text=()=>{
    const state=window.getV39GameState?.({includeWorlds:false});
    return JSON.stringify({screen:"v39-field",generated:!!currentData,settings:currentSettings,
      selectedTile:game?.scene?.getScenes(true)?.[0]?.v39SelectedTile||null,
      defenseStructures:currentData?.defenseStructures || [],
      unitDefenses:(state?.players || []).flatMap(player=>player.factionState.units || [])
        .filter(unit=>unit.shield || unit.barrier).map(unit=>({id:unit.id,x:unit.x,y:unit.y,shield:unit.shield,barrier:unit.barrier}))});
  };
  window.advanceTime=()=>window.render_game_to_text();
  window.dispatchEvent(new Event("v39:field-runtime-ready"));
}
boot().catch(error=>console.error("[v39-field-runtime-final] boot failed",error));
