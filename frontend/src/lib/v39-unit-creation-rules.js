import { getGameDataRows } from "./game-data-registry.js";
import { resolveCompletedResearchLevel } from "./research-progress.js";
import { normalizeV39Village, FOOD_RESOURCE_KEYS, MATERIAL_RESOURCE_KEYS } from "./v39-economy-rules.js";
import { resolveUnitCreateModeCatalog, resolveUnitCreateMode } from "../composables/militaryUnitUtils.js";
import { applyV39DerivedCharacterData } from "../v39-character-derived-rules.js";
import { EQUIPMENT_SLOT_KEYS } from "../constants/unitCommon.js";
import { getSelectedSettlement, replaceFactionSettlement } from "./settlement-state.js";

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
  return getGameDataRows("クラス").filter(row => text(row?.種類) === "職業" && text(row?.条件Lv) === "初期");
}

function factionRow(race) {
  const target = text(race);
  return getGameDataRows("勢力").find(row => [row?.種族, row?.カナ].some(value => text(value) === target))
    || (target === "只人" ? getGameDataRows("勢力").find(row => text(row?.種族) === "人間") : null);
}

function limitFromValue(value, population, fallback) {
  const raw = number(value, fallback);
  if (raw > 0 && raw < 1) return Math.max(1, Math.floor(population * raw));
  return Math.max(0, Math.floor(raw));
}

export function inspectV39UnitCreation(state, player, request = {}) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const mode = resolveUnitCreateMode(request.mode || "army", Math.max(
    number(village?.cityLevels?.軍事Lv),
    resolveCompletedResearchLevel(player?.factionState?.research, "軍事")
  ));
  const classRow = getV39InitialJobClasses().find(row => text(row?.名前) === text(request.className));
  const count = Math.max(1, Math.min(20, Math.floor(number(request.count, 1))));
  const race = text(request.race || player?.race);
  const reasons = [];
  if (!village?.placed) reasons.push("拠点未配置");
  if (!classRow) reasons.push("初期職業を選択してください");
  if (number(village?.populationByRace?.[race]) <= 0) reasons.push(`${race}の人口がいません`);
  const militaryLevel = Math.max(number(village?.cityLevels?.軍事Lv), resolveCompletedResearchLevel(player?.factionState?.research, "軍事"));
  if (militaryLevel < mode.requiredMilitaryLevel) reasons.push(`軍事Lv${mode.requiredMilitaryLevel}が必要`);
  const units = player?.factionState?.units || [];
  const isArmy = mode.mode !== "normal";
  const current = units.filter(unit => isArmy ? text(unit?.unitType).includes("軍隊") : text(unit?.unitType) === "ヒーロー").length;
  const population = Math.max(0, Math.floor(number(village?.population)));
  const row = factionRow(player?.race);
  const cap = isArmy ? limitFromValue(row?.軍隊, population, Math.floor(population / 10)) : limitFromValue(row?.ヒーロー, population, 1);
  if (current + count > cap) reasons.push(`${mode.unitTypeLabel}上限 ${current}/${cap}`);
  const populationCost = mode.populationCost * count;
  if (number(village?.populationByRace?.[race]) <= populationCost) reasons.push(`人口不足 必要${populationCost}人`);
  if (!isArmy && number(village?.heroBirthUnlock) < count) reasons.push(`英雄誕生枠不足 ${number(village?.heroBirthUnlock)}/${count}`);
  const cost = getV39UnitCreationCost(count);
  for (const [key, value] of Object.entries(cost)) {
    const bag = FOOD_RESOURCE_KEYS.includes(key) ? village?.foodStockByType : village?.materialStockByType;
    if (number(bag?.[key]) < value) reasons.push(`${key}不足`);
  }
  return { available:reasons.length === 0, reasons, village, mode, classRow, race, count, current, cap, populationCost, cost, militaryLevel };
}

function nextUnitName(units, race, className) {
  const prefix = `${race}${className}`;
  const used = new Set((units || []).map(unit => text(unit?.name)));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function createUnit(player, check, name, index) {
  const village = check.village;
  const equipment = EQUIPMENT_SLOT_KEYS.map(slot => ({ slot, name:text(check.classRow?.[slot]) }))
    .filter(row => row.name && row.name !== "×" && row.name !== "0" && row.name !== "-");
  const unit = applyV39DerivedCharacterData({
    id:`unit-${player.id}-${Date.now()}-${index}`,
    name,
    race:check.race,
    className:text(check.classRow.名前),
    level:1,
    unitType:check.mode.unitTypeLabel,
    isMob:check.mode.mode !== "normal",
    isNamed:check.mode.mode === "normal",
    role:`メンバー / ${check.mode.unitTypeLabel}`,
    squadId:"solo",
    x:village.x,
    y:village.y,
    position:[village.x, village.y],
    movement:4,
    combatProfile:{ ...check.mode },
    settlementId:text(village.settlementId || village.id),
    equipment
  });
  const maxHp = Math.max(1, number(unit.maxHp, number(unit?.status?.HP, 1)));
  return { ...unit, hp:maxHp, currentHp:maxHp, maxHp, ap:100, currentAp:100, maxAp:100, state:"生存" };
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
  const createdUnits = [];
  for (let index = 0; index < check.count; index += 1) {
    const name = nextUnitName([...existing, ...createdUnits], check.race, text(check.classRow.名前));
    createdUnits.push(createUnit(player, check, name, index));
  }
  const factionState = replaceFactionSettlement({
    ...player.factionState,
    units:[...existing, ...createdUnits],
    selectedUnitId:createdUnits[0].id
  }, nextVillage, { ownerPlayerId:player.id });
  const players = state.players.map(row => row.id === player.id ? { ...row, factionState } : row);
  return { ok:true, state:{ ...state, players }, createdUnits, check };
}

export function getV39UnitCreationOptions(player) {
  const village = normalizeV39Village(getSelectedSettlement(player?.factionState), player?.race);
  const militaryLevel = Math.max(number(village?.cityLevels?.軍事Lv), resolveCompletedResearchLevel(player?.factionState?.research, "軍事"));
  return {
    races:Object.entries(village?.populationByRace || {}).filter(([, count]) => number(count) > 0).map(([race]) => race),
    classes:getV39InitialJobClasses(),
    modes:resolveUnitCreateModeCatalog(),
    militaryLevel
  };
}
