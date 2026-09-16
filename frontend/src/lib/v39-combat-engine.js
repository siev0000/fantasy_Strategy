import { computeSkillScaledTriplet, resolveSkillBasePower, resolveSkillBaseState, toSafeNumber } from "./skill-power.js";
import { findGameDataRow } from "./game-data-registry.js";
import { COMBAT_STATUS_FIELDS, DAMAGE_TYPE_FIELDS, TIMED_EFFECT_FIELDS } from "../constants/unitCommon.js";

const NATURAL_COUNTER_METHODS = new Set(["素手", "角", "牙", "爪", "翼", "尾", "針"]);
const RANGED_WEAPON_NAMES = /弓|銃|砲|ボウ|ライフル|ピストル/;
const PASSIVE_STATUS_FIELDS = COMBAT_STATUS_FIELDS;
const PASSIVE_ATTACK_FIELDS = DAMAGE_TYPE_FIELDS;

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function resolveActionSkillRows(unit) {
  return (Array.isArray(unit?.techniques) ? unit.techniques : [])
    .map((technique) => technique?.source || technique)
    .filter((row) => text(row?.名前) && text(row?.行動).toUpperCase() === "A");
}

function passiveMatchesAttack(passive, skillRow, isCounter) {
  const requiredMethod = text(passive?.攻撃手段);
  if (requiredMethod && requiredMethod !== text(skillRow?.攻撃手段)) return false;
  const requiredSystem = text(passive?.条件系統);
  if (requiredSystem && text(skillRow?.系統) !== requiredSystem && number(skillRow?.[requiredSystem]) === 0) return false;
  const condition = text(passive?.条件);
  if (condition && condition !== "ガード時") return false;
  if (condition === "ガード時" && !isCounter) return false;
  return true;
}

export function applyV39PassiveCombatSkills(attacker, skillRow, { isCounter = false } = {}) {
  const passiveRows = (Array.isArray(attacker?.techniques) ? attacker.techniques : [])
    .map(technique => technique?.source || technique)
    .filter(row => text(row?.行動).toUpperCase() === "P" && passiveMatchesAttack(row, skillRow, isCounter));
  if (!passiveRows.length) return { attacker, skillRow, appliedPassiveSkillNames:[] };
  const status = { ...(attacker?.status || {}) };
  const adjustedSkill = { ...skillRow };
  for (const passive of passiveRows) {
    for (const field of PASSIVE_STATUS_FIELDS) status[field] = number(status[field]) + number(passive?.[field]);
    for (const field of PASSIVE_ATTACK_FIELDS) adjustedSkill[field] = number(adjustedSkill[field]) + number(passive?.[field]);
    adjustedSkill.ガード = number(adjustedSkill.ガード) + number(passive?.ガード);
  }
  return {
    attacker:{ ...attacker, status },
    skillRow:adjustedSkill,
    appliedPassiveSkillNames:passiveRows.map(row => text(row?.名前)).filter(Boolean)
  };
}

export function buildWeaponAttackRow(item) {
  const source = item?.source && typeof item.source === "object" ? item.source : {};
  const name = text(item?.name ?? item?.equipmentName ?? source?.装備名, "武器");
  const basePower = Math.max(0, number(item?.power, number(source?.威力, 0)));
  const attackAp = Math.abs(number(item?.attackAp, number(source?.攻撃AP, 0)));
  const magicAp = Math.abs(number(item?.magicAp, number(source?.魔法AP, 0)));
  const rawAp = attackAp > 0 ? attackAp : magicAp;
  const range = toSafeNumber(item?.range, toSafeNumber(source?.射程, null));
  const enchantAttack = item?.enchantAttackFields && typeof item.enchantAttackFields === "object" ? item.enchantAttackFields : {};
  return {
    名前:name,
    行動:"A",
    攻撃手段:"武器",
    判定:"攻撃",
    物理:basePower + number(enchantAttack.物理),
    魔法:number(enchantAttack.魔法),
    射撃:number(enchantAttack.射撃),
    炎:number(enchantAttack.炎),
    氷:number(enchantAttack.氷),
    雷:number(enchantAttack.雷),
    毒:number(enchantAttack.毒),
    光:number(enchantAttack.光),
    闇:number(enchantAttack.闇),
    AP消費:rawAp > 0 ? rawAp : 25,
    射程:range,
    範囲:null,
    炸裂:null,
    攻撃回数:1,
    アニメ:"",
    装備攻撃:true,
    装備スロット:text(item?.slot),
    装備元:item
  };
}

export function resolveAttackRows(unit) {
  const weapons = (Array.isArray(unit?.equipment) ? unit.equipment : [])
    .filter((item) => ["武器1", "武器2"].includes(text(item?.slot)))
    .map(buildWeaponAttackRow);
  return [...weapons, ...resolveActionSkillRows(unit)];
}

function isMeleeCounterRow(row, unit) {
  if (!row || resolveAttackRange(row, unit) > 1) return false;
  if (resolveAreaType(row) !== "single" || resolveSplashSpec(row).value > 0) return false;
  const method = text(row?.攻撃手段);
  if (method === "魔法" || number(row?.射撃, 0) > 0 || RANGED_WEAPON_NAMES.test(text(row?.名前))) return false;
  return row?.装備攻撃 === true || NATURAL_COUNTER_METHODS.has(method) || NATURAL_COUNTER_METHODS.has(text(row?.名前));
}

export function resolveCounterAttackRow(unit) {
  const candidates = resolveAttackRows(unit).filter((row) => isMeleeCounterRow(row, unit));
  const lastUsed = text(unit?.lastUsedAttack);
  const selected = candidates.find((row) => text(row?.名前) === lastUsed) || candidates[0] || null;
  if (!selected) return null;
  return {
    ...selected,
    名前:`${text(selected?.名前)}（反撃）`,
    AP消費:0,
    射程:1,
    範囲:null,
    炸裂:null,
    攻撃回数:1,
    待機:null,
    CT:null,
    効果時間:null,
    反撃:true
  };
}

export function canTriggerMeleeCounter(skillRow, attacker) {
  return isMeleeCounterRow(skillRow, attacker);
}

export function resolveAttackApCost(skillRow) {
  return Math.max(0, Math.floor(number(skillRow?.AP消費, 0)));
}

export function resolveSkillHealing(skillRow, attacker) {
  const base = Math.max(0, number(skillRow?.回復));
  if (!base) return 0;
  const bonus = Math.max(0, number(attacker?.status?.[text(skillRow?.追加威力)]));
  return Math.max(0, Math.round(base * (1 + bonus / 500)));
}

export function resolveSkillGuard(skillRow, attacker, options = {}) {
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, options);
  return Math.max(0, Math.floor(number(computeSkillScaledTriplet(adjusted.skillRow, adjusted.attacker?.status || {})?.guard)));
}

export function resolveSkillTimedModifiers(skillRow) {
  return Object.fromEntries(TIMED_EFFECT_FIELDS
    .map(key => [key, number(skillRow?.[key])])
    .filter(([, value]) => value !== 0));
}

export function applyV39ActiveCombatEffects(unit, effects) {
  const active = Array.isArray(effects) ? effects : [];
  if (!active.length) return unit;
  const status = { ...(unit?.status || {}) };
  const resistances = { ...(unit?.resistances || {}) };
  for (const effect of active) for (const [key, value] of Object.entries(effect?.modifiers || {})) {
    if (key.endsWith("耐性")) resistances[key] = number(resistances[key]) + number(value);
    else status[key] = number(status[key]) + number(value);
  }
  return { ...unit, status, resistances };
}

export function isV39SupportSkill(skillRow, attacker) {
  return resolveSkillHealing(skillRow, attacker) > 0
    || (resolveAttackPower(skillRow, attacker) <= 0
      && (Object.keys(resolveSkillTimedModifiers(skillRow)).length > 0 || resolveSkillGuard(skillRow, attacker) > 0));
}

export function applyV39GuardToDamage(target, damage) {
  let remaining = Math.max(0, Math.floor(number(target?.guard)));
  const guardBefore = remaining;
  const hitsBeforeGuard = Array.isArray(damage?.hits) ? damage.hits.map(value => Math.max(0, Math.floor(number(value)))) : [];
  const hits = hitsBeforeGuard.map(value => {
    const absorbed = Math.min(remaining, value);
    remaining -= absorbed;
    return value - absorbed;
  });
  return {
    ...damage,
    total:hits.reduce((sum, value) => sum + value, 0),
    hits,
    hitsBeforeGuard,
    guardBefore,
    guardAbsorbed:guardBefore - remaining,
    guardRemaining:remaining
  };
}

function primaryWeaponRow(unit) {
  const items = Array.isArray(unit?.equipment) ? unit.equipment : [];
  const item = items.find((entry) => text(entry?.slot) === "武器1")
    || items.find((entry) => text(entry?.slot) === "武器2");
  return item ? buildWeaponAttackRow(item) : null;
}

export function resolveAttackRange(skillRow, unit) {
  const explicit = toSafeNumber(skillRow?.射程, null);
  if (explicit !== null) return Math.max(1, Math.floor(explicit));
  if (text(skillRow?.攻撃手段) === "武器") {
    const weaponRange = toSafeNumber(primaryWeaponRow(unit)?.射程, null);
    if (weaponRange !== null) return Math.max(1, Math.floor(weaponRange));
  }
  return 1;
}

export function resolveSplashSpec(skillRow) {
  const raw = toSafeNumber(skillRow?.炸裂, 0);
  const value = Math.max(0, raw ?? 0);
  const fullRadius = Math.floor(value);
  const fractionalRatio = Math.max(0, value - fullRadius);
  return {
    value,
    fullRadius,
    fractionalRadius:fractionalRatio > 0 ? fullRadius + 1 : 0,
    fractionalRatio
  };
}

export function resolveAreaType(skillRow) {
  const area = text(skillRow?.範囲).replace(/\s+/g, "");
  if (!area || ["-", "なし", "無し", "単体"].includes(area)) return "single";
  const configured = text(findGameDataRow("範囲", "範囲タイプ", area)?.処理タイプ);
  if (["single", "line", "fan", "circle", "around", "front", "all"].includes(configured)) return configured;
  console.error("[ゲームデータ] 範囲の処理タイプが未設定です", { テーブル:"範囲", 範囲タイプ:area, 項目:"処理タイプ" });
  return "single";
}

function strongestDamageType(skillRow) {
  let selected = "物理";
  let highest = Number.NEGATIVE_INFINITY;
  for (const key of DAMAGE_TYPE_FIELDS) {
    const value = toSafeNumber(skillRow?.[key], null);
    if (value === null || value <= highest) continue;
    selected = key;
    highest = value;
  }
  return selected;
}

export function resolveAttackPower(skillRow, attacker, options = {}) {
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, options);
  const effectiveSkill = adjusted.skillRow;
  const effectiveAttacker = adjusted.attacker;
  const scaled = computeSkillScaledTriplet(effectiveSkill, effectiveAttacker?.status || {});
  let power = Math.max(0, number(scaled?.power, resolveSkillBasePower(effectiveSkill)));
  const pureGuardSkill = number(effectiveSkill?.ガード) > 0
    && resolveSkillBasePower(effectiveSkill) <= 0
    && resolveSkillBaseState(effectiveSkill) <= 0
    && number(effectiveSkill?.回復) <= 0;
  if (text(effectiveSkill?.攻撃手段) === "武器" && effectiveSkill?.装備攻撃 !== true && !pureGuardSkill) {
    const weapon = primaryWeaponRow(effectiveAttacker);
    if (weapon) power += Math.max(0, number(computeSkillScaledTriplet(weapon, effectiveAttacker?.status || {})?.power, 0));
  }
  return Math.round(power);
}

export function computeAttackDamage({ attacker, target, skillRow, scale = 1, friendly = false, random = Math.random, isCounter = false }) {
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, { isCounter });
  const power = resolveAttackPower(adjusted.skillRow, { ...adjusted.attacker, techniques:[] });
  const magicalJudge = text(adjusted.skillRow?.判定).includes("魔");
  const defenseKey = magicalJudge ? "精神" : "防御";
  const defense = Math.max(0, number(target?.status?.[defenseKey], 0));
  const resistanceKey = `${strongestDamageType(adjusted.skillRow)}耐性`;
  const resistance = Math.max(0, number(target?.status?.[resistanceKey], number(target?.resistances?.[resistanceKey], 0)));
  const resistanceRate = Math.min(1, resistance / 100);
  const targetLevel = Math.max(1, Math.floor(number(target?.level, target?.status?.Lv || 1)));
  const levelReduction = (targetLevel / 10) * resistance;
  const reducedPower = Math.max(0, power - levelReduction);
  const attackCount = Math.max(1, Math.floor(number(adjusted.skillRow?.攻撃回数, 1)));
  const hits = [];
  for (let index = 0; index < attackCount; index += 1) {
    const randomRate = 0.4 + (Math.max(0, Math.min(1, number(random(), 0.5))) * 0.1);
    const damage = Math.max(0, Math.floor(
      (reducedPower / (1 + defense / 100))
      * randomRate
      * (1 - resistanceRate)
      * Math.max(0, number(scale, 1))
      * (friendly ? 0.5 : 1)
    ));
    hits.push(damage);
  }
  return {
    total:hits.reduce((sum, value) => sum + value, 0),
    hits,
    detail:{
      power, defenseKey, defense, resistanceKey, resistance, resistanceRate, targetLevel,
      levelReduction, reducedPower, attackCount, scale, friendly,
      appliedPassiveSkillNames:adjusted.appliedPassiveSkillNames,
      attackerTerrain:text(attacker?.terrainModifierSource),
      attackerTerrainModifiers:{ ...(attacker?.terrainModifiers || {}) },
      targetTerrain:text(target?.terrainModifierSource),
      targetTerrainModifiers:{ ...(target?.terrainModifiers || {}) }
    }
  };
}
