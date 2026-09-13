import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// マップ上の重要オブジェクトは「固定px」ではなくタイル寸法を基準にする。
// タイル自体が小さく見えるズーム域では、重要情報だけ最低画面pxを保証する。
// これにより HEX_TILE_CONFIG を変更しても、拠点・ユニット等の見た目比率が追従する。
export const MAP_ENTITY_SIZE_RULES = Object.freeze({
  base: Object.freeze({
    diameterTiles: 1.15,
    iconTiles: 0.72,
    labelFontTiles: 0.30,
    labelOffsetTiles: 0.62,
    minScreenDiameterPx: 48,
    minScreenFontPx: 16
  }),
  unit: Object.freeze({
    diameterTiles: 1.0,
    selectedDiameterTiles: 1.08,
    glyphFontTiles: 0.36,
    minScreenDiameterPx: 24,
    minScreenFontPx: 11
  }),
  cluster: Object.freeze({
    offsetTilesSmall: 0.38,
    offsetTilesLarge: 0.46
  }),
  scale: Object.freeze({
    min: 1,
    max: 24
  })
});

export function mapTileReferencePx() {
  return Math.max(1, Number(HEX_TILE_CONFIG?.width) || 40);
}

export function tileRelativePx(tileRatio) {
  return mapTileReferencePx() * Math.max(0, Number(tileRatio) || 0);
}

export function readableEntityScale(scene, {
  worldDiameterPx = 0,
  worldFontPx = 0,
  minScreenDiameterPx = 0,
  minScreenFontPx = 0
} = {}) {
  const zoom = Number(scene?.cameras?.main?.zoom);
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;

  const diameterScale = worldDiameterPx > 0 && minScreenDiameterPx > 0
    ? minScreenDiameterPx / (worldDiameterPx * zoom)
    : 1;
  const fontScale = worldFontPx > 0 && minScreenFontPx > 0
    ? minScreenFontPx / (worldFontPx * zoom)
    : 1;
  const required = Math.max(1, diameterScale, fontScale);
  return Math.max(
    MAP_ENTITY_SIZE_RULES.scale.min,
    Math.min(MAP_ENTITY_SIZE_RULES.scale.max, required)
  );
}
