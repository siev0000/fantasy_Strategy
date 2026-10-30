import {isV39VillageContactUnit} from '../../lib/v39-village-contacts.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {V39_TRADE_CONFIG as config,V39_TRADE_RESOURCES,listV39Trades,proposeV39Trade,acceptV39Trade,stopV39Trade,resumeV39Trade,
  tradeBank,tradeBankAmount,tradeMembers,tradeCapacity,tradeTurn,tradeAlive,divertV39TradeIncome,updateTradeBank,updateV39Trade,getTradeCargo,reserveV39TradeFromStock,tradeSpeed,tradeCourierIndex} from '../../lib/v39-trade-state.js';
import {advanceV39TradeLogistics} from '../../lib/v39-trade-logistics.js';
import {inspectV39NeutralVillageEconomy,collectV39TerritoryIncome,FOOD_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {buildV39PopulationMaintenanceStock} from '../../lib/v39-population-economy.js';
import {getV39TradeResourceAvailability,getV39KnownTradeResources} from '../../lib/v39-trade-resource-availability.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {renderV39Conversation,recordV39Conversation} from './v39-negotiation-conversation.js';
import {getV39VillageSpeaker} from '../../lib/v39-village-leaders.js';
import {tradeBasketHtml,tradeResourcePicker,tradeResourceChips,tradePickerModalHtml} from './v39-trade-items.js';
import {renderV39TradePicker,closeV39TradePicker} from './v39-trade-picker.js';
import {installTradeLayout} from './v39-trade-layout.js';
import {v39SpecialtyDefinitions,getV39SpecialtyAccess} from '../../lib/v39-specialty-rules.js';
import './v39-trade-items.css';
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const n=value=>Number(value)||0;
let draft=null,message='',picking=-1,scheduled=false,tab='new';
let embedded=null;
const drafts=new Map();let draftKey='';
let resourcePicker=-1,resourceFilter='all',resourceSearch='';
const selectedItems=['',''];
const folds=new Map();
const state=()=>window.getV39GameState();
const modal=()=>document.getElementById('v39-trade-modal');
function notifyPanel(){embedded?.onChange?.({label:tab==='new'?'この条件で提案':'新しい取引',disabled:resourcePicker>=0||(tab==='new'&&(!draft||!proposeV39Trade(state(),state().activePlayerId,draft).ok)),message:message||modal()?.querySelector('.v39-trade-footer-copy')?.textContent||''});}
export function submitV39TradePanel(){if(tab==='new')run('propose');else{tab='new';render();}}
export function selectV39TradeNegotiator(id,targetId){
  if(draft?.sides[1].partyId===targetId)draft.negotiatorId=id;
  const s=state();let next=s;
  for(const contract of listV39Trades(s))if(contract.negotiatorId!==id&&contract.ownerId===s.activePlayerId&&['proposed','active','interrupted'].includes(contract.status)&&contract.sides.some(side=>side.kind==='village'&&side.partyId===targetId))next=updateV39Trade(next,{...contract,negotiatorId:id});
  if(next!==s)window.setV39GameState(next,{reason:'trade-negotiator-selected'});
}
export function unmountV39TradePanel(){
  if(!embedded)return;
  closeResourcePicker();picking=-1;const root=modal();root.hidden=true;root.classList.remove('v39-trade-embedded');document.body.append(root);embedded=null;
  root.querySelector('.v39-trade-dialog').setAttribute('role','dialog');root.querySelector('.v39-trade-dialog').setAttribute('aria-modal','true');
}
export function mountV39TradePanel(host,villageId,callbacks){
  ensure();
  if(embedded?.host!==host||embedded?.villageId!==villageId){
    unmountV39TradePanel();embedded={host,villageId,...callbacks};host.append(modal());modal().classList.add('v39-trade-embedded');
    modal().querySelector('.v39-trade-dialog').setAttribute('role','region');modal().querySelector('.v39-trade-dialog').removeAttribute('aria-modal');open(villageId,'new',true);
  }else{modal().hidden=false;if(callbacks.negotiatorId&&draft)draft.negotiatorId=callbacks.negotiatorId;render({preserveInput:true});}
}
export function hideV39TradePanel(){if(embedded){closeResourcePicker();modal().hidden=true;}}
const updateTradeMarkup=(host,markup,options={})=>updateV39RetainedMarkup(host,markup,{
  ...options,preserveValue:node=>node.id?.startsWith('trade-date-')&&node.value!==node.defaultValue,
  preserveDetails:node=>!node.hasAttribute('data-trade-fold')
});
function closeResourcePicker() {
  const index=resourcePicker;resourcePicker=-1;
  closeV39TradePicker(modal());
  modal()?.querySelector(`[data-trade-add-side="${index}"]`)?.focus();
  notifyPanel();
}
function renderResourcePicker(options={}) {
  const root=modal();
  if(resourcePicker<0||!draft){closeV39TradePicker(root);return;}
  renderV39TradePicker(root,tradePickerModalHtml(state(),draft.sides[resourcePicker],resourcePicker,{filter:resourceFilter,search:resourceSearch,selected:selectedItems[resourcePicker]}),{
    background:root.querySelector('.v39-trade-dialog'),onClose:closeResourcePicker,updateMarkup:updateTradeMarkup,options
  });
  notifyPanel();
}

function endpoints(s) {
  const own=s.players.find(row=>row.id===s.activePlayerId);
  return [...s.players.filter(row=>row.id!==s.activePlayerId).map(row=>({value:`player:${row.id}`,label:row.label||row.name||row.id})),
    ...(s.neutralVillages||[]).filter(v=>window.isV39TestMode?.()||own?.factionState.units.some(unit=>isV39VillageContactUnit(unit,v))).map(row=>({value:`village:${row.id}`,label:row.name||row.id}))];
}
function sideFor(s,value) {
  const split=value.indexOf(':'),kind=value.slice(0,split),partyId=value.slice(split+1);
  const party=kind==='player'?s.players.find(row=>row.id===partyId):s.neutralVillages.find(row=>row.id===partyId);
  const banks=kind==='player'?(party?.factionState.settlements||[]).filter(row=>row.placed):party?[party]:[];
  const units=kind==='player'?party?.factionState.units||[]:party?.defenseUnits||[];
  const actor=units.find(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface'&&!unit.tradeAssignment)||units[0];
  return {kind,partyId,settlementId:banks[0]?.settlementId||banks[0]?.id||'',unitId:actor?.id||'',center:{x:n(banks[0]?.x),y:n(banks[0]?.y)},radius:1,goods:{}};
}
function fresh(s,villageId,playerId='') {
  const choices=endpoints(s),other=playerId?`player:${playerId}`:villageId?`village:${villageId}`:choices[0]?.value;
  if(!other)return null;
  const sides=[sideFor(s,`player:${s.activePlayerId}`),sideFor(s,other)];
  const midpoint={x:Math.round((sides[0].center.x+sides[1].center.x)/2),y:Math.round((sides[0].center.y+sides[1].center.y)/2)};
  sides.forEach(side=>{side.center={...midpoint};});
  return {sides,deliveryMode:'proposer',negotiatorId:s.players.find(p=>p.id===s.activePlayerId)?.factionState.selectedUnitId||sides[0].unitId,dueTurn:tradeTurn(s)+8,grace:3,period:0,cycles:1,specialtyTurns:10,method:'exchange',negotiation:'normal'};
}
function syncDelivery(s){
  if(!draft)return;draft.deliveryMode||='meeting';
  const courier=tradeCourierIndex(draft);
  if(courier>=0){const bank=tradeBank(s,draft.sides[1-courier]);if(bank)draft.sides.forEach(side=>{side.center={x:bank.x,y:bank.y};side.radius=1;});}
  else{draft.sides[1].center={...draft.sides[0].center};draft.sides[1].radius=draft.sides[0].radius;}
}
function ensure() {
  if(modal())return;
  const root=document.createElement('div');root.id='v39-trade-modal';root.hidden=true;root.className='v39-trade-backdrop';
  root.innerHTML='<section class="v39-trade-dialog" role="dialog" aria-modal="true" aria-labelledby="v39-trade-title"><header><b id="v39-trade-title">取引・郵送・貿易</b><button data-trade-action="close" aria-label="閉じる">×</button></header><nav><button data-trade-tab="new">提案</button><button data-trade-tab="contracts">取引一覧</button></nav><div class="v39-trade-body"></div><output role="status"></output><footer class="v39-trade-footer"></footer></section>';
  document.body.append(root);
  installTradeLayout(root);
  for(const type of ['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','wheel'])root.addEventListener(type,event=>event.stopPropagation());
  root.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    const sideIndex=Number(button.dataset.tradeItemSide);
    if(button.hasAttribute('data-trade-warning')){message=button.title;notifyPanel();return;}
    if(button.hasAttribute('data-trade-picker-close')){closeResourcePicker();return;}
    if(button.dataset.tradeAddSide!=null){resourcePicker=Number(button.dataset.tradeAddSide);resourceSearch='';renderResourcePicker();return;}
    if(button.dataset.tradeResourceFilter){resourceFilter=button.dataset.tradeResourceFilter;render();return;}
    if(button.dataset.tradeResourceAdd){
      const name=button.dataset.tradeResourceAdd,current=state(),side=draft?.sides[sideIndex];
      if(!side||(sideIndex===1?!getV39KnownTradeResources(current).has(name):!getV39TradeResourceAvailability(current,side,window.__v39FieldRuntime?.mapData)[name]?.canSelect)){message=sideIndex===1?'まだ知らない物資は要求できません':`${name}: 在庫・収入がないため追加できません`;render();return;}
      selectedItems[sideIndex]=name;if(!Object.hasOwn(side.goods,name))side.goods[name]=1;render();return;
    }
    if(button.dataset.tradeItemSelect){selectedItems[sideIndex]=button.dataset.tradeItemSelect;render();return;}
    if(button.dataset.tradeItemRemove){delete draft.sides[sideIndex].goods[button.dataset.tradeItemRemove];if(selectedItems[sideIndex]===button.dataset.tradeItemRemove)selectedItems[sideIndex]='';render();return;}
    if(button.dataset.tradeItemStep){const name=button.dataset.tradeResource;draft.sides[sideIndex].goods[name]=Math.max(1,n(draft.sides[sideIndex].goods[name])+Number(button.dataset.tradeItemStep));render();return;}
    if(button.dataset.tradeTab){closeResourcePicker();tab=button.dataset.tradeTab;render();return;}
    if(button.dataset.tradePick){picking=Number(button.dataset.tradePick);root.hidden=true;embedded?.onMapPick?.(true);window.activateV39FooterTab?.('tile');window.showV39TurnBanner?.('待ち合わせのマスを選択してください。Escで取消');return;}
    if(button.dataset.tradeAction)run(button.dataset.tradeAction,button.dataset.tradeId);
  });
  root.addEventListener('toggle',event=>{if(event.target.isConnected&&event.target.dataset.tradeFold){const key=event.target.dataset.tradeFold,changed=folds.get(key)!==event.target.open;folds.set(key,event.target.open);if(key==='delivery'&&changed&&event.target.open)render();}},true);
  root.addEventListener('focusin',event=>{
    const input=event.target,resource=input.closest?.('[data-trade-resource-add]');
    if(resource){const name=root.querySelector('[data-trade-picker-name]');if(name)name.textContent=resource.dataset.tradeResourceAdd;}
    if(!embedded||!input.classList.contains('v39-trade-icon-amount'))return;
    const index=Number(input.dataset.tradeSide),name=input.dataset.tradeResource;
    if(selectedItems[index]!==name){selectedItems[index]=name;render({preserveInput:true});}
  });
  root.addEventListener('pointerover',event=>{const resource=event.target.closest?.('[data-trade-resource-add]'),name=root.querySelector('[data-trade-picker-name]');if(resource&&name)name.textContent=resource.dataset.tradeResourceAdd;});
  const restorePickerName=event=>{
    const resource=event.target.closest?.('[data-trade-resource-add]'),name=root.querySelector('[data-trade-picker-name]'),side=draft?.sides[resourcePicker];
    if(resource&&name&&side&&!resource.contains(event.relatedTarget))name.textContent=Object.hasOwn(side.goods,selectedItems[resourcePicker])?selectedItems[resourcePicker]:Object.keys(side.goods)[0]||'物資を選択';
  };
  root.addEventListener('pointerout',restorePickerName);root.addEventListener('focusout',restorePickerName);
  root.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.sideField==='amount'){
      const amount=Number(input.value),index=Number(input.dataset.tradeSide),name=input.dataset.tradeResource;
      if(!Number.isSafeInteger(amount)||amount<1||!Object.hasOwn(draft.sides[index].goods,name))return;
      draft.sides[index].goods[name]=amount;
      const current=state();
      root.querySelectorAll('[data-side-field="amount"]').forEach(control=>{if(Number(control.dataset.tradeSide)===index&&control.dataset.tradeResource===name){if(control.type==='range')control.max=Math.max(Number(control.max),amount);if(control!==input)control.value=amount;}});
      root.querySelectorAll('[data-trade-item-select],[data-trade-resource-add]').forEach(button=>{if(Number(button.dataset.tradeItemSide)===index&&(button.dataset.tradeItemSelect||button.dataset.tradeResourceAdd)===name){const badge=button.querySelector('b');if(badge)badge.textContent=button.dataset.tradeResourceAdd&&index===0?`${amount}/${Math.floor(tradeBankAmount(tradeBank(current,draft.sides[index]),name))}`:amount;button.setAttribute('aria-label',`${name} ${amount}`);}});
      const preview=proposeV39Trade(current,current.activePlayerId,draft),button=root.querySelector('[data-trade-action="propose"]');
      if(button)button.disabled=!preview.ok;
      const copy=root.querySelector('.v39-trade-footer-copy');if(copy)copy.textContent=preview.ok?'':preview.reason;
      if(embedded)draft.sides.forEach((side,sideIndex)=>{
        const warnings=resourceWarnings(current,side);
        root.querySelectorAll(`[data-trade-warning][data-trade-item-side="${sideIndex}"]`).forEach(marker=>{const reason=warnings[marker.dataset.tradeWarning]||'';marker.hidden=!reason;marker.title=reason;marker.setAttribute('aria-label',reason);});
      });
      notifyPanel();
    }
    if(input.hasAttribute('data-trade-resource-search')){resourceSearch=input.value;const grid=root.querySelector('.v39-trade-resource-grid');if(grid)updateTradeMarkup(grid,tradeResourcePicker(state(),draft.sides[resourcePicker],resourcePicker,{filter:resourceFilter,search:resourceSearch,selected:selectedItems[resourcePicker]}));}
  });
  root.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.tradeField){const field=input.dataset.tradeField;
      if(field==='method'&&input.value==='mail'&&Object.keys(draft.sides[1].goods).length&&!window.confirm('郵送では要求物資を指定できません。要求した物資を外して郵送に切り替えますか？')){render();return;}
      draft[field]=['method','negotiation','deliveryMode'].includes(field)?input.value:Number(input.value);
      if(field==='deliveryMode'){
        if(input.value==='meeting'){const banks=draft.sides.map(side=>tradeBank(state(),side));if(banks.every(Boolean))draft.sides[0].center={x:Math.round((banks[0].x+banks[1].x)/2),y:Math.round((banks[0].y+banks[1].y)/2)};draft.sides[0].radius=1;}
        draft.sides.forEach((side,index)=>{if(!side.unitId&&(tradeCourierIndex(draft)<0||tradeCourierIndex(draft)===index))side.unitId=sideFor(state(),`${side.kind}:${side.partyId}`).unitId;});
      }
      if(field==='method'&&input.value==='mail'){draft.sides[1].goods={};resourcePicker=-1;const bank=tradeBank(state(),draft.sides[1]);if(bank)draft.sides.forEach(side=>{side.center={x:bank.x,y:bank.y};side.radius=1;});}render();return;}
    if(input.dataset.tradeSide==null)return;
    const i=Number(input.dataset.tradeSide),side=draft.sides[i],field=input.dataset.sideField;
    if(field==='party'){draft.sides[i]={...sideFor(state(),input.value),center:{...side.center},radius:side.radius,goods:{...side.goods}};resourcePicker=-1;
      if(draft.method==='mail'){const bank=tradeBank(state(),draft.sides[i]);if(bank)draft.sides.forEach(row=>{row.center={x:bank.x,y:bank.y};row.radius=1;});}}
    else if(field==='amount'){const amount=Number(input.value),resource=input.dataset.tradeResource;if(!Number.isSafeInteger(amount)||amount<1){message='数量は1以上の整数で指定してください。削除は×を押してください。';render();return;}side.goods[resource]=amount;}
    else if(field==='x'||field==='y')side.center[field]=Number(input.value);
    else side[field]=['radius'].includes(field)?Number(input.value):input.value;
    render();
  });

}
function open(villageId='',show='new',inline=false,playerId='') {
  if(!inline){window.closeV39VillageMenu?.();unmountV39TradePanel();}
  ensure();const s=state();if(s.timeline.phase!=='player'){window.showV39TurnBanner?.('操作ターンに取引を開いてください');return;}
  if(playerId&&(playerId===s.activePlayerId||!s.players.some(player=>player.id===playerId)))return;
  draftKey=`${s.activePlayerId}:${playerId?'player:'+playerId:villageId||'default'}`;
  const cached=drafts.get(draftKey),matches=row=>row?.sides[0].partyId===s.activePlayerId&&(playerId?row.sides[1].kind==='player'&&row.sides[1].partyId===playerId:!villageId||row.sides[1].kind==='village'&&row.sides[1].partyId===villageId);
  draft=(matches(cached)?cached:null)||(villageId?[...drafts.values()].find(matches):null)||fresh(s,villageId,playerId);if(draft)drafts.set(draftKey,draft);
  if(inline&&embedded?.negotiatorId&&draft)draft.negotiatorId=embedded.negotiatorId;
  closeResourcePicker();tab=show;message='';modal().hidden=false;render();
}
const option=(value,label,selected)=>`<option value="${html(value)}"${value===selected?' selected':''}>${html(label)}</option>`;
function resourceWarnings(s,side){
  if(side.kind!=='player'||side.partyId!==s.activePlayerId)return {};
  if(!Object.keys(side.goods).length)return {};
  const party=side.kind==='player'?s.players.find(row=>row.id===side.partyId):s.neutralVillages.find(row=>row.id===side.partyId);
  const bank=tradeBank(s,side),map=window.__v39FieldRuntime?.mapData,turns=Math.max(1,draft.dueTurn-tradeTurn(s));
  if(!bank)return {};
  const metrics=map?.grid?(side.kind==='village'?inspectV39NeutralVillageEconomy(bank,map):collectV39TerritoryIncome(s,{...party,factionState:{...party.factionState,selectedSettlementId:side.settlementId}},map)):null;
  const units=party?.factionState?.units||[];
  const maintenance=side.kind==='village'?metrics?.maintenance:buildV39PopulationMaintenanceStock(bank.populationByRace,units.filter(unit=>tradeAlive(unit)&&(unit.settlementId||party.factionState.selectedSettlementId)===side.settlementId),FOOD_RESOURCE_KEYS);
  return Object.fromEntries(Object.entries(side.goods).map(([name,amount])=>{
    const current=tradeBankAmount(bank,name),needed=Math.ceil(amount/3),income=n(metrics?.income?.food?.[name]??metrics?.income?.material?.[name]??metrics?.food?.[name]??metrics?.material?.[name])+(side.kind==='player'?n(metrics?.facilityFixedIncome?.[name]):0),target=Math.ceil(Math.max(0,amount-needed)/turns),upkeep=n(maintenance?.[name]),reasons=[];
    if(V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty){if(current<amount)reasons.push('貸出できる保有数が不足しています');}
    else{
      if(current<needed)reasons.push('初回に予約する在庫が不足しています');
      if(metrics&&current<amount&&income<target)reasons.push('期日までに収入が不足する見込みです');
      if(metrics&&current-needed+turns*(income-target-upkeep)<0)reasons.push('予約後に維持費が不足する見込みです');
    }
    return [name,reasons.length?`${name}: ${reasons.join(' / ')}`:''];
  }));
}
function courierSelector(s,side,index){
  const party=side.kind==='player'?s.players.find(row=>row.id===side.partyId):s.neutralVillages.find(row=>row.id===side.partyId),units=side.kind==='player'?party?.factionState.units||[]:party?.defenseUnits||[];
  return `<label>使者・部隊<select data-trade-side="${index}" data-side-field="unitId">${units.filter(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface').map(unit=>option(unit.id,`${unit.name} ${unit.tradeAssignment?'[取引中]':''}`,side.unitId)).join('')}</select></label>`;
}
function sideHtml(s,side,index) {
  const party=side.kind==='player'?s.players.find(row=>row.id===side.partyId):s.neutralVillages.find(row=>row.id===side.partyId);
  const banks=side.kind==='player'?party?.factionState.settlements||[]:party?[party]:[];
  const attr=field=>`data-trade-side="${index}" data-side-field="${field}"`;
  return `<section class="v39-trade-side"><b>${index?'相手の拠点':'自国の拠点'} / ${html(party?.label||party?.name||side.partyId)}</b>
    <label>出発拠点<select ${attr('settlementId')}>${banks.filter(row=>row.placed||side.kind==='village').map(row=>option(row.settlementId||row.id,row.name||row.id,side.settlementId)).join('')}</select></label>
    ${tradeCourierIndex(draft)<0?courierSelector(s,side,index):''}</section>`;
}
function render(options={}) {
  ensure();if(modal().hidden)return;const s=state(),body=modal().querySelector('.v39-trade-body'),scroll=body.scrollTop;
  let content=body.querySelector(':scope > .v39-trade-content');
  if(!content){content=document.createElement('div');content.className='v39-trade-content';body.append(content);}
  const context=`${s.activePlayerId}:${draftKey}:${tab}`;
  if(content.dataset.context!==context){content.replaceChildren();content.__v39RetainedMarkup=null;content.dataset.context=context;}
  body.querySelectorAll('[data-trade-fold]').forEach(details=>folds.set(details.dataset.tradeFold,details.open));
  modal().querySelectorAll('[data-trade-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tradeTab===tab));
  const footer=modal().querySelector('.v39-trade-footer');footer.hidden=tab!=='new'||!draft;
  if(tab==='new'&&draft){syncDelivery(s);const preview=proposeV39Trade(s,s.activePlayerId,draft),courier=tradeCourierIndex(draft);
    updateTradeMarkup(footer,`<div class="v39-trade-footer-copy">${preview.ok?'':html(preview.reason)}</div><button data-trade-action="propose"${preview.ok?'':' disabled'}>提案</button>`,options);
    updateTradeMarkup(content,`<div class="v39-trade-partner"><label>取引相手 <select data-trade-side="1" data-side-field="party">${endpoints(s).map(row=>option(row.value,row.label,`${draft.sides[1].kind}:${draft.sides[1].partyId}`)).join('')}</select></label><label>方法 <select data-trade-field="method">${option('exchange','交換・要求',draft.method)}${option('mail','郵送（一方向）',draft.method)}</select></label></div>
    <div class="v39-trade-baskets">${draft.sides.map((side,index)=>tradeBasketHtml(s,side,index,{mail:draft.method==='mail',selected:selectedItems[index],rows:!!embedded,warnings:embedded?resourceWarnings(s,side):{}})).join('')}</div>
    <div class="v39-trade-delivery"><label>配送<select data-trade-field="deliveryMode">${option('proposer','自国から使者を出す',draft.deliveryMode)}${option('partner','相手から使者を出す',draft.deliveryMode)}${option('meeting','双方で待ち合わせる',draft.deliveryMode)}</select></label>${courier>=0?courierSelector(s,draft.sides[courier],courier):''}</div>
    <details class="v39-trade-options" data-trade-fold="delivery"${folds.get('delivery')?' open':''}><summary>${courier<0?'待ち合わせ・日程':'日程・拠点'} / T${draft.dueTurn} / ${draft.period?`${draft.period}Tごと・${draft.cycles}回`:'単発'}</summary><div class="v39-trade-options-content">${courier<0?`<div class="v39-trade-meeting"><b>申込側が指定する待ち合わせ場所</b><div class="v39-trade-row"><label>X<input type="number" min="0" value="${draft.sides[0].center.x}" data-trade-side="0" data-side-field="x"></label><label>Y<input type="number" min="0" value="${draft.sides[0].center.y}" data-trade-side="0" data-side-field="y"></label><button data-trade-pick="0">マップで指定</button><label>周囲<input type="number" min="1" max="${config.maxRadius}" value="${draft.sides[0].radius}" data-trade-side="0" data-side-field="radius">マス</label></div></div>`:''}<div class="v39-trade-row">
    <label>交渉 <select data-trade-field="negotiation">${option('normal','通常交渉',draft.negotiation)}${option('intimidation','威圧交渉',draft.negotiation)}</select></label>
    <label>取引日 T<input type="number" min="${tradeTurn(s)+1}" value="${draft.dueTurn}" data-trade-field="dueTurn"></label>
    <label>猶予<input type="number" min="3" max="30" value="${draft.grace}" data-trade-field="grace"></label>
    <label>周期<input type="number" min="0" value="${draft.period}" data-trade-field="period"></label>
    <label>回数<input type="number" min="1" max="100" value="${draft.cycles}" data-trade-field="cycles"></label></div><div class="v39-trade-sides">${draft.sides.map((side,i)=>sideHtml(s,side,i)).join('')}</div></div></details>
    ${draft.sides.some(side=>Object.keys(side.goods).some(name=>V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty))?`<label>特産品の貸出 ⌛<input type="number" min="1" max="100" value="${draft.specialtyTurns||10}" data-trade-field="specialtyTurns" aria-label="特産品の貸出ターン数"></label>`:''}
    <details class="v39-trade-options" data-trade-fold="rules"${folds.get('rules')?' open':''}><summary>予約在庫・維持費について</summary><p>成立時に双方の次回分1/3を手持ちから確保します。残りは実収入から予約し、維持費には使えません。使者は相手の拠点で受け渡して帰還します。待ち合わせでは指定場所に双方が到着して交換します。</p></details>`,options);
  }
  else {
    const visible=listV39Trades(s).filter(row=>row.sides.some(side=>side.kind==='player'&&side.partyId===s.activePlayerId)&&(!embedded||row.sides.some(side=>side.kind==='village'&&side.partyId===embedded.villageId)));
    const labels={proposed:'承諾待ち',active:'自動取引中',interrupted:'中断・再協議',cancelling:'中止・帰還中',complete:'完了',cancelled:'中止完了',rejected:'拒否/取下げ'};
    const stages={collecting:'収入確保・拠点へ集合',outbound:'取引場所へ移動',waiting:'到着待ち',returning:'帰還・荷下ろし',returned:'帰還済み'};
    const partyName=side=>side.kind==='player'?s.players.find(row=>row.id===side.partyId)?.label:s.neutralVillages.find(row=>row.id===side.partyId)?.name;
    updateTradeMarkup(content,visible.map(row=>`<article class="v39-trade-contract" data-trade-contract="${html(row.id)}"><h4>取引 #${row.sequence} / ${labels[row.status]}</h4><span>取引日 T${row.dueTurn}〜T${row.dueTurn+row.grace} / ${row.completedCycles}/${row.cycles}回${row.reason?` / ${html(row.reason)}`:''}</span>
      ${row.sides.map(side=>`<div class="v39-trade-side-progress"><b>${html(partyName(side)||side.partyId)} / ${side.kind==='player'&&side.partyId===s.activePlayerId?'渡す物資':'受け取る物資'}</b><div class="v39-trade-summary-items">${tradeResourceChips(side.goods)}</div><small>${html(stages[side.stage]||'未成立')}${side.reason?` / ${html(side.reason)}`:''}</small><details><summary>予約・運搬の詳細</summary>${Object.entries(side.goods).map(([name,total])=>{const reserved=n(side.reserved?.[name]),carried=n(getTradeCargo(s,side).resourcesByType[name]),missing=Math.max(0,total-reserved-carried);return `<p>${tradeResourceChips({[name]:total})} / 予約${reserved} / 搬送${carried}${['collecting','outbound','waiting'].includes(side.stage)?` / 未確保${missing} / 毎T目標${Math.ceil(missing/Math.max(1,row.dueTurn-tradeTurn(s)))}`:''}</p>`;}).join('')}</details></div>`).join('')}
      <div class="v39-trade-row">${row.status==='proposed'&&(row.sides[1].kind==='village'?row.ownerId===s.activePlayerId:row.sides[1].partyId===s.activePlayerId)?`<button data-trade-action="accept" data-trade-id="${html(row.id)}">${row.sides[1].kind==='village'?'村へ条件を提示・判定':'承諾'}</button>`:''}
      ${row.status==='active'?`<button data-trade-action="pause" data-trade-id="${html(row.id)}">中断</button><button data-trade-action="reserve-stock" data-trade-id="${html(row.id)}">手持ちから追加確保</button>${row.sides.some(side=>side.kind==='village')&&row.ownerId===s.activePlayerId?`<button data-trade-action="reserve-village" data-trade-id="${html(row.id)}">村へ備蓄の確保を交渉</button>`:''}`:''}
      ${row.status==='interrupted'?`<label>再開日 T<input id="trade-date-${html(row.id)}" type="number" value="${Math.max(row.dueTurn,tradeTurn(s)+3)}"></label><button data-trade-action="resume" data-trade-id="${html(row.id)}">この日程で再開を確認</button>`:''}
      ${['proposed','active','interrupted'].includes(row.status)?`<button data-trade-action="cancel" data-trade-id="${html(row.id)}">${row.status==='proposed'?'拒否・取下げ':'中止・引き返す'}</button>`:''}
      <button data-trade-action="revise" data-trade-id="${html(row.id)}">条件を変えて再提案</button></div></article>`).join('')||'<p>取引はありません。相手がいれば「提案」タブから作成できます。</p>',options);
  }
  body.scrollTop=scroll;modal().querySelector('output').textContent=message;modal().querySelector('output').hidden=!message;
  if(draft&&!embedded){const own=s.players.find(p=>p.id===s.activePlayerId),other=draft.sides[1],units=own.factionState.units.filter(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface');
    const actor=units.find(unit=>unit.id===draft.negotiatorId)||units.find(unit=>unit.id===own.factionState.selectedUnitId)||units[0];
    const peers=other.kind==='village'?s.neutralVillages.find(v=>v.id===other.partyId)?.defenseUnits:s.players.find(p=>p.id===other.partyId)?.factionState.units;
    const village=other.kind==='village'?s.neutralVillages.find(v=>v.id===other.partyId):null;
    let conversation=body.querySelector(':scope > .v39-trade-conversation-fold');
    if(!conversation){conversation=document.createElement('details');conversation.className='v39-trade-conversation-fold';conversation.innerHTML='<summary></summary><div></div>';body.prepend(conversation);}
    conversation.dataset.tradeFold='conversation';conversation.open=folds.get('conversation')===true;
    conversation.querySelector('summary').textContent=`会話・スキル / ${actor?.name||'交渉役なし'} / AP ${n(actor?.ap??actor?.currentAp)}`;
    const conversationBody=conversation.querySelector(':scope > div');
    renderV39Conversation(conversationBody,{target:other.partyId,actor,units,peer:village?getV39VillageSpeaker(village):peers?.find(tradeAlive)||{race:'只人',className:'ファイター',name:'相手の代表'},onActorChange:id=>{
      draft.negotiatorId=id;selectV39TradeNegotiator(id,other.partyId);render();}});
    body.scrollTop=scroll;
  }
  renderResourcePicker(options);
  notifyPanel();
}
function commit(result,conversation={}) {
  message=result.ok?result.message:result.reason;if(draft)recordV39Conversation(draft.sides[1].partyId,'{一人称}から提示した条件をご確認ください。',message,{replyColumn:'取引提案',...conversation});
  if(result.ok){window.setV39GameState(result.state,{reason:'trade-operation'});window.appendV39ActivityLog?.(state().activePlayerId,'取引',message);}render();return result;
}
function run(action,id) {
  if(action==='close'){closeResourcePicker();modal().hidden=true;return;}
  if(window.isV39MapInputLocked?.()||state().timeline.phase!=='player'){message='処理完了後、操作ターンに実行してください';render();return;}
  const s=state(),playerId=s.activePlayerId;
  if(action==='propose'){const map=window.__v39FieldRuntime?.mapData;
    if(draft?.sides.some(side=>map&&(side.center.x>=map.w||side.center.y>=map.h))){message='マップ内の待ち合わせマスを指定してください';render();return;}
    const result=proposeV39Trade(s,playerId,draft);if(result.ok)tab='contracts';commit(result);}
  else if(action==='accept'){const contract=listV39Trades(s).find(row=>row.id===id);if(!window.confirm(contract?.sides[1].kind==='village'?'この条件で交渉しますか？ 成否に関わらず交渉役のAP20を消費します。':'この取引を承諾しますか？ 次回分の1/3を確保します。'))return;const result=acceptV39Trade(s,playerId,id);commit(result,{speechColumn:result.ok?(listV39Trades(result.state).find(row=>row.id===id)?.status==='rejected'?'交渉失敗':'交渉成功'):undefined});}
  else if(action==='pause'||action==='cancel')commit(stopV39Trade(s,playerId,id,action==='cancel'));
  else if(action==='reserve-stock'||action==='reserve-village'){if(action==='reserve-village'&&!window.confirm('村の備蓄を追加確保する交渉を行いますか？ AP20を消費します。'))return;commit(reserveV39TradeFromStock(s,playerId,id,action==='reserve-village'));}
  else if(action==='resume'){const row=listV39Trades(s).find(row=>row.id===id);if(row.sides.some(side=>side.kind==='village')&&!window.confirm('この日程で再開を交渉しますか？ AP20を消費します。'))return;commit(resumeV39Trade(s,playerId,id,Number(document.getElementById(`trade-date-${id}`).value),row.grace));}
  else if(action==='revise'){const row=listV39Trades(s).find(row=>row.id===id);draft=structuredClone(row);if(draft.sides[0].partyId!==playerId){draft.sides.reverse();if(tradeCourierIndex(draft)>=0)draft.deliveryMode=draft.deliveryMode==='proposer'?'partner':'proposer';}draft.dueTurn=tradeTurn(s)+8;drafts.set(draftKey,draft);tab='new';message='旧取引は勝手に変更されません。旧取引を中止・荷下ろししてから再提案してください。';render();}
}
function queue() {if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;if(modal()&&!modal().hidden){if(draft&&draft.sides[0].partyId!==state().activePlayerId){closeResourcePicker();modal().hidden=true;}else render({preserveInput:true});}});}
document.addEventListener('click',event=>{
  if(event.target.closest?.('#footSettlement [data-open-v39-trade]'))open();
});
function advanceNpc(event) {
  const map=window.__v39FieldRuntime?.mapData,s=state(),turn=n(event.detail?.turnNumber)||tradeTurn(s);if(!map?.grid||(s.activeWorldId||'surface')!=='surface')return;
  const villageIds=new Set(listV39Trades(s).flatMap(row=>row.sides.filter(side=>side.kind==='village').map(side=>side.partyId)));if(!villageIds.size)return;
  let next=s;
  for(const id of villageIds) {
    const side={kind:'village',partyId:id},bank=tradeBank(next,side);if(!bank||bank.lastTradeEconomyTurn>=turn)continue;
    const metrics=inspectV39NeutralVillageEconomy(bank,map),diverted=divertV39TradeIncome(next,'village',id,id,{...metrics.income.food,...metrics.income.material},turn);next=diverted.state;
    const updated={...bank,foodStockByType:{...bank.foodStockByType},materialStockByType:{...bank.materialStockByType},lastTradeEconomyTurn:turn,tradeProductionByType:{...metrics.income.food,...metrics.income.material},
      defenseUnits:(bank.defenseUnits||[]).map(unit=>unit.tradeAssignment?{...unit,ap:unit.maxAp||100,currentAp:unit.maxAp||100}:unit)};
    for(const resource of V39_TRADE_RESOURCES)updated[resource.field][resource.name]=Math.max(0,Math.round((n(bank[resource.field]?.[resource.name])+n(diverted.income[resource.name])-(resource.field==='foodStockByType'?n(metrics.maintenance[resource.name]):0))*10)/10);
    next=updateTradeBank(next,side,updated);
  }
  const logistics=advanceV39TradeLogistics(next,'',map,turn,true);window.setV39GameState({players:logistics.state.players,neutralVillages:logistics.state.neutralVillages,settlements:logistics.state.settlements},{reason:'trade-village-turn'});
}
window.openV39TradeModal=open;
window.openV39FactionTradeModal=playerId=>open('','new',false,playerId);
window.getV39TradeRules=()=>({listV39Trades,proposeV39Trade,acceptV39Trade,stopV39Trade,resumeV39Trade,divertV39TradeIncome,advanceV39TradeLogistics,reserveV39TradeFromStock,tradeCapacity,tradeSpeed,getV39SpecialtyAccess,getV39TradeResourceAvailability,getV39KnownTradeResources});
window.addEventListener('v39:game-state-changed',queue);window.addEventListener('v39:footer-tab-changed',queue);window.addEventListener('v39:tile-selected',event=>{
  if(picking>=0&&draft){draft.sides[picking].center={x:event.detail.x,y:event.detail.y};picking=-1;embedded?.onMapPick?.(false);modal().hidden=false;render();}else queue();
});
window.addEventListener('v39:village-menu-opened',queue);
window.addEventListener('v39:conversation-updated',queue);
window.addEventListener('v39:field-generated',()=>{closeResourcePicker();drafts.clear();draft=null;message='';if(modal())modal().hidden=true;});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented){if(resourcePicker>=0){event.preventDefault();closeResourcePicker();return;}if(picking>=0){event.preventDefault();picking=-1;embedded?.onMapPick?.(false);modal().hidden=false;render();}else if(modal()&&!embedded)modal().hidden=true;}});
window.addEventListener('v39:turn-stage-world',advanceNpc);queue();

window.startV39TradeTest=()=>{
  drafts.clear();draft=null;message='';resourcePicker=-1;folds.clear();
  const result=window.startV39VillageIncidentTest?.();if(!result?.ok)return result;
  window.closeV39VillageMenu?.();
  let s=state(),players=structuredClone(s.players);
  const first=players[0],second=players[1],bank=second.factionState.settlements[0];bank.x=10;bank.y=5;bank.territoryTileKeys=[bank,...getHexNeighborCoords(24,24,10,5)].map(row=>`${row.x},${row.y}`);bank.population=30;bank.populationByRace={只人:30};
  first.factionState.units.forEach((unit,i)=>{unit.x=i===2?5:4;unit.y=i===1?3:4;unit.position=[unit.x,unit.y];});
  second.factionState.units[0].x=10;second.factionState.units[0].y=5;
  const cart={...buildV39UnitEntity({id:'trade-test-wagon',name:'運搬馬車（仮）',race:'ホース',className:'ホース',level:3,x:5,y:5,squadId:'village-visitors',isNamed:false}),worldId:'surface',isTransportVehicle:true,cargoCapacityBonus:config.wagonBonus};
  first.factionState.units.push(cart);first.factionState.squads.find(row=>row.id==='village-visitors').unitIds.push(cart.id);
  const map=structuredClone(window.__v39FieldRuntime.mapData);for(const tile of bank.territoryTileKeys){const [x,y]=tile.split(',').map(Number);map.grid[y][x]='森';}
  const village={...s.neutralVillages[0],x:18,y:5,territoryTileKeys:[{x:18,y:5},...getHexNeighborCoords(24,24,18,5)].map(row=>`${row.x},${row.y}`),foodStockByType:{穀物:1000,魂:30},materialStockByType:{木材:1000}};
  village.defenseUnits=village.defenseUnits.map((unit,i)=>({...unit,x:17,y:5-i}));
  const owners={...s.territoryOwnerByTile},territories={...s.territoryStateByTile};for(const tile of bank.territoryTileKeys){owners[tile]=second.id;territories[tile]={settlementId:bank.settlementId,hp:100,maxHp:100};}
  const home=first.factionState.settlements[0],definitions=v39SpecialtyDefinitions().filter(row=>row.分類!=='特殊資源');
  home.x=4;home.y=4;home.territoryTileKeys=[home,...getHexNeighborCoords(24,24,4,4)].map(row=>`${row.x},${row.y}`);
  for(const player of [first,second]) {
    const base=player===first?home:bank,sites={...player.factionState.exploration?.discoveredSpecialtiesByTile};
    base.territoryTileKeys.forEach(key=>{owners[key]=player.id;territories[key]={settlementId:base.settlementId,hp:100,maxHp:100};});
    const rows=player===first?[definitions[0],...definitions.slice(0,3)]:definitions.slice(0,3);
    rows.forEach((row,index)=>{const key=base.territoryTileKeys[index];if(!row||!key)return;const [x,y]=key.split(',').map(Number),site={key,x,y,name:row.名前,category:row.分類};sites[key]=site;map.specialtiesByTile={...map.specialtiesByTile,[key]:site};});
    player.factionState.exploration={...player.factionState.exploration,discoveredSpecialtiesByTile:sites};
  }
  s={...s,players,specialtiesByTile:{...s.specialtiesByTile,...map.specialtiesByTile},neutralVillages:[village],settlements:s.settlements.map(row=>row.id===village.id?village:row),territoryOwnerByTile:owners,territoryStateByTile:territories,enemies:[],enemyNests:[]};
  window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});window.setV39GameState(s,{reason:'trade-test-start'});open();draft.sides[0].goods={穀物:30};draft.sides[1].goods={木材:30};render();return {ok:true};
};
