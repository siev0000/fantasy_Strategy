import PathfindingWorker from "../workers/pathfindingWorker.js?worker";

function toSafeInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export function createPathfindingWorkerClient() {
  let worker = null;
  let requestId = 0;
  const pending = new Map();
  const mapIdByRef = new WeakMap();
  let mapSequence = 0;
  let lastSyncedMapId = "";
  let terminated = false;

  function ensureWorker() {
    if (terminated) return null;
    if (worker) return worker;
    if (typeof Worker === "undefined") return null;
    worker = new PathfindingWorker();
    worker.onmessage = event => {
      const payload = event?.data || {};
      const id = payload.id;
      if (!pending.has(id)) return;
      const handlers = pending.get(id);
      pending.delete(id);
      if (payload.ok) {
        handlers.resolve(payload.result || {});
      } else {
        handlers.reject(new Error(payload.error || "Pathfinding worker error"));
      }
    };
    worker.onerror = error => {
      for (const handlers of pending.values()) {
        handlers.reject(error instanceof Error ? error : new Error("Pathfinding worker runtime error"));
      }
      pending.clear();
    };
    return worker;
  }

  function postWorkerAction(action, payload, timeoutMs = 10000) {
    const target = ensureWorker();
    if (!target) {
      return Promise.reject(new Error("Pathfinding worker is unavailable in this environment."));
    }
    const id = ++requestId;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error(`Pathfinding worker timeout: ${action}`));
      }, Math.max(1000, toSafeInt(timeoutMs, 10000)));
      pending.set(id, {
        resolve: value => {
          window.clearTimeout(timer);
          resolve(value);
        },
        reject: error => {
          window.clearTimeout(timer);
          reject(error);
        }
      });
      target.postMessage({ id, action, payload });
    });
  }

  function resolveMapId(data) {
    if (!data || typeof data !== "object") return "";
    let mapId = mapIdByRef.get(data);
    if (!mapId) {
      mapSequence += 1;
      mapId = `map-${mapSequence}`;
      mapIdByRef.set(data, mapId);
    }
    return mapId;
  }

  async function ensureMapDataSynced(data) {
    if (!data?.grid || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return "";
    const mapId = resolveMapId(data);
    if (!mapId) return "";
    if (lastSyncedMapId === mapId) return mapId;
    await postWorkerAction("setMapData", {
      mapId,
      mapData: {
        w: toSafeInt(data.w, 0),
        h: toSafeInt(data.h, 0),
        grid: data.grid,
        heightLevelMap: data.heightLevelMap,
        worldWrapEnabled: !!data.worldWrapEnabled
      }
    }, 20000);
    lastSyncedMapId = mapId;
    return mapId;
  }

  async function findPathWithinDistance(data, sx, sy, tx, ty, maxDistance) {
    const mapId = await ensureMapDataSynced(data);
    if (!mapId) return null;
    const result = await postWorkerAction("findPathWithinDistance", {
      mapId,
      sx: toSafeInt(sx, 0),
      sy: toSafeInt(sy, 0),
      tx: toSafeInt(tx, 0),
      ty: toSafeInt(ty, 0),
      maxDistance: toSafeInt(maxDistance, 0)
    }, 10000);
    return Array.isArray(result?.path) ? result.path : null;
  }

  async function buildReachableTileSet(data, sx, sy, maxDistance) {
    const mapId = await ensureMapDataSynced(data);
    if (!mapId) return [];
    const result = await postWorkerAction("buildReachableTileSet", {
      mapId,
      sx: toSafeInt(sx, 0),
      sy: toSafeInt(sy, 0),
      maxDistance: toSafeInt(maxDistance, 0)
    }, 10000);
    return Array.isArray(result?.reachableKeys) ? result.reachableKeys : [];
  }

  function resetMapCache() {
    lastSyncedMapId = "";
  }

  function dispose() {
    terminated = true;
    lastSyncedMapId = "";
    for (const handlers of pending.values()) {
      handlers.reject(new Error("Pathfinding worker client disposed."));
    }
    pending.clear();
    if (worker) {
      worker.terminate();
      worker = null;
    }
  }

  return {
    ensureMapDataSynced,
    findPathWithinDistance,
    buildReachableTileSet,
    resetMapCache,
    dispose
  };
}
