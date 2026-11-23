import { getGameDataRows } from "./game-data-registry.js";
import {V39_PRESERVED_FOOD_RULE,isV39PreservedFood,roundV39FoodStock} from './v39-preserved-food-rules.js';
import {resolveV39RaceDefinition} from './v39-race-definitions.js';
import { V39_CIVIC_BALANCE, V39_FOOD_UPKEEP_BALANCE, V39_POPULATION_GROWTH_BALANCE } from "./v39-gameplay-balance.js";

const POPULATION_GROWTH_COST_SCALE = 0.2;
export const FOOD_SUBSTITUTE_MULTIPLIER = 1.2;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const CLASS_ROWS = getGameDataRows("クラス");
const FACTION_ROWS = getGameDataRows("勢力");
const NON_MAINTENANCE_RESOURCES=new Set(getGameDataRows('都市基本データ').filter(row=>row.維持食料===false).map(row=>text(row.データ分類)));
export const isV39MaintenanceFoodResource=key=>!NON_MAINTENANCE_RESOURCES.has(text(key));

function factionForRace(race) {
  const target = text(race);
  return FACTION_ROWS.find(row => [row?.種族, row?.カナ].map(text).includes(target))
    || (target === "只人" ? FACTION_ROWS.find(row => text(row?.種族) === "人間") : null);
}

export function resolvePopulationClassDefinition(race) {
  const target = text(race);
  const faction = factionForRace(target);
  const definition=resolveV39RaceDefinition(target);
  const candidates = new Set([text(definition?.className),target,text(definition?.key),text(faction?.種族),text(faction?.カナ)].filter(Boolean));
  return CLASS_ROWS.find(row => candidates.has(text(row?.名前))) || null;
}

const BASE_HOUSING_SIZE = 170;
const HOUSING_EPSILON = 1e-9;

export function resolveV39ResidentHousingWeight(race) {
  const definition = resolveV39RaceDefinition(race);
  const baseClass = (definition?.className && CLASS_ROWS.find(row => row.名前 === definition.className))
    || resolvePopulationClassDefinition(race);
  const size = number(baseClass?.SIZ);
  return size > 0 ? Math.sqrt(size / BASE_HOUSING_SIZE) : 1;
}

export function resolveV39OccupiedHousing(populationByRace, fallbackPopulation = 0) {
  const entries = Object.entries(populationByRace || {});
  if (!entries.length) return Math.max(0, number(fallbackPopulation));
  return entries.reduce((sum, [race, population]) =>
    sum + Math.max(0, number(population)) * resolveV39ResidentHousingWeight(race), 0);
}

function availableHousingPopulation(capacity, occupied, weight) {
  return Math.max(0, Math.floor((capacity - occupied + HOUSING_EPSILON) / weight));
}

export function resolveV39ConsumableFoodKeys(race, foodResourceKeys = [], normalFoodKeys = []) {
  const definition = resolvePopulationClassDefinition(race);
  const normalSet = new Set(normalFoodKeys.map(text));
  const consumesNormalFood = foodResourceKeys.some(key => isV39MaintenanceFoodResource(key) && normalSet.has(text(key)) && number(definition?.[key]) > 0);
  return foodResourceKeys.filter(key => isV39MaintenanceFoodResource(key) && ((normalSet.has(text(key)) && consumesNormalFood)
    || (!normalSet.has(text(key)) && number(definition?.[key]) > 0)));
}

function growthCondition(row) {
  const condition = text(row?.増加条件);
  return ["食事", "魂", "死体"].includes(condition) ? condition : "食事";
}

function unitUpkeepWeight(unit) {
  if (unit?.animalArmy?.members) return unit.animalArmy.members.length;
  const mode = text(unit?.combatProfile?.mode);
  if (mode === "elite_army") return 5;
  if (mode === "army") return 4;
  if (mode === "territory_guard") return Math.max(1, Math.floor(number(unit?.combatProfile?.memberCount, 1)));
  return 1;
}

function emptyBag(keys) {
  return Object.fromEntries(keys.map(key => [key, 0]));
}

export function resolveV39PopulationResourceUnitValue(key) {
  if(isV39PreservedFood(key))return V39_PRESERVED_FOOD_RULE.nutrition;
  return ["魂", "死体"].includes(text(key)) ? 100 : 1;
}

function normalizeStock(source, keys) {
  return Object.fromEntries(keys.map(key => [key, round1(Math.max(0, number(source?.[key])) * resolveV39PopulationResourceUnitValue(key))]));
}

function stockValueToStoredUnits(source, keys) {
  return Object.fromEntries(keys.map(key => [key, roundV39FoodStock(Math.max(0, number(source?.[key])) / resolveV39PopulationResourceUnitValue(key),key)]));
}

function upkeepPerConsumer(row, resourceKeys, scale) {
  return Object.fromEntries(resourceKeys.map(key => [
    key,
    isV39MaintenanceFoodResource(key)?round1(Math.max(0, number(row?.[key])) / 10 * scale):0
  ]));
}

export function buildV39PopulationMaintenanceStock(populationByRace, units = [], resourceKeys = [], turns = 1, {roundUp=false}={}) {
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
    const definition = resolvePopulationClassDefinition(race);
    const residents = upkeepPerConsumer(definition, resourceKeys, V39_FOOD_UPKEEP_BALANCE.residentScale);
    const unitUpkeep = upkeepPerConsumer(definition, resourceKeys, V39_FOOD_UPKEEP_BALANCE.unitScale);
    for (const key of resourceKeys) stockValue[key] = round1(stockValue[key] + (residents[key] * population + unitUpkeep[key] * unitWeight) * safeTurns);
  }
  if(roundUp)return Object.fromEntries(resourceKeys.map(key=>[key,Math.max(0,Math.ceil(stockValue[key]/resolveV39PopulationResourceUnitValue(key)*10-1e-8)/10)]));
  return stockValueToStoredUnits(stockValue, resourceKeys);
}

export function resolveV39UnitMaintenanceDemand(unit,resourceKeys){
  const demand=upkeepPerConsumer(resolvePopulationClassDefinition(unit?.race),resourceKeys,V39_FOOD_UPKEEP_BALANCE.unitScale),weight=unitUpkeepWeight(unit);
  return Object.fromEntries(resourceKeys.map(key=>[key,round1(demand[key]*weight)/resolveV39PopulationResourceUnitValue(key)]));
}

export function consumeV39CarriedMaintenance(stockByType,demandByType,resourceKeys,normalFoodKeys){
  const stock=normalizeStock(stockByType,resourceKeys);
  const baseDemand=Object.fromEntries(resourceKeys.map(key=>[key,isV39MaintenanceFoodResource(key)?Math.ceil(Math.max(0,number(demandByType[key]))*resolveV39PopulationResourceUnitValue(key)*10-1e-8)/10:0]));
  const result=consumeMaintenance([{race:'unit',baseDemand}],stock,resourceKeys,normalFoodKeys.filter(isV39MaintenanceFoodResource),{});
  const convert=bag=>Object.fromEntries(resourceKeys.map(key=>[key,Math.round(number(bag[key])/resolveV39PopulationResourceUnitValue(key)*1e6)/1e6]));
  return {remaining:convert(stock),consumed:convert(result.consumed),fed:Object.values(result.shortages.unit).every(value=>number(value)<=0)};
}

function growthRequired(population, row) {
  return round1(Math.max(0, population) * (Math.max(0, number(row?.コスト)) / 10 * POPULATION_GROWTH_COST_SCALE) * 2);
}

export function rescaleV39PopulationGrowthForPopulationChange(populationByRace = {}, growthByRace = {}) {
  return Object.fromEntries(Object.entries(populationByRace).map(([race, population]) => {
    const growth = growthByRace?.[race] || {};
    const previousRequired = Math.max(0, number(growth?.lastRequiredGauge));
    const progressRate = previousRequired > 0 ? Math.max(0, number(growth?.gauge) / previousRequired) : 0;
    const current = Math.max(0, Math.floor(number(population)));
    const required = growthRequired(current, resolvePopulationClassDefinition(race));
    return [race, {
      ...growth,
      gauge:round1(required * progressRate),
      lastRequiredGauge:required,
      lastPopulation:current
    }];
  }));
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

function resolveStarvationStages(races, stockBefore, normalFoodKeys, ignoreNormalFood = false) {
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
    if (!ignoreNormalFood && ownNormalDemand > 0 && normalDemand > 0) relevantTurns.push(normalStock / normalDemand);
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

  // Preserved rations cover ordinary nutrition directly, without substitution loss.
  const rationKey=V39_PRESERVED_FOOD_RULE.name;
  for(const race of races)for(const key of normalFoodKeys){
    const taken=round1(Math.min(number(stock[rationKey]),number(shortages[race.race][key])));
    if(taken<=0)continue;
    stock[rationKey]=round1(number(stock[rationKey])-taken);
    consumed[rationKey]=round1(number(consumed[rationKey])+taken);
    shortages[race.race][key]=round1(number(shortages[race.race][key])-taken);
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

function inspectMealProductionDeficit(races, income, foodKeys) {
  const totalDemand = round1(races.reduce((sum, race) =>
    sum + foodKeys.reduce((total, key) => total + race.baseDemand[key], 0), 0));
  if (totalDemand <= 0) return 0;
  const produced = Object.fromEntries(foodKeys.map(key => [key, Math.max(0, income[key])]));
  const {shortages} = consumeMaintenance(races, produced, foodKeys, foodKeys, {});
  const deficit = round1(Object.values(shortages).reduce((sum, row) =>
    sum + Object.values(row).reduce((total, amount) => total + amount, 0), 0));
  return deficit / totalDemand;
}

export function inspectV39NormalFoodSupply(available,demand,normalFoodKeys){
  const stock=normalizeStock(available,normalFoodKeys);
  const result=consumeMaintenance([{race:'total',baseDemand:demand}],stock,normalFoodKeys,normalFoodKeys,{});
  const shortageByType=result.shortages.total;
  return {remaining:stock,consumed:result.consumed,shortageByType,
    shortageTotal:round1(Object.values(shortageByType).reduce((sum,value)=>sum+number(value),0)),
    surplus:round1(Object.values(stock).reduce((sum,value)=>sum+number(value),0))};
}

function distributeSpecialGrowthResource(races, stock, reservedStock) {
  const additions = Object.fromEntries(races.map(row => [row.race, 0]));
  for (const condition of ["魂", "死体"]) {
    const eligible = races.filter(row => row.condition === condition);
    if (!eligible.length) continue;
    const reserved = number(reservedStock[condition]) * resolveV39PopulationResourceUnitValue(condition);
    const available = round1(Math.max(0, number(stock[condition]) - reserved));
    const weightTotal = eligible.reduce((sum, row) => sum + row.population * Math.max(0, number(row.definition?.コスト)), 0);
    if (available <= 0 || weightTotal <= 0) continue;
    for (const race of eligible) additions[race.race] = round1(available * (race.population * number(race.definition?.コスト)) / weightTotal);
    stock[condition] = round1(Math.max(0, number(stock[condition]) - available));
  }
  return additions;
}

function spendMealGrowthSurplus(stock, income, fullUpkeep, races, foodKeys) {
  const {surplusStepRate, extraConsumptionRatePerStep, growthSpeedBonusPerStep} = V39_POPULATION_GROWTH_BALANCE;
  const upkeep = round1(races.reduce((sum, race) =>
    sum + foodKeys.reduce((total, key) => total + race.baseDemand[key], 0), 0));
  if (upkeep <= 0 || surplusStepRate <= 0) return 0;
  const production = round1(foodKeys.reduce((sum, key) => sum + income[key], 0));
  const surplus = round1(production - upkeep);
  const earnedSteps = Math.floor(surplus / (upkeep * surplusStepRate) + 1e-9);
  if (earnedSteps <= 0) return 0;
  const actualUpkeep = round1(foodKeys.reduce((sum, key) => sum + fullUpkeep.consumed[key], 0));
  const available = foodKeys.map(key => ({
    key,
    amount:round1(Math.max(0, Math.min(stock[key], income[key] - fullUpkeep.consumed[key])))
  })).sort((a, b) => b.amount - a.amount);
  const spendable = Math.max(0, Math.min(round1(production - Math.max(upkeep, actualUpkeep)),
    round1(available.reduce((sum, row) => sum + row.amount, 0))));
  const costPerStep = upkeep * extraConsumptionRatePerStep;
  const paidSteps = costPerStep > 0 ? Math.floor(spendable / costPerStep + 1e-9) : earnedSteps;
  const steps = Math.max(0, Math.min(earnedSteps, paidSteps));
  let remainingCost = round1(steps * costPerStep);
  for (const {key, amount} of available) {
    if (remainingCost <= 0) break;
    const spent = Math.min(amount, remainingCost);
    stock[key] = round1(stock[key] - spent);
    remainingCost = round1(remainingCost - spent);
  }
  return steps * growthSpeedBonusPerStep;
}

function applyOvercrowdingOutflow(populationByRace, growthByRace, populationCapacity) {
  const total = Object.values(populationByRace).reduce((sum, value) => sum + Math.max(0, Math.floor(number(value))), 0);
  const occupied = resolveV39OccupiedHousing(populationByRace);
  const excess = Math.max(0, occupied - populationCapacity);
  if (excess <= HOUSING_EPSILON) return {totalPopulation:total,excess:0,rate:0,outflow:0,happinessPenalty:0,securityPenalty:0};
  const outflow = Math.min(total, Math.ceil(excess * total / occupied * 0.1));
  let remaining = outflow;
  const rows = Object.entries(populationByRace)
    .map(([race, population]) => ({ race, population:Math.max(0, Math.floor(number(population))) }))
    .sort((left, right) => right.population - left.population || left.race.localeCompare(right.race, "ja"));
  for (const row of rows) {
    const target = Math.floor(outflow * row.population / Math.max(1, total));
    const decrease = Math.min(row.population, remaining, Math.max(0, target));
    if (decrease <= 0) continue;
    populationByRace[row.race] = row.population - decrease;
    remaining -= decrease;
  }
  if (remaining > 0) {
    while (remaining > 0) {
      let changed = false;
      for (const row of rows) {
        if (remaining <= 0) break;
        const current = Math.max(0, Math.floor(number(populationByRace[row.race])));
        if (current <= 0) continue;
        populationByRace[row.race] = current - 1;
        remaining -= 1;
        changed = true;
      }
      if (!changed) break;
    }
  }
  const actualOutflow = outflow - remaining;
  const remainingPopulation = total - actualOutflow;
  Object.assign(growthByRace, rescaleV39PopulationGrowthForPopulationChange(populationByRace, growthByRace));
  const remainingOccupied = resolveV39OccupiedHousing(populationByRace);
  const remainingExcess = Math.max(0, remainingOccupied - populationCapacity);
  const rate = remainingExcess > HOUSING_EPSILON
    ? (populationCapacity > 0 ? remainingExcess / populationCapacity : 1)
    : 0;
  return {
    totalPopulation:remainingPopulation,
    excess:rate > 0 ? Math.ceil(remainingExcess * remainingPopulation / remainingOccupied - HOUSING_EPSILON) : 0,
    rate,
    outflow:actualOutflow,
    happinessPenalty:-rate * V39_CIVIC_BALANCE.overcrowdingPenaltyPerRate,
    securityPenalty:-rate * V39_CIVIC_BALANCE.overcrowdingPenaltyPerRate
  };
}

export function advanceV39PopulationEconomy({ village, units = [], income = {}, resourceKeys = [], normalFoodKeys = [], populationCapacity = Number.POSITIVE_INFINITY,includeUnitFoodShortfalls=false } = {}) {
  const populationByRace = Object.fromEntries(Object.entries(village?.populationByRace || {})
    .map(([race, count]) => [text(race), Math.max(0, Math.floor(number(count)))])
    .filter(([race, count]) => race && count > 0));
  const growthSource = village?.populationGrowthByRace || {};
  const races = Object.entries(populationByRace).map(([race, population]) => {
    const definition = resolvePopulationClassDefinition(race);
    const unitWeight = units.filter(unit => text(unit?.race) === race && number(unit?.hp ?? unit?.currentHp, 1) > 0)
      .reduce((sum, unit) => sum + unitUpkeepWeight(unit), 0);
    const residents = upkeepPerConsumer(definition, resourceKeys, V39_FOOD_UPKEEP_BALANCE.residentScale);
    const unitUpkeep = upkeepPerConsumer(definition, resourceKeys, V39_FOOD_UPKEEP_BALANCE.unitScale);
    const baseDemand = Object.fromEntries(resourceKeys.map(key => [key, round1(residents[key] * population + unitUpkeep[key] * unitWeight)]));
    return {
      race,
      population,
      definition,
      housingWeight:resolveV39ResidentHousingWeight(race),
      condition:growthCondition(definition),
      unitWeight,
      unitDemand:round1(Object.values(unitUpkeep).reduce((sum, value) => sum + value, 0) * unitWeight),
      baseDemand,
      growth:normalizeGrowthState(growthSource[race], population, definition)
    };
  });
  const stock = normalizeStock(village?.foodStockByType, resourceKeys);
  const incomeValue = Object.fromEntries(resourceKeys.map(key => [key, round1(number(income?.[key]) * resolveV39PopulationResourceUnitValue(key))]));
  for (const key of resourceKeys) stock[key] = round1(number(stock[key]) + incomeValue[key]);
  const stockBeforeMaintenance = { ...stock };
  const maintenanceFoodKeys=normalFoodKeys.filter(isV39MaintenanceFoodResource);
  const mealDeficitRate = inspectMealProductionDeficit(races, incomeValue, maintenanceFoodKeys);
  const {toleratedFoodDeficitRate, growthSpeedAtToleratedDeficit} = V39_POPULATION_GROWTH_BALANCE;
  const mildDeficit = mealDeficitRate > 0 && mealDeficitRate <= toleratedFoodDeficitRate + 1e-9;
  const protectedStock = mildDeficit ? Object.fromEntries(maintenanceFoodKeys.map(key =>
    [key, round1(stock[key] - Math.max(0, incomeValue[key]))])) : {};
  for (const [key, reserve] of Object.entries(protectedStock)) stock[key] = round1(stock[key] - reserve);
  const stages = resolveStarvationStages(races, stockBeforeMaintenance, maintenanceFoodKeys, mildDeficit);
  const maintenance = consumeMaintenance(races, stock, resourceKeys, maintenanceFoodKeys, stages);
  for (const [key, reserve] of Object.entries(protectedStock)) {
    stock[key] = round1(stock[key] + reserve);
    for (const race of races) maintenance.shortages[race.race][key] = 0;
  }
  let occupiedHousing = races.reduce((sum, race) => sum + race.population * race.housingWeight, 0);
  const initialFoodReserveTurnsRemaining=Math.max(0,Math.floor(number(village?.initialFoodReserveTurnsRemaining))-1);
  const reservedStock=initialFoodReserveTurnsRemaining>0
    ?buildV39PopulationMaintenanceStock(populationByRace,units,resourceKeys,initialFoodReserveTurnsRemaining,{roundUp:true}):{};
  const fedRaces = races.filter(race => availableHousingPopulation(populationCapacity, occupiedHousing, race.housingWeight) > 0
    && Object.values(maintenance.shortages[race.race]).every(value => value <= 0));
  const growthAdditions = distributeSpecialGrowthResource(
    fedRaces.filter(race => stages[race.race].stage === 0), stock, reservedStock);
  const mealGrowthRaces = fedRaces.filter(race => race.condition === "食事");
  // Low reserves can halve actual rations. Growth requires enough for full upkeep.
  const fullUpkeep = mealGrowthRaces.some(race => stages[race.race].stage > 0)
    ? consumeMaintenance(races, { ...stockBeforeMaintenance }, resourceKeys, maintenanceFoodKeys, {})
    : maintenance;
  const growingMealRaces = mealDeficitRate > 0 && !mildDeficit ? [] : mealGrowthRaces.filter(race => race.growth.lastRequiredGauge > 0
    && Object.entries(fullUpkeep.shortages[race.race]).every(([key,value]) => value <= 0 || Object.hasOwn(protectedStock,key)));
  const speedBonus = growingMealRaces.length && !mildDeficit
    ? spendMealGrowthSurplus(stock, incomeValue, fullUpkeep, races, maintenanceFoodKeys)
    : 0;
  const speedMultiplier = mildDeficit
    ? 1 - (1 - growthSpeedAtToleratedDeficit) * Math.min(1, mealDeficitRate / toleratedFoodDeficitRate)
    : 1 + speedBonus;
  const gaugeRate = V39_POPULATION_GROWTH_BALANCE.fedTurnGaugeRate * speedMultiplier;
  for (const race of growingMealRaces) {
    if (gaugeRate > 0) growthAdditions[race.race] = Math.max(0.1, round1(race.growth.lastRequiredGauge * gaugeRate));
  }
  const growthByRace = {};
  const populationChanges = {};

  for (const race of races) {
    const shortage = round1(Object.values(maintenance.shortages[race.race]).reduce((sum, value) => sum + value, 0));
    const required = race.growth.lastRequiredGauge;
    let gauge = shortage > 0
      ? round1(Math.max(0, race.growth.gauge - shortage))
      : round1(race.growth.gauge + number(growthAdditions[race.race]));
    const lastGaugeChange=round1(gauge-race.growth.gauge);
    let population = race.population;
    let delta = 0;
    const stage = stages[race.race]?.stage || 0;
    const hadGrowthBuffer = race.growth.gauge > 0;
    if (shortage > 0 && !hadGrowthBuffer && gauge <= 0 && stage >= 2) {
      const declineRate = stage === 2 ? 0.01 : stage === 3 ? 0.02 : 0.05;
      const decrease = Math.min(population, Math.max(1, Math.floor(population * declineRate)));
      population -= decrease;
      delta -= decrease;
    } else if (shortage <= 0 && (race.condition !== "食事" || number(growthAdditions[race.race]) > 0)
      && required > 0 && gauge >= required && fedRaces.includes(race)) {
      const residualRate = Math.max(0, (gauge - required) / required);
      const increase = Math.min(
        availableHousingPopulation(populationCapacity, occupiedHousing, race.housingWeight),
        1 + Math.floor(population * 0.05)
      );
      if (increase > 0) {
        population += increase;
        delta += increase;
        gauge = round1(growthRequired(population, race.definition) * residualRate);
      }
    }
    occupiedHousing += delta * race.housingWeight;
    populationByRace[race.race] = population;
    populationChanges[race.race] = delta;
    growthByRace[race.race] = {
      gauge,
      lastGaugeChange,
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

  const populationBeforeOutflow = { ...populationByRace };
  const overcrowding = applyOvercrowdingOutflow(populationByRace, growthByRace, populationCapacity);
  for (const [race, current] of Object.entries(populationByRace)) {
    populationChanges[race] = number(populationChanges[race]) - Math.max(0, number(populationBeforeOutflow[race]) - current);
    if(growthByRace[race])growthByRace[race].lastPopulationDelta=populationChanges[race];
  }
  const totalPopulation = overcrowding.totalPopulation;
  const remainingHousing = populationCapacity - resolveV39OccupiedHousing(populationByRace);

  return {
    populationByRace,
    ...(village?.initialFoodReserveTurnsRemaining!==undefined?{initialFoodReserveTurnsRemaining}:{}),
    population:totalPopulation,
    populationGrowthByRace:growthByRace,
    foodStockByType:stockValueToStoredUnits(stock, resourceKeys),
    consumedByType:stockValueToStoredUnits(maintenance.consumed, resourceKeys),
    ...(includeUnitFoodShortfalls?{unitMaintenanceShortfallById:Object.fromEntries(units.filter(unit=>number(unit.hp??unit.currentHp)>0).map(unit=>{
      const race=races.find(row=>row.race===text(unit.race)),weight=unitUpkeepWeight(unit);
      const demand=upkeepPerConsumer(resolvePopulationClassDefinition(unit.race),resourceKeys,V39_FOOD_UPKEEP_BALANCE.unitScale);
      const multiplier=(stages[text(unit.race)]?.stage||0)>0?0.5:1;
      return [unit.id,Object.fromEntries(resourceKeys.map(key=>{
        const full=demand[key]*weight;
        if (Object.hasOwn(protectedStock,key)) return [key,0];
        const totalDemand=number(race?.baseDemand[key]);
        const received=totalDemand>0?Math.max(0,full*multiplier-number(maintenance.shortages[race.race]?.[key])*full/totalDemand):0;
        return [key,Math.round(Math.max(0,full-received)/resolveV39PopulationResourceUnitValue(key)*1e6)/1e6];
      }))];
    }))}:{}),
    shortageTotal:round1(Object.values(growthByRace).reduce((sum, row) => sum + number(row.shortage), 0)),
    populationDelta:Object.values(populationChanges).reduce((sum, value) => sum + value, 0),
    populationChanges,
    capacityReached:remainingHousing <= HOUSING_EPSILON || (totalPopulation > 0
      && races.every(race => populationByRace[race.race] <= 0 || race.housingWeight > remainingHousing + HOUSING_EPSILON)),
    overcrowdingPopulation:overcrowding.excess,
    overcrowdingRate:overcrowding.rate,
    overcrowdingHappinessPenalty:overcrowding.happinessPenalty,
    overcrowdingSecurityPenalty:overcrowding.securityPenalty,
    lastPopulationOutflow:overcrowding.outflow
  };
}
