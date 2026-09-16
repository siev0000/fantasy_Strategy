import { advanceTerrainTurn } from "./lib/map-generator.js";
import {
  TERRITORY_TILE_MAX_HP,
  TERRITORY_TILE_MODE_CONFIG,
  TERRITORY_TILE_MODE_RESOURCE,
  TERRITORY_TILE_MODE_SETTLEMENT
} from "./lib/phaser-map-panel-config.js";
import { runWithSeededRandom } from "./lib/seeded-random.js";
import {
  getFactionSettlements,
  normalizeTerritoryStateRecord,
  replaceFactionSettlement,
  territorySettlementId
} from "./lib/settlement-state.js";
import { normalizeV39Village } from "./lib/v39-economy-rules.js";
import { resolveV39TerrainTurnDamageRule, resolveV39UnitCapabilityValue } from "./lib/v39-terrain-traversal.js";

const asCount = value => Math.max(0, Math.floor(Number(value) || 0));
const LAVA_DAMAGE_RULE = resolveV39TerrainTurnDamageRule("溶岩");
const text = value => String(value ?? "").trim();
const tileKey = (x, y) => `${Math.floor(Number(x))},${Math.floor(Number(y))}`;

function unitOnLava(unit, lavaMap) {
  const x = Math.floor(Number(unit?.x));
  const y = Math.floor(Number(unit?.y));
  return Number.isFinite(x) && Number.isFinite(y) && lavaMap?.[y]?.[x] === true;
}

function applyLavaDamageToUnit(unit, lavaMap, turnNumber, entries) {
  const hp = Math.max(0, Number(unit?.hp ?? unit?.currentHp) || 0);
  if (hp <= 0 || !unitOnLava(unit, lavaMap)) return unit;
  const maxHp = Math.max(1, Number(unit?.maxHp ?? unit?.status?.HP) || hp);
  const resistance = Math.max(0, Math.min(100, resolveV39UnitCapabilityValue(unit, LAVA_DAMAGE_RULE.resistanceName)));
  const damage = Math.max(0, Math.ceil(maxHp * LAVA_DAMAGE_RULE.maxHpRate * (1 - resistance / 100)));
  if (!damage) return unit;
  const nextHp = Math.max(0, hp - damage);
  entries.push({ unitId:String(unit?.id || ""), targetId:String(unit?.id || ""), name:String(unit?.name || unit?.名前 || "ユニット"), x:Number(unit?.x), y:Number(unit?.y), hits:[damage], damage, beforeHp:hp, afterHp:nextHp });
  return {
    ...unit,
    hp:nextHp,
    currentHp:nextHp,
    ...(nextHp <= 0 ? { deathCause:"溶岩", deathTurn:turnNumber } : {})
  };
}

function applyLavaTurnDamage(state, mapData, turnNumber) {
  const entries = [];
  const players = (state.players || []).map(player => ({
    ...player,
    factionState:{
      ...player.factionState,
      units:(player?.factionState?.units || []).map(unit => applyLavaDamageToUnit(unit, mapData?.lavaMap, turnNumber, entries))
    }
  }));
  const enemies = (state.enemies || []).map(unit => applyLavaDamageToUnit(unit, mapData?.lavaMap, turnNumber, entries));
  return { players, enemies, entries };
}

function territoryDamageTargets(events, mapData) {
  const targets = new Map();
  for (const event of events || []) {
    if (!["eruption", "lava"].includes(event?.type)) continue;
    const sourceKey = text(event?.sourceKey || event?.key);
    const [sourceX, sourceY] = sourceKey.split(",").map(Number);
    const level = Math.max(1, Math.floor(Number(event?.sourceHeightLevel)
      || Number(mapData?.heightLevelMap?.[sourceY]?.[sourceX])
      || 1));
    const damage = 25 + level * 25;
    const coords = event.type === "eruption"
      ? [{ x:event.x, y:event.y, key:event.key }, ...(Array.isArray(event.affectedCoords) ? event.affectedCoords : [])]
      : event.path;
    for (const coord of Array.isArray(coords) ? coords : []) {
      const key = text(coord?.key) || tileKey(coord?.x, coord?.y);
      if (!key.includes(",")) continue;
      const previous = targets.get(key);
      if (!previous || damage > previous.damage) targets.set(key, { key, x:Number(coord?.x), y:Number(coord?.y), damage, sourceKey, sourceHeightLevel:level, eventType:event.type });
    }
  }
  return [...targets.values()];
}

function tilePopulationCapacity(settlement, key) {
  const homeKey = settlement?.placed ? tileKey(settlement.x, settlement.y) : "";
  const mode = text(settlement?.territoryTileModeMap?.[key]) || (key === homeKey ? TERRITORY_TILE_MODE_SETTLEMENT : TERRITORY_TILE_MODE_RESOURCE);
  return Math.max(0, Number(TERRITORY_TILE_MODE_CONFIG[mode]?.populationCapacityBonus) || 0);
}

function reducePopulationByRace(populationByRace, requestedLoss) {
  const rows = Object.entries(populationByRace || {})
    .map(([race, value]) => ({ race, population:Math.max(0, Math.floor(Number(value) || 0)) }))
    .filter(row => row.population > 0)
    .sort((left, right) => right.population - left.population || left.race.localeCompare(right.race, "ja"));
  const total = rows.reduce((sum, row) => sum + row.population, 0);
  let remaining = Math.min(total, Math.max(0, Math.ceil(Number(requestedLoss) || 0)));
  const next = Object.fromEntries(rows.map(row => [row.race, row.population]));
  for (const row of rows) {
    const decrease = Math.min(row.population, remaining, Math.floor(requestedLoss * row.population / Math.max(1, total)));
    next[row.race] -= decrease;
    remaining -= decrease;
  }
  while (remaining > 0) {
    let changed = false;
    for (const row of rows) {
      if (remaining <= 0) break;
      if (next[row.race] <= 0) continue;
      next[row.race] -= 1;
      remaining -= 1;
      changed = true;
    }
    if (!changed) break;
  }
  return next;
}

export function applyTerritoryHazardDamage(state, mapData, events, turnNumber) {
  const territoryStateByTile = { ...(state?.territoryStateByTile || {}) };
  const populationLossBySettlement = new Map();
  const entries = [];
  for (const target of territoryDamageTargets(events, mapData)) {
    const ownerPlayerId = text(state?.territoryOwnerByTile?.[target.key]);
    if (!ownerPlayerId) continue;
    const territory = normalizeTerritoryStateRecord(territoryStateByTile[target.key]);
    const maxHp = Math.max(1, Number(territory.maxHp) || TERRITORY_TILE_MAX_HP);
    const beforeHp = Math.max(0, Math.min(maxHp, Number(territory.hp) || 0));
    const afterHp = Math.max(0, beforeHp - target.damage);
    const settlementId = territorySettlementId(territory);
    const player = (state.players || []).find(row => text(row?.id) === ownerPlayerId);
    const settlement = getFactionSettlements(player?.factionState).find(row => text(row?.settlementId) === settlementId);
    const beforeCapacity = tilePopulationCapacity(settlement, target.key) * (beforeHp / maxHp);
    const populationLoss = beforeCapacity * Math.min(1, target.damage / maxHp);
    territoryStateByTile[target.key] = {
      ...territory,
      hp:afterHp,
      maxHp,
      lastDamageTurn:turnNumber,
      lastDamageCause:target.eventType === "eruption" ? "火山噴火" : "溶岩",
      lastDamage:Math.min(beforeHp, target.damage)
    };
    if (settlementId && populationLoss > 0) populationLossBySettlement.set(settlementId, (populationLossBySettlement.get(settlementId) || 0) + populationLoss);
    entries.push({ ...target, ownerPlayerId, settlementId, beforeHp, afterHp, maxHp, populationLoss });
  }
  const populationEntries = [];
  const players = (state.players || []).map(player => {
    let factionState = player.factionState;
    for (const settlement of getFactionSettlements(factionState)) {
      const settlementId = text(settlement?.settlementId || settlement?.id);
      const requestedLoss = populationLossBySettlement.get(settlementId) || 0;
      if (requestedLoss <= 0) continue;
      const beforePopulation = Math.max(0, Math.floor(Number(settlement?.population) || 0));
      const populationByRace = reducePopulationByRace(settlement.populationByRace, requestedLoss);
      const afterPopulation = Object.values(populationByRace).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
      const nextSettlement = normalizeV39Village({ ...settlement, populationByRace, population:afterPopulation }, player.race);
      factionState = replaceFactionSettlement(factionState, nextSettlement, { ownerPlayerId:player.id, select:false });
      populationEntries.push({ playerId:player.id, settlementId, beforePopulation, afterPopulation, damage:beforePopulation - afterPopulation });
    }
    return { ...player, factionState };
  });
  return { players, territoryStateByTile, entries, populationEntries };
}

function environmentFromMap(mapData, processedTurn, events = []) {
  return {
    processedTurn:asCount(processedTurn),
    volcanoData:mapData?.volcanoData || null,
    lavaState:mapData?.lavaState || { flows:[] },
    lavaFlowData:mapData?.lavaFlowData || { nodeKeys:[], edgeKeys:[], sourceKeys:[] },
    lastTerrainEvents:Array.isArray(events) ? events : []
  };
}

function eventSummary(events, damageEntries, turnNumber, territoryEntries = [], populationEntries = []) {
  const eruptions = events.filter(event => event?.type === "eruption").length;
  const lava = events.filter(event => event?.type === "lava").length;
  const cooled = events.filter(event => event?.type === "lava-cooled").length;
  const damageTotal = damageEntries.reduce((sum, entry) => sum + asCount(entry?.damage), 0);
  if (!eruptions && !lava && !cooled && !damageTotal && !territoryEntries.length) return "";
  const victims = damageEntries
    .slice(0, 2)
    .map(entry => `${String(entry?.name || entry?.targetId || "対象")} ${asCount(entry?.damage)}`)
    .join("、");
  const remainder = Math.max(0, damageEntries.length - 2);
  const damageText = damageTotal ? ` / 溶岩被害 ${victims}${remainder ? `ほか${remainder}体` : ""}` : "";
  const territoryText = territoryEntries.length ? ` / 領土被害${territoryEntries.length}マス` : "";
  const populationLoss = populationEntries.reduce((sum, entry) => sum + asCount(entry?.damage), 0);
  return `ターン${turnNumber} 噴火${eruptions} / 溶岩${lava} / 冷却${cooled}${territoryText}${populationLoss ? ` / 人口-${populationLoss}` : ""}${damageText}`;
}

export function runV39TerrainTurn(options = {}) {
  const state = window.getV39GameState?.();
  const runtime = window.__v39FieldRuntime;
  const mapData = runtime?.mapData;
  if (!state || !mapData) return { ok:false, reason:"field-not-generated", events:[] };
  const targetTurn = Math.max(1, asCount(options.targetTurn ?? state.timeline?.turnNumber));
  const alreadyProcessed = asCount(state.worldEnvironment?.processedTurn);
  if (options.force !== true && alreadyProcessed >= targetTurn) return { ok:false, reason:"already-processed", events:[] };

  const source = {
    ...mapData,
    turnState:{ ...(mapData.turnState || {}), turnNumber:targetTurn - 1 }
  };
  const result = advanceTerrainTurn(source, {
    eventMode:String(options.eventMode || "normal"),
    forceTestEvent:options.forceTestEvent === true,
    forceEruptionAt:options.forceEruptionAt
  });
  window.updateV39FieldData?.(result.data, { reason:"terrain-turn" });
  const environment = environmentFromMap(result.data, options.markProcessed === false ? alreadyProcessed : targetTurn, result.events);
  const territoryDamage = applyTerritoryHazardDamage(state, result.data, result.events, targetTurn);
  const damage = applyLavaTurnDamage({ ...state, players:territoryDamage.players }, result.data, targetTurn);
  window.setV39GameState?.({
    worldEnvironment:environment,
    territoryStateByTile:territoryDamage.territoryStateByTile,
    players:damage.players,
    enemies:damage.enemies
  }, { reason:"terrain-turn" });
  const summary = eventSummary(result.events, damage.entries, targetTurn, territoryDamage.entries, territoryDamage.populationEntries);
  if (summary) window.showV39TurnBanner?.(summary);
  window.dispatchEvent(new CustomEvent("v39:terrain-turn-resolved", {
    detail:{ turnNumber:targetTurn, events:result.events, damageEntries:damage.entries, territoryDamageEntries:territoryDamage.entries, populationDamageEntries:territoryDamage.populationEntries, mapData:result.data }
  }));
  if (damage.entries.length) window.dispatchEvent(new CustomEvent("v39:terrain-damage", { detail:{ turnNumber:targetTurn, entries:damage.entries } }));
  if (territoryDamage.entries.length) window.dispatchEvent(new CustomEvent("v39:territory-hazard-damage", {
    detail:{ turnNumber:targetTurn, entries:territoryDamage.entries, populationEntries:territoryDamage.populationEntries }
  }));
  return { ok:true, turnNumber:targetTurn, events:result.events, damageEntries:damage.entries, territoryDamageEntries:territoryDamage.entries, populationDamageEntries:territoryDamage.populationEntries, data:result.data };
}

export function runV39TerrainTurnWithSeed(seed, options = {}) {
  return runWithSeededRandom(seed, () => runV39TerrainTurn(options));
}

function initializeEnvironment(event) {
  const state = window.getV39GameState?.();
  const mapData = event?.detail?.mapData || window.__v39FieldRuntime?.mapData;
  if (!state || !mapData) return;
  const processedTurn = Math.max(1, asCount(state.timeline?.turnNumber));
  window.setV39GameState?.({ worldEnvironment:environmentFromMap(mapData, processedTurn) }, { reason:"terrain-initialized" });
}

window.addEventListener("v39:field-generated", initializeEnvironment);
window.addEventListener("v39:turn-stage-terrain", event => runV39TerrainTurn({ targetTurn:event.detail?.turnNumber }));

window.runV39TerrainTurn = runV39TerrainTurn;
window.runV39TerrainTurnWithSeed = runV39TerrainTurnWithSeed;
window.forceV39TerrainEvent = eventMode => runV39TerrainTurn({ eventMode, force:true, forceTestEvent:true, markProcessed:false });
window.getV39VolcanoRules = () => ({
  lavaDamageMaxHpRate:LAVA_DAMAGE_RULE.maxHpRate,
  lavaDamageResistance:LAVA_DAMAGE_RULE.resistanceName,
  lavaPassRequirement:"地形.jsonの移動条件"
});

if (window.__v39FieldRuntime?.mapData) initializeEnvironment();
