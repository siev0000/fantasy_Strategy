import { getGameDataRows } from "./game-data-registry.js";
import {V39_PRESERVED_FOOD_RULE,isV39PreservedFood,roundV39FoodStock} from './v39-preserved-food-rules.js';
import {resolveV39RaceDefinition} from './v39-race-definitions.js';
import { V39_CIVIC_BALANCE } from "./v39-gameplay-balance.js";

export const POPULATION_UPKEEP_SCALE = 0.2;
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

function upkeepPerConsumer(row, resourceKeys) {
  return Object.fromEntries(resourceKeys.map(key => [
    key,
    isV39MaintenanceFoodResource(key)?round1(Math.max(0, number(row?.[key])) / 10 * POPULATION_UPKEEP_SCALE):0
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
    const perConsumer = upkeepPerConsumer(resolvePopulationClassDefinition(race), resourceKeys);
    for (const key of resourceKeys) stockValue[key] = round1(stockValue[key] + perConsumer[key] * (population + unitWeight) * safeTurns);
  }
  if(roundUp)return Object.fromEntries(resourceKeys.map(key=>[key,Math.max(0,Math.ceil(stockValue[key]/resolveV39PopulationResourceUnitValue(key)*10-1e-8)/10)]));
  return stockValueToStoredUnits(stockValue, resourceKeys);
}

export function resolveV39UnitMaintenanceDemand(unit,resourceKeys){
  const demand=upkeepPerConsumer(resolvePopulationClassDefinition(unit?.race),resourceKeys),weight=unitUpkeepWeight(unit);
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
  return round1(Math.max(0, population) * (Math.max(0, number(row?.コスト)) / 10 * POPULATION_UPKEEP_SCALE) * 2);
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

export function inspectV39NormalFoodSupply(available,demand,normalFoodKeys){
  const stock=normalizeStock(available,normalFoodKeys);
  const result=consumeMaintenance([{race:'total',baseDemand:demand}],stock,normalFoodKeys,normalFoodKeys,{});
  const shortageByType=result.shortages.total;
  return {remaining:stock,consumed:result.consumed,shortageByType,
    shortageTotal:round1(Object.values(shortageByType).reduce((sum,value)=>sum+number(value),0)),
    surplus:round1(Object.values(stock).reduce((sum,value)=>sum+number(value),0))};
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

function applyOvercrowdingOutflow(populationByRace, growthByRace, populationCapacity) {
  const total = Object.values(populationByRace).reduce((sum, value) => sum + Math.max(0, Math.floor(number(value))), 0);
  const capacity = Number.isFinite(Number(populationCapacity))
    ? Math.max(0, Math.floor(Number(populationCapacity)))
    : total;
  const excess = Math.max(0, total - capacity);
  const outflow = excess > 0 ? Math.min(total, Math.ceil(excess * 0.1)) : 0;
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
  for (const row of rows) {
    const growth = growthByRace[row.race];
    if (!growth) continue;
    const previousRequired = Math.max(0, number(growth.lastRequiredGauge));
    const progressRate = previousRequired > 0 ? Math.max(0, number(growth.gauge) / previousRequired) : 0;
    const current = Math.max(0, Math.floor(number(populationByRace[row.race])));
    const required = growthRequired(current, resolvePopulationClassDefinition(row.race));
    growthByRace[row.race] = {
      ...growth,
      gauge:round1(required * progressRate),
      lastRequiredGauge:required,
      lastPopulation:current
    };
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
  const remainingExcess = Math.max(0, remainingPopulation - capacity);
  const rate = remainingExcess > 0
    ? (capacity > 0 ? remainingExcess / capacity : 1)
    : 0;
  return {
    totalPopulation:remainingPopulation,
    excess:remainingExcess,
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
  const incomeValue = Object.fromEntries(resourceKeys.map(key => [key, round1(number(income?.[key]) * resolveV39PopulationResourceUnitValue(key))]));
  for (const key of resourceKeys) stock[key] = round1(number(stock[key]) + incomeValue[key]);
  const stockBeforeMaintenance = { ...stock };
  const maintenanceFoodKeys=normalFoodKeys.filter(isV39MaintenanceFoodResource);
  const stages = resolveStarvationStages(races, stockBeforeMaintenance, maintenanceFoodKeys);
  const maintenance = consumeMaintenance(races, stock, resourceKeys, maintenanceFoodKeys, stages);
  const totalPopulationBefore = Object.values(populationByRace).reduce((sum, value) => sum + value, 0);
  const atCapacity = totalPopulationBefore >= populationCapacity;
  const initialFoodReserveTurnsRemaining=Math.max(0,Math.floor(number(village?.initialFoodReserveTurnsRemaining))-1);
  const reservedStock=initialFoodReserveTurnsRemaining>0
    ?buildV39PopulationMaintenanceStock(populationByRace,units,resourceKeys,initialFoodReserveTurnsRemaining,{roundUp:true}):{};
  const growthPool = Object.fromEntries(resourceKeys.map(key => [
    key,
    round1(Math.max(0, ["魂", "死体"].includes(key)
      ? number(stock[key])-number(reservedStock[key])*resolveV39PopulationResourceUnitValue(key)
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
    const lastGaugeChange=round1(gauge-race.growth.gauge);
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
  totalPopulation = overcrowding.totalPopulation;

  return {
    populationByRace,
    ...(village?.initialFoodReserveTurnsRemaining!==undefined?{initialFoodReserveTurnsRemaining}:{}),
    population:totalPopulation,
    populationGrowthByRace:growthByRace,
    foodStockByType:stockValueToStoredUnits(stock, resourceKeys),
    consumedByType:stockValueToStoredUnits(maintenance.consumed, resourceKeys),
    ...(includeUnitFoodShortfalls?{unitMaintenanceShortfallById:Object.fromEntries(units.filter(unit=>number(unit.hp??unit.currentHp)>0).map(unit=>{
      const race=races.find(row=>row.race===text(unit.race)),weight=unitUpkeepWeight(unit);
      const demand=upkeepPerConsumer(resolvePopulationClassDefinition(unit.race),resourceKeys);
      const consumers=number(race?.population)+number(race?.unitWeight),multiplier=(stages[text(unit.race)]?.stage||0)>0?0.5:1;
      return [unit.id,Object.fromEntries(resourceKeys.map(key=>{
        const full=demand[key]*weight;
        const received=race&&consumers>0?Math.max(0,full*multiplier-number(maintenance.shortages[race.race]?.[key])*weight/consumers):0;
        return [key,Math.round(Math.max(0,full-received)/resolveV39PopulationResourceUnitValue(key)*1e6)/1e6];
      }))];
    }))}:{}),
    shortageTotal:round1(Object.values(growthByRace).reduce((sum, row) => sum + number(row.shortage), 0)),
    populationDelta:Object.values(populationChanges).reduce((sum, value) => sum + value, 0),
    populationChanges,
    capacityReached:totalPopulation >= populationCapacity,
    overcrowdingPopulation:overcrowding.excess,
    overcrowdingRate:overcrowding.rate,
    overcrowdingHappinessPenalty:overcrowding.happinessPenalty,
    overcrowdingSecurityPenalty:overcrowding.securityPenalty,
    lastPopulationOutflow:overcrowding.outflow
  };
}
