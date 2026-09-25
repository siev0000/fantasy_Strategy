import { createInitialV39Village, normalizeV39Village } from "../../lib/v39-economy-rules.js";
import { getHexOffsetNeighbors } from "../../lib/hex-grid.js";
import { isSovereignUnit } from "../../composables/unitCoreUtils.js";
import { getFactionSettlements, getSelectedSettlement, replaceFactionSettlement } from "../../lib/settlement-state.js";

const MODE_BANNER_ID = "modeBanner";

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

function basePlacementIssue(tile) {
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
  const state = getGameState();
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
  return !basePlacementIssue(tile);
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
  return window.__v39FieldRuntime?.settings?.islandCustomSettings?.worldWrapEnabled !== false;
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
    showBanner(basePlacementIssue(tile), true);
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

function handleTileSelected(event) {
  const faction = getActiveFaction();
  if (!faction?.villagePlacementMode) return;
  if (window.isV39MultiplayerSetup?.() === true) {
    const player = getActivePlayer();
    const x = Math.floor(Number(event?.detail?.x));
    const y = Math.floor(Number(event?.detail?.y));
    if (!player?.id || !Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!canPlaceBaseOnTile(event.detail)) {
      showBanner(basePlacementIssue(event.detail), true);
      return;
    }
    window.dispatchEvent(new CustomEvent("v39:multiplayer-initial-placement-request", {
      detail:{ playerId:player.id, x, y }
    }));
    showBanner("初期拠点の配置をホストへ確認しています...", true);
    return;
  }
  placeInitialBase(event.detail);
}

function syncPlacementMode() {
  const faction = getActiveFaction();
  if (!faction) return;
  if (faction.villagePlacementMode) {
    showBanner(placementBannerText(faction), true);
  } else if (getSelectedSettlement(faction)?.placed) {
    hideBanner();
  }
}

function handleFieldGenerated() {
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
  window.beginV39InitialPlacement = beginInitialPlacement;
  window.placeV39InitialBase = placeInitialBase;
  window.canPlaceV39InitialBase = canPlaceBaseOnTile;

  if (window.__v39FieldRuntime?.mapData) {
    handleFieldGenerated();
  } else {
    hideBanner();
  }
}

install();
