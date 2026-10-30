import {getV39AgreedQuestReward,getV39QuestRewardItems,getV39QuestRelationReward,getV39QuestRewardResources,describeV39QuestReward,requestV39QuestRewardChange} from '../../lib/v39-quest-rewards.js';
import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';
import {resolveV39SoulResourceValue} from '../../lib/v39-soul-resource-value.js';
import {V39_NEGOTIATION_AP} from '../../lib/v39-negotiation-rules.js';
import {resolveV39ImmediateSoulAmount} from '../../lib/v39-soul-conversion.js';
import {isV39Undead} from '../../lib/v39-corpse-types.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {tradeBasketHtml,tradePickerModalHtml} from './v39-trade-items.js';
import {renderV39TradePicker,closeV39TradePicker} from './v39-trade-picker.js';
import './v39-trade-items.css';
import './v39-quest-reward-ui.css';

const drafts=new Map(),messages=new Map();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function rewardBadge(name,amount,label){
  const icon=resolveV39ResourceIcon(name);
  return `<span class="v39-quest-reward-item" data-reward-icon="${esc(name)}" title="${esc(label)}" aria-label="${esc(label)}"><i aria-hidden="true"${icon.color?` style="color:${esc(icon.color)}"`:''}>${esc(icon.glyph)}</i><strong>${esc(amount)}</strong></span>`;
}
export function questRewardSummary(state,village,quest){
  const offer=quest.rewardTerms?null:getV39AgreedQuestReward(state,village,state.activePlayerId,quest);
  const items=offer?getV39QuestRewardItems({rewardTerms:offer.reward}):getV39QuestRewardItems(quest),relation=getV39QuestRelationReward(quest);
  const receiver=state.players.find(player=>player.id===state.activePlayerId);
  const badges=items.map(r=>{
    const souls=r.kind==='population'&&!isV39Undead({race:r.name})?resolveV39ImmediateSoulAmount(receiver,r.amount):0;
    return souls>0?rewardBadge('魂',resolveV39SoulResourceValue(souls),`${describeV39QuestReward(r)} → 魂へ即時変換`)
      :rewardBadge(r.kind==='population'?'人口':r.kind==='legacySoul'?'魂':r.name,r.amount,describeV39QuestReward(r));
  }).join('');
  return `<div class="v39-quest-reward-summary" data-quest-reward-summary><b>報酬${offer?'（合意済み）':quest.rewardTerms?'（確定）':''}</b>${offer?`<small title="この条件で受注できる残りターン">⌛${offer.expiresTurn-state.timeline.turnNumber}</small>`:''}${badges}${relation?`<span>友好度 ${relation>0?'+':''}${relation}</span>`:''}${!items.length&&quest.automaticRewardItems?'<small>余剰物資なし</small>':!items.length&&!relation?'<small>なし</small>':''}</div>`;
}

let activePicker=null;
export function closeV39QuestRewardPicker(){
  if(!activePicker)return;
  const {root,draft}=activePicker;draft.picking=false;closeV39TradePicker(root);activePicker=null;
}
export function renderV39QuestRewardEditor(host,{state,village,quest,actor,locked=false,onResult,showSummary=true}){
  if(!host||!quest)return;
  const key=`${state.activePlayerId}:${village.id}:${quest.eventId}`;
  const resources=getV39QuestRewardResources(state),races=Object.keys(village.populationByRace||{}).filter(r=>village.populationByRace[r]>0);
  const initialOffer=getV39AgreedQuestReward(state,village,state.activePlayerId,quest);
  const initialRewards=getV39QuestRewardItems(initialOffer?{rewardTerms:initialOffer.reward}:quest).filter(r=>['resource','population'].includes(r.kind));
  const draft=drafts.get(key)||{rewards:Object.fromEntries((initialRewards.length?initialRewards:[{kind:'resource',name:'金',amount:5}]).map(r=>[r.name,{...r}])),mode:'normal',picking:false,filter:'all',search:'',selected:''};drafts.set(key,draft);
  const side={goods:Object.fromEntries(Object.values(draft.rewards).map(r=>[r.name,r.amount]))};
  const items=[...resources.map(name=>({name,kind:'resource'})),...races.map(name=>({name,kind:'population',category:'population',iconName:'人口'}))];
  const objective=quest.type==='delivery'?quest.resourceKey:quest.type==='hunt'?'攻撃':quest.type==='construction'?'建設':'待機';
  const goal={goods:{[objective]:quest.required||1}};
  updateV39RetainedMarkup(host,`<div class="v39-trade-dialog v39-quest-reward-edit"><header><button type="button" data-hub-reward-back>← 依頼一覧</button><b>報酬の交渉</b></header><p>${esc(quest.label)}</p>${showSummary?questRewardSummary(state,village,quest):''}${locked?'<p>受注済みの報酬は変更できません。</p>':`<div class="v39-trade-baskets">${tradeBasketHtml(state,goal,0,{readOnly:true,title:'達成条件'})}${tradeBasketHtml(state,side,1,{rows:true,selected:draft.selected,title:'相手への要求',iconName:name=>draft.rewards[name]?.kind==='population'?'人口':name})}</div><div class="v39-trade-row"><label>交渉<select data-reward-mode><option value="normal"${draft.mode==='normal'?' selected':''}>通常交渉</option><option value="intimidation"${draft.mode==='intimidation'?' selected':''}>威圧交渉</option></select></label></div><small>威圧交渉は友好度が下がります。</small>`}<output role="status"${messages.get(key)?'':' hidden'}>${esc(messages.get(key)||'')}</output></div>`);
  const root=host.closest('#v39-village-menu');
  const render=()=>renderV39QuestRewardEditor(host,{state,village,quest,actor,locked,onResult,showSummary});
  const controls=selector=>[...host.querySelectorAll(selector),...Array.from(root.querySelector('.v39-trade-picker-backdrop')?.querySelectorAll(selector)||[])];
  const setAmount=(name,value)=>{
    const reward=draft.rewards[name];if(!reward)return;
    reward.amount=Math.max(1,Math.min(100000,Math.floor(Number(value)||1)));
    controls('[data-side-field=amount]').forEach(input=>{if(input.dataset.tradeResource!==name)return;if(input.type==='range')input.max=String(Math.max(1000,reward.amount));if(input!==document.activeElement)input.value=String(reward.amount);});
    controls('[data-trade-resource-add]').forEach(button=>{if(button.dataset.tradeResourceAdd===name)button.querySelector('b').textContent=String(reward.amount);});
  };
  const input=event=>{
    if(event.target.matches('[data-side-field=amount]'))setAmount(event.target.dataset.tradeResource,event.target.value);
    if(event.target.matches('[data-trade-resource-search]')){draft.search=event.target.value;render();}
  };
  const change=event=>{
    if(event.target.matches('[data-reward-mode]'))draft.mode=event.target.value;
    if(event.target.matches('[data-side-field=amount]')){setAmount(event.target.dataset.tradeResource,event.target.value);event.target.value=String(draft.rewards[event.target.dataset.tradeResource]?.amount||1);}
  };
  const click=event=>{
    const button=event.target.closest('button');if(!button||button.hasAttribute('data-hub-reward-back'))return;
    event.stopPropagation();
    if(button.hasAttribute('data-trade-add-side')){draft.picking=true;draft.search='';render();}
    else if(button.hasAttribute('data-trade-resource-filter')){draft.filter=button.dataset.tradeResourceFilter;render();}
    else if(button.hasAttribute('data-trade-resource-add')){
      const item=items.find(row=>row.name===button.dataset.tradeResourceAdd);if(!item)return;
      if(!Object.hasOwn(draft.rewards,item.name))draft.rewards[item.name]={kind:item.kind,name:item.name,amount:1};
      draft.selected=item.name;render();
    }
    else if(button.hasAttribute('data-trade-item-select')){draft.selected=button.dataset.tradeItemSelect;render();}
    else if(button.hasAttribute('data-trade-item-step')){const name=button.dataset.tradeResource;setAmount(name,(draft.rewards[name]?.amount||1)+Number(button.dataset.tradeItemStep));}
    else if(button.hasAttribute('data-trade-item-remove')){const name=button.dataset.tradeItemRemove;delete draft.rewards[name];if(draft.selected===name)draft.selected='';render();}
  };
  host.oninput=input;host.onchange=change;host.onclick=click;
  host.onfocusin=event=>{const input=event.target;if(input.matches('input[type=number][data-trade-resource]')&&draft.selected!==input.dataset.tradeResource){draft.selected=input.dataset.tradeResource;render();}};
  if(draft.picking&&!locked){
    if(activePicker&&activePicker.host!==host)closeV39QuestRewardPicker();
    activePicker={root,host,draft};
    renderV39TradePicker(root,tradePickerModalHtml(state,side,1,{
      filter:draft.filter,search:draft.search,selected:draft.selected,items,title:'受け取る報酬',titleId:'v39-reward-picker-title',
      categories:[['all','すべて'],['food','食料'],['basic','資材'],['special','特殊資源'],['population','人口']]
    }),{background:root.querySelector(':scope > section'),onClose:()=>{closeV39QuestRewardPicker();render();host.querySelector('[data-trade-add-side]')?.focus();},onClick:click,onInput:input,onChange:change});
  }else if(activePicker?.host===host)closeV39QuestRewardPicker();
  host.canSubmitReward=!!Object.keys(draft.rewards).length&&!locked&&!draft.picking;
  const primary=root.querySelector('[data-hub-primary]');
  if(primary)primary.disabled=!host.canSubmitReward||!actor||Number(actor.ap??actor.currentAp)<V39_NEGOTIATION_AP;
  host.submitReward=()=>{
    if(locked||draft.picking||!Object.keys(draft.rewards).length||!actor||window.isV39MapInputLocked?.())return;
    const current=window.getV39GameState({includeWorlds:false});
    const result=requestV39QuestRewardChange(current,current.activePlayerId,village.id,quest,{rewards:Object.values(draft.rewards),unitId:actor.id,mode:draft.mode});
    messages.set(key,result.message||result.reason);onResult(result);
  };
}
window.addEventListener('v39:field-generated',()=>{closeV39QuestRewardPicker();drafts.clear();messages.clear();});
window.getV39QuestRewardRules=()=>({requestV39QuestRewardChange,getV39AgreedQuestReward,getV39QuestRewardItems});
