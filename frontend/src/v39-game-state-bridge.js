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
  neutralVillages: [],
  wandererGroups: [],
  territoryStateByTile: {},
  recoveryPercentByTile: {},
  explorationSitesByTile: {},
  diplomacyRelations: {},
  lastMoveStop: null,
  enemies: [],
  worldEnvironment: {
    processedTurn: 0,
    volcanoData: null,
    lavaState: { flows: [] },
    lavaFlowData: { nodeKeys: [], edgeKeys: [], sourceKeys: [] },
    lastTerrainEvents: []
  },
  enemyCombatRuntime: {
    pendingActionsByEnemyId: {},
    lastActionAtMsByEnemyId: {},
    cooldownsByEnemyId: {},
    activeEffectsByEnemyId: {}
  },
  timeline: {
    turnNumber: 1,
    paused: false,
    elapsedMs: 0,
    lastTurnAdvancedAtMs: 0,
    lastResolvedTurn: 0,
    lastStageSequence: []
  }
});

function cloneRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? cloneValue(value, {}) : {};
}

function cloneValue(value, fallback = null) {
  if (value === undefined) return fallback;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

const cloneJson = cloneValue;

function normalizeWorldEnvironment(value = {}) {
  return {
    processedTurn:Math.max(0, Math.floor(Number(value?.processedTurn) || 0)),
    volcanoData:cloneJson(value?.volcanoData, null),
    lavaState:cloneJson(value?.lavaState, { flows:[] }),
    lavaFlowData:cloneJson(value?.lavaFlowData, { nodeKeys:[], edgeKeys:[], sourceKeys:[] }),
    lastTerrainEvents:cloneJson(value?.lastTerrainEvents, [])
  };
}

function normalizeEntityArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(row => cloneValue(row, {})) : [];
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
    deathHistory: normalizeEntityArray(source.deathHistory),
    village: source.village && typeof source.village === "object" ? cloneValue(source.village, null) : null,
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
    neutralVillages: normalizeEntityArray(input.neutralVillages),
    wandererGroups: normalizeEntityArray(input.wandererGroups),
    territoryStateByTile: cloneRecord(input.territoryStateByTile),
    recoveryPercentByTile: cloneRecord(input.recoveryPercentByTile),
    explorationSitesByTile: cloneJson(input.explorationSitesByTile, {}),
    diplomacyRelations: cloneJson(input.diplomacyRelations, {}),
    lastMoveStop: input.lastMoveStop && typeof input.lastMoveStop === "object" ? { ...input.lastMoveStop } : null,
    enemies: normalizeUnitArray(input.enemies),
    worldEnvironment: normalizeWorldEnvironment(input.worldEnvironment),
    enemyCombatRuntime: {
      pendingActionsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.pendingActionsByEnemyId),
      lastActionAtMsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.lastActionAtMsByEnemyId),
      cooldownsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.cooldownsByEnemyId),
      activeEffectsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.activeEffectsByEnemyId)
    },
    timeline: {
      turnNumber: Math.max(1, Math.floor(Number(input?.timeline?.turnNumber) || 1)),
      paused: input?.timeline?.paused === true,
      elapsedMs: Math.max(0, Number(input?.timeline?.elapsedMs) || 0),
      lastTurnAdvancedAtMs: Math.max(0, Number(input?.timeline?.lastTurnAdvancedAtMs) || 0),
      lastResolvedTurn:Math.max(0, Math.floor(Number(input?.timeline?.lastResolvedTurn) || 0)),
      lastStageSequence:Array.isArray(input?.timeline?.lastStageSequence) ? input.timeline.lastStageSequence.map(String) : []
    }
  };
}

function cloneUnit(unit) {
  return {
    ...unit,
    status: cloneRecord(unit?.status),
    skillLevels: cloneRecord(unit?.skillLevels),
    acquiredSkillNames: Array.isArray(unit?.acquiredSkillNames) ? [...unit.acquiredSkillNames] : unit?.acquiredSkillNames,
    techniques: normalizeEntityArray(unit?.techniques),
    equipment:Array.isArray(unit?.equipment) ? unit.equipment.map(row => ({ ...row, resistanceBonus:cloneRecord(row?.resistanceBonus), source:cloneRecord(row?.source) })) : [],
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
    deathHistory: normalizeEntityArray(factionState.deathHistory),
    village: factionState.village && typeof factionState.village === "object" ? cloneValue(factionState.village, null) : null,
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
    neutralVillages: state.neutralVillages.map(row => ({ ...row })),
    wandererGroups: state.wandererGroups.map(row => ({ ...row, discoveredByPlayerIds:Array.isArray(row?.discoveredByPlayerIds) ? [...row.discoveredByPlayerIds] : [] })),
    territoryStateByTile: { ...state.territoryStateByTile },
    recoveryPercentByTile: { ...state.recoveryPercentByTile },
    explorationSitesByTile: cloneJson(state.explorationSitesByTile, {}),
    diplomacyRelations: cloneJson(state.diplomacyRelations, {}),
    lastMoveStop: state.lastMoveStop ? { ...state.lastMoveStop } : null,
    enemies: state.enemies.map(cloneUnit),
    worldEnvironment: normalizeWorldEnvironment(state.worldEnvironment),
    enemyCombatRuntime: {
      pendingActionsByEnemyId:{ ...state.enemyCombatRuntime.pendingActionsByEnemyId },
      lastActionAtMsByEnemyId:{ ...state.enemyCombatRuntime.lastActionAtMsByEnemyId },
      cooldownsByEnemyId:{ ...state.enemyCombatRuntime.cooldownsByEnemyId },
      activeEffectsByEnemyId:{ ...state.enemyCombatRuntime.activeEffectsByEnemyId }
    },
    timeline: { ...state.timeline }
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
  if (Object.prototype.hasOwnProperty.call(patch, "neutralVillages")) next.neutralVillages = normalizeEntityArray(patch.neutralVillages);
  if (Object.prototype.hasOwnProperty.call(patch, "wandererGroups")) next.wandererGroups = normalizeEntityArray(patch.wandererGroups);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryStateByTile")) next.territoryStateByTile = cloneRecord(patch.territoryStateByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercentByTile")) next.recoveryPercentByTile = cloneRecord(patch.recoveryPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "explorationSitesByTile")) next.explorationSitesByTile = cloneJson(patch.explorationSitesByTile, {});
  if (Object.prototype.hasOwnProperty.call(patch, "diplomacyRelations")) next.diplomacyRelations = cloneJson(patch.diplomacyRelations, {});
  if (Object.prototype.hasOwnProperty.call(patch, "lastMoveStop")) next.lastMoveStop = patch.lastMoveStop && typeof patch.lastMoveStop === "object" ? { ...patch.lastMoveStop } : null;
  if (Object.prototype.hasOwnProperty.call(patch, "enemies")) next.enemies = normalizeUnitArray(patch.enemies);
  if (Object.prototype.hasOwnProperty.call(patch, "worldEnvironment")) next.worldEnvironment = normalizeWorldEnvironment(patch.worldEnvironment);
  if (Object.prototype.hasOwnProperty.call(patch, "enemyCombatRuntime")) next.enemyCombatRuntime = { ...state.enemyCombatRuntime, ...patch.enemyCombatRuntime };
  if (Object.prototype.hasOwnProperty.call(patch, "timeline")) next.timeline = { ...state.timeline, ...patch.timeline };
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
