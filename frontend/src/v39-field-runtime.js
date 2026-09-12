import Phaser from "phaser";
import { createTerrainMapData, terrainDefinitions } from "./lib/map-generator.js";
import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const MAP_W = 60;
const MAP_H = 60;
const PATTERN_ID = "realistic";
const MOUNTAIN_MODE = "random";
const MAX_ZOOM_FACTOR = 6;

const terrainColorMap = new Map(
  (Array.isArray(terrainDefinitions) ? terrainDefinitions : []).map(row => [String(row?.key || ""), String(row?.color || "#607078")])
);

function waitForReferenceField() {
  return new Promise(resolve => {
    const tryResolve = () => {
      const playfield = document.querySelector(".playfield");
      const referenceMap = document.getElementById("map");
      if (playfield instanceof HTMLElement && referenceMap) {
        resolve({ playfield, referenceMap });
        return;
      }
      window.setTimeout(tryResolve, 25);
    };
    tryResolve();
  });
}

function installCustomFieldSettingsPlaceholder() {
  if (document.getElementById("v39-field-settings-placeholder")) return;

  const panel = document.getElementById("mobileFabPanel");
  if (!(panel instanceof HTMLElement)) {
    window.setTimeout(installCustomFieldSettingsPlaceholder, 50);
    return;
  }

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "fab-item";
  openButton.id = "v39-open-field-settings";
  openButton.title = "フィールド設定";
  openButton.setAttribute("aria-label", "フィールド設定");
  openButton.innerHTML = '<span aria-hidden="true">地</span><span class="sr-only">フィールド設定</span>';
  panel.appendChild(openButton);

  const overlay = document.createElement("div");
  overlay.id = "v39-field-settings-placeholder";
  overlay.setAttribute("aria-hidden", "true");
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    zIndex: "10000",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    padding: "14px",
    background: "rgba(1, 5, 8, 0.78)",
    backdropFilter: "blur(3px)"
  });

  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "v39-field-settings-title");
  Object.assign(dialog.style, {
    width: "min(680px, 100%)",
    maxHeight: "min(760px, calc(100dvh - 28px))",
    overflow: "auto",
    border: "1px solid #45565d",
    borderRadius: "10px",
    background: "linear-gradient(180deg, rgba(20,31,36,.99), rgba(7,14,18,.99))",
    boxShadow: "0 20px 60px rgba(0,0,0,.55)",
    color: "#e8efec"
  });

  dialog.innerHTML = `
    <header style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid #34444a;position:sticky;top:0;background:#111c21;z-index:1">
      <div>
        <div id="v39-field-settings-title" style="font-weight:800;font-size:16px">フィールド設定</div>
        <div style="margin-top:2px;font-size:11px;color:#92a2a6">カスタムフィールド生成（仮画面）</div>
      </div>
      <button type="button" id="v39-close-field-settings" style="border:1px solid #526269;border-radius:7px;background:#19262b;color:#e8efec;padding:7px 11px;cursor:pointer">閉じる</button>
    </header>
    <div style="padding:14px;display:grid;gap:12px">
      <div style="padding:12px;border:1px solid #34444a;border-radius:8px;background:rgba(255,255,255,.025)">
        <div style="font-size:13px;font-weight:700;margin-bottom:5px">現在は仮画面です</div>
        <div style="font-size:12px;line-height:1.7;color:#b8c5c8">ここへ以前の画面で使用していたフィールドカスタム設定を、そのまま移植します。設定後に「生成」を押して初めてフィールドを作成する流れに変更します。</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px">
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">マップサイズ（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">島構成（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">山岳設定（未接続）</div>
        <div style="padding:10px;border:1px solid #2f3f45;border-radius:7px;color:#9eacb0">河川設定（未接続）</div>
      </div>
      <button type="button" disabled style="width:100%;padding:11px;border:1px solid #45565d;border-radius:8px;background:#233137;color:#718085;font-weight:800">生成（未接続）</button>
    </div>
  `;
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const closeButton = dialog.querySelector("#v39-close-field-settings");
  const open = () => {
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
  };
  const close = () => {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  };

  openButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    open();
  });
  closeButton?.addEventListener("click", close);
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.style.display !== "none") close();
  });
}

function hexPoints(x, y) {
  const tileW = Number(HEX_TILE_CONFIG?.width) || 40;
  const tileH = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || tileW / 2;
  const halfW = tileW / 2;
  const upperY = tileH - rowStep;
  const lowerY = rowStep;
  const offsetX = (y % 2 === 1) ? oddRowOffsetX : 0;
  const left = (x * tileW) + offsetX;
  const top = y * rowStep;
  return [
    left + halfW, top,
    left + tileW, top + upperY,
    left + tileW, top + lowerY,
    left + halfW, top + tileH,
    left, top + lowerY,
    left, top + upperY
  ];
}

function tileCenter(x, y) {
  const tileW = Number(HEX_TILE_CONFIG?.width) || 40;
  const tileH = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || tileW / 2;
  return {
    x: (x * tileW) + ((y % 2 === 1) ? oddRowOffsetX : 0) + tileW / 2,
    y: (y * rowStep) + tileH / 2
  };
}

function containsWorldPoint(points, worldX, worldY) {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const xi = points[i];
    const yi = points[i + 1];
    const xj = points[j];
    const yj = points[j + 1];
    const intersects = ((yi > worldY) !== (yj > worldY))
      && (worldX < ((xj - xi) * (worldY - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function resolveTileAtWorldPoint(data, worldX, worldY) {
  const tileW = Number(HEX_TILE_CONFIG?.width) || 40;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || tileW / 2;
  const estimatedRow = Math.floor(worldY / rowStep);
  const candidates = [];

  for (let y = estimatedRow - 1; y <= estimatedRow + 1; y += 1) {
    if (y < 0 || y >= data.h) continue;
    const offsetX = (y % 2 === 1) ? oddRowOffsetX : 0;
    const estimatedColumn = Math.floor((worldX - offsetX) / tileW);
    for (let x = estimatedColumn - 1; x <= estimatedColumn + 1; x += 1) {
      if (x < 0 || x >= data.w) continue;
      const points = hexPoints(x, y);
      if (!containsWorldPoint(points, worldX, worldY)) continue;
      const center = tileCenter(x, y);
      candidates.push({ x, y, distance: Math.hypot(worldX - center.x, worldY - center.y) });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0] || null;
}

function parseCornerKey(raw) {
  const [xRaw, yRaw] = String(raw || "").split(",");
  const x = Number(xRaw);
  const y = Number(yRaw);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function parseCornerEdge(raw) {
  const [aRaw, bRaw] = String(raw || "").split("|");
  const a = parseCornerKey(aRaw);
  const b = parseCornerKey(bRaw);
  return a && b ? { a, b } : null;
}

function worldSize() {
  const tileW = Number(HEX_TILE_CONFIG?.width) || 40;
  const tileH = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || tileW / 2;
  return {
    width: (MAP_W * tileW) + oddRowOffsetX + 2,
    height: ((MAP_H - 1) * rowStep) + tileH + 2
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
  if (!hex || !hex.startsWith("#") || !Number.isFinite(level)) return hex;
  const minLevel = -2;
  const maxLevel = 8;
  const t = Phaser.Math.Clamp((level - minLevel) / (maxLevel - minLevel), 0, 1);
  const brightness = 1.18 + ((0.74 - 1.18) * t);
  const raw = Number.parseInt(hex.slice(1), 16);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function shadeSeaColorByDepth(hex, level) {
  if (!hex || !hex.startsWith("#") || !Number.isFinite(level)) return hex;
  const raw = Number.parseInt(hex.slice(1), 16);
  const brightness = 1 - Math.min(0.62, Math.max(0, -Math.floor(level)) * 0.09);
  const r = Phaser.Math.Clamp(Math.round(((raw >> 16) & 0xff) * brightness), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((raw >> 8) & 0xff) * brightness), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((raw & 0xff) * brightness), 0, 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function readMapDisplaySettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("v39-display-settings-v1") || "null");
    return {
      heightOutlineOnly: saved?.heightOutlineOnly !== false,
      heightShading: saved?.heightShading !== false
    };
  } catch {
    return { heightOutlineOnly: true, heightShading: true };
  }
}

function hexEdgeDefinitions(x, y, points) {
  const odd = y % 2 === 1;
  return [
    { neighbor: [x + (odd ? 1 : 0), y - 1], start: 0, end: 1 },
    { neighbor: [x + 1, y], start: 1, end: 2 },
    { neighbor: [x + (odd ? 1 : 0), y + 1], start: 2, end: 3 },
    { neighbor: [x + (odd ? 0 : -1), y + 1], start: 3, end: 4 },
    { neighbor: [x - 1, y], start: 4, end: 5 },
    { neighbor: [x + (odd ? 0 : -1), y - 1], start: 5, end: 0 }
  ].map(edge => ({
    ...edge,
    x1: points[edge.start * 2],
    y1: points[(edge.start * 2) + 1],
    x2: points[edge.end * 2],
    y2: points[(edge.end * 2) + 1]
  }));
}

function drawTerrain(scene, data, graphics = scene.add.graphics()) {
  const settings = readMapDisplaySettings();
  graphics.clear();
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = String(data.grid?.[y]?.[x] || "海");
      const baseColor = terrainColorMap.get(terrain) || "#607078";
      const heightLevel = Number(data.heightLevelMap?.[y]?.[x]);
      const shadedColor = settings.heightShading
        ? (terrain === "海" ? shadeSeaColorByDepth(baseColor, heightLevel) : shadeColorByHeight(baseColor, heightLevel))
        : baseColor;
      const fill = colorNumber(shadedColor);
      const points = hexPoints(x, y);
      graphics.fillStyle(fill, 1);
      graphics.fillPoints([
        { x: points[0], y: points[1] },
        { x: points[2], y: points[3] },
        { x: points[4], y: points[5] },
        { x: points[6], y: points[7] },
        { x: points[8], y: points[9] },
        { x: points[10], y: points[11] }
      ], true);
    }
  }
  graphics.lineStyle(1, 0x26353b, 0.95);
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const points = hexPoints(x, y);
      if (!settings.heightOutlineOnly) {
        graphics.strokePoints([
          { x: points[0], y: points[1] },
          { x: points[2], y: points[3] },
          { x: points[4], y: points[5] },
          { x: points[6], y: points[7] },
          { x: points[8], y: points[9] },
          { x: points[10], y: points[11] }
        ], true);
        continue;
      }
      const currentLevel = Number(data.heightLevelMap?.[y]?.[x]);
      for (const edge of hexEdgeDefinitions(x, y, points)) {
        const [neighborX, neighborY] = edge.neighbor;
        if (neighborX < 0 || neighborY < 0 || neighborX >= data.w || neighborY >= data.h) continue;
        const neighborLevel = Number(data.heightLevelMap?.[neighborY]?.[neighborX]);
        if (!Number.isFinite(currentLevel) || !Number.isFinite(neighborLevel) || currentLevel === neighborLevel) continue;
        graphics.lineBetween(edge.x1, edge.y1, edge.x2, edge.y2);
      }
    }
  }
  return graphics;
}

function drawRivers(scene, riverData) {
  const graphics = scene.add.graphics();
  graphics.lineStyle(3, 0x5aa9de, 0.95);
  const normalEdges = new Set([
    ...(riverData?.cornerEdgeSet instanceof Set ? riverData.cornerEdgeSet : []),
    ...(riverData?.cornerWaterLinkSet instanceof Set ? riverData.cornerWaterLinkSet : [])
  ]);
  for (const raw of normalEdges) {
    const edge = parseCornerEdge(raw);
    if (!edge) continue;
    graphics.lineBetween(edge.a.x, edge.a.y, edge.b.x, edge.b.y);
  }

  const waterfallEdges = riverData?.cornerWaterfallEdgeSet instanceof Set
    ? riverData.cornerWaterfallEdgeSet
    : new Set();
  if (waterfallEdges.size) {
    graphics.lineStyle(5, 0xd9f5ff, 1);
    for (const raw of waterfallEdges) {
      const edge = parseCornerEdge(raw);
      if (!edge) continue;
      graphics.lineBetween(edge.a.x, edge.a.y, edge.b.x, edge.b.y);
      const mx = (edge.a.x + edge.b.x) / 2;
      const my = (edge.a.y + edge.b.y) / 2;
      graphics.fillStyle(0xffffff, 0.95);
      graphics.fillCircle(mx, my, 3);
    }
  }
}

function drawSpecialTerrain(scene, data) {
  const labels = {
    "沼地": "沼",
    "峡谷": "峡",
    "洞窟": "洞"
  };
  const tileW = Number(HEX_TILE_CONFIG?.width) || 40;
  const tileH = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || tileW / 2;
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const special = String(data.specialMap?.[y]?.[x] || "");
      const label = labels[special];
      if (!label) continue;
      const cx = (x * tileW) + ((y % 2 === 1) ? oddRowOffsetX : 0) + tileW / 2;
      const cy = (y * rowStep) + tileH / 2;
      scene.add.text(cx, cy, label, {
        fontFamily: '\"Noto Sans JP\", \"Yu Gothic\", sans-serif',
        fontSize: "11px",
        fontStyle: "bold",
        color: "#f6f0d2",
        stroke: "#071014",
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(4);
    }
  }
}

function fitCamera(scene) {
  const camera = scene.cameras.main;
  const size = worldSize();
  camera.removeBounds();
  const fit = Math.min(camera.width / size.width, camera.height / size.height) * 0.97;
  camera.setZoom(Math.max(0.05, fit));
  camera.centerOn(size.width / 2, size.height / 2);
  scene.v39FitZoom = camera.zoom;
  scene.v39RequestedZoom = camera.zoom;
}

function resizeCameraPreservingView(scene) {
  const camera = scene.cameras.main;
  const size = worldSize();
  const currentZoom = Number(scene.v39RequestedZoom) || camera.zoom;
  camera.removeBounds();
  const fit = Math.max(0.05, Math.min(camera.width / size.width, camera.height / size.height) * 0.97);
  scene.v39FitZoom = fit;
  scene.v39RequestedZoom = Phaser.Math.Clamp(currentZoom, fit, fit * MAX_ZOOM_FACTOR);
  camera.setZoom(scene.v39RequestedZoom);
  clampCamera(camera);
}

function clampCamera(camera) {
  camera.preRender();
  const size = worldSize();
  const topLeft = camera.getWorldPoint(0, 0);
  const bottomRight = camera.getWorldPoint(camera.width, camera.height);
  const visibleWidth = bottomRight.x - topLeft.x;
  const visibleHeight = bottomRight.y - topLeft.y;
  let adjustX = 0;
  let adjustY = 0;

  if (visibleWidth < size.width) {
    if (topLeft.x < 0) adjustX = -topLeft.x;
    else if (bottomRight.x > size.width) adjustX = size.width - bottomRight.x;
  } else {
    if (topLeft.x > 0) adjustX = -topLeft.x;
    else if (bottomRight.x < size.width) adjustX = size.width - bottomRight.x;
  }
  if (visibleHeight < size.height) {
    if (topLeft.y < 0) adjustY = -topLeft.y;
    else if (bottomRight.y > size.height) adjustY = size.height - bottomRight.y;
  } else {
    if (topLeft.y > 0) adjustY = -topLeft.y;
    else if (bottomRight.y < size.height) adjustY = size.height - bottomRight.y;
  }

  camera.scrollX += adjustX;
  camera.scrollY += adjustY;
  camera.preRender();
}

function clientToCameraPoint(camera, host, clientX, clientY) {
  const rect = host.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: (clientX - rect.left) * (camera.width / rect.width),
    y: (clientY - rect.top) * (camera.height / rect.height)
  };
}

function cameraPointToWorld(camera, point) {
  const world = camera.getWorldPoint(point.x, point.y);
  return { x: world.x, y: world.y };
}

function worldToCameraPoint(camera, worldX, worldY) {
  const origin = camera.getWorldPoint(0, 0);
  const stepX = camera.getWorldPoint(1, 0);
  const stepY = camera.getWorldPoint(0, 1);
  const j11 = stepX.x - origin.x;
  const j21 = stepX.y - origin.y;
  const j12 = stepY.x - origin.x;
  const j22 = stepY.y - origin.y;
  const determinant = (j11 * j22) - (j12 * j21);
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-9) return null;
  const dx = worldX - origin.x;
  const dy = worldY - origin.y;
  return {
    x: ((dx * j22) - (dy * j12)) / determinant,
    y: ((dy * j11) - (dx * j21)) / determinant
  };
}

function installCameraControlStyles() {
  if (document.getElementById("v39-map-camera-control-style")) return;
  const style = document.createElement("style");
  style.id = "v39-map-camera-control-style";
  style.textContent = `
#v39-map-camera-controls{position:absolute;left:74px;bottom:8px;z-index:24;display:grid;gap:4px}
#v39-map-camera-controls button{width:38px;height:38px;padding:0;border:1px solid #597078;border-radius:7px;background:rgba(13,27,32,.94);color:#e8efec;font-size:23px;line-height:1;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.35)}
#v39-map-camera-controls button:active{background:#21434c;border-color:#76cedd}
@media(max-width:700px){#v39-map-camera-controls{left:6px;bottom:6px}#v39-map-camera-controls button{width:36px;height:36px}}
`;
  document.head.appendChild(style);
}

function installCameraControls(scene, host, playfield, data) {
  installCameraControlStyles();
  const camera = scene.cameras.main;
  const pointers = new Map();
  let dragged = false;
  let lastTouchTap = null;
  const selectionGraphics = scene.add.graphics().setDepth(20);

  const selectTileAt = (clientX, clientY) => {
    const cameraPoint = clientToCameraPoint(camera, host, clientX, clientY);
    if (!cameraPoint) return null;
    const worldPoint = cameraPointToWorld(camera, cameraPoint);
    const tile = resolveTileAtWorldPoint(data, worldPoint.x, worldPoint.y);
    if (!tile) return null;

    const points = hexPoints(tile.x, tile.y);
    selectionGraphics.clear();
    selectionGraphics.lineStyle(4, 0xffdd72, 1);
    selectionGraphics.strokePoints([
      { x: points[0], y: points[1] },
      { x: points[2], y: points[3] },
      { x: points[4], y: points[5] },
      { x: points[6], y: points[7] },
      { x: points[8], y: points[9] },
      { x: points[10], y: points[11] }
    ], true);

    const selected = {
      x: tile.x,
      y: tile.y,
      terrain: String(data.grid?.[tile.y]?.[tile.x] || "海"),
      height: Number(data.heightLevelMap?.[tile.y]?.[tile.x]) || 0,
      special: String(data.specialMap?.[tile.y]?.[tile.x] || "")
    };
    scene.v39SelectedTile = selected;
    const terrainLabel = document.getElementById("landTerrain");
    if (terrainLabel) terrainLabel.textContent = selected.special || selected.terrain;
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail: selected }));
    return selected;
  };

  const zoomAt = (clientX, clientY, factor) => {
    const cameraPoint = clientToCameraPoint(camera, host, clientX, clientY);
    if (!cameraPoint) return;
    const before = cameraPointToWorld(camera, cameraPoint);
    const minZoom = Number(scene.v39FitZoom) || camera.zoom;
    const currentZoom = Number(scene.v39RequestedZoom) || camera.zoom;
    scene.v39RequestedZoom = Phaser.Math.Clamp(currentZoom * factor, minZoom, minZoom * MAX_ZOOM_FACTOR);
    camera.setZoom(scene.v39RequestedZoom);
    camera.preRender();
    const after = cameraPointToWorld(camera, cameraPoint);
    camera.scrollX += before.x - after.x;
    camera.scrollY += before.y - after.y;
    clampCamera(camera);
  };

  const zoomCenter = factor => {
    const rect = host.getBoundingClientRect();
    const topLeft = camera.getWorldPoint(0, 0);
    const bottomRight = camera.getWorldPoint(camera.width, camera.height);
    const size = worldSize();
    const visibleLeft = Math.max(0, Math.min(topLeft.x, bottomRight.x));
    const visibleRight = Math.min(size.width, Math.max(topLeft.x, bottomRight.x));
    const visibleTop = Math.max(0, Math.min(topLeft.y, bottomRight.y));
    const visibleBottom = Math.min(size.height, Math.max(topLeft.y, bottomRight.y));
    const worldX = visibleRight >= visibleLeft ? (visibleLeft + visibleRight) / 2 : size.width / 2;
    const worldY = visibleBottom >= visibleTop ? (visibleTop + visibleBottom) / 2 : size.height / 2;
    const cameraPoint = worldToCameraPoint(camera, worldX, worldY);
    if (!cameraPoint) return;
    const clientX = rect.left + cameraPoint.x * (rect.width / camera.width);
    const clientY = rect.top + cameraPoint.y * (rect.height / camera.height);
    zoomAt(clientX, clientY, factor);
  };

  host.addEventListener("wheel", event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.16 : 1 / 1.16);
  }, { passive: false });

  host.addEventListener("pointerdown", event => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    host.setPointerCapture?.(event.pointerId);
    dragged = false;
  });

  host.addEventListener("pointermove", event => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const oldPointers = [...pointers.values()];
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const nextPointers = [...pointers.values()];

    if (nextPointers.length >= 2) {
      const oldDistance = Math.hypot(oldPointers[0].x - oldPointers[1].x, oldPointers[0].y - oldPointers[1].y);
      const nextDistance = Math.hypot(nextPointers[0].x - nextPointers[1].x, nextPointers[0].y - nextPointers[1].y);
      if (oldDistance > 0 && nextDistance > 0) {
        const centerX = (nextPointers[0].x + nextPointers[1].x) / 2;
        const centerY = (nextPointers[0].y + nextPointers[1].y) / 2;
        zoomAt(centerX, centerY, nextDistance / oldDistance);
        dragged = true;
      }
      return;
    }

    const dx = event.clientX - previous.x;
    const dy = event.clientY - previous.y;
    if (Math.abs(dx) + Math.abs(dy) < 1) return;
    camera.scrollX -= dx / camera.zoom;
    camera.scrollY -= dy / camera.zoom;
    clampCamera(camera);
    dragged = true;
  });

  const finishPointer = event => {
    const wasTouch = event.pointerType !== "mouse";
    const shouldSelect = !dragged && pointers.size === 1;
    pointers.delete(event.pointerId);
    host.releasePointerCapture?.(event.pointerId);
    if (shouldSelect) selectTileAt(event.clientX, event.clientY);
    if (wasTouch && !dragged && pointers.size === 0) {
      const now = performance.now();
      if (lastTouchTap && now - lastTouchTap.time < 320 && Math.hypot(event.clientX - lastTouchTap.x, event.clientY - lastTouchTap.y) < 28) {
        zoomAt(event.clientX, event.clientY, 1.5);
        lastTouchTap = null;
      } else {
        lastTouchTap = { time: now, x: event.clientX, y: event.clientY };
      }
    }
    if (!pointers.size) dragged = false;
  };
  host.addEventListener("pointerup", finishPointer);
  host.addEventListener("pointercancel", finishPointer);
  host.addEventListener("dblclick", event => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, 1.5);
  });

  const controls = document.createElement("div");
  controls.id = "v39-map-camera-controls";
  controls.setAttribute("aria-label", "地図の拡大縮小");
  controls.innerHTML = '<button type="button" data-map-zoom="in" aria-label="地図を拡大">＋</button><button type="button" data-map-zoom="out" aria-label="地図を縮小">−</button>';
  controls.addEventListener("pointerdown", event => event.stopPropagation());
  controls.querySelector('[data-map-zoom="in"]')?.addEventListener("click", () => zoomCenter(1.3));
  controls.querySelector('[data-map-zoom="out"]')?.addEventListener("click", () => zoomCenter(1 / 1.3));
  playfield.appendChild(controls);

  scene.v39Input = { zoomAt, selectTileAt };
}

function createFieldGame(host, playfield, data) {
  let lastW = 0;
  let lastH = 0;
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    transparent: false,
    backgroundColor: "#081115",
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight)
    },
    scene: {
      create() {
        const terrainGraphics = drawTerrain(this, data);
        drawRivers(this, data.riverData);
        drawSpecialTerrain(this, data);
        fitCamera(this);
        installCameraControls(this, host, playfield, data);
        const redrawTerrain = () => drawTerrain(this, data, terrainGraphics);
        window.addEventListener("v39:display-settings-changed", redrawTerrain);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          window.removeEventListener("v39:display-settings-changed", redrawTerrain);
        });
        lastW = this.scale.width;
        lastH = this.scale.height;
        this.scale.on("resize", gameSize => {
          const w = Number(gameSize?.width) || 0;
          const h = Number(gameSize?.height) || 0;
          if (w === lastW && h === lastH) return;
          lastW = w;
          lastH = h;
          resizeCameraPreservingView(this);
        });
      }
    }
  });
  return game;
}

async function boot() {
  installCustomFieldSettingsPlaceholder();
  const { playfield, referenceMap } = await waitForReferenceField();
  if (document.getElementById("v39-phaser-field")) return;

  const host = document.createElement("div");
  host.id = "v39-phaser-field";
  Object.assign(host.style, {
    position: "absolute",
    inset: "0",
    zIndex: "1",
    overflow: "hidden",
    background: "#081115",
    touchAction: "none"
  });

  referenceMap.style.visibility = "hidden";
  referenceMap.style.pointerEvents = "none";
  playfield.prepend(host);

  const mapChip = playfield.querySelector(".map-chip");
  if (mapChip) mapChip.textContent = "60×60 / リアル島 / 既存フィールド生成ルール";

  const data = createTerrainMapData({
    w: MAP_W,
    h: MAP_H,
    patternId: PATTERN_ID,
    mountainMode: MOUNTAIN_MODE
  });
  const game = createFieldGame(host, playfield, data);

  window.__v39FieldRuntime = {
    game,
    mapData: data,
    mapWidth: MAP_W,
    mapHeight: MAP_H,
    patternId: PATTERN_ID,
    mountainMode: MOUNTAIN_MODE
  };
  window.render_game_to_text = () => {
    const scene = game.scene.getScenes(true)[0];
    const camera = scene?.cameras?.main;
    const footer = document.querySelector(".footer");
    const topbar = document.querySelector(".topbar");
    const playfieldHeight = playfield.getBoundingClientRect().height;
    const footerHeight = footer?.getBoundingClientRect().height || 0;
    const topRegionHeight = (topbar?.getBoundingClientRect().height || 0) + playfieldHeight;
    const activeFooterTab = document.querySelector("[data-foot].active")?.getAttribute("data-foot") || "";
    const displaySettingsPanel = document.getElementById("v39-display-settings-panel");
    return JSON.stringify({
      screen: "v39-field",
      coordinates: "world origin is top-left; x increases right; y increases down",
      map: { width: MAP_W, height: MAP_H, pattern: PATTERN_ID },
      layout: {
        topRegionHeight: Math.round(topRegionHeight),
        playfieldHeight: Math.round(playfieldHeight),
        footerHeight: Math.round(footerHeight),
        playfieldRatioExcludingHeader: Number((playfieldHeight / Math.max(1, playfieldHeight + footerHeight)).toFixed(3)),
        footerRatioExcludingHeader: Number((footerHeight / Math.max(1, playfieldHeight + footerHeight)).toFixed(3)),
        topRegionRatio: Number((topRegionHeight / Math.max(1, topRegionHeight + footerHeight)).toFixed(3)),
        footerRatio: Number((footerHeight / Math.max(1, topRegionHeight + footerHeight)).toFixed(3))
      },
      footer: {
        activeTab: activeFooterTab,
        displaySettingsOpen: displaySettingsPanel instanceof HTMLElement && !displaySettingsPanel.hidden,
        displaySettings: typeof window.getV39DisplaySettings === "function" ? window.getV39DisplaySettings() : null
      },
      selectedTile: scene?.v39SelectedTile || null,
      camera: camera ? {
        zoom: Number(camera.zoom.toFixed(4)),
        minZoom: Number((Number(scene.v39FitZoom) || camera.zoom).toFixed(4)),
        maxZoom: Number(((Number(scene.v39FitZoom) || camera.zoom) * MAX_ZOOM_FACTOR).toFixed(4)),
        x: Number(camera.scrollX.toFixed(2)),
        y: Number(camera.scrollY.toFixed(2))
      } : null
    });
  };
  window.advanceTime = () => window.render_game_to_text();
}

boot().catch(error => {
  console.error("[v39-field-runtime] field boot failed", error);
});
