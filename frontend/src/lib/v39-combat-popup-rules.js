import config from '../../../config/v39-combat-popups.json';
import {applyV39ActiveCombatEffects} from './v39-combat-engine.js';
export const V39_COMBAT_POPUPS=config;
const n=value=>Number.isFinite(Number(value))?Number(value):0;
export function resolveV39CombatPopup(type,amount,label=''){
  const rule=config.types[type];if(!rule)return null;
  const value=Number(Math.abs(n(amount)).toFixed(config.style.decimals));
  return {color:rule.color,text:rule.template.replaceAll('{amount}',String(value)).replaceAll('{label}',String(label)),...config.style};
}
function records(state){
  const list=[];
  for(const p of state?.players||[])for(const unit of p.factionState?.units||[])list.push({unit,effects:p.factionState.combatRuntime?.activeEffectsByUnitId?.[unit.id]||[]});
  for(const unit of state?.enemies||[])list.push({unit,effects:state.enemyCombatRuntime?.activeEffectsByEnemyId?.[unit.id]||[]});
  for(const v of state?.neutralVillages||[])for(const unit of v.defenseUnits||[])list.push({unit,effects:[]});
  return new Map(list.map(row=>[row.unit.id,row]));
}
function buffs(effects,turn){
  const adjusted=applyV39ActiveCombatEffects({status:{},skillLevels:{},resistances:{}},effects.filter(effect=>!effect.expiresAtTurn||effect.expiresAtTurn>turn));
  return {...adjusted.status,...adjusted.skillLevels,...adjusted.resistances};
}
export function collectV39CombatPopupChanges(before,after){
  if((before.activeWorldId||'surface')!==(after.activeWorldId||'surface'))return [];
  const old=records(before),entries=[];
  for(const [id,{unit,effects}] of records(after)){
    const previous=old.get(id);if(!previous)continue;
    const source=previous.unit;
    if((source.worldId||'surface')!==(unit.worldId||'surface'))continue;
    const push=(popupType,amount,popupLabel='')=>{if(amount>1e-6)entries.push({targetId:id,x:unit.x,y:unit.y,worldId:unit.worldId||'surface',popupType,popupLabel,amount,beforeHp:n(source.hp??source.currentHp),afterHp:n(unit.hp??unit.currentHp),maxHp:n(unit.maxHp),total:0});};
    if(n(source.maxHp)===n(unit.maxHp))push('hpHeal',n(unit.hp??unit.currentHp)-n(source.hp??source.currentHp));
    for(const [bucket,lossType,healType]of [['abilityDamage','abilityDamage','abilityHeal'],['abilityCurses','curse','curseHeal'],['abilityPoison','abilityDamage','abilityHeal']]){
      for(const key of new Set([...Object.keys(source[bucket]||{}),...Object.keys(unit[bucket]||{})])){
        const delta=n(unit[bucket]?.[key])-n(source[bucket]?.[key]);
        push(delta>0?lossType:healType,Math.abs(delta),bucket==='abilityPoison'?key+'（毒）':key);
      }
    }
    push('state',n(unit.restraint?.value)-n(source.restraint?.value),'拘束');
    push('state',n(unit.bleeding?.value)-n(source.bleeding?.value),'出血');
    for(const kind of ['毒','燃焼']){const value=u=>(u.periodicDamage||[]).filter(effect=>effect.kind===kind).reduce((sum,e)=>sum+n(e.value),0);push('state',value(unit)-value(source),kind);}
    const prior=buffs(previous.effects,n(before.timeline?.turnNumber)),next=buffs(effects,n(after.timeline?.turnNumber));
    for(const key of Object.keys(next))push('buff',n(next[key])-n(prior[key]),key);
  }
  return entries;
}
export function dispatchV39CombatPopupChanges(before,after,patch,options={}){
  const api=globalThis.window;
  if(!api||options.silent||options.trackUnitDeaths===false||options.reason==='save-loaded'||api.__v39AiSimulationRunning||api.__v39BackgroundWorldTurn||api.__v39SuppressCombatEffects)return;
  if(!['players','enemies','neutralVillages','enemyCombatRuntime'].some(key=>Object.hasOwn(patch,key)))return;
  const entries=collectV39CombatPopupChanges(before,after);
  if(entries.length)api.dispatchEvent(new CustomEvent('v39:unit-effect-feedback',{detail:{entries,worldId:after.activeWorldId||'surface',defer:before.timeline?.phase==='resolution'||after.timeline?.phase==='resolution'||options.reason==='skill-trigger-turn'}}));
}
