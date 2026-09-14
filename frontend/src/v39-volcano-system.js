import { advanceTerrainTurn } from "./lib/map-generator.js";
import { runWithSeededRandom } from "./lib/seeded-random.js";
import { resolveV39TerrainTurnDamageRule, resolveV39UnitCapabilityValue } from "./lib/v39-terrain-traversal.js";

const asCount = value => Math.max(0, Math.floor(Number(value) || 0));
const LAVA_DAMAGE_RULE = resolveV39TerrainTurnDamageRule("溶岩");

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

function environmentFromMap(mapData, processedTurn, events = []) {
  return {
    processedTurn:asCount(processedTurn),
    volcanoData:mapData?.volcanoData || null,
    lavaState:mapData?.lavaState || { flows:[] },
    lavaFlowData:mapData?.lavaFlowData || { nodeKeys:[], edgeKeys:[], sourceKeys:[] },
    lastTerrainEvents:Array.isArray(events) ? events : []
  };
}

function eventSummary(events, damageEntries, turnNumber) {
  const eruptions = events.filter(event => event?.type === "eruption").length;
  const lava = events.filter(event => event?.type === "lava").length;
  const damageTotal = damageEntries.reduce((sum, entry) => sum + asCount(entry?.damage), 0);
  if (!eruptions && !lava && !damageTotal) return "";
  const victims = damageEntries
    .slice(0, 2)
    .map(entry => `${String(entry?.name || entry?.targetId || "対象")} ${asCount(entry?.damage)}`)
    .join("、");
  const remainder = Math.max(0, damageEntries.length - 2);
  const damageText = damageTotal ? ` / 溶岩被害 ${victims}${remainder ? `ほか${remainder}体` : ""}` : "";
  return `ターン${turnNumber} 噴火${eruptions} / 溶岩${lava}${damageText}`;
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
    forceTestEvent:options.forceTestEvent === true
  });
  window.updateV39FieldData?.(result.data, { reason:"terrain-turn" });
  const environment = environmentFromMap(result.data, options.markProcessed === false ? alreadyProcessed : targetTurn, result.events);
  const damage = applyLavaTurnDamage(state, result.data, targetTurn);
  window.setV39GameState?.({ worldEnvironment:environment, players:damage.players, enemies:damage.enemies }, { reason:"terrain-turn" });
  const summary = eventSummary(result.events, damage.entries, targetTurn);
  if (summary) window.showV39TurnBanner?.(summary);
  window.dispatchEvent(new CustomEvent("v39:terrain-turn-resolved", {
    detail:{ turnNumber:targetTurn, events:result.events, damageEntries:damage.entries, mapData:result.data }
  }));
  if (damage.entries.length) window.dispatchEvent(new CustomEvent("v39:terrain-damage", { detail:{ turnNumber:targetTurn, entries:damage.entries } }));
  return { ok:true, turnNumber:targetTurn, events:result.events, damageEntries:damage.entries, data:result.data };
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
