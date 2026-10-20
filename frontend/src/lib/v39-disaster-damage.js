import {resolveV39DisasterRule} from './v39-disaster-rules.js';
import {getV39HazardRule,isV39HazardFlightAvoided} from './v39-hazard-zones.js';
import {computeAttackDamage,applyV39GuardToDamage} from './v39-combat-engine.js';

export function resolveV39DisasterDamage(event,mode='stationary') {
  const rule=resolveV39DisasterRule(event.disasterId);
  const power=Math.max(0,Number(mode==='movement'?(event.movementDamagePower??rule?.movementDamagePower):(event.damagePower??rule?.damagePower))||0);
  const multiplier=mode==='movement'?1:Math.max(0,Number(event.stationaryDamageMultiplier??rule?.stationaryDamageMultiplier??1));
  return {power:power*multiplier,element:event.damageElement??rule?.damageElement,rate:power>0?0:resolveV39DisasterDamageRate(event,mode)};
}

export function resolveV39DisasterDamageRate(event,mode='stationary') {
  const rule=resolveV39DisasterRule(event.disasterId);
  return mode==='movement'?Math.max(0,Number(event.movementDamageRate??rule?.movementDamageRate)||0)
    :Math.max(0,Number(event.unitDamageRate)||0)*Math.max(0,Number(event.stationaryDamageMultiplier??rule?.stationaryDamageMultiplier??1));
}

export function applyV39DisasterDamage(unit,spec,turn,source='災害',random=Math.random) {
  const hp=Math.max(0,Number(unit.hp??unit.currentHp)||0);
  if(unit.state==='死亡'||hp<=0)return {unit,entry:null};
  const maxHp=Math.max(1,Number(unit.maxHp??unit.status?.HP)||hp);
  // Overlapping disasters use the strongest result, not cumulative damage.
  const specs=(Array.isArray(spec)?spec:[spec]).filter(value=>Number(value?.power)>0||Number(typeof value==='number'?value:value?.rate)>0);
  if(!specs.length)return {unit,entry:null};
  const roll=random();
  const results=specs.map(value=>{
    if(Number(value?.power)>0){
      const skillRow={名前:source,装備攻撃:true,効果:'必中',全威力:value.power,
        判定:value.element==='精神'?'魔力':'',[value.element||'物理']:value.power};
      const result=computeAttackDamage({attacker:{status:{},techniques:[]},target:unit,skillRow,damageType:value.element,random:()=>roll});
      return applyV39GuardToDamage(unit,result);
    }
    const rate=Number(typeof value==='number'?value:value?.rate)||0;
    return {total:rate>0?Math.max(1,Math.ceil(maxHp*rate-1e-9)):0};
  });
  const result=results.reduce((best,value)=>value.total>best.total?value:best,{total:0});
  const damage=Math.min(hp,result.total),nextHp=hp-damage;
  // Full absorption still consumes shield/barrier even when HP damage is zero.
  const absorbed=results.find(value=>value.barrierAbsorbed>0||value.guardAbsorbed>0||value.shieldAbsorbed>0);
  const defense=result.detail?result:absorbed;
  const protection=defense?{guard:defense.guardRemaining,
    ...(unit.shield?{shield:{...unit.shield,remaining:defense.shieldRemaining}}:{}),
    ...(unit.barrier?{barrier:{...unit.barrier,remaining:defense.barrierRemaining}}:{})}:{};
  if(damage<=0&&!defense)return {unit,entry:null};
  return {unit:{...unit,...protection,hp:nextHp,currentHp:nextHp,...(nextHp<=0?{state:'死亡',deathCause:source,deathTurn:turn}:{})},
    entry:damage>0?{unitId:unit.id,targetId:unit.id,name:unit.name,damage,total:damage,maxHp,beforeHp:hp,afterHp:nextHp,source,x:unit.x,y:unit.y,hits:[damage],detail:result.detail}:null};
}

export function applyV39DisasterMovementDamage(unit,path,state,turn=state?.timeline?.turnNumber||1) {
  const world=unit.worldId||'surface';
  const env=world===(state?.activeWorldId||'surface')?state?.worldEnvironment:state?.explorationWorlds?.[world]?.spatial?.worldEnvironment;
  const events=(env?.activeDisasters||[]).filter(event=>Number(event.startsAtTurn??1)<=turn&&Number(event.expiresAtTurn)>=turn);
  let current=unit;
  const entries=[],visited=[];
  for(const point of path||[]){
    if(current.state==='死亡'||Number(current.hp??current.currentHp)<=0)break;
    if(point.x===current.x&&point.y===current.y)continue;
    current={...current,x:point.x,y:point.y,position:[point.x,point.y]};visited.push(point);
    const key=`${point.x},${point.y}`;
    const specs=events.filter(event=>event.tileKeys?.includes(key)&&!isV39HazardFlightAvoided(current,getV39HazardRule(event.disasterId))).map(event=>resolveV39DisasterDamage(event,'movement'));
    const result=applyV39DisasterDamage(current,specs,turn,'災害通過');current=result.unit;
    if(result.entry)entries.push(result.entry);
  }
  return {unit:current,entries,path:visited};
}
