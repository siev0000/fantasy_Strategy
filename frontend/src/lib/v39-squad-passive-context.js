import {RACE_CLASS_NAME_MAP} from "../constants/unitCommon.js";
const text=value=>String(value || "").trim();
export const isV39SquadPassive=row=>text(row?.効果)==="部隊支援" || ["他部隊員","部隊全員"].includes(text(row?.対象))
  || /^部隊(?:クラス_|種族_|統治者$)/.test(text(row?.条件));
export function getV39SquadMembers(unit,state) {
  const owners=[...(state?.players || []).map(player=>player.factionState),{units:state?.enemies,squads:state?.enemySquads},
    ...(state?.neutralVillages || []).map(village=>({units:village.defenseUnits,squads:village.squads}))];
  const owner=owners.find(row=>row?.units?.some(member=>member.id===unit.id));
  const squad=owner?.squads?.find(row=>row.unitIds?.includes(unit.id));
  const ids=new Set(squad&&!['solo','単独'].includes(squad.id)?squad.unitIds:[unit.id]);
  return (owner?.units || [unit]).filter(member=>ids.has(member.id)&&Number(member.hp ?? member.currentHp)>0
    &&member.state!=="死亡"&&(member.worldId || "surface")===(unit.worldId || "surface"));
}
export function matchV39SquadCondition(row,members) {
  const condition=text(row?.条件);
  if(!condition)return true;
  if(condition==="部隊統治者")return members.some(member=>member.isSovereign===true);
  if(condition.startsWith("部隊クラス_")) {
    const name=condition.slice("部隊クラス_".length);if(!name)return false;
    return members.some(member=>[member.className,member.secondClassName,member.derivedCharacter?.secondClassName].includes(name)
      || Number(member.classLevels?.[name])>0 || Number(member.prerequisiteClassLevels?.[name])>0);
  }
  if(condition.startsWith("部隊種族_")) {
    const name=condition.slice("部隊種族_".length);if(!name)return false;
    return members.some(member=>[member.race,member.raceName,RACE_CLASS_NAME_MAP[member.race]].includes(name));
  }
  return false;
}
