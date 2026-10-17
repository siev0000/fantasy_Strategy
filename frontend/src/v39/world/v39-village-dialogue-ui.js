import {getGameDataRows} from '../../lib/game-data-registry.js';
import fixture from '../../../../config/v39-village-incident-test.json';
import {openV39VillageDialogue,viewV39VillageDialogue,chooseV39VillageDialogue,backV39VillageDialogue} from '../../lib/v39-village-dialogue.js';
import './v39-village-dialogue-ui.css';

let current=null,message='';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const map=()=>window.__v39FieldRuntime?.mapData;

export function resetV39VillageDialogue(){current=null;message='';}
export function renderV39VillageDialogue(host,state,village,{onSpeech,onRefresh}) {
  let panel=host.querySelector('.v39-sheet-dialogue');
  if(!panel){panel=document.createElement('section');panel.className='v39-sheet-dialogue';(host.querySelector('.v39-village-choice-area')||host).append(panel);}
  const faction=state.players.find(row=>row.id===state.activePlayerId)?.factionState;
  if(current&&(current.playerId!==state.activePlayerId||current.villageId!==village.id))resetV39VillageDialogue();
  const saved=Object.values(faction?.eventDialogueById||{}).filter(row=>row.contextId===village.id&&!row.closed).map(row=>row.definition).filter(Boolean);
  const definitions=[...new Map([...getGameDataRows('イベント会話').filter(row=>row.分類==='一般村'),
    ...(village.incidentTest?fixture.numberedEvents||[]:[]),...saved].map(row=>[row.ID,row])).values()];
  if(!definitions.length){panel.hidden=true;return;}
  panel.hidden=false;
  document.getElementById('v39-world-contact-actions').hidden=!!current;
  const view=current?viewV39VillageDialogue(state,current.instanceId,map()):null;
  const session=current?faction?.eventDialogueById?.[current.instanceId]:null;
  const quest=village.questsByPlayerId?.[state.activePlayerId];
  const progress=quest?.dialogueEventId?`${quest.failed?'依頼失敗':quest.completed?'依頼完了':'受注中'}: ${quest.label} / ${quest.failed?'期限切れ':quest.completed?'報酬受領済み':quest.type==='hunt'
    ?`討伐 ${quest.targetEnemyIds.filter(id=>!state.enemies.some(unit=>unit.id===id&&Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡')).length}/${quest.required}`
    :`${quest.resourceKey} ${quest.progress||0}/${quest.required}`}${quest.deadlineTurn?` / 期限T${quest.deadlineTurn}`:''}`:'';
  const markup=current?`<header><button type="button" data-sheet-event-list>依頼一覧へ</button><b>${escape(session?.definition?.名前||'会話')}</b>${view?.canBack?'<button type="button" data-sheet-event-back>戻る</button>':''}</header>
    <p class="v39-sheet-progress" role="status">${escape(progress)}</p>${!session?.cursor?`<p class="v39-sheet-answer">${escape(session?.definition?.説明||'ご用件をお選びください。')}</p>`:''}
    <div class="v39-sheet-choices">${(view?.choices||[]).map(choice=>`<button type="button" data-sheet-choice="${escape(choice.番号)}"${choice.available?'':' disabled'}><b>${escape(choice.名前)}</b>${!choice.available?`<small>${escape(choice.reason)}</small>`:''}</button>`).join('')}</div>
    <p class="v39-sheet-message" role="status" aria-live="polite">${escape(message||view?.reason||'')}</p>`
    :`<header><b>会話・依頼</b></header><p class="v39-sheet-progress">${escape(progress)}</p><div class="v39-sheet-choices">${definitions.map(row=>`<button type="button" data-sheet-event="${escape(row.ID)}"><b>${escape(row.名前)}</b></button>`).join('')}</div><p class="v39-sheet-message" role="status" aria-live="polite">${escape(message)}</p>`;
  if(panel.__markup!==markup){panel.innerHTML=markup;panel.__markup=markup;}
  const footer=host.parentElement.querySelector(':scope > output');
  if(footer&&current)footer.textContent=message||view?.reason||(quest?.failed?'依頼の期限が過ぎました。':quest?.completed?'依頼を完了しました。戻ると回答を確認できます。':'選択肢で進めます。「戻る」で前の選択肢へ戻れます。');
  // Use the existing conversation portraits and upper/lower speech, not another modal.
  panel.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-sheet-event-list')){resetV39VillageDialogue();onRefresh();return;}
    if(window.isV39MapInputLocked?.())return;
    const latest=window.getV39GameState({includeWorlds:false});
    if(latest.activePlayerId!==state.activePlayerId)return;
    let result;
    if(button.dataset.sheetEvent) {
      const definition=definitions.find(row=>row.ID===button.dataset.sheetEvent);
      result=openV39VillageDialogue(latest,definition,village.id,map());
      if(result.ok)current={playerId:latest.activePlayerId,villageId:village.id,instanceId:result.session.instanceId};
    } else if(button.hasAttribute('data-sheet-event-back')) result=backV39VillageDialogue(latest,current.instanceId);
    else if(button.dataset.sheetChoice) result=chooseV39VillageDialogue(latest,current.instanceId,button.dataset.sheetChoice,map());
    if(!result)return;
    message=result.ok?'':result.reason;
    if(result.ok) {
      const choice=result.session?.definition?.選択肢?.find(row=>row.番号===result.session.cursor);
      if(choice)onSpeech(choice.名前,result.answer||choice.回答);
      window.setV39GameState({players:result.state.players,neutralVillages:result.state.neutralVillages,settlements:result.state.settlements},{reason:'sheet-event-dialogue'});
    }
    onRefresh();
  };
}
