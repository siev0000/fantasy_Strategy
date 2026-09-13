import { applyV39DerivedCharacterData } from "./v39-character-derived-rules.js";
import { createPlayerFactionState, createPlayerRecord } from "./lib/player-state.js";

const EMPTY_STATE = Object.freeze({
  activePlayerId: "",
  players: [],
  factionLabels: {},
  territoryOwnerByTile: {},
  dangerPercentByTile: {},
  facilitiesByTile: {},
  settlements: [],
  territoryStateByTile: {},
  recoveryPercentByTile: {},
  lastMoveStop: null,
  enemies: []
});

function cloneRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function normalizeEntityArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(row => ({ ...row })) : [];
}

function normalizeUnitArray(value) {
  return Array.isArray(value)
    ? value.filter(Boolean).map(row => applyV39DerivedCharacterData(row))
    : [];
}

function normalizeFactionState(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const base = createPlayerFactionState(source);
  return {
    ...base,
    units: normalizeUnitArray(source.units),
    squads: normalizeEntityArray(source.squads),
    deadUnitReserve: normalizeEntityArray(source.deadUnitReserve),
    village: source.village && typeof source.village === "object" ? { ...source.village } : null,
    encounterMoveLocks: cloneRecord(source.encounterMoveLocks)
  };
}

function normalizePlayers(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map((player, index) => {
    const base = createPlayerRecord(player, index);
    return { ...base, factionState:normalizeFactionState(player?.factionState) };
  });
}

function normalizeState(input = {}) {
  const players = normalizePlayers(input.players);
  const requestedActiveId = String(input.activePlayerId || "");
  const activePlayerId = players.some(player => player.id === requestedActiveId)
    ? requestedActiveId
    : (players[0]?.id || "");
  return {
    activePlayerId,
    players,
    factionLabels: cloneRecord(input.factionLabels),
    territoryOwnerByTile: cloneRecord(input.territoryOwnerByTile),
    dangerPercentByTile: cloneRecord(input.dangerPercentByTile),
    facilitiesByTile: cloneRecord(input.facilitiesByTile),
    settlements: normalizeEntityArray(input.settlements),
    territoryStateByTile: cloneRecord(input.territoryStateByTile),
    recoveryPercentByTile: cloneRecord(input.recoveryPercentByTile),
    lastMoveStop: input.lastMoveStop && typeof input.lastMoveStop === "object" ? { ...input.lastMoveStop } : null,
    enemies: normalizeUnitArray(input.enemies)
  };
}

function cloneUnit(unit) {
  return {
    ...unit,
    status: cloneRecord(unit?.status),
    skillLevels: cloneRecord(unit?.skillLevels),
    acquiredSkillNames: Array.isArray(unit?.acquiredSkillNames) ? [...unit.acquiredSkillNames] : unit?.acquiredSkillNames,
    techniques: normalizeEntityArray(unit?.techniques),
    derivedCharacter: cloneRecord(unit?.derivedCharacter)
  };
}

function cloneFactionState(factionState = {}) {
  const base = createPlayerFactionState(factionState);
  return {
    ...base,
    units: Array.isArray(factionState.units) ? factionState.units.map(cloneUnit) : [],
    squads: normalizeEntityArray(factionState.squads),
    deadUnitReserve: normalizeEntityArray(factionState.deadUnitReserve),
    village: factionState.village && typeof factionState.village === "object" ? { ...factionState.village } : null,
    encounterMoveLocks: cloneRecord(factionState.encounterMoveLocks)
  };
}

function clonePlayer(player) {
  return { ...player, factionState:cloneFactionState(player.factionState) };
}

let state = normalizeState(window.V39_INITIAL_GAME_STATE || EMPTY_STATE);

function getState() {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    factionLabels: { ...state.factionLabels },
    territoryOwnerByTile: { ...state.territoryOwnerByTile },
    dangerPercentByTile: { ...state.dangerPercentByTile },
    facilitiesByTile: { ...state.facilitiesByTile },
    settlements: state.settlements.map(row => ({ ...row })),
    territoryStateByTile: { ...state.territoryStateByTile },
    recoveryPercentByTile: { ...state.recoveryPercentByTile },
    lastMoveStop: state.lastMoveStop ? { ...state.lastMoveStop } : null,
    enemies: state.enemies.map(cloneUnit)
  };
}

function getActivePlayer() {
  const player = state.players.find(row => row.id === state.activePlayerId) || state.players[0] || null;
  return player ? clonePlayer(player) : null;
}

function getActiveFactionState() {
  return getActivePlayer()?.factionState || null;
}

function dispatchChange(reason = "update") {
  window.dispatchEvent(new CustomEvent("v39:game-state-changed", { detail:{ reason, state:getState() } }));
}

function setState(patch = {}, options = {}) {
  const next = { ...state };
  if (Object.prototype.hasOwnProperty.call(patch, "players")) next.players = normalizePlayers(patch.players);
  if (Object.prototype.hasOwnProperty.call(patch, "activePlayerId")) next.activePlayerId = String(patch.activePlayerId || "");
  if (Object.prototype.hasOwnProperty.call(patch, "factionLabels")) next.factionLabels = cloneRecord(patch.factionLabels);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryOwnerByTile")) next.territoryOwnerByTile = cloneRecord(patch.territoryOwnerByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "dangerPercentByTile")) next.dangerPercentByTile = cloneRecord(patch.dangerPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "facilitiesByTile")) next.facilitiesByTile = cloneRecord(patch.facilitiesByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "settlements")) next.settlements = normalizeEntityArray(patch.settlements);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryStateByTile")) next.territoryStateByTile = cloneRecord(patch.territoryStateByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercentByTile")) next.recoveryPercentByTile = cloneRecord(patch.recoveryPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "lastMoveStop")) next.lastMoveStop = patch.lastMoveStop && typeof patch.lastMoveStop === "object" ? { ...patch.lastMoveStop } : null;
  if (Object.prototype.hasOwnProperty.call(patch, "enemies")) next.enemies = normalizeUnitArray(patch.enemies);
  state = normalizeState(next);
  if (options.silent !== true) dispatchChange(options.reason || "set");
  return getState();
}

function setActivePlayer(playerId, options = {}) {
  const id = String(playerId || "");
  if (!state.players.some(player => player.id === id)) return getActivePlayer();
  state = { ...state, activePlayerId:id };
  if (options.silent !== true) dispatchChange("active-player");
  return getActivePlayer();
}

function updateActiveFactionState(patch = {}, options = {}) {
  const activeId = state.activePlayerId;
  state = {
    ...state,
    players: state.players.map(player => player.id === activeId
      ? { ...player, factionState:normalizeFactionState({ ...player.factionState, ...patch }) }
      : player)
  };
  if (options.silent !== true) dispatchChange(options.reason || "active-faction");
  return getActiveFactionState();
}

function coordKey(x, y) {
  const nx = Math.floor(Number(x));
  const ny = Math.floor(Number(y));
  return Number.isFinite(nx) && Number.isFinite(ny) ? `${nx},${ny}` : "";
}

function updateTileState(x, y, patch = {}) {
  const key = coordKey(x, y);
  if (!key) return getState();
  if (Object.prototype.hasOwnProperty.call(patch, "owner")) state.territoryOwnerByTile = { ...state.territoryOwnerByTile, [key]:patch.owner };
  if (Object.prototype.hasOwnProperty.call(patch, "dangerPercent")) state.dangerPercentByTile = { ...state.dangerPercentByTile, [key]:patch.dangerPercent };
  if (Object.prototype.hasOwnProperty.call(patch, "facilities")) state.facilitiesByTile = { ...state.facilitiesByTile, [key]:patch.facilities };
  if (Object.prototype.hasOwnProperty.call(patch, "territoryState")) state.territoryStateByTile = { ...state.territoryStateByTile, [key]:patch.territoryState };
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercent")) state.recoveryPercentByTile = { ...state.recoveryPercentByTile, [key]:patch.recoveryPercent };
  dispatchChange("tile");
  return getState();
}

function clearState(options = {}) {
  state = normalizeState(EMPTY_STATE);
  if (options.silent !== true) dispatchChange("clear");
  return getState();
}

window.getV39GameState = getState;
window.setV39GameState = setState;
window.getV39ActivePlayer = getActivePlayer;
window.getV39ActiveFactionState = getActiveFactionState;
window.setV39ActivePlayer = setActivePlayer;
window.updateV39ActiveFactionState = updateActiveFactionState;
window.updateV39TileState = updateTileState;
window.clearV39GameState = clearState;
window.__v39GameStateDefaults = normalizeState(window.V39_INITIAL_GAME_STATE || EMPTY_STATE);

export {
  coordKey,
  getState,
  setState,
  getActivePlayer,
  getActiveFactionState,
  setActivePlayer,
  updateActiveFactionState,
  updateTileState,
  clearState,
  normalizeState
};
