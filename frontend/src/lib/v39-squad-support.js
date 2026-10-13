import {getV39PassiveRows,collectV39PassiveBonuses,addV39PassiveValues} from "./v39-passive-rules.js";
import {isV39SquadPassive,getV39SquadMembers,matchV39SquadCondition} from "./v39-squad-passive-context.js";
const living=unit=>Number(unit?.hp ?? unit?.currentHp)>0&&unit?.state!=="死亡";
const sourceCache=new WeakMap();
export function hasV39SquadSupportSources(state) {
  if(Array.isArray(state))state={players:state};
  return [...(state?.enemies || []),...(state?.players || []).flatMap(player=>player.factionState?.units || []),
    ...(state?.neutralVillages || []).flatMap(village=>village.defenseUnits || [])]
    .some(unit=>living(unit)&&getV39PassiveRows(unit).some(isV39SquadPassive));
}
export function applyV39SquadSupport(unit,state) {
  if(!unit)return unit;
  state=state ?? globalThis.window?.getV39EnemyTurnState?.() ?? {};
  if(Array.isArray(state))state={players:state};
  const cached=sourceCache.get(state);
  let present=cached&&cached.players===state.players&&cached.enemies===state.enemies&&cached.villages===state.neutralVillages?cached.present:undefined;
  if(present===undefined){present=hasV39SquadSupportSources(state);sourceCache.set(state,{players:state.players,enemies:state.enemies,villages:state.neutralVillages,present});}
  if(!present&&![unit.squadSupportModifiers,unit.squadSupportSkillModifiers,unit.squadSupportResistanceModifiers]
    .some(values=>Object.values(values || {}).some(Boolean)))return unit;
  const members=getV39SquadMembers(unit,state),rows=new Map();
  if(living(unit))for(const source of members)for(const row of getV39PassiveRows(source)) {
    if(!isV39SquadPassive(row)||!matchV39SquadCondition(row,members)||row.攻撃手段||row.条件系統)continue;
    const target=String(row.対象 || '自身');
    if(!['自身','他部隊員','部隊全員'].includes(target))continue;
    if(target==='自身'&&source.id!==unit.id||target==='他部隊員'&&source.id===unit.id)continue;
    rows.set(row.名前 || row.name,row);
  }
  const bonus=collectV39PassiveBonuses([...rows.values()]);
  const replace=(base,old,next)=>addV39PassiveValues(addV39PassiveValues(base,
    Object.fromEntries(Object.entries(old || {}).map(([key,value])=>[key,-value]))),next);
  return {...unit,status:replace(unit.status,unit.squadSupportModifiers,bonus.status),
    skillLevels:replace(unit.skillLevels,unit.squadSupportSkillModifiers,bonus.skillLevels),
    resistances:replace(unit.resistances,unit.squadSupportResistanceModifiers,bonus.resistances),
    squadSupportModifiers:bonus.status,squadSupportSkillModifiers:bonus.skillLevels,
    squadSupportResistanceModifiers:bonus.resistances,squadSupportSkillNames:[...rows.keys()]};
}
