function defaultToSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function defaultNonEmptyText(value) {
  return String(value ?? "").trim();
}

function defaultCoordKey(x, y) {
  return `${x},${y}`;
}

function defaultParseCoordKey(key) {
  const text = String(key ?? "");
  const idx = text.indexOf(",");
  if (idx < 0) return { x: Number.NaN, y: Number.NaN };
  const x = Number(text.slice(0, idx));
  const y = Number(text.slice(idx + 1));
  return { x, y };
}

function hasCoordDelimiter(key) {
  return String(key ?? "").includes(",");
}

function resolveResidentialLevelConfig(options = {}) {
  const source = options?.residentialLevelConfig && typeof options.residentialLevelConfig === "object"
    ? options.residentialLevelConfig
    : null;
  return source || {};
}

function resolveResidentialLevelDefaultForMode(modeKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const settlementModeKey = nonEmptyText(options?.settlementModeKey || "settlement") || "settlement";
  const resourceDefault = nonEmptyText(options?.residentialDefaultLevelForResource || "land") || "land";
  const settlementDefault = nonEmptyText(options?.residentialDefaultLevelForSettlement || "village") || "village";
  return modeKey === settlementModeKey ? settlementDefault : resourceDefault;
}

function normalizeTerritoryResidentialLevelKey(levelKeyRaw, modeKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const config = resolveResidentialLevelConfig(options);
  const requested = nonEmptyText(levelKeyRaw);
  if (requested && Object.prototype.hasOwnProperty.call(config, requested)) {
    return requested;
  }
  return resolveResidentialLevelDefaultForMode(modeKey, options);
}

function normalizeTerritoryResidentialLevelMap(raw, village, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const mapKey = nonEmptyText(options?.residentialLevelMapKey || "territoryResidentialLevelMap") || "territoryResidentialLevelMap";
  const input = raw && typeof raw === "object" ? raw : (village?.[mapKey] && typeof village[mapKey] === "object" ? village[mapKey] : {});
  const out = {};
  for (const [keyRaw, levelRaw] of Object.entries(input || {})) {
    const key = nonEmptyText(keyRaw);
    if (!hasCoordDelimiter(key)) continue;
    const mode = resolveTerritoryTileModeAt(village, key, options);
    out[key] = normalizeTerritoryResidentialLevelKey(levelRaw, mode, options);
  }
  return out;
}

function resolveTerritoryResidentialLevelAt(village, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const mapKey = nonEmptyText(options?.residentialLevelMapKey || "territoryResidentialLevelMap") || "territoryResidentialLevelMap";
  const key = nonEmptyText(tileKey);
  if (!hasCoordDelimiter(key)) return "";
  const mode = resolveTerritoryTileModeAt(village, key, options);
  const map = normalizeTerritoryResidentialLevelMap(village?.[mapKey], village, options);
  return normalizeTerritoryResidentialLevelKey(map?.[key], mode, options);
}

function normalizeTerritoryResidentialCenterMap(raw, village, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const mapKey = nonEmptyText(options?.residentialCenterMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap";
  const input = raw && typeof raw === "object" ? raw : (village?.[mapKey] && typeof village[mapKey] === "object" ? village[mapKey] : {});
  const out = {};
  for (const [keyRaw, centerRaw] of Object.entries(input || {})) {
    const key = nonEmptyText(keyRaw);
    const centerKey = nonEmptyText(centerRaw);
    if (!hasCoordDelimiter(key) || !hasCoordDelimiter(centerKey)) continue;
    out[key] = centerKey;
  }
  return out;
}

function resolveTerritoryResidentialCenterKey(village, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const key = nonEmptyText(tileKey);
  if (!hasCoordDelimiter(key)) return "";
  const centerMap = normalizeTerritoryResidentialCenterMap(
    village?.[nonEmptyText(options?.residentialCenterMapKey || "territoryResidentialCenterMap") || "territoryResidentialCenterMap"],
    village,
    options
  );
  const centerKey = nonEmptyText(centerMap?.[key]);
  if (hasCoordDelimiter(centerKey)) return centerKey;
  return "";
}

function resolveTerritoryResidentialCapacityAt(village, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const config = resolveResidentialLevelConfig(options);
  const clusterCapacityMode = options?.residentialClusterCapacityMode !== false;
  const levelKey = resolveTerritoryResidentialLevelAt(village, tileKey, options);
  const levelDef = config?.[levelKey];
  if (!levelDef || typeof levelDef !== "object") return Number.NaN;
  let capacityPerTile = Math.max(0, toSafeNumber(levelDef?.capacityPerTile, 0));
  if (clusterCapacityMode) {
    const centerKey = resolveTerritoryResidentialCenterKey(village, tileKey, options);
    const key = nonEmptyText(tileKey);
    if (centerKey && centerKey !== key) {
      const centerLevelKey = resolveTerritoryResidentialLevelAt(village, centerKey, options);
      const centerDef = config?.[centerLevelKey];
      const centerPerTile = Math.max(0, toSafeNumber(centerDef?.capacityPerTile, Number.NaN));
      if (Number.isFinite(centerPerTile)) {
        capacityPerTile = centerPerTile;
      }
      return capacityPerTile;
    }
    if (centerKey && centerKey === key) {
      return capacityPerTile;
    }
  }
  const footprintTiles = Math.max(1, Math.floor(toSafeNumber(levelDef?.footprintTiles, 1)));
  return capacityPerTile * footprintTiles;
}

export function resolveTerritoryTileModeKey(mode, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const resourceModeKey = nonEmptyText(options?.resourceModeKey || "resource") || "resource";
  const settlementModeKey = nonEmptyText(options?.settlementModeKey || "settlement") || "settlement";
  const fallback = options?.fallbackModeKey;
  const fallbackKey = nonEmptyText(fallback) || resourceModeKey;
  const key = nonEmptyText(mode);
  if (key === settlementModeKey) return settlementModeKey;
  if (key === resourceModeKey) return resourceModeKey;
  return fallbackKey;
}

export function normalizeTerritoryTileModeMap(raw, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const modeFallback = options?.fallbackModeKey;
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [keyRaw, modeRaw] of Object.entries(raw)) {
    const key = nonEmptyText(keyRaw);
    if (!hasCoordDelimiter(key)) continue;
    out[key] = resolveTerritoryTileModeKey(modeRaw, {
      ...options,
      fallbackModeKey: modeFallback
    });
  }
  return out;
}

export function normalizeTerritoryTileConversionMap(raw, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [keyRaw, rowRaw] of Object.entries(raw)) {
    const key = nonEmptyText(keyRaw);
    if (!hasCoordDelimiter(key)) continue;
    const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
    const targetMode = resolveTerritoryTileModeKey(row?.targetMode, {
      ...options,
      fallbackModeKey: ""
    });
    const remainingTurns = Math.max(0, Math.floor(toSafeNumber(row?.remainingTurns, 0)));
    if (!targetMode || remainingTurns <= 0) continue;
    out[key] = {
      targetMode,
      remainingTurns
    };
  }
  return out;
}

export function resolveTerritoryTileModeDef(mode, options = {}) {
  const modeConfig = options?.modeConfig && typeof options.modeConfig === "object"
    ? options.modeConfig
    : {};
  const settlementModeKey = defaultNonEmptyText(options?.settlementModeKey || "settlement") || "settlement";
  const modeKey = resolveTerritoryTileModeKey(mode, options);
  const def = modeConfig?.[modeKey];
  if (def) return { key: modeKey, ...def };
  return {
    key: modeKey,
    label: modeKey === settlementModeKey ? "居住化" : "資源化",
    populationCapacityBonus: modeKey === settlementModeKey ? 15 : 5,
    incomeMultiplier: modeKey === settlementModeKey ? 1 : 2
  };
}

export function resolveTerritoryTileModeAt(village, tileKey, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const coordKey = typeof options?.coordKey === "function" ? options.coordKey : defaultCoordKey;
  const defaultModeKey = nonEmptyText(options?.defaultModeKey || "resource") || "resource";
  const homeModeKey = nonEmptyText(options?.homeModeKey || "settlement") || "settlement";
  const key = nonEmptyText(tileKey);
  if (!hasCoordDelimiter(key)) return defaultModeKey;
  const modeMap = normalizeTerritoryTileModeMap(village?.territoryTileModeMap, {
    ...options,
    fallbackModeKey: defaultModeKey
  });
  const explicit = resolveTerritoryTileModeKey(modeMap?.[key], {
    ...options,
    fallbackModeKey: ""
  });
  if (explicit) return explicit;
  const vx = Math.floor(toSafeNumber(village?.x, Number.NaN));
  const vy = Math.floor(toSafeNumber(village?.y, Number.NaN));
  if (village?.placed && Number.isFinite(vx) && Number.isFinite(vy) && key === coordKey(vx, vy)) {
    return homeModeKey;
  }
  return defaultModeKey;
}

export function ensureTerritoryTileModeDefaultsForOwnedSet(village, ownedSet, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const coordKey = typeof options?.coordKey === "function" ? options.coordKey : defaultCoordKey;
  const defaultModeKey = nonEmptyText(options?.defaultModeKey || "resource") || "resource";
  const homeModeKey = nonEmptyText(options?.homeModeKey || "settlement") || "settlement";
  if (!village || typeof village !== "object") return village;
  const modeMap = normalizeTerritoryTileModeMap(village.territoryTileModeMap, {
    ...options,
    fallbackModeKey: defaultModeKey
  });
  const conversionMap = normalizeTerritoryTileConversionMap(village.territoryTileConversionMap, options);
  const homeKey = nonEmptyText(options?.homeKey)
    || (
      village?.placed
      && Number.isFinite(village?.x)
      && Number.isFinite(village?.y)
      ? coordKey(village.x, village.y)
      : ""
    );
  const safeOwnedSet = ownedSet instanceof Set ? ownedSet : new Set();
  for (const keyRaw of safeOwnedSet) {
    const key = nonEmptyText(keyRaw);
    if (!hasCoordDelimiter(key)) continue;
    if (!modeMap[key]) {
      modeMap[key] = key === homeKey ? homeModeKey : defaultModeKey;
    }
  }
  if (homeKey && options?.forceHomeSettlement !== false) {
    modeMap[homeKey] = homeModeKey;
    delete conversionMap[homeKey];
  }
  return {
    ...village,
    territoryTileModeMap: modeMap,
    territoryTileConversionMap: conversionMap
  };
}

export function resolveTerritoryTileIncomeMultiplier(village, tileKey, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const mode = resolveTerritoryTileModeAt(village, tileKey, options);
  return Math.max(0, toSafeNumber(resolveTerritoryTileModeDef(mode, options)?.incomeMultiplier, 1));
}

export function resolveVillagePopulationCapacityByTerritory(village, ownedSet, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const residentialConfig = resolveResidentialLevelConfig(options);
  const hasResidentialRules = Object.keys(residentialConfig).length > 0;
  const capacityFallback = Math.max(1, Math.floor(toSafeNumber(options?.capacityFallback, 30)));
  const base = Math.max(
    1,
    Math.floor(
      toSafeNumber(
        village?.basePopulationCapacity,
        Math.max(capacityFallback, Math.floor(toSafeNumber(village?.population, 1)))
      )
    )
  );
  if (!(ownedSet instanceof Set) || !ownedSet.size) return base;
  if (hasResidentialRules) {
    let total = 0;
    for (const keyRaw of ownedSet) {
      const key = nonEmptyText(keyRaw);
      if (!hasCoordDelimiter(key)) continue;
      const add = resolveTerritoryResidentialCapacityAt(village, key, options);
      total += Number.isFinite(add) ? Math.max(0, add) : 0;
    }
    return Math.max(1, Math.floor(total));
  }
  let bonus = 0;
  for (const keyRaw of ownedSet) {
    const key = nonEmptyText(keyRaw);
    if (!hasCoordDelimiter(key)) continue;
    const mode = resolveTerritoryTileModeAt(village, key, options);
    const add = Math.max(0, Math.floor(toSafeNumber(resolveTerritoryTileModeDef(mode, options)?.populationCapacityBonus, 0)));
    bonus += add;
  }
  return Math.max(1, base + bonus);
}

export function applyVillagePopulationCapacityClamp(village, populationCapacity, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const nonEmptyText = typeof options?.nonEmptyText === "function" ? options.nonEmptyText : defaultNonEmptyText;
  const fallbackRace = nonEmptyText(options?.fallbackRace || "只人") || "只人";
  if (!village || typeof village !== "object") return 0;
  const cap = Math.max(1, Math.floor(toSafeNumber(populationCapacity, 1)));
  const current = Math.max(1, Math.floor(toSafeNumber(village.population, 1)));
  village.populationCapacity = cap;
  if (current <= cap) return 0;

  let overflow = current - cap;
  const entries = Object.entries(village.populationByRace || {})
    .map(([race, countRaw]) => ({
      race: nonEmptyText(race),
      count: Math.max(0, Math.floor(toSafeNumber(countRaw, 0)))
    }))
    .filter(row => row.race && row.count > 0)
    .sort((a, b) => b.count - a.count);
  if (!entries.length) {
    village.population = cap;
    village.populationByRace = { [fallbackRace]: cap };
    return current - cap;
  }

  let total = current;
  for (const row of entries) {
    if (overflow <= 0) break;
    const keepMin = total - row.count <= 0 ? 1 : 0;
    const reducible = Math.max(0, row.count - keepMin);
    if (reducible <= 0) continue;
    const drop = Math.min(reducible, overflow);
    row.count -= drop;
    total -= drop;
    overflow -= drop;
  }
  if (overflow > 0) {
    total = Math.max(1, total - overflow);
  }
  const nextPopulationByRace = {};
  for (const row of entries) {
    if (row.count <= 0 || !row.race) continue;
    nextPopulationByRace[row.race] = row.count;
  }
  if (!Object.keys(nextPopulationByRace).length) {
    nextPopulationByRace[fallbackRace] = Math.max(1, total);
  }
  village.populationByRace = nextPopulationByRace;
  village.population = Math.max(1, total);
  return Math.max(0, current - village.population);
}

export function advanceVillageTerritoryTileConversions(village, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const parseCoordKey = typeof options?.parseCoordKey === "function" ? options.parseCoordKey : defaultParseCoordKey;
  const safeVillage = village && typeof village === "object" ? village : null;
  if (!safeVillage) return { village, notes: [], progressed: 0, completed: 0 };
  const modeMap = normalizeTerritoryTileModeMap(safeVillage.territoryTileModeMap, options);
  const conversionMap = normalizeTerritoryTileConversionMap(safeVillage.territoryTileConversionMap, options);
  const nextConversionMap = {};
  const notes = [];
  let progressed = 0;
  let completed = 0;

  for (const [key, row] of Object.entries(conversionMap)) {
    const nextRemaining = Math.max(0, Math.floor(toSafeNumber(row?.remainingTurns, 0)) - 1);
    const targetMode = resolveTerritoryTileModeKey(row?.targetMode, {
      ...options,
      fallbackModeKey: ""
    });
    if (!targetMode) continue;
    if (nextRemaining <= 0) {
      modeMap[key] = targetMode;
      completed += 1;
      const pos = parseCoordKey(key);
      const targetLabel = resolveTerritoryTileModeDef(targetMode, options).label;
      if (Number.isFinite(pos?.x) && Number.isFinite(pos?.y)) {
        notes.push(`領土運用変換完了: (${pos.x}, ${pos.y}) -> ${targetLabel}`);
      } else {
        notes.push(`領土運用変換完了: ${key} -> ${targetLabel}`);
      }
      continue;
    }
    nextConversionMap[key] = {
      targetMode,
      remainingTurns: nextRemaining
    };
    progressed += 1;
  }

  return {
    village: {
      ...safeVillage,
      territoryTileModeMap: modeMap,
      territoryTileConversionMap: nextConversionMap
    },
    notes,
    progressed,
    completed
  };
}

export function formatTerritoryTileDevelopmentText(village, x, y, options = {}) {
  const coordKey = typeof options?.coordKey === "function" ? options.coordKey : defaultCoordKey;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const config = resolveResidentialLevelConfig(options);
  if (!village || !Number.isFinite(x) || !Number.isFinite(y)) return "-";
  const key = coordKey(x, y);
  const mode = resolveTerritoryTileModeAt(village, key, options);
  const modeDef = resolveTerritoryTileModeDef(mode, options);
  const conversion = normalizeTerritoryTileConversionMap(village.territoryTileConversionMap, options)?.[key];
  const levelKey = resolveTerritoryResidentialLevelAt(village, key, options);
  const levelDef = config?.[levelKey];
  const residentialText = levelDef
    ? ` / ${levelDef.label}(${Math.floor(toSafeNumber(levelDef.capacityPerTile, 0))}x${Math.floor(toSafeNumber(levelDef.footprintTiles, 1))})`
    : "";
  if (!conversion) {
    return `${modeDef.label} (人口+${Math.floor(toSafeNumber(modeDef.populationCapacityBonus, 0))} / 資源x${toSafeNumber(modeDef.incomeMultiplier, 1)})${residentialText}`;
  }
  const targetDef = resolveTerritoryTileModeDef(conversion.targetMode, options);
  return `${modeDef.label} -> ${targetDef.label} (変換中: ${conversion.remainingTurns}T)${residentialText}`;
}
