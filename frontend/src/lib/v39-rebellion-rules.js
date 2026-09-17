import { applyV39DerivedCharacterData } from "../v39-character-derived-rules.js";
import { getGameDataRows } from "./game-data-registry.js";
import { V39_CIVIC_BALANCE } from "./v39-gameplay-balance.js";
import { rescaleV39PopulationGrowthForPopulationChange } from "./v39-population-economy.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

function rebellionRace(populationByRace = {}) {
  return Object.entries(populationByRace)
    .map(([race, population]) => ({ race:text(race), population:Math.max(0, integer(population)) }))
    .filter(row => row.race && row.population > 0)
    .sort((left, right) => right.population-left.population || left.race.localeCompare(right.race, "ja"))[0] || null;
}

function raceClassName(race) {
  return text(getGameDataRows("種族").find(row => text(row?.key) === text(race) || text(row?.name) === text(race))?.className, race);
}

function rebellionTemplate(player, settlement, race) {
  const settlementId = text(settlement?.settlementId || settlement?.id);
  const units = (player?.factionState?.units || []).filter(unit => number(unit?.hp ?? unit?.currentHp) > 0);
  return units.find(unit => text(unit?.settlementId) === settlementId && text(unit?.race) === race)
    || units.find(unit => text(unit?.race) === race)
    || units.find(unit => text(unit?.settlementId) === settlementId)
    || units[0]
    || null;
}

function createRebel(player, settlement, race, population, turnNumber, sequence) {
  const settlementId = text(settlement?.settlementId || settlement?.id);
  const id = `rebel-${text(player?.id)}-${settlementId}-${turnNumber}-${sequence}`;
  const template = rebellionTemplate(player, settlement, race);
  const source = template
    ? { ...template, equipment:(template.equipment || []).map(item => ({ ...item })) }
    : { race, className:raceClassName(race), level:1, equipment:[] };
  const derived = applyV39DerivedCharacterData({
    ...source,
    id,
    name:`${text(settlement?.name, "拠点")}反乱軍`,
    race,
    role:"反乱軍",
    x:integer(settlement?.x),
    y:integer(settlement?.y),
    position:[integer(settlement?.x), integer(settlement?.y)],
    settlementId:"",
    squadId:"",
    enemySquadId:`rebel-squad-${id}`,
    nestId:"",
    spawnType:"反乱",
    aggressive:true,
    isRebel:true,
    neverFlee:true,
    territoryAssaultOnly:true,
    rebelPlayerId:text(player?.id),
    rebelSettlementId:settlementId,
    rebelPopulation:population,
    rebelFactionId:`rebel:${text(player?.id)}:${settlementId}`,
    rebelFactionLabel:`${text(settlement?.name, "拠点")}反乱軍`,
    createdAtTurn:turnNumber,
    fleeState:null,
    fleeDecisionMade:true
  });
  const maxHp = Math.max(1, number(derived?.maxHp, derived?.status?.HP || source?.maxHp || 1));
  return {
    ...derived,
    hp:maxHp,
    currentHp:maxHp,
    maxHp,
    ap:100,
    currentAp:100,
    maxAp:100,
    state:"生存"
  };
}

function shouldStartRebellion(settlement, turnNumber) {
  const civic = settlement?.civicState || {};
  const lastTurn = Math.max(0, integer(civic?.lastRebellionTurn));
  return number(civic?.dissatisfaction) >= V39_CIVIC_BALANCE.rebellionDissatisfactionThreshold
    && number(civic?.security, 100) <= V39_CIVIC_BALANCE.rebellionSecurityThreshold
    && turnNumber-lastTurn >= V39_CIVIC_BALANCE.rebellionCooldownTurns;
}

function shouldStartCivicOutflow(settlement) {
  const civic = settlement?.civicState || {};
  return number(civic?.dissatisfaction) >= V39_CIVIC_BALANCE.civicOutflowDissatisfactionThreshold
    && number(civic?.security, 100) <= V39_CIVIC_BALANCE.civicOutflowSecurityThreshold;
}

function reducePopulationByRatio(populationByRace = {}, requestedLoss = 0) {
  const rows = Object.entries(populationByRace)
    .map(([race, population]) => ({ race:text(race), population:Math.max(0, integer(population)) }))
    .filter(row => row.race && row.population > 0)
    .sort((left, right) => right.population-left.population || left.race.localeCompare(right.race, "ja"));
  const total = rows.reduce((sum, row) => sum+row.population, 0);
  const loss = Math.min(total, Math.max(0, integer(requestedLoss)));
  const result = { ...populationByRace };
  let remaining = loss;
  for (const row of rows) {
    const amount = Math.min(row.population, Math.floor(loss * row.population / Math.max(1, total)));
    result[row.race] = row.population-amount;
    remaining -= amount;
  }
  while (remaining > 0) {
    const target = rows.find(row => number(result[row.race]) > 0);
    if (!target) break;
    result[target.race] -= 1;
    remaining -= 1;
  }
  return { populationByRace:result, loss:loss-remaining };
}

export function advanceV39Rebellions(state, turnNumber = 1) {
  if (!state) return { state, reports:[] };
  const turn = Math.max(1, integer(turnNumber, 1));
  const enemies = [...(state.enemies || [])];
  const enemySquads = [...(state.enemySquads || [])];
  const reports = [];
  const outflows = [];
  let sequence = 0;
  const players = (state.players || []).map(player => {
    const settlements = (player?.factionState?.settlements || []).map(settlement => {
      if (!settlement?.placed) return settlement;
      const rebellionStarts = shouldStartRebellion(settlement, turn);
      if (!rebellionStarts && shouldStartCivicOutflow(settlement)) {
        const totalPopulation = Object.values(settlement?.populationByRace || {}).reduce((sum, value) => sum+Math.max(0, integer(value)), 0);
        const requestedLoss = Math.max(V39_CIVIC_BALANCE.civicOutflowMinimum, Math.floor(totalPopulation * V39_CIVIC_BALANCE.civicOutflowPopulationRate));
        const reduced = reducePopulationByRatio(settlement.populationByRace, requestedLoss);
        if (reduced.loss <= 0) return settlement;
        const population = Math.max(0, totalPopulation-reduced.loss);
        const populationGrowthByRace = rescaleV39PopulationGrowthForPopulationChange(reduced.populationByRace, settlement.populationGrowthByRace);
        const report = { playerId:text(player?.id), settlementId:text(settlement?.settlementId || settlement?.id), settlementName:text(settlement?.name, "拠点"), population:reduced.loss, turnNumber:turn };
        outflows.push(report);
        return {
          ...settlement,
          population,
          populationByRace:reduced.populationByRace,
          populationGrowthByRace,
          civicState:{ ...(settlement.civicState || {}), lastCivicOutflowTurn:turn, lastCivicOutflowPopulation:reduced.loss }
        };
      }
      if (!rebellionStarts) return settlement;
      const selectedRace = rebellionRace(settlement?.populationByRace);
      if (!selectedRace) return settlement;
      const rebelPopulation = Math.min(
        selectedRace.population,
        Math.max(1, Math.floor(selectedRace.population * V39_CIVIC_BALANCE.rebellionPopulationRate))
      );
      sequence += 1;
      const rebel = createRebel(player, settlement, selectedRace.race, rebelPopulation, turn, sequence);
      enemies.push(rebel);
      enemySquads.push({
        id:rebel.enemySquadId,
        name:rebel.rebelFactionLabel,
        nestId:"",
        unitIds:[rebel.id],
        cargo:{ resourcesByType:{}, equipmentInventory:[] }
      });
      const populationByRace = {
        ...(settlement.populationByRace || {}),
        [selectedRace.race]:Math.max(0, selectedRace.population-rebelPopulation)
      };
      const population = Object.values(populationByRace).reduce((sum, value) => sum + Math.max(0, integer(value)), 0);
      const populationGrowthByRace = rescaleV39PopulationGrowthForPopulationChange(populationByRace, settlement.populationGrowthByRace);
      reports.push({
        playerId:text(player?.id),
        settlementId:text(settlement?.settlementId || settlement?.id),
        settlementName:text(settlement?.name, "拠点"),
        enemyId:rebel.id,
        race:selectedRace.race,
        population:rebelPopulation,
        turnNumber:turn
      });
      return {
        ...settlement,
        population,
        populationByRace,
        populationGrowthByRace,
        civicState:{
          ...(settlement.civicState || {}),
          lastRebellionTurn:turn,
          lastRebellionPopulation:rebelPopulation,
          lastRebellionEnemyId:rebel.id
        }
      };
    });
    return { ...player, factionState:{ ...player.factionState, settlements } };
  });
  const changedById = new Map(players.flatMap(player => (player?.factionState?.settlements || []).map(settlement => [text(settlement?.settlementId || settlement?.id), settlement])));
  const settlements = (state.settlements || []).map(settlement => changedById.get(text(settlement?.settlementId || settlement?.id)) || settlement);
  return { state:{ ...state, players, settlements, enemies, enemySquads }, reports, outflows };
}
