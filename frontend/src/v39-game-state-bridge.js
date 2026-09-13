const EMPTY_STATE = Object.freeze({
  factionLabels: {},
  territoryOwnerByTile: {},
  dangerPercentByTile: {},
  facilitiesByTile: {},
  units: [],
  settlements: [],
  territoryStateByTile: {},
  recoveryPercentByTile: {},
  lastMoveStop: null,
  enemies: []
});

let state = createEmptyState();

function createEmptyState() {
  return {
    factionLabels: {},
    territoryOwnerByTile: {},
    dangerPercentByTile: {},
    facilitiesByTile: {},
    units: [],
    settlements: [],
    territoryStateByTile: {},
    recoveryPercentByTile: {},
    lastMoveStop: null,
    enemies: []
  };
}

function coordKey(x, y) {
  const nx = Math.floor(Number(x));
  const ny = Math.floor(Number(y));
  return Number.isFinite(nx) && Number.isFinite(ny) ? `${nx},${ny}` : "";
}

function cloneRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeEntityArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(row => ({ ...row })) : [];
}

function normalizeState(input = {}) {
  return {
    factionLabels: cloneRecord(input.factionLabels),
    territoryOwnerByTile: cloneRecord(input.territoryOwnerByTile),
    dangerPercentByTile: cloneRecord(input.dangerPercentByTile),
    facilitiesByTile: cloneRecord(input.facilitiesByTile),
    units: normalizeEntityArray(input.units),
    settlements: normalizeEntityArray(input.settlements),
    territoryStateByTile: cloneRecord(input.territoryStateByTile),
    recoveryPercentByTile: cloneRecord(input.recoveryPercentByTile),
    lastMoveStop: input.lastMoveStop && typeof input.lastMoveStop === "object" ? { ...input.lastMoveStop } : null,
    enemies: normalizeEntityArray(input.enemies)
  };
}

function dispatchChange(reason = "update") {
  window.dispatchEvent(new CustomEvent("v39:game-state-changed", {
    detail: { reason, state: getState() }
  }));
}

function getState() {
  return {
    ...state,
    factionLabels: { ...state.factionLabels },
    territoryOwnerByTile: { ...state.territoryOwnerByTile },
    dangerPercentByTile: { ...state.dangerPercentByTile },
    facilitiesByTile: { ...state.facilitiesByTile },
    units: state.units.map(row => ({ ...row })),
    settlements: state.settlements.map(row => ({ ...row })),
    territoryStateByTile: { ...state.territoryStateByTile },
    recoveryPercentByTile: { ...state.recoveryPercentByTile },
    lastMoveStop: state.lastMoveStop ? { ...state.lastMoveStop } : null,
    enemies: state.enemies.map(row => ({ ...row }))
  };
}

function setState(patch = {}, options = {}) {
  const next = { ...state };
  if (Object.prototype.hasOwnProperty.call(patch, "factionLabels")) next.factionLabels = cloneRecord(patch.factionLabels);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryOwnerByTile")) next.territoryOwnerByTile = cloneRecord(patch.territoryOwnerByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "dangerPercentByTile")) next.dangerPercentByTile = cloneRecord(patch.dangerPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "facilitiesByTile")) next.facilitiesByTile = cloneRecord(patch.facilitiesByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "units")) next.units = normalizeEntityArray(patch.units);
  if (Object.prototype.hasOwnProperty.call(patch, "settlements")) next.settlements = normalizeEntityArray(patch.settlements);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryStateByTile")) next.territoryStateByTile = cloneRecord(patch.territoryStateByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercentByTile")) next.recoveryPercentByTile = cloneRecord(patch.recoveryPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "lastMoveStop")) next.lastMoveStop = patch.lastMoveStop && typeof patch.lastMoveStop === "object" ? { ...patch.lastMoveStop } : null;
  if (Object.prototype.hasOwnProperty.call(patch, "enemies")) next.enemies = normalizeEntityArray(patch.enemies);
  state = next;
  if (options.silent !== true) dispatchChange(options.reason || "set");
  return getState();
}

function updateTileState(x, y, patch = {}) {
  const key = coordKey(x, y);
  if (!key) return getState();

  if (Object.prototype.hasOwnProperty.call(patch, "owner")) {
    state.territoryOwnerByTile = { ...state.territoryOwnerByTile, [key]: patch.owner };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "dangerPercent")) {
    state.dangerPercentByTile = { ...state.dangerPercentByTile, [key]: patch.dangerPercent };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "facilities")) {
    state.facilitiesByTile = { ...state.facilitiesByTile, [key]: patch.facilities };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "territoryState")) {
    state.territoryStateByTile = { ...state.territoryStateByTile, [key]: patch.territoryState };
  }
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercent")) {
    state.recoveryPercentByTile = { ...state.recoveryPercentByTile, [key]: patch.recoveryPercent };
  }
  dispatchChange("tile");
  return getState();
}

function clearState(options = {}) {
  state = createEmptyState();
  if (options.silent !== true) dispatchChange("clear");
  return getState();
}

window.getV39GameState = getState;
window.setV39GameState = setState;
window.updateV39TileState = updateTileState;
window.clearV39GameState = clearState;
window.__v39GameStateDefaults = EMPTY_STATE;

export { coordKey, getState, setState, updateTileState, clearState, normalizeState };
