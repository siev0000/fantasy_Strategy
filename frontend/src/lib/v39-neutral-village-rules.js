import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "./v39-gameplay-balance.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const keyOf = (x, y) => `${integer(x)},${integer(y)}`;
const clampRelation = value => Math.max(V39_NEUTRAL_VILLAGE_BALANCE.relationMin, Math.min(V39_NEUTRAL_VILLAGE_BALANCE.relationMax, integer(value)));

function hash(value) {
  let result = 0;
  for (const char of text(value)) result = Math.imul(result ^ char.charCodeAt(0), 2654435761) >>> 0;
  return result;
}

export function buildV39NeutralVillageTerritory(mapData, x, y) {
  const center = { x:integer(x), y:integer(y) };
  const result = new Set([keyOf(center.x, center.y)]);
  for (const neighbor of getHexNeighborCoords(mapData?.w, mapData?.h, center.x, center.y, mapData?.worldWrapEnabled === true)) {
    result.add(keyOf(neighbor.x, neighbor.y));
  }
  return [...result];
}

export function getV39NeutralVillageRelation(village, playerId) {
  return clampRelation(village?.relationsByPlayerId?.[text(playerId)] ?? V39_NEUTRAL_VILLAGE_BALANCE.initialRelation);
}

export function getV39RelationLabel(value) {
  const relation = clampRelation(value);
  if (relation >= 60) return "盟友";
  if (relation >= 30) return "友好";
  if (relation <= -60) return "敵対";
  if (relation <= -30) return "警戒";
  return "中立";
}

function defenders(village) {
  const militaryLevel = Math.max(1, integer(village?.researchLevels?.軍事Lv ?? village?.militaryLevel, 1));
  const count = Math.max(2, militaryLevel * V39_NEUTRAL_VILLAGE_BALANCE.defendersPerMilitaryLevel);
  return [{
    id:`${text(village?.id)}-guard`,
    name:`${text(village?.race) || "村"}の守備隊`,
    className:text(village?.className) || "ファイター",
    level:militaryLevel,
    count,
    strength:count * (8 + militaryLevel * 2)
  }];
}

export function normalizeV39NeutralVillage(village, mapData) {
  const territoryTileKeys = Array.isArray(village?.territoryTileKeys) && village.territoryTileKeys.length
    ? [...new Set(village.territoryTileKeys.map(text).filter(Boolean))]
    : buildV39NeutralVillageTerritory(mapData, village?.x, village?.y);
  return {
    ...village,
    territoryRadius:V39_NEUTRAL_VILLAGE_BALANCE.territoryRadius,
    territoryTileKeys,
    relationsByPlayerId:{ ...(village?.relationsByPlayerId || {}) },
    questsByPlayerId:{ ...(village?.questsByPlayerId || {}) },
    defenseUnits:Array.isArray(village?.defenseUnits) && village.defenseUnits.length ? village.defenseUnits.map(row => ({ ...row })) : defenders(village),
    vassalPlayerId:text(village?.vassalPlayerId),
    raidState:village?.raidState && typeof village.raidState === "object" ? { ...village.raidState } : null
  };
}

function changeRelation(village, playerId, delta) {
  return {
    ...village,
    relationsByPlayerId:{
      ...(village.relationsByPlayerId || {}),
      [playerId]:clampRelation(getV39NeutralVillageRelation(village, playerId) + delta)
    }
  };
}

function updateVillageState(state, village) {
  const neutralVillages = (state.neutralVillages || []).map(row => row.id === village.id ? village : row);
  const settlements = (state.settlements || []).map(row => row.id === village.id ? village : row);
  return { ...state, neutralVillages, settlements };
}

function changeSettlementResource(state, playerId, kind, amount) {
  const player = state.players?.find(row => row.id === playerId);
  const settlement = getSelectedSettlement(player?.factionState);
  if (!player || !settlement) return { ok:false, state };
  const bagKey = kind === "material" ? "materialStockByType" : "foodStockByType";
  const bag = { ...(settlement[bagKey] || {}) };
  const preferred = kind === "material" ? ["木材", "石材", "鉄"] : ["穀物", "野菜", "肉", "魚"];
  const key = preferred.find(name => number(bag[name]) >= Math.max(0, -amount)) || preferred[0];
  if (amount < 0 && number(bag[key]) < -amount) return { ok:false, state, reason:`${key}が不足しています` };
  bag[key] = Math.max(0, Math.round((number(bag[key]) + amount) * 10) / 10);
  const nextSettlement = { ...settlement, [bagKey]:bag };
  const players = state.players.map(row => row.id !== playerId ? row : {
    ...row,
    factionState:replaceFactionSettlement(row.factionState, nextSettlement, { ownerPlayerId:row.id, select:false })
  });
  return { ok:true, state:{ ...state, players }, resourceName:key };
}

export function improveV39NeutralVillageRelation(state, playerId, villageId) {
  let village = state?.neutralVillages?.find(row => row.id === villageId);
  if (!village) return { ok:false, reason:"一般村がありません", state };
  const payment = changeSettlementResource(state, playerId, "food", -V39_NEUTRAL_VILLAGE_BALANCE.improveRelationCost);
  if (!payment.ok) return payment;
  village = changeRelation(village, playerId, V39_NEUTRAL_VILLAGE_BALANCE.improveRelationGain);
  return { ok:true, state:updateVillageState(payment.state, village), village, message:`${village.name}との関係 +${V39_NEUTRAL_VILLAGE_BALANCE.improveRelationGain}` };
}

function createQuest(village, playerId, turn) {
  const material = hash(`${village.id}:${playerId}:quest`) % 2 === 1;
  return {
    id:`${village.id}-${playerId}-T${turn}`,
    type:material ? "material" : "food",
    label:material ? "建材の提供" : "食料の提供",
    required:V39_NEUTRAL_VILLAGE_BALANCE.questBaseRequirement * Math.max(1, integer(village.level, 1)),
    accepted:true,
    createdTurn:turn,
    completed:false
  };
}

export function acceptV39NeutralVillageQuest(state, playerId, villageId) {
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  if (!source) return { ok:false, reason:"一般村がありません", state };
  const turn = Math.max(1, integer(state?.timeline?.turnNumber, 1));
  const village = { ...source, questsByPlayerId:{ ...(source.questsByPlayerId || {}), [playerId]:createQuest(source, playerId, turn) } };
  return { ok:true, state:updateVillageState(state, village), village, quest:village.questsByPlayerId[playerId], message:"依頼を受注しました" };
}

export function completeV39NeutralVillageQuest(state, playerId, villageId) {
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  const quest = source?.questsByPlayerId?.[playerId];
  if (!source || !quest?.accepted || quest.completed) return { ok:false, reason:"受注中の依頼がありません", state };
  const payment = changeSettlementResource(state, playerId, quest.type, -number(quest.required));
  if (!payment.ok) return payment;
  const rewardType = quest.type === "material" ? "food" : "material";
  const reward = changeSettlementResource(payment.state, playerId, rewardType, V39_NEUTRAL_VILLAGE_BALANCE.questReward);
  let village = changeRelation(source, playerId, V39_NEUTRAL_VILLAGE_BALANCE.questRelationGain);
  village = { ...village, questsByPlayerId:{ ...village.questsByPlayerId, [playerId]:{ ...quest, completed:true, completedTurn:integer(state?.timeline?.turnNumber, 1) } } };
  return { ok:true, state:updateVillageState(reward.state, village), village, message:`依頼完了 / 関係 +${V39_NEUTRAL_VILLAGE_BALANCE.questRelationGain} / 謝礼 ${reward.resourceName} ${V39_NEUTRAL_VILLAGE_BALANCE.questReward}` };
}

export function vassalizeV39NeutralVillage(state, playerId, villageId) {
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  if (!source) return { ok:false, reason:"一般村がありません", state };
  if (source.vassalPlayerId) return { ok:false, reason:"既に属国です", state };
  if (getV39NeutralVillageRelation(source, playerId) < V39_NEUTRAL_VILLAGE_BALANCE.vassalRelationRequired) {
    return { ok:false, reason:`関係値${V39_NEUTRAL_VILLAGE_BALANCE.vassalRelationRequired}以上が必要です`, state };
  }
  const village = { ...source, vassalPlayerId:playerId, vassalizedTurn:integer(state?.timeline?.turnNumber, 1) };
  return { ok:true, state:updateVillageState(state, village), village, message:`${village.name}が属国になりました` };
}

export function raidV39NeutralVillage(state, playerId, villageId) {
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  const player = state?.players?.find(row => row.id === playerId);
  const unit = player?.factionState?.units?.find(row => row.id === player?.factionState?.selectedUnitId);
  if (!source || !unit) return { ok:false, reason:"襲撃するユニットを選択してください", state };
  if (!(source.territoryTileKeys || []).includes(keyOf(unit.x, unit.y))) return { ok:false, reason:"村の範囲内にユニットがいません", state };
  const defenseStrength = (source.defenseUnits || defenders(source)).reduce((sum, row) => sum + number(row.strength), 0);
  const attackStrength = Math.max(1, number(unit?.status?.攻撃 ?? unit?.attack, 1) + number(unit?.level) * 5);
  const success = attackStrength >= defenseStrength;
  let village = changeRelation(source, playerId, -V39_NEUTRAL_VILLAGE_BALANCE.raidRelationLoss);
  village = { ...village, population:Math.max(1, integer(village.population) - (success ? Math.max(1, Math.floor(number(village.population) * 0.05)) : 0)), lastPlayerRaid:{ turn:integer(state?.timeline?.turnNumber, 1), playerId, success } };
  let next = updateVillageState(state, village);
  if (success) next = changeSettlementResource(next, playerId, "material", 20 * Math.max(1, integer(village.level, 1))).state;
  return { ok:true, success, state:next, village, message:success ? "襲撃成功 / 資材を獲得" : "襲撃失敗 / 守備隊に阻止されました" };
}

export function advanceV39NeutralVillages(state, mapData, turnNumber) {
  let working = { ...state };
  const reports = [];
  const turn = Math.max(1, integer(turnNumber, state?.timeline?.turnNumber || 1));
  let villages = (state?.neutralVillages || []).map(row => normalizeV39NeutralVillage(row, mapData));
  for (let index = 0; index < villages.length; index += 1) {
    let village = villages[index];
    if (integer(village.lastProcessedTurn) >= turn) continue;
    if (village.vassalPlayerId) {
      const tribute = Math.max(1, Math.floor(number(village.population) * 0.02 * V39_NEUTRAL_VILLAGE_BALANCE.vassalTributeRate));
      const paid = changeSettlementResource(working, village.vassalPlayerId, "food", tribute);
      if (paid.ok) working = paid.state;
      village = { ...village, lastTribute:{ turn, amount:tribute, resourceName:paid.resourceName || "穀物" } };
      reports.push({ type:"tribute", villageId:village.id, playerId:village.vassalPlayerId, amount:tribute });
    }
    const raidRoll = hash(`${village.id}:raid:T${turn}`) % 10000;
    if (!village.vassalPlayerId && raidRoll < V39_NEUTRAL_VILLAGE_BALANCE.raidChancePerTurn * 10000) {
      const defense = village.defenseUnits.reduce((sum, row) => sum + number(row.strength), 0);
      const raidStrength = 30 + (hash(`${village.id}:raid-strength:T${turn}`) % 100);
      const defended = defense >= raidStrength;
      const populationLoss = defended ? 0 : Math.max(1, Math.floor(number(village.population) * V39_NEUTRAL_VILLAGE_BALANCE.raidPopulationLossRate));
      village = { ...village, population:Math.max(1, integer(village.population)-populationLoss), raidState:{ turn, active:false, defended, raidStrength, populationLoss } };
      reports.push({ type:"raid", villageId:village.id, defended, populationLoss });
    }
    villages[index] = { ...village, researchExp:Math.max(0, number(village.researchExp)) + 10, lastProcessedTurn:turn };
  }
  const byId = new Map(villages.map(row => [row.id, row]));
  return {
    state:{ ...working, neutralVillages:villages, settlements:(working.settlements || []).map(row => byId.get(row.id) || row) },
    reports
  };
}
