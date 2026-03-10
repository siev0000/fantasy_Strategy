function defaultToSafeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function defaultRoundTo1(value) {
  return Math.round(defaultToSafeNumber(value, 0) * 10) / 10;
}

function defaultFormatCompactNumber(value) {
  return String(defaultRoundTo1(value).toLocaleString("ja-JP", { minimumFractionDigits: 0, maximumFractionDigits: 1 }));
}

export function buildEmptyResourceBag(keys) {
  const out = {};
  const safeKeys = Array.isArray(keys) ? keys : [];
  for (const key of safeKeys) out[key] = 0;
  return out;
}

export function normalizeResourceBag(raw, keys, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const out = buildEmptyResourceBag(keys);
  if (!raw || typeof raw !== "object") return out;
  const safeKeys = Array.isArray(keys) ? keys : [];
  for (const key of safeKeys) {
    out[key] = Math.max(0, roundTo1(raw[key]));
  }
  return out;
}

export function sumResourceBag(bag, keys, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const safeKeys = Array.isArray(keys) ? keys : [];
  return roundTo1(safeKeys.reduce((sum, key) => sum + toSafeNumber(bag?.[key], 0), 0));
}

export function addToResourceBag(target, delta, keys, options = {}) {
  if (!target || typeof target !== "object") return;
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const safeKeys = Array.isArray(keys) ? keys : [];
  for (const key of safeKeys) {
    target[key] = roundTo1(toSafeNumber(target[key], 0) + toSafeNumber(delta?.[key], 0));
  }
}

export function multiplyResourceBag(source, factor, keys, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const out = buildEmptyResourceBag(keys);
  const safeFactor = toSafeNumber(factor, 0);
  const safeKeys = Array.isArray(keys) ? keys : [];
  for (const key of safeKeys) {
    out[key] = roundTo1(toSafeNumber(source?.[key], 0) * safeFactor);
  }
  return out;
}

export function formatResourceBag(bag, keys, labels = {}, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const formatCompactNumber = typeof options?.formatCompactNumber === "function"
    ? options.formatCompactNumber
    : defaultFormatCompactNumber;
  const safeKeys = Array.isArray(keys) ? keys : [];
  return safeKeys.map(key => `${labels[key] || key}${formatCompactNumber(toSafeNumber(bag?.[key], 0))}`).join(" ");
}

export function formatPositiveResourceBag(bag, keys, labels = {}, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const formatCompactNumber = typeof options?.formatCompactNumber === "function"
    ? options.formatCompactNumber
    : defaultFormatCompactNumber;
  const safeKeys = Array.isArray(keys) ? keys : [];
  const parts = safeKeys
    .map(key => ({ key, value: Math.max(0, roundTo1(toSafeNumber(bag?.[key], 0))) }))
    .filter(row => row.value > 0)
    .map(row => `${labels[row.key] || row.key}${formatCompactNumber(row.value)}`);
  return parts.length ? parts.join(" ") : "なし";
}

export function splitTotalIntoBag(total, keys, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const safeTotal = Math.max(0, Math.floor(toSafeNumber(total, 0)));
  const out = buildEmptyResourceBag(keys);
  const safeKeys = Array.isArray(keys) ? keys : [];
  if (!safeKeys.length || safeTotal <= 0) return out;
  const base = Math.floor(safeTotal / safeKeys.length);
  let rem = safeTotal - (base * safeKeys.length);
  for (const key of safeKeys) {
    out[key] = base;
    if (rem > 0) {
      out[key] += 1;
      rem -= 1;
    }
  }
  return out;
}

export function consumeFoodWithSubstitution(stockBag, demandBag, foodKeys, fallbackMultiplier = 1.2, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const safeFoodKeys = Array.isArray(foodKeys) ? foodKeys : [];
  const stocks = normalizeResourceBag(stockBag, safeFoodKeys, { roundTo1 });
  const before = { ...stocks };
  const shortageByType = buildEmptyResourceBag(safeFoodKeys);
  const safeMultiplier = Math.max(1, toSafeNumber(fallbackMultiplier, 1.2));

  for (const key of safeFoodKeys) {
    const demand = Math.max(0, roundTo1(toSafeNumber(demandBag?.[key], 0)));
    if (demand <= 0) continue;
    const direct = Math.min(stocks[key], demand);
    stocks[key] = roundTo1(stocks[key] - direct);
    const deficit = roundTo1(demand - direct);
    if (deficit <= 0) continue;
    let remainingEquivalent = roundTo1(deficit * safeMultiplier);
    const donors = safeFoodKeys
      .filter(foodKey => foodKey !== key)
      .sort((a, b) => stocks[b] - stocks[a]);
    for (const donor of donors) {
      if (remainingEquivalent <= 0) break;
      const take = Math.min(stocks[donor], remainingEquivalent);
      if (take <= 0) continue;
      stocks[donor] = roundTo1(stocks[donor] - take);
      remainingEquivalent = roundTo1(remainingEquivalent - take);
    }
    if (remainingEquivalent > 0) {
      shortageByType[key] = roundTo1(shortageByType[key] + (remainingEquivalent / safeMultiplier));
    }
  }

  const consumedByType = buildEmptyResourceBag(safeFoodKeys);
  for (const key of safeFoodKeys) {
    consumedByType[key] = roundTo1(before[key] - stocks[key]);
  }
  return {
    nextStock: stocks,
    consumedByType,
    shortageByType,
    shortageTotal: sumResourceBag(shortageByType, safeFoodKeys, { roundTo1, toSafeNumber })
  };
}

export function buildUnitUpkeepFoodDemand(units, foodKeys, resolveRaceFoodProfile, options = {}) {
  const safeUnits = Array.isArray(units) ? units : [];
  const safeFoodKeys = Array.isArray(foodKeys) ? foodKeys : [];
  const resolver = typeof resolveRaceFoodProfile === "function"
    ? resolveRaceFoodProfile
    : () => buildEmptyResourceBag(safeFoodKeys);
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const demand = buildEmptyResourceBag(safeFoodKeys);
  for (const unit of safeUnits) {
    const profile = resolver(unit?.race);
    addToResourceBag(demand, profile, safeFoodKeys, { roundTo1, toSafeNumber });
  }
  return demand;
}

export function buildPopulationFoodDemand(village, foodKeys, resolveRaceFoodProfile, options = {}) {
  const safeFoodKeys = Array.isArray(foodKeys) ? foodKeys : [];
  const resolver = typeof resolveRaceFoodProfile === "function"
    ? resolveRaceFoodProfile
    : () => buildEmptyResourceBag(safeFoodKeys);
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const demand = buildEmptyResourceBag(safeFoodKeys);
  const popByRace = village?.populationByRace || {};
  for (const [race, countRaw] of Object.entries(popByRace)) {
    const count = Math.max(0, Math.floor(toSafeNumber(countRaw, 0)));
    if (count <= 0) continue;
    const profile = resolver(race);
    const scaled = multiplyResourceBag(profile, count, safeFoodKeys, { roundTo1, toSafeNumber });
    addToResourceBag(demand, scaled, safeFoodKeys, { roundTo1, toSafeNumber });
  }
  return demand;
}

export function collectTerritoryIncome(data, ownedSet, foodKeys, materialKeys, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const toSafeNumber = typeof options?.toSafeNumber === "function" ? options.toSafeNumber : defaultToSafeNumber;
  const parseCoordKey = typeof options?.parseCoordKey === "function" ? options.parseCoordKey : (() => ({ x: NaN, y: NaN }));
  const resolveTileTerrainForYield = typeof options?.resolveTileTerrainForYield === "function"
    ? options.resolveTileTerrainForYield
    : (() => "");
  const terrainYieldMap = options?.terrainYieldMap;
  const safeFoodKeys = Array.isArray(foodKeys) ? foodKeys : [];
  const safeMaterialKeys = Array.isArray(materialKeys) ? materialKeys : [];
  const income = {
    food: buildEmptyResourceBag(safeFoodKeys),
    material: buildEmptyResourceBag(safeMaterialKeys),
    tiles: 0
  };
  if (!data?.grid || !(ownedSet instanceof Set) || !ownedSet.size || !(terrainYieldMap instanceof Map)) return income;
  for (const key of ownedSet) {
    const pos = parseCoordKey(key);
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    if (pos.x < 0 || pos.y < 0 || pos.x >= data.w || pos.y >= data.h) continue;
    const terrain = resolveTileTerrainForYield(data, pos.x, pos.y);
    const row = terrainYieldMap.get(terrain) || null;
    if (!row) continue;
    income.tiles += 1;
    for (const foodKey of safeFoodKeys) {
      income.food[foodKey] = roundTo1(income.food[foodKey] + toSafeNumber(row?.[foodKey], 0));
    }
    for (const matKey of safeMaterialKeys) {
      income.material[matKey] = roundTo1(income.material[matKey] + toSafeNumber(row?.[matKey], 0));
    }
  }
  return income;
}

export function applyVillageEconomyTurn(village, params = {}, options = {}) {
  if (!village || typeof village !== "object") {
    return {
      village: null,
      upkeepResult: null,
      popResult: null,
      shortageTotal: 0,
      populationDelta: 0
    };
  }
  const roundTo1 = typeof options?.roundTo1 === "function" ? options.roundTo1 : defaultRoundTo1;
  const foodKeys = Array.isArray(params?.foodKeys) ? params.foodKeys : [];
  const materialKeys = Array.isArray(params?.materialKeys) ? params.materialKeys : [];
  const fallbackMultiplier = Number.isFinite(params?.fallbackMultiplier) ? params.fallbackMultiplier : 1.2;
  const adjustVillagePopulationForTurn = typeof params?.adjustVillagePopulationForTurn === "function"
    ? params.adjustVillagePopulationForTurn
    : (() => 0);
  const territoryIncome = params?.territoryIncome || {
    food: buildEmptyResourceBag(foodKeys),
    material: buildEmptyResourceBag(materialKeys),
    tiles: 0
  };
  const buildingIncome = params?.buildingIncome || {
    food: buildEmptyResourceBag(foodKeys),
    material: buildEmptyResourceBag(materialKeys),
    count: 0
  };
  const unitUpkeepDemand = params?.unitUpkeepDemand || buildEmptyResourceBag(foodKeys);
  const populationDemand = params?.populationDemand || buildEmptyResourceBag(foodKeys);

  addToResourceBag(village.foodStockByType, territoryIncome.food, foodKeys, { roundTo1, toSafeNumber: options?.toSafeNumber });
  addToResourceBag(village.materialStockByType, territoryIncome.material, materialKeys, { roundTo1, toSafeNumber: options?.toSafeNumber });
  addToResourceBag(village.foodStockByType, buildingIncome.food, foodKeys, { roundTo1, toSafeNumber: options?.toSafeNumber });
  addToResourceBag(village.materialStockByType, buildingIncome.material, materialKeys, { roundTo1, toSafeNumber: options?.toSafeNumber });

  const upkeepResult = consumeFoodWithSubstitution(village.foodStockByType, unitUpkeepDemand, foodKeys, fallbackMultiplier, options);
  village.foodStockByType = upkeepResult.nextStock;

  const popResult = consumeFoodWithSubstitution(village.foodStockByType, populationDemand, foodKeys, fallbackMultiplier, options);
  village.foodStockByType = popResult.nextStock;

  const shortageTotal = roundTo1((upkeepResult?.shortageTotal || 0) + (popResult?.shortageTotal || 0));
  const populationDelta = adjustVillagePopulationForTurn(village, shortageTotal);
  return {
    village,
    upkeepResult,
    popResult,
    shortageTotal,
    populationDelta
  };
}

export function buildVillageEconomyTurnReport(params = {}, options = {}) {
  const territoryIncome = params?.territoryIncome || { food: {}, material: {}, tiles: 0 };
  const buildingIncome = params?.buildingIncome || { count: 0 };
  const upkeepResult = params?.upkeepResult || { consumedByType: {}, shortageTotal: 0 };
  const popResult = params?.popResult || { consumedByType: {}, shortageTotal: 0 };
  const shortageTotal = Number.isFinite(params?.shortageTotal) ? params.shortageTotal : 0;
  const populationDelta = Number.isFinite(params?.populationDelta) ? params.populationDelta : 0;
  const normalizedVillage = params?.normalizedVillage || {};
  const mapTurnNumber = Number.isFinite(params?.mapTurnNumber) ? params.mapTurnNumber : 0;
  const foodKeys = Array.isArray(params?.foodKeys) ? params.foodKeys : [];
  const materialKeys = Array.isArray(params?.materialKeys) ? params.materialKeys : [];
  const foodLabels = params?.foodLabels || {};
  const materialLabels = params?.materialLabels || {};

  const formatResourceBagFn = typeof options?.formatResourceBag === "function"
    ? options.formatResourceBag
    : ((bag, keys, labels) => formatResourceBag(bag, keys, labels, options));
  const formatCompactNumberFn = typeof options?.formatCompactNumber === "function"
    ? options.formatCompactNumber
    : defaultFormatCompactNumber;
  const formatVillageBuildingBonusFn = typeof options?.formatVillageBuildingBonus === "function"
    ? options.formatVillageBuildingBonus
    : (() => "なし");
  const formatPopulationByRaceFn = typeof options?.formatPopulationByRace === "function"
    ? options.formatPopulationByRace
    : (() => "未設定");

  const lines = [
    `領土収入: 食料 +${formatResourceBagFn(territoryIncome.food, foodKeys, foodLabels)} / 資材 +${formatResourceBagFn(territoryIncome.material, materialKeys, materialLabels)} (領土${territoryIncome.tiles}マス)`,
    `建設補正収入: ${buildingIncome.count > 0 ? `${formatVillageBuildingBonusFn(buildingIncome)} (建物${buildingIncome.count}件)` : "なし"}`,
    `ユニット維持費: 食料 -${formatResourceBagFn(upkeepResult.consumedByType, foodKeys, foodLabels)}${upkeepResult.shortageTotal > 0 ? ` / 不足${formatCompactNumberFn(upkeepResult.shortageTotal)}` : ""}`,
    `村人口消費: 食料 -${formatResourceBagFn(popResult.consumedByType, foodKeys, foodLabels)}${popResult.shortageTotal > 0 ? ` / 不足${formatCompactNumberFn(popResult.shortageTotal)}` : ""}`,
    shortageTotal > 0
      ? `不足ペナルティ: 後回し（将来イベント化） / 不足合計 ${formatCompactNumberFn(shortageTotal)}`
      : "不足ペナルティ: なし",
    `人口変動: ${populationDelta >= 0 ? "+" : ""}${populationDelta} -> ${formatCompactNumberFn(normalizedVillage.population)}人 (${formatPopulationByRaceFn(normalizedVillage.populationByRace)})`
  ];

  const summary = `経済: T${mapTurnNumber} / 食料${formatCompactNumberFn(normalizedVillage.foodStock)} / 資材${formatCompactNumberFn(normalizedVillage.materialStock)} / 人口${formatCompactNumberFn(normalizedVillage.population)}`;
  return { lines, summary };
}
