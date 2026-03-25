function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function coordKey(x, y) {
  return `${x},${y}`;
}

function normalizeWrappedCoord(value, size) {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return 0;
  const mod = value % size;
  return mod < 0 ? mod + size : mod;
}

function getHexNeighborCoordsBySize(w, h, x, y, worldWrapEnabled = false) {
  const isOddRow = y % 2 === 1;
  const deltas = isOddRow
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  const result = [];
  const seen = new Set();
  for (const [dx, dy] of deltas) {
    let nx = x + dx;
    let ny = y + dy;
    if (worldWrapEnabled) {
      nx = normalizeWrappedCoord(nx, w);
      ny = normalizeWrappedCoord(ny, h);
    } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
      continue;
    }
    const key = coordKey(nx, ny);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x: nx, y: ny });
  }
  return result;
}

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function tileHeightLevel(mapData, x, y) {
  const raw = mapData?.heightLevelMap?.[y]?.[x];
  return Number.isFinite(raw) ? Math.floor(raw) : null;
}

function movementStepCost(mapData, fromX, fromY, toX, toY) {
  const fromLevel = tileHeightLevel(mapData, fromX, fromY);
  const toLevel = tileHeightLevel(mapData, toX, toY);
  const extraCost = Number.isFinite(fromLevel) && Number.isFinite(toLevel) && fromLevel !== toLevel
    ? 1
    : 0;
  return 1 + extraCost;
}

function findPathWithinDistance(mapData, sx, sy, tx, ty, maxDistance) {
  if (!mapData?.grid) return null;
  const w = toSafeInt(mapData.w, 0);
  const h = toSafeInt(mapData.h, 0);
  if (!w || !h) return null;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || !Number.isFinite(tx) || !Number.isFinite(ty)) return null;
  if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
  if (!isPassableTerrain(mapData.grid[ty]?.[tx])) return null;
  const safeDistance = Math.max(0, toSafeInt(maxDistance, 0));
  const startKey = coordKey(sx, sy);
  const targetKey = coordKey(tx, ty);
  if (startKey === targetKey) return [{ x: sx, y: sy }];

  const worldWrapEnabled = !!mapData.worldWrapEnabled;
  const minCostByKey = new Map();
  minCostByKey.set(startKey, 0);
  const parentByKey = new Map();
  const queue = [{ x: sx, y: sy, cost: 0 }];
  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [cur] = queue.splice(minIndex, 1);
    if (!cur || cur.cost > safeDistance) continue;
    const currentKey = coordKey(cur.x, cur.y);
    const currentBest = minCostByKey.get(currentKey);
    if (Number.isFinite(currentBest) && cur.cost > currentBest) continue;
    const neighbors = getHexNeighborCoordsBySize(w, h, cur.x, cur.y, worldWrapEnabled);
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (!isPassableTerrain(mapData.grid[n.y]?.[n.x])) continue;
      const stepCost = movementStepCost(mapData, cur.x, cur.y, n.x, n.y);
      const nextCost = cur.cost + stepCost;
      if (nextCost > safeDistance) continue;
      const best = minCostByKey.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      minCostByKey.set(key, nextCost);
      parentByKey.set(key, currentKey);
      if (key === targetKey) {
        const path = [{ x: tx, y: ty }];
        let cursor = targetKey;
        while (cursor !== startKey) {
          const prev = parentByKey.get(cursor);
          if (!prev) break;
          const [px, py] = prev.split(",").map(Number);
          path.push({ x: px, y: py });
          cursor = prev;
        }
        path.reverse();
        return path;
      }
      queue.push({ x: n.x, y: n.y, cost: nextCost });
    }
  }
  return null;
}

function buildReachableTileSet(mapData, sx, sy, maxDistance) {
  const reachable = [];
  if (!mapData?.grid) return reachable;
  const w = toSafeInt(mapData.w, 0);
  const h = toSafeInt(mapData.h, 0);
  if (!w || !h) return reachable;
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx >= w || sy >= h) return reachable;
  const safeDistance = Math.max(0, toSafeInt(maxDistance, 0));
  const startKey = coordKey(sx, sy);
  const worldWrapEnabled = !!mapData.worldWrapEnabled;
  const minCostByKey = new Map();
  minCostByKey.set(startKey, 0);
  const queue = [{ x: sx, y: sy, cost: 0 }];
  const outSet = new Set([startKey]);
  while (queue.length) {
    let minIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].cost < queue[minIndex].cost) minIndex = i;
    }
    const [cur] = queue.splice(minIndex, 1);
    if (!cur || cur.cost > safeDistance) continue;
    const neighbors = getHexNeighborCoordsBySize(w, h, cur.x, cur.y, worldWrapEnabled);
    for (const n of neighbors) {
      const key = coordKey(n.x, n.y);
      if (!isPassableTerrain(mapData.grid[n.y]?.[n.x])) continue;
      const stepCost = movementStepCost(mapData, cur.x, cur.y, n.x, n.y);
      const nextCost = cur.cost + stepCost;
      if (nextCost > safeDistance) continue;
      const best = minCostByKey.get(key);
      if (Number.isFinite(best) && best <= nextCost) continue;
      minCostByKey.set(key, nextCost);
      outSet.add(key);
      queue.push({ x: n.x, y: n.y, cost: nextCost });
    }
  }
  return Array.from(outSet);
}

const mapDataStore = new Map();

self.onmessage = event => {
  const payload = event?.data || {};
  const id = payload.id;
  const action = String(payload.action || "");
  const body = payload.payload || {};
  try {
    if (action === "setMapData") {
      const mapId = String(body.mapId || "");
      if (!mapId) throw new Error("mapId is required.");
      mapDataStore.set(mapId, {
        w: toSafeInt(body.mapData?.w, 0),
        h: toSafeInt(body.mapData?.h, 0),
        grid: Array.isArray(body.mapData?.grid) ? body.mapData.grid : [],
        heightLevelMap: Array.isArray(body.mapData?.heightLevelMap) ? body.mapData.heightLevelMap : [],
        worldWrapEnabled: !!body.mapData?.worldWrapEnabled
      });
      self.postMessage({ id, ok: true, result: { mapId } });
      return;
    }
    if (action === "findPathWithinDistance") {
      const mapId = String(body.mapId || "");
      const mapData = mapDataStore.get(mapId);
      if (!mapData) throw new Error(`map data not found: ${mapId}`);
      const path = findPathWithinDistance(
        mapData,
        toSafeInt(body.sx, 0),
        toSafeInt(body.sy, 0),
        toSafeInt(body.tx, 0),
        toSafeInt(body.ty, 0),
        toSafeInt(body.maxDistance, 0)
      );
      self.postMessage({ id, ok: true, result: { path } });
      return;
    }
    if (action === "buildReachableTileSet") {
      const mapId = String(body.mapId || "");
      const mapData = mapDataStore.get(mapId);
      if (!mapData) throw new Error(`map data not found: ${mapId}`);
      const reachableKeys = buildReachableTileSet(
        mapData,
        toSafeInt(body.sx, 0),
        toSafeInt(body.sy, 0),
        toSafeInt(body.maxDistance, 0)
      );
      self.postMessage({ id, ok: true, result: { reachableKeys } });
      return;
    }
    throw new Error(`unsupported action: ${action}`);
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error || "Worker error")
    });
  }
};
