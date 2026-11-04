import {COMBAT_STATUS_FIELDS,SKILL_LEVEL_FIELDS} from '../constants/unitCommon.js';
const fields=new Set([...COMBAT_STATUS_FIELDS,...SKILL_LEVEL_FIELDS,'移動','飛行']);
const n=value=>Math.max(0,Number(value)||0);
export function abilityDamageTarget(row){
  const effect=String(row?.効果||'').trim();
  if(!effect.endsWith('ダメージ'))return null;
  const key=effect.slice(0,-4);
  return fields.has(key)?key:null;
}
export function addAbilityDamage(unit,key,amount,{curse=false}={}){
  if(!fields.has(key)||!(amount>0))return unit;
  const bucket=curse?'abilityCurses':'abilityDamage';
  return {...unit,[bucket]:{...unit[bucket],[key]:n(unit[bucket]?.[key])+amount}};
}
export function recoverAbilityDamage(unit,amount,{curse=false}={}){
  if(!(amount>0))return unit;
  const bucket=curse?'abilityCurses':'abilityDamage';
  return {...unit,[bucket]:Object.fromEntries(Object.entries(unit[bucket]||{}).map(([key,value])=>[key,Math.max(0,n(value)-amount)]).filter(([,value])=>value>0))};
}
export function applyAbilityDamage(unit){
  const status={...unit.status},skillLevels={...unit.skillLevels};
  const keys=new Set([...Object.keys(unit.abilityDamage||{}),...Object.keys(unit.abilityCurses||{})]);
  for(const key of keys){
    if(!fields.has(key))continue;
    const loss=n(unit.abilityDamage?.[key])+n(unit.abilityCurses?.[key]);
    const lower=value=>key==='APP'?Number(value||0)-loss:Math.max(0,Number(value||0)-loss);
    if(key in status)status[key]=lower(status[key]);
    if(key in skillLevels)skillLevels[key]=lower(skillLevels[key]);
  }
  return {...unit,status,skillLevels};
}
