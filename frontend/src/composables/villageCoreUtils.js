export function resolveVillageScaleLabel(village, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const pop = toSafeNumber(village?.population, 0);
  if (pop >= 420) return "大都市";
  if (pop >= 260) return "都市";
  if (pop >= 160) return "町";
  return "村";
}

export function resolveNamedLimit(village, options = {}) {
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const namedLimitByScale = options?.namedLimitByScale || { 村: 2, 町: 4, 都市: 7, 大都市: 10 };
  const scale = resolveVillageScaleLabel(village, { toSafeNumber });
  return toSafeNumber(namedLimitByScale[scale], namedLimitByScale.村);
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
