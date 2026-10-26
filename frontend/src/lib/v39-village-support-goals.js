import {getHexDistance} from './hex-grid.js';

const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const num=value=>Number(value)||0;
export function resolveV39VillageSupportTemplate(state,village,template,plans){
  const kind=template.計画対象,building=plans.find(item=>item.plan.facilityName&&!item.plan.blockers.length);
  const guardNeeded=!!village.defenseTraining||!(village.defenseUnits||[]).some(alive)||plans.some(item=>item.plan.stage==='安全確保');
  const common={eventId:template.ID,label:template.名前,description:template.説明,progress:0,required:1};
  if(kind==='継続支援'){
    const plan=plans.find(item=>item.row.計画対象==='食料'&&item.plan.needs?.some(need=>need.help));
    const need=plan?.plan.needs.find(item=>item.help);if(!need)return null;
    const required=Math.min(need.amount,template.数量上限);
    return {...common,type:'contract',resourceKey:need.resource,stockKind:'food',amountPerPeriod:required,
      required:template.目標ターン,period:template.周期,grace:template.猶予,nextDueTurn:num(state.timeline?.turnNumber)+template.周期};
  }
  const goals=(template.目標||[]).map(goal=>goal.タイプ==='警備'?{type:'watch',required:goal.設定.数量,progress:0,range:template.対象範囲}:
    {type:'construction',required:goal.設定.数量,facilityName:building?.plan.facilityName,progress:0});
  if(goals.some(goal=>goal.type==='watch')&&!guardNeeded)return null;
  if(goals.some(goal=>goal.type==='construction')&&(!building||village.buildings?.includes(building.plan.facilityName)))return null;
  if(!goals.length)return null;
  return {...common,type:goals.length>1?'composite':goals[0].type,supportGoals:goals,
    required:goals.length>1?goals.length:goals[0].required,range:template.対象範囲};
}
export function advanceV39VillageSupportQuest(quest,state,village,playerId,turn){
  if(!quest.supportGoals||quest.lastProgressTurn>=turn)return quest;
  const units=state.players?.find(player=>player.id===playerId)?.factionState.units||[];
  const supportGoals=quest.supportGoals.map(goal=>goal.type!=='watch'?goal:{...goal,
    progress:units.some(unit=>alive(unit)&&(unit.worldId||'surface')==='surface'&&getHexDistance(unit,village)<=goal.range)?Math.min(goal.required,num(goal.progress)+1):0});
  const next={...quest,supportGoals,lastProgressTurn:turn};
  const check=inspectV39VillageSupportQuest(next,village,turn);
  return {...next,progress:quest.type==='composite'?check.goals.filter(goal=>goal.ready).length:check.goals[0].progress};
}
export function inspectV39VillageSupportQuest(quest,village,turn){
  if(quest.type==='contract')return {ready:turn>=quest.nextDueTurn,description:`${quest.resourceKey} ${quest.amountPerPeriod} × ${quest.progress||0}/${quest.required}回 / 次回T${quest.nextDueTurn}（猶予${quest.grace}T、超過時は報告で日程更新）`};
  const goals=(quest.supportGoals||[]).map(goal=>{
    const progress=goal.type==='construction'?(village.buildings?.includes(goal.facilityName)?1:0):num(goal.progress);
    return {...goal,progress,ready:progress>=goal.required};
  });
  return {goals,ready:goals.length>0&&goals.every(goal=>goal.ready),description:goals.map(goal=>goal.type==='watch'?`警備 ${goal.progress}/${goal.required}T`:`${goal.facilityName}完成 ${goal.progress}/${goal.required}`).join(' / ')};
}
