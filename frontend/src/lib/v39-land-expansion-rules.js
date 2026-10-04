import { V39_LAND_EXPANSION_BALANCE } from "./v39-gameplay-balance.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import { getFactionSettlementById, replaceFactionSettlement, territorySettlementId, normalizeTerritoryStateRecord } from "./settlement-state.js";
import { resolveV39TileTerrainName } from "./v39-terrain-traversal.js";

const text = value => String(value ?? "").trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const keyOf = tile => `${tile.x},${tile.y}`;
const alive = unit => number(unit.hp ?? unit.currentHp) > 0 && unit.state !== "死亡";
const wrap = map => map?.worldWrapEnabled !== false;
const neighbors = (map, tile) => getHexNeighborCoords(map.w, map.h, tile.x, tile.y, wrap(map));
const tileOf = key => { const [x,y] = key.split(",").map(Number); return { x,y }; };

function territoryKeys(state, playerId, settlement) {
  return new Set(Object.entries(state.territoryOwnerByTile || {}).filter(([key, owner]) => {
    const record = state.territoryStateByTile?.[key];
    const assigned = territorySettlementId(record);
    return owner === playerId && (!assigned || assigned === settlement.settlementId)
      && record?.raided !== true && number(record?.hp ?? 100) > 0;
  }).map(([key]) => key));
}

function waterKeys(state, playerId, settlement, map, owned) {
  const keys = new Set();
  for (const [key, names] of Object.entries(settlement.tileFacilityMap || {})) {
    if (!owned.has(key)) continue;
    for (const name of names) {
      const radius = V39_LAND_EXPANSION_BALANCE.waterRanges[name];
      const facility = settlement.facilityStateByTile?.[key]?.[name];
      if (!radius || (facility && number(facility.hp) <= 0)) continue;
      let frontier = [tileOf(key)];
      const seen = new Set([key]);
      for (let step = 0; step < radius; step += 1) {
        const next = [];
        for (const tile of frontier) for (const neighbor of neighbors(map, tile)) {
          if (seen.has(neighbor.key)) continue;
          seen.add(neighbor.key); next.push(neighbor);
          if (["海", "湖"].includes(resolveV39TileTerrainName(map, neighbor.x, neighbor.y))) keys.add(neighbor.key);
        }
        frontier = next;
      }
    }
  }
  return keys;
}

export function inspectV39LandExpansion(state, playerId, settlementId, tile, map, options = {}) {
  const player = state?.players?.find(row => row.id === playerId);
  const settlement = getFactionSettlementById(player?.factionState, settlementId);
  const key = keyOf(tile || {});
  let reason = "";
  if (!map || !settlement?.placed || !Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)
    || tile.x < 0 || tile.y < 0 || tile.x >= map.w || tile.y >= map.h) reason = "開拓する土地を選択してください";
  else if (state.territoryOwnerByTile?.[key]) reason = "すでに領有されている土地です";
  else if ((state.neutralVillages || []).some(row => keyOf(row) === key || row.territoryTileKeys?.includes(key))) reason = "一般村は通常の開拓では取得できません";
  else if (Object.values(state.victoryLandmarksByTile || {}).some(row => keyOf(row) === key || row.occupiedTileKeys?.includes(key))) reason = "勝利対象土地は専用の獲得条件が必要です";
  else if ([...(state.enemies || []), ...(state.neutralVillages || []).flatMap(row => row.defenseUnits || row.units || []),
    ...(state.players || []).filter(row => row.id !== playerId).flatMap(row => row.factionState?.units || [])]
    .some(unit => alive(unit) && keyOf(unit) === key)) reason = "対象マスに生存モンスター・他勢力ユニットがいます";
  if (!reason) {
    const explored = player.factionState.visibility?.exploredTileKeys;
    if (Array.isArray(explored) && !explored.includes(key)) reason = "未探索の土地です";
  }
  if (!reason) {
    const owned = territoryKeys(state, playerId, settlement);
    const water = ["海", "湖"].includes(resolveV39TileTerrainName(map, tile.x, tile.y));
    if (water ? !waterKeys(state, playerId, settlement, map, owned).has(key)
      : !neighbors(map, tile).some(row => owned.has(row.key))) reason = water
      ? "船着き場の周囲1マス・港の周囲2マスが必要です" : "この拠点の自領に隣接していません";
  }
  const projects = Array.isArray(settlement?.landExpansionProjects) ? settlement.landExpansionProjects : [];
  const workers = options.project?.workers ?? V39_LAND_EXPANSION_BALANCE.workers;
  if (!reason && number(settlement.population) < workers) reason = "開拓担当人数が不足しています";
  if (!reason && !options.project) {
    if (projects.length >= V39_LAND_EXPANSION_BALANCE.maxProjects) reason = "この拠点はすでに開拓中です";
    else if ((state.players || []).some(row => (row.factionState?.settlements || [])
      .some(base => base.landExpansionProjects?.some(project => project.tileKey === key)))) reason = "この土地はすでに開拓中です";
  }
  return { ok:!reason, reason, key, settlement, player, workers, totalTurns:V39_LAND_EXPANSION_BALANCE.turns };
}

export function getV39LandExpansionCandidates(state, playerId, settlementId, map) {
  const player = state?.players?.find(row => row.id === playerId);
  const settlement = getFactionSettlementById(player?.factionState, settlementId);
  if (!settlement?.placed || !map) return [];
  const owned = territoryKeys(state, playerId, settlement);
  const candidates = new Set(waterKeys(state, playerId, settlement, map, owned));
  for (const key of owned) for (const neighbor of neighbors(map, tileOf(key))) candidates.add(neighbor.key);
  return [...candidates].map(tileOf).filter(tile => inspectV39LandExpansion(state, playerId, settlementId, tile, map).ok);
}

export function startV39LandExpansion(state, playerId, settlementId, tile, map) {
  const check = inspectV39LandExpansion(state, playerId, settlementId, tile, map);
  if (!check.ok) return { ...check, state };
  const project = { tileKey:check.key, workers:check.workers, remainingTurns:check.totalTurns,
    totalTurns:check.totalTurns, startedTurn:state.timeline?.turnNumber || 1 };
  const settlement = { ...check.settlement, landExpansionProjects:[...(check.settlement.landExpansionProjects || []), project] };
  return { ok:true, state:{ ...state, players:state.players.map(player => player.id !== playerId ? player : {
    ...player, factionState:replaceFactionSettlement(player.factionState, settlement, { ownerPlayerId:playerId })
  }) }, project };
}

export function reservedV39LandExpansionWorkers(state, player, settlement, map) {
  return (settlement.landExpansionProjects || []).reduce((sum, project) => {
    // 最新人口・施設・敵位置で判定し、停止中の担当者はそのターンの生産へ戻す。
    const probePlayer = { ...player, factionState:replaceFactionSettlement(player.factionState, settlement, { ownerPlayerId:player.id }) };
    const check = inspectV39LandExpansion({ ...state, players:state.players.map(row => row.id === player.id ? probePlayer : row) },
      player.id, settlement.settlementId, tileOf(project.tileKey), map, { project });
    return sum + (check.ok ? number(project.workers) : 0);
  }, 0);
}

export function advanceV39LandExpansionProjects(state, player, settlement, map) {
  const probePlayer = { ...player, factionState:replaceFactionSettlement(player.factionState, settlement, { ownerPlayerId:player.id }) };
  const probeState = { ...state, players:state.players.map(row => row.id === player.id ? probePlayer : row) };
  const projects = [], completed = [];
  const modes = { ...(settlement.territoryTileModeMap || {}) };
  for (const project of settlement.landExpansionProjects || []) {
    const check = inspectV39LandExpansion(probeState, player.id, settlement.settlementId, tileOf(project.tileKey), map, { project });
    if (!check.ok) { projects.push({ ...project, paused:true, reason:check.reason }); continue; }
    const remainingTurns = Math.max(0, project.remainingTurns - 1);
    if (remainingTurns) projects.push({ ...project, remainingTurns, paused:false, reason:"" });
    else {
      state.territoryOwnerByTile[project.tileKey] = player.id;
      state.territoryStateByTile[project.tileKey] = normalizeTerritoryStateRecord({ status:"領土", settlementId:settlement.settlementId });
      modes[project.tileKey] = "resource";
      completed.push({ ...project, playerId:player.id, settlementId:settlement.settlementId, settlementName:settlement.name });
    }
  }
  return { settlement:{ ...settlement, landExpansionProjects:projects, territoryTileModeMap:modes }, completed };
}

export function cancelV39LandExpansion(state, playerId, settlementId, tileKey) {
  const player = state?.players?.find(row => row.id === playerId);
  const settlement = getFactionSettlementById(player?.factionState, settlementId);
  if (!settlement?.landExpansionProjects?.some(row => row.tileKey === tileKey)) return { ok:false, state, reason:"開拓計画がありません" };
  return { ok:true, state:{ ...state, players:state.players.map(row => row.id !== playerId ? row : {
    ...row, factionState:replaceFactionSettlement(row.factionState, { ...settlement,
      landExpansionProjects:settlement.landExpansionProjects.filter(project => project.tileKey !== tileKey)
    }, { ownerPlayerId:playerId })
  }) } };
}
