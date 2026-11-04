import {createV39GuardLink} from './v39-unit-guarding.js';
import {parseV39TurnCount} from './v39-turn-timing.js';
import {abilityDamageTarget,addAbilityDamage,recoverAbilityDamage} from './v39-ability-damage.js';
import {DAMAGE_TYPE_FIELDS} from '../constants/unitCommon.js';
import {getV39UnitTestTechniques} from './v39-test-skill-rules.js';
import config from '../../../config/v39-skill-triggers.json';
import { addV39Bleeding, reduceV39Bleeding, tickV39Bleeding } from './v39-bleeding.js';
import { computeAttackDamage, resolveV39HarmfulEffectPower, resolveV39StateInfliction, resolveAttackRange, resolveSkillHealing, isV39SupportSkill } from './v39-combat-engine.js';
import { resolveSkillBasePower } from './skill-power.js';
import { getHexDistance } from './hex-grid.js';
import { resolveV39CorpseLifetimeTurns } from './v39-corpse-lifetime.js';

const text=value=>String(value??'').trim();
const hp=unit=>Math.max(0,Number(unit?.hp??unit?.currentHp)||0);
const alive=unit=>unit && hp(unit)>0 && unit.state!=='死亡';
export const V39_SKILL_TRIGGER_EVENTS=config.events;
export const V39_SKILL_TRIGGER_TARGETS=config.targets;
export function resolveV39SkillTriggerTarget(target,event){
  const key=text(target);
  if(!config.targets.includes(key))return null;
  if(key==='自身')return text(event.ownerId)||null;
  if(key==='発動元')return text(event.sourceId)||null;
  if(key==='攻撃者')return event.cause==='攻撃'?(text(event.attackerId)||null):null;
  return null;
}
export function getV39TriggeredSkills(unit){
  return [...new Map([...(unit?.techniques||[]),...getV39UnitTestTechniques(unit)].map(item=>{const row=item.source||item;return [text(row.名前),row];})).values()].filter(row=>text(row.行動).toUpperCase()==='P' && text(row.発動));
}

// Convert event references into ordinary damage fields before the shared calculation.
export function resolveV39TriggeredAttack(row,event){
  const effect=text(row.効果);
  if(effect==='反撃')return {...row,行動:'A',発動:'',条件:'',AP消費:0};
  const parts=effect.split('_');
  if(parts.length!==3||parts[0]!=='反撃'||!DAMAGE_TYPE_FIELDS.includes(parts[2]))return null;
  const references={出血値:['出血付与','被出血付与'],被ダメージ:['被ダメージ'],今回回復量:['回復付与','被回復']};
  if(!references[parts[1]]?.includes(event.name))return null;
  const amount=Math.max(0,Number(event.amount)||0)*config.reaction.referenceMultiplier;
  if(!amount)return null;
  const action={...row,行動:'A',発動:'',条件:'',効果:'反撃',AP消費:0};
  delete action.全威力;
  for(const key of DAMAGE_TYPE_FIELDS)delete action[key];
  action[parts[2]]=amount;
  return action;
}

export function formatV39SkillTriggerLog(log){
  if(log.kind==='bleeding-damage')return '出血：'+log.damage+'ダメージ';
  if(log.kind==='ability-damage')return (log.curse?'呪い':'能力ダメージ')+'：'+log.ability+' -'+log.amount;
  if(log.kind==='bleeding')return '出血：+'+log.amount;
  if(log.damage!==undefined)return log.skill+'：反撃威力'+log.power+' / '+log.damage+'ダメージ（'+log.event+'）';
  return log.skill+'：'+log.event+' / 回復'+(log.healing??0);
}

function context(state){
  const units=new Map(),turn=Number(state.timeline?.turnNumber)||1;
  for(const player of state.players||[])for(const unit of player.factionState?.units||[])units.set(text(unit.id),unit);
  for(const unit of state.enemies||[])units.set(text(unit.id),unit);
  for(const village of state.neutralVillages||[])for(const unit of village.defenseUnits||[])units.set(text(unit.id),unit);
  const logs=[];
  const setHp=(unit,value,cause)=>{
    const next=Math.min(Number(unit.maxHp??unit.status?.HP)||hp(unit),Math.max(0,value));
    return {...unit,hp:next,currentHp:next,...(next<=0 && hp(unit)>0?{state:'死亡',deathTurn:turn,
      deathPosition:{x:unit.x,y:unit.y},deathCause:cause,corpseRemainTurns:resolveV39CorpseLifetimeTurns(unit)}:{})};
  };
  const finish=()=>({...state,
    players:(state.players||[]).map(player=>({...player,factionState:{...player.factionState,units:(player.factionState?.units||[]).map(unit=>units.get(text(unit.id))||unit)}})),
    enemies:(state.enemies||[]).map(unit=>units.get(text(unit.id))||unit),
    neutralVillages:(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(unit=>units.get(text(unit.id))||unit)}))});
  return {units,turn,logs,setHp,finish};
}

function executeEvents(ctx, events, random){
  for(const event of events){
    const owner=ctx.units.get(text(event.ownerId));
    if(!alive(owner))continue;
    let count=0;
    for(const row of getV39TriggeredSkills(owner)){
      if(text(row.発動)!==event.name || !config.events.includes(event.name))continue;
      const condition=text(row.条件);
      if(condition && condition!==`原因_${event.cause}` && !(condition==='出血中' && Number(owner.bleeding?.value)>0))continue;
      if(count++>=config.reaction.maximumPerEvent)break;
      let actor=ctx.units.get(text(owner.id));
      if(!alive(actor))break;
      const apCost=Math.max(0,Number(row.AP消費)||0),ap=Number(actor.ap??actor.currentAp??100);
      if(ap<apCost)continue;
      const targetId=resolveV39SkillTriggerTarget(row.対象,event);
      if(!targetId)continue;
      let target=ctx.units.get(text(targetId));
      if(!alive(target) || (actor.worldId||'surface')!==(target.worldId||'surface'))continue;
      const range=resolveAttackRange(row,actor);
      if(Number.isFinite(actor.x) && Number.isFinite(target.x) && getHexDistance(actor,target)>range)continue;
      const effect=text(row.効果);
      const triggeredAttack=effect==='回復'?null:resolveV39TriggeredAttack(row,event);
      if(effect!=='回復'&&!triggeredAttack)continue;
      const reference=text(row.追加威力);
      const extra=reference==='今回付与量'||reference==='今回ダメージ'||reference==='今回回復量'?Number(event.amount)||0
        :reference==='現在出血値'?Number(actor.bleeding?.value)||0:0;
      actor={...actor,ap:ap-apCost,currentAp:ap-apCost};ctx.units.set(text(actor.id),actor);
      target=ctx.units.get(text(targetId));
      if(effect==='回復'){
        const amount=resolveSkillHealing(row,actor)+extra*config.reaction.referenceMultiplier;
        const before=hp(target),healed=ctx.setHp(target,before+amount,row.名前);
        ctx.units.set(text(target.id),reduceV39Bleeding(recoverAbilityDamage(healed,amount,{curse:String(row.効果||'').includes('呪い回復')}),hp(healed)-before));
        ctx.logs.push({kind:'trigger',event:event.name,skill:row.名前,actorId:actor.id,targetId:target.id,healing:hp(healed)-before});
      }else{
        const action={...triggeredAttack,追加威力:extra?'':row.追加威力,
          ...(extra?{全威力:Math.max(0,resolveSkillBasePower(row))+extra*config.reaction.referenceMultiplier}:{}),AP消費:0};
        const damage=computeAttackDamage({attacker:actor,target,skillRow:action,isCounter:true,random});
        ctx.units.set(text(target.id),ctx.setHp(target,hp(target)-damage.total,row.名前));
        ctx.logs.push({kind:'trigger',event:event.name,skill:row.名前,actorId:actor.id,targetId:target.id,
          amount:event.amount,power:damage.detail.power,damage:damage.total,skillRow:action,attacker:{...actor},entry:{...damage,targetId:target.id,targetName:target.name,x:target.x,y:target.y,beforeHp:hp(target),afterHp:Math.max(0,hp(target)-damage.total)}});
      }
      // Triggered actions do not enqueue more events: reactions cannot loop.
    }
  }
}

export function applyV39SkillTriggerCombat(before, after, attacker, row, entries, {random=Math.random,supportTargetIds=[]}={}){
  const all=[...(after.enemies||[]),...(after.players||[]).flatMap(p=>p.factionState?.units||[]),...(after.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];
  if(!String(row.効果||'').split(/[\s/／,:：]+/).includes('守護') && !abilityDamageTarget(row) && !Number(row.回復) && !String(row.効果||'').includes('呪い回復') && !(Number(row.出血)>0) && !all.some(unit=>unit.bleeding || getV39TriggeredSkills(unit).length))return {state:after,logs:[],events:[]};
  const ctx=context(after),old=context(before).units,events=[];
  const event=(name,ownerId,sourceId,amount=0,cause='攻撃')=>events.push({name,ownerId,sourceId,amount,cause,...(cause==='攻撃'?{attackerId:attacker.id}:{})});
  if(!isV39SupportSkill(row,attacker))event('攻撃',attacker.id,attacker.id);
  if(/壁|結界|防御|ガード/.test(text(row.効果)) || Number(row.ガード)>0)event('防御',attacker.id,attacker.id);
  if(String(row.効果||'').split(/[\s/／,:：]+/).includes('守護'))for(const id of supportTargetIds){
    const unit=ctx.units.get(id);
    if(alive(unit)&&id!==attacker.id)ctx.units.set(id,{...unit,guardedBy:createV39GuardLink(attacker,row,ctx.turn,parseV39TurnCount(row.効果時間,0))});
  }
  const seen=new Set();
  for(const entry of entries||[]){
    const id=text(entry.targetId);if(!id || seen.has(id))continue;seen.add(id);
    let target=ctx.units.get(id);if(!target)continue;
    const hit=entry.hitCount>0 || entry.hitResults?.some(hit=>hit.hit) || Number(entry.total)>0;
    if(!hit){event('回避成功',id,attacker.id);continue;}
    event('攻撃命中',attacker.id,id);event('被弾',id,attacker.id);
    const lost=Math.max(0,Number(entry.beforeHp)-Number(entry.afterHp));
    if(lost){event('被ダメージ',id,attacker.id,lost);event('ダメージ付与',attacker.id,id,lost);}
    if(Number(entry.afterHp)<=0){event('撃破',attacker.id,id);continue;}
    const ability=abilityDamageTarget(row);
    if(ability){
      const curse=Number(row.呪い)>0;
      const amount=resolveV39HarmfulEffectPower(attacker,target,row,curse?Number(row.呪い):resolveSkillBasePower(row),curse?'呪い耐性':ability+'耐性');
      target=addAbilityDamage(target,ability,amount,{curse});ctx.units.set(id,target);
      if(amount)ctx.logs.push({kind:'ability-damage',targetId:id,ability,amount,curse});
    }
    const statePower=resolveV39StateInfliction(attacker,target,row,'出血');
    if(statePower>0 && alive(target)){
      target=addV39Bleeding(target,statePower,ctx.turn);ctx.units.set(id,target);
      ctx.logs.push({kind:'bleeding',targetId:id,amount:statePower,value:target.bleeding.value});
      event('被出血付与',id,attacker.id,statePower);event('出血付与',attacker.id,id,statePower);
    }
  }
  for(const [id,unit] of ctx.units){
    const previous=old.get(id);if(!previous || !alive(unit))continue;
    const actualHealing=Number(row.回復)>0?Math.max(0,hp(unit)-hp(previous)):0;
    const targeted=supportTargetIds.includes(id)||actualHealing>0||(id===text(attacker.id)&&text(row.対象)==='自身');
    const healing=targeted?resolveSkillHealing(row,attacker):0;
    const curseHealing=String(row.効果||'').includes('呪い回復');
    if(healing>0){
      const reduced=curseHealing?recoverAbilityDamage(unit,healing,{curse:true}):reduceV39Bleeding(recoverAbilityDamage(unit,healing),actualHealing);
      ctx.units.set(id,reduced);
      const healed=actualHealing;
      event('被回復',id,attacker.id,healed,'回復');event('回復付与',attacker.id,id,healed,'回復');
      if(unit.bleeding && !reduced.bleeding){event('被状態解除',id,attacker.id,0,'回復');event('状態解除',attacker.id,id,0,'回復');}
    }
  }
  executeEvents(ctx,events,random);
  return {state:ctx.finish(),logs:ctx.logs,events};
}

export function advanceV39SkillTriggerTurn(state,turn,{random=Math.random}={}){
  const ctx=context({...state,timeline:{...state.timeline,turnNumber:turn}}),events=[];
  let changed=false;
  for(const [id,unit] of ctx.units){
    if(!alive(unit) || Number(unit.lastSkillTriggerTurn)>=turn || (!unit.bleeding && !getV39TriggeredSkills(unit).some(row=>['ターン開始','ターン終了'].includes(row.発動))))continue;
    changed=true;let next={...unit,lastSkillTriggerTurn:turn};
    events.push({name:'ターン終了',ownerId:id,sourceId:id,cause:'ターン'});
    const tick=tickV39Bleeding(next,turn);next=tick.unit;
    if(tick.damage){next=ctx.setHp(next,hp(next)-tick.damage,'出血');ctx.logs.push({kind:'bleeding-damage',targetId:id,damage:tick.damage,value:next.bleeding?.value||0});}
    ctx.units.set(id,next);
    events.push({name:'ターン開始',ownerId:id,sourceId:id,cause:'ターン'});
  }
  executeEvents(ctx,events,random);
  return {state:ctx.finish(),logs:ctx.logs,events,changed};
}

export function dispatchV39SkillTriggerEvents(state,events,{random=Math.random}={}){
  const ctx=context(state);executeEvents(ctx,events,random);return {state:ctx.finish(),logs:ctx.logs,events};
}
