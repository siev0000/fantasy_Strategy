import {COMBAT_STATUS_FIELDS,SKILL_LEVEL_FIELDS} from '../constants/unitCommon.js';
const fields=new Set([...COMBAT_STATUS_FIELDS,...SKILL_LEVEL_FIELDS,'移動','飛行']);
const n=value=>Math.max(0,Number(value)||0);
export function abilityDamageTarget(row){
  const tokens=String(row?.効果||'').split(/[\s/／,:：|]+/);
  return tokens.filter(token=>token.endsWith('ダメージ')).map(token=>token.slice(0,-4)).find(key=>fields.has(key))||null;
}
export function addAbilityDamage(unit,key,amount,{curse=false,poison=false}={}){
  if(!fields.has(key)||!(amount>0))return unit;
  const bucket=poison?'abilityPoison':curse?'abilityCurses':'abilityDamage';
  return {...unit,[bucket]:{...unit[bucket],[key]:n(unit[bucket]?.[key])+amount}};
}
export function recoverAbilityDamage(unit,amount,{curse=false,poison=false}={}){
  if(!(amount>0))return unit;
  const bucket=poison?'abilityPoison':curse?'abilityCurses':'abilityDamage';
  return {...unit,[bucket]:Object.fromEntries(Object.entries(unit[bucket]||{}).map(([key,value])=>[key,Math.max(0,n(value)-amount)]).filter(([,value])=>value>0))};
}
export function applyAbilityDamage(unit){
  const status={...unit.status},skillLevels={...unit.skillLevels},abilityDamageAppliedDeltas={status:{},skillLevels:{}};
  const keys=new Set([...Object.keys(unit.abilityDamage||{}),...Object.keys(unit.abilityCurses||{}),...Object.keys(unit.abilityPoison||{})]);
  for(const key of keys){
    if(!fields.has(key))continue;
    const loss=n(unit.abilityDamage?.[key])+n(unit.abilityCurses?.[key])+n(unit.abilityPoison?.[key]);
    const lower=value=>key==='APP'?Number(value||0)-loss:Math.max(0,Number(value||0)-loss);
    if(key in status){const before=Number(status[key])||0;status[key]=lower(status[key]);abilityDamageAppliedDeltas.status[key]=status[key]-before;}
    if(key in skillLevels){const before=Number(skillLevels[key])||0;skillLevels[key]=lower(skillLevels[key]);abilityDamageAppliedDeltas.skillLevels[key]=skillLevels[key]-before;}
  }
  return {...unit,status,skillLevels,abilityDamageAppliedDeltas};
}
