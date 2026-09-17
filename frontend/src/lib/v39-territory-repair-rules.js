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
    .map(([key]) => {
      const row = { key, ...(state?.territoryStateByTile?.[key] || {}) };
      const damagedFacilities = Object.entries(settlement?.facilityStateByTile?.[key] || {})
        .filter(([, facility]) => number(facility?.hp, facility?.maxHp) < number(facility?.maxHp, 100))
        .map(([facilityName, facility]) => ({ facilityName, ...facility }));
      return { ...row, damagedFacilities };
    })
    .filter(row => (number(row.maxHp, 100) > 0 && number(row.hp, row.maxHp) < number(row.maxHp, 100)) || row.damagedFacilities.length)
    .map(row => ({ ...row, blockedReason:occupied.has(row.key) ? "敵が存在" : lava.has(row.key) ? "溶岩" : "" }))
    .sort((left, right) => number(left.hp)/Math.max(1, number(left.maxHp, 100)) - number(right.hp)/Math.max(1, number(right.maxHp, 100)) || left.key.localeCompare(right.key));
  return { available:targets.some(row => !row.blockedReason), player, settlement, level, scaleLevel, maxTiles, healRate, targets };
}

function repairHpWithMaterials(material, currentHp, maxHp, healRate) {
  const current = Math.max(0, number(currentHp));
  const maximum = Math.max(1, number(maxHp, 100));
  const wantedHeal = Math.min(maximum-current, Math.max(1, Math.floor(maximum*healRate)));
  if (wantedHeal <= 0) return { heal:0, hp:current, cost:{} };
  let affordableRate = 1;
  for (const [resource, fullCost] of Object.entries(V39_TERRITORY_FULL_REPAIR_COST)) {
    const wantedCost = fullCost * wantedHeal / maximum;
    if (wantedCost > 0) affordableRate = Math.min(affordableRate, number(material[resource]) / wantedCost);
  }
  const heal = Math.max(0, Math.floor(wantedHeal * Math.min(1, affordableRate)));
  if (heal <= 0) return { heal:0, hp:current, cost:{} };
  const cost = {};
  for (const [resource, fullCost] of Object.entries(V39_TERRITORY_FULL_REPAIR_COST)) {
    cost[resource] = round1(fullCost * heal / maximum);
    material[resource] = round1(Math.max(0, number(material[resource])-cost[resource]));
  }
  return { heal, hp:Math.min(maximum, current+heal), cost };
}

export function applyV39TerritoryRepair(state, playerId, settlementId, turnNumber) {
  const inspection = inspectV39TerritoryRepair(state, playerId, settlementId);
  if (!inspection.player || !inspection.settlement) return { state, reports:[], ...inspection };
  const material = { ...(inspection.settlement.materialStockByType || {}) };
  const territoryStateByTile = { ...(state.territoryStateByTile || {}) };
  const facilityStateByTile = { ...(inspection.settlement.facilityStateByTile || {}) };
  const reports = [];
  for (const target of inspection.targets.filter(row => !row.blockedReason).slice(0, inspection.maxTiles)) {
    if (number(target.lastRepairTurn) >= number(turnNumber)) continue;
    const maxHp = Math.max(1, number(target.maxHp, 100));
    const territoryRepair = repairHpWithMaterials(material, target.hp, maxHp, inspection.healRate);
    if (territoryRepair.heal > 0) {
      const { damagedFacilities, blockedReason, ...territoryTarget } = target;
      territoryStateByTile[target.key] = {
      ...territoryTarget,
      hp:territoryRepair.hp,
      lastRepairTurn:Math.max(1, Math.floor(number(turnNumber, 1))),
      ...(territoryRepair.hp > 0 ? { raided:false, raidedAtTurn:null, raidedByNestId:"" } : {})
    };
    }
    const tileFacilities = { ...(facilityStateByTile[target.key] || {}) };
    const facilityReports = [];
    for (const facility of target.damagedFacilities || []) {
      const repaired = repairHpWithMaterials(material, facility.hp, facility.maxHp, inspection.healRate);
      if (repaired.heal <= 0) continue;
      tileFacilities[facility.facilityName] = { ...facility, hp:repaired.hp, status:repaired.hp > 0 ? "稼働" : "損壊", lastRepairTurn:Math.max(1, Math.floor(number(turnNumber, 1))) };
      facilityReports.push({ facilityName:facility.facilityName, beforeHp:number(facility.hp), hp:repaired.hp, heal:repaired.heal, cost:repaired.cost });
    }
    if (facilityReports.length) facilityStateByTile[target.key] = tileFacilities;
    if (territoryRepair.heal > 0 || facilityReports.length) reports.push({ key:target.key, beforeHp:number(target.hp), hp:territoryRepair.hp, heal:territoryRepair.heal, cost:territoryRepair.cost, facilities:facilityReports });
  }
  if (!reports.length) return { state, reports, ...inspection };
  const settlement = { ...inspection.settlement, materialStockByType:material, facilityStateByTile };
  const factionState = replaceFactionSettlement(inspection.player.factionState, settlement, { ownerPlayerId:inspection.player.id });
  const players = state.players.map(row => text(row?.id) === text(inspection.player.id) ? { ...row, factionState } : row);
  return { state:{ ...state, players, territoryStateByTile }, reports, ...inspection, settlement };
}
