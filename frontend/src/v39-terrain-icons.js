import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const BASE_TERRAIN_ICONS = Object.freeze({
  "森": { symbol: "🌲", imageCandidate: false },
  "山岳": { symbol: "⛰", imageCandidate: false },
  "雪原": { symbol: "❄", imageCandidate: false },
  "火山": { symbol: "🌋", imageCandidate: false },
  "砂漠": { symbol: "∴", imageCandidate: false }
});

const SPECIAL_TERRAIN_ICONS = Object.freeze({
  "沼地": { symbol: "≈", imageCandidate: false },
  "峡谷": { symbol: "峡", imageCandidate: false },
  "洞窟": { symbol: "●", imageCandidate: true },
  "遺跡": { symbol: "◇", imageCandidate: true }
});

const LEGACY_LABELS = new Set(["沼", "峡", "洞"]);
const OVERLAY_NAME = "v39-terrain-icon-overlay";
const TEXTURE_PREFIX = "v39-terrain-icon:";

function tileCenter(x, y) {
  const width = Number(HEX_TILE_CONFIG?.width) || 40;
  const height = Number(HEX_TILE_CONFIG?.height) || 48;
  const rowStep = Number(HEX_TILE_CONFIG?.rowStep) || 36;
  const oddRowOffsetX = Number(HEX_TILE_CONFIG?.oddRowOffsetX) || width / 2;
  return {
    x: (x * width) + (y % 2 === 1 ? oddRowOffsetX : 0) + width / 2,
    y: (y * rowStep) + height / 2
  };
}

function activeScene() {
  const game = window.__v39FieldRuntime?.game;
  const scenes = game?.scene?.getScenes?.(true) || [];
  return scenes[0] || null;
}

function removeLegacySpecialLabels(scene) {
  for (const child of scene?.children?.list || []) {
    if (child?.type === "Text" && LEGACY_LABELS.has(String(child.text || ""))) {
      child.destroy();
    }
  }
}

function destroyOldOverlay(scene) {
  for (const child of scene?.children?.list || []) {
    if (child?.name === OVERLAY_NAME) child.destroy();
  }
}

function textureKey(kind, terrain) {
  return `${TEXTURE_PREFIX}${kind}:${terrain}`;
}

function ensureIconTexture(scene, kind, terrain, icon) {
  const key = textureKey(kind, terrain);
  if (scene.textures.exists(key)) return key;

  const size = kind === "special" ? 34 : 30;
  const fontSize = kind === "special" ? 22 : 20;
  const texture = scene.textures.createCanvas(key, size, size);
  const context = texture.getContext();

  context.clearRect(0, 0, size, size);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${fontSize}px "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  context.lineJoin = "round";
  context.lineWidth = kind === "special" ? 5 : 3;
  context.strokeStyle = "rgba(7, 16, 20, 0.95)";
  context.strokeText(icon.symbol, size / 2, size / 2 + 1);
  context.fillStyle = "#fff4cf";
  context.fillText(icon.symbol, size / 2, size / 2 + 1);
  texture.refresh();

  return key;
}

function addIconImage(scene, container, x, y, kind, terrain, icon) {
  const center = tileCenter(x, y);
  const key = ensureIconTexture(scene, kind, terrain, icon);
  const image = scene.add.image(center.x, center.y, key)
    .setOrigin(0.5)
    .setName(`v39-${kind}-icon:${terrain}:${x},${y}`);

  image.setData("terrain", terrain);
  image.setData("iconKind", kind);
  image.setData("imageCandidate", icon.imageCandidate === true);
  container.add(image);
}

function renderTerrainIcons() {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const scene = activeScene();
  if (!data || !scene) return;

  destroyOldOverlay(scene);
  removeLegacySpecialLabels(scene);

  const container = scene.add.container(0, 0).setDepth(5).setName(OVERLAY_NAME);

  for (let y = 0; y < Number(data.h || 0); y += 1) {
    for (let x = 0; x < Number(data.w || 0); x += 1) {
      const terrain = String(data.grid?.[y]?.[x] || "");
      const special = String(data.specialMap?.[y]?.[x] || "");
      const baseIcon = BASE_TERRAIN_ICONS[terrain];
      const specialIcon = SPECIAL_TERRAIN_ICONS[special];

      if (baseIcon) addIconImage(scene, container, x, y, "base", terrain, baseIcon);
      if (specialIcon) addIconImage(scene, container, x, y, "special", special, specialIcon);
    }
  }
}

function install() {
  window.addEventListener("v39:field-generated", () => {
    window.setTimeout(renderTerrainIcons, 0);
  });

  window.renderV39TerrainIcons = renderTerrainIcons;
  window.getV39TerrainIconDefinitions = () => ({
    base: { ...BASE_TERRAIN_ICONS },
    special: { ...SPECIAL_TERRAIN_ICONS }
  });
  window.getV39TerrainImageIconCandidates = () => Object.entries(SPECIAL_TERRAIN_ICONS)
    .filter(([, value]) => value.imageCandidate)
    .map(([terrain, value]) => ({ terrain, temporarySymbol: value.symbol }));

  if (window.__v39FieldRuntime?.mapData) {
    window.setTimeout(renderTerrainIcons, 0);
  }
}

install();
