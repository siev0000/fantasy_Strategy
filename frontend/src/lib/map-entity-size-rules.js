import { HEX_TILE_CONFIG } from "./phaser-map-panel-config.js";

// マップ上オブジェクトの大きさはタイル寸法を基準にする。
// 拠点は全体表示時にも判別できるよう最低画面サイズを保証するが、
// ユニットは独立した逆ズーム補正を行わず、タイルと同じ倍率で拡大縮小する。
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
    // 1ユニットは1タイル内をほぼいっぱいに使う。
    // 選択状態でも大きさは変えず、枠線だけで区別する。
    diameterTiles: 1.0,
    glyphFontTiles: 0.36
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

// 拠点など「全体表示でも最低限読める必要があるもの」専用。
// ユニットには使用しない。
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
