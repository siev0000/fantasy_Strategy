import {resolveV39DisasterRule} from './v39-disaster-rules.js';
import {inspectV39ForcedMovement,applyV39ForcedMovement} from './v39-forced-movement.js';
const requestFor=event=>{
  const rule=resolveV39DisasterRule(event.disasterId);
  const configuration=event.details?.knockback??rule?.details?.knockback;
  if(!configuration)return null;
  return {source:event.name||rule?.name,origin:{x:event.x,y:event.y},
    power:event.damagePower??rule?.damagePower,configuration,direction:configuration.direction||'away',
    targetKeys:event.damageTileKeys||[],turn:event.damageTickTurn};
};
export function inspectV39DisasterKnockback(unit,event,map){
  const request=requestFor(event);
  return request?inspectV39ForcedMovement(unit,request,map):{power:0,distance:0};
}
export function applyV39DisasterKnockback(state,map,events,random=Math.random){
  return applyV39ForcedMovement(state,map,events.map(requestFor).filter(Boolean),random);
}