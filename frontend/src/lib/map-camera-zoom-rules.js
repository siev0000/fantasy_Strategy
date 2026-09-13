// フィールドのズーム上限は「全体表示倍率の何倍か」だけで決めない。
// 大きいマップでも、最大ズーム時には1タイルを十分な画面サイズまで拡大できることを保証する。
export const MAP_CAMERA_ZOOM_RULES = Object.freeze({
  defaultMaxFactor: 16,
  minMaxFactor: 6,
  maxMaxFactor: 32,
  targetMaxTileScreenWidthPx: 240
});

export function resolveMapMaxZoom({ fitZoom, maxZoomFactor, tileWidth }) {
  const fit = Math.max(0.0001, Number(fitZoom) || 0.0001);
  const factor = Math.max(1, Number(maxZoomFactor) || MAP_CAMERA_ZOOM_RULES.defaultMaxFactor);
  const width = Math.max(1, Number(tileWidth) || 1);
  const factorBasedZoom = fit * factor;
  const tileDetailZoom = MAP_CAMERA_ZOOM_RULES.targetMaxTileScreenWidthPx / width;
  return Math.max(fit, factorBasedZoom, tileDetailZoom);
}
