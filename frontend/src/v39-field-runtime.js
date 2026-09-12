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
