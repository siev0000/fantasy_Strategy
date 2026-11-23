import {resolveV39WeaponPhysicalPower} from "./v39-weapon-physical-power.js";
import {normalizeV39ReductionKey,normalizeV39ReductionFields,readV39UnitResistance} from './v39-reduction-keys.js';
import {resolveV39PerceptionDamage,V39_ELEMENTAL_CONTROL_RESISTANCES} from './v39-control-status.js';
import {applyV39RestraintPenalties} from './v39-restraint.js';
import {abilityDamageTarget} from './v39-ability-damage.js';
import {hegemonyLightMultiplier} from './v39-hegemony-areas.js';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';
import {hasV39CityAuraSources} from './v39-city-aura.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
import { computeSkillScaledTriplet, resolveSkillBasePower, resolveSkillBaseState, DAMAGE_SUM_KEYS, SKILL_STATE_KEYS, toSafeNumber } from "./skill-power.js";
import { findGameDataRow } from "./game-data-registry.js";
import { getV39UnitTestSkillRows } from "./v39-test-skill-rules.js";
import { resolveV39DefenseKind, resolveV39DefenseReducedPower } from "./v39-defense-rules.js";
import {resolveV39DamageMultiplier} from './v39-combat-settings.js';
import { hasV39SkillEffect } from "./v39-combat-ray.js";
import {resolveV39TransformationSpec} from './v39-transformation.js';
import {resolveV39TransformedSiz} from './v39-transformation.js';
import {applyV39SizChangeToDerived} from './v39-siz-status-rules.js';
import { getV39PassiveRows, matchV39PassiveCondition, resolveV39PassiveContext } from "./v39-passive-rules.js";
import { resolveV39BodyWeaponAttackRows } from "./v39-body-weapon-rules.js";
import { DAMAGE_TYPE_FIELDS, TIMED_EFFECT_FIELDS, SKILL_LEVEL_FIELDS, RESISTANCE_FIELDS } from "../constants/unitCommon.js";
import {V39_TERRAIN_DESTRUCTION_RULES} from './v39-terrain-destruction.js';
import {getV39DisasterFieldAt} from './v39-disaster-dynamics.js';
import {resolveV39StormShotPowerLoss,resolveV39ColdWaveShotPowerLoss} from './v39-storm-effects.js';
import { resolveV39RangeTiles, V39_SQUAD_MOVEMENT_BALANCE, V39_CAVE_BALANCE, V39_HIT_RATE_MAX, V39_HIT_RATE_MIN } from "./v39-gameplay-balance.js";
import {resolveV39SpatialDistortionPercent} from './v39-spatial-distortion.js';
import {getV39ConditionEventRules,getV39ConditionEffect} from './v39-condition-event-rules.js';
import {resolveV39ChainSpec} from './v39-chain-attacks.js';
import {getV39NamedWeaponEffect} from './v39-named-weapon-rules.js';
import {getV39EquipmentSkillNames} from './v39-equipment-skill-effects.js';

const NATURAL_COUNTER_METHODS = new Set(["素手", "角", "牙", "爪", "翼", "尾", "針"]);
const RANGED_WEAPON_NAMES = /弓|銃|砲|ボウ|ライフル|ピストル/;
const diseaseCombatScale=(unit,state)=>{
  if(!Number.isFinite(Number(unit?.x))||!Number.isFinite(Number(unit?.y))
    ||(unit.worldId||'surface')!==(state?.activeWorldId||'surface'))return 1;
  const tile=`${Math.floor(Number(unit.x))},${Math.floor(Number(unit.y))}`;
  return (state?.worldEnvironment?.activeDisasters||[]).reduce((scale,event)=>{
    if(!(event.tileKeys||[]).includes(tile))return scale;
    const rule=getV39ConditionEventRules('combatMultiplier').find(rule=>rule.id===event.disasterId);
    return scale*(getV39ConditionEffect(rule,'combatMultiplier')?.multiplier??1);
  },1);
};



const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export function resolveActionSkillRows(unit) {
  const rows = (Array.isArray(unit?.techniques) ? unit.techniques : [])
    .map((technique) => technique?.source || technique)
    .filter((row) => text(row?.名前) && text(row?.行動).toUpperCase() === "A" && row.条件 !== "ゴーレム作成時"
      && (row.条件 !== "搭乗" || unit?.boardingPilot));
  const names = new Set(rows.map(row => text(row?.名前)));
  for (const row of getV39UnitTestSkillRows(unit)) {
    if (text(row?.行動).toUpperCase() !== "A" || names.has(text(row?.名前))
      || row.条件 === "搭乗" && !unit?.boardingPilot) continue;
    names.add(text(row?.名前));
    rows.push(row);
  }
  rows.push(...resolveV39EquipmentActionRows(unit,names));
  return rows.filter(row => hasV39SkillWeapon(unit,row)).map(row => text(row.攻撃手段) === "蹴り" && !text(row.対象)
    ? {...row, 対象:"敵"}
    : row);
}

function equipmentAttackMethod(item) {
  const source = item?.source;
  if ([...(item?.traits || []), source?.特性1, source?.特性2, source?.特性3, source?.特性4].includes("素手")) return "素手";
  const name = text(source?.装備名 || item?.equipmentName || item?.name);
  if (/弓|ボウ/.test(name)) return "弓";
  if (/銃|砲|ライフル|ピストル/.test(name)) return "銃";
  return "武器";
}

function weaponMatchesMethod(item, method) {
  const actual = equipmentAttackMethod(item);
  const name = text(item?.source?.装備名 || item?.equipmentName || item?.name);
  if (method === "剣" || method === "槍") return name.includes(method);
  if (method === "武器") return actual !== "素手" && item?.source?.武器分類 !== "盾" && !name.endsWith("盾");
  return actual === method || name === method;
}

const requiredWeaponMethods = new Set(["武器","弓","銃","剣","槍","斧","棍棒","戦槌","杖","短剣","長剣"]);
export const isV39WeaponAttackMethod = value => requiredWeaponMethods.has(text(value));

function equippedWeaponForMethod(unit, method) {
  return (unit?.equipment || []).find(item => ["武器1","武器2"].includes(text(item?.slot)) && weaponMatchesMethod(item, method));
}

export function resolveV39EquipmentActionRows(unit, learnedNames = new Set()) {
  const granted = new Map();
  for (const item of unit?.equipment ?? []) {
    for (const name of getV39EquipmentSkillNames(item)) {
      if (learnedNames.has(name)) continue;
      const skill = findGameDataRow("スキル一覧", "名前", name);
      if (text(skill?.行動).toUpperCase() !== "A" || skill.条件 === "ゴーレム作成時"
        || skill.条件 === "搭乗" && !unit.boardingPilot) continue;
      const weapon = ["武器1","武器2"].includes(item.slot);
      const row = {...skill, 獲得元装備:item, ...(weapon ? {装備元:item} : {})};
      if (!granted.has(name) || hasV39SkillWeapon(unit,row)) granted.set(name,row);
    }
  }
  return [...granted.values()];
}

export function hasV39SkillWeapon(unit, row) {
  const method = text(row?.攻撃手段);
  if (row?.獲得元装備) {
    const origin = row.獲得元装備;
    const equipped = unit?.equipment?.find(item => item.slot === origin.slot && item.name === origin.name
      && (!origin.instanceId || item.instanceId === origin.instanceId)
      && getV39EquipmentSkillNames(item).includes(row.名前));
    if (!equipped) return false;
    if (["武器1","武器2"].includes(equipped.slot)) {
      const weaponMethod = requiredWeaponMethods.has(method) ? method : equipmentAttackMethod(equipped);
      if (equippedWeaponForMethod(unit,weaponMethod) !== equipped) return false;
    }
  }
  if (row?.身体武器 || !requiredWeaponMethods.has(method) || isV39TimedWeaponEnhancement(row)) return true;
  if (row?.装備攻撃 && row.装備元) {
    return (unit?.equipment || []).some(item => item.slot === row.装備スロット
      && text(item.name ?? item.equipmentName ?? item.source?.装備名) === text(row.装備元.name ?? row.装備元.equipmentName ?? row.装備元.source?.装備名));
  }
  if (equippedWeaponForMethod(unit, method)) return true;
  const target = text(row?.対象);
  if (["自身","自分","味方"].includes(target) || (!target && text(row?.効果時間))) return true;
  return isV39SupportSkill(row, unit);
}

function skillWeaponRow(skillRow, unit) {
  const method=text(skillRow?.攻撃手段);
  if (skillRow?.装備攻撃 && skillRow?.装備元) return buildWeaponAttackRow(skillRow.装備元);
  if (!["武器","弓","銃"].includes(method)) return null;
  if (skillRow?.装備元) return buildWeaponAttackRow(skillRow.装備元);
  const item=equippedWeaponForMethod(unit,method);
  return item ? buildWeaponAttackRow(item) : null;
}

export function resolveV39AttackChain(skillRow, attacker, {isCounter = false} = {}) {
  const weapon = skillWeaponRow(skillRow, attacker)?.装備元;
  const skillChain = resolveV39ChainSpec(skillRow?.効果);
  const weaponChain = resolveV39ChainSpec(getV39NamedWeaponEffect(weapon));
  const chain = weaponChain ?? skillChain;
  if (chain?.attribute && resolveAttackPower(skillRow, attacker, {onlyDamageType:chain.attribute, unrounded:true, isCounter}) <= 0) {
    return null;
  }
  return chain;
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
  const attackAp = Math.abs(number(item?.attackAp, number(source?.攻撃AP, 0)));
  const magicAp = Math.abs(number(item?.magicAp, number(source?.魔法AP, 0)));
  const rawAp = attackAp > 0 ? attackAp : magicAp;
  const range = toSafeNumber(item?.range, toSafeNumber(source?.射程, null));
  const enchantAttack = item?.enchantAttackFields && typeof item.enchantAttackFields === "object" ? item.enchantAttackFields : {};
  return {
    名前:name,
    行動:"A",
    攻撃手段:equipmentAttackMethod(item),
    対象:"相手",
    判定:"攻撃",
    ...resolveV39WeaponPhysicalPower(item),
    魔法:number(enchantAttack.魔法),
    射撃:number(enchantAttack.射撃),
    炎:number(enchantAttack.炎),
    氷:number(enchantAttack.氷),
    雷:number(enchantAttack.雷),
    毒:number(enchantAttack.毒),
    光:number(enchantAttack.光),
    闇:number(enchantAttack.闇),
    出血:number(enchantAttack.出血),
    怯み:number(enchantAttack.怯み),
    呪い:number(enchantAttack.呪い),
    盲目:number(enchantAttack.盲目),
    幻覚:number(enchantAttack.幻覚),
    拘束:number(enchantAttack.拘束),
    効果:(item?.enchantEffects||[]).join("/"),
    AP消費:rawAp > 0 ? rawAp : 25,
    射程:range,
    範囲:null,
    炸裂:null,
    攻撃回数:Math.max(1,1+number(item?.enchantAttackCount)),
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
  const unarmed = !weapons.some(row=>text(row.装備元?.source?.武器分類)!=="盾")
    && getV39PassiveRows(unit).some(row=>text(row.名前)==="素手")
    ? findGameDataRow("装備","装備名","素手")
    : null;
  if (unarmed && !bodyWeapons.some(row=>row.名前==="素手")) {
    const row = buildWeaponAttackRow({source:unarmed});
    bodyWeapons.push({...row, 攻撃手段:"素手", 身体武器:true, 攻撃回数:number(unarmed.攻撃回数,1), ガード:number(unarmed.ガード)});
  }
  const bodyNames = new Set(bodyWeapons.map(row => row.名前));
  return [...weapons, ...bodyWeapons, ...resolveActionSkillRows(unit).filter(row => !bodyNames.has(row.名前) && !/^(召喚|呼集)_|^転移(?:_|$)/.test(text(row.効果)))];
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
  if (unit?.testTrainingTarget) return null;
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
  skillRow=normalizeV39ReductionFields(skillRow);
  const fields=skillRow?.条件==='搭乗'?[...TIMED_EFFECT_FIELDS,'攻撃回数']:TIMED_EFFECT_FIELDS;
  return Object.fromEntries(fields
    .map(key => [key, number(skillRow?.[key])])
    .filter(([, value]) => value !== 0));
}

export function isV39TimedWeaponEnhancement(skillRow) {
  return text(skillRow?.攻撃手段)==='武器' && number(skillRow?.物理)>0
    && /\d+t/i.test(text(skillRow?.効果時間)) && ['自身','自分','味方'].includes(text(skillRow?.対象));
}

export function applyV39ActiveCombatEffects(unit, effects) {
  const active = Array.isArray(effects) ? effects : [];
  unit={...unit,status:normalizeV39ReductionFields(unit?.status),resistances:normalizeV39ReductionFields(unit?.resistances)};
  if (!active.length) return unit;
  let status = { ...(unit?.status || {}) };
  const resistances = { ...(unit?.resistances || {}) };
  let skillLevels={...unit?.skillLevels};
  const transformation=active.find(effect=>effect?.stackGroup==='transformation'&&effect?.sizeSpec);
  if(transformation){
    const originalSiz=number(unit?.status?.SIZ,number(unit?.SIZ,100));
    const changed=applyV39SizChangeToDerived(status,skillLevels,originalSiz,resolveV39TransformedSiz(originalSiz,transformation.sizeSpec));
    status=changed.status;
    skillLevels=changed.skillLevels;
  }
  const persistent={},stacked={};
  for(const effect of active)for(const [key,value] of Object.entries(normalizeV39ReductionFields(effect?.modifiers))){
    if(effect.stackGroup==='oneTurn'||effect.stackGroup==='transformation')stacked[key]=number(stacked[key])+number(value);
    else persistent[key]=persistent[key]===undefined?number(value):Math.max(persistent[key],number(value));
  }
  for(const key of new Set([...Object.keys(persistent),...Object.keys(stacked)])){
    const target=RESISTANCE_FIELDS.includes(key)?resistances:SKILL_LEVEL_FIELDS.includes(key)?skillLevels:status;
    target[key]=number(target[key])+number(persistent[key])+number(stacked[key]);
  }
  return { ...unit, status, resistances,skillLevels };
}

export function isV39SupportSkill(skillRow, attacker) {
  return isV39TimedWeaponEnhancement(skillRow) || !!resolveV39TransformationSpec(skillRow) || (hasV39SkillEffect(skillRow,"魂回収") && resolveAttackPower(skillRow,attacker)<=0) || hasV39SkillEffect(skillRow,"アンデッド化") || hasV39SkillEffect(skillRow,"遮断") || hasV39SkillEffect(skillRow,"守護") || !!resolveV39DefenseKind(skillRow) || !!resolveV39RevivalSpec(skillRow)
    || resolveSkillHealing(skillRow, attacker) > 0
    || (resolveAttackPower(skillRow, attacker) <= 0
      && (hasV39SkillEffect(skillRow,'浄化') || Object.keys(resolveSkillTimedModifiers(skillRow)).length > 0 || resolveSkillGuard(skillRow, attacker) > 0));
}

export function isV39FireSkill(row, unit) {
  return number(row?.炎)>0 || number(skillWeaponRow(row,unit)?.炎)>0;
}

export function applyV39GuardToDamage(target, damage) {
  let remaining = Math.max(0, number(target?.guard));
  const guardBefore = remaining;
  let shieldRemaining = Math.max(0, number(target?.shield?.remaining));
  const shieldBefore = shieldRemaining;
  const hitsBeforeGuard = Array.isArray(damage?.hits) ? damage.hits.map(value => Math.max(0,number(value))) : [];
  const hits = hitsBeforeGuard.map(value => {
    const shieldAbsorbed = Math.min(shieldRemaining, value);
    shieldRemaining -= shieldAbsorbed;
    const absorbed = Math.min(remaining, value - shieldAbsorbed);
    remaining -= absorbed;
    return Math.round(Math.max(0,value-shieldAbsorbed-absorbed));
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

function effectiveRangeValue(skillRow, unit, mapData, state) {
  const raw=resolveAttackRawRange(skillRow,unit);
  if(raw<=0)return raw;
  const caveRange=mapData?.isUnderground?raw*V39_CAVE_BALANCE.attackRangeMultiplier:raw;
  const currentState = state === undefined ? globalThis.window?.getV39GameState?.({includeWorlds:false}) : state;
  return caveRange*(resolveV39SpatialDistortionPercent(unit,currentState)??100)/100;
}

export function resolveAttackRange(skillRow, unit, mapData = null, state) {
  return resolveV39RangeTiles(effectiveRangeValue(skillRow,unit,mapData,state),1);
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
  for (const key of DAMAGE_SUM_KEYS) {
    const value = toSafeNumber(skillRow?.[key], null);
    if (value === null || value <= highest) continue;
    selected = key;
    highest = value;
  }
  return selected;
}

export function resolveAttackPower(skillRow, attacker, options = {}) {
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, options);
  const onlyDamageType = options.onlyDamageType;
  const effectiveSkill = Number(adjusted.skillRow.毒)>0&&!options.damageType&&!onlyDamageType?{...adjusted.skillRow,毒:0}:adjusted.skillRow;
  const poisonOnly=Number(adjusted.skillRow.毒)>0&&resolveSkillBasePower({...adjusted.skillRow,毒:0})<=0;
  const effectiveAttacker = adjusted.attacker;
  const scaledPower=row=>{
    const powerRow = onlyDamageType ? {...row, 全威力:number(row?.[onlyDamageType])} : row;
    const scaled=computeSkillScaledTriplet(powerRow,effectiveAttacker?.status||{});
    return Math.max(0,options.unrounded?scaled.powerBase*scaled.multiplier:scaled.power);
  };
  let power = scaledPower(effectiveSkill);
  const pureGuardSkill = number(effectiveSkill?.ガード) > 0
    && resolveSkillBasePower(effectiveSkill) <= 0
    && resolveSkillBaseState(effectiveSkill) <= 0
    && number(effectiveSkill?.回復) <= 0;
  if (effectiveSkill?.装備攻撃 !== true && !pureGuardSkill && !poisonOnly) {
    const weapon = skillWeaponRow(effectiveSkill,effectiveAttacker);
    if (weapon) power += scaledPower(weapon);
  }
  if (!onlyDamageType && !pureGuardSkill && !poisonOnly) power += number(effectiveSkill?.__timedWeaponFlatPower);
  return options.unrounded?power:Math.round(power);
}

export function resolveV39SkillStatePower(row,attacker) {
  const adjusted=applyV39PassiveCombatSkills(attacker,row);
  const skill=adjusted.skillRow;
  const judgement=text(skill.判定)||(
    hasV39SkillEffect(skill,'強化解除')&&(number(skill.魔法)>0||skill.攻撃手段==='魔法')?'魔力':undefined
  );
  return Math.max(0,computeSkillScaledTriplet({...skill,判定:judgement},adjusted.attacker?.status).state);
}

export function resolveV39TerrainAttackPower(skillRow,attacker,options={}){
  const adjusted=applyV39PassiveCombatSkills(attacker,skillRow,options);
  const physicalPower=row=>{
    const value=Math.max(0,...(options.damageTypes??V39_TERRAIN_DESTRUCTION_RULES.eligibleDamageTypes).map(key=>number(row?.[key])));
    if(!value)return 0;
    const filtered={...row,全威力:undefined,...Object.fromEntries(DAMAGE_TYPE_FIELDS.map(key=>[key,0])),物理:value};
    return Math.max(0,number(computeSkillScaledTriplet(filtered,adjusted.attacker?.status||{})?.power));
  };
  const weapon=adjusted.skillRow.装備攻撃===true?null:skillWeaponRow(adjusted.skillRow,adjusted.attacker);
  return Math.round(physicalPower(adjusted.skillRow)+physicalPower(weapon));
}

// The effect selects defense; the attack classification selects exactly one resistance.
export function resolveV39HarmfulEffectDefense(row,effectKey){
  const magical=text(row?.判定)==='魔力'||text(row?.攻撃手段)==='魔法';
  return {defenseKey:['精神','精神攻撃','幻覚'].includes(effectKey)?'精神':'防御',
    resistanceKey:V39_ELEMENTAL_CONTROL_RESISTANCES[effectKey]??(magical?'魔法軽減':'物理軽減')};
}
export function resolveV39HarmfulEffectPower(attacker,target,row,basePower,effectKey,options={}){
  const scaled=computeSkillScaledTriplet({全威力:basePower,判定:options.judgement??row?.判定,追加威力:row?.追加威力},attacker?.status);
  const power=options.unrounded?scaled.powerBase*scaled.multiplier:scaled.power;
  const {defenseKey,resistanceKey}=resolveV39HarmfulEffectDefense(row,effectKey);
  const resistance=number(readV39UnitResistance(target,resistanceKey));
  const reduced=resolveV39ResistanceReduction(power,number(target?.level,1),resistance,number(attacker?.status?.耐性貫通),resistanceKey);
  const defense=options.defense??number(target?.status?.[defenseKey]);
  const damage=Math.max(0,resolveV39DefenseReducedPower(reduced.reducedPower,defense)*(1-reduced.resistanceRate));
  return options.unrounded?damage:Math.floor(damage);
}

export const V39_INSTANT_DEATH_HP_THRESHOLD = 0.30;

export function resolveV39InstantDeath(attacker,target,row,damage,powerScale=1){
  if(!hasV39SkillEffect(row,'即死'))return null;
  const forceField=damage.detail?.damageType==='力場';
  const base=number(row?.呪い)*powerScale;
  if(base<=0&&!forceField)return null;
  const curseDamage=base>0
    ?resolveV39HarmfulEffectPower(attacker,target,row,base,'即死',{defense:number(target?.status?.精神)})
    :0;
  let beforeHp=Math.max(0,number(target?.hp??target?.currentHp));
  for(const [index,hit] of (damage.hitResults||[]).entries()){
    if(beforeHp<=0)break;
    if(!hit.hit)continue;
    const threshold=beforeHp*V39_INSTANT_DEATH_HP_THRESHOLD;
    if(curseDamage>threshold)return {index,beforeHp,curseDamage};
    if(forceField&&number(hit.damage)>threshold)return {index,beforeHp,forceFieldDamage:hit.damage};
    beforeHp=Math.max(0,beforeHp-number(hit.damage));
  }
  return null;
}
export function resolveV39StaggerDamage(attacker, target, row, random = Math.random) {
  const adjusted = applyV39PassiveCombatSkills(attacker, row, {target});
  const basePower = number(adjusted.skillRow.怯み);
  if (basePower <= 0) return 0;
  const {multiplier} = computeSkillScaledTriplet({
    判定:adjusted.skillRow.判定,
    追加威力:adjusted.skillRow.追加威力
  }, adjusted.attacker.status);
  const reduced = resolveV39ResistanceReduction(
    basePower * multiplier, target.level, readV39UnitResistance(target, '怯み耐性'),
    adjusted.attacker.status?.耐性貫通, '怯み耐性'
  );
  const defense = number(target.status?.防御) + number(target.hp ?? target.currentHp);
  const effective = reduced.reducedPower * (1 - reduced.resistanceRate);
  return Math.round(resolveV39DefenseReducedPower(effective * (0.7 + 0.3 * random()), defense));
}

export function resolvesV39Knockdown(attacker, target, row, random = Math.random) {
  const adjusted = applyV39PassiveCombatSkills(attacker, row, {target});
  const power = number(adjusted.skillRow.体幹 ?? adjusted.skillRow.ノックバック);
  if (power <= 0) return false;
  const {multiplier} = computeSkillScaledTriplet({
    判定:adjusted.skillRow.判定, 追加威力:adjusted.skillRow.追加威力
  }, adjusted.attacker.status);
  const defense = number(target.status?.防御) + number(target.skillLevels?.軽業);
  return resolveV39DefenseReducedPower(160 * power / 35 * multiplier * (0.3 + 0.7 * random()), defense) >= 100;
}

export function resolveV39StateInfliction(attacker,target,row,stateKey,options={}){
  const key=stateKey==='精神攻撃'?'精神':stateKey;
  const base=row?.[stateKey]??(key==='精神'?row?.精神攻撃??row?.精神:undefined);
  return SKILL_STATE_KEYS.includes(key)?resolveV39HarmfulEffectPower(attacker,target,row,number(base),key,options):0;
}

export function computeAttackDamage({ attacker, target, skillRow, scale = 1, powerScale = 1, friendly = false, random = Math.random, isCounter = false, damageType = '', onlyDamageType = '', gameSettings, deferRounding = false, landedAttack }) {
  if (onlyDamageType) damageType = onlyDamageType;
  const damageMultiplier=resolveV39DamageMultiplier(gameSettings);
  if(hasV39CityAuraSources()||attacker?.cityAuraSkillNames?.length||target?.cityAuraSkillNames?.length){
    attacker=applyV39TerrainModifiers(attacker);target=applyV39TerrainModifiers(target);
  }
  const periodicOnly=!damageType&&(Number(skillRow?.毒)>0||Number(skillRow?.燃焼)>0)&&resolveSkillBasePower({...skillRow,毒:0})<=0;
  if(!damageType&&Number(skillRow?.毒)>0)skillRow={...skillRow,毒:0};
  const state=globalThis.window?.getV39GameState?.({includeWorlds:false});
  const attackerDiseaseScale=diseaseCombatScale(attacker,state),targetDiseaseScale=diseaseCombatScale(target,state);
  const adjusted = applyV39PassiveCombatSkills(attacker, skillRow, { isCounter });
  adjusted.attacker=applyV39RestraintPenalties(adjusted.attacker,state);
  target=resolveV39PassiveContext(target,passiveActionContext(target,skillRow),{isCounter:false}).unit;
  target=applyV39RestraintPenalties(target,state);
  const runtime=globalThis.window?.__v39FieldRuntime;
  const attackType=[...DAMAGE_SUM_KEYS,'精神'].includes(damageType)?damageType:strongestDamageType(adjusted.skillRow);
  const forceField=attackType==='力場';
  const areaScale=runtime?.mapData?.hegemonyInterior?hegemonyLightMultiplier(runtime.mapData,attacker,attackType,globalThis.window?.getV39GameState?.({includeWorlds:false})?.activeWorldId):1;
  const ranged=attackType==='射撃'||['弓','銃'].includes(text(adjusted.skillRow?.攻撃手段))||number(adjusted.skillRow?.射撃)>0;
  const fieldMap=globalThis.window?.__v39FieldRuntime?.mapData;
  const stormShotPowerLoss=ranged?resolveV39StormShotPowerLoss(fieldMap,adjusted.attacker,target):0;
  const coldWaveShotPowerLoss=ranged?resolveV39ColdWaveShotPowerLoss(fieldMap,adjusted.attacker,target):0;
  const basePower=(!onlyDamageType && abilityDamageTarget(adjusted.skillRow))||periodicOnly?0:resolveAttackPower(adjusted.skillRow, { ...adjusted.attacker, techniques:[],timedWeaponEnhancements:[] },{damageType,onlyDamageType,unrounded:true})*areaScale*powerScale;
  const power=landedAttack?.detail.power??Math.max(0,basePower-stormShotPowerLoss-coldWaveShotPowerLoss)*attackerDiseaseScale;
  const magicalJudge = text(adjusted.skillRow?.判定).includes("魔");
  const defenseKey = magicalJudge || forceField ? "精神" : "防御";
  const defense = Math.max(0, number(target?.status?.[defenseKey], 0))*targetDiseaseScale;
  const resistanceKey = forceField?'':normalizeV39ReductionKey(`${attackType}耐性`);
  const resistance = forceField?0:Math.max(0, number(readV39UnitResistance(target,resistanceKey)));
  const resistancePenetration = Math.max(0, number(adjusted.attacker?.status?.耐性貫通, 0));
  const {effectiveResistance,resistanceRate,targetLevel,levelReduction,reducedPower}=resolveV39ResistanceReduction(power,number(target?.level,target?.status?.Lv||1),resistance,resistancePenetration,resistanceKey);
  const attackCount = onlyDamageType ? 1 : landedAttack?.hitResults.length ?? (Math.max(1, Math.floor(number(adjusted.skillRow?.攻撃回数, 1)))
    * Math.max(1,Math.floor(number(adjusted.attacker?.combatProfile?.attackCount,1)))
    + Math.max(0,Math.floor(number(adjusted.attacker?.status?.攻撃回数))));
  const magicalAttack = text(adjusted.skillRow?.攻撃手段) === "魔法" || magicalJudge;
  const weapon=skillWeaponRow(adjusted.skillRow,adjusted.attacker)?.装備元;
  const physicalCritical=!magicalAttack&&['物理','射撃','切断','貫通','打撃'].includes(damageType||strongestDamageType(adjusted.skillRow));
  const criticalRate=physicalCritical?Math.max(0,Math.min(100,
    number(adjusted.attacker?.status?.Cr率)+number(adjusted.skillRow?.Cr率)
    +number(weapon?.criticalRate,number(weapon?.source?.Cr率))
    -number(target?.status?.Cr率耐性,number(target?.resistances?.Cr率耐性))))/100:0;
  const criticalMultiplier=Math.max(1,(
    number(weapon?.criticalPower,number(weapon?.source?.Cr威力,100))
    +number(adjusted.attacker?.status?.Cr威力)+number(adjusted.skillRow?.Cr威力)
    -number(target?.status?.Cr威力耐性,number(target?.resistances?.Cr威力耐性)))/100);
  const accuracyKey = magicalAttack ? "精神" : "命中";
  const weatherAccuracy=ranged?Math.min(getV39DisasterFieldAt(fieldMap,attacker?.x,attacker?.y).rangedAccuracyMultiplier,getV39DisasterFieldAt(fieldMap,target?.x,target?.y).rangedAccuracyMultiplier):1;
  const accuracy = Math.max(0, number(adjusted.attacker?.status?.[accuracyKey])-(magicalAttack?0:resolveV39PerceptionDamage(adjusted.attacker)))*weatherAccuracy*(magicalAttack?(adjusted.attacker.restraintAppliedMultiplier||1):1)*attackerDiseaseScale;
  const evasion = Math.max(1, number(target?.status?.速度, 1) * (target?.knockedDown ? 0.75 : 1)*targetDiseaseScale);
  const guaranteedHit=hasV39SkillEffect(skillRow,"必中");
  const hitRate = guaranteedHit ? 1 : Math.max(V39_HIT_RATE_MIN, Math.min(V39_HIT_RATE_MAX, (accuracy / evasion) * 0.75));
  const hits = [];
  const hitResults = [];
  let barrierRemaining = Math.max(0, number(target?.barrier?.remaining));
  const barrierBefore = barrierRemaining;
  for (let index = 0; index < attackCount; index += 1) {
    const landedHit=landedAttack?.hitResults[index];
    const hitRoll = landedHit?.hitRoll ?? Math.max(0, Math.min(1, number(random(), 1)));
    if (landedHit ? !landedHit.hit : !guaranteedHit && hitRoll >= hitRate) {
      hits.push(0);
      hitResults.push({ hit:false, damage:0, hitRoll });
      continue;
    }
    const randomRate = landedHit?.randomRate ?? (0.4 + Math.max(0, Math.min(1, number(random(), 0.5))) * 0.1);
    const critical=landedHit ? landedHit.critical===true : criticalRate>0&&Math.max(0,Math.min(1,number(random(),1)))<criticalRate;
    const barrierAbsorbed = Math.min(barrierRemaining, power);
    barrierRemaining -= barrierAbsorbed;
    const hitPower = Math.max(0, power - barrierAbsorbed - levelReduction);
    const rawDamage = Math.max(0,
      resolveV39DefenseReducedPower(hitPower, defense)
      * randomRate
      * (1 - resistanceRate)
      * Math.max(0, number(scale, 1))
      * (friendly ? 0.5 : 1)
      * damageMultiplier
      * (critical?criticalMultiplier:1)
    );
    const damage = deferRounding?rawDamage:Math.round(rawDamage);
    hits.push(damage);
    hitResults.push({ hit:true, damage, hitRoll, randomRate, barrierAbsorbed,critical });
  }
  return {
    total:hits.reduce((sum, value) => sum + value, 0),
    hits,
    hitResults,
    barrierRemaining,
    barrierAbsorbed:barrierBefore - barrierRemaining,
    missCount:hitResults.filter(row => !row.hit).length,
    criticalCount:hitResults.filter(row=>row.critical).length,
    detail:{
      power, basePower, stormShotPowerLoss, coldWaveShotPowerLoss, damageType:attackType, defenseKey, defense, resistanceKey, resistance, resistancePenetration, effectiveResistance, resistanceRate, targetLevel,
      levelReduction, reducedPower, attackCount, scale, friendly, damageMultiplier, accuracyKey, accuracy, evasion, hitRate,criticalRate,criticalMultiplier,
      appliedPassiveSkillNames:adjusted.appliedPassiveSkillNames,
      passiveDiagnostics:adjusted.passiveDiagnostics,
      attackerTerrain:text(attacker?.terrainModifierSource),
      attackerTerrainModifiers:{ ...(attacker?.terrainModifiers || {}) },
      targetTerrain:text(target?.terrainModifierSource),
      targetTerrainModifiers:{ ...(target?.terrainModifiers || {}) }
    }
  };
}
