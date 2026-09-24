import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { createPlayerFactionState, createPlayerRecord } from "../../lib/player-state.js";
import { normalizeFactionSettlements, normalizeTerritoryStateRecord } from "../../lib/settlement-state.js";
import { normalizeV39EnemyNests, normalizeV39EnemySquads, normalizeV39GroundLootByTile, normalizeV39SquadLogistics } from "../../lib/v39-logistics-state.js";
import { normalizeV39Village } from "../../lib/v39-economy-rules.js";
import { normalizeGameStartSettings } from "../../lib/game-start-settings.js";
import { isV39TestSkillModeEnabled } from "../../lib/v39-test-skill-rules.js";
import {
  normalizeV39LocalPlayerCount,
  normalizeV39LocalParticipantCount,
  normalizeV39PlayerTurnTimeline,
  normalizeV39SessionPlayers
} from "../../lib/v39-local-multiplayer-session.js";

const EMPTY_STATE = Object.freeze({
  activePlayerId: "",
  players: [],
  sessionParticipants: [],
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
  enemySquads: [],
  enemyNests: [],
  groundLootByTile: {},
  worldEnvironment: {
    processedTurn: 0,
    volcanoData: null,
    lavaState: { flows: [] },
    lavaFlowData: { nodeKeys: [], edgeKeys: [], sourceKeys: [] },
    lastTerrainEvents: [],
    activeTerrainEffects: []
  },
  enemyCombatRuntime: {
    pendingActionsByEnemyId: {},
    lastActionTurnByEnemyId: {},
    cooldownsByEnemyId: {},
    activeEffectsByEnemyId: {},
    decisionLogsByFactionId: {}
  },
  gameSettings: normalizeGameStartSettings(),
  timeline: {
    turnNumber: 1,
    phase: "player",
    paused: false,
    lastResolvedTurn: 0,
    lastStageSequence: [],
    playerTurnOrder: [],
    activeTurnPlayerId: "",
    endedPlayerIds: []
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
    lastTerrainEvents:cloneJson(value?.lastTerrainEvents, []),
    activeTerrainEffects:cloneJson(value?.activeTerrainEffects, [])
  };
}

function normalizeEntityArray(value) {
  return Array.isArray(value) ? value.filter(Boolean).map(row => cloneValue(row, {})) : [];
}

function firstFiniteUnitNumber(values, fallback = 0) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeUnitCommonAp(unit = {}) {
  const maxAp = Math.max(0, Math.floor(firstFiniteUnitNumber([
    unit?.maxAp,
    unit?.maxActionPoint,
    unit?.status?.AP
  ], 100)));
  const ap = Math.max(0, Math.min(maxAp, Math.floor(firstFiniteUnitNumber([
    unit?.ap,
    unit?.currentAp,
    unit?.actionPoint
  ], maxAp))));
  return { ...unit, maxAp, ap, currentAp:ap, actionPoint:ap };
}

function normalizeUnitArray(value) {
  return Array.isArray(value)
    ? value
      .filter(Boolean)
      .filter(row => row?.testOnly !== true || isV39TestSkillModeEnabled())
      .map(row => normalizeUnitCommonAp(applyV39DerivedCharacterData(row)))
    : [];
}

function normalizeFactionState(value = {}, ownerPlayerId = "", race = "只人") {
  const source = value && typeof value === "object" ? value : {};
  const base = createPlayerFactionState(source, ownerPlayerId);
  const settlementState = normalizeFactionSettlements(base, ownerPlayerId);
  const selectedSettlement = settlementState.settlements.find(row => row.settlementId === settlementState.selectedSettlementId) || null;
  const fallbackSettlementId = String(selectedSettlement?.settlementId || selectedSettlement?.id || "");
  return {
    ...base,
    units: normalizeUnitArray(source.units).map(unit => ({
      ...unit,
      settlementId:String(unit?.settlementId || fallbackSettlementId)
    })),
    squads: normalizeEntityArray(source.squads).map(normalizeV39SquadLogistics),
    deadUnitReserve: normalizeEntityArray(source.deadUnitReserve),
    deathHistory: normalizeEntityArray(source.deathHistory),
    settlements: settlementState.settlements.map(row => normalizeV39Village(row, race)).filter(Boolean),
    selectedSettlementId: settlementState.selectedSettlementId,
    encounterMoveLocks: cloneRecord(source.encounterMoveLocks)
  };
}

function normalizePlayers(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(Boolean).map((player, index) => {
    const base = createPlayerRecord(player, index);
    return { ...base, factionState:normalizeFactionState(player?.factionState, base.id, base.race) };
  });
}

function deriveWorldSettlements(players, sourceRows) {
  const playerIds = new Set(players.map(player => String(player.id)));
  const external = normalizeEntityArray(sourceRows).filter(row => !playerIds.has(String(row?.ownerPlayerId || "")));
  const owned = players.flatMap(player => (player?.factionState?.settlements || []).map(row => ({
    ...cloneValue(row, {}),
    id:String(row?.settlementId || row?.id || ""),
    settlementId:String(row?.settlementId || row?.id || ""),
    ownerPlayerId:player.id
  }))).filter(row => row.id);
  return [...external, ...owned];
}

function normalizeState(input = {}) {
  const initialPlayers = normalizePlayers(input.players);
  const session = normalizeV39SessionPlayers(initialPlayers, input.sessionParticipants);
  const players = session.players;
  const requestedActiveId = String(input.activePlayerId || "");
  const activePlayerId = players.some(player => player.id === requestedActiveId)
    ? requestedActiveId
    : (players[0]?.id || "");
  return {
    activePlayerId,
    players,
    sessionParticipants:session.sessionParticipants,
    factionLabels: cloneRecord(input.factionLabels),
    territoryOwnerByTile: cloneRecord(input.territoryOwnerByTile),
    dangerPercentByTile: cloneRecord(input.dangerPercentByTile),
    facilitiesByTile: cloneRecord(input.facilitiesByTile),
    settlements: deriveWorldSettlements(players, input.settlements),
    neutralVillages: normalizeEntityArray(input.neutralVillages),
    wandererGroups: normalizeEntityArray(input.wandererGroups),
    territoryStateByTile: Object.fromEntries(Object.entries(cloneRecord(input.territoryStateByTile))
      .map(([key, value]) => [key, normalizeTerritoryStateRecord(value)])),
    recoveryPercentByTile: cloneRecord(input.recoveryPercentByTile),
    explorationSitesByTile: cloneJson(input.explorationSitesByTile, {}),
    diplomacyRelations: cloneJson(input.diplomacyRelations, {}),
    lastMoveStop: input.lastMoveStop && typeof input.lastMoveStop === "object" ? { ...input.lastMoveStop } : null,
    enemies: normalizeUnitArray(input.enemies),
    enemySquads:normalizeV39EnemySquads(input.enemySquads),
    enemyNests:normalizeV39EnemyNests(input.enemyNests),
    groundLootByTile:normalizeV39GroundLootByTile(input.groundLootByTile),
    worldEnvironment: normalizeWorldEnvironment(input.worldEnvironment),
    enemyCombatRuntime: {
      pendingActionsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.pendingActionsByEnemyId),
      lastActionTurnByEnemyId: cloneRecord(input?.enemyCombatRuntime?.lastActionTurnByEnemyId),
      cooldownsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.cooldownsByEnemyId),
      activeEffectsByEnemyId: cloneRecord(input?.enemyCombatRuntime?.activeEffectsByEnemyId),
      decisionLogsByFactionId:Object.fromEntries(Object.entries(input?.enemyCombatRuntime?.decisionLogsByFactionId || {})
        .map(([factionId, rows]) => [String(factionId), normalizeEntityArray(rows).slice(-200)]))
    },
    gameSettings: normalizeGameStartSettings(input?.gameSettings),
    timeline: {
      turnNumber: Math.max(1, Math.floor(Number(input?.timeline?.turnNumber) || 1)),
      phase:["player", "enemy", "resolution"].includes(input?.timeline?.phase) ? input.timeline.phase : "player",
      paused: input?.timeline?.paused === true,
      lastResolvedTurn:Math.max(0, Math.floor(Number(input?.timeline?.lastResolvedTurn) || 0)),
      lastStageSequence:Array.isArray(input?.timeline?.lastStageSequence) ? input.timeline.lastStageSequence.map(String) : [],
      ...normalizeV39PlayerTurnTimeline(input?.timeline, players, activePlayerId)
    }
  };
}

function cloneUnit(unit) {
  return {
    ...unit,
    status: cloneRecord(unit?.status),
    skillLevels: cloneRecord(unit?.skillLevels),
    acquiredSkillNames: Array.isArray(unit?.acquiredSkillNames) ? [...unit.acquiredSkillNames] : unit?.acquiredSkillNames,
    testSkillNames: Array.isArray(unit?.testSkillNames) ? [...unit.testSkillNames] : unit?.testSkillNames,
    techniques: normalizeEntityArray(unit?.techniques),
    equipment:Array.isArray(unit?.equipment) ? unit.equipment.map(row => ({ ...row, resistanceBonus:cloneRecord(row?.resistanceBonus), source:cloneRecord(row?.source) })) : [],
    derivedCharacter: cloneRecord(unit?.derivedCharacter)
  };
}

function cloneFactionState(factionState = {}, race = "只人") {
  const base = createPlayerFactionState(factionState);
  return {
    ...base,
    units: Array.isArray(factionState.units) ? factionState.units.map(cloneUnit) : [],
    squads: normalizeEntityArray(factionState.squads).map(normalizeV39SquadLogistics),
    deadUnitReserve: normalizeEntityArray(factionState.deadUnitReserve),
    deathHistory: normalizeEntityArray(factionState.deathHistory),
    settlements: base.settlements.map(row => normalizeV39Village(row, race)).filter(Boolean),
    selectedSettlementId: base.selectedSettlementId,
    encounterMoveLocks: cloneRecord(factionState.encounterMoveLocks)
  };
}

function clonePlayer(player) {
  return { ...player, factionState:cloneFactionState(player.factionState, player.race) };
}

function cloneSessionParticipants(value) {
  return (Array.isArray(value) ? value : []).map(row => ({
    ...row,
    assignedPlayerIds:Array.isArray(row?.assignedPlayerIds) ? [...row.assignedPlayerIds] : []
  }));
}

let state = normalizeState(window.V39_INITIAL_GAME_STATE || EMPTY_STATE);

function getState() {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    sessionParticipants:cloneSessionParticipants(state.sessionParticipants),
    factionLabels: { ...state.factionLabels },
    territoryOwnerByTile: { ...state.territoryOwnerByTile },
    dangerPercentByTile: { ...state.dangerPercentByTile },
    facilitiesByTile: { ...state.facilitiesByTile },
    settlements: state.settlements.map(row => ({ ...row })),
    neutralVillages: state.neutralVillages.map(row => ({ ...row })),
    wandererGroups: state.wandererGroups.map(row => ({ ...row, discoveredByPlayerIds:Array.isArray(row?.discoveredByPlayerIds) ? [...row.discoveredByPlayerIds] : [] })),
    territoryStateByTile: Object.fromEntries(Object.entries(state.territoryStateByTile)
      .map(([key, value]) => [key, { ...value }])),
    recoveryPercentByTile: { ...state.recoveryPercentByTile },
    explorationSitesByTile: cloneJson(state.explorationSitesByTile, {}),
    diplomacyRelations: cloneJson(state.diplomacyRelations, {}),
    lastMoveStop: state.lastMoveStop ? { ...state.lastMoveStop } : null,
    enemies: state.enemies.map(cloneUnit),
    enemySquads:normalizeV39EnemySquads(state.enemySquads),
    enemyNests:normalizeV39EnemyNests(state.enemyNests),
    groundLootByTile:normalizeV39GroundLootByTile(state.groundLootByTile),
    worldEnvironment: normalizeWorldEnvironment(state.worldEnvironment),
    enemyCombatRuntime: {
      pendingActionsByEnemyId:{ ...state.enemyCombatRuntime.pendingActionsByEnemyId },
      lastActionTurnByEnemyId:{ ...state.enemyCombatRuntime.lastActionTurnByEnemyId },
      cooldownsByEnemyId:{ ...state.enemyCombatRuntime.cooldownsByEnemyId },
      activeEffectsByEnemyId:{ ...state.enemyCombatRuntime.activeEffectsByEnemyId },
      decisionLogsByFactionId:Object.fromEntries(Object.entries(state.enemyCombatRuntime.decisionLogsByFactionId || {})
        .map(([factionId, rows]) => [factionId, normalizeEntityArray(rows)]))
    },
    gameSettings: { ...state.gameSettings },
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

function getTimelineState() {
  return { ...state.timeline };
}

function dispatchChange(reason = "update") {
  window.dispatchEvent(new CustomEvent("v39:game-state-changed", { detail:{ reason, state:getState() } }));
}

function setState(patch = {}, options = {}) {
  const next = { ...state };
  if (Object.prototype.hasOwnProperty.call(patch, "players")) next.players = normalizePlayers(patch.players);
  if (Object.prototype.hasOwnProperty.call(patch, "sessionParticipants")) next.sessionParticipants = cloneSessionParticipants(patch.sessionParticipants);
  if (Object.prototype.hasOwnProperty.call(patch, "activePlayerId")) next.activePlayerId = String(patch.activePlayerId || "");
  if (Object.prototype.hasOwnProperty.call(patch, "factionLabels")) next.factionLabels = cloneRecord(patch.factionLabels);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryOwnerByTile")) next.territoryOwnerByTile = cloneRecord(patch.territoryOwnerByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "dangerPercentByTile")) next.dangerPercentByTile = cloneRecord(patch.dangerPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "facilitiesByTile")) next.facilitiesByTile = cloneRecord(patch.facilitiesByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "settlements")) next.settlements = normalizeEntityArray(patch.settlements);
  if (Object.prototype.hasOwnProperty.call(patch, "neutralVillages")) next.neutralVillages = normalizeEntityArray(patch.neutralVillages);
  if (Object.prototype.hasOwnProperty.call(patch, "wandererGroups")) next.wandererGroups = normalizeEntityArray(patch.wandererGroups);
  if (Object.prototype.hasOwnProperty.call(patch, "territoryStateByTile")) next.territoryStateByTile = Object.fromEntries(
    Object.entries(cloneRecord(patch.territoryStateByTile)).map(([key, value]) => [key, normalizeTerritoryStateRecord(value)])
  );
  if (Object.prototype.hasOwnProperty.call(patch, "recoveryPercentByTile")) next.recoveryPercentByTile = cloneRecord(patch.recoveryPercentByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "explorationSitesByTile")) next.explorationSitesByTile = cloneJson(patch.explorationSitesByTile, {});
  if (Object.prototype.hasOwnProperty.call(patch, "diplomacyRelations")) next.diplomacyRelations = cloneJson(patch.diplomacyRelations, {});
  if (Object.prototype.hasOwnProperty.call(patch, "lastMoveStop")) next.lastMoveStop = patch.lastMoveStop && typeof patch.lastMoveStop === "object" ? { ...patch.lastMoveStop } : null;
  if (Object.prototype.hasOwnProperty.call(patch, "enemies")) next.enemies = normalizeUnitArray(patch.enemies);
  if (Object.prototype.hasOwnProperty.call(patch, "enemySquads")) next.enemySquads = normalizeV39EnemySquads(patch.enemySquads);
  if (Object.prototype.hasOwnProperty.call(patch, "enemyNests")) next.enemyNests = normalizeV39EnemyNests(patch.enemyNests);
  if (Object.prototype.hasOwnProperty.call(patch, "groundLootByTile")) next.groundLootByTile = normalizeV39GroundLootByTile(patch.groundLootByTile);
  if (Object.prototype.hasOwnProperty.call(patch, "worldEnvironment")) next.worldEnvironment = normalizeWorldEnvironment(patch.worldEnvironment);
  if (Object.prototype.hasOwnProperty.call(patch, "enemyCombatRuntime")) next.enemyCombatRuntime = { ...state.enemyCombatRuntime, ...patch.enemyCombatRuntime };
  if (Object.prototype.hasOwnProperty.call(patch, "gameSettings")) next.gameSettings = normalizeGameStartSettings(patch.gameSettings);
  if (Object.prototype.hasOwnProperty.call(patch, "timeline")) next.timeline = { ...state.timeline, ...patch.timeline };
  state = normalizeState(next);
  if (options.silent !== true) dispatchChange(options.reason || "set");
  return getState();
}

// Enemy turns can update dozens of units. Intermediate states are normalized once
// by the normal turn-complete write instead of cloning the full state per enemy.
function patchEnemyTurnState(patch = {}) {
  const next = { ...state };
  if (Object.prototype.hasOwnProperty.call(patch, "enemies")) next.enemies = patch.enemies;
  if (Object.prototype.hasOwnProperty.call(patch, "enemyNests")) next.enemyNests = patch.enemyNests;
  if (Object.prototype.hasOwnProperty.call(patch, "enemyCombatRuntime")) {
    next.enemyCombatRuntime = { ...state.enemyCombatRuntime, ...patch.enemyCombatRuntime };
  }
  state = next;
  return true;
}

function setActivePlayer(playerId, options = {}) {
  const id = String(playerId || "");
  if (!state.players.some(player => player.id === id)) return getActivePlayer();
  state = { ...state, activePlayerId:id };
  if (options.silent !== true) dispatchChange("active-player");
  return getActivePlayer();
}

function updateTimelineState(patch = {}, options = {}) {
  const source = { ...state.timeline, ...(patch && typeof patch === "object" ? patch : {}) };
  state = {
    ...state,
    timeline:{
      turnNumber:Math.max(1, Math.floor(Number(source.turnNumber) || 1)),
      phase:["player", "enemy", "resolution"].includes(source.phase) ? source.phase : "player",
      paused:source.paused === true,
      lastResolvedTurn:Math.max(0, Math.floor(Number(source.lastResolvedTurn) || 0)),
      lastStageSequence:Array.isArray(source.lastStageSequence) ? source.lastStageSequence.map(String) : [],
      ...normalizeV39PlayerTurnTimeline(source, state.players, state.activePlayerId)
    }
  };
  if (options.silent !== true) dispatchChange(options.reason || "timeline");
  return getTimelineState();
}

function resetFactionForNewLocalSession(factionState = {}) {
  const source = cloneValue(factionState, {});
  return {
    ...source,
    settlements:[],
    selectedSettlementId:"",
    selectedUnitId:String(source?.selectedUnitId || ""),
    villagePlacementMode:false,
    moveCommandUnitId:"",
    visibility:{
      exploredTileKeys:[], visibleTileKeys:[], spottedEnemyTileKeys:[],
      spottedFactionTileKeys:[], alertedEnemyTileKeys:[], alertedFactionTileKeys:[]
    },
    units:(Array.isArray(source?.units) ? source.units : []).map(unit => ({
      ...unit,
      x:null,
      y:null,
      settlementId:""
    }))
  };
}

function remapFactionIdentifiers(factionState = {}, playerId) {
  const faction = cloneValue(factionState, {});
  const unitIds = new Map((Array.isArray(faction.units) ? faction.units : []).map((unit, index) => {
    const previousId = String(unit?.id || `unit-${index + 1}`);
    return [previousId, `${playerId}-${previousId}`];
  }));
  const squadIds = new Map((Array.isArray(faction.squads) ? faction.squads : []).map((squad, index) => {
    const previousId = String(squad?.id || `squad-${index + 1}`);
    return [previousId, `${playerId}-${previousId}`];
  }));
  return {
    ...faction,
    selectedUnitId:unitIds.get(String(faction?.selectedUnitId || "")) || "",
    nationLogKey:playerId,
    units:(Array.isArray(faction.units) ? faction.units : []).map((unit, index) => {
      const previousId = String(unit?.id || `unit-${index + 1}`);
      return {
        ...unit,
        id:unitIds.get(previousId),
        squadId:squadIds.get(String(unit?.squadId || "")) || ""
      };
    }),
    squads:(Array.isArray(faction.squads) ? faction.squads : []).map((squad, index) => {
      const previousId = String(squad?.id || `squad-${index + 1}`);
      return {
        ...squad,
        id:squadIds.get(previousId),
        unitIds:(Array.isArray(squad?.unitIds) ? squad.unitIds : [])
          .map(unitId => unitIds.get(String(unitId || "")))
          .filter(Boolean)
      };
    })
  };
}

function createLocalSessionPlayers(count) {
  const templates = window.__v39GameStateDefaults?.players?.length
    ? window.__v39GameStateDefaults.players
    : state.players;
  if (!templates.length) return [];
  return Array.from({ length:count }, (_, index) => {
    const template = cloneValue(templates[index % templates.length], {});
    const playerId = `player-${index + 1}`;
    return createPlayerRecord({
      ...template,
      id:playerId,
      label:`プレイヤー${index + 1}`,
      isPlayer:true,
      controllerParticipantId:"local-1",
      factionState:resetFactionForNewLocalSession(remapFactionIdentifiers(template?.factionState, playerId))
    }, index);
  });
}

function createMultiplayerSessionPlayers(count, factionSelections = {}) {
  return Array.from({ length:count }, (_, index) => {
    const playerId = `player-${index + 1}`;
    const race = String(factionSelections?.[playerId] || "").trim();
    return createPlayerRecord({
      id:playerId,
      label:`プレイヤー${index + 1}`,
      isPlayer:true,
      controllerParticipantId:"",
      race,
      ready:false,
      factionState:createPlayerFactionState({}, playerId)
    }, index);
  });
}

function createLocalSessionParticipants(players, participantCount, assignments = {}) {
  const count = normalizeV39LocalParticipantCount(participantCount, players.length);
  const participants = Array.from({ length:count }, (_, index) => ({
    participantId:`local-${index + 1}`,
    name:`参加者${index + 1}`,
    controlMode:"local",
    assignedPlayerIds:[]
  }));
  const participantIds = new Set(participants.map(participant => participant.participantId));
  const normalizedPlayers = players.map((player, index) => {
    const requested = String(assignments?.[player.id] || "");
    const controllerParticipantId = participantIds.has(requested)
      ? requested
      : participants[index % participants.length].participantId;
    participants.find(participant => participant.participantId === controllerParticipantId)?.assignedPlayerIds.push(player.id);
    return { ...player, controllerParticipantId };
  });
  return { players:normalizedPlayers, sessionParticipants:participants };
}

function createRemoteSessionParticipants(players, participantSource, assignments = {}) {
  const source = Array.isArray(participantSource) ? participantSource.filter(Boolean) : [];
  const participants = source.map((participant, index) => ({
    participantId:String(participant?.participantId || "").trim() || `remote-${index + 1}`,
    name:String(participant?.displayName || participant?.name || "").trim() || `参加者${index + 1}`,
    controlMode:"remote",
    assignedPlayerIds:[]
  }));
  if (!participants.length) {
    return { players:[], sessionParticipants:[] };
  }
  const participantIds = new Set(participants.map(participant => participant.participantId));
  const normalizedPlayers = players.map((player, index) => {
    const requested = String(assignments?.[player.id] || "");
    const controllerParticipantId = participantIds.has(requested)
      ? requested
      : participants[index % participants.length].participantId;
    participants.find(participant => participant.participantId === controllerParticipantId)?.assignedPlayerIds.push(player.id);
    return { ...player, controllerParticipantId };
  });
  return { players:normalizedPlayers, sessionParticipants:participants };
}

function startMultiplayerSession(playerCount, options = {}) {
  const count = normalizeV39LocalPlayerCount(playerCount);
  const initialPlayers = createMultiplayerSessionPlayers(count, options?.playerFactionSelections);
  if (initialPlayers.some(player => !String(player?.race || "").trim())) {
    throw new Error("開始勢力が未選択のプレイヤーがいます。");
  }
  const session = createRemoteSessionParticipants(
    initialPlayers,
    options?.participants,
    options?.playerParticipantAssignments
  );
  if (!session.players.length || !session.sessionParticipants.length) {
    throw new Error("通信参加者がゲーム状態へ接続されていません。");
  }
  const players = session.players;
  const activePlayerId = players[0]?.id || "";
  const gameSettings = normalizeGameStartSettings(options?.gameSettings || state.gameSettings);
  state = normalizeState({
    ...EMPTY_STATE,
    gameSettings,
    players,
    activePlayerId,
    sessionParticipants:session.sessionParticipants,
    timeline:{
      ...EMPTY_STATE.timeline,
      playerTurnOrder:players.map(player => player.id),
      activeTurnPlayerId:activePlayerId,
      endedPlayerIds:[]
    }
  });
  dispatchChange("multiplayer-session-started");
  window.dispatchEvent(new CustomEvent("v39:multiplayer-session-started", {
    detail:{
      playerCount:count,
      participantCount:session.sessionParticipants.length,
      activePlayerId,
      playerIds:players.map(player => player.id),
      participantIds:session.sessionParticipants.map(participant => participant.participantId)
    }
  }));
  return getState();
}

function startLocalSession(playerCount, options = {}) {
  const count = normalizeV39LocalPlayerCount(playerCount);
  const initialPlayers = createLocalSessionPlayers(count);
  if (!initialPlayers.length) return getState();
  const session = createLocalSessionParticipants(
    initialPlayers,
    options?.participantCount,
    options?.playerParticipantAssignments
  );
  const players = session.players;
  const activePlayerId = players[0].id;
  const activeTurnPlayerId = activePlayerId;
  const gameSettings = normalizeGameStartSettings(options?.gameSettings || state.gameSettings);
  state = normalizeState({
    ...EMPTY_STATE,
    gameSettings,
    players,
    activePlayerId,
    sessionParticipants:session.sessionParticipants,
    timeline:{
      ...EMPTY_STATE.timeline,
      playerTurnOrder:players.map(player => player.id),
      activeTurnPlayerId,
      endedPlayerIds:[]
    }
  });
  dispatchChange("local-session-started");
  window.dispatchEvent(new CustomEvent("v39:local-session-started", {
    detail:{ playerCount:count, participantCount:session.sessionParticipants.length, activePlayerId, playerIds:players.map(player => player.id) }
  }));
  return getState();
}

function updateActiveFactionState(patch = {}, options = {}) {
  const activeId = state.activePlayerId;
  state = {
    ...state,
    players: state.players.map(player => player.id === activeId
      ? { ...player, factionState:normalizeFactionState({ ...player.factionState, ...patch }, player.id, player.race) }
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
  if (Object.prototype.hasOwnProperty.call(patch, "territoryState")) state.territoryStateByTile = {
    ...state.territoryStateByTile,
    [key]:normalizeTerritoryStateRecord(patch.territoryState, patch.settlementId)
  };
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
window.patchV39EnemyTurnState = patchEnemyTurnState;
window.getV39EnemyTurnState = () => state;
window.getV39ActivePlayer = getActivePlayer;
window.getV39ActiveFactionState = getActiveFactionState;
window.getV39TimelineState = getTimelineState;
window.setV39ActivePlayer = setActivePlayer;
window.updateV39TimelineState = updateTimelineState;
window.updateV39ActiveFactionState = updateActiveFactionState;
window.updateV39TileState = updateTileState;
window.clearV39GameState = clearState;
window.startV39LocalSession = startLocalSession;
window.startV39MultiplayerSession = startMultiplayerSession;
window.__v39GameStateDefaults = normalizeState(window.V39_INITIAL_GAME_STATE || EMPTY_STATE);

export {
  coordKey,
  getState,
  setState,
  getActivePlayer,
  getActiveFactionState,
  getTimelineState,
  setActivePlayer,
  updateTimelineState,
  updateActiveFactionState,
  updateTileState,
  clearState,
  normalizeState,
  startMultiplayerSession
};
