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

function isPassableTerrain(terrain) {
  return terrain !== "海" && terrain !== "湖";
}

function canPlaceBaseOnTile(tile) {
  if (!tile) return false;
  const terrain = text(tile.terrain, "海");
  if (!isPassableTerrain(terrain)) return false;
  if (terrain === "火山") return false;
  return true;
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

function beginInitialPlacement(options = {}) {
  const state = getGameState();
  const player = getActivePlayer(state);
  const faction = player?.factionState;
  if (!state || !player || !faction) return false;
  if (faction.village?.placed && options.force !== true) return false;

  const units = options.keepUnitCoordinates === true
    ? faction.units
    : clearUnplacedUnitCoordinates(faction.units);

  const players = state.players.map(row => row.id === player.id
    ? {
        ...row,
        factionState: {
          ...row.factionState,
          village: null,
          villagePlacementMode: true,
          units
        }
      }
    : row);

  window.setV39GameState?.({ players }, { reason: "initial-placement-start" });
  showBanner("拠点を設置するマスを選択してください", true);
  return true;
}

function placeInitialBase(tile) {
  const state = getGameState();
  const player = getActivePlayer(state);
  const faction = player?.factionState;
  if (!state || !player || !faction?.villagePlacementMode) return false;

  const x = Math.floor(Number(tile?.x));
  const y = Math.floor(Number(tile?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;

  if (!canPlaceBaseOnTile(tile)) {
    showBanner("この地形には拠点を設置できません（海・湖・火山は不可）", true);
    return false;
  }

  const key = coordKey(x, y);
  const village = {
    id: `village-${x}-${y}`,
    name: "拠点",
    x,
    y,
    placed: true
  };
  const units = (Array.isArray(faction.units) ? faction.units : []).map(unit => ({
    ...unit,
    x,
    y,
    ap: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.ap,
    currentAp: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.currentAp
  }));
  const selectedUnitId = text(faction.selectedUnitId, text(units[0]?.id));

  const players = state.players.map(row => row.id === player.id
    ? {
        ...row,
        factionState: {
          ...row.factionState,
          village,
          villagePlacementMode: false,
          selectedUnitId,
          units
        }
      }
    : row);

  const existingSettlements = Array.isArray(state.settlements) ? state.settlements : [];
  const settlements = [
    ...existingSettlements.filter(row => row?.id !== village.id && row?.ownerPlayerId !== player.id),
    { ...village, type: "拠点", ownerPlayerId: player.id }
  ];

  window.setV39GameState?.({
    players,
    settlements,
    factionLabels: { ...state.factionLabels, [player.id]: text(player.label, player.id) },
    territoryOwnerByTile: { ...state.territoryOwnerByTile, [key]: player.id },
    facilitiesByTile: { ...state.facilitiesByTile, [key]: ["拠点"] },
    territoryStateByTile: { ...state.territoryStateByTile, [key]: "拠点" }
  }, { reason: "initial-placement-complete" });

  showBanner(`拠点を (${x}, ${y}) に設置し、キャラ${units.length}体を配置しました`);
  window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", {
    detail: { x, y, village, unitIds: units.map(unit => unit.id).filter(Boolean), playerId: player.id }
  }));
  return true;
}

function handleTileSelected(event) {
  const faction = typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : getActivePlayer()?.factionState;
  if (!faction?.villagePlacementMode) return;
  placeInitialBase(event.detail);
}

function syncPlacementMode() {
  const faction = typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : getActivePlayer()?.factionState;
  if (!faction) return;
  if (faction.villagePlacementMode) {
    showBanner("拠点を設置するマスを選択してください", true);
  } else if (faction.village?.placed) {
    hideBanner();
  }
}

function install() {
  if (typeof window.getV39GameState !== "function" || typeof window.setV39GameState !== "function") {
    window.setTimeout(install, 30);
    return;
  }

  window.addEventListener("v39:tile-selected", handleTileSelected);
  window.addEventListener("v39:game-state-changed", syncPlacementMode);
  window.beginV39InitialPlacement = beginInitialPlacement;
  window.placeV39InitialBase = placeInitialBase;
  window.canPlaceV39InitialBase = canPlaceBaseOnTile;

  const faction = window.getV39ActiveFactionState?.();
  if (faction && !faction.village?.placed) {
    beginInitialPlacement();
  } else {
    syncPlacementMode();
  }
}

install();
