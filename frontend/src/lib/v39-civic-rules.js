import { getGameDataRows } from "./game-data-registry.js";
import { V39_CIVIC_BALANCE } from "./v39-gameplay-balance.js";

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const optionalNumber = value => {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = value => String(value ?? "").trim();
const clamp = value => Math.max(0, Math.min(100, Math.round(number(value) * 10) / 10));
const approach = (current, target) => {
  const step = V39_CIVIC_BALANCE.changePerTurn;
  if (current < target) return clamp(Math.min(target, current + step));
  if (current > target) return clamp(Math.max(target, current - step));
  return clamp(current);
};

const CLASS_ROWS = getGameDataRows("クラス");
const RACE_ROWS = getGameDataRows("種族");
const FACTION_ROWS = getGameDataRows("勢力");
const TEMP_HAPPINESS_ROWS = getGameDataRows("種族幸福度仮");
const RACE_HAPPINESS_FIELDS = Object.freeze([
  "幸福度基礎値",
  "幸福度食料倍率",
  "幸福度住居倍率",
  "幸福度施設倍率",
  "幸福度飢餓倍率",
  "幸福度人口過多倍率",
  "幸福度災害倍率",
  "幸福度占領倍率",
  "幸福度異種族倍率",
  "幸福度イベント倍率"
]);

function facilityValue(village, key) {
  return number(village?.cityModifiers?.[key], number(village?.facilityModifiers?.[key]));
}

function foodReserveTurns(village, race = "") {
  const targetRace = text(race);
  if (targetRace) {
    const value = village?.populationGrowthByRace?.[targetRace]?.remainingTurns;
    return value !== null && value !== undefined && Number.isFinite(Number(value))
      ? Math.max(0, Number(value))
      : null;
  }
  const turns = Object.values(village?.populationGrowthByRace || {})
    .map(row => row?.remainingTurns)
    .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)))
    .map(Number);
  return turns.length ? Math.max(0, Math.min(...turns)) : null;
}

function foodReserveBonus(village, race = "") {
  const turns = foodReserveTurns(village, race);
  if (turns === null) return 0;
  const start = number(V39_CIVIC_BALANCE.foodReserveBonusStartTurns);
  const full = Math.max(start, number(V39_CIVIC_BALANCE.foodReserveBonusFullTurns, start));
  if (turns <= start) return 0;
  if (turns >= full || full <= start) return number(V39_CIVIC_BALANCE.foodReserveHappinessMaxBonus);
  return number(V39_CIVIC_BALANCE.foodReserveHappinessMaxBonus) * (turns-start) / (full-start);
}

function housingComfortBonus(village) {
  const population = Math.max(0, number(village?.population, Object.values(village?.populationByRace || {}).reduce((sum, value) => sum + number(value), 0)));
  const capacity = Math.max(0, number(village?.populationCapacity));
  if (capacity <= 0) return 0;
  const rate = population / capacity;
  const fullRate = Math.max(0, number(V39_CIVIC_BALANCE.housingComfortFullBonusRate));
  const zeroRate = Math.max(fullRate, number(V39_CIVIC_BALANCE.housingComfortZeroBonusRate, 1));
  const maxBonus = Math.max(0, number(V39_CIVIC_BALANCE.housingComfortMaxBonus));
  if (rate <= fullRate) return maxBonus;
  if (rate >= zeroRate || zeroRate <= fullRate) return 0;
  return maxBonus * (zeroRate-rate) / (zeroRate-fullRate);
}

function civicEventValue(village, key) {
  return number(village?.civicEventModifiers?.[key]);
}

function classNameForRace(race) {
  const target = text(race);
  const raceRow = RACE_ROWS.find(item => [item?.key, item?.name].map(text).includes(target));
  if (text(raceRow?.className)) return text(raceRow.className);
  const factionRow = FACTION_ROWS.find(item => [item?.種族, item?.カナ].map(text).includes(target));
  return text(factionRow?.カナ) || target;
}

function raceHappinessConfig(race) {
  const className = classNameForRace(race);
  const classRow = CLASS_ROWS.find(row => text(row?.名前) === className)
    || CLASS_ROWS.find(row => text(row?.名前) === text(race))
    || null;
  const fallbackRow = TEMP_HAPPINESS_ROWS.find(row => text(row?.名前) === className)
    || TEMP_HAPPINESS_ROWS.find(row => text(row?.名前) === text(race))
    || null;
  const read = (field, fallback) => {
    const fromClass = optionalNumber(classRow?.[field]);
    if (fromClass !== null) return fromClass;
    const fromFallback = optionalNumber(fallbackRow?.[field]);
    return fromFallback !== null ? fromFallback : fallback;
  };
  const classFieldCount = RACE_HAPPINESS_FIELDS.filter(field => optionalNumber(classRow?.[field]) !== null).length;
  return {
    className,
    source:classFieldCount === 0 ? "仮" : classFieldCount === RACE_HAPPINESS_FIELDS.length ? "クラス" : "クラス+仮",
    base:read("幸福度基礎値", V39_CIVIC_BALANCE.targetBase),
    food:read("幸福度食料倍率", 1),
    housing:read("幸福度住居倍率", 1),
    facility:read("幸福度施設倍率", 1),
    starvation:read("幸福度飢餓倍率", 1),
    overcrowding:read("幸福度人口過多倍率", 1),
    disaster:read("幸福度災害倍率", 1),
    occupation:read("幸福度占領倍率", 1),
    mixedRace:read("幸福度異種族倍率", 1),
    event:read("幸福度イベント倍率", 1)
  };
}

function weightedByPopulation(values = {}, populationByRace = {}, fallback = 0) {
  let totalPopulation = 0;
  let totalValue = 0;
  for (const [race, populationValue] of Object.entries(populationByRace || {})) {
    const population = Math.max(0, number(populationValue));
    if (population <= 0 || !Number.isFinite(Number(values?.[race]))) continue;
    totalPopulation += population;
    totalValue += Number(values[race]) * population;
  }
  return totalPopulation > 0 ? clamp(totalValue / totalPopulation) : clamp(fallback);
}

export function normalizeV39CivicState(village = {}) {
  const source = village?.civicState || {};
  const happiness = clamp(source.happiness ?? village.happiness ?? V39_CIVIC_BALANCE.initialHappiness);
  const dissatisfaction = clamp(source.dissatisfaction ?? village.dissatisfaction ?? V39_CIVIC_BALANCE.initialDissatisfaction);
  const security = clamp(source.security ?? village.security ?? V39_CIVIC_BALANCE.initialSecurity);
  return {
    ...source,
    happiness,
    dissatisfaction,
    security,
    happinessByRace:{ ...(source.happinessByRace || village.happinessByRace || {}) },
    happinessTargetByRace:{ ...(source.happinessTargetByRace || {}) },
    happinessModifiersByRace:Object.fromEntries(Object.entries(source.happinessModifiersByRace || {}).map(([race, modifiers]) => [race, { ...(modifiers || {}) }])),
    modifiers:{ ...(source.modifiers || {}) },
    lastProcessedTurn:Math.max(0, Math.floor(number(source.lastProcessedTurn)))
  };
}

export function resolveV39CivicTurn(village = {}, turnNumber = 1) {
  const current = normalizeV39CivicState(village);
  if (current.lastProcessedTurn >= turnNumber) return current;

  const populationByRace = Object.fromEntries(Object.entries(village?.populationByRace || {})
    .filter(([, population]) => number(population) > 0));
  const stages = Object.values(village?.populationGrowthByRace || {}).map(row => Math.max(0, Math.floor(number(row?.starvationStage))));
  const starvationStage = stages.length ? Math.max(...stages) : 0;
  const overcrowding = Math.max(0, -number(village?.overcrowdingHappinessPenalty));
  const disaster = Math.max(0, number(village?.disasterCivicPenalty) * V39_CIVIC_BALANCE.disasterPenaltyScale);
  const occupation = Math.max(0, number(village?.occupationPenalty, village?.occupied === true ? V39_CIVIC_BALANCE.occupationPenaltyDefault : 0));
  const populatedRaceCount = Object.keys(populationByRace).length;
  const mixedRace = Math.max(0, populatedRaceCount-1) * V39_CIVIC_BALANCE.mixedRacePenaltyPerAdditionalRace;
  const guardSecurity = Math.min(V39_CIVIC_BALANCE.guardSecurityBonusCap, Math.max(0, number(village?.guardSecurityBonus)));
  const base = V39_CIVIC_BALANCE.targetBase;
  const foodTurns = foodReserveTurns(village);
  const foodComfort = foodReserveBonus(village);
  const housingComfort = housingComfortBonus(village);
  const facilityHappiness = facilityValue(village, "幸福度") * V39_CIVIC_BALANCE.facilityHappinessScale;
  const facilityDissatisfaction = facilityValue(village, "不満度低下") * V39_CIVIC_BALANCE.facilityDissatisfactionScale;
  const facilitySecurity = facilityValue(village, "治安") * V39_CIVIC_BALANCE.facilitySecurityScale;
  const eventHappiness = civicEventValue(village, "幸福度") * V39_CIVIC_BALANCE.eventHappinessScale;
  const eventDissatisfaction = civicEventValue(village, "不満度") * V39_CIVIC_BALANCE.eventDissatisfactionScale;
  const eventSecurity = civicEventValue(village, "治安") * V39_CIVIC_BALANCE.eventSecurityScale;

  const happinessTargetByRace = {};
  const happinessByRace = {};
  const happinessModifiersByRace = {};
  for (const race of Object.keys(populationByRace)) {
    const config = raceHappinessConfig(race);
    const raceStarvationStage = Math.max(0, Math.floor(number(village?.populationGrowthByRace?.[race]?.starvationStage)));
    const raceFoodTurns = foodReserveTurns(village, race);
    const raceFoodComfort = foodReserveBonus(village, race) * config.food;
    const raceHousingComfort = housingComfort * config.housing;
    const raceFacilityHappiness = facilityHappiness * config.facility;
    const raceStarvation = raceStarvationStage * V39_CIVIC_BALANCE.starvationHappinessPerStage * config.starvation;
    const raceOvercrowding = overcrowding * config.overcrowding;
    const raceDisaster = disaster * config.disaster;
    const raceOccupation = occupation * config.occupation;
    const raceMixedRace = mixedRace * config.mixedRace;
    const raceEvent = eventHappiness * config.event;
    const target = clamp(
      config.base
      + raceFoodComfort
      + raceHousingComfort
      + raceFacilityHappiness
      + raceEvent
      - raceStarvation
      - raceOvercrowding
      - raceDisaster
      - raceOccupation
      - raceMixedRace
    );
    const previous = clamp(current.happinessByRace?.[race] ?? current.happiness ?? config.base);
    happinessTargetByRace[race] = target;
    happinessByRace[race] = approach(previous, target);
    happinessModifiersByRace[race] = {
      source:config.source,
      className:config.className,
      base:config.base,
      foodReserveTurns:raceFoodTurns,
      food:raceFoodComfort,
      housing:raceHousingComfort,
      facility:raceFacilityHappiness,
      starvation:-raceStarvation,
      overcrowding:-raceOvercrowding,
      disaster:-raceDisaster,
      occupation:-raceOccupation,
      mixedRace:-raceMixedRace,
      event:raceEvent,
      target
    };
  }

  const happinessTarget = weightedByPopulation(happinessTargetByRace, populationByRace, base);
  const happiness = weightedByPopulation(
    happinessByRace,
    populationByRace,
    approach(current.happiness, happinessTarget)
  );
  const dissatisfactionTarget = clamp(
    base
    - foodComfort * (V39_CIVIC_BALANCE.foodReserveDissatisfactionMaxReduction / Math.max(1, V39_CIVIC_BALANCE.foodReserveHappinessMaxBonus))
    - housingComfort * V39_CIVIC_BALANCE.housingComfortDissatisfactionScale
    + starvationStage * V39_CIVIC_BALANCE.starvationDissatisfactionPerStage
    + overcrowding
    + disaster
    + occupation
    + mixedRace
    - facilityDissatisfaction
    + eventDissatisfaction
  );
  const securityTarget = clamp(
    base
    + facilitySecurity
    + guardSecurity
    + (happinessTarget - base) / V39_CIVIC_BALANCE.securityFromHappinessDivisor
    - starvationStage * V39_CIVIC_BALANCE.starvationSecurityPerStage
    + number(village?.overcrowdingSecurityPenalty)
    - disaster
    - occupation
    - mixedRace
    + eventSecurity
  );
  const dissatisfaction = approach(current.dissatisfaction, dissatisfactionTarget);
  const security = approach(current.security, securityTarget);

  return {
    ...current,
    happiness,
    dissatisfaction,
    security,
    happinessByRace,
    happinessTargetByRace,
    happinessModifiersByRace,
    modifiers:{
      starvationStage,
      starvationHappiness:-starvationStage * V39_CIVIC_BALANCE.starvationHappinessPerStage,
      foodReserveTurns:foodTurns,
      foodComfort,
      housingComfort,
      facilityHappiness,
      facilityDissatisfaction:-facilityDissatisfaction,
      facilitySecurity,
      overcrowding:-overcrowding,
      disaster:-disaster,
      occupation:-occupation,
      mixedRace:-mixedRace,
      eventHappiness,
      eventDissatisfaction,
      eventSecurity,
      guardSecurity,
      happinessTarget,
      dissatisfactionTarget,
      securityTarget
    },
    lastProcessedTurn:turnNumber
  };
}

export function resolveV39CivicProductionMultiplier(village = {}) {
  const dissatisfaction = normalizeV39CivicState(village).dissatisfaction;
  const start = V39_CIVIC_BALANCE.productionPenaltyStart;
  if (dissatisfaction <= start) return 1;
  const ratio = Math.min(1, (dissatisfaction - start) / (100 - start));
  return 1 - ratio * V39_CIVIC_BALANCE.productionPenaltyMax;
}
