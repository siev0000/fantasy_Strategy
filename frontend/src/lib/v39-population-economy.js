import { getGameDataRows } from "./game-data-registry.js";

export const POPULATION_UPKEEP_SCALE = 0.2;
export const FOOD_SUBSTITUTE_MULTIPLIER = 1.2;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CLASS_ROWS = getGameDataRows("クラス");
const FACTION_ROWS = getGameDataRows("勢力");

function factionForRace(race) {
  const target = text(race);
  return FACTION_ROWS.find(row => [row?.種族, row?.カナ].map(text).includes(target))
    || (target === "只人" ? FACTION_ROWS.find(row => text(row?.種族) === "人間") : null);
}

export function resolvePopulationClassDefinition(race) {
  const target = text(race);
  const faction = factionForRace(target);
  const candidates = new Set([target, text(faction?.種族), text(faction?.カナ)].filter(Boolean));
  return CLASS_ROWS.find(row => candidates.has(text(row?.名前))) || null;
}

function growthCondition(row) {
  const condition = text(row?.増加条件);
  return ["食事", "魂", "死体"].includes(condition) ? condition : "食事";
}

function unitUpkeepWeight(unit) {
  const mode = text(unit?.combatProfile?.mode);
  if (mode === "elite_army") return 5;
  if (mode === "army") return 4;
  if (mode === "territory_guard") return Math.max(1, Math.floor(number(unit?.combatProfile?.memberCount, 1)));
  return 1;
}

function emptyBag(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

function resourceUnitValue(key) {
  return ["魂", "死体"].includes(text(key)) ? 100 : 1;
}

function normalizeStock(source, keys) {
  return Object.fromEntries(keys.map(key => [key, round1(Math.max(0, number(source?.[key])) * resourceUnitValue(key))]));
}

function stockValueToStoredUnits(source, keys) {
  return Object.fromEntries(keys.map(key => [key, round1(Math.max(0, number(source?.[key])) / resourceUnitValue(key))]));
}

function upkeepPerConsumer(row, resourceKeys) {
  return Object.fromEntries(resourceKeys.map(key => [
    key,
    round1(Math.max(0, number(row?.[key])) / 10 * POPULATION_UPKEEP_SCALE)
  ]));
}

export function buildV39PopulationMaintenanceStock(populationByRace, units = [], resourceKeys = [], turns = 1) {
  const stockValue = emptyBag(resourceKeys);
  const safeTurns = Math.max(0, number(turns, 1));
  const races = new Set([
    ...Object.keys(populationByRace || {}).map(text).filter(Boolean),
    ...units.map(unit => text(unit?.race)).filter(Boolean)
  ]);
  for (const race of races) {
    const population = Math.max(0, Math.floor(number(populationByRace?.[race])));
    const unitWeight = units.filter(unit => text(unit?.race) === race && number(unit?.hp ?? unit?.currentHp, 1) > 0)
      .reduce((sum, unit) => sum + unitUpkeepWeight(unit), 0);
    const perConsumer = upkeepPerConsumer(resolvePopulationClassDefinition(race), resourceKeys);
    for (const key of resourceKeys) stockValue[key] = round1(stockValue[key] + perConsumer[key] * (population + unitWeight) * safeTurns);
  }
  return stockValueToStoredUnits(stockValue, resourceKeys);
}

function growthRequired(population, row) {
  return round1(Math.max(0, population) * (Math.max(0, number(row?.コスト)) / 10 * POPULATION_UPKEEP_SCALE) * 2);
}

function normalizeGrowthState(source, population, row) {
  const required = growthRequired(population, row);
  const previousRequired = Math.max(0, number(source?.lastRequiredGauge, required));
  const previousGauge = Math.max(0, number(source?.gauge));
  const gauge = previousRequired > 0 && required !== previousRequired
    ? round1(required * (previousGauge / previousRequired))
    : round1(previousGauge);
  return {
    gauge,
    lastRequiredGauge:required,
    lastPopulation:population,
    condition:growthCondition(row),
    unitUpkeep:round1(Math.max(0, number(source?.unitUpkeep))),
    shortage:round1(Math.max(0, number(source?.shortage))),
    starvationStage:clamp(Math.floor(number(source?.starvationStage)), 0, 4),
    recoveryStage:clamp(Math.floor(number(source?.recoveryStage)), 0, 4),
    remainingTurns:source?.remainingTurns === null || source?.remainingTurns === undefined
      ? null
      : round1(Math.max(0, number(source.remainingTurns)))
  };
}

export function normalizeV39PopulationGrowthState(populationByRace, source = {}) {
  return Object.fromEntries(Object.entries(populationByRace || {}).map(([race, population]) => [
    race,
    normalizeGrowthState(source?.[race], Math.max(0, Math.floor(number(population))), resolvePopulationClassDefinition(race))
  ]));
}

function allocateResource(stock, demands) {
  const totalDemand = demands.reduce((sum, row) => sum + row.amount, 0);
  if (totalDemand <= 0) return new Map();
  const available = Math.min(stock, totalDemand);
  const ratio = available / totalDemand;
  return new Map(demands.map(row => [row.race, round1(row.amount * ratio)]));
}

function starvationStageForTurns(turns) {
  if (turns >= 4) return 0;
  if (turns >= 2) return 1;
  if (turns >= 1) return 2;
  if (turns >= 0.5) return 3;
  return 4;
}

function resolveStarvationStages(races, stockBefore, normalFoodKeys) {
  const normalDemand = races.reduce((sum, race) => sum + normalFoodKeys.reduce((raceSum, key) => raceSum + number(race.baseDemand[key]), 0), 0);
  const normalStock = normalFoodKeys.reduce((sum, key) => sum + number(stockBefore[key]), 0);
  const specialKeys = Object.keys(stockBefore).filter(key => !normalFoodKeys.includes(key));
  const specialDemand = Object.fromEntries(specialKeys.map(key => [
    key,
    races.reduce((sum, race) => sum + number(race.baseDemand[key]), 0)
  ]));
  return Object.fromEntries(races.map(race => {
    const relevantTurns = [];
    const ownNormalDemand = normalFoodKeys.reduce((sum, key) => sum + number(race.baseDemand[key]), 0);
    if (ownNormalDemand > 0 && normalDemand > 0) relevantTurns.push(normalStock / normalDemand);
    for (const key of specialKeys) if (number(race.baseDemand[key]) > 0 && specialDemand[key] > 0) {
      relevantTurns.push(number(stockBefore[key]) / specialDemand[key]);
    }
    const turns = relevantTurns.length ? Math.min(...relevantTurns) : Number.POSITIVE_INFINITY;
    const rawStage = starvationStageForTurns(turns);
    const previous = race.growth.starvationStage;
    const stage = rawStage < previous ? Math.max(rawStage, previous - 1) : rawStage;
    return [race.race, { stage, turns:Number.isFinite(turns) ? round1(turns) : null }];
  }));
}

function consumeMaintenance(races, stock, resourceKeys, normalFoodKeys, stages) {
  const shortages = Object.fromEntries(races.map(row => [row.race, emptyBag(resourceKeys)]));
  const consumed = emptyBag(resourceKeys);
  for (const resourceKey of resourceKeys) {
    const demands = races.map(race => {
      const stage = stages[race.race]?.stage || 0;
      const multiplier = stage > 0 ? 0.5 : 1;
      return { race:race.race, amount:round1(number(race.baseDemand[resourceKey]) * multiplier) };
    }).filter(row => row.amount > 0);
    const allocations = allocateResource(number(stock[resourceKey]), demands);
    for (const demand of demands) {
      const allocated = number(allocations.get(demand.race));
      shortages[demand.race][resourceKey] = round1(Math.max(0, demand.amount - allocated));
      consumed[resourceKey] = round1(consumed[resourceKey] + allocated);
    }
    stock[resourceKey] = round1(Math.max(0, number(stock[resourceKey]) - number(consumed[resourceKey])));
  }

  const normalDeficits = races.flatMap(race => normalFoodKeys.map(key => ({
    race:race.race,
    key,
    amount:number(shortages[race.race][key])
  }))).filter(row => row.amount > 0);
  const totalDeficit = normalDeficits.reduce((sum, row) => sum + row.amount, 0);
  const donorTotal = normalFoodKeys.reduce((sum, key) => sum + number(stock[key]), 0);
  const coveredEquivalent = Math.min(totalDeficit, donorTotal / FOOD_SUBSTITUTE_MULTIPLIER);
  if (coveredEquivalent > 0 && totalDeficit > 0) {
    for (const deficit of normalDeficits) {
      const covered = round1(coveredEquivalent * deficit.amount / totalDeficit);
      shortages[deficit.race][deficit.key] = round1(Math.max(0, deficit.amount - covered));
    }
    let donorUse = round1(coveredEquivalent * FOOD_SUBSTITUTE_MULTIPLIER);
    for (const key of [...normalFoodKeys].sort((a, b) => number(stock[b]) - number(stock[a]))) {
      const taken = Math.min(number(stock[key]), donorUse);
      stock[key] = round1(number(stock[key]) - taken);
      consumed[key] = round1(number(consumed[key]) + taken);
      donorUse = round1(donorUse - taken);
      if (donorUse <= 0) break;
    }
  }
  return { shortages, consumed };
}

function distributeGrowthResource(races, stock, growthPool, normalFoodKeys, capacityReached) {
  const additions = Object.fromEntries(races.map(row => [row.race, 0]));
  for (const condition of ["食事", "魂", "死体"]) {
    const eligible = races.filter(row => row.condition === condition && !capacityReached);
    if (!eligible.length) continue;
    const keys = condition === "食事" ? normalFoodKeys : [condition];
    const available = keys.reduce((sum, key) => sum + number(growthPool[key]), 0);
    const weightTotal = eligible.reduce((sum, row) => sum + row.population * Math.max(0, number(row.definition?.コスト)), 0);
    if (available <= 0 || weightTotal <= 0) continue;
    for (const race of eligible) additions[race.race] = round1(available * (race.population * number(race.definition?.コスト)) / weightTotal);
    for (const key of keys) stock[key] = round1(Math.max(0, number(stock[key]) - number(growthPool[key])));
  }
  return additions;
}

export function advanceV39PopulationEconomy({ village, units = [], income = {}, resourceKeys = [], normalFoodKeys = [], populationCapacity = Number.POSITIVE_INFINITY } = {}) {
  const populationByRace = Object.fromEntries(Object.entries(village?.populationByRace || {})
    .map(([race, count]) => [text(race), Math.max(0, Math.floor(number(count)))])
    .filter(([race, count]) => race && count > 0));
  const growthSource = village?.populationGrowthByRace || {};
  const races = Object.entries(populationByRace).map(([race, population]) => {
    const definition = resolvePopulationClassDefinition(race);
    const unitWeight = units.filter(unit => text(unit?.race) === race && number(unit?.hp ?? unit?.currentHp, 1) > 0)
      .reduce((sum, unit) => sum + unitUpkeepWeight(unit), 0);
    const perConsumer = upkeepPerConsumer(definition, resourceKeys);
    const baseDemand = Object.fromEntries(resourceKeys.map(key => [key, round1(perConsumer[key] * (population + unitWeight))]));
    return {
      race,
      population,
      definition,
      condition:growthCondition(definition),
      unitWeight,
      unitDemand:round1(Object.values(perConsumer).reduce((sum, value) => sum + value, 0) * unitWeight),
      baseDemand,
      growth:normalizeGrowthState(growthSource[race], population, definition)
    };
  });
  const stock = normalizeStock(village?.foodStockByType, resourceKeys);
  const incomeValue = Object.fromEntries(resourceKeys.map(key => [key, round1(number(income?.[key]) * resourceUnitValue(key))]));
  for (const key of resourceKeys) stock[key] = round1(number(stock[key]) + incomeValue[key]);
  const stockBeforeMaintenance = { ...stock };
  const stages = resolveStarvationStages(races, stockBeforeMaintenance, normalFoodKeys);
  const maintenance = consumeMaintenance(races, stock, resourceKeys, normalFoodKeys, stages);
  const totalPopulationBefore = Object.values(populationByRace).reduce((sum, value) => sum + value, 0);
  const atCapacity = totalPopulationBefore >= populationCapacity;
  const growthPool = Object.fromEntries(resourceKeys.map(key => [
    key,
    round1(Math.max(0, ["魂", "死体"].includes(key)
      ? number(stock[key])
      : incomeValue[key] - number(maintenance.consumed[key])))
  ]));
  const growthAdditions = distributeGrowthResource(races.filter(race => {
    const shortage = Object.values(maintenance.shortages[race.race]).reduce((sum, value) => sum + value, 0);
    return shortage <= 0 && (stages[race.race]?.stage || 0) === 0;
  }), stock, growthPool, normalFoodKeys, atCapacity);
  const growthByRace = {};
  const populationChanges = {};
  let totalPopulation = totalPopulationBefore;

  for (const race of races) {
    const shortage = round1(Object.values(maintenance.shortages[race.race]).reduce((sum, value) => sum + value, 0));
    const required = race.growth.lastRequiredGauge;
    let gauge = shortage > 0
      ? round1(Math.max(0, race.growth.gauge - shortage))
      : round1(race.growth.gauge + number(growthAdditions[race.race]));
    let population = race.population;
    let delta = 0;
    const stage = stages[race.race]?.stage || 0;
    const hadGrowthBuffer = race.growth.gauge > 0;
    if (shortage > 0 && !hadGrowthBuffer && gauge <= 0 && stage >= 2) {
      const declineRate = stage === 2 ? 0.01 : stage === 3 ? 0.02 : 0.05;
      const decrease = Math.min(population, Math.max(1, Math.floor(population * declineRate)));
      population -= decrease;
      totalPopulation -= decrease;
      delta -= decrease;
    } else if (!atCapacity && required > 0 && gauge >= required && totalPopulation < populationCapacity) {
      const residualRate = Math.max(0, (gauge - required) / required);
      const increase = Math.min(
        Math.max(0, populationCapacity - totalPopulation),
        1 + Math.floor(population * 0.05)
      );
      population += increase;
      totalPopulation += increase;
      delta += increase;
      gauge = round1(growthRequired(population, race.definition) * residualRate);
    }
    populationByRace[race.race] = population;
    populationChanges[race.race] = delta;
    growthByRace[race.race] = {
      gauge,
      lastRequiredGauge:growthRequired(population, race.definition),
      lastPopulation:population,
      condition:race.condition,
      unitUpkeep:race.unitDemand,
      shortage,
      starvationStage:stage,
      recoveryStage:Math.max(0, race.growth.starvationStage - stage),
      remainingTurns:stages[race.race]?.turns
    };
  }

  return {
    populationByRace,
    population:totalPopulation,
    populationGrowthByRace:growthByRace,
    foodStockByType:stockValueToStoredUnits(stock, resourceKeys),
    consumedByType:stockValueToStoredUnits(maintenance.consumed, resourceKeys),
    shortageTotal:round1(Object.values(growthByRace).reduce((sum, row) => sum + number(row.shortage), 0)),
    populationDelta:Object.values(populationChanges).reduce((sum, value) => sum + value, 0),
    populationChanges,
    capacityReached:totalPopulation >= populationCapacity
  };
}
