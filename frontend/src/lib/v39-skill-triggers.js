import {expandV39SkillHitEntries,aggregateV39CounterEvents} from './v39-hit-trigger-rules.js';
import {V39_CONTROL_STATUS_FIELDS,V39_ELEMENTAL_CONTROL_RESISTANCES,resolveV39ControlStatusPower,addV39ControlStatus,advanceV39ControlStatuses,thawV39Unit,getV39ActionBlock} from './v39-control-status.js';
import {V39_NUMERIC_STATUSES,resolveV39NumericStatusPower,addV39NumericStatus,recoverV39NumericStatus,readV39NumericStatus,resolveV39MaxAp,clearV39WeakerStatuses} from './v39-control-status.js';
import {addV39Restraint,tickV39Restraint,inspectV39Restraint,reconcileV39RestraintLinks} from './v39-restraint.js';
import {resolveV39CurrentUnitAbilities} from './v39-current-unit-abilities.js';
import {addV39PeriodicStatus,tickV39PeriodicStatus,recoverV39PeriodicPoison} from './v39-periodic-status.js';
import {createV39GuardLink} from './v39-unit-guarding.js';
import {parseV39TurnCount} from './v39-turn-timing.js';
import {abilityDamageTarget,addAbilityDamage,recoverAbilityDamage,reduceV39BlockedHealing} from './v39-ability-damage.js';
import {DAMAGE_TYPE_FIELDS} from '../constants/unitCommon.js';
import {getV39UnitTestTechniques} from './v39-test-skill-rules.js';
import config from '../../../config/v39-skill-triggers.json';
import { addV39Bleeding, reduceV39Bleeding, tickV39Bleeding } from './v39-bleeding.js';
import { computeAttackDamage, resolveV39HarmfulEffectPower, resolveV39StateInfliction, resolveV39StaggerDamage, resolvesV39Knockdown, resolveAttackPower, resolveAttackRange, resolveSkillHealing, isV39FireSkill, isV39SupportSkill } from './v39-combat-engine.js';
import { resolveSkillBasePower } from './skill-power.js';
import { getHexDistance } from './hex-grid.js';
import { resolveV39CorpseLifetimeTurns } from './v39-corpse-lifetime.js';
import {isV39CastAttackLocked} from './v39-casting-rules.js';

const text=value=>String(value??'').trim();
const hp=unit=>Math.max(0,Number(unit?.hp??unit?.currentHp)||0);
const alive=unit=>unit && hp(unit)>0 && unit.state!=='死亡';
export function resolveV39DrainRate(row){
  const token=text(row?.効果).split(/[\s/／,:：|]+/).find(value=>value==='ドレイン'||/^ドレイン_\d+(?:\.\d+)?$/.test(value));
  return token==='ドレイン'?1:token?Number(token.slice('ドレイン_'.length))/100:0;
}
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
  if(log.kind==='elemental-status')return log.status+(log.amount>0?'：AP -'+log.amount:'：付与');
  if(log.kind==='dispel')return '強化解除：−'+log.amount+'T';
  if(log.kind==='stagger')return '怯み：AP -'+log.amount;
  if(log.kind==='periodic-damage')return log.status+'：'+log.damage+'ダメージ';
  if(log.kind==='periodic-state')return log.status+'：+'+log.amount;
  if(log.kind==='bleeding-damage')return '出血：'+log.damage+'ダメージ';
  if(log.kind==='ability-damage')return (log.poison?'毒':log.curse?'呪い':'能力ダメージ')+'：'+log.ability+' -'+log.amount;
  if(log.kind==='bleeding')return '出血：+'+log.amount;
  if(log.damage!==undefined)return log.skill+'：反撃威力'+log.power+' / '+log.damage+'ダメージ（'+log.event+'）';
  return log.skill+'：'+log.event+' / 回復'+(log.healing??0);
}

function context(state){
  const units=new Map(),turn=Number(state.timeline?.turnNumber)||1;
  const dispelTurns=new Map();
  for(const player of state.players||[])for(const unit of player.factionState?.units||[])units.set(text(unit.id),unit);
  for(const unit of state.enemies||[])units.set(text(unit.id),unit);
  for(const village of state.neutralVillages||[])for(const unit of village.defenseUnits||[])units.set(text(unit.id),unit);
  const logs=[];
  const setHp=(unit,value,cause)=>{
    const next=Math.min(Number(unit.maxHp??unit.status?.HP)||hp(unit),Math.max(0,value));
    return {...unit,hp:next,currentHp:next,...(next<=0 && hp(unit)>0?{state:'死亡',deathTurn:turn,
      deathPosition:{x:unit.x,y:unit.y},deathCause:cause,corpseRemainTurns:resolveV39CorpseLifetimeTurns(unit)}:{})};
  };
  const shortenEffects=byUnit=>Object.fromEntries(Object.entries(byUnit).map(([id,effects])=>[id,
    dispelTurns.has(id)?effects.map(effect=>effect.expiresAtTurn>turn
      ?{...effect,expiresAtTurn:Math.max(turn,effect.expiresAtTurn-dispelTurns.get(id))}:effect):effects]));
  const finish=()=>({...state,
    players:(state.players||[]).map(player=>{
      const faction=player.factionState;
      const runtime=faction.combatRuntime;
      return {...player,factionState:{...faction,units:(faction.units||[]).map(unit=>units.get(text(unit.id))||unit),
        ...(dispelTurns.size&&runtime?.activeEffectsByUnitId?{combatRuntime:{...runtime,activeEffectsByUnitId:shortenEffects(runtime.activeEffectsByUnitId)}}:{})}};
    }),
    enemies:(state.enemies||[]).map(unit=>units.get(text(unit.id))||unit),
    ...(dispelTurns.size&&state.enemyCombatRuntime?.activeEffectsByEnemyId?{enemyCombatRuntime:{
      ...state.enemyCombatRuntime,activeEffectsByEnemyId:shortenEffects(state.enemyCombatRuntime.activeEffectsByEnemyId)}}:{}),
    neutralVillages:(state.neutralVillages||[]).map(village=>({...village,defenseUnits:(village.defenseUnits||[]).map(unit=>units.get(text(unit.id))||unit)}))});
  return {units,turn,logs,setHp,finish,state,dispelTurns};
}

function applyNumericStatusRecovery(unit,effects,amount){
  const recovers=kind=>effects.includes(kind+'回復')||(effects.includes('回復')&&effects.includes(kind));
  let next=unit;
  for(const kind of V39_NUMERIC_STATUSES){
    if(recovers(kind))next=recoverV39NumericStatus(next,kind,amount);
  }
  const frozen=next.controlStatuses?.凍結;
  if(frozen&&recovers('凍結')){
    const value=Math.max(0,frozen.value-amount);
    next=value?{...next,controlStatuses:{...next.controlStatuses,凍結:{...frozen,value}}}:thawV39Unit(next);
  }
  for(const [kind,key] of [['出血','bleeding'],['拘束','restraint']]){
    if(!recovers(kind)||!next[key])continue;
    const value=Math.max(0,next[key].value-amount);
    next={...next,[key]:value?{...next[key],value}:null};
  }
  return next;
}

function executeEvents(ctx, events, random){
  const fired=new Set();
  for(const counterPhase of [false,true])for(const event of counterPhase?aggregateV39CounterEvents(events):events){
    const owner=ctx.units.get(text(event.ownerId));
    if(!alive(owner))continue;
    let count=0;
    for(const row of getV39TriggeredSkills(owner)){
      if(text(row.発動)!==event.name || !config.events.includes(event.name))continue;
      const counter=text(row.効果)==='反撃'||text(row.効果).startsWith('反撃_');
      const reactionKey=JSON.stringify([owner.id,row.名前]);
      if(counter!==counterPhase||(counter&&fired.has(reactionKey)))continue;
      const condition=text(row.条件);
      if(condition && condition!==`原因_${event.cause}` && !(condition==='出血中' && Number(owner.bleeding?.value)>0))continue;
      if(count++>=config.reaction.maximumPerEvent)break;
      let actor=ctx.units.get(text(owner.id));
      if(!alive(actor))break;
      if(getV39ActionBlock(actor,ctx.turn,'passive',row))continue;
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
      if(triggeredAttack&&isV39CastAttackLocked(ctx.state,actor.id,ctx.turn))continue;
      const reference=text(row.追加威力);
      const extra=reference==='今回付与量'||reference==='今回ダメージ'||reference==='今回回復量'?Number(event.amount)||0
        :reference==='現在出血値'?Number(actor.bleeding?.value)||0:0;
      if(counter)fired.add(reactionKey);
      actor={...actor,ap:ap-apCost,currentAp:ap-apCost};ctx.units.set(text(actor.id),actor);
      target=ctx.units.get(text(targetId));
      if(effect==='回復'){
        const curseHealing=text(row.効果).includes('呪い回復');
        const power=resolveSkillHealing(row,actor)+extra*config.reaction.referenceMultiplier;
        const amount=reduceV39BlockedHealing(target,power);
        const before=hp(target),healed=ctx.setHp(target,before+amount,row.名前);
        const recovered=reduceV39Bleeding(recoverAbilityDamage(healed,curseHealing?power:amount,{curse:curseHealing}),hp(healed)-before);
        ctx.units.set(text(target.id),applyNumericStatusRecovery(recovered,text(row.効果).split(/[\s/／,:：|]+/),power));
        ctx.logs.push({kind:'trigger',event:event.name,skill:row.名前,actorId:actor.id,targetId:target.id,healing:hp(healed)-before});
      }else{
        const action={...triggeredAttack,追加威力:extra?'':row.追加威力,
          ...(extra?{全威力:Math.max(0,resolveSkillBasePower(row))+extra*config.reaction.referenceMultiplier}:{}),AP消費:0};
        const damage=computeAttackDamage({attacker:actor,target,skillRow:action,isCounter:true,random});
        const fire=isV39FireSkill(action,actor);
        if(fire)ctx.units.set(text(actor.id),thawV39Unit(actor));
        const damaged=ctx.setHp(target,hp(target)-damage.total,row.名前);
        ctx.units.set(text(target.id),fire&&damage.hitCount>0?thawV39Unit(damaged):damaged);
        ctx.logs.push({kind:'trigger',event:event.name,skill:row.名前,actorId:actor.id,targetId:target.id,
          amount:event.amount,power:damage.detail.power,damage:damage.total,skillRow:action,attacker:{...actor},entry:{...damage,targetId:target.id,targetName:target.name,x:target.x,y:target.y,beforeHp:hp(target),afterHp:Math.max(0,hp(target)-damage.total)}});
      }
      // Triggered actions do not enqueue more events: reactions cannot loop.
    }
  }
}

export function applyV39SkillTriggerCombat(before, after, attacker, row, entries, {random=Math.random,supportTargetIds=[]}={}){
  const effects=text(row.効果).split(/[\s/／,:：|]+/);
  const knockdown=effects.includes('転倒')||effects.includes('打ち倒し');
  const controlPowers=Object.keys(V39_CONTROL_STATUS_FIELDS)
    .map(kind=>[kind,resolveV39ControlStatusPower(row,effects,kind)])
    .filter(([,power])=>power>0);
  const numericPowers=V39_NUMERIC_STATUSES
    .map(kind=>[kind,resolveV39NumericStatusPower(row,effects,kind)]).filter(([,power])=>power>0);
  const dispelRow={
    ...row,
    判定:text(row.判定)||'魔力',
    全威力:Math.max(0,Number(row.魔法)||0),
    装備攻撃:true
  };
  const dispelPower=effects.includes('強化解除')?resolveAttackPower(dispelRow,attacker):0;
  const all=[...(after.enemies||[]),...(after.players||[]).flatMap(p=>p.factionState?.units||[]),...(after.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];
  const blocksHealing=effects.includes('回復阻害')&&Number(row.呪い)>0;
  const fire=isV39FireSkill(row,attacker),purifies=effects.includes('浄化');
  const canThaw=(fire||purifies)&&all.some(unit=>unit.controlStatuses?.凍結);
  if(!canThaw && !knockdown && !blocksHealing && !controlPowers.length && !numericPowers.length && !dispelPower && !effects.includes('守護') && !abilityDamageTarget(row) && !Number(row.回復) && !String(row.効果||'').includes('呪い回復') && !String(row.効果||'').includes('毒回復') && !resolveV39DrainRate(row) && !effects.includes('吸血') && !effects.includes('燃焼') && !(Number(row.毒)>0) && !(Number(row.燃焼)>0) && !(Number(row.拘束)>0) && !(Number(row.出血)>0) && !(Number(row.怯み)>0) && !all.some(unit=>unit.bleeding || getV39TriggeredSkills(unit).length))return {state:after,logs:[],events:[]};
  const ctx=context(after),old=context(before).units,events=[];
  const event=(name,ownerId,sourceId,amount=0,cause='攻撃')=>events.push({name,ownerId,sourceId,amount,cause,...(cause==='攻撃'?{attackerId:attacker.id}:{})});
  const thaw=unit=>{
    const next=thawV39Unit(unit);
    if(next!==unit){
      event('被状態解除',unit.id,attacker.id,0,'解除');
      event('状態解除',attacker.id,unit.id,0,'解除');
    }
    return next;
  };
  if(canThaw){
    const ids=new Set([...(fire?[text(attacker.id)]:[]),...(purifies?supportTargetIds:[])]);
    for(const id of ids){
      const unit=ctx.units.get(id);
      if(alive(unit))ctx.units.set(id,thaw(unit));
    }
  }
  if(!isV39SupportSkill(row,attacker))event('攻撃',attacker.id,attacker.id);
  if(/壁|結界|防御|ガード/.test(text(row.効果)) || Number(row.ガード)>0)event('防御',attacker.id,attacker.id);
  if(String(row.効果||'').split(/[\s/／,:：]+/).includes('守護'))for(const id of supportTargetIds){
    const unit=ctx.units.get(id);
    if(alive(unit)&&id!==attacker.id)ctx.units.set(id,{...unit,guardedBy:createV39GuardLink(attacker,row,ctx.turn,parseV39TurnCount(row.効果時間,0))});
  }
  let drainDamage=0,bloodRecovery=0;
  for(const entry of expandV39SkillHitEntries(entries)){
    const id=text(entry.targetId),committed=ctx.units.get(id);if(!committed)continue;
    const intermediate=Number(entry.afterHp)>0;
    let target=intermediate?{...committed,hp:Number(entry.afterHp),currentHp:Number(entry.afterHp),state:old.get(id)?.state}:committed;
    const storeTarget=unit=>ctx.units.set(id,{...unit,hp:committed.hp,currentHp:committed.currentHp,state:committed.state});
    const hit=entry.hitCount>0 || entry.hitResults?.some(hit=>hit.hit) || Number(entry.total)>0;
    if(!hit){event('回避成功',id,attacker.id);continue;}
    event('攻撃命中',attacker.id,id);event('被弾',id,attacker.id);
    const lost=Math.max(0,Number(entry.beforeHp)-Math.max(0,Number(entry.afterHp)));
    if(id!==attacker.id)drainDamage+=lost;
    if(lost){event('被ダメージ',id,attacker.id,lost);event('ダメージ付与',attacker.id,id,lost);}
    if(Number(entry.afterHp)<=0){event('撃破',attacker.id,id);continue;}
    for(const [status,base] of entry.forcedMovementCollision?[]:numericPowers){
      const receiver=resolveV39CurrentUnitAbilities(target,{state:after});
      const stat=key=>Number(receiver.skillLevels?.[key]??receiver.status?.[key])||0;
      const defense=status==='盲目'?stat('反応'):status==='幻覚'?stat('精神')+stat('看破'):undefined;
      const amount=resolveV39HarmfulEffectPower(attacker,receiver,row,base,status,{defense});
      if(amount<=0)continue;
      const previous=target;
      target=addV39NumericStatus(target,status,amount);
      storeTarget(target);
      ctx.logs.push({kind:'periodic-state',status,targetId:id,amount,hitPopupType:'state',hitIndex:entry.hitIndex,
        apLoss:status==='麻痺'?Number(previous.ap??previous.currentAp??100)-Number(target.ap??target.currentAp??100):0,
        maxApLoss:status==='疲労'?resolveV39MaxAp(previous)-resolveV39MaxAp(target):0});
    }
    if(dispelPower>0&&!entry.forcedMovementCollision){
      const total=(Number(target.dispelRemainder)||0)+dispelPower;
      const turns=Math.floor(total/100);
      target={...target,dispelRemainder:total%100};
      if(turns){
        const already=ctx.dispelTurns.get(id)||0;
        const owner=after.players?.find(player=>player.factionState?.combatRuntime?.activeEffectsByUnitId?.[id]);
        const effects=owner?.factionState.combatRuntime.activeEffectsByUnitId[id]
          ??after.enemyCombatRuntime?.activeEffectsByEnemyId?.[id]??[];
        let shortened=Math.max(0,...effects.map(effect=>Math.min(turns,Number(effect.expiresAtTurn||0)-ctx.turn-already)));
        ctx.dispelTurns.set(id,already+turns);
        for(const key of ['shield','barrier','guardedBy']){
          const effect=target[key];
          if(effect?.expiresAtTurn>ctx.turn){
            shortened=Math.max(shortened,Math.min(turns,effect.expiresAtTurn-ctx.turn));
            const expiresAtTurn=effect.expiresAtTurn-turns;
            target[key]=expiresAtTurn>ctx.turn?{...effect,expiresAtTurn}:null;
          }
        }
        if(target.guardExpiresAtTurn>ctx.turn){
          shortened=Math.max(shortened,Math.min(turns,target.guardExpiresAtTurn-ctx.turn));
          target.guardExpiresAtTurn=Math.max(ctx.turn,target.guardExpiresAtTurn-turns);
          if(target.guardExpiresAtTurn===ctx.turn)target.guard=0;
        }
        if(shortened>0)ctx.logs.push({kind:'dispel',status:'強化解除',targetId:id,amount:shortened,hitPopupType:'durationDamage',hitIndex:entry.hitIndex});
      }
      storeTarget(target);
    }
    if((fire||purifies)&&!entry.forcedMovementCollision&&target.controlStatuses?.凍結){
      target=thaw(target);
      storeTarget(target);
    }
    if(blocksHealing&&!entry.forcedMovementCollision){
      const receiver=resolveV39CurrentUnitAbilities(target,{state:after});
      const amount=resolveV39HarmfulEffectPower(attacker,receiver,row,Number(row.呪い),'呪い');
      if(amount>0){
        target=addAbilityDamage(target,'回復阻害',amount,{curse:true});
        storeTarget(target);
        ctx.logs.push({kind:'periodic-state',status:'回復阻害',targetId:id,amount,hitPopupType:'curse',hitIndex:entry.hitIndex});
      }
    }
    for(const [status,base] of entry.forcedMovementCollision?[]:controlPowers){
      const receiver=resolveV39CurrentUnitAbilities(target,{state:after});
      const amount=resolveV39HarmfulEffectPower(attacker,receiver,row,base,status==='睡眠'?'精神攻撃':status);
      if(amount<=0)continue;
      const beforeAp=Number(target.ap??target.currentAp??100);
      target=addV39ControlStatus(target,status,amount,ctx.turn);
      storeTarget(target);
      const apLoss=beforeAp-Number(target.ap??target.currentAp??100);
      if(V39_ELEMENTAL_CONTROL_RESISTANCES[status]){
        ctx.logs.push({kind:'elemental-status',status,targetId:id,amount:apLoss,hitPopupType:'apDamage',hitIndex:entry.hitIndex});
      }else{
        ctx.logs.push({kind:'periodic-state',status,targetId:id,amount,hitPopupType:'state',hitIndex:entry.hitIndex,apLoss});
      }
    }
    if(!entry.forcedMovementCollision&&Number(row.怯み)>0){
      const receiver=resolveV39CurrentUnitAbilities(target,{state:after});
      const ap=Math.max(0,Number(target.ap??target.currentAp??100));
      const amount=Math.min(ap,resolveV39StaggerDamage(attacker,receiver,row,random));
      if(amount>0){
        target={...target,ap:ap-amount,currentAp:ap-amount,actionPoint:ap-amount,staggeredTurn:ap===amount?ctx.turn:null};
        storeTarget(target);
        ctx.logs.push({kind:'stagger',status:'怯み',targetId:id,amount,ap:target.ap,hitPopupType:'apDamage',hitIndex:entry.hitIndex});
        if(amount>=15){
          event('怯ませ',attacker.id,id,amount);
          event('被怯み',id,attacker.id,amount);
        }
      }
    }
    if(knockdown&&!entry.forcedMovementCollision&&!target.knockedDown&&resolvesV39Knockdown(attacker,resolveV39CurrentUnitAbilities(target,{state:after}),row,random)){
      target={...target,knockedDown:true,guard:0};
      storeTarget(target);
      ctx.logs.push({kind:'periodic-state',status:'転倒',targetId:id,amount:1,hitPopupType:'state',hitIndex:entry.hitIndex});
    }
    const ability=abilityDamageTarget(row);
    if(ability){
      const curse=Number(row.呪い)>0,poison=!curse&&Number(row.毒)>0;
      const amount=resolveV39HarmfulEffectPower(attacker,target,row,curse?Number(row.呪い):poison?Number(row.毒):resolveSkillBasePower(row),curse?'呪い':poison?'毒':ability+'ダメージ');
      target=addAbilityDamage(target,ability,amount,{curse,poison});storeTarget(target);
      if(amount)ctx.logs.push({kind:'ability-damage',targetId:id,ability,amount,curse,poison,
        hitPopupType:curse?'curse':'abilityDamage',popupLabel:poison?ability+'（毒）':ability,hitIndex:entry.hitIndex});
    }
    const statePower=resolveV39StateInfliction(attacker,target,row,'出血');
    if(statePower>0 && alive(target)){
      target=addV39Bleeding(target,statePower,ctx.turn);storeTarget(target);
      ctx.logs.push({kind:'bleeding',status:'出血',targetId:id,amount:statePower,value:target.bleeding.value,hitPopupType:'state',hitIndex:entry.hitIndex});
      event('被出血付与',id,attacker.id,statePower);event('出血付与',attacker.id,id,statePower);
      if(effects.includes('吸血')&&id!==attacker.id)bloodRecovery+=statePower;
    }
    const grapple=effects.includes('組み付き');
    const otherHold=[...ctx.units.values()].some(unit=>unit.id!==id&&unit.restraint?.grapplerId===attacker.id&&inspectV39Restraint(unit).stage);
    const occupied=target.restraint?.grapplerId&&target.restraint.grapplerId!==attacker.id;
    if(Number(row.拘束)>0&&(!grapple||(!otherHold&&!occupied&&getHexDistance(attacker,target)===1))){
      const source=resolveV39CurrentUnitAbilities(attacker,{state:after});
      const receiver=resolveV39CurrentUnitAbilities(target,{state:after});
      const resistance={...receiver,status:{...receiver.status,防御:Math.max(Number(receiver.status?.攻撃)||0,Number(receiver.status?.防御)||0)}};
      const power=resolveV39StateInfliction(source,resistance,row,'拘束',{judgement:'最大_攻撃_防御'});
      const prior=inspectV39Restraint(target).value;
      target=addV39Restraint(target,power,ctx.turn,grapple?attacker.id:null);storeTarget(target);
      const info=inspectV39Restraint(target),amount=info.value-prior;
      if(amount>0){
        ctx.logs.push({kind:'periodic-state',status:grapple?'組み付き':'拘束',targetId:id,amount,hitPopupType:'state',hitIndex:entry.hitIndex});
        if(info.stage){event('拘束',attacker.id,id,amount);event('被拘束',id,attacker.id,amount);}
      }
    }
    const duration=parseV39TurnCount(row.効果時間,config.periodic.defaultDurationTurns);
    for(const [status,base]of [
      ['毒',effects.includes('毒')||(!ability&&!effects.includes('麻痺'))?Number(row.毒)||0:0],
      ['燃焼',Number(row.燃焼)||(effects.includes('燃焼')?Number(row.炎)||0:0)]
    ]){
      const amount=resolveV39HarmfulEffectPower(attacker,target,row,base,status);
      if(amount>0){
        target=addV39PeriodicStatus(target,status,amount,duration,ctx.turn);
        storeTarget(target);
        ctx.logs.push({kind:'periodic-state',status,targetId:id,amount,hitPopupType:'state',hitIndex:entry.hitIndex});
      }
    }
  }
  for(const [id,unit] of ctx.units){
    const previous=old.get(id);if(!previous || !alive(unit))continue;
    const actualHealing=Number(row.回復)>0?Math.max(0,hp(unit)-hp(previous)):0;
    const targeted=supportTargetIds.includes(id)||actualHealing>0||(id===text(attacker.id)&&text(row.対象)==='自身');
    const healing=targeted?resolveSkillHealing(row,attacker):0;
    if(effects.includes('状態解除')){
      const reduced=clearV39WeakerStatuses(unit,healing);
      if(reduced!==unit){
        ctx.units.set(id,reduced);
        event('被状態解除',id,attacker.id,healing,'解除');
        event('状態解除',attacker.id,id,healing,'解除');
      }
      continue;
    }
    const curseHealing=effects.includes('呪い回復')||effects.includes('呪い')&&effects.includes('回復');
    const poisonHealing=effects.includes('毒回復')||effects.includes('毒')&&effects.includes('回復');
    if(healing>0){
      let reduced=unit;
      if(poisonHealing)reduced=recoverV39PeriodicPoison(recoverAbilityDamage(reduced,healing,{poison:true}),healing);
      if(curseHealing)reduced=recoverAbilityDamage(reduced,healing,{curse:true});
      if(!poisonHealing&&!curseHealing){
        reduced=recoverAbilityDamage(reduced,reduceV39BlockedHealing(reduced,healing));
        if(!effects.includes('出血回復')&&!(effects.includes('出血')&&effects.includes('回復')))reduced=reduceV39Bleeding(reduced,actualHealing);
      }
      reduced=applyNumericStatusRecovery(reduced,effects,healing);
      ctx.units.set(id,reduced);
      const healed=actualHealing;
      event('被回復',id,attacker.id,healed,'回復');event('回復付与',attacker.id,id,healed,'回復');
      const cleared=unit.bleeding&&!reduced.bleeding||unit.restraint&&!reduced.restraint
        || unit.controlStatuses?.凍結&&!reduced.controlStatuses?.凍結
        || V39_NUMERIC_STATUSES.some(kind=>readV39NumericStatus(unit,kind)>0&&!readV39NumericStatus(reduced,kind));
      if(cleared){event('被状態解除',id,attacker.id,0,'回復');event('状態解除',attacker.id,id,0,'回復');}
    }
  }
  for(const [eventName,amount]of [['ドレイン',Math.floor(drainDamage*resolveV39DrainRate(row))],['吸血',bloodRecovery]]){
    const actor=ctx.units.get(text(attacker.id));
    if(amount<=0||!alive(actor))continue;
    const effectiveHealing=reduceV39BlockedHealing(actor,amount);
    const healed=ctx.setHp(actor,hp(actor)+effectiveHealing,row.名前),actual=hp(healed)-hp(actor);
    ctx.units.set(text(actor.id),reduceV39Bleeding(recoverAbilityDamage(healed,effectiveHealing),actual));
    ctx.logs.push({kind:'trigger',event:eventName,skill:row.名前,actorId:actor.id,targetId:actor.id,healing:actual});
  }
  executeEvents(ctx,events,random);
  return {state:reconcileV39RestraintLinks(before,ctx.finish()),logs:ctx.logs,events};
}

export function advanceV39SkillTriggerTurn(state,turn,{random=Math.random}={}){
  const ctx=context({...state,timeline:{...state.timeline,turnNumber:turn}}),events=[];
  let changed=false;
  for(const [id,unit] of ctx.units){
    if(!alive(unit) || Number(unit.lastSkillTriggerTurn)>=turn || (!unit.controlStatuses?.凍結 && !(unit.controlStatuses?.感電?.expiresAtTurn>turn) && !unit.restraint && !unit.bleeding && !unit.periodicDamage?.length && !getV39TriggeredSkills(unit).some(row=>['ターン開始','ターン終了'].includes(row.発動))))continue;
    changed=true;let next={...unit,lastSkillTriggerTurn:turn};
    events.push({name:'ターン終了',ownerId:id,sourceId:id,cause:'ターン'});
    next=tickV39Restraint(next,turn,resolveV39CurrentUnitAbilities(unit,{state}).status);
    next=advanceV39ControlStatuses(next,turn);
    const tick=tickV39Bleeding(next,turn);next=tick.unit;
    if(tick.damage){const damage=Math.min(hp(next),tick.damage);next=ctx.setHp(next,hp(next)-damage,'出血');ctx.logs.push({kind:'bleeding-damage',targetId:id,damage,value:next.bleeding?.value||0});}
    const periodic=tickV39PeriodicStatus(next,turn);next=periodic.unit;
    for(const entry of periodic.entries){if(!alive(next))break;const damage=Math.min(hp(next),entry.damage);next=ctx.setHp(next,hp(next)-damage,entry.kind);if(damage)ctx.logs.push({kind:'periodic-damage',status:entry.kind,targetId:id,damage});}
    ctx.units.set(id,next);
    events.push({name:'ターン開始',ownerId:id,sourceId:id,cause:'ターン'});
  }
  executeEvents(ctx,events,random);
  return {state:reconcileV39RestraintLinks(state,ctx.finish()),logs:ctx.logs,events,changed};
}

export function dispatchV39SkillTriggerEvents(state,events,{random=Math.random}={}){
  const ctx=context(state);executeEvents(ctx,events,random);return {state:ctx.finish(),logs:ctx.logs,events};
}
