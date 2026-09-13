import { HEX_TILE_CONFIG } from "./lib/phaser-map-panel-config.js";

const SPECIAL_TERRAIN_ICONS = Object.freeze({
  "沼地": { symbol: "≈", imageCandidate: false },
  "峡谷": { symbol: "峡", imageCandidate: false },
  "洞窟": { symbol: "●", imageCandidate: true },
  "遺跡": { symbol: "◇", imageCandidate: true }
});

const LEGACY_LABELS = new Set(["沼", "峡", "洞"]);
const OVERLAY_NAME = "v39-special-terrain-icon-overlay";

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

function renderSpecialTerrainIcons() {
  const runtime = window.__v39FieldRuntime;
  const data = runtime?.mapData;
  const scene = activeScene();
  if (!data || !scene) return;

  destroyOldOverlay(scene);
  removeLegacySpecialLabels(scene);

  const container = scene.add.container(0, 0).setDepth(5).setName(OVERLAY_NAME);

  for (let y = 0; y < Number(data.h || 0); y += 1) {
    for (let x = 0; x < Number(data.w || 0); x += 1) {
      const special = String(data.specialMap?.[y]?.[x] || "");
      const icon = SPECIAL_TERRAIN_ICONS[special];
      if (!icon) continue;

      const center = tileCenter(x, y);
      const label = scene.add.text(center.x, center.y, icon.symbol, {
        fontSize: "18px",
        fontStyle: "bold",
        color: "#fff4cf",
        stroke: "#071014",
        strokeThickness: 4,
        align: "center"
      })
        .setOrigin(0.5)
        .setName(`v39-special-icon:${special}:${x},${y}`);

      label.setData("specialTerrain", special);
      label.setData("imageCandidate", icon.imageCandidate === true);
      container.add(label);
    }
  }
}

function install() {
  window.addEventListener("v39:field-generated", () => {
    window.setTimeout(renderSpecialTerrainIcons, 0);
  });

  window.renderV39TerrainIcons = renderSpecialTerrainIcons;
  window.getV39TerrainIconDefinitions = () => ({
    ...SPECIAL_TERRAIN_ICONS
  });
  window.getV39TerrainImageIconCandidates = () => Object.entries(SPECIAL_TERRAIN_ICONS)
    .filter(([, value]) => value.imageCandidate)
    .map(([terrain, value]) => ({ terrain, temporarySymbol: value.symbol }));

  if (window.__v39FieldRuntime?.mapData) {
    window.setTimeout(renderSpecialTerrainIcons, 0);
  }
}

install();
