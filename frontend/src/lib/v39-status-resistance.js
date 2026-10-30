import balance from '../../../config/v39-status-resistance.json';
import {computeSkillScaledTriplet} from './skill-power.js';
import {applyV39PassiveCombatSkills} from './v39-combat-engine.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
import {resolveV39ResistanceReduction} from './v39-resistance-math.js';

const n=v=>Number.isFinite(Number(v))?Number(v):0;
// State effects use a success roll, not HP damage or the damage random multiplier.
export function inspectV39StatusResistance({attacker,target,skillRow,valueKey='魔法',resistanceKey='魔法耐性',mapData}={}){
  attacker=applyV39TerrainModifiers(attacker,mapData);
  target=applyV39TerrainModifiers(target,mapData);
  const adjusted=applyV39PassiveCombatSkills(attacker,skillRow);
  target=applyV39PassiveCombatSkills(target,skillRow).attacker;
  const base=Math.max(0,n(adjusted.skillRow?.[valueKey]));
  const power=computeSkillScaledTriplet({...adjusted.skillRow,全威力:base},adjusted.attacker?.status||{}).power;
  const resistance=n(target?.status?.[resistanceKey]??target?.resistances?.[resistanceKey]);
  const mental=Math.max(0,n(target?.status?.精神));
  const reduction=resolveV39ResistanceReduction(power,target?.level??target?.status?.Lv,resistance,adjusted.attacker?.status?.耐性貫通);
  const effectivePower=reduction.reducedPower*(1-reduction.resistanceRate)/(1+mental/balance.mentalDefenseDivisor);
  const chance=base<=0?0:Math.max(balance.minimumChance,Math.min(balance.maximumChance,effectivePower/balance.chancePowerDivisor));
  return {base,power,mental,resistance,...reduction,effectivePower,chance};
}
export function resolveV39StatusResistance(options={}){
  const result=inspectV39StatusResistance(options);
  const value=Number((options.random||Math.random)());
  const roll=Number.isFinite(value)?Math.max(0,Math.min(1,value)):1;
  return {...result,roll,applied:roll<result.chance,resisted:roll>=result.chance};
}
