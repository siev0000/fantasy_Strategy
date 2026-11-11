import config from '../../../config/v39-restraint.json';
import {getHexDistance} from './hex-grid.js';

const n=value=>Math.max(0,Number(value)||0);
const living=unit=>unit&&n(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const units=state=>[...(state?.players||[]).flatMap(p=>p.factionState?.units||[]),...(state?.enemies||[]),...(state?.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];
const world=unit=>unit?.worldId||'surface';
export function inspectV39Restraint(unit){
  const cap=Math.max(1,n(unit?.level??unit?.status?.Lv)||1)*config.capPerLevel;
  const value=Math.min(cap,n(unit?.restraint?.value)),ratio=value/cap;
  let stage=0,penalty=0;
  config.stages.forEach((rule,index)=>{if(ratio>=rule.ratio){stage=index+1;penalty=rule.penalty;}});
  return {value,cap,ratio,stage,penalty};
}
function linked(target,actor){
  return living(target)&&living(actor)&&target.id!==actor.id&&world(target)===world(actor)&&getHexDistance(target,actor)===1&&inspectV39Restraint(target).stage>0;
}
export function isV39GrappleMovementBlocked(unit,state){
  const id=unit?.restraint?.grapplerId;
  return !!id&&linked(unit,units(state).find(actor=>actor.id===id));
}
export function getV39RestraintPenalty(unit,state){
  let penalty=inspectV39Restraint(unit).penalty;
  for(const target of units(state))if(target.restraint?.grapplerId===unit?.id&&linked(target,unit))penalty=Math.max(penalty,inspectV39Restraint(target).penalty*config.grapplerPenaltyMultiplier);
  return penalty;
}
export function addV39Restraint(unit,amount,turn,grapplerId=null){
  const info=inspectV39Restraint(unit),added=Math.min(info.cap-info.value,n(amount));
  if(!added)return unit;
  const old=unit.restraint||{};
  return {...unit,restraint:{...old,value:info.value+added,lastResistanceTurn:turn,
    ...(grapplerId?{grapplerId,grappleValue:n(old.grappleValue)+added}:{})}};
}
export function resolveV39RestraintRecovery(status){
  return Math.max(config.minimumRecovery,Math.max(n(status?.攻撃),n(status?.防御))/config.recoveryDivisor);
}
export function tickV39Restraint(unit,turn,status=unit?.status){
  if(!unit?.restraint||n(unit.restraint.lastResistanceTurn)>=turn)return unit;
  const info=inspectV39Restraint(unit),recovery=resolveV39RestraintRecovery(status);
  const value=Math.max(0,info.value-recovery);
  return {...unit,restraint:value?{...unit.restraint,value,grappleValue:n(unit.restraint.grappleValue)*(value/(info.value||1)),lastResistanceTurn:turn}:null};
}
// Keep non-grapple bindings when a hold breaks; never mutate shared state units.
export function reconcileV39RestraintLinks(before,after){
  const list=units(after);
  if(!list.some(unit=>unit.restraint?.grapplerId))return after;
  const previous=new Map(units(before).map(unit=>[unit.id,unit])),current=new Map(list.map(unit=>[unit.id,unit]));
  const clean=unit=>{
    const hold=unit.restraint;if(!hold?.grapplerId)return unit;
    const actor=current.get(hold.grapplerId),old=previous.get(hold.grapplerId);
    if(linked(unit,actor)&&(!old||(old.x===actor.x&&old.y===actor.y&&world(old)===world(actor))))return unit;
    const value=Math.max(0,n(hold.value)-n(hold.grappleValue));
    return {...unit,restraint:value?{value,lastResistanceTurn:hold.lastResistanceTurn}:null};
  };
  after.players=(after.players||[]).map(p=>({...p,factionState:{...p.factionState,units:(p.factionState?.units||[]).map(clean)}}));
  after.enemies=(after.enemies||[]).map(clean);
  after.neutralVillages=(after.neutralVillages||[]).map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(clean)}));
  return after;
}
export function applyV39RestraintPenalties(unit,state){
  if(!unit)return unit;
  const multiplier=1-getV39RestraintPenalty(unit,state),previous=Number(unit.restraintAppliedMultiplier)||1;
  if(multiplier===1&&previous===1)return unit;
  return {...unit,restraintAppliedMultiplier:multiplier,status:{...unit.status,
    命中:n(unit.status?.命中)/previous*multiplier,
    速度:n(unit.status?.速度)/previous*multiplier}};
}
