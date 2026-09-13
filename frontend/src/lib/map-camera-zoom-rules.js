// 最大ズームは、ユーザーが表示設定で指定する基準倍率と、
// 生成マップの大きさから算出する自動倍率の大きい方を採用する。
// 大きいマップでも最大ズーム時の1タイルが極端に小さくならないようにする。
export const MAP_CAMERA_ZOOM_RULES = Object.freeze({
  defaultUserMaxFactor: 16,
  minUserMaxFactor: 8,
  maxUserMaxFactor: 64,
  standardMapSize: 36,
  standardAutoFactor: 16,
  autoFactorPerExtraTile: 0.7,
  maxAutoFactor: 56
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeUserMaxZoomFactor(value) {
  const n = Number(value);
  return clamp(
    Number.isFinite(n) ? Math.round(n) : MAP_CAMERA_ZOOM_RULES.defaultUserMaxFactor,
    MAP_CAMERA_ZOOM_RULES.minUserMaxFactor,
    MAP_CAMERA_ZOOM_RULES.maxUserMaxFactor
  );
}

export function resolveAutoMaxZoomFactor(w, h) {
  const mapSize = Math.max(1, Number(w) || 1, Number(h) || 1);
  const extraTiles = Math.max(0, mapSize - MAP_CAMERA_ZOOM_RULES.standardMapSize);
  return clamp(
    Math.ceil(MAP_CAMERA_ZOOM_RULES.standardAutoFactor + (extraTiles * MAP_CAMERA_ZOOM_RULES.autoFactorPerExtraTile)),
    MAP_CAMERA_ZOOM_RULES.standardAutoFactor,
    MAP_CAMERA_ZOOM_RULES.maxAutoFactor
  );
}

export function resolveEffectiveMaxZoomFactor({ w, h, userMaxZoomFactor } = {}) {
  return Math.max(
    normalizeUserMaxZoomFactor(userMaxZoomFactor),
    resolveAutoMaxZoomFactor(w, h)
  );
}
