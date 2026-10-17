import { computeSkillScaledTriplet, resolveSkillBasePower, resolveSkillBaseState, toSafeNumber } from "./skill-power.js";
import { findGameDataRow } from "./game-data-registry.js";
import { getV39UnitTestSkillRows } from "./v39-test-skill-rules.js";
import { resolveV39DefenseKind } from "./v39-defense-rules.js";
import { hasV39SkillEffect } from "./v39-combat-ray.js";
import { getV39PassiveRows, matchV39PassiveCondition, resolveV39PassiveContext } from "./v39-passive-rules.js";
import { resolveV39BodyWeaponAttackRows } from "./v39-body-weapon-rules.js";
import { DAMAGE_TYPE_FIELDS, TIMED_EFFECT_FIELDS } from "../constants/unitCommon.js";
import { resolveV39RangeTiles, V39_SQUAD_MOVEMENT_BALANCE, V39_CAVE_BALANCE, V39_COMBAT_BALANCE, V39_HIT_RATE_MAX, V39_HIT_RATE_MIN } from "./v39-gameplay-balance.js";

const NATURAL_COUNTER_METHODS = new Set(["素手", "角", "牙", "爪", "翼", "尾", "針"]);
const RANGED_WEAPON_NAMES = /弓|銃|砲|ボウ|ライフル|ピストル/;



const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function resolveActionSkillRows(unit) {
  const rows = (Array.isArray(unit?.techniques) ? unit.techniques : [])
    .map((technique) => technique?.source || technique)
    .filter((row) => text(row?.名前) && text(row?.行動).toUpperCase() === "A");
  const names = new Set(rows.map(row => text(row?.名前)));
  for (const row of getV39UnitTestSkillRows(unit)) {
    if (text(row?.行動).toUpperCase() !== "A" || names.has(text(row?.名前))) continue;
    names.add(text(row?.名前));
    rows.push(row);
  }
  return rows;
}

function weaponMatchesMethod(item, method) {
  const name=text(item?.name ?? item?.equipmentName ?? item?.source?.装備名);
  return method === "武器" || (method === "弓" && /弓|ボウ/.test(name))
    || (method === "銃" && /銃|砲|ライフル|ピストル/.test(name));
}

function skillWeaponRow(skillRow, unit) {
  const method=text(skillRow?.攻撃手段);
  if (!["武器","弓","銃"].includes(method)) return null;
  if (skillRow?.装備元) return buildWeaponAttackRow(skillRow.装備元);
  const item=(unit?.equipment || []).find(item=>["武器1","武器2"].includes(text(item?.slot)) && weaponMatchesMethod(item,method));
  return item ? buildWeaponAttackRow(item) : null;
}

function passiveActionContext(unit,skillRow) {
  const weapon=skillWeaponRow(skillRow,unit);
  return weapon && !skillRow.装備元 ? {...skillRow,装備元:weapon.装備元} : skillRow;
}

function matchingPassiveRows(unit,skillRow,isCounter=false) {
  const action=passiveActionContext(unit,skillRow);
  return getV39PassiveRows(unit).filter(row=>matchV39PassiveCondition(row,unit,action,{isCounter}).matches);
}

export function applyV39PassiveCombatSkills(attacker,skillRow,options={}) {
  const result=resolveV39PassiveContext(attacker,passiveActionContext(attacker,skillRow),options);
  return {attacker:result.unit,skillRow:result.action,
    appliedPassiveSkillNames:result.rows.map(row=>row.名前),passiveDiagnostics:result.unsupported};
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
  const bodyWeapons = resolveV39BodyWeaponAttackRows(unit);
  const bodyNames = new Set(bodyWeapons.map(row => row.名前));
  return [...weapons, ...bodyWeapons, ...resolveActionSkillRows(unit).filter(row => !bodyNames.has(row.名前) && !/^(召喚|呼集)_/.test(text(row.効果)))];
}

function isMeleeCounterRow(row, unit, allowWeaponSkill = false) {
  if (!row || resolveAttackRange(row, unit) > 1) return false;
  if (resolveAreaType(row) !== "single" || resolveSplashSpec(row).value > 0) return false;
  const method = text(row?.攻撃手段);
  if (method === "魔法" || number(row?.射撃, 0) > 0 || RANGED_WEAPON_NAMES.test(text(row?.名前))) return false;
  // 武器スキルを受けた場合も反撃対象にするが、反撃に使う技は基礎攻撃だけに限定する。
  if (allowWeaponSkill && method === "武器" && row?.装備攻撃 !== true) {
    return isMeleeCounterRow(primaryWeaponRow(unit), unit);
  }
  return row?.装備攻撃 === true || NATURAL_COUNTER_METHODS.has(method) || NATURAL_COUNTER_METHODS.has(text(row?.名前));
}

export function resolveCounterAttackRow(unit) {
  const candidates = resolveAttackRows(unit).filter((row) => isMeleeCounterRow(row, unit));
  const lastUsed = text(unit?.lastUsedAttack);
  const selected = candidates.find((row) => text(row?.名前) === lastUsed) || candidates[0] || null;
  if (!selected) return null;
  const counterApCost = Math.ceil(resolveAttackApCost(selected, unit) / 2);
  return {
    ...selected,
    名前:`${text(selected?.名前)}（反撃）`,
    AP消費:counterApCost,
    射程:0,
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
  return isMeleeCounterRow(skillRow, attacker, true);
}

function equipmentMagicAp(item) {
  if (!item || typeof item !== "object") return 0;
  const source = item?.source && typeof item.source === "object" ? item.source : {};
  return Math.floor(number(item?.magicAp, number(item?.魔法AP, number(source?.魔法AP, 0))));
}

export function resolveEquipmentMagicApCost(unit) {
  const items = Array.isArray(unit?.equipment) ? unit.equipment : [];
  return items.reduce((sum, item) => sum + equipmentMagicAp(item), 0);
}

export function resolveAttackApCost(skillRow, attacker = null) {
  if (attacker) skillRow=applyV39PassiveCombatSkills(attacker,skillRow).skillRow;
  const skillAp = Math.max(0, Math.floor(number(skillRow?.AP消費, 0)));
  if (skillRow?.装備攻撃 === true) return skillAp;
  const method = text(skillRow?.攻撃手段);
  if (method === "武器") {
    const weaponAp = Math.max(0, Math.floor(number(primaryWeaponRow(attacker)?.AP消費, 0)));
    return skillAp + weaponAp;
  }
  if (method === "魔法") {
    return Math.max(0, skillAp + resolveEquipmentMagicApCost(attacker));
  }
  return skillAp;
}

export function resolveSkillHealing(skillRow, attacker) {
  const adjusted=applyV39PassiveCombatSkills(attacker,skillRow);
  skillRow=adjusted.skillRow; attacker=adjusted.attacker;
  const base = Math.max(0, number(skillRow?.回復));
  if (!base) return 0;
  const bonus = Math.max(0, number(attacker?.status?.[text(skillRow?.追加威力)]));
  return Math.max(0, Math.round(base * (1 + bonus / 500)));
}

export function resolveV39RevivalSpec(skillRow) {
  const match = text(skillRow?.効果).match(/蘇生[_＿]?Lv-(\d+)/i);
  if (!match && !hasV39SkillEffect(skillRow,"蘇生")) return null;
  return {
    levelLoss:Math.max(0, Math.floor(number(match?.[1]))),
    reviveHp:Math.max(1, Math.floor(number(skillRow?.回復, 1)))
  };
}

export function resolveSkillGuard(skillRow, attacker, options = {}) {
  if (resolveV39DefenseKind(skillRow)) return 0;
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
  return hasV39SkillEffect(skillRow,"魂回収") || hasV39SkillEffect(skillRow,"アンデッド化") || hasV39SkillEffect(skillRow,"遮断") || !!resolveV39DefenseKind(skillRow) || !!resolveV39RevivalSpec(skillRow)
    || resolveSkillHealing(skillRow, attacker) > 0
    || (resolveAttackPower(skillRow, attacker) <= 0
      && (Object.keys(resolveSkillTimedModifiers(skillRow)).length > 0 || resolveSkillGuard(skillRow, attacker) > 0));
}

export function applyV39GuardToDamage(target, damage) {
  let remaining = Math.max(0, Math.floor(number(target?.guard)));
  const guardBefore = remaining;
  let shieldRemaining = Math.max(0, Math.floor(number(target?.shield?.remaining)));
  const shieldBefore = shieldRemaining;
  const hitsBeforeGuard = Array.isArray(damage?.hits) ? damage.hits.map(value => Math.max(0, Math.floor(number(value)))) : [];
  const hits = hitsBeforeGuard.map(value => {
    const absorbed = Math.min(remaining, value);
    remaining -= absorbed;
    const shieldAbsorbed = Math.min(shieldRemaining, value - absorbed);
    shieldRemaining -= shieldAbsorbed;
    return value - absorbed - shieldAbsorbed;
  });
  return {
    ...damage,
    total:hits.reduce((sum, value) => sum + value, 0),
    hits,
    hitsBeforeGuard,
    guardBefore,
    guardAbsorbed:guardBefore - remaining,
    guardRemaining:remaining,
    shieldRemaining,
    shieldAbsorbed:shieldBefore - shieldRemaining,
    hitResults:(damage.hitResults || []).map((row, index) => ({ ...row, damage:hits[index] ?? row.damage }))
  };
}

function primaryWeaponRow(unit) {
  const items = Array.isArray(unit?.equipment) ? unit.equipment : [];
  const item = items.find((entry) => text(entry?.slot) === "武器1")
    || items.find((entry) => text(entry?.slot) === "武器2");
  return item ? buildWeaponAttackRow(item) : null;
}

export function resolveAttackRawRange(skillRow, unit) {
  const weapon=skillWeaponRow(skillRow,unit);
  const explicit = toSafeNumber(skillRow?.射程, null);
  const bonus=skillRangeBonus(skillRow);
  const base=bonus !== null ? number(weapon?.射程) : explicit ?? toSafeNumber(weapon?.射程,0);
  const passiveBonus=matchingPassiveRows(unit,skillRow).reduce((sum,row)=>sum+(skillRangeBonus(row) ?? number(row.射程)),0);
  return Math.max(0,base+number(bonus)+passiveBonus);
}

function skillRangeBonus(row) {
  const value=toSafeNumber(row?.射程補正,null);
  if (value !== null) return value;
  // 古い保存データは「射程+5」を射程:5として保持している。
  const match=text(row?.詳細).match(/(?:^|\s)射程([+-]\d+(?:\.\d+)?)(?=\s|$)/);
  return match ? Number(match[1]) : null;
}

function effectiveRangeValue(skillRow, unit, mapData) {
  const raw=resolveAttackRawRange(skillRow,unit);
  return raw > 0 && mapData?.isUnderground ? raw*V39_CAVE_BALANCE.attackRangeMultiplier : raw;
}

export function resolveAttackRange(skillRow, unit, mapData = null) {
  return resolveV39RangeTiles(effectiveRangeValue(skillRow,unit,mapData),1);
}

export function resolveAttackRangeScale(skillRow, unit, distance, mapData = null) {
  const raw=effectiveRangeValue(skillRow,unit,mapData);
  if (raw <= 0) return distance <= 1 ? 1 : 0;
  const maximum=resolveV39RangeTiles(raw,1);
  if (distance > maximum) return 0;
  const step=V39_SQUAD_MOVEMENT_BALANCE.moveStatPerTile;
  const remainder=raw % step;
  return distance === maximum && remainder > 0 && raw >= step ? remainder/step : 1;
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
  if (["壁", "結界"].includes(resolveV39DefenseKind(skillRow))) return "single";
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
  if (effectiveSkill?.装備攻撃 !== true && !pureGuardSkill) {
    const weapon = skillWeaponRow(effectiveSkill,effectiveAttacker);
    if (weapon) power += Math.max(0, number(computeSkillScaledTriplet(weapon, effectiveAttacker?.status || {})?.power, 0));
  }
  return Math.round(power);
}

export function computeAttackDamage({ attacker, target, skillRow, scale = 1, friendly = false, random = Math.random, isCounter = false }) {
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, { isCounter });
  target=resolveV39PassiveContext(target,passiveActionContext(target,skillRow),{isCounter:false}).unit;
  const power = resolveAttackPower(adjusted.skillRow, { ...adjusted.attacker, techniques:[] });
  const magicalJudge = text(adjusted.skillRow?.判定).includes("魔");
  const defenseKey = magicalJudge ? "精神" : "防御";
  const defense = Math.max(0, number(target?.status?.[defenseKey], 0));
  const resistanceKey = `${strongestDamageType(adjusted.skillRow)}耐性`;
  const resistance = Math.max(0, number(target?.status?.[resistanceKey], number(target?.resistances?.[resistanceKey], 0)));
  const resistancePenetration = Math.max(0, number(adjusted.attacker?.status?.耐性貫通, 0));
  const effectiveResistance = Math.max(0, resistance - resistancePenetration);
  const resistanceRate = Math.min(1, effectiveResistance / 100);
  const targetLevel = Math.max(1, Math.floor(number(target?.level, target?.status?.Lv || 1)));
  const levelReduction = (targetLevel / 10) * effectiveResistance;
  const reducedPower = Math.max(0, power - levelReduction);
  const attackCount = Math.max(1, Math.floor(number(adjusted.skillRow?.攻撃回数, 1)))
    * Math.max(1,Math.floor(number(adjusted.attacker?.combatProfile?.attackCount,1)));
  const magicalAttack = text(adjusted.skillRow?.攻撃手段) === "魔法" || magicalJudge;
  const accuracyKey = magicalAttack ? "精神" : "命中";
  const accuracy = Math.max(0, number(adjusted.attacker?.status?.[accuracyKey]));
  const evasion = Math.max(1, number(target?.status?.回避, number(target?.status?.速度, 1)));
  const guaranteedHit=hasV39SkillEffect(skillRow,"必中");
  const hitRate = guaranteedHit ? 1 : Math.max(V39_HIT_RATE_MIN, Math.min(V39_HIT_RATE_MAX, (accuracy / evasion) * 0.75));
  const hits = [];
  const hitResults = [];
  let barrierRemaining = Math.max(0, number(target?.barrier?.remaining));
  const barrierBefore = barrierRemaining;
  for (let index = 0; index < attackCount; index += 1) {
    const hitRoll = Math.max(0, Math.min(1, number(random(), 1)));
    if (!guaranteedHit && hitRoll >= hitRate) {
      hits.push(0);
      hitResults.push({ hit:false, damage:0, hitRoll });
      continue;
    }
    const randomRate = 0.4 + (Math.max(0, Math.min(1, number(random(), 0.5))) * 0.1);
    const barrierAbsorbed = Math.min(barrierRemaining, power);
    barrierRemaining -= barrierAbsorbed;
    const hitPower = Math.max(0, power - barrierAbsorbed - levelReduction);
    const damage = Math.max(0, Math.floor(
      (hitPower / (1 + defense / 100))
      * randomRate
      * (1 - resistanceRate)
      * Math.max(0, number(scale, 1))
      * (friendly ? 0.5 : 1)
      * Math.max(0, number(V39_COMBAT_BALANCE.damageMultiplier, 1))
    ));
    hits.push(damage);
    hitResults.push({ hit:true, damage, hitRoll, randomRate, barrierAbsorbed });
  }
  return {
    total:hits.reduce((sum, value) => sum + value, 0),
    hits,
    hitResults,
    barrierRemaining,
    barrierAbsorbed:barrierBefore - barrierRemaining,
    missCount:hitResults.filter(row => !row.hit).length,
    detail:{
      power, defenseKey, defense, resistanceKey, resistance, resistancePenetration, effectiveResistance, resistanceRate, targetLevel,
      levelReduction, reducedPower, attackCount, scale, friendly, damageMultiplier:V39_COMBAT_BALANCE.damageMultiplier, accuracyKey, accuracy, evasion, hitRate,
      appliedPassiveSkillNames:adjusted.appliedPassiveSkillNames,
      passiveDiagnostics:adjusted.passiveDiagnostics,
      attackerTerrain:text(attacker?.terrainModifierSource),
      attackerTerrainModifiers:{ ...(attacker?.terrainModifiers || {}) },
      targetTerrain:text(target?.terrainModifierSource),
      targetTerrainModifiers:{ ...(target?.terrainModifiers || {}) }
    }
  };
}
