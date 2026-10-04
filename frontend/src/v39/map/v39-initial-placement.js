import { createInitialV39Village, normalizeV39Village } from "../../lib/v39-economy-rules.js";
import { getHexOffsetNeighbors, getHexNeighborCoords, getHexDistance } from "../../lib/hex-grid.js";
import { isSovereignUnit } from "../../composables/unitCoreUtils.js";
import { getFactionSettlements, getSelectedSettlement, replaceFactionSettlement } from "../../lib/settlement-state.js";
import { V39_START_AREA_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { classData } from "../../lib/game-data-registry.js";
import { RACE_CLASS_NAME_MAP } from "../../constants/unitCommon.js";

const MODE_BANNER_ID = "modeBanner";
let pendingPlacement = null;
let candidateContext = null;

function raceTerrainPreferences(race) {
  const row = classData.find(row => row.名前 === (RACE_CLASS_NAME_MAP[race] || race));
  const values = value => Array.isArray(value) ? value : String(value || "").split(/[、,/:：\s]+/).filter(Boolean);
  return { preferred:new Set(values(row?.適正土地)), unfavorable:new Set(values(row?.苦手土地)) };
}

function tileTerrains(data, point) {
  const key = coordKey(point.x, point.y);
  const terrains = new Set([data.grid[point.y][point.x], data.specialMap?.[point.y]?.[point.x], data.reliefMap?.[point.y]?.[point.x]]);
  if (data.riverData?.riverSet?.has(key) || data.riverData?.riverTouchSet?.has(key)) terrains.add("河川");
  return terrains;
}

function preferredLowlandTiles(data, race) {
  const { preferred } = raceTerrainPreferences(race);
  if (!preferred.size) return [];
  const eligible = new Map();
  for (let y = 0; y < data.h; y += 1) for (let x = 0; x < data.w; x += 1) {
    const point = { x, y };
    if (!unitCanStandAt(data, x, y)
      || Math.abs(Number(data.heightLevelMap?.[y]?.[x]) || 0) > V39_START_AREA_BALANCE.preferredLowlandMaxHeight
      || ![...preferred].some(terrain => tileTerrains(data, point).has(terrain))) continue;
    eligible.set(coordKey(x, y), point);
  }
  const result = [];
  // マップ全体で連結成分を一度だけ数える。候補数の上限とは独立して広い適正低地を拾う。
  while (eligible.size) {
    const region = [eligible.values().next().value];
    eligible.delete(coordKey(region[0].x, region[0].y));
    for (let index = 0; index < region.length; index += 1) {
      const point = region[index];
      for (const neighbor of getHexNeighborCoords(data.w, data.h, point.x, point.y, worldWrapEnabled())) {
        const key = coordKey(neighbor.x, neighbor.y);
        if (!eligible.has(key)) continue;
        region.push(eligible.get(key));
        eligible.delete(key);
      }
    }
    if (region.length >= V39_START_AREA_BALANCE.preferredLowlandMinTiles) result.push(...region);
  }
  return result;
}

function terrainPreferenceScore(data, tile, preferred, unfavorable) {
  if (!preferred.size && !unfavorable.size) return [0, 0, 0];
  const found = new Set(), seen = new Set();
  let favorableCount = 0, unfavorableCount = 0, ring = [tile];
  for (let distance = 0; distance <= V39_START_AREA_BALANCE.terrainPreferenceRadius; distance += 1) {
    const next = [];
    for (const point of ring) {
      const key = coordKey(point.x, point.y);
      if (seen.has(key)) continue;
      seen.add(key);
      const terrains = tileTerrains(data, point);
      const matches = [...preferred].filter(terrain => terrains.has(terrain));
      matches.forEach(terrain => found.add(terrain));
      if (matches.length) favorableCount += 1;
      if ([...unfavorable].some(terrain => terrains.has(terrain))) unfavorableCount += 1;
      next.push(...getHexNeighborCoords(data.w, data.h, point.x, point.y, worldWrapEnabled()));
    }
    ring = next;
  }
  // 平地と河川など、異なる適正土地を併せ持つ場所と広い適正地帯を優先する。
  return [-found.size, unfavorableCount, -favorableCount];
}

function placementCandidates() {
  const data = fieldMapData();
  if (!data?.grid) return [];
  const state = getGameState();
  const race = getActivePlayer(state)?.race;
  const { preferred, unfavorable } = raceTerrainPreferences(race);
  const center = { x:(data.w - 1) / 2, y:(data.h - 1) / 2 };
  const margin = V39_START_AREA_BALANCE.placementRadius + 1;
  const distance = (a, b) => worldWrapEnabled()
    ? Math.min(...[-data.w, 0, data.w].flatMap(dx => [-data.h, 0, data.h]
      .map(dy => getHexDistance(a, { x:b.x + dx, y:b.y + dy }))))
    : getHexDistance(a, b);
  const tiles = [];
  for (let y = 0; y < data.h; y += 1) for (let x = 0; x < data.w; x += 1) {
    if (!unitCanStandAt(data, x, y)) continue;
    const height = Number(data.heightLevelMap?.[y]?.[x]) || 0;
    const tile = { x, y, height, terrain:data.grid[y][x], special:data.specialMap?.[y]?.[x] || "" };
    if (basePlacementIssue(tile, state)) continue;
    tiles.push({ ...tile, preference:terrainPreferenceScore(data, tile, preferred, unfavorable) });
  }
  const candidates = [];
  const edgePenalty = tile => Math.max(0, margin - Math.min(tile.x, tile.y, data.w - 1 - tile.x, data.h - 1 - tile.y));
  while (candidates.length < V39_START_AREA_BALANCE.candidateCount) {
    // 地図端を避け、種族の適正土地、低地、中央寄りの順で優先する。
    let best = null, bestScore = null;
    for (const tile of tiles) {
      const separation = candidates.length ? Math.min(...candidates.map(candidate => distance(candidate, tile))) : 0;
      if (candidates.length && separation <= V39_START_AREA_BALANCE.placementRadius * 2) continue;
      const score = [edgePenalty(tile), ...tile.preference, Math.abs(tile.height), getHexDistance(tile, center), -separation];
      const difference = bestScore ? score.findIndex((value, index) => value !== bestScore[index]) : -1;
      if (!best || (difference >= 0 && score[difference] < bestScore[difference])) {
        best = tile; bestScore = score;
      }
    }
    if (!best) break;
    candidates.push(best);
  }
  return candidates;
}

function currentCandidateContext() {
  const map = fieldMapData();
  const playerId = getGameState()?.activePlayerId;
  const race = getActivePlayer()?.race;
  const count = placedSettlements(getActiveFaction()).length;
  if (candidateContext?.map === map && candidateContext.playerId === playerId && candidateContext.race === race && candidateContext.count === count) return candidateContext;
  const candidates = placementCandidates();
  const tiles = new Map();
  for (const candidate of candidates) {
    const seen = new Set();
    let ring = [candidate];
    for (let distance = 0; distance <= V39_START_AREA_BALANCE.placementRadius; distance += 1) {
      const next = [];
      for (const tile of ring) {
        const key = coordKey(tile.x, tile.y);
        if (seen.has(key)) continue;
        seen.add(key);
        tiles.set(key, tile);
        next.push(...getHexNeighborCoords(map.w, map.h, tile.x, tile.y, worldWrapEnabled()));
      }
      ring = next;
    }
  }
  const state = getGameState();
  for (const tile of preferredLowlandTiles(map, race)) tiles.set(coordKey(tile.x, tile.y), tile);
  const allowedTiles = [...tiles.values()].map(tile => ({ ...tile, terrain:map.grid[tile.y][tile.x] }))
    .filter(tile => !basePlacementIssue(tile, state));
  candidateContext = { map, playerId, race, count, candidates, allowedTiles, allowedKeys:new Set(allowedTiles.map(tile => coordKey(tile.x, tile.y))) };
  return candidateContext;
}

function initialPlacementIssue(tile) {
  return basePlacementIssue(tile) || (currentCandidateContext().allowedKeys.has(coordKey(tile?.x, tile?.y))
    ? "" : `候補マス・周囲${V39_START_AREA_BALANCE.placementRadius}マス・広い適正低地から選択してください`);
}

function ensurePlacementPanel() {
  const host = document.getElementById("footPlacement");
  if (!host) return null;
  let panel = document.getElementById("v39-placement-preview");
  if (!panel) {
    if (!document.getElementById("v39-placement-preview-style")) {
      const style = document.createElement("style");
      style.id = "v39-placement-preview-style";
      style.textContent = `#footPlacement{min-height:0;height:100%;overflow:hidden}#v39-placement-preview{display:grid;grid-template-rows:minmax(0,1fr) auto;min-height:0;height:100%;box-sizing:border-box;gap:8px;padding:8px;color:#e9f2ef;font-size:var(--font-body)}#v39-placement-preview[hidden]{display:none}#v39-placement-preview [data-placement-details]{display:grid;align-content:start;gap:8px;min-height:0;overflow:auto;overscroll-behavior:contain}#v39-placement-preview [data-placement-details]>:empty{display:none}#v39-placement-preview button{font-size:var(--font-body);padding:6px 10px;background:#15353d;color:#eaf2ee;border:1px solid #75cad9;border-radius:6px;cursor:pointer}#v39-placement-preview button:disabled{opacity:.4;cursor:not-allowed}`;
      document.head.appendChild(style);
    }
    panel = document.createElement("div");
    panel.id = "v39-placement-preview";
    panel.innerHTML = `<div data-placement-details><strong>初期拠点の配置</strong><span>明るい範囲のマスをタップし、配置先を確認してください。</span><strong data-placement-location>配置先を選択してください</strong><span data-placement-level></span><span data-placement-species></span><span data-placement-outer></span></div><button type="button" data-placement-confirm disabled>ここに拠点を設置（OK）</button>`;
    panel.querySelector("[data-placement-confirm]").addEventListener("click", () => {
      const selected = pendingPlacement;
      if (selected && selected.playerId === getGameState()?.activePlayerId) confirmPlacement(selected.tile);
    });
    host.appendChild(panel);
  }
  const context = currentCandidateContext();
  if (panel.placementContext !== context) {
    panel.placementContext = context;
    pendingPlacement = null;
    panel.querySelector("[data-placement-location]").textContent = "配置先を選択してください";
    for (const name of ["level", "species", "outer"]) panel.querySelector(`[data-placement-${name}]`).textContent = "";
    panel.querySelector("[data-placement-confirm]").disabled = true;
    if (!context.candidates.length) panel.querySelector("[data-placement-level]").textContent = "配置可能な候補がありません。マップを再生成してください。";
  }
  const scene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if (scene?.v39Input?.showPlacementTiles && scene.v39PlacementContext !== context) {
    scene.v39Input.showPlacementTiles(context.allowedTiles, true);
    scene.v39PlacementContext = context;
  }
  panel.hidden = false;
  return panel;
}

function showPlacementPreview(tile) {
  if (!Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)) return;
  const panel = ensurePlacementPanel();
  if (!panel) return;
  window.activateV39FooterTab?.("placement");
  const preview = window.inspectV39InitialPlacementArea?.(tile);
  const issue = initialPlacementIssue(tile);
  pendingPlacement = { tile:{ ...tile }, playerId:getGameState()?.activePlayerId };
  panel.hidden = false;
  panel.querySelector("[data-placement-location]").textContent = `(${tile.x},${tile.y}) ${tile.special || tile.terrain} / 高度 ${tile.height ?? 0}`;
  panel.querySelector("[data-placement-level]").textContent = issue || (preview
    ? `周囲${preview.safeRadius}マス: 初期敵なし / ${preview.safeRadius + 1}〜${preview.beginnerRadius}マス: Lv${preview.beginnerMinLevel}〜${preview.beginnerMaxLevel}` : "敵Lv目安を準備中");
  panel.querySelector("[data-placement-species]").textContent = preview
    ? `序盤の候補: ${preview.beginnerSpecies.slice(0, 4).join("・") || "なし"}${preview.beginnerSpecies.length > 4 ? " ほか" : ""}` : "";
  panel.querySelector("[data-placement-outer]").textContent = preview?.outerMinLevel != null
    ? `${preview.beginnerRadius + 1}マス付近の通常敵目安: Lv${preview.outerMinLevel}〜${preview.outerMaxLevel}（種族で強さは異なります）` : "";
  panel.querySelector("[data-placement-confirm]").disabled = !!issue;
}

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function coordKey(x, y) {
  return `${Math.floor(Number(x))},${Math.floor(Number(y))}`;
}

function getGameState() {
  return typeof window.getV39GameState === "function" ? window.getV39GameState() : null;
}

function getActivePlayer(state = getGameState()) {
  if (!state) return null;
  return state.players?.find(player => player.id === state.activePlayerId) || state.players?.[0] || null;
}

function getActiveFaction() {
  return typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : getActivePlayer()?.factionState;
}

function initialSettlementPlans(faction) {
  const configured = Array.isArray(faction?.initialSettlementPlans)
    ? faction.initialSettlementPlans.filter(row => row && typeof row === "object")
    : [];
  const requested = Math.max(1, Math.floor(Number(faction?.initialSettlementCount) || configured.length || 1));
  return Array.from({ length:requested }, (_, index) => configured[index] || {});
}

function placedSettlements(faction) {
  return getFactionSettlements(faction).filter(row => row?.placed);
}

function hasSovereign(faction) {
  return Array.isArray(faction?.units) && faction.units.some(unit => isSovereignUnit(unit));
}

function needsInitialPlacement(player) {
  const faction = player?.factionState;
  return !!faction
    && hasSovereign(faction)
    && placedSettlements(faction).length < initialSettlementPlans(faction).length;
}

function findNextPlayerNeedingInitialPlacement(state, afterPlayerId = "") {
  const players = Array.isArray(state?.players) ? state.players : [];
  const start = Math.max(-1, players.findIndex(player => player.id === afterPlayerId));
  for (let offset = 1; offset <= players.length; offset += 1) {
    const player = players[(start + offset + players.length) % players.length];
    if (needsInitialPlacement(player)) return player;
  }
  return null;
}

function placementSlot(unit) {
  const value = Number(unit?.initialSettlementSlot);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function placementBannerText(faction) {
  const plans = initialSettlementPlans(faction);
  const placed = placedSettlements(faction).length;
  const next = Math.min(plans.length, placed + 1);
  const name = text(plans[placed]?.name);
  return `拠点${next}/${plans.length}${name ? `「${name}」` : ""}を設置するマスを選択してください`;
}

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function basePlacementIssue(tile, state = getGameState()) {
  if (!tile) return "配置先がありません";
  const terrain = text(tile.terrain, "海");
  if (!isPassableTerrain(terrain) || terrain === "火山") return "海・湖・火山には配置できません";
  const x = Math.floor(Number(tile.x));
  const y = Math.floor(Number(tile.y));
  const data = fieldMapData();
  if (!data?.grid || !Number.isFinite(x) || !Number.isFinite(y)) return "";
  const territoryTiles = buildInitialTerritoryTiles(x, y);
  if (territoryTiles.length !== 7) return "周囲1マスを含む7マスすべてが陸地の場所を選んでください";
  const keys = new Set(territoryTiles.map(row => row.key));
  const activeId = state?.activePlayerId;
  if ([...keys].some(key => {
    const ownerId = text(state?.territoryOwnerByTile?.[key]);
    return ownerId && ownerId !== activeId;
  })) return "周囲に他勢力の領土があります";
  if ([...keys].some(key => text(state?.territoryOwnerByTile?.[key]) === text(activeId))) {
    return "既存拠点の領土と重ならない場所を選んでください";
  }
  const occupied = [
    ...(state?.players || []).filter(player => player.id !== activeId).flatMap(player => player?.factionState?.units || []),
    ...(state?.enemies || [])
  ].some(unit => unit?.x !== null && unit?.x !== undefined && unit?.y !== null && unit?.y !== undefined
    && unit?.state !== "死亡" && Number(unit?.hp ?? unit?.currentHp ?? 1) > 0
    && keys.has(coordKey(unit.x, unit.y)));
  return occupied ? "周囲に他勢力のキャラクターまたは敵がいます" : "";
}

function canPlaceBaseOnTile(tile) {
  return !initialPlacementIssue(tile);
}

function showBanner(message, persistent = false) {
  const banner = document.getElementById(MODE_BANNER_ID);
  if (!(banner instanceof HTMLElement)) return;
  banner.textContent = message;
  banner.classList.add("show");
  if (!persistent) {
    window.clearTimeout(showBanner.hideTimer);
    showBanner.hideTimer = window.setTimeout(() => banner.classList.remove("show"), 1500);
  }
}

function hideBanner() {
  const banner = document.getElementById(MODE_BANNER_ID);
  if (!(banner instanceof HTMLElement)) return;
  window.clearTimeout(showBanner.hideTimer);
  banner.classList.remove("show");
}

function clearUnplacedUnitCoordinates(units) {
  return (Array.isArray(units) ? units : []).map(unit => ({
    ...unit,
    x: null,
    y: null
  }));
}

function emptyVisibilityState() {
  return {
    exploredTileKeys: [],
    visibleTileKeys: [],
    spottedEnemyTileKeys: [],
    spottedFactionTileKeys: [],
    alertedEnemyTileKeys: [],
    alertedFactionTileKeys: []
  };
}

function fieldMapData() {
  return window.__v39FieldRuntime?.mapData || null;
}

function worldWrapEnabled() {
  return fieldMapData()?.worldWrapEnabled !== false
    && window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
}

function normalizeCoord(value, size, wrap) {
  if (!Number.isFinite(value) || !Number.isFinite(size) || size <= 0) return null;
  if (wrap) return ((value % size) + size) % size;
  return value >= 0 && value < size ? value : null;
}

const neighborCoords = getHexOffsetNeighbors;

function unitCanStandAt(data, x, y) {
  const terrain = text(data?.grid?.[y]?.[x], "海");
  return isPassableTerrain(terrain) && terrain !== "火山" && !data?.lavaMap?.[y]?.[x];
}

function buildInitialTerritoryTiles(baseX, baseY) {
  const data = fieldMapData();
  const w = Math.max(1, Math.floor(Number(data?.w) || 0));
  const h = Math.max(1, Math.floor(Number(data?.h) || 0));
  if (!data?.grid || !w || !h) return [];

  const wrap = worldWrapEnabled();
  const candidates = [{ x:baseX, y:baseY }, ...neighborCoords(baseX, baseY)];
  const result = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const x = normalizeCoord(candidate.x, w, wrap);
    const y = normalizeCoord(candidate.y, h, wrap);
    if (x === null || y === null || !unitCanStandAt(data, x, y)) continue;
    const key = coordKey(x, y);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ x, y, key });
  }
  return result;
}

function buildInitialUnitPositions(baseX, baseY, count) {
  const data = fieldMapData();
  const w = Math.max(1, Math.floor(Number(data?.w) || 0));
  const h = Math.max(1, Math.floor(Number(data?.h) || 0));
  if (!data || !w || !h || count <= 0) return [];

  const wrap = worldWrapEnabled();
  const queue = [{ x: baseX, y: baseY }];
  const visited = new Set([coordKey(baseX, baseY)]);
  const positions = [];

  while (queue.length && positions.length < count) {
    const current = queue.shift();
    for (const raw of neighborCoords(current.x, current.y)) {
      const nx = normalizeCoord(raw.x, w, wrap);
      const ny = normalizeCoord(raw.y, h, wrap);
      if (nx === null || ny === null) continue;
      const key = coordKey(nx, ny);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x: nx, y: ny });

      // The base tile itself is reserved for the base marker.
      if (nx === baseX && ny === baseY) continue;
      if (!unitCanStandAt(data, nx, ny)) continue;
      positions.push({ x: nx, y: ny });
      if (positions.length >= count) break;
    }
  }

  return positions;
}

function beginInitialPlacement(options = {}) {
  const state = getGameState();
  const player = getActivePlayer(state);
  const faction = player?.factionState;
  if (!state || !player || !faction) return false;
  if (!hasSovereign(faction)) {
    window.dispatchEvent(new CustomEvent("v39:initial-sovereign-required", {
      detail:{ playerId:player.id, race:player.race }
    }));
    return false;
  }
  if (placedSettlements(faction).length && options.force !== true) return false;
  candidateContext = null;
  pendingPlacement = null;

  const units = options.keepUnitCoordinates === true
    ? faction.units
    : clearUnplacedUnitCoordinates(faction.units);
  const previousOwnKeys = Object.entries(state.territoryOwnerByTile || {})
    .filter(([, ownerId]) => text(ownerId) === text(player.id))
    .map(([tileKey]) => tileKey);
  const territoryOwnerByTile = { ...(state.territoryOwnerByTile || {}) };
  const facilitiesByTile = { ...(state.facilitiesByTile || {}) };
  const territoryStateByTile = { ...(state.territoryStateByTile || {}) };
  for (const tileKey of previousOwnKeys) {
    delete territoryOwnerByTile[tileKey];
    delete facilitiesByTile[tileKey];
    delete territoryStateByTile[tileKey];
  }

  const players = state.players.map(row => row.id === player.id
    ? {
        ...row,
        factionState: {
          ...row.factionState,
          settlements: [],
          selectedSettlementId: "",
          villagePlacementMode: true,
          moveCommandUnitId: "",
          units,
          visibility: options.keepVisibility === true
            ? row.factionState.visibility
            : emptyVisibilityState()
        }
      }
    : row);
  const settlements = (Array.isArray(state.settlements) ? state.settlements : [])
    .filter(row => text(row?.ownerPlayerId) !== text(player.id));

  window.setV39GameState?.({
    players,
    settlements,
    territoryOwnerByTile,
    facilitiesByTile,
    territoryStateByTile
  }, { reason: "initial-placement-start" });
  const nextFaction = players.find(row => row.id === player.id)?.factionState || faction;
  showBanner(placementBannerText(nextFaction), true);
  return true;
}

function placeInitialBase(tile, options = {}) {
  const state = getGameState();
  const player = getActivePlayer(state);
  const faction = player?.factionState;
  if (!state || !player || !faction?.villagePlacementMode) return false;

  const plans = initialSettlementPlans(faction);
  const placementIndex = placedSettlements(faction).length;
  if (placementIndex >= plans.length) return false;
  const plan = plans[placementIndex] || {};

  const x = Math.floor(Number(tile?.x));
  const y = Math.floor(Number(tile?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  if (!canPlaceBaseOnTile(tile)) {
    showBanner(initialPlacementIssue(tile), true);
    return false;
  }

  const key = coordKey(x, y);
  const centerOwnerId = text(state.territoryOwnerByTile?.[key]);
  if (centerOwnerId) {
    showBanner(centerOwnerId === text(player.id)
      ? "既存拠点の領土には設置できません"
      : "他勢力の領土には拠点を設置できません", true);
    return false;
  }

  const sourceUnits = Array.isArray(faction.units) ? faction.units : [];
  const assignedUnits = sourceUnits.filter(unit => placementSlot(unit) === placementIndex);
  const positions = buildInitialUnitPositions(x, y, assignedUnits.length);
  let assignedPositionIndex = 0;
  let units = sourceUnits.map(unit => {
    if (placementSlot(unit) !== placementIndex) return unit;
    const position = positions[assignedPositionIndex++];
    return {
      ...unit,
      x: position?.x ?? x,
      y: position?.y ?? y,
      ap: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.ap,
      currentAp: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.currentAp
    };
  });
  const selectedUnitId = text(faction.selectedUnitId, text(units[0]?.id));

  const territoryOwnerByTile = { ...(state.territoryOwnerByTile || {}) };
  const facilitiesByTile = { ...(state.facilitiesByTile || {}) };
  const territoryStateByTile = { ...(state.territoryStateByTile || {}) };
  const settlementId = `village-${x}-${y}`;
  const territoryTiles = buildInitialTerritoryTiles(x, y).filter(tileData => !text(territoryOwnerByTile[tileData.key]));
  if (territoryTiles.length !== 7) {
    showBanner("周囲1マスを含む7マスすべてが空いている場所を選んでください", true);
    return false;
  }
  for (const tileData of territoryTiles) {
    territoryOwnerByTile[tileData.key] = player.id;
    territoryStateByTile[tileData.key] = {
      status: tileData.key === key ? "拠点" : "領土",
      settlementId
    };
  }
  facilitiesByTile[key] = ["拠点"];

  const stateWithTerritory = {
    ...state,
    territoryOwnerByTile,
    facilitiesByTile,
    territoryStateByTile
  };
  let village = createInitialV39Village({
    x,
    y,
    name:text(plan?.name, `拠点${placementIndex + 1}`),
    race:player.race,
    state:stateWithTerritory,
    player,
    mapData:fieldMapData()
  });
  village = normalizeV39Village({
    ...village,
    name:text(plan?.name, village.name),
    populationByRace:plan?.populationByRace && typeof plan.populationByRace === "object"
      ? { ...plan.populationByRace }
      : village.populationByRace,
    foodStockByType:plan?.foodStockByType && typeof plan.foodStockByType === "object"
      ? { ...plan.foodStockByType }
      : village.foodStockByType,
    materialStockByType:plan?.materialStockByType && typeof plan.materialStockByType === "object"
      ? { ...plan.materialStockByType }
      : village.materialStockByType,
    buildings:Array.isArray(plan?.buildings) ? [...plan.buildings] : village.buildings,
    civicState:plan?.civicState && typeof plan.civicState === "object"
      ? { ...plan.civicState }
      : village.civicState,
    territoryTileModeMap:Object.fromEntries(territoryTiles.map(tileData => [
      tileData.key,
      tileData.key === key ? "settlement" : "resource"
    ]))
  }, player.race);
  const resolvedSettlementId = text(village.settlementId || village.id, settlementId);
  units = units.map(unit => placementSlot(unit) === placementIndex
    ? { ...unit, settlementId:resolvedSettlementId }
    : unit);

  let factionState = replaceFactionSettlement({
    ...faction,
    selectedUnitId,
    units
  }, village, { ownerPlayerId:player.id });
  const placedCount = placedSettlements(factionState).length;
  const complete = placedCount >= plans.length;
  factionState = {
    ...factionState,
    villagePlacementMode:!complete
  };
  const players = state.players.map(row => row.id === player.id
    ? { ...row, factionState }
    : row);

  const existingSettlements = Array.isArray(state.settlements) ? state.settlements : [];
  const settlements = [
    ...existingSettlements.filter(row => text(row?.id || row?.settlementId) !== resolvedSettlementId),
    { ...village, type:"村", ownerPlayerId:player.id }
  ];

  window.setV39GameState?.({
    players,
    settlements,
    factionLabels:{ ...state.factionLabels, [player.id]:text(player.label, player.id) },
    territoryOwnerByTile,
    facilitiesByTile,
    territoryStateByTile
  }, { reason:"initial-settlement-placed" });

  const placedUnitIds = units.filter(unit => text(unit?.settlementId) === resolvedSettlementId)
    .map(unit => unit.id).filter(Boolean);
  const detail = {
    x,
    y,
    village,
    settlementIndex:placementIndex,
    settlementCount:plans.length,
    territoryTileKeys:territoryTiles.map(tileData => tileData.key),
    territoryTileCount:territoryTiles.length,
    unitIds:placedUnitIds,
    unitPositions:units
      .filter(unit => text(unit?.settlementId) === resolvedSettlementId)
      .map(unit => ({ id:unit.id, x:unit.x, y:unit.y })),
    playerId:player.id
  };
  window.dispatchEvent(new CustomEvent("v39:initial-settlement-placed", { detail }));

  if (complete) {
    showBanner(`初期拠点${plans.length}件の設置が完了しました`);
    const stateAfterPlacement = getGameState();
    if (options.advanceToNextPlayer === false) {
      window.dispatchEvent(new CustomEvent("v39:initial-player-placement-complete", {
        detail:{ ...detail, settlements:getFactionSettlements(factionState) }
      }));
      return true;
    }
    const nextPlayer = findNextPlayerNeedingInitialPlacement(stateAfterPlacement, player.id);
    if (nextPlayer) {
      window.dispatchEvent(new CustomEvent("v39:initial-settlement-placed", { detail }));
      window.setV39GameState?.({ activePlayerId:nextPlayer.id }, { reason:"initial-placement-player-switch" });
      beginInitialPlacement({ force:true });
      return true;
    }
    window.dispatchEvent(new CustomEvent("v39:initial-settlement-placed", { detail }));
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", {
      detail:{ ...detail, settlements:getFactionSettlements(factionState) }
    }));
  } else {
    showBanner(`拠点${placementIndex + 1}/${plans.length}を設置しました。続けて${placementBannerText(factionState)}`, true);
  }
  return true;
}

function findInitialBaseCandidate() {
  return currentCandidateContext().candidates.find(canPlaceBaseOnTile) || null;
}

// TEST ONの追加勢力も、手動配置と同一の配置可否・領土生成処理を通す。
function autoPlaceInitialBases(playerId) {
  const initialState = getGameState();
  const previousActivePlayerId = text(initialState?.activePlayerId);
  const player = initialState?.players?.find(row => text(row?.id) === text(playerId));
  if (!player || !fieldMapData()) return { ok:false, reason:"勢力またはフィールドがありません" };
  window.setV39GameState?.({ activePlayerId:player.id }, { reason:"initial-placement-auto-select" });
  if (!beginInitialPlacement({ force:true })) {
    window.setV39GameState?.({ activePlayerId:previousActivePlayerId }, { reason:"initial-placement-auto-restore" });
    return { ok:false, reason:"初期配置を開始できません" };
  }
  while (needsInitialPlacement(getActivePlayer())) {
    const tile = findInitialBaseCandidate();
    if (!tile || !placeInitialBase(tile, { advanceToNextPlayer:false })) {
      window.setV39GameState?.({ activePlayerId:previousActivePlayerId }, { reason:"initial-placement-auto-restore" });
      return { ok:false, reason:"配置可能な初期拠点マスがありません" };
    }
  }
  if (previousActivePlayerId && getGameState()?.players?.some(row => text(row?.id) === previousActivePlayerId)) {
    window.setV39GameState?.({ activePlayerId:previousActivePlayerId }, { reason:"initial-placement-auto-complete" });
  }
  // TEST ONなどの自動配置も、手動配置と同じワールド初期化イベントを1回だけ通す。
  const completedState = getGameState();
  const allPlaced = !(completedState?.players || []).some(needsInitialPlacement);
  const sitesGenerated = Object.keys(completedState?.explorationSitesByTile || {}).length > 0
    || Object.keys(completedState?.victoryLandmarksByTile || {}).length > 0;
  if (allPlaced && !sitesGenerated) {
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", {
      detail:{ playerId:player.id, auto:true, mapData:fieldMapData() }
    }));
  }
  return { ok:true, playerId:player.id };
}

function handleTileSelected(event) {
  const faction = getActiveFaction();
  if (!faction?.villagePlacementMode) return;
  showPlacementPreview(event.detail);
}

function confirmPlacement(tile) {
  if (!getActiveFaction()?.villagePlacementMode) return;
  if (window.isV39MultiplayerSetup?.() === true) {
    const player = getActivePlayer();
    const x = Math.floor(Number(tile?.x));
    const y = Math.floor(Number(tile?.y));
    if (!player?.id || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!canPlaceBaseOnTile(tile)) {
      showBanner(initialPlacementIssue(tile), true);
      return;
    }
    window.dispatchEvent(new CustomEvent("v39:multiplayer-initial-placement-request", {
      detail:{ playerId:player.id, x, y }
    }));
    showBanner("初期拠点の配置をホストへ確認しています...", true);
    return;
  }
  placeInitialBase(tile);
}

function syncPlacementMode() {
  const faction = getActiveFaction();
  if (!faction) return;
  if (!faction.villagePlacementMode || pendingPlacement?.playerId !== getGameState()?.activePlayerId) {
    pendingPlacement = null;
    const panel = document.getElementById("v39-placement-preview");
    if (panel) panel.hidden = true;
  }
  if (faction.villagePlacementMode) {
    const panel = ensurePlacementPanel();
    if (panel && !document.getElementById("footPlacement")?.classList.contains("v39-footer-panel-active")) window.activateV39FooterTab?.("placement");
    showBanner(placementBannerText(faction), true);
  } else {
    candidateContext = null;
    const scene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
    scene?.v39Input?.showPlacementTiles?.([]);
    if (scene) scene.v39PlacementContext = null;
    if (document.getElementById("footPlacement")?.classList.contains("v39-footer-panel-active")) window.activateV39FooterTab?.("squad");
    hideBanner();
  }
}

function handleFieldGenerated() {
  pendingPlacement = null;
  candidateContext = null;
  const preview = document.getElementById("v39-placement-preview");
  if (preview) preview.remove();
  const state = getGameState();
  const player = getActivePlayer(state);
  const faction = player?.factionState;
  if (!faction) return;
  if (!hasSovereign(faction)) {
    hideBanner();
    window.dispatchEvent(new CustomEvent("v39:initial-sovereign-required", {
      detail:{ playerId:player?.id || "", race:player?.race || "" }
    }));
    return;
  }

  const targetCount = initialSettlementPlans(faction).length;
  const currentCount = placedSettlements(faction).length;
  if (currentCount === 0) {
    beginInitialPlacement({ force:true });
    return;
  }
  if (currentCount < targetCount && !faction.villagePlacementMode) {
    window.updateV39ActiveFactionState?.({ villagePlacementMode:true }, { reason:"initial-placement-resume" });
    return;
  }

  syncPlacementMode();
}

function install() {
  if (typeof window.getV39GameState !== "function" || typeof window.setV39GameState !== "function") {
    window.setTimeout(install, 30);
    return;
  }

  window.addEventListener("v39:tile-selected", handleTileSelected);
  window.addEventListener("v39:game-state-changed", syncPlacementMode);
  window.addEventListener("v39:field-generated", handleFieldGenerated);
  window.addEventListener("v39:operation-ui-ready", syncPlacementMode);
  window.addEventListener("v39:field-input-ready", syncPlacementMode);
  window.beginV39InitialPlacement = beginInitialPlacement;
  window.placeV39InitialBase = placeInitialBase;
  window.autoPlaceV39InitialBases = autoPlaceInitialBases;
  window.canPlaceV39InitialBase = canPlaceBaseOnTile;

  if (window.__v39FieldRuntime?.mapData) {
    handleFieldGenerated();
  } else {
    hideBanner();
  }
}

install();
