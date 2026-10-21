import {getV39VillageDialogueEntries} from '../../lib/v39-village-quest-definitions.js';
export {getV39VillageDialogueEntries};
import {openV39VillageDialogue,viewV39VillageDialogue,chooseV39VillageDialogue,backV39VillageDialogue} from '../../lib/v39-village-dialogue.js';
import './v39-village-dialogue-ui.css';
import {buildV39NumberedRewardQuest} from '../../lib/v39-quest-rewards.js';
import {questRewardSummary,renderV39QuestRewardEditor} from './v39-quest-reward-ui.js';

let current=null,message='';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const map=()=>window.__v39FieldRuntime?.mapData;

export function resetV39VillageDialogue(){current=null;message='';}
export function selectV39VillageDialogueEntry(state,village,eventId){
  const definition=getV39VillageDialogueEntries(state,village).find(row=>row.ID===eventId);
  const result=openV39VillageDialogue(state,definition,village.id,map());
  if(result.ok){current={playerId:state.activePlayerId,villageId:village.id,instanceId:result.session.instanceId};message='';}
  return result;
}
export function renderV39VillageDialogue(host,state,village,{onSpeech,onRefresh,hub=false}) {
  let panel=host.querySelector('.v39-sheet-dialogue');
  if(!panel){panel=document.createElement('section');panel.className='v39-sheet-dialogue';(host.querySelector('.v39-village-choice-area')||host).append(panel);}
  const faction=state.players.find(row=>row.id===state.activePlayerId)?.factionState;
  if(current&&(current.playerId!==state.activePlayerId||current.villageId!==village.id))resetV39VillageDialogue();
  const definitions=getV39VillageDialogueEntries(state,village);
  if(hub&&!current){panel.hidden=true;panel.replaceChildren();panel.__markup='';return {active:false};}
  if(!definitions.length){panel.hidden=true;return;}
  panel.hidden=false;
  if(!hub)document.getElementById('v39-world-contact-actions').hidden=!!current;
  const view=current?viewV39VillageDialogue(state,current.instanceId,map()):null;
  const session=current?faction?.eventDialogueById?.[current.instanceId]:null;
  const quest=village.questsByPlayerId?.[state.activePlayerId];
  const rewardQuest=quest?.dialogueEventId===session?.definition?.ID?quest:buildV39NumberedRewardQuest(session?.definition);
  const primaryChoices=hub?(view?.choices||[]).filter(choice=>session?.definition?.選択肢?.find(row=>row.番号===choice.番号)?.効果?.some(term=>['依頼開始','依頼完了'].includes(term.タイプ))):[];
  const primaryChoice=primaryChoices.length===1?primaryChoices[0]:null;
  const progress=quest?.dialogueEventId?`${quest.failed?'依頼失敗':quest.completed?'依頼完了':'受注中'}: ${quest.label} / ${quest.failed?'期限切れ':quest.completed?'報酬受領済み':quest.type==='hunt'
    ?`討伐 ${quest.targetEnemyIds.filter(id=>!state.enemies.some(unit=>unit.id===id&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡')).length}/${quest.required}`
    :`${quest.resourceKey} ${quest.progress||0}/${quest.required}`}${quest.deadlineTurn?` / 期限T${quest.deadlineTurn}`:''}`:'';
  const markup=current?`<header><button type="button" data-sheet-event-list>依頼一覧へ</button><b>${escape(session?.definition?.名前||'会話')}</b>${view?.canBack?'<button type="button" data-sheet-event-back>戻る</button>':''}</header>
    <p class="v39-sheet-progress" role="status">${escape(progress)}</p>${rewardQuest?'<div data-sheet-reward-editor></div>':''}${!session?.cursor?`<p class="v39-sheet-answer">${escape(session?.definition?.説明||'ご用件をお選びください。')}</p>`:''}
    <div class="v39-sheet-choices">${(view?.choices||[]).filter(choice=>choice!==primaryChoice).map(choice=>`<button type="button" data-sheet-choice="${escape(choice.番号)}"${choice.available?'':' disabled'}><b>${escape(choice.名前)}</b>${!choice.available?`<small>${escape(choice.reason)}</small>`:''}</button>`).join('')}</div>
    <p class="v39-sheet-message" role="status" aria-live="polite">${escape(message||view?.reason||'')}</p>`
    :`<header><b>会話・依頼</b></header><p class="v39-sheet-progress">${escape(progress)}</p><div class="v39-sheet-choices">${definitions.map(row=>`<div><button type="button" data-sheet-event="${escape(row.ID)}"><b>${escape(row.名前)}</b></button>${buildV39NumberedRewardQuest(row)?questRewardSummary(state,village,buildV39NumberedRewardQuest(row)):''}</div>`).join('')}</div><p class="v39-sheet-message" role="status" aria-live="polite">${escape(message)}</p>`;
  if(panel.__markup!==markup){panel.innerHTML=markup;panel.__markup=markup;}
  if(rewardQuest)renderV39QuestRewardEditor(panel.querySelector('[data-sheet-reward-editor]'),{state,village,quest:rewardQuest,
    actor:faction.units.find(u=>u.id===faction.selectedUnitId),locked:!!(quest?.accepted&&!quest.completed)||!!(quest?.completed&&quest.dialogueEventId===session?.definition?.ID),onResult:result=>{
      message=result.message||result.reason;onSpeech('{一人称}への報酬を変えてください。',message,{speechColumn:result.ok?(result.accepted?'承諾':'拒否'):undefined});
      if(result.ok)window.setV39GameState({players:result.state.players,neutralVillages:result.state.neutralVillages,settlements:result.state.settlements},{reason:'quest-reward-negotiation'});
      onRefresh();
    }});
  const footer=host.parentElement.querySelector(':scope > output');
  if(footer&&current)footer.textContent=message||view?.reason||(quest?.failed?'依頼の期限が過ぎました。':quest?.completed?'依頼を完了しました。戻ると回答を確認できます。':'選択肢で進めます。「戻る」で前の選択肢へ戻れます。');
  // Use the existing conversation portraits and upper/lower speech, not another modal.
  function finish(result){
    if(!result)return;
    message=result.ok?'':result.reason;
    if(result.ok){
      const choice=result.session?.definition?.選択肢?.find(row=>row.番号===result.session.cursor);
      if(choice)onSpeech(choice.名前,result.answer||choice.回答);
      window.setV39GameState({players:result.state.players,neutralVillages:result.state.neutralVillages,settlements:result.state.settlements},{reason:'sheet-event-dialogue'});
    }
    onRefresh();return result;
  }
  function submitChoice(number){
    if(window.isV39MapInputLocked?.())return;
    const latest=window.getV39GameState({includeWorlds:false});
    if(latest.activePlayerId!==state.activePlayerId||!current)return;
    return finish(chooseV39VillageDialogue(latest,current.instanceId,number,map()));
  }
  panel.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-sheet-event-list')){resetV39VillageDialogue();onRefresh();return;}
    if(window.isV39MapInputLocked?.())return;
    const latest=window.getV39GameState({includeWorlds:false});
    if(latest.activePlayerId!==state.activePlayerId)return;
    let result;
    if(button.dataset.sheetEvent) {
      result=selectV39VillageDialogueEntry(latest,village,button.dataset.sheetEvent);
    } else if(button.hasAttribute('data-sheet-event-back')) result=backV39VillageDialogue(latest,current.instanceId);
    else if(button.dataset.sheetChoice){submitChoice(button.dataset.sheetChoice);return;}
    finish(result);
  };
  const primaryAction=primaryChoice?{number:primaryChoice.番号,label:session.definition.選択肢.find(row=>row.番号===primaryChoice.番号).効果.some(term=>term.タイプ==='依頼開始')?'この依頼を受注':quest?.type==='delivery'?'物資を支援':'納品・報告',disabled:!primaryChoice.available,reason:primaryChoice.reason,run:()=>submitChoice(primaryChoice.番号)}:null;
  if(quest?.type==='delivery'&&quest.accepted&&!quest.completed&&!quest.failed&&quest.dialogueEventId===session?.definition?.ID){
    const candidates=(view?.choices||[]).filter(choice=>session.definition.選択肢.find(row=>row.番号===choice.番号)?.効果?.some(term=>term.タイプ==='依頼完了'));
    if(candidates.length===1){const choice=candidates[0];return {active:!!current,primaryAction,deliveryAction:{disabled:!choice.available,reason:choice.available?'':choice.reason,run:()=>submitChoice(choice.番号)}};}
  }
  return {active:!!current,primaryAction};
}
