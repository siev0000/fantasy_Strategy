import {describeV39VillagePlan,inspectV39VillageDevelopment} from '../../lib/v39-village-plans.js';
import {renderV39Conversation,recordV39Conversation} from './v39-negotiation-conversation.js';
import {getV39VillageQuests} from '../../lib/v39-village-quest-log.js';
import {submitV39VillageQuestBatch} from '../../lib/v39-village-quest-batch.js';
import {V39_NEGOTIATION_AP} from '../../lib/v39-negotiation-rules.js';
import {resolveV39ImmediateSoulAmount} from '../../lib/v39-soul-conversion.js';
import {resolveV39SpecialVillage,offerV39SpecialVillageSacrifice,suspendV39SpecialVillageContract,reincarnateV39VillageNegotiator} from '../../lib/v39-special-villages.js';
import {specialVillageOfferingMarkup,specialVillageReincarnationMarkup} from './v39-special-village-offering-ui.js';
import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';
import {mountV39TradePanel,hideV39TradePanel,unmountV39TradePanel,submitV39TradePanel,selectV39TradeNegotiator} from './v39-trade-ui.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {V39_NEUTRAL_VILLAGE_BALANCE} from '../../lib/v39-gameplay-balance.js';
import {getV39VillageSpeaker} from '../../lib/v39-village-leaders.js';
import {getV39ConversationProfile} from '../../lib/v39-conversation-personality.js';
import {questRewardSummary,renderV39QuestRewardEditor,closeV39QuestRewardPicker} from './v39-quest-reward-ui.js';
import './v39-village-hub.css';

const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function developmentMarkup(state,village){
  const nodes=inspectV39VillageDevelopment(state,village,window.__v39FieldRuntime?.mapData);
  const labels={completed:'完了',active:'進行中',locked:'前提待ち',unavailable:'定義なし'};
  return `<article class="v39-hub-card" data-village-development><h3>村の発展計画</h3>${nodes.map(node=>`<div class="v39-development-node" data-development-status="${node.status}"><b>${esc(node.name)}</b><span>${labels[node.status]}</span>${node.requires.length?`<small>前提: ${esc(node.requires.map(id=>nodes.find(row=>row.id===id)?.name||id).join('・'))}</small>`:''}${node.status==='active'?`<small>${esc([node.stage,...node.needs.map(need=>`${need.resource} あと${need.amount}`),...node.blockers].filter(Boolean).join(' / '))}</small>`:''}</div>`).join('')}</article>`;
}
const tabs=[['talk','会話'],['quests','クエスト'],['trade','取引'],['info','情報']];
const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const types={hunt:'討伐',delivery:'物資',watch:'警備',construction:'建築'};
let context='',active='talk',selectedTalk='status',rewardQuestId='',questScroll=0,latest=null;
let offeringDraft={count:1},offeringCheck=null;
let reincarnationCheck=null;
const checkedQuests=new Set();
let tradeAction={label:'この条件で提案',disabled:true,message:''};
const output=root=>root.querySelector('.v39-hub-footer > output');
export function villageHubMarkup(){return `<header class="v39-hub-heading"><div><small>交渉</small><b id="v39-village-menu-title"></b></div><span data-hub-relation></span><button type="button" data-close-village-menu aria-label="閉じる">×</button></header>
  <div data-hub-conversation></div>
  <nav class="v39-hub-tabs" role="tablist" aria-label="交渉の目的">${tabs.map(([key,label])=>`<button type="button" id="v39-hub-tab-${key}" role="tab" data-hub-tab="${key}" aria-controls="v39-hub-${key}">${label}</button>`).join('')}</nav>
  <div class="v39-village-menu-body">
  ${tabs.map(([key,label])=>`<section class="v39-hub-pane" id="v39-hub-${key}" role="tabpanel" aria-labelledby="v39-hub-tab-${key}"${key==='talk'?'':' hidden'}>${key==='info'?'<div data-hub-info></div><div data-hub-preparation></div>':key==='quests'?'<div data-hub-quests></div><div data-hub-reward-editor hidden></div>':''}</section>`).join('')}
  </div>
  <footer class="v39-hub-footer"><output role="status" aria-live="polite"></output><div><button type="button" data-close-village-menu>閉じる</button><button type="button" data-hub-primary></button></div></footer>`;}

export function resetV39VillageHub(){closeV39QuestRewardPicker();unmountV39TradePanel();context='';active='talk';latest=null;rewardQuestId='';checkedQuests.clear();}
export function villageHubOwnsEscape(root){return !!root?.querySelector('.v39-trade-picker-backdrop')||!!(root?.hidden&&context);}
function footer(){
  if(!latest)return;
  const {root,actor}=latest,button=root.querySelector('[data-hub-primary]');
  let label='会話を進める',disabled=!actor,message='用件を選んでから実行してください。';
  if(active==='quests'){
    const selected=latest.questEntries.filter(row=>checkedQuests.has(row.eventId)),pending=selected.filter(row=>row.pending).length;
    label=selected.length?`${pending===selected.length?'まとめて支援・報告':pending?'受注・報告':'まとめて受注'}（${selected.length}件）`:'依頼を選択';
    disabled=!actor||!selected.length;message='左のチェックで複数の依頼を選び、下のボタンでまとめて受注・報告します。';
  }
  if(active==='quests'&&rewardQuestId){label=`この報酬を要求 AP${V39_NEGOTIATION_AP}`;disabled=!actor||Number(actor.ap??actor.currentAp)<V39_NEGOTIATION_AP||!root.querySelector('[data-hub-reward-editor]').canSubmitReward;message='報酬を選び、数量を指定して交渉します。受注は依頼一覧から行います。';}
  if(active==='trade'){label=tradeAction.label;disabled=tradeAction.disabled;message=tradeAction.message;}
  if(active==='info'){label='会話へ戻る';disabled=false;message='交渉役の変更・スキル使用はこのタブで行えます。';}
  if(active==='talk'&&selectedTalk==='special-offering'){label=`軍隊${offeringDraft.count}駒で契約`;disabled=!offeringCheck?.available;message=offeringCheck?.available?'今回の奉納と定期的な維持費に同意して確定します。':offeringCheck?.reasons.join(' / ')||'条件を確認してください';}
  if(active==='talk'&&selectedTalk==='special-reincarnation'){label=`転生する / 生贄${reincarnationCheck?.cost||0}人・AP${V39_NEGOTIATION_AP}`;disabled=!reincarnationCheck?.available;message=reincarnationCheck?.available?'交渉者本人の主要種族を変更します。':reincarnationCheck?.reasons.join(' / ')||'条件を確認してください';}
  button.textContent=label;button.disabled=disabled;delete button.dataset.sheetChoice;
  output(root).textContent=message;
}
function switchTab(key){
  if(!latest||!tabs.some(([name])=>name===key))return;
  closeV39QuestRewardPicker();active=key;renderV39VillageHub(latest);
  latest.root.querySelector('.v39-village-menu-body').scrollTop=0;
}
function conditionIcon(name,value){
  const icon=resolveV39ResourceIcon(name);
  return `<span class="v39-quest-condition" title="${esc(name)}" aria-label="${esc(name)} ${esc(value)}"><i aria-hidden="true"${icon.color?` style="color:${esc(icon.color)}"`:''}>${esc(icon.glyph)}</i>${esc(value)}</span>`;
}
function questCard(row,state,village){
  const value=row.pending?`${row.type==='hunt'?Math.max(0,row.required-(row.targetEnemyIds||[]).filter(id=>state.enemies?.some(unit=>unit.id===id&&alive(unit))).length):row.progress||0}/${row.required}`:row.required;
  const condition=row.type==='delivery'?conditionIcon(row.resourceKey,value):row.type==='hunt'?conditionIcon('攻撃',`${value}体`):row.type==='watch'?`⌛${esc(value)}`:row.type==='construction'?conditionIcon('建設',value):esc(row.objective||'依頼内容を確認');
  return `<article class="v39-hub-card${checkedQuests.has(row.eventId)?' selected':''}" data-quest-entry="${esc(row.eventId)}"><label class="v39-quest-check-row"><input type="checkbox" data-hub-quest="${esc(row.eventId)}" aria-label="${esc(row.label)}を選択"${checkedQuests.has(row.eventId)?' checked':''}><div><div class="v39-hub-card-title"><h3>${esc(row.label)}</h3><span>${row.pending?'受注中':esc(types[row.type]||'依頼')}</span></div><p>${esc(row.説明||row.description||row.詳細||'')}</p><p>達成条件: ${condition}</p>${questRewardSummary(state,village,row)}${row.deadlineTurn?`<small>期限 T${row.deadlineTurn}</small>`:''}</div></label>${row.pending?'':`<button type="button" data-hub-reward-negotiate="${esc(row.eventId)}">交渉</button>`}</article>`;
}

export function renderV39VillageHub(options){
  latest=options;
  const {root,state,village,actor,units,relation,relationLabel,choices,onAction,onRefresh,onClose,onActorChange}=options;
  const key=`${state.activePlayerId}:${village.id}`;
  if(context!==key){closeV39QuestRewardPicker();unmountV39TradePanel();context=key;active='talk';selectedTalk='status';rewardQuestId='';checkedQuests.clear();offeringDraft={count:village.offeringByPlayerId?.[state.activePlayerId]?.count||1,settlementId:village.offeringByPlayerId?.[state.activePlayerId]?.settlementId,race:village.offeringByPlayerId?.[state.activePlayerId]?.race};offeringCheck=null;}

  root.querySelector('#v39-village-menu-title').textContent=village.name;
  root.querySelector('[data-hub-relation]').textContent=`${relationLabel} ${relation}`;
  for(const [name] of tabs){root.querySelector(`#v39-hub-${name}`).hidden=active!==name;const button=root.querySelector(`#v39-hub-tab-${name}`);button.setAttribute('aria-selected',String(active===name));button.tabIndex=active===name?0:-1;}
  renderV39Conversation(root.querySelector('[data-hub-conversation]'),{target:village.id,actor,units,
    peerVoice:getV39VillageSpeaker(village),
    peer:getV39VillageSpeaker(village),
    onActorChange:id=>{onActorChange(id);selectV39TradeNegotiator(id,village.id);},preparationHost:root.querySelector('[data-hub-preparation]')});
  const talk=[['status','村の様子を聞く','現在の計画や困っていることを確認します。'],['relation','交流する',`友好関係を深めます。食料 ${V39_NEUTRAL_VILLAGE_BALANCE.improveRelationCost}`],['village-rest','部隊で休息','村で部隊を休ませます。AP30'],['vassal','属国化を交渉','村を自国の保護下に置く交渉です。'],['raid','村を襲撃','戦闘を開始する敵対行動です。']];
  if(resolveV39SpecialVillage(village))talk.splice(1,0,['special-offering','生贄の奉納・軍隊加入','奉納する人数に応じて、軍隊を1駒・2駒・3駒と配下に迎えます。']);
  if(resolveV39SpecialVillage(village)?.reincarnation?.enabled)talk.splice(2,0,['special-reincarnation','転生を交渉','生贄を奉納し、交渉者本人が対応種族Lv3を取得して主要種族を変更します。']);
  if(village.sacrificeContract?.active&&village.sacrificeContract.playerId===state.activePlayerId&&village.heldUnits?.length)
    talk.splice(3,0,['sacrifice-receive','生贄を受け取る',resolveV39ImmediateSoulAmount(state.players.find(p=>p.id===state.activePlayerId),1)>0?'確保された生贄を受け取り、魂へ即時変換します。装備は荷物に入ります。':'確保された捕虜・死体を受け取ります。装備は荷物に入ります。']);
  if(!talk.some(([id])=>id===selectedTalk))selectedTalk='status';
  let offeringMarkup='';
  if(active==='talk'&&selectedTalk==='special-offering'){
    const offering=specialVillageOfferingMarkup(state,village,actor,offeringDraft,window.__v39FieldRuntime?.mapData);
    offeringCheck=offering.check;offeringMarkup=offering.markup;
  }
  if(active==='talk'&&selectedTalk==='special-reincarnation'){
    const reincarnation=specialVillageReincarnationMarkup(state,village,actor,offeringDraft);
    reincarnationCheck=reincarnation.check;offeringMarkup=reincarnation.markup;
  }
  updateV39RetainedMarkup(root.querySelector('#v39-hub-talk'),`<h2>何を話しますか？</h2><div class="v39-hub-talk-options">${talk.map(([id,title,copy])=>`<button type="button" data-hub-talk="${id}" aria-pressed="${selectedTalk===id}"${id==='vassal'&&village.vassalPlayerId?' disabled':''}><b>${title}</b><small>${copy}</small></button>`).join('')}</div>${offeringMarkup}`);
  const plan=village.planSchedule?.active;
  updateV39RetainedMarkup(root.querySelector('[data-hub-info]'),`<h2>村の情報</h2><dl class="v39-hub-facts"><div><dt>人口</dt><dd>${village.population}人</dd></div><div><dt>村のLv</dt><dd>${village.level}</dd></div><div><dt>守備</dt><dd>${(village.defenseUnits||[]).filter(alive).reduce((sum,unit)=>sum+(Number(unit.count)||1),0)}人</dd></div><div><dt>所属</dt><dd>${esc(village.vassalPlayerId||'独立')}</dd></div></dl><p data-hub-leader>交渉相手: ${esc(getV39VillageSpeaker(village).name)} / ${esc(getV39VillageSpeaker(village).title||"村長")}</p><p>相手の性格: ${esc(village.conversationPersonality||'未設定')} / 交渉役の性格: ${esc(actor?.conversationPersonality||'未設定')}</p><p data-hub-pronouns>相手の一人称: ${esc(getV39ConversationProfile(getV39VillageSpeaker(village)).一人称)} / 二人称: ${esc(getV39ConversationProfile(getV39VillageSpeaker(village)).二人称)}</p><p data-hub-facilities>完成施設: ${esc((village.buildings||[]).join('・')||'なし')}</p><article class="v39-hub-card"><h3>現在の計画</h3><p>${esc(describeV39VillagePlan(village))}</p>${plan?.blockers?.length?`<p>${esc(plan.blockers.join(' / '))}</p>`:''}</article>${developmentMarkup(state,village)}<h2>交渉役・スキル</h2>`);
  const records=getV39VillageQuests(village,state.activePlayerId),pending=records.filter(row=>row.accepted&&!row.completed);
  const entries=new Map(choices.map(row=>[row.eventId,row]));
  for(const record of pending)entries.set(record.eventId,{...record,pending:true});
  latest.questEntries=[...entries.values()];
  for(const id of checkedQuests)if(!entries.has(id))checkedQuests.delete(id);
  const list=root.querySelector('[data-hub-quests]');
  updateV39RetainedMarkup(list,`<h2>依頼一覧</h2>${latest.questEntries.map(row=>questCard(row,state,village)).join('')||'<p class="v39-hub-empty">現在、依頼はありません。</p>'}`);list.hidden=!!rewardQuestId;
  const rewardHost=root.querySelector('[data-hub-reward-editor]'),rewardQuest=entries.get(rewardQuestId);
  if(!rewardQuest||rewardQuest.pending){rewardQuestId='';list.hidden=false;}
  rewardHost.hidden=!rewardQuestId;
  if(active!=='quests'||rewardHost.hidden)closeV39QuestRewardPicker();
  if(!rewardHost.hidden)renderV39QuestRewardEditor(rewardHost,{state,village,quest:rewardQuest,actor,locked:!!rewardQuest.pending,showSummary:true,onResult:result=>{
    recordV39Conversation(village.id,'報酬の変更をお願いします。',result.message||result.reason);
    if(result.accepted)rewardQuestId='';
    if(result.ok)window.setV39GameState(result.state,{reason:'quest-reward-negotiation'});
    onRefresh();output(root).textContent=result.message||result.reason;
  }});
  if(active==='trade')mountV39TradePanel(root.querySelector('#v39-hub-trade'),village.id,{negotiatorId:actor?.id,onChange:value=>{tradeAction=value;footer();},onMapPick:picking=>{root.hidden=picking;}});
  else hideV39TradePanel();
  footer();
  root.onclick=event=>{
    const button=event.target.closest('button');if(!button||button.disabled)return;
    if(button.hasAttribute('data-close-village-menu')){onClose();return;}
    if(button.dataset.hubTab){switchTab(button.dataset.hubTab);return;}
    if(button.hasAttribute('data-hub-reward-negotiate')){questScroll=root.querySelector('.v39-village-menu-body').scrollTop;rewardQuestId=button.dataset.hubRewardNegotiate;renderV39VillageHub(latest);root.querySelector('.v39-village-menu-body').scrollTop=0;root.querySelector('[data-hub-reward-back]')?.focus({preventScroll:true});return;}
    if(button.hasAttribute('data-hub-reward-back')){const previous=rewardQuestId;rewardQuestId='';renderV39VillageHub(latest);root.querySelector('.v39-village-menu-body').scrollTop=questScroll;Array.from(root.querySelectorAll('[data-hub-reward-negotiate]')).find(b=>b.dataset.hubRewardNegotiate===previous)?.focus({preventScroll:true});return;}
    if(button.dataset.hubTalk){selectedTalk=button.dataset.hubTalk;renderV39VillageHub(latest);return;}
    if(button.hasAttribute('data-special-contract-stop')){
      if(window.isV39MapInputLocked?.())return;
      const current=window.getV39GameState(),result=suspendV39SpecialVillageContract(current,current.activePlayerId,village.id);
      if(result.ok)window.setV39GameState(result.state,{reason:'special-village-contract-stop'});
      onRefresh();output(root).textContent=result.message||result.reason;return;
    }
    if(!button.hasAttribute('data-hub-primary'))return;
    if(active==='trade'){submitV39TradePanel();return;}
    if(active==='info'){switchTab('talk');return;}
    if(active==='quests'){
      if(rewardQuestId){root.querySelector('[data-hub-reward-editor]').submitReward?.();return;}
      if(window.isV39MapInputLocked?.())return;
      const current=window.getV39GameState({includeWorlds:false}),selected=latest.questEntries.filter(row=>checkedQuests.has(row.eventId));
      const result=submitV39VillageQuestBatch(current,current.activePlayerId,village.id,selected,window.__v39FieldRuntime?.mapData);
      if(result.ok){checkedQuests.clear();window.setV39GameState(result.state,{reason:'quest-batch'});recordV39Conversation(village.id,'選択した依頼をお願いします。',result.message);}
      onRefresh();output(root).textContent=result.message||result.reason;return;
    }
    if(selectedTalk==='status'){recordV39Conversation(village.id,'村の様子を教えてください。',describeV39VillagePlan(village));onRefresh();return;}
    if(selectedTalk==='special-offering'){
      if(window.isV39MapInputLocked?.())return;
      const current=window.getV39GameState();
      const result=offerV39SpecialVillageSacrifice(current,current.activePlayerId,village.id,{...offeringDraft,unitId:actor?.id},window.__v39FieldRuntime?.mapData);
      if(result.ok){window.setV39GameState(result.state,{reason:'special-village-offering'});recordV39Conversation(village.id,'生贄を奉納し、軍隊を迎えます。',result.message);window.appendV39ActivityLog?.(current.activePlayerId,'特殊村',result.message);}
      onRefresh();output(root).textContent=result.message||result.reason;return;
    }
    if(selectedTalk==='special-reincarnation'){
      if(window.isV39MapInputLocked?.())return;
      const current=window.getV39GameState(),result=reincarnateV39VillageNegotiator(current,current.activePlayerId,village.id,{...offeringDraft,unitId:actor?.id});
      if(result.ok){window.setV39GameState(result.state,{reason:'special-village-reincarnation'});recordV39Conversation(village.id,'生贄を奉納して転生を願います。',result.message);window.appendV39ActivityLog?.(current.activePlayerId,'転生',result.message);}
      onRefresh();output(root).textContent=result.message||result.reason;return;
    }
    if(selectedTalk==='raid'&&!window.confirm('この村を襲撃し、戦闘を開始しますか？'))return;
    const result=onAction(selectedTalk,'',talk.find(([id])=>id===selectedTalk)?.[1]);if(result)output(root).textContent=result.message||result.reason;
  };
  root.onkeydown=null;
  root.onchange=event=>{
    const field=event.target.dataset.offeringField;
    if(['settlementId','race','count'].includes(field)){
      offeringDraft={...offeringDraft,[field]:field==='count'?Number(event.target.value):event.target.value};
      renderV39VillageHub(latest);return;
    }
    const checkbox=event.target;if(!checkbox.matches('[data-hub-quest]'))return;
    const id=checkbox.dataset.hubQuest;
    if(checkbox.checked)checkedQuests.add(id);else checkedQuests.delete(id);
    renderV39VillageHub(latest);
    Array.from(root.querySelectorAll('[data-hub-quest]')).find(row=>row.dataset.hubQuest===id)?.focus({preventScroll:true});
  };
  root.querySelector('.v39-hub-tabs').onkeydown=event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const index=tabs.findIndex(([key])=>key===active),next=event.key==='Home'?0:event.key==='End'?3:(index+(event.key==='ArrowRight'?1:3))%4;
    switchTab(tabs[next][0]);root.querySelector(`#v39-hub-tab-${active}`).focus();
  };
}
