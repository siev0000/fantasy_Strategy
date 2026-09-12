import Phaser from "phaser";
import { createTerrainMapData, terrainDefinitions } from "./lib/map-generator.js";
import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const MAP_W = 60;
const MAP_H = 60;
const PATTERN_ID = "realistic";
const MOUNTAIN_MODE = "random";

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

function drawTerrain(scene, data) {
  const graphics = scene.add.graphics();
  for (let y = 0; y < data.h; y += 1) {
    for (let x = 0; x < data.w; x += 1) {
      const terrain = String(data.grid?.[y]?.[x] || "海");
      const fill = colorNumber(terrainColorMap.get(terrain) || "#607078");
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
      graphics.lineStyle(1, 0x26353b, 0.95);
      graphics.strokePoints([
        { x: points[0], y: points[1] },
        { x: points[2], y: points[3] },
        { x: points[4], y: points[5] },
        { x: points[6], y: points[7] },
        { x: points[8], y: points[9] },
        { x: points[10], y: points[11] }
      ], true);
    }
  }
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
        fontFamily: '"Noto Sans JP", "Yu Gothic", sans-serif',
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
  camera.setBounds(0, 0, size.width, size.height);
  const fit = Math.min(camera.width / size.width, camera.height / size.height) * 0.97;
  camera.setZoom(Math.max(0.05, fit));
  camera.centerOn(size.width / 2, size.height / 2);
}

function createFieldGame(host, data) {
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
        drawTerrain(this, data);
        drawRivers(this, data.riverData);
        drawSpecialTerrain(this, data);
        fitCamera(this);
        lastW = this.scale.width;
        lastH = this.scale.height;
        this.scale.on("resize", gameSize => {
          const w = Number(gameSize?.width) || 0;
          const h = Number(gameSize?.height) || 0;
          if (w === lastW && h === lastH) return;
          lastW = w;
          lastH = h;
          fitCamera(this);
        });
      }
    }
  });
  return game;
}

async function boot() {
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
  createFieldGame(host, data);

  window.__v39FieldRuntime = {
    mapData: data,
    mapWidth: MAP_W,
    mapHeight: MAP_H,
    patternId: PATTERN_ID,
    mountainMode: MOUNTAIN_MODE
  };
}

boot().catch(error => {
  console.error("[v39-field-runtime] field boot failed", error);
});
