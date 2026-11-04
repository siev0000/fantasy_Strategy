import {getHexDistance} from './hex-grid.js';
const alive=unit=>unit&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
export const isV39SelfTargetSkill=row=>!String(row?.対象||'').trim()||['自身','自分'].includes(String(row?.対象||'').trim());
export function createV39GuardLink(guardian,row,turn,duration){
  return {guardianId:guardian.id,skillName:row.名前,range:Number(row.射程)||0,expiresAtTurn:duration>0?turn+duration:0};
}
export function resolveV39GuardAssignments(state,map,area,attacker,rangeResolver){
  const units=[],owners=new Map();
  const add=(group,key)=>{for(const unit of group||[]){units.push(unit);owners.set(unit.id,key);}};
  for(const player of state?.players||[])add(player.factionState?.units,player.id);
  for(const village of state?.neutralVillages||[])add(village.defenseUnits,'village:'+village.id);
  for(const enemy of state?.enemies||[])add([enemy],'nest:'+(enemy.nestId||enemy.id));
  const byId=new Map(units.map(unit=>[unit.id,unit])),result=new Map(units.map(unit=>[unit.id,[]]));
  const turn=Number(state?.timeline?.turnNumber)||1;
  for(const unit of units){
    const key=unit.x+','+unit.y,scale=area.blockedUnitKeys?.has(key)?undefined:area.get(key);
    if(scale===undefined||!alive(unit)||(unit.worldId||'surface')!==(state.activeWorldId||'surface'))continue;
    const link=unit.guardedBy,guardian=byId.get(link?.guardianId);
    const valid=alive(guardian)&&guardian.id!==unit.id&&owners.get(guardian.id)===owners.get(unit.id)
      &&owners.get(unit.id)!==owners.get(attacker?.id)&&(guardian.worldId||'surface')===(unit.worldId||'surface')
      &&(!link.expiresAtTurn||link.expiresAtTurn>turn)
      &&getHexDistance(unit,guardian)<=rangeResolver({射程:link.range},guardian,map);
    const recipient=valid?guardian:unit;
    result.get(recipient.id).push({scale,protectedId:valid?unit.id:null});
  }
  return result;
}
