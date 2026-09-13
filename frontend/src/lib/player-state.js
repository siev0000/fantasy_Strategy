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
    selection: cloneRecord(source?.selection)
  };
}

export function createPlayerFactionState(source = {}) {
  return {
    ...source,
    village: source?.village && typeof source.village === "object" ? { ...source.village } : null,
    units: cloneRows(source?.units),
    squads: cloneRows(source?.squads),
    deadUnitReserve: cloneRows(source?.deadUnitReserve),
    selectedUnitId: String(source?.selectedUnitId || ""),
    villagePlacementMode: !!source?.villagePlacementMode,
    moveCommandUnitId: String(source?.moveCommandUnitId || ""),
    nationLogKey: String(source?.nationLogKey || ""),
    encounterMoveLocks: cloneRecord(source?.encounterMoveLocks),
    visibility: createEmptyVisibilityState(source?.visibility),
    research: createEmptyResearchState(source?.research)
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
  "selectedUnitId",
  "villagePlacementMode",
  "moveCommandUnitId",
  "nationLogKey",
  "encounterMoveLocks",
  "visibility",
  "research"
]);
