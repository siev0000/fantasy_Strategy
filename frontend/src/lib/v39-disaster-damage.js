import {resolveV39DisasterRule} from './v39-disaster-rules.js';
import {getV39HazardRule,isV39HazardFlightAvoided} from './v39-hazard-zones.js';
import {computeAttackDamage,applyV39GuardToDamage} from './v39-combat-engine.js';

export function resolveV39DisasterDamage(event,mode='stationary') {
  const rule=resolveV39DisasterRule(event.disasterId);
  const details=event.details??rule?.details;
  let power=Math.max(0,Number(mode==='movement'?(event.movementDamagePower??rule?.movementDamagePower):(event.damagePower??rule?.damagePower))||0);
  const range=mode==='stationary'?details?.randomPowerRange:null;
  if(range&&Number.isFinite(Number(event.damageTickTurn))&&!(event.origin==='magic'&&Number.isFinite(Number(details?.magicPower)))){
    const minimum=Math.max(0,Math.floor(Number(range.minimum)||0));
    const maximum=Math.max(minimum,Math.floor(Number(range.maximum)||0));
    let hash=2166136261;
    for(const char of `${event.id||event.disasterId}:${event.damageTickTurn}`){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
    power=minimum+(hash>>>0)%(maximum-minimum+1);
  }
  const multiplier=mode==='movement'?1:Math.max(0,Number(event.stationaryDamageMultiplier??1));
  const element=event.damageElement??rule?.damageElement;
  return {power:power*multiplier,element:element==='呪い'?'魔法':element,
    sourceName:(mode==='movement'?`${event.name||rule?.name||'災害'}（通過）`:event.name||rule?.name)+(element==='呪い'?'（呪い）':''),disasterId:event.disasterId,
    components:details?.damageComponents,curse:element==='呪い'};
}

function applySingleDisasterDamage(unit,spec,turn,source='災害',random=Math.random) {
  const hp=Math.max(0,Number(unit.hp??unit.currentHp)||0);
  if(unit.state==='死亡'||hp<=0)return {unit,entry:null};
  const maxHp=Math.max(1,Number(unit.maxHp??unit.status?.HP)||hp);
  // Overlapping disasters use the strongest result, not cumulative damage.
  const specs=(Array.isArray(spec)?spec:[spec]).filter(value=>Number(value?.power)>0);
  if(!specs.length)return {unit,entry:null};
  const roll=random();
  const results=specs.map(value=>{
    const skillRow={名前:source,装備攻撃:true,効果:'必中',全威力:value.power,
      判定:value.element==='精神'||value.curse?'魔力':'',[value.element||'物理']:value.power};
    const result=computeAttackDamage({attacker:{status:{},techniques:[]},target:unit,skillRow,damageType:value.element,random:()=>roll,deferRounding:true});
    return {...applyV39GuardToDamage(unit,result),sourceName:value.sourceName,disasterId:value.disasterId};
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
  const cause=result.sourceName||source;
  return {unit:{...unit,...protection,hp:nextHp,currentHp:nextHp,...(nextHp<=0?{state:'死亡',deathCause:cause,deathTurn:turn}:{})},
    entry:damage>0?{unitId:unit.id,targetId:unit.id,name:unit.name,damage,total:damage,maxHp,beforeHp:hp,afterHp:nextHp,source:cause,disasterId:result.disasterId,x:unit.x,y:unit.y,hits:[damage],detail:result.detail}:null};
}

export function applyV39DisasterDamage(unit,spec,turn,source='災害',random=Math.random){
  const specs=Array.isArray(spec)?spec:[spec];
  if(!specs.some(value=>value?.components?.length))return applySingleDisasterDamage(unit,spec,turn,source,random);
  const roll=random(),beforeHp=Number(unit.hp??unit.currentHp)||0;
  const results=specs.map(value=>{
    if(!value?.components?.length)return applySingleDisasterDamage(unit,value,turn,source,()=>roll);
    const weight=value.components.reduce((sum,c)=>sum+Math.max(0,Number(c.weight)||0),0);
    if(!weight)return {unit,entry:null};
    let current=unit;const components=[];
    for(const component of value.components){
      const result=applySingleDisasterDamage(current,{power:value.power*Math.max(0,Number(component.weight)||0)/weight,element:component.element,sourceName:value.sourceName,disasterId:value.disasterId},turn,source,()=>roll);
      current=result.unit;if(result.entry)components.push(result.entry);
    }
    const damage=beforeHp-(Number(current.hp??current.currentHp)||0);
    return {unit:current,entry:damage>0?{...components[0],damage,total:damage,beforeHp,afterHp:current.hp,hits:[damage],
      detail:{...components[0]?.detail,resistanceKey:value.components.map(c=>c.element).join('/')+'耐性',components:components.map(entry=>({damage:entry.damage,...entry.detail}))}}:null};
  });
  const protectionCost=result=>['guard','shield','barrier'].reduce((sum,key)=>sum+Math.max(0,
    Number(key==='guard'?unit[key]:unit[key]?.remaining)||0)-(Number(key==='guard'?result.unit[key]:result.unit[key]?.remaining)||0),0);
  return results.reduce((best,result)=>{
    const damage=Number(result.entry?.damage)||0,bestDamage=Number(best.entry?.damage)||0;
    return damage>bestDamage||damage===bestDamage&&protectionCost(result)>protectionCost(best)?result:best;
  },{unit,entry:null});
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
    current={...recordV39Walk(current,point),x:point.x,y:point.y,position:[point.x,point.y]};visited.push(point);
    const key=`${point.x},${point.y}`;
    const specs=events.filter(event=>event.tileKeys?.includes(key)&&!isV39HazardFlightAvoided(current,getV39HazardRule(event.disasterId))).map(event=>resolveV39DisasterDamage(event,'movement'));
    const result=applyV39DisasterDamage(current,specs,turn,'災害通過');current=result.unit;
    if(result.entry)entries.push(result.entry);
  }
  return {unit:current,entries,path:visited};
}
import {recordV39Walk} from './v39-unit-achievements.js';
