const VISIBILITY_ARRAY_KEYS = Object.freeze([
  "exploredTileKeys",
  "visibleTileKeys",
  "spottedEnemyTileKeys",
  "spottedFactionTileKeys",
  "alertedEnemyTileKeys",
  "alertedFactionTileKeys"
]);

const cloneRows = value => Array.isArray(value)
  ? value.filter(Boolean).map(row => ({ ...row }))
  : [];

const cloneRecord = value => value && typeof value === "object" && !Array.isArray(value)
  ? { ...value }
  : {};

export function createEmptyVisibilityState(source = {}) {
  return Object.fromEntries(VISIBILITY_ARRAY_KEYS.map(key => [
    key,
    Array.isArray(source?.[key]) ? source[key].map(value => String(value || "")).filter(Boolean) : []
  ]));
}

export function createEmptyResearchState(source = {}) {
  const progress = source?.progress && typeof source.progress === "object" ? source.progress : {};
  return {
    progress: {
      targetExpMap: cloneRecord(progress.targetExpMap),
      completedByCategoryLevel: cloneRecord(progress.completedByCategoryLevel),
      carryByCategory: cloneRecord(progress.carryByCategory)
    },
    selection: cloneRecord(source?.selection),
    assignedUnitIdByCategory: cloneRecord(source?.assignedUnitIdByCategory),
    lastProcessedTurn: Math.max(0, Math.floor(Number(source?.lastProcessedTurn) || 0))
  };
}

export function createEmptyCombatRuntime(source = {}) {
  return {
    cooldownsByUnitId: cloneRecord(source?.cooldownsByUnitId),
    activeEffectsByUnitId: cloneRecord(source?.activeEffectsByUnitId),
    pendingActionsByUnitId: cloneRecord(source?.pendingActionsByUnitId),
    lastEnemyActionAtMsById: cloneRecord(source?.lastEnemyActionAtMsById)
  };
}

export function createEmptyExplorationState(source = {}) {
  return {
    discoveredFeaturesByTile: cloneRecord(source?.discoveredFeaturesByTile),
    surveyedTileKeys: Array.isArray(source?.surveyedTileKeys) ? [...new Set(source.surveyedTileKeys.map(String).filter(Boolean))] : [],
    history: cloneRows(source?.history),
    lastProcessedTurn: Math.max(0, Math.floor(Number(source?.lastProcessedTurn) || 0))
  };
}

export function createPlayerFactionState(source = {}) {
  return {
    ...source,
    village: source?.village && typeof source.village === "object" ? { ...source.village } : null,
    units: cloneRows(source?.units),
    squads: cloneRows(source?.squads),
    deadUnitReserve: cloneRows(source?.deadUnitReserve),
    deathHistory: cloneRows(source?.deathHistory),
    selectedUnitId: String(source?.selectedUnitId || ""),
    villagePlacementMode: !!source?.villagePlacementMode,
    moveCommandUnitId: String(source?.moveCommandUnitId || ""),
    nationLogKey: String(source?.nationLogKey || ""),
    encounterMoveLocks: cloneRecord(source?.encounterMoveLocks),
    visibility: createEmptyVisibilityState(source?.visibility),
    research: createEmptyResearchState(source?.research),
    exploration: createEmptyExplorationState(source?.exploration),
    activityLog: cloneRows(source?.activityLog),
    aiState: {
      lastProcessedTurn: Math.max(0, Math.floor(Number(source?.aiState?.lastProcessedTurn) || 0)),
      lastCommands: Array.isArray(source?.aiState?.lastCommands) ? source.aiState.lastCommands.map(String) : [],
      history: cloneRows(source?.aiState?.history)
    },
    nationPolicy: {
      governmentSelections: cloneRecord(source?.nationPolicy?.governmentSelections),
      diplomacyStanceId: String(source?.nationPolicy?.diplomacyStanceId || ""),
      organizationIds: Array.isArray(source?.nationPolicy?.organizationIds) ? source.nationPolicy.organizationIds.map(String).filter(Boolean) : [],
      modifiers: cloneRecord(source?.nationPolicy?.modifiers)
    },
    combatRuntime: createEmptyCombatRuntime(source?.combatRuntime)
  };
}

export function createPlayerRecord(source = {}, index = 0) {
  const playerNo = Math.max(1, Math.floor(Number(index) + 1 || 1));
  return {
    ...source,
    id: String(source?.id || `player-${playerNo}`),
    label: String(source?.label || source?.displayName || `プレイヤー${playerNo}`),
    isPlayer: source?.isPlayer !== false,
    race: String(source?.race || ""),
    ready: !!source?.ready,
    factionState: createPlayerFactionState(source?.factionState)
  };
}

export const PLAYER_FACTION_STATE_KEYS = Object.freeze([
  "village",
  "units",
  "squads",
  "deadUnitReserve",
  "deathHistory",
  "selectedUnitId",
  "villagePlacementMode",
  "moveCommandUnitId",
  "nationLogKey",
  "encounterMoveLocks",
  "visibility",
  "research",
  "exploration",
  "activityLog",
  "aiState",
  "nationPolicy",
  "combatRuntime"
]);
