import { getGameDataRows } from "./game-data-registry.js";
import { V39_VICTORY_LANDMARK_BALANCE } from "./v39-gameplay-balance.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function terrainCandidates(row) {
  return [text(row?.配置地形), text(row?.代替地形)].filter(Boolean);
}

export function v39VictoryLandmarkDefinitions() {
  return getGameDataRows("勝利対象土地")
    .filter(row => text(row?.ID) && text(row?.名称) && terrainCandidates(row).length)
    .map(row => ({
      id:text(row.ID),
      name:text(row.名称),
      terrainNames:terrainCandidates(row),
      detail:text(row?.詳細),
      discoveryMethod:text(row?.発見方法) || "調査",
      source:row
    }));
}

function matchingTiles(mapData, terrainNames, usedKeys) {
  const tiles = [];
  for (let y = 0; y < number(mapData?.h); y += 1) for (let x = 0; x < number(mapData?.w); x += 1) {
    const key = coordKey(x, y);
    const terrain = text(mapData?.grid?.[y]?.[x]);
    if (usedKeys.has(key) || !terrainNames.includes(terrain)) continue;
    tiles.push({ x, y, key, terrain });
  }
  return tiles;
}

function definitionsForPattern(patternId) {
  const definitions = v39VictoryLandmarkDefinitions();
  const ids = V39_VICTORY_LANDMARK_BALANCE.landmarkIdsByPattern[text(patternId)] || [];
  const preferred = ids.map(id => definitions.find(row => row.id === id)).filter(Boolean);
  return preferred.length ? preferred : definitions;
}

// The table row chooses suitable terrain; this function only makes the result deterministic per map.
export function generateV39VictoryLandmarks(mapData, options = {}) {
  if (!mapData?.grid) return {};
  const usedKeys = new Set(Array.isArray(options?.reservedTileKeys) ? options.reservedTileKeys.map(text) : []);
  const landmarks = {};
  const count = Math.max(0, Math.floor(number(options?.count, V39_VICTORY_LANDMARK_BALANCE.landmarkCount)));
  const definitions = definitionsForPattern(options?.patternId || mapData?.patternId)
    .sort((left, right) => hashText(`${options.seed || "v39"}:${options?.patternId || mapData?.patternId}:${left.id}`) - hashText(`${options.seed || "v39"}:${options?.patternId || mapData?.patternId}:${right.id}`));
  for (const definition of definitions) {
    if (Object.keys(landmarks).length >= count) break;
    const candidates = matchingTiles(mapData, definition.terrainNames, usedKeys);
    if (!candidates.length) continue;
    candidates.sort((left, right) => hashText(`${options.seed || "v39"}:${definition.id}:${left.key}`) - hashText(`${options.seed || "v39"}:${definition.id}:${right.key}`));
    const tile = candidates[0];
    usedKeys.add(tile.key);
    landmarks[tile.key] = {
      id:`landmark:${definition.id}:${tile.key}`,
      kind:"victory-landmark",
      key:tile.key,
      x:tile.x,
      y:tile.y,
      terrain:tile.terrain,
      landmarkId:definition.id,
      featureId:definition.id,
      featureName:definition.name,
      name:definition.name,
      detail:definition.detail,
      discoveryMethod:definition.discoveryMethod
    };
  }
  return landmarks;
}

export function getV39VictoryLandmarkDefinition(landmarkId) {
  return v39VictoryLandmarkDefinitions().find(row => row.id === text(landmarkId)) || null;
}

export function isV39VictoryLandmark(site) {
  return text(site?.kind) === "victory-landmark";
}
