import {deriveV39CharacterFromRaceClass} from '../v39/unit/v39-character-derived-rules.js';
import {V39_UNDEAD_SPAWN_BALANCE} from './v39-gameplay-balance.js';
import {canV39SpeciesBecomeUndead} from './v39-undead-species-rules.js';

const half=value=>Math.floor(Math.max(0,Number(value)||0)/2);

// 基礎種族ボーナス(+5)はLvではない。実際の種族・各取得職のLvを個別に半減する。
export function buildV39UndeadInheritance(original,undeadClass='ゾンビ') {
  if(original?.soulCollected || !canV39SpeciesBecomeUndead(original,undeadClass))return null;
  const derived=deriveV39CharacterFromRaceClass(original);
  if(!derived.ok)return null;
  const classes={...derived.prerequisiteClassLevels};
  classes[derived.className]=(classes[derived.className]||0)+derived.classLevels;
  if(derived.strongAnimalClassName)classes[derived.strongAnimalClassName]=(classes[derived.strongAnimalClassName]||0)+derived.strongAnimalClassLevel;
  if(derived.secondClassName)classes[derived.secondClassName]=(classes[derived.secondClassName]||0)+1;
  const inherited=Object.fromEntries(Object.entries(classes).map(([name,lv])=>[name,half(lv)]).filter(([,lv])=>lv>0));
  const raceLevels=half(derived.raceLevels);
  const undeadLevels=Math.min(V39_UNDEAD_SPAWN_BALANCE.inheritedUndeadLevelCap,half(derived.level));
  const classLevels=undeadLevels+(inherited[undeadClass]||0);
  delete inherited[undeadClass];
  const level=raceLevels+classLevels+Object.values(inherited).reduce((sum,lv)=>sum+lv,0);
  if(level<1)return null;
  return {race:undeadClass==='ゴースト'?'ゴースト':derived.race,className:undeadClass,level,
    prerequisiteClassLevels:inherited,undeadGrowthStart:{level,raceLevels,classLevels},
    equipment:structuredClone(Array.isArray(original.equipment)?original.equipment:[]),
    combatProfile:original.combatProfile?structuredClone(original.combatProfile):null,
    undeadOrigin:{unitId:original.id,race:derived.race,level:derived.level,classLevels:classes}};
}
