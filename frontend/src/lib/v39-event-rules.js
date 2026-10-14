// JSONのIDではなく、条件・生成方式・目標・効果の種類で処理する共通基盤。
const list=value=>Array.isArray(value)?value:value&&typeof value==='object'?[value]:[];
const number=value=>Number(value)||0;
const compare=(actual,condition)=>{
  if(condition.比較==='一致')return actual===condition.値;
  if(condition.比較==='>=')return number(actual)>=number(condition.値);
  if(condition.比較==='<=')return number(actual)<=number(condition.値);
  return false;
};
export function inspectV39EventDefinition(row) {
  const reasons=[];
  if(!row?.ID)reasons.push('IDがありません');
  if(row?.イベント種別!=='依頼')reasons.push(`未対応種別: ${row?.イベント種別||'未設定'}`);
  for(const condition of list(row?.発生条件))if(!['一般村友好度','プレイヤー種族'].includes(condition.タイプ))reasons.push(`未対応条件: ${condition.タイプ}`);
  if(!['周辺脅威','村不足資源','指定物資'].includes(row?.生成設定?.方式))reasons.push(`未対応生成方式: ${row?.生成設定?.方式||'未設定'}`);
  const goals=list(row?.目標);
  if(goals.length!==1||!['納品','討伐'].includes(goals[0]?.タイプ))reasons.push('未対応目標構成');
  for(const effect of list(row?.完了効果))if(!['一般村友好度変更','村産出資源受取','魂要求権付与'].includes(effect.タイプ))reasons.push(`未対応完了効果: ${effect.タイプ}`);
  for(const effect of list(row?.失敗効果))if(effect.タイプ!=='一般村友好度変更')reasons.push(`未対応失敗効果: ${effect.タイプ}`);
  const accept=list(row?.選択肢).find(choice=>list(choice.効果).some(effect=>effect.タイプ==='依頼開始'));
  if(!accept)reasons.push('依頼開始の選択肢がありません');
  if(accept&&list(accept.選択条件).length)reasons.push('未対応選択条件');
  for(const effect of list(accept?.効果))if(effect.タイプ!=='依頼開始')reasons.push(`未対応開始効果: ${effect.タイプ}`);
  return reasons;
}
export function isV39EventReady(row,{player,relation,lastCompletedTurn,turn}) {
  if(inspectV39EventDefinition(row).length||!player)return false;
  if(lastCompletedTurn!=null&&(row.再発生===false||turn<lastCompletedTurn+number(row.クールダウン)))return false;
  return list(row.発生条件).every(condition=>compare(condition.タイプ==='一般村友好度'?relation:player.race,condition));
}
export function createV39EventQuest(row,context,adapters) {
  if(!isV39EventReady(row,context))return null;
  const resolved=adapters[row.生成設定.方式]?.(row.生成設定,row);
  if(!resolved)return null;
  return {...resolved,eventId:row.ID,label:resolved.label||row.名前,accepted:true,createdTurn:context.turn,completed:false,
    eventDefinition:structuredClone(row),deadlineTurn:number(row.期限ターン)>0?context.turn+number(row.期限ターン):0};
}
export function applyV39EventEffects(state,effects,adapters) {
  // 適用前にすべて検証し、未知の効果を黙って無視しない。失敗時は元のstateを返す。
  if(list(effects).some(effect=>typeof adapters[effect.タイプ]!=='function'))return {ok:false,state,reason:'未対応のイベント効果があります'};
  let working=state;
  for(const effect of list(effects)) {
    const result=adapters[effect.タイプ](working,effect.設定||{});
    if(!result?.ok)return {ok:false,state,reason:result?.reason||'イベント効果を適用できません'};
    working=result.state;
  }
  return {ok:true,state:working};
}
