import { resolveVillageScaleDefinition } from "../composables/villageCoreUtils.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import { getFactionSettlementById, replaceFactionSettlement, territorySettlementId } from "./settlement-state.js";

// 暫定の領土拡張費。領土拡張の正式コスト決定後はこの定数だけを差し替える。
export const V39_TERRITORY_EXPANSION_COST = Object.freeze({ 木材:50, 石材:50, 鉄:20 });
export const V39_TERRITORY_FULL_REPAIR_COST = Object.freeze(
  Object.fromEntries(Object.entries(V39_TERRITORY_EXPANSION_COST).map(([key, value]) => [key, value * 0.5]))
);

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round1 = value => Math.round(number(value) * 10) / 10;

function activeLavaKeys(state) {
  const keys = new Set();
  for (const flow of state?.worldEnvironment?.lavaState?.flows || []) {
    if (flow?.cooled === true) continue;
    const key = text(flow?.key || flow?.tileKey || (Number.isFinite(Number(flow?.x)) ? `${Math.floor(number(flow.x))},${Math.floor(number(flow.y))}` : ""));
    if (key) keys.add(key);
  }
  return keys;
}

function blacksmithLevel(player, settlement) {
  return Math.max(
    0,
    Math.floor(number(settlement?.cityLevels?.鍛冶Lv)),
    resolveCompletedResearchLevel(player?.factionState?.research, "鍛冶")
  );
}

export function inspectV39TerritoryRepair(state, playerId, settlementId) {
  const player = (state?.players || []).find(row => text(row?.id) === text(playerId));
  const settlement = getFactionSettlementById(player?.factionState, settlementId);
  if (!player || !settlement) return { available:false, reason:"拠点が見つかりません", targets:[] };
  const level = blacksmithLevel(player, settlement);
  const scaleLevel = Math.max(1, Math.floor(number(resolveVillageScaleDefinition(settlement)?.level, 1)));
  const maxTiles = Math.max(1, level + scaleLevel);
  const healRate = Math.min(1, 0.2 + level * 0.04);
  const occupied = new Set((state?.enemies || [])
    .filter(enemy => number(enemy?.hp ?? enemy?.currentHp) > 0 && text(enemy?.state) !== "死亡")
    .map(enemy => `${Math.floor(number(enemy.x))},${Math.floor(number(enemy.y))}`));
  const lava = activeLavaKeys(state);
  const targets = Object.entries(state?.territoryOwnerByTile || {})
    .filter(([key, ownerId]) => text(ownerId) === text(player.id)
      && text(territorySettlementId(state?.territoryStateByTile?.[key])) === text(settlementId))
    .map(([key]) => ({ key, ...(state?.territoryStateByTile?.[key] || {}) }))
    .filter(row => number(row.maxHp, 100) > 0 && number(row.hp, row.maxHp) < number(row.maxHp, 100))
    .map(row => ({ ...row, blockedReason:occupied.has(row.key) ? "敵が存在" : lava.has(row.key) ? "溶岩" : "" }))
    .sort((left, right) => number(left.hp)/Math.max(1, number(left.maxHp, 100)) - number(right.hp)/Math.max(1, number(right.maxHp, 100)) || left.key.localeCompare(right.key));
  return { available:targets.some(row => !row.blockedReason), player, settlement, level, scaleLevel, maxTiles, healRate, targets };
}

export function applyV39TerritoryRepair(state, playerId, settlementId, turnNumber) {
  const inspection = inspectV39TerritoryRepair(state, playerId, settlementId);
  if (!inspection.player || !inspection.settlement) return { state, reports:[], ...inspection };
  const material = { ...(inspection.settlement.materialStockByType || {}) };
  const territoryStateByTile = { ...(state.territoryStateByTile || {}) };
  const reports = [];
  for (const target of inspection.targets.filter(row => !row.blockedReason).slice(0, inspection.maxTiles)) {
    if (number(target.lastRepairTurn) >= number(turnNumber)) continue;
    const maxHp = Math.max(1, number(target.maxHp, 100));
    const wantedHeal = Math.min(maxHp-number(target.hp), Math.max(1, Math.floor(maxHp*inspection.healRate)));
    let affordableRate = 1;
    for (const [resource, fullCost] of Object.entries(V39_TERRITORY_FULL_REPAIR_COST)) {
      const wantedCost = fullCost * wantedHeal / maxHp;
      if (wantedCost > 0) affordableRate = Math.min(affordableRate, number(material[resource]) / wantedCost);
    }
    const heal = Math.max(0, Math.floor(wantedHeal * Math.min(1, affordableRate)));
    if (heal <= 0) break;
    const cost = {};
    for (const [resource, fullCost] of Object.entries(V39_TERRITORY_FULL_REPAIR_COST)) {
      cost[resource] = round1(fullCost * heal / maxHp);
      material[resource] = round1(Math.max(0, number(material[resource])-cost[resource]));
    }
    const hp = Math.min(maxHp, number(target.hp)+heal);
    territoryStateByTile[target.key] = {
      ...target,
      hp,
      lastRepairTurn:Math.max(1, Math.floor(number(turnNumber, 1))),
      ...(hp > 0 ? { raided:false, raidedAtTurn:null, raidedByNestId:"" } : {})
    };
    reports.push({ key:target.key, beforeHp:number(target.hp), hp, heal, cost });
  }
  if (!reports.length) return { state, reports, ...inspection };
  const settlement = { ...inspection.settlement, materialStockByType:material };
  const factionState = replaceFactionSettlement(inspection.player.factionState, settlement, { ownerPlayerId:inspection.player.id });
  const players = state.players.map(row => text(row?.id) === text(inspection.player.id) ? { ...row, factionState } : row);
  return { state:{ ...state, players, territoryStateByTile }, reports, ...inspection, settlement };
}
