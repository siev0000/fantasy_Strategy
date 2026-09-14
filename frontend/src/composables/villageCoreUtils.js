import { getGameDataRows } from "../lib/game-data-registry.js";

const nonEmptyText = value => String(value ?? "").trim();

export function getVillageScaleDefinitions(options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const rows = Array.isArray(options?.scaleDefinitions)
    ? options.scaleDefinitions
    : getGameDataRows("施設").filter(row => nonEmptyText(row?.分類) === "拠点規模");
  return rows.map(row => ({
    name:nonEmptyText(row?.施設名),
    key:nonEmptyText(row?.識別キー),
    level:Math.max(1, Math.floor(toSafeNumber(row?.規模Lv, 1))),
    minPopulation:Math.max(0, Math.floor(toSafeNumber(row?.規模下限人口, 0))),
    namedLimit:Math.max(0, Math.floor(toSafeNumber(row?.ネームド上限, 0))),
    imageName:nonEmptyText(row?.表示画像 || row?.施設名),
    displaySize:Math.max(0, toSafeNumber(row?.表示サイズ, 0)),
    capacityPerTile:Math.max(0, Math.floor(toSafeNumber(row?.["1マス収容人数"], 0))),
    footprintTiles:Math.max(1, Math.floor(toSafeNumber(row?.占有マス数, 1))),
    buildingCapacity:Math.max(1, Math.floor(toSafeNumber(row?.建築数, 1))),
    row
  })).filter(row => row.name).sort((a, b) => a.minPopulation-b.minPopulation || a.level-b.level);
}

export function resolveVillageScaleDefinition(village, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const definitions = getVillageScaleDefinitions({ ...options, toSafeNumber });
  if (!definitions.length) return null;
  const populationValue = village?.population;
  const hasPopulation = populationValue !== null
    && populationValue !== undefined
    && nonEmptyText(populationValue) !== ""
    && Number.isFinite(Number(populationValue));
  if (hasPopulation) {
    const population = Math.max(0, toSafeNumber(populationValue, 0));
    return [...definitions].reverse().find(row => population >= row.minPopulation) || definitions[0];
  }
  const explicit = nonEmptyText(village?.scaleLabel || village?.scale || village?.type || village?.residentialLevel || village?.villageLevelKey);
  const explicitDefinition = explicit
    ? definitions.find(row => row.name === explicit || row.key === explicit)
    : null;
  if (explicitDefinition) return explicitDefinition;
  return definitions[0];
}

export function resolveVillageScaleLabel(village, options = {}) {
  return resolveVillageScaleDefinition(village, options)?.name || nonEmptyText(options?.fallbackLabel) || "村";
}

export function resolveNamedLimit(village, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const definition = resolveVillageScaleDefinition(village, { ...options, toSafeNumber });
  if (definition?.namedLimit > 0) return definition.namedLimit;
  const namedLimitByScale = options?.namedLimitByScale || {};
  const scale = definition?.name || resolveVillageScaleLabel(village, { ...options, toSafeNumber });
  return Math.max(0, toSafeNumber(namedLimitByScale[scale], 0));
}

export function createInitialFoodStockByType(initialPopulation = 10, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const randomInt = typeof options?.randomInt === "function"
    ? options.randomInt
    : ((min, max) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
  const pop = Math.max(1, Math.floor(toSafeNumber(initialPopulation, 10)));
  return {
    穀物: randomInt(pop * 6, pop * 9),
    野菜: randomInt(pop * 4, pop * 7),
    肉: randomInt(pop * 3, pop * 6),
    魚: randomInt(pop * 2, pop * 5)
  };
}

export function createInitialMaterialStockByType(initialPopulation = 10, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const randomInt = typeof options?.randomInt === "function"
    ? options.randomInt
    : ((min, max) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
  const pop = Math.max(1, Math.floor(toSafeNumber(initialPopulation, 10)));
  return {
    木材: randomInt(pop * 3, pop * 5),
    石材: randomInt(pop * 2, pop * 4),
    鉄: randomInt(pop * 1, pop * 3)
  };
}

export function adjustVillagePopulationForTurn(village, shortageTotal = 0, options = {}) {
  if (!village) return 0;
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const randomInt = typeof options?.randomInt === "function"
    ? options.randomInt
    : ((min, max) => {
      const lo = Math.ceil(Math.min(min, max));
      const hi = Math.floor(Math.max(min, max));
      return Math.floor(Math.random() * (hi - lo + 1)) + lo;
    });
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const selectedRaceFallback = nonEmptyText(options?.selectedRaceFallback || "") || "只人";

  const shortage = Math.max(0, toSafeNumber(shortageTotal, 0));
  const driftMin = shortage > 0 ? -2 : -1;
  const driftMax = shortage > 0 ? 0 : 2;
  let delta = randomInt(driftMin, driftMax);

  const entries = Object.entries(village.populationByRace || {})
    .map(([race, count]) => ({ race, count: Math.max(0, Math.floor(toSafeNumber(count, 0))) }))
    .filter(v => nonEmptyText(v.race) && v.count > 0)
    .sort((a, b) => b.count - a.count);
  const targetRace = entries[0]?.race || selectedRaceFallback;
  const current = Math.max(0, Math.floor(toSafeNumber(village.populationByRace?.[targetRace], 0)));
  if (current + delta < 1) {
    delta = 1 - current;
  }
  village.populationByRace = {
    ...(village.populationByRace || {}),
    [targetRace]: Math.max(1, current + delta)
  };
  village.population = Math.max(1, Math.floor(
    Object.values(village.populationByRace).reduce((acc, n) => acc + toSafeNumber(n, 0), 0)
  ));
  return delta;
}
