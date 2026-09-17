import { V39_CIVIC_BALANCE } from "./v39-gameplay-balance.js";

const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = value => Math.max(0, Math.min(100, Math.round(number(value) * 10) / 10));
const approach = (current, target) => {
  const step = V39_CIVIC_BALANCE.changePerTurn;
  if (current < target) return clamp(Math.min(target, current + step));
  if (current > target) return clamp(Math.max(target, current - step));
  return clamp(current);
};

function facilityValue(village, key) {
  return number(village?.cityModifiers?.[key], number(village?.facilityModifiers?.[key]));
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
    modifiers:{ ...(source.modifiers || {}) },
    lastProcessedTurn:Math.max(0, Math.floor(number(source.lastProcessedTurn)))
  };
}

export function resolveV39CivicTurn(village = {}, turnNumber = 1) {
  const current = normalizeV39CivicState(village);
  if (current.lastProcessedTurn >= turnNumber) return current;
  const stages = Object.values(village?.populationGrowthByRace || {}).map(row => Math.max(0, Math.floor(number(row?.starvationStage))));
  const starvationStage = stages.length ? Math.max(...stages) : 0;
  const overcrowding = Math.max(0, -number(village?.overcrowdingHappinessPenalty));
  const disaster = Math.max(0, number(village?.disasterCivicPenalty) * V39_CIVIC_BALANCE.disasterPenaltyScale);
  const occupation = Math.max(0, number(village?.occupationPenalty, village?.occupied === true ? V39_CIVIC_BALANCE.occupationPenaltyDefault : 0));
  const populatedRaceCount = Object.values(village?.populationByRace || {}).filter(value => number(value) > 0).length;
  const mixedRace = Math.max(0, populatedRaceCount-1) * V39_CIVIC_BALANCE.mixedRacePenaltyPerAdditionalRace;
  const guardSecurity = Math.min(V39_CIVIC_BALANCE.guardSecurityBonusCap, Math.max(0, number(village?.guardSecurityBonus)));
  const base = V39_CIVIC_BALANCE.targetBase;
  const happinessTarget = clamp(base + facilityValue(village, "幸福度") - starvationStage * V39_CIVIC_BALANCE.starvationHappinessPerStage - overcrowding - disaster - occupation - mixedRace);
  const dissatisfactionTarget = clamp(base + starvationStage * V39_CIVIC_BALANCE.starvationDissatisfactionPerStage + overcrowding + disaster + occupation + mixedRace - facilityValue(village, "不満度低下"));
  const securityTarget = clamp(base + facilityValue(village, "治安") + guardSecurity + (happinessTarget - base) / V39_CIVIC_BALANCE.securityFromHappinessDivisor - starvationStage * V39_CIVIC_BALANCE.starvationSecurityPerStage + number(village?.overcrowdingSecurityPenalty) - disaster - occupation - mixedRace);
  const happiness = approach(current.happiness, happinessTarget);
  const dissatisfaction = approach(current.dissatisfaction, dissatisfactionTarget);
  const security = approach(current.security, securityTarget);
  const happinessByRace = Object.fromEntries(Object.keys(village?.populationByRace || {}).map(race => [race, happiness]));
  return {
    ...current,
    happiness,
    dissatisfaction,
    security,
    happinessByRace,
    modifiers:{ starvationStage, overcrowding:-overcrowding, disaster:-disaster, occupation:-occupation, mixedRace:-mixedRace, guardSecurity, happinessTarget, dissatisfactionTarget, securityTarget },
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
