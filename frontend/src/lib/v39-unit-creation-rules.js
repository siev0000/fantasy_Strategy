import { getGameDataRows } from "./game-data-registry.js";
import { resolveCurrentResearchLevel } from "./research-progress.js";
import { normalizeV39Village, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "./v39-economy-rules.js";
import { resolveUnitCreateModeCatalog, resolveUnitCreateMode } from "../composables/militaryUnitUtils.js";
import { applyV39DerivedCharacterData } from "../v39/unit/v39-character-derived-rules.js";
import { EQUIPMENT_SLOT_KEYS } from "../constants/unitCommon.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";
import { isV39BaseClassRow } from "./v39-class-rules.js";
import { resolveV39UnitInitialLevel, resolveV39UnitRaceCategory, resolveV39UnitLevelCap } from "./v39-unit-experience.js";
import {V39_RECRUIT_TRAINING_BALANCE} from "./v39-gameplay-balance.js";
import { getV39FacilityRecruitmentClasses, inspectV39FacilityRecruitment, resolveV39FacilityRecruitmentGrowth } from "./v39-facility-recruitment.js";
import {inspectV39RecruitTraining} from "./v39-recruit-training.js";
import {getV39ToolLoadout,getV39ConsumableDefinitions,resolveV39ToolSlots} from "./v39-consumables.js";
import {getV39CountryBonuses} from './v39-country-bonuses.js';
import {resolveV39CitySpecializationModifiers} from './v39-city-specialization-rules.js';

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function getV39UnitCreationCost(count = 1) {
  const row = getGameDataRows("消費量").find(item => text(item?.種別) === "ユニット作成" && number(item?.Lv, 1) === 1) || {};
  const resourceKeys = [...FOOD_RESOURCE_KEYS, ...MATERIAL_RESOURCE_KEYS];
  const multiplier = Math.max(1, Math.floor(number(count, 1)));
  return Object.fromEntries(resourceKeys
    .map(key => [key, Math.max(0, number(row?.[key])) * multiplier])
    .filter(([, value]) => value > 0));
}

export function getV39InitialJobClasses() {
  return getGameDataRows("クラス").filter(isV39BaseClassRow);
}

function factionRow(race) {
  const target = text(race);
  return getGameDataRows("勢力").find(row => [row?.種族, row?.カナ,...(row?.旧名称||[])].some(value => text(value) === target)) || null;
}

function limitFromValue(value, population, fallback) {
  const raw = number(value, fallback);
  if (raw > 0 && raw < 1) return Math.max(1, Math.floor(population * raw));
  return Math.max(0, Math.floor(raw));
}

function trainingLevelLimits(race, recruitment) {
  const growth = recruitment?.initialGrowth;
  if (growth) return {min:Math.max(V39_RECRUIT_TRAINING_BALANCE.minimumTrainingLevel,growth.level),
    max:resolveV39UnitLevelCap({race,prerequisiteClassLevels:growth.prerequisiteClassLevels,
      classGrowthStart:{level:growth.level,raceLevels:growth.initialRaceLevel,classLevels:growth.initialClassLevel}})};
  const isHuman = resolveV39UnitRaceCategory({race}) === "human";
  return {min:V39_RECRUIT_TRAINING_BALANCE.minimumTrainingLevel,
    max:V39_RECRUIT_TRAINING_BALANCE.maximumBasicClassLevel * (isHuman ? 1 : 2)};
}

export function inspectV39UnitCreation(state, player, request = {}) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const mode = resolveUnitCreateMode(request.mode || "army", Math.max(
    number(village?.cityLevels?.軍事Lv),
    resolveCurrentResearchLevel(player?.factionState?.research, "軍事")
  ));
  const recruitment = inspectV39FacilityRecruitment(player, request.className, state);
  const classRow = getV39InitialJobClasses().find(row => text(row?.名前) === text(request.className)) || recruitment?.row;
  const count = Math.max(1, Math.min(20, Math.floor(number(request.count, 1))));
  const race = text(request.race || player?.race);
  if (recruitment) recruitment.initialGrowth = resolveV39FacilityRecruitmentGrowth(recruitment,race);
  const reasons = [];
  if (!village?.placed) reasons.push("拠点未配置");
  if (!classRow) reasons.push("初期職業を選択してください");
  if (number(village?.populationByRace?.[race]) <= 0) reasons.push(`${race}の人口がいません`);
  const militaryLevel = Math.max(number(village?.cityLevels?.軍事Lv), resolveCurrentResearchLevel(player?.factionState?.research, "軍事"));
  if (militaryLevel < mode.requiredMilitaryLevel) reasons.push(`軍事Lv${mode.requiredMilitaryLevel}が必要`);
  const units = [...(player?.factionState?.units || []), ...(player?.factionState?.unitTrainingQueue || []).map(entry => entry.unit)];
  const isArmy = mode.mode !== "normal";
  if (recruitment) {
    reasons.push(...recruitment.reasons);
    if (!isArmy) reasons.push("施設の上位クラス徴兵は軍隊のみです");
  }
  const current = units.filter(unit => isArmy ? text(unit?.unitType).includes("軍隊") : text(unit?.unitType) === "ヒーロー").length;
  const population = Math.max(0, Math.floor(number(village?.population)));
  const row = factionRow(player?.race);
  const cap = isArmy ? Math.max(0,limitFromValue(row?.軍隊, population, Math.floor(population / 10))+Math.floor(resolveV39CitySpecializationModifiers(village).armyLimit))
    : Math.max(0,limitFromValue(row?.ヒーロー, population, 1)+getV39CountryBonuses(player).heroLimit+Math.floor(resolveV39CitySpecializationModifiers(village).heroLimit));
  if (current + count > cap) reasons.push(`${mode.unitTypeLabel}上限 ${current}/${cap}`);
  const populationCost = mode.populationCost * count;
  if (number(village?.populationByRace?.[race]) <= populationCost) reasons.push(`人口不足 必要${populationCost}人`);
  if (!isArmy && number(village?.heroBirthUnlock) < count) reasons.push(`英雄誕生枠不足 ${number(village?.heroBirthUnlock)}/${count}`);
  const cost = getV39UnitCreationCost(count);
  for (const [key, value] of Object.entries(cost)) {
    const bag = FOOD_RESOURCE_KEYS.includes(key) ? village?.foodStockByType : village?.materialStockByType;
    if (number(bag?.[key]) < value) reasons.push(`${key}不足`);
  }
  const levelLimits = trainingLevelLimits(race,recruitment);
  const defaultLevel = recruitment?.initialGrowth.level ?? resolveV39UnitInitialLevel(race, isArmy);
  const hasTrainingLevel = request.trainingLevel !== undefined && request.trainingLevel !== null && request.trainingLevel !== "";
  const requestedLevel = hasTrainingLevel ? Number(request.trainingLevel) : defaultLevel;
  if (!Number.isInteger(requestedLevel) || requestedLevel < levelLimits.min || requestedLevel > levelLimits.max) {
    reasons.push(`訓練Lvは${levelLimits.min}〜${levelLimits.max}で指定してください`);
  }
  const initialLevel = Math.max(levelLimits.min,Math.min(levelLimits.max,Math.floor(number(requestedLevel,defaultLevel))));
  return { available:reasons.length === 0, reasons, village, mode, classRow, race, count, current, cap, populationCost, cost, militaryLevel, recruitment, initialLevel, levelLimits };
}

function nextUnitName(units, race, classRow, isArmy) {
  const classLabel = text(classRow?.ルビ) || text(classRow?.名前);
  const prefix = `${race}${classLabel}${isArmy ? "軍" : ""}`;
  const used = new Set((units || []).map(unit => text(unit?.name)));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export function buildV39ClassEquipment(classRow = {}) {
  return EQUIPMENT_SLOT_KEYS.map(slot => ({ slot, name:text(classRow?.[slot]) }))
    .filter(row => row.name && row.name !== "×" && row.name !== "0" && row.name !== "-");
}

export function buildV39UnitEntity({
  id,
  name,
  race,
  className,
  level = 1,
  unitType = "ヒーロー",
  isMob = false,
  isNamed = !isMob,
  role = "",
  squadId = "solo",
  x = null,
  y = null,
  combatProfile = null,
  settlementId = "",
  equipment = [],
  prerequisiteClassLevels = {},
  classGrowthStart = null
} = {}) {
  const unit = applyV39DerivedCharacterData({
    id:text(id),
    name:text(name),
    race:text(race),
    className:text(className),
    level:Math.max(1, Math.floor(number(level, 1))),
    unitType:text(unitType),
    isMob:isMob === true,
    isNamed:isNamed === true,
    role:text(role),
    squadId:text(squadId) || "solo",
    x:Number.isFinite(Number(x)) ? Math.floor(Number(x)) : null,
    y:Number.isFinite(Number(y)) ? Math.floor(Number(y)) : null,
    position:Number.isFinite(Number(x)) && Number.isFinite(Number(y))
      ? [Math.floor(Number(x)), Math.floor(Number(y))]
      : null,
    combatProfile:combatProfile && typeof combatProfile === "object" ? { ...combatProfile } : null,
    settlementId:text(settlementId),
    prerequisiteClassLevels:{...prerequisiteClassLevels},
    ...(classGrowthStart ? {classGrowthStart:{...classGrowthStart}} : {}),
    equipment:Array.isArray(equipment) ? equipment.map(row => ({ ...row })) : []
  });
  const maxHp = Math.max(1, number(unit.maxHp, number(unit?.status?.HP, 1)));
  return {
    ...unit,
    hp:maxHp,
    currentHp:maxHp,
    maxHp,
    ap:100,
    currentAp:100,
    maxAp:100,
    state:"生存"
  };
}

function createUnit(player, check, name, index) {
  const village = check.village;
  return buildV39UnitEntity({
    id:`unit-${player.id}-${Date.now()}-${index}`,
    name,
    race:check.race,
    className:text(check.classRow.名前),
    level:check.initialLevel,
    prerequisiteClassLevels:check.recruitment?.initialGrowth.prerequisiteClassLevels,
    classGrowthStart:check.recruitment ? {
      level:check.recruitment.initialGrowth.level,
      raceLevels:check.recruitment.initialGrowth.initialRaceLevel,
      classLevels:check.recruitment.initialGrowth.initialClassLevel
    } : null,
    unitType:check.mode.unitTypeLabel,
    isMob:check.mode.mode !== "normal",
    isNamed:check.mode.mode === "normal",
    role:`メンバー / ${check.mode.unitTypeLabel}`,
    squadId:"solo",
    x:village.x,
    y:village.y,
    combatProfile:check.mode,
    settlementId:text(village.settlementId || village.id),
    equipment:buildV39ClassEquipment(check.classRow)
  });
}

export function buildV39UnitCreationPreview(check) {
  return createUnit({id:"preview"}, check, "作成予定", 0);
}

export function createV39Units(state, playerId, request = {}) {
  const player = state?.players?.find(row => row.id === playerId);
  if (!player) return { ok:false, reason:"プレイヤーが見つかりません", state };
  const check = inspectV39UnitCreation(state, player, request);
  if (!check.available) return { ok:false, reason:check.reasons.join(" / "), state, check };
  const village = check.village;
  const foodStockByType = { ...village.foodStockByType };
  const materialStockByType = { ...village.materialStockByType };
  for (const [key, value] of Object.entries(check.cost)) {
    const bag = FOOD_RESOURCE_KEYS.includes(key) ? foodStockByType : materialStockByType;
    bag[key] = Math.max(0, number(bag[key]) - value);
  }
  const populationByRace = { ...village.populationByRace, [check.race]:number(village.populationByRace?.[check.race]) - check.populationCost };
  const nextVillage = normalizeV39Village({
    ...village, foodStockByType, materialStockByType, populationByRace,
    heroBirthUnlock:check.mode.mode === "normal" ? number(village.heroBirthUnlock) - check.count : number(village.heroBirthUnlock)
  }, player.race);
  const existing = player.factionState.units || [];
  const pending = player.factionState.unitTrainingQueue || [];
  const createdUnits = [];
  for (let index = 0; index < check.count; index += 1) {
    const name = nextUnitName([...existing, ...pending.map(entry => entry.unit), ...createdUnits], check.race, check.classRow, check.mode.mode !== "normal");
    const unit=createUnit(player,check,name,index);
    const loadout=request.defaultToolLoadout ?? getV39ToolLoadout(unit);
    const definitions=getV39ConsumableDefinitions();
    if(!Array.isArray(loadout)||loadout.length>resolveV39ToolSlots(unit)||new Set(loadout.map(row=>row.name)).size!==loadout.length
      ||loadout.some(row=>!definitions.some(item=>item.名前===row.name)||!Number.isInteger(row.count)||row.count<1||row.count>number(definitions.find(item=>item.名前===row.name)?.携帯上限)))
      return {ok:false,state,reason:'デフォルト携帯の道具枠・種類・個数を確認してください'};
    createdUnits.push({...unit,defaultToolLoadout:loadout.map(row=>({...row}))});
  }
  const factionState = replaceFactionSettlement({
    ...player.factionState,
    units:existing,
    unitTrainingQueue:[...pending, ...createdUnits.map(unit => ({
      id:unit.id, unit, settlementId:unit.settlementId,
      requiredExp:inspectV39RecruitTraining(player.factionState, village, unit).requiredExp,
      progressExp:0, lastProcessedTurn:number(state.timeline?.turnNumber, 1)
    }))]
  }, nextVillage, { ownerPlayerId:player.id });
  const players = state.players.map(row => row.id === player.id ? { ...row, factionState } : row);
  return { ok:true, state:{ ...state, players }, createdUnits:[], queuedUnits:createdUnits, check };
}

export function getV39UnitCreationOptions(player, state = {}) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const militaryLevel = Math.max(number(village?.cityLevels?.軍事Lv), resolveCurrentResearchLevel(player?.factionState?.research, "軍事"));
  return {
    races:Object.entries(village?.populationByRace || {}).filter(([, count]) => number(count) > 0).map(([race]) => race),
    classes:[...getV39InitialJobClasses(), ...getV39FacilityRecruitmentClasses()
      .filter(entry => inspectV39FacilityRecruitment(player,entry.className,state)?.available)
      .map(entry => ({...entry.row, recruitmentFacility:entry.facilityName}))],
    modes:resolveUnitCreateModeCatalog(),
    militaryLevel
  };
}
