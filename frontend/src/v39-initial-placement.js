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

function neighborCoords(x, y) {
  const offsets = y % 2 === 1
    ? [[-1, 0], [1, 0], [0, -1], [1, -1], [0, 1], [1, 1]]
    : [[-1, 0], [1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]];
  return offsets.map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
}

function unitCanStandAt(data, x, y) {
  const terrain = text(data?.grid?.[y]?.[x], "海");
  return isPassableTerrain(terrain) && terrain !== "火山";
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
          moveCommandUnitId: "",
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

  const sourceUnits = Array.isArray(faction.units) ? faction.units : [];
  const positions = buildInitialUnitPositions(x, y, sourceUnits.length);
  const units = sourceUnits.map((unit, index) => {
    const position = positions[index];
    return {
      ...unit,
      x: position?.x ?? x,
      y: position?.y ?? y,
      ap: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.ap,
      currentAp: Number.isFinite(Number(unit.maxAp)) ? Number(unit.maxAp) : unit.currentAp
    };
  });
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

  const uniquePlaced = new Set(units.map(unit => coordKey(unit.x, unit.y))).size;
  const spreadText = uniquePlaced === units.length ? "周辺マスへ1体ずつ配置" : "周辺の空きマスを優先して配置";
  showBanner(`拠点を (${x}, ${y}) に設置し、キャラ${units.length}体を${spreadText}しました`);
  window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", {
    detail: {
      x,
      y,
      village,
      unitIds: units.map(unit => unit.id).filter(Boolean),
      unitPositions: units.map(unit => ({ id: unit.id, x: unit.x, y: unit.y })),
      playerId: player.id
    }
  }));
  return true;
}

function handleTileSelected(event) {
  const faction = getActiveFaction();
  if (!faction?.villagePlacementMode) return;
  placeInitialBase(event.detail);
}

function syncPlacementMode() {
  const faction = getActiveFaction();
  if (!faction) return;
  if (faction.villagePlacementMode) {
    showBanner("拠点を設置するマスを選択してください", true);
  } else if (faction.village?.placed) {
    hideBanner();
  }
}

function handleFieldGenerated() {
  const faction = getActiveFaction();
  if (!faction) return;

  if (!faction.village?.placed) {
    beginInitialPlacement({ force:true });
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
