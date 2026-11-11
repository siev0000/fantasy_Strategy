import {hasV39SkillEffect} from './v39-combat-ray.js';

export const V39_CAST_ATTACK_LOCK = '詠唱中攻撃不可';
export const V39_CAST_MAINTENANCE_AP = 60;
export const hasCastAttackLock=row=>hasV39SkillEffect(row,V39_CAST_ATTACK_LOCK)
  || (row?.効果時間==='詠唱'&&hasV39SkillEffect(row,'攻撃不能'));
export const isV39CastingMagic=row=>String(row?.攻撃手段||'').includes('魔法')||String(row?.判定||'').includes('魔')||hasCastAttackLock(row);

export function isV39CastAttackLocked(state,unitId,turn){
  const cast=getV39UnitCast(state,unitId);
  return hasCastAttackLock(cast?.skillRow)&&Number(cast.resolvesAtTurn)>Number(turn);
}

export function settleV39CastingActions(faction,turn){
  const runtime=faction.combatRuntime;
  if(!runtime?.pendingActionsByUnitId)return faction;
  const pending={...runtime.pendingActionsByUnitId};
  const units=faction.units.map(unit=>{
    const cast=pending[unit.id];
    if(!hasCastAttackLock(cast?.skillRow)||!(Number(cast.resolvesAtTurn)>turn)
      ||Number(unit.hp??unit.currentHp)<=0)return unit;
    if(cast.lastMaintenanceTurn===turn)return unit;
    const ap=Number(unit.ap??unit.currentAp??0);
    const unpaidStart=cast.apPaid===false?Math.max(0,Number(cast.apCost)||0):0;
    const cost=V39_CAST_MAINTENANCE_AP+unpaidStart;
    if(ap<cost){
      delete pending[unit.id];
      return {...unit,lastActionTurn:turn};
    }
    const remaining=ap-cost;
    pending[unit.id]={...cast,apPaid:true,lastMaintenanceTurn:turn};
    return {...unit,ap:remaining,currentAp:remaining,actionPoint:remaining,lastActionTurn:turn};
  });
  return units.some((unit,index)=>unit!==faction.units[index])
    ? {...faction,units,combatRuntime:{...runtime,pendingActionsByUnitId:pending}}
    : faction;
}
export function getV39UnitCast(state,unitId){
  state=state??globalThis.window?.getV39EnemyTurnState?.();
  for(const p of state?.players||[]){const cast=p.factionState?.combatRuntime?.pendingActionsByUnitId?.[unitId];if(cast)return cast;}
  return state?.enemyCombatRuntime?.pendingActionsByEnemyId?.[unitId]||null;
}
export function describeV39Cast(cast,turn){
  if(!cast||!cast.aimAfterCast&&!isV39CastingMagic(cast.skillRow))return null;
  const remaining=Math.max(0,Math.ceil(Number(cast.resolvesAtTurn)-Number(turn||1)));
  return {remaining,ready:remaining===0,label:remaining>0?`詠唱 ${remaining}T`:'発動待ち'};
}
export function replaceV39CastOnAction(runtime={},unitId){
  if(!runtime.pendingActionsByUnitId?.[unitId]?.aimAfterCast)return runtime;
  const pendingActionsByUnitId={...runtime.pendingActionsByUnitId};delete pendingActionsByUnitId[unitId];
  return {...runtime,pendingActionsByUnitId};
}
// State-level reconciliation also catches automatic movement and AP-consuming basic actions.
export function reconcileV39Casting(previous,next,reason){
  for(const player of next.players===previous.players?[]:next.players||[]){
    const runtime=player.factionState?.combatRuntime;
    for(const [id,stored] of Object.entries(runtime?.pendingActionsByUnitId||{})){
      const unit=player.factionState.units.find(u=>u.id===id),before=previous.players?.find(p=>p.id===player.id)?.factionState?.units?.find(u=>u.id===id);
      let cast=stored;
      if(!cast.aimAfterCast&&isV39CastingMagic(cast.skillRow)&&unit){cast={...cast,aimAfterCast:true,target:null,origin:{x:unit.x,y:unit.y,worldId:unit.worldId||'surface'}};runtime.pendingActionsByUnitId[id]=cast;}
      if(!cast.aimAfterCast)continue;
      if(!cast.origin&&unit){cast={...cast,origin:{x:unit.x,y:unit.y,worldId:unit.worldId||'surface'}};runtime.pendingActionsByUnitId[id]=cast;}
      const moved=unit&&cast.origin&&(unit.x!==cast.origin.x||unit.y!==cast.origin.y||(unit.worldId||'surface')!==cast.origin.worldId);
      const spent=before&&unit&&Number(unit.ap??unit.currentAp)<Number(before.ap??before.currentAp)&&!['combat-cast-start','cast-turn-end','save-loaded','turn-start','turn-complete','sustained-upkeep'].includes(reason);
      const actionChanged=before&&unit&&unit.lastAction!==before.lastAction&&unit.lastAction&&!/待機/.test(unit.lastAction)&&reason!=='save-loaded';
      if(!unit||Number(unit.hp??unit.currentHp)<=0||moved||spent||actionChanged||unit.pendingTeleport)delete runtime.pendingActionsByUnitId[id];
    }
  }
  const runtime=next.enemyCombatRuntime;
  for(const [id,cast] of Object.entries(runtime?.pendingActionsByEnemyId||{})){
    if(!isV39CastingMagic(cast.skillRow))continue;
    const unit=next.enemies?.find(u=>u.id===id),before=previous.enemies?.find(u=>u.id===id);
    if(!cast.origin&&unit)runtime.pendingActionsByEnemyId[id]={...cast,origin:{x:unit.x,y:unit.y,worldId:unit.worldId||'surface'}};
    const origin=cast.origin;
    const moved=unit&&origin&&(unit.x!==origin.x||unit.y!==origin.y||(unit.worldId||'surface')!==origin.worldId);
    const spent=previous.enemyCombatRuntime?.pendingActionsByEnemyId?.[id]&&before&&unit&&Number(unit.ap??unit.currentAp)<Number(before.ap??before.currentAp)&&reason!=='enemy-action-queue-attack';
    if(!unit||Number(unit.hp??unit.currentHp)<=0||moved||spent)delete runtime.pendingActionsByEnemyId[id];
  }
}

export function isV39PaidCastRelease(pending,unitId,skillName,turn){
  return !!(pending?.aimAfterCast&&pending.apPaid!==false&&String(pending.unitId)===String(unitId)&&String(pending.skillName)===String(skillName)&&describeV39Cast(pending,turn)?.ready);
}
