import { getHexNeighborCoords } from "./hex-grid.js";
import { facilityDefinitions } from "./v39-economy-rules.js";
import { getFactionSettlements } from "./settlement-state.js";
import {
  resolveDetectionGroupSense,
  resolveEffectiveScoutAtDistance,
  resolveV39UnitVisionRange,
  V39_UNIT_VISION_BASE_RANGE,
  V39_UNIT_VISION_SCOUT_STEP
} from "./v39-detection-rules.js";
import { BASE_VILLAGE_SCOUT_RANGE } from "./phaser-map-panel-config.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const coordKey = (x, y) => `${Math.floor(number(x))},${Math.floor(number(y))}`;

function livingUnit(unit) {
  const hp = Number(unit?.currentHp ?? unit?.hp);
  return unit?.state !== "死亡" && unit?.condition !== "死亡" && (!Number.isFinite(hp) || hp > 0);
}

function unitsByTile(units = []) {
  const groups = new Map();
  for (const unit of Array.isArray(units) ? units : []) {
    if (!livingUnit(unit)) continue;
    const x = Math.floor(Number(unit?.x));
    const y = Math.floor(Number(unit?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = coordKey(x, y);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(unit);
  }
  return groups;
}

function addVisionRange(mapData, sourceX, sourceY, range, visible, detectionByTile, scoutValue = 0) {
  const width = Math.floor(number(mapData?.w));
  const height = Math.floor(number(mapData?.h));
  const sx = Math.floor(Number(sourceX));
  const sy = Math.floor(Number(sourceY));
  if (!width || !height || !Number.isFinite(sx) || !Number.isFinite(sy) || sx < 0 || sy < 0 || sx >= width || sy >= height) return;
  const maxDistance = Math.max(0, Math.floor(number(range)));
  const startKey = coordKey(sx, sy);
  const visited = new Set([startKey]);
  const queue = [{ x:sx, y:sy, distance:0 }];
  let index = 0;
  while (index < queue.length) {
    const current = queue[index++];
    const key = coordKey(current.x, current.y);
    visible.add(key);
    const previous = Number(detectionByTile.get(key));
    detectionByTile.set(key, Math.max(
      Number.isFinite(previous) ? previous : Number.NEGATIVE_INFINITY,
      resolveEffectiveScoutAtDistance(scoutValue, current.distance)
    ));
    if (current.distance >= maxDistance) continue;
    for (const neighbor of getHexNeighborCoords(width, height, current.x, current.y, mapData?.worldWrapEnabled === true)) {
      if (visited.has(neighbor.key)) continue;
      visited.add(neighbor.key);
      queue.push({ x:neighbor.x, y:neighbor.y, distance:current.distance + 1 });
    }
  }
}

// Fog表示と同じ、現在ターンに見えているタイルとその地点での有効索敵値を求める。
export function collectV39FactionVision(state, playerId, mapData) {
  const player = (state?.players || []).find(candidate => text(candidate?.id) === text(playerId));
  const faction = player?.factionState;
  const visible = new Set();
  const detectionByTile = new Map();
  if (!faction || !mapData?.grid) return { visible, detectionByTile };
  const settlements = getFactionSettlements(faction);
  for (const settlement of settlements) {
    if (settlement?.placed) addVisionRange(mapData, settlement.x, settlement.y, BASE_VILLAGE_SCOUT_RANGE, visible, detectionByTile, 0);
  }
  for (const units of unitsByTile(faction.units).values()) {
    const lead = units[0];
    const sense = resolveDetectionGroupSense(units);
    const range = units.reduce((max, unit) => Math.max(max, resolveV39UnitVisionRange(unit)), V39_UNIT_VISION_BASE_RANGE);
    addVisionRange(mapData, lead.x, lead.y, range, visible, detectionByTile, sense.scout);
  }
  const definitions = new Map(facilityDefinitions().map(definition => [definition.name, definition]));
  for (const settlement of settlements) {
    for (const [key, names] of Object.entries(settlement?.tileFacilityMap || {})) {
      if (text(state?.territoryOwnerByTile?.[key]) !== text(playerId)) continue;
      const scout = (Array.isArray(names) ? names : []).reduce((sum, name) => sum + Math.max(0, number(definitions.get(text(name))?.effects?.索敵)), 0);
      if (scout <= 0) continue;
      const [x, y] = key.split(",").map(Number);
      addVisionRange(mapData, x, y, V39_UNIT_VISION_BASE_RANGE + Math.floor(scout / V39_UNIT_VISION_SCOUT_STEP), visible, detectionByTile, scout);
    }
  }
  return { visible, detectionByTile };
}

function detectedFactionRecord(player, x, y, kind, turnNumber) {
  return {
    playerId:text(player?.id),
    playerName:text(player?.name || player?.factionName || player?.race || player?.id) || "勢力",
    race:text(player?.race),
    key:coordKey(x, y),
    x:Math.floor(number(x)),
    y:Math.floor(number(y)),
    kind,
    discoveredTurn:turnNumber,
    lastSeenTurn:turnNumber
  };
}

// 他勢力の位置は、可視範囲かつ索敵値が対象隠密値以上の時だけ記録する。
export function collectV39DetectedFactions(state, observerPlayerId, mapData, turnNumber) {
  const turn = Math.max(1, Math.floor(number(turnNumber, state?.timeline?.turnNumber || 1)));
  const { visible, detectionByTile } = collectV39FactionVision(state, observerPlayerId, mapData);
  const detected = {};
  for (const target of state?.players || []) {
    if (!target || text(target.id) === text(observerPlayerId)) continue;
    let latest = null;
    for (const [key, units] of unitsByTile(target?.factionState?.units).entries()) {
      if (!visible.has(key)) continue;
      const scout = Number(detectionByTile.get(key));
      if (!Number.isFinite(scout) || scout < resolveDetectionGroupSense(units, { turnNumber:turn }).stealth) continue;
      const [x, y] = key.split(",").map(Number);
      latest = detectedFactionRecord(target, x, y, "unit", turn);
      break;
    }
    if (!latest) for (const settlement of getFactionSettlements(target?.factionState)) {
      const key = coordKey(settlement?.x, settlement?.y);
      if (!settlement?.placed || !visible.has(key)) continue;
      latest = detectedFactionRecord(target, settlement.x, settlement.y, "settlement", turn);
      break;
    }
    if (latest) detected[latest.playerId] = latest;
  }
  return detected;
}

// 発見履歴は最後に確認した座標を保持する。未発見勢力の情報はAI目的へ渡さない。
export function refreshV39FactionIntelligence(state, observerPlayerId, mapData, turnNumber) {
  const playerId = text(observerPlayerId);
  const player = (state?.players || []).find(candidate => text(candidate?.id) === playerId);
  if (!player) return { state, discoveries:[] };
  const current = collectV39DetectedFactions(state, playerId, mapData, turnNumber);
  const known = { ...(player?.factionState?.exploration?.discoveredFactionsByPlayerId || {}) };
  const discoveries = [];
  for (const [targetId, record] of Object.entries(current)) {
    if (!known[targetId]) discoveries.push(record);
    known[targetId] = { ...known[targetId], ...record, discoveredTurn:number(known[targetId]?.discoveredTurn, record.discoveredTurn) };
  }
  if (!discoveries.length && Object.keys(current).length === 0) return { state, discoveries };
  return {
    state:{
      ...state,
      players:state.players.map(candidate => text(candidate?.id) !== playerId ? candidate : ({
        ...candidate,
        factionState:{
          ...candidate.factionState,
          exploration:{ ...(candidate.factionState?.exploration || {}), discoveredFactionsByPlayerId:known }
        }
      }))
    },
    discoveries
  };
}

export function hasV39DiscoveredFaction(player, targetPlayerId) {
  return !!player?.factionState?.exploration?.discoveredFactionsByPlayerId?.[text(targetPlayerId)];
}
