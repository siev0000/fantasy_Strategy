import {isV39VillageContactUnit} from './v39-village-contacts.js';
import {acceptV39NeutralVillageQuest,completeV39NeutralVillageQuest} from './v39-neutral-village-rules.js';
import {openV39VillageDialogue,viewV39VillageDialogue,chooseV39VillageDialogue} from './v39-village-dialogue.js';
import {findV39VillageQuest} from './v39-village-quest-log.js';

export function submitV39VillageQuestBatch(state,playerId,villageId,entries,mapData){
  const village=state.neutralVillages?.find(row=>row.id===villageId),player=state.players.find(row=>row.id===playerId);
  if(!village||state.activePlayerId!==playerId||state.timeline?.phase!=='player'||(state.activeWorldId||'surface')!=='surface')return {ok:false,state,reason:'地上の操作ターンに依頼を選択してください'};
  if(!player?.factionState.units.some(unit=>isV39VillageContactUnit(unit,village)))return {ok:false,state,reason:'村の領土内または隣接マスに生存ユニットが必要です'};
  if(!entries.length||new Set(entries.map(row=>row.eventId)).size!==entries.length)return {ok:false,state,reason:'依頼を重複せず選択してください'};
  let working=structuredClone(state),accepted=0,reported=0;
  for(const entry of entries){
    const currentVillage=working.neutralVillages.find(row=>row.id===villageId),record=findV39VillageQuest(currentVillage,playerId,entry.eventId);
    const pending=record?.accepted&&!record.completed,definition=pending?record.numberedDefinition:entry.numberedDefinition;
    let result;
    if(definition){
      const opened=openV39VillageDialogue(working,definition,villageId,mapData);
      if(!opened.ok)return {...opened,state,reason:`${entry.label}: ${opened.reason}`};
      const view=viewV39VillageDialogue(opened.state,opened.session.instanceId,mapData),kind=pending?'依頼完了':'依頼開始';
      const choices=view.choices.filter(choice=>definition.選択肢.find(row=>row.番号===choice.番号)?.効果?.some(effect=>effect.タイプ===kind));
      if(choices.length!==1)return {ok:false,state,reason:`${entry.label}: ${pending?'報告':'受注'}条件を確認できません`};
      result=chooseV39VillageDialogue(opened.state,opened.session.instanceId,choices[0].番号,mapData);
    }else result=pending?completeV39NeutralVillageQuest(working,playerId,villageId,{eventId:entry.eventId}):acceptV39NeutralVillageQuest(working,playerId,villageId,mapData,entry.eventId);
    if(!result.ok)return {...result,state,reason:`${entry.label}: ${result.reason}`};
    working=result.state;if(pending)reported++;else accepted++;
  }
  return {ok:true,state:working,message:[accepted?`${accepted}件受注`:'',reported?`${reported}件支援・報告`:''].filter(Boolean).join(' / ')};
}
