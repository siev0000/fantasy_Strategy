import {isV39VillageHostileToPlayer} from './v39-village-hostility.js';
import {resolveV39SpecialVillage} from './v39-special-villages.js';
import { getHexNeighborCoords, getHexDistance } from "./hex-grid.js";
import eventDefaults from "../../../config/v39-event-defaults.json";
import expeditionDefaults from "../../../config/v39-expedition-defaults.json";
import { getGameDataRows } from "./game-data-registry.js";
import {freezeV39QuestReward,payV39QuestReward,describeV39QuestReward} from './v39-quest-rewards.js';
import {getV39VillageQuests,findV39VillageQuest,syncV39VillageQuestLog} from './v39-village-quest-log.js';
import { V39_NEUTRAL_VILLAGE_BALANCE, V39_QUEST_BALANCE } from "./v39-gameplay-balance.js";
import { FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS, inspectV39NeutralVillageEconomy } from "./v39-economy-rules.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { UNIT_CREATE_MODE_KEYS, resolveUnitCreateMode } from "../composables/militaryUnitUtils.js";
import { buildV39ClassEquipment, buildV39UnitEntity } from "./v39-unit-creation-rules.js";
import { resolveV39UnitInitialLevel } from "./v39-unit-experience.js";
import {createV39EventQuest,applyV39EventEffects} from './v39-event-rules.js';
import {isV39Undead} from './v39-purification-rules.js';
import {markV39AbandonedVillage} from './v39-abandoned-villages.js';
import npcDefense from '../../../config/v39-npc-defense.json';
import {advanceV39VillagePlans, villageQuestTemplates, resolveV39VillagePlanQuest, villageDefenseTrainingTurns} from './v39-village-plans.js';
import {advanceV39VillageSupportQuest,inspectV39VillageSupportQuest} from './v39-village-support-goals.js';
import {advanceV39VillageResourceTeams} from './v39-village-resource-teams.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));
const keyOf = (x, y) => `${integer(x)},${integer(y)}`;
const clampRelation = value => Math.max(V39_NEUTRAL_VILLAGE_BALANCE.relationMin, Math.min(V39_NEUTRAL_VILLAGE_BALANCE.relationMax, integer(value)));
const VILLAGE_EVENT_ROWS = getGameDataRows("イベント_一般村");

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
  let row = FACTION_ROWS.find(item => [item?.種族,item?.カナ,...(item?.旧名称||[])].some(name=>candidates.has(text(name)))) || null;
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
  return text(factionRow?.カナ)
    || text(village?.combatRaceName)
    || text(village?.race);
}

function villageMilitaryLevel(village) {
  return Math.max(0, integer(village?.researchLevels?.軍事Lv ?? village?.militaryLevel, 0),integer(resolveV39SpecialVillage(village)?.militaryLevel));
}

function passableDefenseTile(mapData, x, y) {
  if (!mapData?.grid) return false;
  const terrain = text(mapData?.grid?.[y]?.[x]);
  if (!terrain || ["海", "湖", "火山"].includes(terrain)) return false;
  if (mapData?.lavaMap?.[y]?.[x]) return false;
  return true;
}

function buildDefensePositions(village, mapData, count, occupiedTileKeys = null, maxDistance = Infinity) {
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
      if (getHexDistance(center, next) > maxDistance) continue;
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
  if(existing.tradeAssignment)return {...existing};
  const oldMaxHp = Math.max(1, number(existing?.maxHp ?? existing?.status?.HP, 1));
  const oldHp = Math.max(0, number(existing?.hp ?? existing?.currentHp, oldMaxHp));
  const hpRatio = Math.max(0, Math.min(1, oldHp / oldMaxHp));
  const nextMaxHp = Math.max(1, number(next?.maxHp ?? next?.status?.HP, 1));
  const hp = Math.round(nextMaxHp * hpRatio);
  return {
    ...next,
    x:existing.x,y:existing.y,worldId:existing.worldId,
    skillCooldownsByName:{...existing.skillCooldownsByName},
    lastDefenseTurn:existing.lastDefenseTurn,deathTurn:existing.deathTurn,deadExpireTurn:existing.deadExpireTurn,
    lastStealthAttackTurn:existing.lastStealthAttackTurn,lastStealthBreakTurn:existing.lastStealthBreakTurn,
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
  const armyRate = ratio(factionRow?.軍隊 ?? village?.armyRate);
  const population = Math.max(0, integer(village?.population));
  let militaryPopulationCap = Math.max(0, Math.floor(population * armyRate));
  const combatRaceName = combatRaceNameForVillage(village, factionRow);
  const formation = militaryProfilesForVillage(village, militaryPopulationCap);
  if (options.minimumDefense) {
    const profile = resolveUnitCreateMode(UNIT_CREATE_MODE_KEYS.ARMY, Math.max(1, villageMilitaryLevel(village)));
    const members = Math.max(1, integer(profile.memberCount ?? profile.populationCost, 3));
    formation.profiles = population >= members ? [profile] : [];
    militaryPopulationCap = Math.max(militaryPopulationCap, formation.profiles.length ? members : 0);
  }
  const positions = buildDefensePositions(
    village,
    mapData,
    formation.profiles.length,
    options?.occupiedTileKeys,
    options.minimumDefense ? npcDefense.villageDefenseRadius : Infinity
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
    const existing = existingById.get(id);
    const level = existing ? Math.max(1, integer(existing.level, 1)) : Math.max(resolveV39UnitInitialLevel(combatRaceName, true),integer(resolveV39SpecialVillage(village)?.armyLevel));
    const label = text(classRow?.ルビ) || className || "戦士";
    const built = buildV39UnitEntity({
      id,
      name:(text(village?.name) || text(village?.race) || "一般村") + " " + label + "軍" + (index + 1),
      race:combatRaceName,
      className,
      level,
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
    const strength = memberCount * (8 + level * 2);
    units.push(preserveDefenseRuntime(existing, {
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

  for(const existing of village.defenseUnits||[])if((existing.tradeAssignment||!livingDefenseUnit(existing))&&!units.some(unit=>unit.id===existing.id))units.push({...existing});
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
  village=syncV39VillageQuestLog(village);
  village=markV39AbandonedVillage(village,mapData?.turnState?.turnNumber||1);
  if(village.abandoned)return {...village,defenseUnits:(village.defenseUnits||[]).map(unit=>({...unit}))};
  // 固定検証村の兵は実戦中に敵側へ移す。通常の再編で複製しない。
  if(village.incidentTest)return {...village};
  const territoryTileKeys = Array.isArray(village?.territoryTileKeys) && village.territoryTileKeys.length
    ? [...new Set(village.territoryTileKeys.map(text).filter(Boolean))]
    : buildV39NeutralVillageTerritory(mapData, village?.x, village?.y);
  const base = {
    ...village,
    materialStockByType:village.materialStockByType?{...village.materialStockByType}:{金:Math.max(0,integer(village.population))*npcDefense.initialGoldPerResident},
    foodStockByType:village.foodStockByType?{...village.foodStockByType}:{穀物:Math.max(0,integer(village.population))*npcDefense.initialGrainPerResident},
    territoryRadius:V39_NEUTRAL_VILLAGE_BALANCE.territoryRadius,
    territoryTileKeys,
    relationsByPlayerId:{ ...(village?.relationsByPlayerId || {}) },
    questsByPlayerId:{ ...(village?.questsByPlayerId || {}) },
    eventCompletedTurnByPlayerId:{ ...(village?.eventCompletedTurnByPlayerId || {}) },
    defenseUnits:Array.isArray(village?.defenseUnits) ? village.defenseUnits.map(row => ({ ...row })) : [],
    vassalPlayerId:text(village?.vassalPlayerId),
    raidState:village?.raidState && typeof village.raidState === "object" ? { ...village.raidState } : null
  };
  // Once initialized, only turn-based training may add soldiers. Missing/dead IDs are not respawn slots.
  const initialized = base.defenseRosterInitialized === true || base.hadDefenseUnits === true;
  const defense = initialized ? {
    ...base,
    units:base.defenseUnits,
    militaryPopulationUsed:base.defenseUnits.filter(livingDefenseUnit).reduce((sum, unit) => sum + integer(unit.militaryPopulation ?? unit.count), 0)
  } : buildV39NeutralVillageDefenseUnits(base, mapData, options);
  const used = defense.units.filter(livingDefenseUnit).reduce((sum, unit) => sum + integer(unit.militaryPopulation ?? unit.count), 0);
  return {
    ...base,
    factionDataName:defense.factionDataName,
    combatRaceName:defense.combatRaceName,
    armyRate:defense.armyRate,
    militaryPopulationCap:defense.militaryPopulationCap,
    militaryPopulationUsed:used,
    militaryPopulationReserve:Math.max(0, number(defense.militaryPopulationCap) - used),
    hadDefenseUnits:base.hadDefenseUnits===true||defense.units.length>0,
    defenseRosterInitialized:true,
    defenseUnits:defense.units
  };
}

function livingDefenseUnit(unit) {
  return number(unit.hp ?? unit.currentHp) > 0 && unit.state !== '死亡';
}

function advanceVillageDefenseTraining(village, state, mapData, turn, reports) {
  if (village.abandoned || village.incidentTest) return village;
  if (village.defenseUnits.some(livingDefenseUnit)) return {...village, defenseTraining:null};
  const occupied = new Set();
  const add = unit => { if (livingDefenseUnit(unit) && (!unit.worldId || unit.worldId === 'surface')) occupied.add(keyOf(unit.x, unit.y)); };
  for (const player of state.players || []) for (const unit of player.factionState?.units || []) add(unit);
  for (const unit of state.enemies || []) add(unit);
  for (const unit of state.wandererGroups || []) add(unit);
  for (const settlement of state.settlements || []) occupied.add(keyOf(settlement.x, settlement.y));
  for (const other of state.neutralVillages || []) {
    occupied.add(keyOf(other.x, other.y));
    for (const unit of other.defenseUnits || []) add(unit);
  }
  const candidate = buildV39NeutralVillageDefenseUnits({...village, defenseUnits:[]}, mapData, {minimumDefense:true, occupiedTileKeys:occupied}).units[0];
  if (!candidate) return village;
  const training = village.defenseTraining;
  if (!training) {
    const readyTurn = turn + villageDefenseTrainingTurns(Math.max(1, integer(npcDefense.replacementTrainingTurns, 3)));
    reports.push({type:'defense-training-started', villageId:village.id, readyTurn});
    return {...village, defenseTraining:{startedTurn:turn, readyTurn}};
  }
  if (turn < training.readyTurn) return village;
  const serial = Math.max(0, integer(village.defenseRecruitSerial)) + 1;
  const recruit = {...candidate, id:`${village.id}-replacement-${serial}`, lastDefenseTurn:turn, trainedTurn:turn};
  reports.push({type:'defense-replenished', villageId:village.id, unitId:recruit.id});
  return {...village, defenseTraining:null, defenseRecruitSerial:serial, hadDefenseUnits:true,
    defenseUnits:[...village.defenseUnits, recruit]};
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
export {changeRelation as changeV39NeutralVillageRelation, updateVillageState as updateV39NeutralVillageState};

function updateVillageState(state, village) {
  const prior=state.neutralVillages?.find(row=>row.id===village.id);
  const previous=prior?syncV39VillageQuestLog(prior).questLogByPlayerId:{};
  const log={...previous};
  for(const [playerId,records] of Object.entries(village.questLogByPlayerId||{}))log[playerId]={...log[playerId],...records};
  village={...village,questLogByPlayerId:log};
  village=syncV39VillageQuestLog(village);
  const neutralVillages = (state.neutralVillages || []).map(row => row.id === village.id ? village : row);
  const settlements = (state.settlements || []).map(row => row.id === village.id ? village : row);
  return { ...state, neutralVillages, settlements };
}

export function changeV39QuestResource(state, playerId, kind, amount, resourceKey = "") {
  const player = state.players?.find(row => row.id === playerId);
  const settlement = getSelectedSettlement(player?.factionState);
  if (!player || !settlement) return { ok:false, state };
  const bagKey = kind === "material" ? "materialStockByType" : "foodStockByType";
  const bag = { ...(settlement[bagKey] || {}) };
  const preferred = kind === "material" ? MATERIAL_RESOURCE_KEYS : FOOD_RESOURCE_KEYS;
  const requested = text(resourceKey);
  const key = preferred.includes(requested)
    ? requested
    : preferred.find(name => number(bag[name]) >= Math.max(0, -amount)) || preferred[0];
  if (amount < 0 && number(bag[key]) < -amount) return { ok:false, state, reason:`${key}が不足しています` };
  bag[key] = Math.max(0, Math.round((number(bag[key]) + amount) * 10) / 10);
  const nextSettlement = { ...settlement, [bagKey]:bag };
  const players = state.players.map(row => row.id !== playerId ? row : {
    ...row,
    factionState:replaceFactionSettlement(row.factionState, nextSettlement, { ownerPlayerId:row.id, select:false })
  });
  return { ok:true, state:{ ...state, players }, resourceName:key };
}

const changeSettlementResource=changeV39QuestResource;

export function improveV39NeutralVillageRelation(state, playerId, villageId) {
  let village = state?.neutralVillages?.find(row => row.id === villageId);
  if (!village) return { ok:false, reason:"一般村がありません", state };
  const payment = changeSettlementResource(state, playerId, "food", -V39_NEUTRAL_VILLAGE_BALANCE.improveRelationCost);
  if (!payment.ok) return payment;
  village = changeRelation(village, playerId, V39_NEUTRAL_VILLAGE_BALANCE.improveRelationGain);
  return { ok:true, state:updateVillageState(payment.state, village), village, message:`${village.name}との関係 +${V39_NEUTRAL_VILLAGE_BALANCE.improveRelationGain}` };
}

function eventEffects(row) {
  const source = row?.完了効果;
  if (Array.isArray(source)) return source.filter(item => item && typeof item === "object");
  return source && typeof source === "object" ? [source] : [];
}

function resolveVillageShortage(village, mapData) {
  if (!mapData?.grid) return null;
  const economy = inspectV39NeutralVillageEconomy(village, mapData);
  const shortage = Object.entries(economy.shortageByType || {})
    .map(([resourceKey, amount]) => ({ resourceKey, amount:number(amount) }))
    .filter(row => row.amount > 0)
    .sort((left, right) => right.amount - left.amount || left.resourceKey.localeCompare(right.resourceKey, "ja"))[0];
  if (!shortage) return null;
  return { ...shortage, economy };
}

function resolveVillageReward(village, mapData, row) {
  if (!eventEffects(row).some(effect => text(effect?.タイプ) === "村産出資源受取")) return null;
  const economy = inspectV39NeutralVillageEconomy(village, mapData);
  const resourceKey = economy.favorableResourceKeys?.[0];
  if (!resourceKey) return null;
  return {
    resourceKey,
    stockKind:FOOD_RESOURCE_KEYS.includes(resourceKey) ? "food" : "material",
    // 数量設定「村規模比例」の係数は未確定のため、既存の一般村依頼謝礼値を暫定係数として使用する。
    amount:V39_NEUTRAL_VILLAGE_BALANCE.questReward * Math.max(1, integer(village?.level, 1))
  };
}

function relationGainFromEvent(row) {
  return eventEffects(row)
    .filter(effect => text(effect?.タイプ) === "一般村友好度変更")
    .reduce((sum, effect) => sum + number(effect?.設定?.値), 0);
}

function createQuest(state, village, playerId, turn, mapData, eventId = "", override = null) {
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const template=!override&&villageQuestTemplates().find(row=>row.ID===eventId);
  if(template&&player){
    const last=village.eventCompletedTurnByPlayerId?.[playerId]?.[eventId];
    if(last!=null&&turn<last+number(template.クールダウン))return null;
    const resolved=resolveV39VillagePlanQuest(state,village,template,mapData);
    if(!resolved||[...new Set([...Object.keys(village.questsByPlayerId||{}),...Object.keys(village.questLogByPlayerId||{})])].some(id=>id!==playerId&&getV39VillageQuests(village,id).some(quest=>quest.accepted&&!quest.completed&&quest.planDefinitionId===resolved.planDefinitionId)))return null;
    return {...resolved,id:`${village.id}:${eventId}:${playerId}:${turn}`,accepted:true,completed:false,createdTurn:turn,
      deadlineTurn:template.期限ターン?turn+template.期限ターン:0};
  }
  const definition=override || VILLAGE_EVENT_ROWS.find(row=>row.ID===eventId);
  if(definition) {
    const context={player,relation:getV39NeutralVillageRelation(village,playerId),turn,
      lastCompletedTurn:village.eventCompletedTurnByPlayerId?.[playerId]?.[definition.ID]};
    const quest=createV39EventQuest(definition,context,{
      指定物資:setting=>FOOD_RESOURCE_KEYS.includes(setting.対象)||MATERIAL_RESOURCE_KEYS.includes(setting.対象)
        ? {type:'delivery',stockKind:FOOD_RESOURCE_KEYS.includes(setting.対象)?'food':'material',resourceKey:setting.対象,required:setting.数量,progress:0}:null,
      指定討伐:setting=>{
        const targets=(state.enemies||[]).filter(enemy=>number(enemy.hp??enemy.currentHp)>0&&enemy.state!=='死亡'
          &&(enemy.worldId||'surface')==='surface'&&!enemy.victoryGuard&&getHexDistance(village,enemy)<=setting.範囲
          &&[enemy.race,enemy.raceName,enemy.className,enemy.name].includes(setting.対象))
          .sort((a,b)=>text(a.id).localeCompare(text(b.id))).slice(0,setting.数量);
        return targets.length===setting.数量?{type:'hunt',required:setting.数量,targetEnemyIds:targets.map(row=>row.id)}:null;
      },
      周辺脅威:setting=>{
        const tags=setting.対象?.タグ||[];
        const targets=(state.enemies||[]).filter(enemy=>number(enemy.hp??enemy.currentHp)>0&&enemy.state!=='死亡'
          &&!enemy.victoryGuard&&(enemy.worldId||'surface')==='surface'&&getHexDistance(village,enemy)<=number(setting.走査範囲)
          &&tags.every(tag=>enemy.tags?.includes?.(tag)||(tag==='アンデッド'&&isV39Undead(enemy))
            ||(tag==='動物'&&eventDefaults.animalRaces.includes(text(enemy.race||enemy.raceName))))
          &&(setting.追加条件||[]).every(condition=>condition.タイプ==='好戦的'&&condition.比較==='一致'&&enemy.aggressive===condition.値))
          .sort((a,b)=>getHexDistance(village,a)-getHexDistance(village,b)||text(a.id).localeCompare(text(b.id)))
          .slice(0,Math.max(1,integer(setting.最大対象数,1)));
        return targets.length>=Math.max(1,integer(setting.最低対象数,1))?{type:'hunt',required:targets.length,targetEnemyIds:targets.map(enemy=>enemy.id)}:null;
      },
      村不足資源:(_setting,row)=>{
        const shortage=resolveVillageShortage(village,mapData);if(!shortage)return null;
        const reward=resolveVillageReward(village,mapData,row);
        return {type:'delivery',stockKind:FOOD_RESOURCE_KEYS.includes(shortage.resourceKey)?'food':'material',resourceKey:shortage.resourceKey,
          label:`${row.名前} (${shortage.resourceKey})`,required:V39_NEUTRAL_VILLAGE_BALANCE.questBaseRequirement*Math.max(1,integer(village.level,1)),
          progress:0,requiredItems:[{種別:'資源',ID:shortage.resourceKey,数量:V39_NEUTRAL_VILLAGE_BALANCE.questBaseRequirement*Math.max(1,integer(village.level,1))}],
          rewardResourceKey:reward?.resourceKey,rewardStockKind:reward?.stockKind,rewardAmount:number(reward?.amount)};
      }
    });
    return quest?{...quest,id:`${village.id}-${playerId}-${definition.ID}-T${turn}`}:null;
  }
  const fallback=eventDefaults.village.find(row=>row.ID===eventId);
  if(fallback) {
    const last=integer(village.eventCompletedTurnByPlayerId?.[playerId]?.[eventId]);
    if(last && turn<last+V39_QUEST_BALANCE.villageQuestCooldown) return null;
    return {...fallback,id:`${village.id}-${playerId}-T${turn}`,eventId: fallback.ID,type:"delivery",label:fallback.名前,
      required:V39_QUEST_BALANCE.villageDeliveryAmount,accepted:true,createdTurn:turn,completed:false};
  }
  if(!eventId&&villageQuestTemplates().length)return villageQuestTemplates().map(row=>createQuest(state,village,playerId,turn,mapData,row.ID)).find(Boolean)||null;
  if(!eventId)return [...VILLAGE_EVENT_ROWS].sort((a,b)=>(b.進行形式==='討伐')-(a.進行形式==='討伐'))
    .map(row=>createQuest(state,village,playerId,turn,mapData,row.ID)).find(Boolean)||null;
  return null;
}

export function listV39NeutralVillageQuests(state,playerId,villageId,mapData) {
  const village=state.neutralVillages?.find(row=>row.id===villageId);
  if(village?.abandoned)return [];
  if(!village || (state.activeWorldId && state.activeWorldId!=="surface")) return [];
  const turn=Math.max(1,integer(state.timeline?.turnNumber,1));
  if(villageQuestTemplates().length)return villageQuestTemplates().map(row=>createQuest(state,village,playerId,turn,mapData,row.ID)).filter(Boolean);
  return [];
}

export function acceptV39NeutralVillageQuest(state, playerId, villageId, mapData = null, eventId = "", definition = null) {
  if (state.activeWorldId && state.activeWorldId!=="surface") return {ok:false,state,reason:"地上の一般村で依頼を受注してください"};
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  if(source?.abandoned)return {ok:false,state,reason:'廃村では依頼を受注できません'};
  if (!source) return { ok:false, reason:"一般村がありません", state };
  if (getV39VillageQuests(source,playerId).some(quest=>quest.accepted&&!quest.completed&&(!eventId||quest.eventId===eventId))) {
    return { ok:false, reason:"この依頼は既に受注しています", state };
  }
  const turn = Math.max(1, integer(state?.timeline?.turnNumber, 1));
  let quest = createQuest(state, source, playerId, turn, mapData,eventId,definition);
  if (!quest) return { ok:false, reason:"現在受注できる依頼がありません", state };
  const frozen=freezeV39QuestReward(state,source,playerId,quest);quest=frozen.quest;
  const village = { ...frozen.village, questsByPlayerId:{ ...(source.questsByPlayerId || {}), [playerId]:quest } };
  return { ok:true, state:updateVillageState(state, village), village, quest:village.questsByPlayerId[playerId], message:"依頼を受注しました" };
}

export function acceptAndSupportV39VillageDelivery(state,playerId,villageId,mapData=null,eventId=''){
  const accepted=acceptV39NeutralVillageQuest(state,playerId,villageId,mapData,eventId);
  if(!accepted.ok)return accepted;
  if(accepted.quest.type!=='delivery')return {ok:false,state,reason:'即時支援は物資依頼のみです'};
  const completed=completeV39NeutralVillageQuest(accepted.state,playerId,villageId);
  if(!completed.ok)return {...completed,state};
  if(!completed.village?.questsByPlayerId?.[playerId]?.completed)return {ok:false,state,reason:'即時支援には必要な物資を全て用意してください'};
  return {...completed,message:`受注して支援しました / ${completed.message}`};
}

export function completeV39NeutralVillageQuest(state, playerId, villageId, options = {}) {
  if (state.activeWorldId && state.activeWorldId!=="surface") return {ok:false,state,reason:"地上の一般村で依頼を報告してください"};
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  const quest = options.eventId?findV39VillageQuest(source,playerId,options.eventId):source?.questsByPlayerId?.[playerId];
  if (!source || !quest?.accepted || quest.completed) return { ok:false, reason:"受注中の依頼がありません", state };
  if(quest.dialogueEventId&&!options.fromDialogue)return {ok:false,state,reason:'この依頼は番号付き会話から報告してください'};
  if(quest.deadlineTurn&&number(state.timeline?.turnNumber)>=quest.deadlineTurn)return {ok:false,state,reason:'依頼の期限が過ぎています'};
  let working = state;
  let delivered=0;
  if(quest.supportGoals){
    const check=inspectV39VillageSupportQuest(quest,source,number(state.timeline?.turnNumber));
    if(!check.ready)return {ok:false,state,reason:check.description};
  }
  if(quest.type==='contract'){
    const turn=number(state.timeline?.turnNumber);
    if(turn<quest.nextDueTurn)return {ok:false,state,reason:`次の納品はT${quest.nextDueTurn}です`};
    if(turn>quest.nextDueTurn+quest.grace){
      const village={...source,questsByPlayerId:{...source.questsByPlayerId,[playerId]:{...quest,nextDueTurn:turn+quest.period}}};
      return {ok:true,state:updateVillageState(state,village),message:`定期納品を再開。次の納品はT${turn+quest.period}です（物資消費なし）`};
    }
    const payment=changeSettlementResource(state,playerId,quest.stockKind,-quest.amountPerPeriod,quest.resourceKey);
    if(!payment.ok)return payment;
    working=payment.state;
    const field=quest.stockKind==='food'?'foodStockByType':'materialStockByType';
    const village={...source,[field]:{...source[field],[quest.resourceKey]:number(source[field]?.[quest.resourceKey])+quest.amountPerPeriod}};
    working=updateVillageState(working,village);
    if(number(quest.progress)+1<quest.required){
      const next={...quest,progress:number(quest.progress)+1,nextDueTurn:turn+quest.period};
      return {ok:true,state:updateVillageState(working,{...village,questsByPlayerId:{...village.questsByPlayerId,[playerId]:next}}),message:`定期納品 ${next.progress}/${quest.required}回 / 次回T${next.nextDueTurn}`};
    }
  }
  if (quest.type === "hunt") {
    const livingTargetIds = new Set((state?.enemies || [])
      .filter(enemy => number(enemy?.currentHp ?? enemy?.hp) > 0 && text(enemy?.state) !== "死亡")
      .map(enemy => text(enemy?.id)));
    const remaining = (quest.targetEnemyIds || []).filter(id => livingTargetIds.has(text(id)));
    if (remaining.length) return { ok:false, reason:`討伐対象が残っています (${remaining.length}/${quest.required})`, state };
  } else if(quest.supportGoals||quest.type==='contract') {
    // Saved component goals and scheduled payment were checked above.
  } else if(['watch','construction'].includes(quest.type)) {
    const progress=quest.type==='construction'?villageSupportFacilities(state.players.find(row=>row.id===playerId),source).filter(key=>!quest.baselineFacilities?.includes(key)).length:number(quest.progress);
    if(progress<quest.required)return {ok:false,state,reason:`${quest.label}: ${progress}/${quest.required}`};
  } else {
    const remaining=Math.max(0,number(quest.required)-number(quest.progress));
    const partial=quest.eventDefinition?.目標?.[0]?.設定?.部分納品===true;
    const settlement=getSelectedSettlement(state.players.find(player=>player.id===playerId)?.factionState);
    const field=quest.stockKind==='food'?'foodStockByType':'materialStockByType';
    delivered=partial?Math.min(remaining,number(settlement?.[field]?.[quest.resourceKey])):remaining;
    if(delivered<=0&&remaining>0)return {ok:false,state,reason:`${quest.resourceKey}が不足しています`};
    const payment = changeSettlementResource(state, playerId, quest.stockKind, -delivered, quest.resourceKey);
    if (!payment.ok) return payment;
    working = payment.state;
    if(delivered<remaining) {
      const village={...source,[field]:{...source[field],[quest.resourceKey]:number(source[field]?.[quest.resourceKey])+delivered},
        questsByPlayerId:{...source.questsByPlayerId,[playerId]:{...quest,progress:number(quest.progress)+delivered}}};
      return {ok:true,state:updateVillageState(working,village),village,message:`部分納品 ${number(quest.progress)+delivered}/${quest.required}（報酬は完了時）`};
    }
  }
  const row = quest.eventDefinition || VILLAGE_EVENT_ROWS.find(item => text(item?.ID) === text(quest.eventId)) || null;
  if(quest.rewardTerms){const payment=payV39QuestReward(working,playerId,villageId,quest.rewardTerms);if(!payment.ok)return {...payment,state};working=payment.state;}
  if (!quest.rewardTerms && !row && quest.rewardResourceKey && quest.rewardAmount > 0) {
    const reward = changeSettlementResource(working, playerId, quest.rewardStockKind, quest.rewardAmount, quest.rewardResourceKey);
    if (!reward.ok) return reward;
    working = reward.state;
  }
  const relationGain = row ? relationGainFromEvent(row) : ['watch','construction'].includes(quest.type)?expeditionDefaults.village.関係値報酬:V39_QUEST_BALANCE.villageRelationGain;
  if(row) {
    const effectResult=applyV39EventEffects(working,row.完了効果,{
      一般村友好度変更:(current,setting)=>({ok:true,state:updateVillageState(current,changeRelation(current.neutralVillages.find(v=>v.id===villageId),playerId,number(setting.値)))}),
      村産出資源受取:current=>!quest.rewardTerms&&quest.rewardResourceKey&&quest.rewardAmount>0?changeSettlementResource(current,playerId,quest.rewardStockKind,quest.rewardAmount,quest.rewardResourceKey):{ok:true,state:current},
      魂要求権付与:(current,setting)=>{const v=current.neutralVillages.find(row=>row.id===villageId);
        if(quest.rewardTerms)return {ok:true,state:current};
        return {ok:true,state:updateVillageState(current,{...v,soulClaimsByPlayerId:{...v.soulClaimsByPlayerId,[playerId]:number(v.soulClaimsByPlayerId?.[playerId])+number(setting.数量)}})};}
    });
    if(!effectResult.ok)return {...effectResult,state};
    working=effectResult.state;
  }
  const completedTurn = integer(state?.timeline?.turnNumber, 1);
  let village = row?working.neutralVillages.find(v=>v.id===villageId):changeRelation(working.neutralVillages.find(v=>v.id===villageId), playerId, relationGain);
  if(quest.type==='delivery'){
    const field=quest.stockKind==='food'?'foodStockByType':'materialStockByType';
    village={...village,[field]:{...village[field],[quest.resourceKey]:number(village[field]?.[quest.resourceKey])+delivered}};
  }
  village = {
    ...village,
    eventCompletedTurnByPlayerId:{
      ...(village.eventCompletedTurnByPlayerId || {}),
      [playerId]:{ ...(village.eventCompletedTurnByPlayerId?.[playerId] || {}), [text(quest.eventId)]:completedTurn }
    },
    questsByPlayerId:{ ...village.questsByPlayerId, [playerId]:{ ...quest, progress:quest.required,completed:true, completedTurn } }
  };
  const rewardText = quest.rewardTerms?` / 報酬 ${describeV39QuestReward(quest.rewardTerms)}`:quest.rewardResourceKey && quest.rewardAmount > 0 ? ` / 謝礼 ${quest.rewardResourceKey} ${quest.rewardAmount}` : "";
  return { ok:true, state:updateVillageState(working, village), village, message:`依頼完了 / 関係 +${relationGain}${rewardText}` };
}

export function vassalizeV39NeutralVillage(state, playerId, villageId) {
  const source = state?.neutralVillages?.find(row => row.id === villageId);
  if(source?.abandoned)return {ok:false,state,reason:'廃村には再入植してください'};
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
  if(source?.abandoned)return {ok:false,state,reason:'廃村からは略奪できません'};
  const player = state?.players?.find(row => row.id === playerId);
  const unit = player?.factionState?.units?.find(row => row.id === player?.factionState?.selectedUnitId);
  if (!source || !unit) return { ok:false, reason:"襲撃するユニットを選択してください", state };
  if (!(source.territoryTileKeys || []).includes(keyOf(unit.x, unit.y))) return { ok:false, reason:"村の範囲内にユニットがいません", state };
  if(state.activePlayerId!==playerId||state.timeline?.phase!=='player'||(state.activeWorldId||'surface')!=='surface'||(unit.worldId||'surface')!=='surface'||number(unit.hp??unit.currentHp)<=0)return {ok:false,state,reason:'地上の操作中ユニットで襲撃してください'};
  if(isV39VillageHostileToPlayer(source,playerId))return {ok:false,state,reason:'この村とは既に敵対しています'};
  const hostilePlayerIds=[...new Set([...(source.hostilePlayerIds||[]),playerId])];
  const village={...changeRelation(source,playerId,-V39_NEUTRAL_VILLAGE_BALANCE.raidRelationLoss),hostilePlayerIds,
    lastPlayerRaid:{turn:integer(state.timeline.turnNumber,1),playerId,started:true}};
  village.relationsByPlayerId={...village.relationsByPlayerId,[playerId]:Math.min(-60,village.relationsByPlayerId[playerId])};
  return {ok:true,success:true,state:updateVillageState(state,village),village,message:`${village.name}と敵対しました。守備隊との戦闘を開始します。`};

}

function syncNeutralVillageDefensesForState(state, mapData, rows) {
  const villages = Array.isArray(rows) ? rows : [];
  const occupied = new Set();
  const add = row => {
    if (!row || !Number.isFinite(Number(row?.x)) || !Number.isFinite(Number(row?.y))) return;
    occupied.add(keyOf(row.x, row.y));
  };

  for (const player of state?.players || []) for (const unit of player?.factionState?.units || []) add(unit);
  for (const enemy of state?.enemies || []) add(enemy);
  for (const wanderer of state?.wandererGroups || []) add(wanderer);
  for (const nest of state?.enemyNests || []) add(nest);
  for (const settlement of state?.settlements || []) if (settlement?.neutral !== true) add(settlement);
  for (const village of villages) add(village);

  const normalized = [];
  for (const source of villages) {
    const village = normalizeV39NeutralVillage(source, mapData, { occupiedTileKeys:occupied });
    normalized.push(village);
    for (const unit of village.defenseUnits || []) add(unit);
  }
  return normalized;
}

export function advanceV39NeutralVillages(state, mapData, turnNumber) {
  let working = { ...state };
  const reports = [];
  const turn = Math.max(1, integer(turnNumber, state?.timeline?.turnNumber || 1));
  let villages = syncNeutralVillageDefensesForState(state, mapData, state?.neutralVillages || []);
  for (let index = 0; index < villages.length; index += 1) {
    let village = villages[index];
    if(village.abandoned)continue;
    if (integer(village.lastProcessedTurn) >= turn) continue;
    village = advanceVillageDefenseTraining(village, {...working, neutralVillages:villages}, mapData, turn, reports);
    const planned=advanceV39VillagePlans({...working,neutralVillages:villages},village,mapData,turn);
    working=planned.state;village=planned.village;
    const resources=advanceV39VillageResourceTeams({...working,neutralVillages:villages},village,mapData,turn);
    working=resources.state;village=resources.village;reports.push(...resources.reports);
    for(const item of planned.completed||[])reports.push({type:'village-construction-completed',villageId:village.id,villageName:village.name,facilityName:item.facilityName,tileKey:item.tileKey,turn});
    const playerIds=[...new Set([...Object.keys(village.questsByPlayerId||{}),...Object.keys(village.questLogByPlayerId||{})])];
    for(const playerId of playerIds)for(const quest of getV39VillageQuests(village,playerId)){
      const saveQuest=next=>{village=syncV39VillageQuestLog({...village,questsByPlayerId:{...village.questsByPlayerId,[playerId]:next}});};
      if(quest.accepted&&!quest.completed&&quest.deadlineTurn&&turn>=quest.deadlineTurn) {
        saveQuest({...quest,completed:true,failed:true,completedTurn:turn});
        const loss=(quest.eventDefinition?.失敗効果||[]).filter(effect=>effect.タイプ==='一般村友好度変更').reduce((sum,effect)=>sum+number(effect.設定?.値),0);
        village=changeRelation(village,playerId,loss);
        village={...village,eventCompletedTurnByPlayerId:{...village.eventCompletedTurnByPlayerId,[playerId]:{...village.eventCompletedTurnByPlayerId?.[playerId],[quest.eventId]:turn}}};
        reports.push({type:'quest-expired',villageId:village.id,playerId});continue;
      }
      if(quest.accepted&&!quest.completed&&quest.supportGoals&&quest.createdTurn<turn){saveQuest(advanceV39VillageSupportQuest(quest,{...working,neutralVillages:villages},village,playerId,turn));continue;}
      if(!quest.accepted||quest.completed||!['watch','construction'].includes(quest.type)||quest.createdTurn>=turn||quest.lastProgressTurn>=turn)continue;
      const player=state.players.find(row=>row.id===playerId);
      const present=player?.factionState.units.some(unit=>number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡'&&(!unit.worldId||unit.worldId==='surface')&&getHexDistance(unit,village)<=expeditionDefaults.village.防衛範囲);
      const progress=quest.type==='construction'?villageSupportFacilities(player,village).filter(key=>!quest.baselineFacilities?.includes(key)).length:number(quest.progress)+(present?1:0);
      saveQuest({...quest,progress:Math.min(quest.required,progress),lastProgressTurn:turn});
    }
    village=syncV39VillageQuestLog(village);
    if (village.vassalPlayerId) {
      const tribute = Math.max(1, Math.floor(number(village.population) * 0.02 * V39_NEUTRAL_VILLAGE_BALANCE.vassalTributeRate));
      const paid = changeSettlementResource(working, village.vassalPlayerId, "food", tribute);
      if (paid.ok) working = paid.state;
      village = { ...village, lastTribute:{ turn, amount:tribute, resourceName:paid.resourceName || "穀物" } };
      reports.push({ type:"tribute", villageId:village.id, playerId:village.vassalPlayerId, amount:tribute });
    }
    const raidRoll = hash(`${village.id}:raid:T${turn}`) % 10000;
    if (!village.vassalPlayerId && raidRoll < V39_NEUTRAL_VILLAGE_BALANCE.raidChancePerTurn * 10000) {
      const defense = village.defenseUnits.filter(livingDefenseUnit).reduce((sum, row) => sum + number(row.strength), 0);
      const raidStrength = 30 + (hash(`${village.id}:raid-strength:T${turn}`) % 100);
      const defended = defense >= raidStrength;
      const populationLoss = defended ? 0 : Math.max(1, Math.floor(number(village.population) * V39_NEUTRAL_VILLAGE_BALANCE.raidPopulationLossRate));
      village = { ...village, population:Math.max(1, integer(village.population)-populationLoss), raidState:{ turn, active:false, defended, raidStrength, populationLoss } };
      reports.push({ type:"raid", villageId:village.id, defended, populationLoss });
    }
    villages[index] = { ...village, researchExp:Math.max(0, number(village.researchExp)) + 10, lastProcessedTurn:turn };
  }
  villages = syncNeutralVillageDefensesForState({ ...working, neutralVillages:villages }, mapData, villages);
  const byId = new Map(villages.map(row => [row.id, row]));
  return {
    state:{ ...working, neutralVillages:villages, settlements:(working.settlements || []).map(row => byId.get(row.id) || row) },
    reports
  };
}

function villageSupportFacilities(player,village) {
  return (player?.factionState.settlements || []).filter(row=>row.placed&&getHexDistance(row,village)<=expeditionDefaults.village.建設支援範囲)
    .flatMap(row=>Object.entries(row.tileFacilityMap || {}).flatMap(([tile,names])=>(Array.isArray(names)?names:[]).map(name=>`${row.settlementId||row.id}:${tile}:${name}`)));
}
