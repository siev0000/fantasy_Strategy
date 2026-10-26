import { getHexNeighborCoords } from "./hex-grid.js";
import { v39HexRay } from "./v39-combat-ray.js";

function coordKey(x, y) {
  return `${x},${y}`;
}

function toSafeInt(value, fallback = 0) {
  const raw = Number(value);
  return Number.isFinite(raw) ? Math.floor(raw) : fallback;
}

export function resolveV39FieldHeightLevel(mapData, x, y) {
  const raw = mapData?.heightLevelMap?.[y]?.[x];
  return Number.isFinite(raw) ? Math.floor(raw) : null;
}

// フィールド表示用LOS。目的マス自身は遮蔽物にせず、途中の高度だけを判定する。
// 始点→終点の視線高度を線形補間し、中間マスがその線より高ければ奥を隠す（同高度は遮らない）。
export function isV39FieldVisionPathClear(mapData, from, to) {
  if (!mapData?.grid || !from || !to) return false;
  const sx = toSafeInt(from.x, Number.NaN);
  const sy = toSafeInt(from.y, Number.NaN);
  const tx = toSafeInt(to.x, Number.NaN);
  const ty = toSafeInt(to.y, Number.NaN);
  if (![sx, sy, tx, ty].every(Number.isFinite)) return false;
  if (sx === tx && sy === ty) return true;

  const sourceHeight = resolveV39FieldHeightLevel(mapData, sx, sy);
  const targetHeight = resolveV39FieldHeightLevel(mapData, tx, ty);
  if (sourceHeight == null || targetHeight == null) return true;

  const ray = v39HexRay(mapData, { x: sx, y: sy }, { x: tx, y: ty });
  if (!ray.length) return false;
  const last = ray[ray.length - 1];
  if (last.x !== tx || last.y !== ty) return false;

  const stepCount = ray.length;
  for (let index = 0; index < stepCount - 1; index += 1) {
    const tile = ray[index];
    const tileHeight = resolveV39FieldHeightLevel(mapData, tile.x, tile.y);
    if (tileHeight == null) continue;
    const progress = (index + 1) / stepCount;
    const sightHeight = sourceHeight + ((targetHeight - sourceHeight) * progress);
    if (tileHeight > sightHeight) return false;
  }
  return true;
}

// 指定半径内を候補化したうえで、各マスを始点からの高さLOSで絞り込む。
// 索敵値や敵発見判定には触れず、フィールドFog/地形表示だけに利用する。
export function addV39FieldVisionRangeKeys(mapData, sx, sy, range, outSet) {
  if (!mapData?.grid || !(outSet instanceof Set)) return outSet;
  const x = toSafeInt(sx, Number.NaN);
  const y = toSafeInt(sy, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return outSet;
  if (x < 0 || y < 0 || x >= mapData.w || y >= mapData.h) return outSet;

  const safeRange = Math.max(0, toSafeInt(range, 0));
  const startKey = coordKey(x, y);
  outSet.add(startKey);
  if (safeRange <= 0) return outSet;

  const visited = new Set([startKey]);
  const queue = [{ x, y, d: 0 }];
  while (queue.length) {
    const current = queue.shift();
    if (!current || current.d >= safeRange) continue;
    const neighbors = getHexNeighborCoords(
      mapData.w,
      mapData.h,
      current.x,
      current.y,
      mapData.worldWrapEnabled === true
    );
    for (const next of neighbors) {
      if (visited.has(next.key)) continue;
      visited.add(next.key);
      const distance = current.d + 1;
      if (isV39FieldVisionPathClear(mapData, { x, y }, next)) {
        outSet.add(next.key);
      }
      if (distance < safeRange) queue.push({ x: next.x, y: next.y, d: distance });
    }
  }
  return outSet;
}
