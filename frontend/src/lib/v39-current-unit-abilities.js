import {applyV39RestraintPenalties} from './v39-restraint.js';
import {applyV39ActiveCombatEffects} from './v39-combat-engine.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
const n=value=>Number(value)||0;
// Shared by combat and ability displays; never writes the stored base values.
export function resolveV39CurrentUnitAbilities(unit,options={}){
  if(!unit)return unit;
  const api=globalThis.window;
  const state=options.state===undefined?(typeof api?.getV39GameState==='function'?api.getV39GameState({includeWorlds:false}):undefined):options.state;
  const mapData=options.mapData===undefined?api?.__v39FieldRuntime?.mapData:options.mapData;
  const temporaryEffects=options.temporaryEffects!==false;
  const player=state?.players?.find(p=>p.factionState?.units?.some(row=>row.id===unit.id));
  const effects=player?.factionState?.combatRuntime?.activeEffectsByUnitId?.[unit.id]||state?.enemyCombatRuntime?.activeEffectsByEnemyId?.[unit.id]||[];
  const turn=n(state?.timeline?.turnNumber);
  const active=applyV39ActiveCombatEffects(unit,temporaryEffects?effects.filter(effect=>!effect.expiresAtTurn||effect.expiresAtTurn>turn):[]);
  const penalty=Math.max(0,Math.min(1,n(active.starvationPenaltyRate)));
  const current=penalty>0?{...active,
    status:Object.fromEntries(Object.entries(active.status||{}).map(([key,value])=>[key,key==='HP'?value:Math.floor(n(value)*(1-penalty))])),
    skillLevels:Object.fromEntries(Object.entries(active.skillLevels||{}).map(([key,value])=>[key,Math.floor(n(value)*(1-penalty))]))}:active;
  const environmental=applyV39TerrainModifiers(current,mapData);
  return temporaryEffects?applyV39RestraintPenalties(environmental,state):environmental;
}

export function resolveV39UnitAbilityDisplay(unit,options={}){
  const restored={...unit};
  for(const bucket of ['status','skillLevels']){
    restored[bucket]={...unit?.[bucket]};
    const applied=unit?.abilityDamageAppliedDeltas?.[bucket];
    for(const key of Object.keys(restored[bucket])){
      const loss=applied?n(applied[key]):-(n(unit?.abilityDamage?.[key])+n(unit?.abilityCurses?.[key])+n(unit?.abilityPoison?.[key]));
      restored[bucket][key]=n(restored[bucket][key])-loss;
    }
  }
  const current=resolveV39CurrentUnitAbilities(unit,options),baseline=resolveV39CurrentUnitAbilities(restored,{...options,temporaryEffects:false}),deltas={};
  for(const bucket of ['status','skillLevels','resistances']){
    deltas[bucket]={};
    for(const key of new Set([...Object.keys(current?.[bucket]||{}),...Object.keys(baseline?.[bucket]||{})]))deltas[bucket][key]=n(current?.[bucket]?.[key])-n(baseline?.[bucket]?.[key]);
  }
  return {current,baseline,deltas};
}
