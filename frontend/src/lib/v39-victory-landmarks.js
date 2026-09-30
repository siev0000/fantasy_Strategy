import { getGameDataRows } from "./game-data-registry.js";
import { V39_VICTORY_LANDMARK_BALANCE } from "./v39-gameplay-balance.js";
import { getHexDistance, getHexNeighborCoords } from "./hex-grid.js";

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

function valueByMapSize(rows, maxSide, fallback) {
  return (rows || []).find(row => maxSide <= number(row?.maxSide, Infinity))?.count ?? fallback;
}

function configuredCandidateCount(mapData, options) {
  if (Number.isFinite(Number(options?.count))) return Math.max(0, Math.floor(Number(options.count)));
  const maxSide = Math.max(1, Math.floor(number(mapData?.w)), Math.floor(number(mapData?.h)));
  return Math.max(1, Math.floor(valueByMapSize(
    V39_VICTORY_LANDMARK_BALANCE.candidateCountByMapMaxSide,
    maxSide,
    1
  )));
}

function configuredMinimumRegionSize(mapData) {
  const maxSide = Math.max(1, Math.floor(number(mapData?.w)), Math.floor(number(mapData?.h)));
  return Math.max(1, Math.floor(valueByMapSize(
    V39_VICTORY_LANDMARK_BALANCE.minimumRegionTilesByMapMaxSide,
    maxSide,
    1
  )));
}

function terrainRegions(mapData, terrainNames) {
  const width = Math.max(0, Math.floor(number(mapData?.w)));
  const height = Math.max(0, Math.floor(number(mapData?.h)));
  const allowed = new Set(terrainNames);
  const regionSizeByTile = new Map();
  const visited = new Set();
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const firstKey = coordKey(x, y);
    if (visited.has(firstKey) || !allowed.has(text(mapData?.grid?.[y]?.[x]))) continue;
    const region = [];
    const queue = [{ x, y, key:firstKey }];
    visited.add(firstKey);
    while (queue.length) {
      const tile = queue.shift();
      region.push(tile);
      for (const neighbor of getHexNeighborCoords(width, height, tile.x, tile.y, mapData?.worldWrapEnabled === true)) {
        if (visited.has(neighbor.key) || !allowed.has(text(mapData?.grid?.[neighbor.y]?.[neighbor.x]))) continue;
        visited.add(neighbor.key);
        queue.push(neighbor);
      }
    }
    for (const tile of region) regionSizeByTile.set(tile.key, region.length);
  }
  return regionSizeByTile;
}

function startPositions(options) {
  return (Array.isArray(options?.startPositions) ? options.startPositions : [])
    .map(position => ({ x:Math.floor(number(position?.x, Number.NaN)), y:Math.floor(number(position?.y, Number.NaN)) }))
    .filter(position => Number.isFinite(position.x) && Number.isFinite(position.y));
}

function nearestStartDistance(tile, starts) {
  if (!starts.length) return Infinity;
  return Math.min(...starts.map(start => getHexDistance(tile, start)));
}

function heightLevel(mapData, tile) {
  const level = Number(mapData?.heightLevelMap?.[tile.y]?.[tile.x]);
  return Number.isFinite(level) ? level : 0;
}

function elevationMatches(mapData, tile, profile) {
  const mode = text(profile?.elevation) || "any";
  const level = heightLevel(mapData, tile);
  if (mode === "high") return level >= number(V39_VICTORY_LANDMARK_BALANCE.highElevationLevel, 2);
  if (mode === "low") return level <= number(V39_VICTORY_LANDMARK_BALANCE.lowElevationLevel, -1);
  return true;
}

function elevationPriority(tile, profile) {
  const mode = text(profile?.elevation) || "any";
  if (mode === "high") return number(tile?.heightLevel);
  if (mode === "low") return -number(tile?.heightLevel);
  return 0;
}

function definitionProfile(definition) {
  return V39_VICTORY_LANDMARK_BALANCE.terrainPlacementProfiles?.[definition?.id] || { elevation:"any" };
}

function orderedTerrainGroups(definition) {
  const primary = text(definition?.terrainNames?.[0]);
  const fallback = text(definition?.terrainNames?.[1]);
  // 黄昏の樹は広い森林そのものを条件にする。平地への代替配置は難所にならないため使わない。
  if (text(definition?.id) === "勝利対象:黄昏の樹") return primary ? [[primary]] : [];
  return [[primary], fallback ? [fallback] : []].filter(group => group.length);
}

function tilesWithinRadius(mapData, center, radius) {
  const width = Math.max(0, Math.floor(number(mapData?.w)));
  const height = Math.max(0, Math.floor(number(mapData?.h)));
  const wrap = mapData?.worldWrapEnabled === true;
  const visited = new Map([[center.key || coordKey(center.x, center.y), { x:center.x, y:center.y, key:center.key || coordKey(center.x, center.y) }]]);
  let frontier = [...visited.values()];
  for (let step = 0; step < radius; step += 1) {
    const next = [];
    for (const current of frontier) for (const neighbor of getHexNeighborCoords(width, height, current.x, current.y, wrap)) {
      if (visited.has(neighbor.key)) continue;
      visited.set(neighbor.key, neighbor);
      next.push(neighbor);
    }
    frontier = next;
  }
  return [...visited.values()];
}

function requiredAreaTerrainNames(definition, terrainNames) {
  const landmarkId = text(definition?.id);
  if (landmarkId === "勝利対象:太陽の山") return ["山岳"];
  if (landmarkId === "勝利対象:星の火口") return ["山岳", "火山"];
  if (landmarkId === "勝利対象:黄昏の樹") return ["森"];
  return terrainNames;
}

function hasRequiredLandmarkArea(mapData, tile, definition, terrainNames) {
  const generation = mapData?.victoryLandmarkPlan?.terrainGeneration || {};
  const footprintRadius = Math.max(1, Math.floor(number(generation.landmarkFootprintRadius, 1)));
  const outerRingRadius = Math.max(0, Math.floor(number(generation.requiredOuterRingRadius, 2)));
  const requiredRadius = footprintRadius + outerRingRadius;
  const requiredTileCount = 1 + (3 * requiredRadius * (requiredRadius + 1));
  const area = tilesWithinRadius(mapData, tile, requiredRadius);
  if (area.length !== requiredTileCount) return false;
  const allowed = new Set(requiredAreaTerrainNames(definition, terrainNames));
  return area.every(position => allowed.has(text(mapData?.grid?.[position.y]?.[position.x])));
}

function definitionsForPattern(patternId) {
  const definitions = v39VictoryLandmarkDefinitions();
  const ids = V39_VICTORY_LANDMARK_BALANCE.landmarkIdsByPattern[text(patternId)] || [];
  const preferred = ids.map(id => definitions.find(row => row.id === id)).filter(Boolean);
  const preferredIds = new Set(preferred.map(row => row.id));
  return [...preferred, ...definitions.filter(row => !preferredIds.has(row.id))];
}

// マップ生成前に、今回のワールドへ出す勝利対象と必要地形を確定する。
// 座標は全勢力の初期拠点が決まった後、この計画に沿って決定する。
export function createV39VictoryLandmarkPlan(mapSettings, options = {}) {
  const count = configuredCandidateCount(mapSettings, options);
  const minimumRegionSize = configuredMinimumRegionSize(mapSettings);
  const patternId = text(options?.patternId || mapSettings?.patternId) || "realistic";
  const definitions = definitionsForPattern(patternId).slice(0, count);
  const allDefinitions = v39VictoryLandmarkDefinitions();
  const terrainGeneration = V39_VICTORY_LANDMARK_BALANCE.terrainGeneration || {};
  const mapMaxSide = Math.max(number(mapSettings?.w), number(mapSettings?.h));
  const twilightForestRadius = (terrainGeneration.twilightForestRadiusByMapMaxSide || [])
    .find(row => mapMaxSide <= number(row?.maxSide, Infinity))?.radius;
  const serializeDefinition = definition => ({
    landmarkId:definition.id,
    name:definition.name,
    terrainNames:[...definition.terrainNames],
    profile:{ ...definitionProfile(definition) }
  });
  return {
    version:1,
    patternId,
    count:definitions.length,
    minimumRegionSize,
    highlandRawHeight:number(terrainGeneration.highlandRawHeight, 82),
    supportRegionScale:number(terrainGeneration.supportRegionScale, 1),
    anchorRingRate:number(terrainGeneration.anchorRingRate, 0.28),
    landmarkSeparationRate:number(V39_VICTORY_LANDMARK_BALANCE.landmarkSeparationRate, 0.24),
    terrainGeneration:{
      landmarkFootprintRadius:Math.max(1, Math.floor(number(terrainGeneration.landmarkFootprintRadius, 1))),
      requiredOuterRingRadius:Math.max(0, Math.floor(number(terrainGeneration.requiredOuterRingRadius, 2))),
      sunMountainRadius:Math.max(1, Math.floor(number(terrainGeneration.sunMountainRadius, 3))),
      starMountainRadius:Math.max(1, Math.floor(number(terrainGeneration.starMountainRadius, 3))),
      supportIrregularExtraRadius:Math.max(0, Math.floor(number(terrainGeneration.supportIrregularExtraRadius, 2))),
      compactSupportExtraTileRate:Math.max(0, number(terrainGeneration.compactSupportExtraTileRate, 0.5)),
      heightSlopePerRing:Math.max(1, Math.floor(number(terrainGeneration.heightSlopePerRing, 1))),
      starAdjacentVolcanoCount:Math.max(0, Math.min(6, Math.floor(number(terrainGeneration.starAdjacentVolcanoCount, 3)))),
      twilightForestRadius:Math.max(1, Math.floor(number(twilightForestRadius, 7)))
    },
    // 実際の勝利対象。通常プレイでは発見されるまで公開しない。
    landmarks:definitions.map(serializeDefinition),
    // 本命を地形だけで判別できないよう、全種類の成立地形を毎回生成する。
    terrainCandidates:allDefinitions.map(serializeDefinition)
  };
}

function definitionsFromPlan(mapData, patternId) {
  const plannedIds = (Array.isArray(mapData?.victoryLandmarkPlan?.landmarks) ? mapData.victoryLandmarkPlan.landmarks : [])
    .map(row => text(row?.landmarkId))
    .filter(Boolean);
  if (!plannedIds.length) return definitionsForPattern(patternId);
  const definitions = v39VictoryLandmarkDefinitions();
  return plannedIds.map(id => definitions.find(row => row.id === id)).filter(Boolean);
}

function bestCandidate(mapData, definition, usedKeys, selectedTiles, starts, minimumRegionSize, distanceRate, seed) {
  const profile = definitionProfile(definition);
  const supportRegion = mapData?.victoryTerrainSupport?.regions
    ?.find(row => text(row?.landmarkId) === text(definition?.id) && row?.generated);
  const supportAnchor = supportRegion?.anchor;
  const requiredRegionSize = Number.isFinite(Number(supportRegion?.size))
    ? Math.max(1, Math.floor(Number(supportRegion.size)))
    : minimumRegionSize;
  const maxSide = Math.max(number(mapData?.w), number(mapData?.h));
  const minimumDistance = Math.max(0, Math.ceil(maxSide * distanceRate));
  const minimumSeparation = Math.max(0, Math.ceil(maxSide * number(V39_VICTORY_LANDMARK_BALANCE.landmarkSeparationRate)));
  for (const terrainNames of orderedTerrainGroups(definition)) {
    // 山岳・丘陵・火山は同じ高地帯として連結規模を測る。
    // 実際の配置マス自体は、勝利対象土地.jsonの主地形または代替地形に限定する。
    const regionTerrainNames = profile.elevation === "high" && text(profile?.regionTerrain) !== "target"
      ? [...new Set([...terrainNames, "山岳", "丘陵", "火山"])]
      : terrainNames;
    const regions = terrainRegions(mapData, regionTerrainNames);
    const candidates = matchingTiles(mapData, terrainNames, usedKeys)
      .map(tile => ({
        ...tile,
        regionSize:regions.get(tile.key) || 0,
        heightLevel:heightLevel(mapData, tile),
        startDistance:nearestStartDistance(tile, starts),
        supportDistance:supportAnchor ? getHexDistance(tile, supportAnchor) : 0
      }))
      // 大都市相当の占有7マスと、その外側2リングを同種の成立地形内に確保する。
      .filter(tile => hasRequiredLandmarkArea(mapData, tile, definition, terrainNames))
      .filter(tile => tile.regionSize >= requiredRegionSize)
      .filter(tile => elevationMatches(mapData, tile, profile))
      .filter(tile => tile.startDistance >= minimumDistance)
      .filter(tile => selectedTiles.every(selected => getHexDistance(tile, selected) >= minimumSeparation));
    if (!candidates.length) continue;
    candidates.sort((left, right) => {
      // 距離条件を満たす候補同士では、対象地形に応じた高度の極端さを最優先する。
      // これにより遠いだけの山裾(Lv2)ではなく、高地の頂上や深い海域が選ばれる。
      const leftScore = -left.supportDistance * 100000000 + elevationPriority(left, profile) * 1000000 + left.startDistance * 1000 + left.regionSize * 10 + hashText(`${seed}:${definition.id}:${left.key}`) % 10;
      const rightScore = -right.supportDistance * 100000000 + elevationPriority(right, profile) * 1000000 + right.startDistance * 1000 + right.regionSize * 10 + hashText(`${seed}:${definition.id}:${right.key}`) % 10;
      return rightScore - leftScore || left.key.localeCompare(right.key);
    });
    return candidates[0];
  }
  return null;
}

// 勝利対象は開始地点から遠い、高低差または難地形が連続する地域へ決定的に配置する。
export function generateV39VictoryLandmarks(mapData, options = {}) {
  if (!mapData?.grid) return {};
  const usedKeys = new Set(Array.isArray(options?.reservedTileKeys) ? options.reservedTileKeys.map(text) : []);
  const landmarks = {};
  const plannedCount = Number(mapData?.victoryLandmarkPlan?.count);
  const count = Number.isFinite(plannedCount) ? Math.max(0, Math.floor(plannedCount)) : configuredCandidateCount(mapData, options);
  const starts = startPositions(options);
  const minimumRegionSize = configuredMinimumRegionSize(mapData);
  const selectedTiles = [];
  // 島形状に合う対象を先に評価し、残り枠だけを他の種類で補う。
  const definitions = definitionsFromPlan(mapData, options?.patternId || mapData?.patternId);
  for (const strict of [true, false]) for (const definition of definitions) {
    if (Object.keys(landmarks).length >= count) break;
    if (Object.values(landmarks).some(landmark => landmark.landmarkId === definition.id)) continue;
    const tile = bestCandidate(
      mapData,
      definition,
      usedKeys,
      selectedTiles,
      starts,
      minimumRegionSize,
      strict ? number(V39_VICTORY_LANDMARK_BALANCE.startDistanceRate, 0.38) : number(V39_VICTORY_LANDMARK_BALANCE.relaxedStartDistanceRate, 0.28),
      options.seed || "v39"
    );
    if (!tile) continue;
    usedKeys.add(tile.key);
    selectedTiles.push(tile);
    const footprintRadius = Math.max(1, Math.floor(number(mapData?.victoryLandmarkPlan?.terrainGeneration?.landmarkFootprintRadius, 1)));
    const occupiedTileKeys = new Set([tile.key]);
    let frontier = [{ x:tile.x, y:tile.y }];
    for (let radius = 0; radius < footprintRadius; radius += 1) {
      const next = [];
      for (const current of frontier) for (const neighbor of getHexNeighborCoords(mapData.w, mapData.h, current.x, current.y)) {
        if (occupiedTileKeys.has(neighbor.key)) continue;
        occupiedTileKeys.add(neighbor.key);
        next.push(neighbor);
      }
      frontier = next;
    }
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
      discoveryMethod:definition.discoveryMethod,
      scaleName:"大都市",
      scaleLevel:4,
      footprintRadius,
      occupiedTileKeys:[...occupiedTileKeys],
      placement:{
        regionSize:tile.regionSize,
        heightLevel:tile.heightLevel,
        startDistance:Number.isFinite(tile.startDistance) ? tile.startDistance : null,
        relaxedDistance:strict !== true
      }
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
