import {applyV39ForcedMovement,V39_FORCED_MOVEMENT_DEFAULTS as defaults} from './v39-forced-movement.js';
import {applyV39PassiveCombatSkills,resolveAttackPower} from './v39-combat-engine.js';
import {applyV39TerrainModifiers} from './v39-terrain-modifiers.js';
import {computeSkillScaledTriplet} from './skill-power.js';
const numeric=value=>value==null||value===''||!Number.isFinite(Number(value))?null:Number(value);
export function resolveV39SkillForcedMovement(skillRow,attacker,map){
  const effects=String(skillRow?.効果||'').split(/[\s/／,，、|]+/u);
  const effect=effects.find(token=>defaults.effects[token]);
  if(!effect&&!(Number(skillRow?.ノックバック)>0))return null;
  const actor=applyV39TerrainModifiers(attacker,map);
  const adjusted=applyV39PassiveCombatSkills(actor,skillRow);
  const amount=numeric(adjusted.skillRow.ノックバック)??numeric(adjusted.skillRow.体幹);
  const power=amount==null?resolveAttackPower(skillRow,actor):computeSkillScaledTriplet({...adjusted.skillRow,全威力:amount},adjusted.attacker.status).power;
  if(power<=0)return null;
  return {power,direction:defaults.effects[effect]||defaults.direction,origin:{x:attacker.x,y:attacker.y},source:skillRow.名前||'強制移動'};
}
export function applyV39SkillForcedMovement(state,map,attacker,skillRow,hitEntries,random=Math.random){
  const spec=resolveV39SkillForcedMovement(skillRow,attacker,map);
  if(!spec)return {players:state.players,enemies:state.enemies,neutralVillages:state.neutralVillages,entries:[],damageEntries:[]};
  const seen=new Set(),requests=[];
  for(const entry of hitEntries){
    const id=entry.targetId;
    const hit=entry.hitCount>0||entry.hitResults?.some(result=>result.hit===true)||entry.total>0;
    if(!id||id===attacker.id||seen.has(id)||!hit)continue;
    seen.add(id);
    requests.push({...spec,power:spec.power*Math.max(0,Number(entry.detail?.scale??1)||0),targetIds:[id],worldId:state.activeWorldId||'surface',turn:state.timeline?.turnNumber});
  }
  return applyV39ForcedMovement(state,map,requests,random);
}
