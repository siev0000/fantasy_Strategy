function defaultNonEmptyText(value) {
  return String(value ?? "").trim();
}

function defaultToSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function hasCoordKey(text) {
  return String(text ?? "").includes(",");
}

function uniqueCoordKeys(input) {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map(v => String(v ?? "").trim()).filter(v => hasCoordKey(v))));
}

export function normalizeTerritoryResidentialCenterMapUtil(raw, village = null, levelMapOverride = null, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const normalizeTerritoryResidentialLevelMap = options?.normalizeTerritoryResidentialLevelMap;
  const normalizeTerritoryResidentialLevelKey = options?.normalizeTerritoryResidentialLevelKey;
  const isTerritoryResidentialCenterLevel = options?.isTerritoryResidentialCenterLevel;
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  const landLevelKey = nonEmptyText(options?.landLevelKey || "land") || "land";
  if (typeof normalizeTerritoryResidentialLevelMap !== "function"
    || typeof normalizeTerritoryResidentialLevelKey !== "function"
    || typeof isTerritoryResidentialCenterLevel !== "function") {
    return {};
  }

  const source = raw && typeof raw === "object"
    ? raw
    : (village?.[centerMapKey] && typeof village[centerMapKey] === "object" ? village[centerMapKey] : {});
  const levelMap = levelMapOverride && typeof levelMapOverride === "object"
    ? levelMapOverride
    : normalizeTerritoryResidentialLevelMap(village, village);
  const out = {};

  for (const [keyRaw, centerRaw] of Object.entries(source || {})) {
    const key = nonEmptyText(keyRaw);
    const centerKey = nonEmptyText(centerRaw);
    if (!hasCoordKey(key) || !hasCoordKey(centerKey)) continue;
    const level = normalizeTerritoryResidentialLevelKey(levelMap?.[key], landLevelKey);
    if (key === centerKey) {
      if (isTerritoryResidentialCenterLevel(level)) {
        out[key] = key;
      }
      continue;
    }
    if (level === landLevelKey) continue;
    out[key] = centerKey;
  }

  for (const [tileKeyRaw, levelRaw] of Object.entries(levelMap || {})) {
    const tileKey = nonEmptyText(tileKeyRaw);
    if (!hasCoordKey(tileKey)) continue;
    const level = normalizeTerritoryResidentialLevelKey(levelRaw, landLevelKey);
    if (!isTerritoryResidentialCenterLevel(level)) continue;
    out[tileKey] = tileKey;
  }

  for (const [tileKeyRaw, centerKeyRaw] of Object.entries({ ...out })) {
    const tileKey = nonEmptyText(tileKeyRaw);
    const centerKey = nonEmptyText(centerKeyRaw);
    if (!hasCoordKey(tileKey) || !hasCoordKey(centerKey)) {
      delete out[tileKeyRaw];
      continue;
    }
    if (tileKey === centerKey) continue;
    const centerLevel = normalizeTerritoryResidentialLevelKey(levelMap?.[centerKey], landLevelKey);
    if (!isTerritoryResidentialCenterLevel(centerLevel)) {
      delete out[tileKeyRaw];
    }
  }

  return out;
}

export function ensureTerritoryResidentialClusterMapShapeUtil(village, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const normalizeTerritoryTileModeMap = options?.normalizeTerritoryTileModeMap;
  const normalizeTerritoryResidentialLevelMap = options?.normalizeTerritoryResidentialLevelMap;
  const normalizeTerritoryResidentialLevelKey = options?.normalizeTerritoryResidentialLevelKey;
  const normalizeTerritoryResidentialCenterMap = options?.normalizeTerritoryResidentialCenterMap;
  const isTerritoryResidentialCenterLevel = options?.isTerritoryResidentialCenterLevel;
  const resolveTerritoryTileModeAt = options?.resolveTerritoryTileModeAt;
  const coordKey = options?.coordKey;
  const landLevelKey = nonEmptyText(options?.landLevelKey || "land") || "land";
  const villageLevelKey = nonEmptyText(options?.villageLevelKey || "village") || "village";
  const levelMapKey = nonEmptyText(options?.levelMapKey || "territoryResidentialLevelMap") || "territoryResidentialLevelMap";
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  const settlementModeKey = nonEmptyText(options?.settlementModeKey || "settlement") || "settlement";
  const resourceModeKey = nonEmptyText(options?.resourceModeKey || "resource") || "resource";
  if (!village || typeof village !== "object") return village;
  if (typeof normalizeTerritoryTileModeMap !== "function"
    || typeof normalizeTerritoryResidentialLevelMap !== "function"
    || typeof normalizeTerritoryResidentialLevelKey !== "function"
    || typeof normalizeTerritoryResidentialCenterMap !== "function"
    || typeof isTerritoryResidentialCenterLevel !== "function"
    || typeof resolveTerritoryTileModeAt !== "function"
    || typeof coordKey !== "function") {
    return village;
  }

  const modeMap = normalizeTerritoryTileModeMap(village?.territoryTileModeMap);
  const levelMapSource = normalizeTerritoryResidentialLevelMap(
    village?.[levelMapKey],
    {
      ...village,
      territoryTileModeMap: modeMap
    }
  );
  const centerMapSource = normalizeTerritoryResidentialCenterMap(
    village?.[centerMapKey],
    {
      ...village,
      territoryTileModeMap: modeMap,
      [levelMapKey]: levelMapSource
    },
    levelMapSource
  );

  const nextLevelMap = {};
  const nextCenterMap = {};
  const settlementTileKeys = new Set();

  for (const [tileKeyRaw, modeRaw] of Object.entries(modeMap || {})) {
    const tileKey = nonEmptyText(tileKeyRaw);
    if (!hasCoordKey(tileKey)) continue;
    const mode = nonEmptyText(modeRaw);
    if (mode === settlementModeKey) {
      settlementTileKeys.add(tileKey);
    }
  }

  for (const tileKey of settlementTileKeys) {
    const rawCenterKey = nonEmptyText(centerMapSource?.[tileKey]);
    if (hasCoordKey(rawCenterKey) && rawCenterKey !== tileKey) continue;
    const level = normalizeTerritoryResidentialLevelKey(levelMapSource?.[tileKey], villageLevelKey);
    const centerLevel = isTerritoryResidentialCenterLevel(level) ? level : villageLevelKey;
    nextLevelMap[tileKey] = centerLevel;
    nextCenterMap[tileKey] = tileKey;
  }

  for (const tileKey of settlementTileKeys) {
    const rawCenterKey = nonEmptyText(centerMapSource?.[tileKey]);
    if (!hasCoordKey(rawCenterKey) || rawCenterKey === tileKey) continue;
    if (!settlementTileKeys.has(rawCenterKey)) continue;
    if (!nextCenterMap[rawCenterKey]) {
      const centerLevelRaw = normalizeTerritoryResidentialLevelKey(levelMapSource?.[rawCenterKey], villageLevelKey);
      nextLevelMap[rawCenterKey] = isTerritoryResidentialCenterLevel(centerLevelRaw) ? centerLevelRaw : villageLevelKey;
      nextCenterMap[rawCenterKey] = rawCenterKey;
    }
    const centerLevel = normalizeTerritoryResidentialLevelKey(nextLevelMap?.[rawCenterKey], villageLevelKey);
    nextLevelMap[tileKey] = centerLevel;
    nextCenterMap[tileKey] = rawCenterKey;
  }

  const homeKey = (
    village?.placed
    && Number.isFinite(village?.x)
    && Number.isFinite(village?.y)
  )
    ? coordKey(village.x, village.y)
    : "";
  if (homeKey && hasCoordKey(homeKey)) {
    const homeMode = resolveTerritoryTileModeAt({ ...village, territoryTileModeMap: modeMap }, homeKey, {
      fallbackModeKey: resourceModeKey
    });
    if (homeMode === settlementModeKey) {
      const currentHomeLevel = normalizeTerritoryResidentialLevelKey(levelMapSource[homeKey], villageLevelKey);
      nextLevelMap[homeKey] = isTerritoryResidentialCenterLevel(currentHomeLevel)
        ? currentHomeLevel
        : villageLevelKey;
      nextCenterMap[homeKey] = homeKey;
    }
  }

  return {
    ...village,
    [levelMapKey]: nextLevelMap,
    [centerMapKey]: nextCenterMap
  };
}

export function resolveTerritoryResidentialCenterKeyUtil(village, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const resolveTerritoryResidentialLevelAt = options?.resolveTerritoryResidentialLevelAt;
  const isTerritoryResidentialCenterLevel = options?.isTerritoryResidentialCenterLevel;
  const normalizeTerritoryResidentialCenterMap = options?.normalizeTerritoryResidentialCenterMap;
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  const landLevelKey = nonEmptyText(options?.landLevelKey || "land") || "land";
  if (typeof resolveTerritoryResidentialLevelAt !== "function"
    || typeof isTerritoryResidentialCenterLevel !== "function"
    || typeof normalizeTerritoryResidentialCenterMap !== "function") {
    return "";
  }
  const key = nonEmptyText(tileKey);
  if (!hasCoordKey(key)) return "";
  const centerMap = normalizeTerritoryResidentialCenterMap(village?.[centerMapKey], village);
  const centerKey = nonEmptyText(centerMap[key]);
  if (hasCoordKey(centerKey) && centerKey !== key) {
    const centerLevel = resolveTerritoryResidentialLevelAt(village, centerKey, { fallbackLevel: landLevelKey });
    return isTerritoryResidentialCenterLevel(centerLevel) ? centerKey : "";
  }
  const level = resolveTerritoryResidentialLevelAt(village, key, { fallbackLevel: landLevelKey });
  if (!isTerritoryResidentialCenterLevel(level)) return "";
  if (!hasCoordKey(centerKey)) return key;
  const centerLevel = resolveTerritoryResidentialLevelAt(village, centerKey, { fallbackLevel: landLevelKey });
  return isTerritoryResidentialCenterLevel(centerLevel) ? centerKey : "";
}

export function resolveTerritoryResidentialAttachmentKeysUtil(village, centerKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const normalizeTerritoryResidentialCenterMap = options?.normalizeTerritoryResidentialCenterMap;
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  if (typeof normalizeTerritoryResidentialCenterMap !== "function"
  ) {
    return [];
  }
  const normalizedCenterKey = nonEmptyText(centerKey);
  if (!hasCoordKey(normalizedCenterKey)) return [];
  const centerMap = normalizeTerritoryResidentialCenterMap(village?.[centerMapKey], village);
  return Object.entries(centerMap)
    .filter(([tileKey, ownerKey]) => (
      tileKey !== normalizedCenterKey
      && ownerKey === normalizedCenterKey
    ))
    .map(([tileKey]) => tileKey)
    .sort();
}

export function resolveResidentialAttachmentCandidatesUtil(village, centerKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const parseCoordKey = options?.parseCoordKey;
  const coordKey = options?.coordKey;
  const getHexNeighborCoordsBySize = options?.getHexNeighborCoordsBySize;
  const resolveWorldWrapEnabled = options?.resolveWorldWrapEnabled;
  const resolveTerritoryTileModeAt = options?.resolveTerritoryTileModeAt;
  const normalizeTerritoryResidentialLevelMap = options?.normalizeTerritoryResidentialLevelMap;
  const normalizeTerritoryResidentialCenterMap = options?.normalizeTerritoryResidentialCenterMap;
  const normalizeTerritoryResidentialLevelKey = options?.normalizeTerritoryResidentialLevelKey;
  const isTerritoryResidentialCenterLevel = options?.isTerritoryResidentialCenterLevel;
  const isOwnTerritoryTile = options?.isOwnTerritoryTile;
  const data = options?.data;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const bypassByTest = !!options?.bypassByTest;
  const landLevelKey = nonEmptyText(options?.landLevelKey || "land") || "land";
  const villageLevelKey = nonEmptyText(options?.villageLevelKey || "village") || "village";
  const settlementModeKey = nonEmptyText(options?.settlementModeKey || "settlement") || "settlement";
  const resourceModeKey = nonEmptyText(options?.resourceModeKey || "resource") || "resource";
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  const levelMapKey = nonEmptyText(options?.levelMapKey || "territoryResidentialLevelMap") || "territoryResidentialLevelMap";
  if (typeof parseCoordKey !== "function"
    || typeof coordKey !== "function"
    || typeof getHexNeighborCoordsBySize !== "function"
    || typeof resolveWorldWrapEnabled !== "function"
    || typeof resolveTerritoryTileModeAt !== "function"
    || typeof normalizeTerritoryResidentialLevelMap !== "function"
    || typeof normalizeTerritoryResidentialCenterMap !== "function"
    || typeof normalizeTerritoryResidentialLevelKey !== "function"
    || typeof isTerritoryResidentialCenterLevel !== "function"
    || typeof isOwnTerritoryTile !== "function") {
    return [];
  }
  const normalizedCenterKey = nonEmptyText(centerKey);
  if (!hasCoordKey(normalizedCenterKey)) return [];
  if (!data || !Number.isFinite(data?.w) || !Number.isFinite(data?.h)) return [];
  const centerPos = parseCoordKey(normalizedCenterKey);
  if (!Number.isFinite(centerPos?.x) || !Number.isFinite(centerPos?.y)) return [];

  const levelMap = normalizeTerritoryResidentialLevelMap(village?.[levelMapKey], village);
  const centerMap = normalizeTerritoryResidentialCenterMap(village?.[centerMapKey], village, levelMap);
  const neighbors = getHexNeighborCoordsBySize(
    Math.floor(toSafeNumber(data.w, 0)),
    Math.floor(toSafeNumber(data.h, 0)),
    centerPos.x,
    centerPos.y,
    resolveWorldWrapEnabled(data)
  );
  const out = [];
  for (const neighbor of neighbors) {
    const tileKey = coordKey(neighbor.x, neighbor.y);
    if (tileKey === normalizedCenterKey) continue;
    if (!bypassByTest && !isOwnTerritoryTile(neighbor.x, neighbor.y)) continue;
    const mode = resolveTerritoryTileModeAt(village, tileKey, { fallbackModeKey: resourceModeKey });
    if (mode !== settlementModeKey) continue;
    const ownerCenter = nonEmptyText(centerMap?.[tileKey]);
    const tileLevel = normalizeTerritoryResidentialLevelKey(levelMap?.[tileKey], landLevelKey);
    if (ownerCenter && ownerCenter !== normalizedCenterKey) {
      const isStandaloneVillageCenter = ownerCenter === tileKey && tileLevel === villageLevelKey;
      if (!isStandaloneVillageCenter) continue;
    }
    if (tileLevel !== landLevelKey && !ownerCenter && isTerritoryResidentialCenterLevel(tileLevel)) continue;
    out.push(tileKey);
  }
  return uniqueCoordKeys(out).sort();
}

export function applyResidentialCenterUpgradeUtil(village, centerKey, nextLevel, attachmentKeys = [], options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const normalizeTerritoryResidentialLevelMap = options?.normalizeTerritoryResidentialLevelMap;
  const normalizeTerritoryResidentialCenterMap = options?.normalizeTerritoryResidentialCenterMap;
  const normalizeTerritoryResidentialLevelKey = options?.normalizeTerritoryResidentialLevelKey;
  const ensureVillageResidentialLevelMapShape = options?.ensureVillageResidentialLevelMapShape;
  const resolveResidentialAttachedTarget = options?.resolveResidentialAttachedTarget;
  const villageLevelKey = nonEmptyText(options?.villageLevelKey || "village") || "village";
  const levelMapKey = nonEmptyText(options?.levelMapKey || "territoryResidentialLevelMap") || "territoryResidentialLevelMap";
  const centerMapKey = nonEmptyText(options?.centerMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  if (!village || typeof village !== "object") return village;
  if (typeof normalizeTerritoryResidentialLevelMap !== "function"
    || typeof normalizeTerritoryResidentialCenterMap !== "function"
    || typeof normalizeTerritoryResidentialLevelKey !== "function"
    || typeof ensureVillageResidentialLevelMapShape !== "function"
    || typeof resolveResidentialAttachedTarget !== "function") {
    return village;
  }

  const normalizedCenterKey = nonEmptyText(centerKey);
  if (!hasCoordKey(normalizedCenterKey)) return village;
  const levelMap = normalizeTerritoryResidentialLevelMap(village?.[levelMapKey], village);
  const centerMap = normalizeTerritoryResidentialCenterMap(village?.[centerMapKey], village, levelMap);
  const nextLevelMap = { ...levelMap };
  const nextCenterMap = { ...centerMap };

  for (const [tileKey, ownerCenter] of Object.entries(centerMap)) {
    if (tileKey === normalizedCenterKey) continue;
    if (ownerCenter !== normalizedCenterKey) continue;
    delete nextCenterMap[tileKey];
    nextLevelMap[tileKey] = options?.landLevelKey || "land";
  }

  nextLevelMap[normalizedCenterKey] = normalizeTerritoryResidentialLevelKey(nextLevel, villageLevelKey);
  nextCenterMap[normalizedCenterKey] = normalizedCenterKey;

  const maxAttached = Math.max(0, Math.floor(defaultToSafeNumber(resolveResidentialAttachedTarget(nextLevel), 0)));
  const selected = uniqueCoordKeys(attachmentKeys).filter(key => key !== normalizedCenterKey);
  const normalizedNextLevel = normalizeTerritoryResidentialLevelKey(nextLevel, villageLevelKey);
  for (const tileKey of selected.slice(0, maxAttached)) {
    nextLevelMap[tileKey] = normalizedNextLevel;
    nextCenterMap[tileKey] = normalizedCenterKey;
  }

  return ensureVillageResidentialLevelMapShape({
    ...village,
    [levelMapKey]: nextLevelMap,
    [centerMapKey]: nextCenterMap
  });
}

export function createHousingUpgradeSelectionStateUtil(state, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const fixedKeys = uniqueCoordKeys(state?.fixedAttachmentKeys || []);
  const selectedKeys = uniqueCoordKeys((state?.selectedAttachmentKeys && state.selectedAttachmentKeys.length)
    ? state.selectedAttachmentKeys
    : fixedKeys);
  const candidateKeys = uniqueCoordKeys(state?.candidateAttachmentKeys || []);
  return {
    active: true,
    centerKey: String(state?.centerKey ?? ""),
    centerX: state?.x,
    centerY: state?.y,
    currentLevel: state?.currentLevel,
    nextLevel: state?.nextLevel,
    targetAttachedCount: Math.max(0, Math.floor(toSafeNumber(state?.targetAttachedCount, 0))),
    fixedAttachmentKeys: fixedKeys,
    selectedAttachmentKeys: selectedKeys,
    candidateAttachmentKeys: candidateKeys
  };
}

export function summarizeHousingUpgradeSelectionUtil(selection, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  if (!selection?.active) return "";
  const selectedCount = Math.max(0, selection.selectedAttachmentKeys?.length || 0);
  const targetCount = Math.max(0, Math.floor(toSafeNumber(selection.targetAttachedCount, 0)));
  return `住居拡張選択中: 中心(${selection.centerX}, ${selection.centerY}) ${selectedCount}/${targetCount}マス`;
}

export function toggleHousingUpgradeSelectionTileUtil(selection, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  if (!selection?.active) {
    return { handled: false, reason: "" };
  }
  const key = nonEmptyText(tileKey);
  const centerKey = nonEmptyText(selection.centerKey);
  const candidateSet = new Set(selection.candidateAttachmentKeys || []);
  const fixedSet = new Set(selection.fixedAttachmentKeys || []);
  const selectedSet = new Set(selection.selectedAttachmentKeys || []);
  const targetCount = Math.max(0, Math.floor(toSafeNumber(selection.targetAttachedCount, 0)));

  if (key === centerKey) {
    return { handled: true, selection, reason: "center" };
  }
  if (!candidateSet.has(key)) {
    return { handled: true, selection, reason: "outside" };
  }
  if (fixedSet.has(key)) {
    return { handled: true, selection, reason: "fixed" };
  }
  if (selectedSet.has(key)) {
    selectedSet.delete(key);
    return {
      handled: true,
      selection: {
        ...selection,
        selectedAttachmentKeys: Array.from(selectedSet)
      },
      reason: "removed"
    };
  }
  if (selectedSet.size >= targetCount) {
    return { handled: true, selection, reason: "max" };
  }
  selectedSet.add(key);
  return {
    handled: true,
    selection: {
      ...selection,
      selectedAttachmentKeys: Array.from(selectedSet)
    },
    reason: "added"
  };
}
