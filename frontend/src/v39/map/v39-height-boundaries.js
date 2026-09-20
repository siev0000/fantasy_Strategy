import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";

const LAYER_NAME = "v39-height-boundary-layer";
const RETRY_MS = 16;
const RETRY_LIMIT = 180;
let renderRequestId = 0;

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
    left + halfW, top,
    left + width, top + upperY,
    left + width, top + lowerY,
    left + halfW, top + height,
    left, top + lowerY,
    left, top + upperY
  ];
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  const scenes = game?.scene?.getScenes?.(true) || [];
  return scenes.find(scene => scene?.sys?.isActive?.() !== false) || scenes[0] || null;
}

function destroyOldLayer(scene) {
  for (const child of [...(scene?.children?.list || [])]) {
    if (child?.name === LAYER_NAME) child.destroy();
  }
}

function levelAt(data, x, y) {
  if (x < 0 || y < 0 || x >= Number(data?.w || 0) || y >= Number(data?.h || 0)) return null;
  const value = Number(data?.heightLevelMap?.[y]?.[x]);
  return Number.isFinite(value) ? value : null;
}

function drawEdge(graphics, p, edgeIndex, difference) {
  const edgeVertices = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0]
  ];
  const pair = edgeVertices[edgeIndex];
  if (!pair) return;

  const [aIndex, bIndex] = pair;
  const ax = p[aIndex * 2];
  const ay = p[(aIndex * 2) + 1];
  const bx = p[bIndex * 2];
  const by = p[(bIndex * 2) + 1];

  if (difference >= 2) {
    graphics.lineStyle(3, 0x0b171c, 0.98);
  } else {
    // A one-level step should be readable without visually fragmenting the map.
    graphics.lineStyle(1.25, 0x60757e, 0.48);
  }
  graphics.lineBetween(ax, ay, bx, by);
}

function renderHeightBoundaries() {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const scene = activeScene();
  if (!data || !scene?.add) return false;

  destroyOldLayer(scene);
  const graphics = scene.add.graphics().setDepth(2).setName(LAYER_NAME);

  let differenceOneCount = 0;
  let differenceTwoPlusCount = 0;

  for (let y = 0; y < Number(data.h || 0); y += 1) {
    for (let x = 0; x < Number(data.w || 0); x += 1) {
      const current = levelAt(data, x, y);
      if (current === null) continue;

      const odd = y % 2 === 1;
      const neighbors = [
        { x: x + 1, y, edge: 1 },
        { x: x + (odd ? 1 : 0), y: y + 1, edge: 2 },
        { x: x + (odd ? 0 : -1), y: y + 1, edge: 3 }
      ];
      const p = hexPoints(x, y);

      for (const neighbor of neighbors) {
        const other = levelAt(data, neighbor.x, neighbor.y);
        if (other === null) continue;
        const difference = Math.abs(current - other);
        if (difference < 1) continue;

        drawEdge(graphics, p, neighbor.edge, difference);
        if (difference >= 2) differenceTwoPlusCount += 1;
        else differenceOneCount += 1;
      }
    }
  }

  window.__v39HeightBoundaryStatus = {
    rendered: true,
    differenceOneCount,
    differenceTwoPlusCount,
    rule: "diff-1-soft-diff-2plus-strong"
  };
  return true;
}

function scheduleHeightBoundaryRender() {
  const requestId = ++renderRequestId;
  let attempt = 0;

  const tryRender = () => {
    if (requestId !== renderRequestId) return;
    if (renderHeightBoundaries()) return;

    attempt += 1;
    if (attempt < RETRY_LIMIT && window.__v39FieldRuntime?.mapData) {
      window.setTimeout(tryRender, RETRY_MS);
      return;
    }

    window.__v39HeightBoundaryStatus = {
      rendered: false,
      attempts: attempt,
      reason: window.__v39FieldRuntime?.mapData ? "scene-not-ready" : "field-not-generated"
    };
  };

  tryRender();
}

function install() {
  window.addEventListener("v39:field-generated", scheduleHeightBoundaryRender);
  window.addEventListener("v39:display-settings-changed", scheduleHeightBoundaryRender);
  window.renderV39HeightBoundaries = scheduleHeightBoundaryRender;
  window.getV39HeightBoundaryStatus = () => ({ ...(window.__v39HeightBoundaryStatus || {}) });

  if (window.__v39FieldRuntime?.mapData) scheduleHeightBoundaryRender();
}

install();
