import {resolveUnitArtwork} from '../../lib/map-entity-artwork.js';
import {getV39ConversationProfile,selectV39PersonalityLine,formatV39ConversationText,getV39ConversationDataGaps,withV39ConversationPersonality,getV39ConversationPersonalities} from '../../lib/v39-conversation-personality.js';
import {resolveActionSkillRows,resolveAttackApCost,isV39SupportSkill} from '../../lib/v39-combat-engine.js';
import {parseV39TurnCount} from '../../lib/v39-turn-timing.js';
import {resolveV39NegotiationSkill,V39_NEGOTIATION_AP,chargeV39Negotiation} from '../../lib/v39-negotiation-rules.js';
import './v39-negotiation-conversation.css';
const sessions=new Map();
window.getV39NegotiationRules=()=>({resolveV39NegotiationSkill,chargeV39Negotiation,renderV39Conversation,getV39ConversationDataGaps,getV39ConversationProfile,selectV39PersonalityLine,withV39ConversationPersonality,getV39ConversationPersonalities});
window.addEventListener('v39:field-generated',()=>sessions.clear());
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const sessionKey=target=>`${window.getV39ActivePlayerId()}:${target}`;
function session(target){const key=sessionKey(target);if(!sessions.has(key))sessions.set(key,{reply:null,speech:null,history:[]});return sessions.get(key);}
export function recordV39Conversation(target,reply,speech,{replyColumn,speechColumn}={}){
  const row=session(target),actor=row.actor||{},peer=row.peer||{};
  row.reply=replyColumn?selectV39PersonalityLine(actor,replyColumn,{fallback:reply}):formatV39ConversationText(reply,actor);
  const response=speechColumn?selectV39PersonalityLine(peer,speechColumn):'';
  row.speech=[response,formatV39ConversationText(speech,peer)].filter(Boolean).join('\n');
  row.history.push({reply:row.reply,speech:row.speech});row.history=row.history.slice(-30);
}
function portrait(unit,label){const art=resolveUnitArtwork(unit),frame=art?.sheetFrame;
  const style=art?`background-image:url('${esc(art.src)}');background-size:${frame?`${frame.columns*100}% ${frame.rows*100}%`:'contain'};background-position:${frame?`${frame.columns>1?frame.column/(frame.columns-1)*100:0}% ${frame.rows>1?frame.row/(frame.rows-1)*100:0}%`:'center'};`:'';
  return `<figure><div class="v39-conversation-crop"><div class="v39-conversation-person" style="${style}">${art?'':'?'}</div></div><figcaption>${esc(label)}</figcaption></figure>`;
}
export function renderV39Conversation(host,{target,actor,peer,peerVoice=peer,units,onActorChange,preparationHost}){
  let root=host.querySelector(':scope > .v39-negotiation-conversation');if(!root){root=document.createElement('div');root.className='v39-negotiation-conversation';host.prepend(root);}
  if(!actor){root.innerHTML='<p>交渉できる地上の生存キャラがいません。</p>';root.__markup=null;preparationHost?.replaceChildren();return;}
  const state=window.getV39GameState({includeWorlds:false}),player=state.players.find(p=>p.id===state.activePlayerId),row=session(target),ap=Number(actor.ap??actor.currentAp)||0;
  row.peer=peerVoice;row.actor=actor;
  const actorKey=`${actor.id}:${actor.conversationPersonality}`,peerKey=`${peerVoice.id}:${peerVoice.conversationPersonality}`;
  if(row.speech===null||row.peerKey!==peerKey)row.speech=selectV39PersonalityLine(peerVoice,'交渉開始',{fallback:'依頼や取引のご用件をお聞きします。'});
  if(row.reply===null||row.actorKey!==actorKey)row.reply=selectV39PersonalityLine(actor,'交渉申込',{fallback:'{一人称}から話したいことがあります。'});
  row.actorKey=actorKey;row.peerKey=peerKey;
  const selfProfile=getV39ConversationProfile(actor),peerProfile=getV39ConversationProfile(peerVoice);
  const skills=resolveActionSkillRows(actor).filter(skill=>String(skill.対象||'').includes('自身')&&(Number(skill.交渉)||Number(skill.威圧))&&skill.攻撃手段!=='魔法'&&!parseV39TurnCount(skill.待機)&&!parseV39TurnCount(skill.詠唱)&&parseV39TurnCount(skill.効果時間)>0&&isV39SupportSkill(skill,actor));
  const markup=`<div class="v39-conversation-stage" data-peer-personality="${esc(peerProfile.性格)}" data-self-personality="${esc(selfProfile.性格)}"><div class="v39-conversation-row peer"><p><b>相手</b><span title="${esc(row.speech)}">${esc(row.speech)}</span></p>${portrait(peer,peer.name||'相手')}</div><div class="v39-conversation-row self">${portrait(actor,actor.name)}<p><b>自分</b><span title="${esc(row.reply)}">${esc(row.reply)}</span></p></div></div>
    <details class="v39-conversation-preparation"><summary>交渉役 ${esc(actor.name)} · AP ${ap} · スキル ${skills.length}</summary><div class="v39-conversation-controls"><label>交渉役 <select data-conversation-actor>${units.map(unit=>`<option value="${esc(unit.id)}"${unit.id===actor.id?' selected':''}>${esc(unit.name)}</option>`).join('')}</select></label><b>判定 AP${V39_NEGOTIATION_AP}</b><span>交渉 ${resolveV39NegotiationSkill(state,player.id,actor,'交渉')} / 威圧 ${resolveV39NegotiationSkill(state,player.id,actor,'威圧')}</span></div>
    <div class="v39-conversation-skills">${skills.map((skill,index)=>{const cost=resolveAttackApCost(skill,actor),used=Number(player.factionState.combatRuntime?.cooldownsByUnitId?.[actor.id]?.[skill.名前])>state.timeline.turnNumber;return `<article><b>${esc(skill.名前)}</b><p>${esc(skill.詳細||`交渉+${Number(skill.交渉)||0} / 威圧+${Number(skill.威圧)||0}`)}</p><small>AP ${cost} / 使用後 ${Math.max(0,ap-cost)}${ap-cost<V39_NEGOTIATION_AP?' / 交渉AP不足':''}</small><button data-conversation-skill="${index}"${ap<cost||used?' disabled':''}>${used?'使用済み/CT中':ap<cost?'AP不足':'使用を確認'}</button></article>`;}).join('')||'<p>使用できる交渉スキルはありません。</p>'}</div></details>
    <details><summary>会話履歴 (${row.history.length})</summary>${row.history.map(item=>`<p>自分: ${esc(item.reply)}<br>相手: ${esc(item.speech)}</p>`).join('')}</details>`;
  if(root.__markup!==markup){
    const open=[...root.querySelectorAll('details'),...(preparationHost?.querySelectorAll('details')||[])].map(section=>section.open);
    preparationHost?.replaceChildren();
    root.innerHTML=markup;root.__markup=markup;
    root.querySelectorAll('details').forEach((section,index)=>{if(index<open.length)section.open=open[index];});
    if(preparationHost)preparationHost.append(...root.querySelectorAll(':scope > details'));
  }
  const controls=preparationHost||root;
  controls.querySelector('select').onchange=event=>onActorChange(event.target.value);
  controls.querySelectorAll('[data-conversation-skill]').forEach(button=>button.onclick=()=>{
    const skill=skills[Number(button.dataset.conversationSkill)];
    if(window.isV39MapInputLocked?.()||window.getV39GameState().timeline.phase!=='player')return;
    if(!window.confirm(`${skill.名前}を使用しますか？ AP${resolveAttackApCost(skill,actor)}を消費します。`))return;
    const current=window.getV39GameState(),unit=current.players.find(p=>p.id===current.activePlayerId)?.factionState.units.find(u=>u.id===actor.id);
    if(!unit||Number(unit.ap??unit.currentAp)<resolveAttackApCost(skill,unit)||unit.waitTurnNumber===current.timeline.turnNumber||current.players.find(p=>p.id===current.activePlayerId).factionState.combatRuntime?.pendingActionsByUnitId?.[unit.id])return;
    const ok=window.executeV39FactionCombatAction?.({playerId:current.activePlayerId,attackerId:unit.id,targetUnitId:unit.id,skillRow:skill});
    if(ok){recordV39Conversation(target,`${skill.名前}を使用します。`,'準備ができましたら、条件をお聞かせください。');window.dispatchEvent(new CustomEvent('v39:conversation-updated'));}
  });
}
