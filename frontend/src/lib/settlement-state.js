const text = value => String(value ?? "").trim();

function cloneSettlement(source) {
  return source && typeof source === "object" ? { ...source } : null;
}

function withoutLegacyVillage(source) {
  const next = source && typeof source === "object" ? { ...source } : {};
  delete next.village;
  return next;
}

export function resolveSettlementId(source, ownerPlayerId = "", index = 0) {
  const explicit = text(source?.settlementId || source?.id);
  if (explicit) return explicit;
  const owner = text(ownerPlayerId) || "owner";
  const x = Number.isFinite(Number(source?.x)) ? Math.floor(Number(source.x)) : index;
  const y = Number.isFinite(Number(source?.y)) ? Math.floor(Number(source.y)) : index;
  return `settlement-${owner}-${x}-${y}`;
}

export function normalizeFactionSettlements(source = {}, ownerPlayerId = "") {
  const rows = Array.isArray(source?.settlements) && source.settlements.length
    ? source.settlements
    : (source?.village && typeof source.village === "object" ? [source.village] : []);
  const used = new Set();
  const settlements = rows.filter(Boolean).map((row, index) => {
    let settlementId = resolveSettlementId(row, ownerPlayerId, index);
    if (used.has(settlementId)) settlementId = `${settlementId}-${index + 1}`;
    used.add(settlementId);
    return {
      ...cloneSettlement(row),
      id: settlementId,
      settlementId,
      ownerPlayerId: text(row?.ownerPlayerId) || text(ownerPlayerId)
    };
  });

  // 旧セーブに両形式がある場合も、単一拠点側の更新を選択拠点へ統合する。
  const legacyVillage = cloneSettlement(source?.village);
  if (legacyVillage && settlements.length) {
    const legacyId = resolveSettlementId(legacyVillage, ownerPlayerId);
    const selectedId = text(source?.selectedSettlementId);
    const targetIndex = settlements.findIndex(row => row.settlementId === legacyId)
      >= 0
      ? settlements.findIndex(row => row.settlementId === legacyId)
      : Math.max(0, settlements.findIndex(row => row.settlementId === selectedId));
    const current = settlements[targetIndex];
    settlements[targetIndex] = {
      ...current,
      ...legacyVillage,
      id: current.settlementId,
      settlementId: current.settlementId,
      ownerPlayerId: current.ownerPlayerId
    };
  }

  const requestedId = text(source?.selectedSettlementId);
  const selectedSettlementId = settlements.some(row => row.settlementId === requestedId)
    ? requestedId
    : (settlements[0]?.settlementId || "");
  return { settlements, selectedSettlementId };
}

export function getFactionSettlements(factionState) {
  return normalizeFactionSettlements(factionState).settlements;
}

export function getSelectedSettlement(factionState) {
  const normalized = normalizeFactionSettlements(factionState);
  return normalized.settlements.find(row => row.settlementId === normalized.selectedSettlementId)
    || normalized.settlements[0]
    || null;
}

export function getFactionSettlementById(factionState, settlementId) {
  const id = text(settlementId);
  return getFactionSettlements(factionState).find(row => row.settlementId === id) || null;
}

export function getSettlementForTerritory(factionState, territoryState) {
  return getFactionSettlementById(factionState, territorySettlementId(territoryState))
    || getSelectedSettlement(factionState);
}

export function sumFactionSettlementPopulation(factionState) {
  return getFactionSettlements(factionState).reduce((sum, settlement) => {
    const population = Number(settlement?.population);
    return sum + (Number.isFinite(population) ? Math.max(0, population) : 0);
  }, 0);
}

export function replaceFactionSettlement(factionState, settlement, options = {}) {
  if (!settlement || typeof settlement !== "object") return { ...factionState };
  const normalized = normalizeFactionSettlements(factionState, options.ownerPlayerId);
  const settlementId = resolveSettlementId(settlement, options.ownerPlayerId, normalized.settlements.length);
  const next = {
    ...settlement,
    id: settlementId,
    settlementId,
    ownerPlayerId: text(settlement.ownerPlayerId) || text(options.ownerPlayerId)
  };
  const index = normalized.settlements.findIndex(row => row.settlementId === settlementId);
  const settlements = [...normalized.settlements];
  if (index >= 0) settlements[index] = next;
  else settlements.push(next);
  const selectedSettlementId = options.select === false
    ? (normalized.selectedSettlementId || settlementId)
    : settlementId;
  return {
    ...withoutLegacyVillage(factionState),
    settlements,
    selectedSettlementId
  };
}

export function selectFactionSettlement(factionState, settlementId) {
  const normalized = normalizeFactionSettlements(factionState);
  const selectedSettlementId = normalized.settlements.some(row => row.settlementId === text(settlementId))
    ? text(settlementId)
    : normalized.selectedSettlementId;
  return { ...withoutLegacyVillage(factionState), settlements: normalized.settlements, selectedSettlementId };
}

export function normalizeTerritoryStateRecord(value, fallbackSettlementId = "") {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return {
      ...value,
      status: text(value.status || value.state || value.type),
      settlementId: text(value.settlementId || fallbackSettlementId)
    };
  }
  return { status: text(value), settlementId: text(fallbackSettlementId) };
}

export function territoryStatus(value) {
  return normalizeTerritoryStateRecord(value).status;
}

export function territorySettlementId(value) {
  return normalizeTerritoryStateRecord(value).settlementId;
}
