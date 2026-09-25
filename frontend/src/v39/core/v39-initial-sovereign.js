import { classData, raceData } from "../../lib/game-data-registry.js";
import { createPlayerFactionState } from "../../lib/player-state.js";
import {
  createV39EquipmentEntry,
  DEFAULT_V39_EQUIPMENT_RARITY_KEY
} from "../../lib/v39-equipment-rules.js";
import {
  resolveV39UnitRaceCategory,
  resolveV39UnitTotalExpForLevel
} from "../../lib/v39-unit-experience.js";
import { EQUIPMENT_SLOT_KEYS } from "../../constants/unitCommon.js";
import { applyV39DerivedCharacterData } from "../unit/v39-character-derived-rules.js";
import { isSovereignUnit } from "../../composables/unitCoreUtils.js";

const INITIAL_LEVEL_MIN = 5;
const INITIAL_LEVEL_MAX = 10;
const text = value => String(value ?? "").trim();
const classRows = Array.isArray(classData) ? classData : [];
const classByName = new Map(classRows.map(row => [text(row?.名前), row]).filter(([name]) => name));
const raceByKey = new Map((Array.isArray(raceData) ? raceData : []).map(row => [text(row?.key), row]).filter(([key]) => key));

function isInitialUnlockedClass(row) {
  if (!row) return false;
  const conditionLv = text(row?.条件Lv);
  if (conditionLv && !["初期", "0", "-", "なし"].includes(conditionLv)) return false;
  for (let index = 1; index <= 4; index += 1) {
    if (text(row?.[`条件_${index}`])) return false;
    const level = Number(row?.[`Lv_${index}`]);
    if (Number.isFinite(level) && level > 0) return false;
  }
  return true;
}

export function getV39InitialSovereignClassCandidates(race) {
  const raceDefinition = raceByKey.get(text(race));
  if (!raceDefinition) return [];
  const raceClassName = text(raceDefinition.className);
  return classRows.filter(row => {
    if (text(row?.名前) === raceClassName && text(row?.種類) !== "人族") return true;
    return text(row?.種類) === "職業" && isInitialUnlockedClass(row);
  });
}

function resolveAllowedClass(race, className) {
  return getV39InitialSovereignClassCandidates(race)
    .find(row => text(row?.名前) === text(className)) || null;
}

function equipmentSlotEnabled(value) {
  const valueText = text(value).toLowerCase();
  return !(valueText.includes("×") || valueText === "x" || valueText.includes("不可"));
}

function buildInitialEquipment(classRow) {
  return EQUIPMENT_SLOT_KEYS
    .filter(slot => equipmentSlotEnabled(classRow?.[slot]))
    .map(slot => createV39EquipmentEntry(classRow?.[slot], DEFAULT_V39_EQUIPMENT_RARITY_KEY, slot))
    .filter(Boolean);
}

function buildEquipmentSlots(classRow) {
  return Object.fromEntries(EQUIPMENT_SLOT_KEYS.map(slot => [slot, equipmentSlotEnabled(classRow?.[slot])]));
}

function randomInitialLevel() {
  return INITIAL_LEVEL_MIN + Math.floor(Math.random() * (INITIAL_LEVEL_MAX - INITIAL_LEVEL_MIN + 1));
}

function uniqueUnitId(playerId) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid ? `sovereign-${playerId}-${uuid}` : `sovereign-${playerId}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

export function createV39InitialSovereign(profile = {}) {
  const playerId = text(profile.playerId);
  const race = text(profile.race);
  const className = text(profile.className);
  const name = text(profile.characterName).slice(0, 20);
  const classRow = resolveAllowedClass(race, className);
  const raceDefinition = raceByKey.get(race);
  if (!playerId || !raceDefinition) return { ok:false, reason:"開始種族が不正です。" };
  if (!classRow) return { ok:false, reason:"開始時に選択できないクラスです。" };
  if (!name) return { ok:false, reason:"統治者名を入力してください。" };

  const level = randomInitialLevel();
  const base = {
    id:uniqueUnitId(playerId),
    unitType:"統治者",
    name,
    isSovereign:true,
    isNamed:true,
    race,
    className,
    level,
    x:null,
    y:null,
    settlementId:"",
    initialSettlementSlot:0,
    iconName:text(classRow?.画像ID || raceDefinition?.name || race),
    iconSrc:text(raceDefinition?.icon),
    equipmentSlots:buildEquipmentSlots(classRow),
    equipment:buildInitialEquipment(classRow),
    maxAp:100,
    ap:100,
    currentAp:100,
    actionPoint:100,
    maxActionPoint:100,
    actionPointMax:100,
    moveRemaining:100,
    scoutRange:4,
    squadCount:0,
    squads:[],
    squadLeaderId:"",
    squadId:"",
    squadName:"",
    state:"生存"
  };
  const derived = applyV39DerivedCharacterData(base);
  const maxHp = Math.max(1, Math.floor(Number(derived?.maxHp ?? derived?.status?.HP) || 1));
  const category = resolveV39UnitRaceCategory(derived);
  const totalExp = resolveV39UnitTotalExpForLevel(level, category);
  return {
    ok:true,
    unit:{
      ...derived,
      maxHp,
      hp:maxHp,
      currentHp:maxHp,
      exp:0,
      totalExp,
      expPeakLevel:level,
      status:{ ...(derived?.status || {}), exp:0, totalExp }
    }
  };
}

export function applyV39InitialSovereignProfile(state, profile = {}) {
  const playerId = text(profile.playerId);
  const race = text(profile.race);
  const villageName = text(profile.villageName).slice(0, 20) || "はじまりの村";
  const players = Array.isArray(state?.players) ? state.players : [];
  const target = players.find(player => text(player?.id) === playerId);
  if (!target) return { ok:false, reason:"担当勢力が見つかりません。", state };
  if (text(target.race) !== race) return { ok:false, reason:"ロビーで選択した開始種族と一致しません。", state };
  if ((target?.factionState?.units || []).some(unit => isSovereignUnit(unit))) {
    return { ok:false, reason:"この勢力の統治者は作成済みです。", state };
  }
  const created = createV39InitialSovereign(profile);
  if (!created.ok) return { ...created, state };
  const factionState = createPlayerFactionState({
    ...target.factionState,
    units:[created.unit],
    selectedUnitId:created.unit.id,
    villagePlacementMode:true,
    nationLogKey:created.unit.id,
    initialSettlementCount:1,
    initialSettlementPlans:[{ name:villageName }]
  }, playerId);
  return {
    ok:true,
    unit:created.unit,
    state:{
      ...state,
      players:players.map(player => text(player?.id) === playerId ? { ...player, factionState } : player)
    }
  };
}

export function getV39InitialSetupProgress(state) {
  const players = Array.isArray(state?.players) ? state.players : [];
  return players.map(player => {
    const faction = player?.factionState || {};
    const sovereignReady = (Array.isArray(faction.units) ? faction.units : []).some(unit => isSovereignUnit(unit));
    const settlementReady = (Array.isArray(faction.settlements) ? faction.settlements : []).some(row => row?.placed === true);
    return {
      playerId:text(player?.id),
      sovereignReady,
      settlementReady,
      complete:sovereignReady && settlementReady && faction.villagePlacementMode !== true
    };
  });
}

export function isV39InitialSetupComplete(state) {
  const progress = getV39InitialSetupProgress(state);
  return progress.length > 0 && progress.every(row => row.complete);
}
