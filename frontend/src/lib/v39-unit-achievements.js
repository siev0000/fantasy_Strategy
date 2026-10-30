import config from '../../../config/v39-unit-achievements.json';
import {getHexDistance} from './hex-grid.js';
import {hasV39SkillEffect} from './v39-combat-ray.js';
import {recoverV39AttackSouls} from './v39-soul-recovery.js';

export const V39_UNIT_ACHIEVEMENT_FIELDS=config.fields;
const keys=new Set([...config.fields.map(row=>row.key),...config.destructionKinds]);
const count=value=>Math.max(0,Math.floor(Number.isFinite(Number(value))?Number(value):0));
export function addV39UnitAchievements(unit,delta){
  const values={...unit.achievements};
  for(const [key,value] of Object.entries(delta))if(keys.has(key)&&count(value)>0)values[key]=count(values[key])+count(value);
  return {...unit,achievements:values};
}
export function recordV39Walk(unit,to){
  return addV39UnitAchievements(unit,{distance:getHexDistance(unit,to)});
}
const allUnits=state=>[...(state.players||[]).flatMap(p=>p.factionState?.units||[]),...(state.enemies||[]),
  ...(state.neutralVillages||[]).flatMap(v=>v.defenseUnits||[])];

export function recordV39CombatAchievements(before,after,actor,entries,{support=false,terrainReports=[],skillRow={},supportTargetIds=[]}={}){
  const originals=new Map(allUnits(before).map(unit=>[unit.id,unit]));
  const updated=new Map(allUnits(after).map(unit=>[unit.id,unit]));
  const owners=new Map([
    ...(before.players||[]).flatMap(p=>(p.factionState?.units||[]).map(unit=>[unit.id,`player:${p.id}`])),
    ...(before.neutralVillages||[]).flatMap(v=>(v.defenseUnits||[]).map(unit=>[unit.id,`village:${v.id}`]))
  ]);
  const assassination=String(skillRow.系統||'').split(/[／/、,\s]+/).includes('暗殺');
  const delta={attacks:support?0:1,assassinations:assassination?1:0,criticals:0,kills:0,strongKills:0,heals:0,protections:0,walls:0,terrain:0,facilities:0};
  if(support&&hasV39SkillEffect(skillRow,'守護'))for(const id of new Set(supportTargetIds)){
    const target=originals.get(id),result=updated.get(id);
    if(id!==actor.id&&owners.has(actor.id)&&owners.get(actor.id)===owners.get(id)
      &&Number(target?.hp??target?.currentHp)>0&&Number(result?.hp??result?.currentHp)>0)delta.protections++;
  }
  const killed=new Set(),walls=new Set();
  for(const entry of entries){
    const target=originals.get(entry.targetId);
    if(target&&!entry.friendly&&!(owners.has(actor.id)&&owners.get(actor.id)===owners.get(target.id)))
      delta.criticals+=(entry.hitResults||[]).filter(hit=>hit.hit&&hit.critical===true).length;
    if(entry.beforeHp>0&&entry.afterHp<=0){
      if(entry.structureKind){walls.add(entry.targetId);continue;}
      if(!target||entry.friendly||(owners.has(actor.id)&&owners.get(actor.id)===owners.get(target.id))||killed.has(target.id))continue;
      killed.add(target.id);delta.kills++;
      if(Number(target.level)>=Number(actor.level))delta.strongKills++;
    }
  }
  delta.walls=walls.size;
  delta.terrain=new Set(terrainReports.filter(row=>row.kind==='ground-broken').map(row=>`${row.x},${row.y}`)).size;
  if(support)for(const [id,target] of updated){
    const old=originals.get(id);
    if(id!==actor.id&&Number(old?.hp??old?.currentHp)>0&&Number(target.hp??target.currentHp)>Number(old.hp??old.currentHp))delta.heals++;
  }
  delta.destructions=delta.walls+delta.terrain+delta.facilities;
  const apply=unit=>unit.id===actor.id?addV39UnitAchievements(unit,delta):unit;
  const villages=(after.neutralVillages||[]).map(v=>({...v,defenseUnits:(v.defenseUnits||[]).map(apply)}));
  const villageById=new Map(villages.map(v=>[v.id,v]));
  return recoverV39AttackSouls(before,{...after,players:(after.players||[]).map(p=>({...p,factionState:{...p.factionState,units:(p.factionState?.units||[]).map(apply)}})),
    enemies:(after.enemies||[]).map(apply),neutralVillages:villages,
    settlements:(after.settlements||[]).map(v=>villageById.get(v.id)||v)},actor,skillRow,support?[]:entries);
}
