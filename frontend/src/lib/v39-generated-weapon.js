import {resolveScaleStatValue} from "./skill-power.js";
import {V39_WEAPON_PHYSICAL_TYPES} from "./v39-weapon-physical-power.js";

export const V39_GENERATED_WEAPON_SLOTS = ["武器1","武器2",""];
const includesEffect = (row,name) => String(row?.効果 ?? "").split(/[\s,:：;；/／|｜、]+/u).includes(name);
export const isV39WeaponGeneration = row => includesEffect(row,"武器生成");
export const usesV39GeneratedWeaponFollowUp = row => includesEffect(row,"生成武器追撃");

export function normalizeV39WeaponGenerationSkill(row) {
  if (!isV39WeaponGeneration(row)) return row;
  const legacy = row.名前 === "魔力の剣" && row.行動 === "S";
  return {...row,行動:"A",攻撃手段:"魔法",対象:"自身",効果時間:"持続",判定:row.判定 || "魔力",
    AP消費:legacy || row.AP消費 == null ? 20 : row.AP消費};
}

export function canV39PlaceGeneratedWeapon(unit,slot) {
  return V39_GENERATED_WEAPON_SLOTS.includes(slot) && (!slot || unit?.namedUnit?.weaponSlot !== slot);
}

export function createV39GeneratedWeapon(row, caster, slot) {
  if (!canV39PlaceGeneratedWeapon(caster,slot)) return null;
  const values = {...caster.skillLevels,...caster.status};
  const multiplier = (1+resolveScaleStatValue(row.判定,values)/100)
    * (1+resolveScaleStatValue(row.追加威力,values)/500);
  const damage = Object.fromEntries(V39_WEAPON_PHYSICAL_TYPES.map(key=>[
    key,Math.max(0,Number(((Number(row[key]) || 0)*multiplier).toFixed(6)))
  ]));
  return {name:row.名前,slot,damage,activationAp:Math.max(0,Number(row.AP消費)||0),
    criticalRate:Number(row.Cr率)||0,criticalPower:100+(Number(row.Cr威力)||0),
    attackAp:Math.max(1,Number(row.武器攻撃AP)||25)};
}

export function getV39GeneratedWeapon(unit) {
  const weapon = unit?.generatedWeapon;
  return weapon && unit.state !== "死亡" && Number(unit.hp ?? unit.currentHp)>0 ? weapon : null;
}

export function getV39EffectiveEquipment(unit) {
  const equipment = Array.isArray(unit?.equipment) ? unit.equipment : [];
  const weapon = getV39GeneratedWeapon(unit);
  if (!weapon?.slot || !canV39PlaceGeneratedWeapon(unit,weapon.slot)) return equipment;
  const {name,slot,damage,criticalPower,criticalRate,attackAp}=weapon;
  const power=Object.values(damage).reduce((sum,value)=>sum+value,0);
  return [...equipment.filter(item=>item && item.slot!==slot),{
    generated:true,name,slot,attackAp,criticalRate,criticalPower,power,range:1,rarityMultiplier:1,
    source:{装備名:name,武器分類:"剣",攻撃属性:"切断",威力:power,...damage}
  }].sort((a,b)=>(a.slot==="武器1"?0:a.slot==="武器2"?1:2)-(b.slot==="武器1"?0:b.slot==="武器2"?1:2));
}

export function buildV39GeneratedWeaponFollowUp(unit, row) {
  const weapon = getV39GeneratedWeapon(unit);
  if (!weapon || weapon.slot || !usesV39GeneratedWeaponFollowUp(row)) return null;
  return {名前:`${weapon.name}（追撃）`,行動:"A",攻撃手段:"生成武器",対象:"相手",判定:"精神",
    ...weapon.damage,Cr率:weapon.criticalRate,Cr威力:weapon.criticalPower,攻撃回数:1,生成武器追撃:true};
}
