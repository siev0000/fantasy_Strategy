import { getGameDataRows } from "./game-data-registry.js";
import { getHexNeighborCoords } from "./hex-grid.js";
import { V39_NEUTRAL_VILLAGE_BALANCE } from "./v39-gameplay-balance.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { UNIT_CREATE_MODE_KEYS, resolveUnitCreateMode } from "../composables/militaryUnitUtils.js";
import { buildV39ClassEquipment, buildV39UnitEntity } from "./v39-unit-creation-rules.js";

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

const FACTION_ROWS = getGameDataRows("勢力");
const RACE_ROWS = getGameDataRows("種族");
const CLASS_ROWS = getGameDataRows("クラス");
const CLASS_BY_NAME = new Map(CLASS_ROWS.map(row => [text(row?.名前), row]).filter(([name]) => name));
const DEFENSE_CLASS_NAMES = Object.freeze(["ファイター", "フェンサー"]);

function ratio(value) {
  const raw = number(value);
  const normalized = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, normalized));
}

function factionRowForVillage(village) {
  const candidates = new Set([
    text(village?.factionDataName),
    text(village?.race),
    text(village?.combatRaceName)
  ].filter(Boolean));
  let row = FACTION_ROWS.find(item => candidates.has(text(item?.種族)) || candidates.has(text(item?.カナ))) || null;
  if (row) return row;

  const raceRow = RACE_ROWS.find(item => (
    candidates.has(text(item?.key))
    || candidates.has(text(item?.name))
    || candidates.has(text(item?.className))
  )) || null;
  if (!raceRow) return null;
  return FACTION_ROWS.find(item => text(item?.カナ) === text(raceRow?.className)) || null;
}

function combatRaceNameForVillage(village, factionRow = factionRowForVillage(village)) {
  return text(village?.combatRaceName)
    || text(factionRow?.カナ)
    || text(village?.race);
}

function villageMilitaryLevel(village) {
  return Math.max(0, integer(village?.researchLevels?.軍事Lv ?? village?.militaryLevel, 0));
}

function passableDefenseTile(mapData, x, y) {
  if (!mapData?.grid) return false;
  const terrain = text(mapData?.grid?.[y]?.[x]);
  if (!terrain || ["海", "湖", "火山"].includes(terrain)) return false;
  if (mapData?.lavaMap?.[y]?.[x]) return false;
  return true;
}

function buildDefensePositions(village, mapData, count, occupiedTileKeys = null) {
  const needed = Math.max(0, integer(count));
  if (!needed || !mapData?.grid) return [];

  const occupied = occupiedTileKeys instanceof Set
    ? new Set([...occupiedTileKeys].map(text).filter(Boolean))
    : new Set();
  const center = { x:integer(village?.x), y:integer(village?.y) };
  occupied.add(keyOf(center.x, center.y));

  const queue = [center];
  const visited = new Set([keyOf(center.x, center.y)]);
  const result = [];

  while (queue.length && result.length < needed) {
    const current = queue.shift();
    for (const next of getHexNeighborCoords(
      mapData?.w,
      mapData?.h,
      current.x,
      current.y,
      mapData?.worldWrapEnabled === true
    )) {
      const key = keyOf(next.x, next.y);
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x:next.x, y:next.y });
      if (!passableDefenseTile(mapData, next.x, next.y) || occupied.has(key)) continue;
      result.push({ x:next.x, y:next.y, key });
      occupied.add(key);
      if (result.length >= needed) break;
    }
  }
  return result;
}

function militaryProfilesForVillage(village, militaryPopulationCap) {
  const militaryLevel = villageMilitaryLevel(village);
  const profileLevel = Math.max(1, militaryLevel);
  const normal = resolveUnitCreateMode(UNIT_CREATE_MODE_KEYS.ARMY, profileLevel);
  const elite = resolveUnitCreateMode(UNIT_CREATE_MODE_KEYS.ELITE_ARMY, profileLevel);
  const normalMembers = Math.max(1, integer(normal?.memberCount ?? normal?.populationCost, 4));
  const eliteMembers = Math.max(1, integer(elite?.memberCount ?? elite?.populationCost, 5));
  let remaining = Math.max(0, integer(militaryPopulationCap));
  const profiles = [];

  const eliteAvailable = militaryLevel >= 3 && text(elite?.mode) === UNIT_CREATE_MODE_KEYS.ELITE_ARMY;
  const previousLevelThreeFormationCost = normalMembers * 2 + eliteMembers;
  if (eliteAvailable && remaining >= previousLevelThreeFormationCost) {
    profiles.push({ ...normal }, { ...normal }, { ...elite });
    remaining -= previousLevelThreeFormationCost;
  }

  while (remaining >= normalMembers) {
    profiles.push({ ...normal });
    remaining -= normalMembers;
  }

  return { profiles, reservePopulation:remaining };
}

function preserveDefenseRuntime(existing, next) {
  if (!existing || !next) return next;
  const oldMaxHp = Math.max(1, number(existing?.maxHp ?? existing?.status?.HP, 1));
  const oldHp = Math.max(0, number(existing?.hp ?? existing?.currentHp, oldMaxHp));
  const hpRatio = Math.max(0, Math.min(1, oldHp / oldMaxHp));
  const nextMaxHp = Math.max(1, number(next?.maxHp ?? next?.status?.HP, 1));
  const hp = Math.round(nextMaxHp * hpRatio);
  return {
    ...next,
    hp,
    currentHp:hp,
    ap:Math.max(0, number(existing?.ap ?? existing?.currentAp, next?.ap)),
    currentAp:Math.max(0, number(existing?.currentAp ?? existing?.ap, next?.currentAp)),
    state:hp > 0 ? text(existing?.state) || "生存" : "死亡",
    lastMovedTurn:integer(existing?.lastMovedTurn),
    lastCombatTurn:integer(existing?.lastCombatTurn)
  };
}

export function buildV39NeutralVillageDefenseUnits(village, mapData, options = {}) {
  const factionRow = factionRowForVillage(village);
  const armyRate = ratio(village?.armyRate ?? factionRow?.軍隊);
  const population = Math.max(0, integer(village?.population));
  const militaryPopulationCap = Math.max(0, Math.floor(population * armyRate));
  const militaryLevel = villageMilitaryLevel(village);
  const combatRaceName = combatRaceNameForVillage(village, factionRow);
  const formation = militaryProfilesForVillage(village, militaryPopulationCap);
  const positions = buildDefensePositions(
    village,
    mapData,
    formation.profiles.length,
    options?.occupiedTileKeys
  );
  const existingById = new Map(
    (Array.isArray(village?.defenseUnits) ? village.defenseUnits : [])
      .map(row => [text(row?.id), row])
      .filter(([id]) => id)
  );
  const units = [];

  for (let index = 0; index < Math.min(formation.profiles.length, positions.length); index += 1) {
    const profile = formation.profiles[index];
    const position = positions[index];
    const memberCount = Math.max(1, integer(profile?.memberCount ?? profile?.populationCost, 1));
    const className = DEFENSE_CLASS_NAMES[hash(text(village?.id) + ":defense-class:" + index) % DEFENSE_CLASS_NAMES.length];
    const classRow = CLASS_BY_NAME.get(className) || CLASS_BY_NAME.get("ファイター") || {};
    const id = text(village?.id) + "-defense-" + (index + 1);
    const label = text(classRow?.ルビ) || className || "戦士";
    const built = buildV39UnitEntity({
      id,
      name:(text(village?.name) || text(village?.race) || "一般村") + " " + label + "軍" + (index + 1),
      race:combatRaceName,
      className,
      level:Math.max(1, militaryLevel),
      unitType:text(profile?.unitTypeLabel) || "軍隊",
      isMob:true,
      isNamed:false,
      role:"一般村守備 / " + (text(profile?.unitTypeLabel) || "軍隊"),
      squadId:text(village?.id) + "-defense",
      x:position.x,
      y:position.y,
      combatProfile:profile,
      settlementId:text(village?.id),
      equipment:buildV39ClassEquipment(classRow)
    });
    const strength = memberCount * (8 + Math.max(1, militaryLevel) * 2);
    units.push(preserveDefenseRuntime(existingById.get(id), {
      ...built,
      neutral:true,
      isNeutralVillageGuard:true,
      neutralVillageId:text(village?.id),
      ownerNeutralVillageId:text(village?.id),
      count:memberCount,
      militaryPopulation:memberCount,
      strength
    }));
  }

  const militaryPopulationUsed = units.reduce(
    (sum, unit) => sum + Math.max(0, integer(unit?.combatProfile?.memberCount ?? unit?.count)),
    0
  );
  return {
    units,
    factionDataName:text(village?.factionDataName) || text(factionRow?.種族),
    combatRaceName,
    armyRate,
    militaryPopulationCap,
    militaryPopulationUsed,
    militaryPopulationReserve:Math.max(0, militaryPopulationCap - militaryPopulationUsed)
  };
}

export function normalizeV39NeutralVillage(village, mapData, options = {}) {
  const territoryTileKeys = Array.isArray(village?.territoryTileKeys) && village.territoryTileKeys.length
    ? [...new Set(village.territoryTileKeys.map(text).filter(Boolean))]
    : buildV39NeutralVillageTerritory(mapData, village?.x, village?.y);
  const base = {
    ...village,
    territoryRadius:V39_NEUTRAL_VILLAGE_BALANCE.territoryRadius,
    territoryTileKeys,
    relationsByPlayerId:{ ...(village?.relationsByPlayerId || {}) },
    questsByPlayerId:{ ...(village?.questsByPlayerId || {}) },
    defenseUnits:Array.isArray(village?.defenseUnits) ? village.defenseUnits.map(row => ({ ...row })) : [],
    vassalPlayerId:text(village?.vassalPlayerId),
    raidState:village?.raidState && typeof village.raidState === "object" ? { ...village.raidState } : null
  };
  const defense = buildV39NeutralVillageDefenseUnits(base, mapData, options);
  return {
    ...base,
    factionDataName:defense.factionDataName,
    combatRaceName:defense.combatRaceName,
    armyRate:defense.armyRate,
    militaryPopulationCap:defense.militaryPopulationCap,
    militaryPopulationUsed:defense.militaryPopulationUsed,
    militaryPopulationReserve:defense.militaryPopulationReserve,
    defenseUnits:defense.units
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
  const defenseStrength = (source.defenseUnits || []).reduce((sum, row) => sum + number(row.strength), 0);
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
