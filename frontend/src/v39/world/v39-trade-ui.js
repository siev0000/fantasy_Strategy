import {V39_TRADE_CONFIG as config,V39_TRADE_RESOURCES,listV39Trades,proposeV39Trade,acceptV39Trade,stopV39Trade,resumeV39Trade,
  tradeBank,tradeBankAmount,tradeMembers,tradeCapacity,tradeTurn,tradeAlive,divertV39TradeIncome,updateTradeBank,updateV39Trade,getTradeCargo,reserveV39TradeFromStock,tradeSpeed} from '../../lib/v39-trade-state.js';
import {advanceV39TradeLogistics} from '../../lib/v39-trade-logistics.js';
import {inspectV39NeutralVillageEconomy,collectV39TerritoryIncome,FOOD_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {buildV39PopulationMaintenanceStock} from '../../lib/v39-population-economy.js';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {getHexNeighborCoords} from '../../lib/hex-grid.js';
import {renderV39Conversation,recordV39Conversation} from './v39-negotiation-conversation.js';
import {tradeBasketHtml,tradeResourcePicker,tradeResourceChips,tradePickerModalHtml} from './v39-trade-items.js';
import {installTradeLayout} from './v39-trade-layout.js';
import {v39SpecialtyDefinitions,getV39SpecialtyAccess} from '../../lib/v39-specialty-rules.js';
import './v39-trade-items.css';
const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const n=value=>Number(value)||0;
let draft=null,message='',picking=-1,scheduled=false,tab='new';
const drafts=new Map();let draftKey='';
let resourcePicker=-1,resourceFilter='all',resourceSearch='';
const selectedItems=['',''];
const folds=new Map();
const state=()=>window.getV39GameState();
const modal=()=>document.getElementById('v39-trade-modal');
function closeResourcePicker() {
  const index=resourcePicker;resourcePicker=-1;
  modal()?.querySelector('.v39-trade-picker-backdrop')?.remove();
  const dialog=modal()?.querySelector('.v39-trade-dialog');
  if(dialog)dialog.inert=false;
  modal()?.querySelector(`[data-trade-add-side="${index}"]`)?.focus();
}
function renderResourcePicker() {
  const root=modal();
  const previous=root.querySelector('.v39-trade-picker-backdrop'),scroll=previous?.querySelector('.v39-trade-resource-grid')?.scrollTop||0;
  const focused=document.activeElement,filter=focused?.dataset.tradeResourceFilter,searchFocused=focused?.hasAttribute('data-trade-resource-search'),selection=focused?.selectionStart;
  previous?.remove();
  root.querySelector('.v39-trade-dialog').inert=resourcePicker>=0;
  if(resourcePicker<0||!draft)return;
  const overlay=document.createElement('div');overlay.className='v39-trade-picker-backdrop';
  overlay.innerHTML=tradePickerModalHtml(state(),draft.sides[resourcePicker],resourcePicker,{filter:resourceFilter,search:resourceSearch,selected:selectedItems[resourcePicker]});
  overlay.addEventListener('click',event=>{if(event.target===overlay)closeResourcePicker();});
  overlay.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeResourcePicker();}
    if(event.key==='Tab'){
      const nodes=[...overlay.querySelectorAll('button:not(:disabled),input')],first=nodes[0],last=nodes.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  });
  root.append(overlay);overlay.querySelector('.v39-trade-resource-grid').scrollTop=scroll;
  const nextFocus=searchFocused?overlay.querySelector('[data-trade-resource-search]'):filter?overlay.querySelector(`[data-trade-resource-filter="${filter}"]`):overlay.querySelector('[data-trade-picker-close]');
  nextFocus.focus();if(searchFocused&&selection!=null)nextFocus.setSelectionRange(selection,selection);
}
function endpoints(s) {
  const own=s.players.find(row=>row.id===s.activePlayerId);
  return [...s.players.filter(row=>row.id!==s.activePlayerId).map(row=>({value:`player:${row.id}`,label:row.label||row.name||row.id})),
    ...(s.neutralVillages||[]).filter(v=>window.isV39TestMode?.()||own?.factionState.units.some(unit=>tradeAlive(unit)&&v.territoryTileKeys?.includes(`${unit.x},${unit.y}`))).map(row=>({value:`village:${row.id}`,label:row.name||row.id}))];
}
function sideFor(s,value) {
  const split=value.indexOf(':'),kind=value.slice(0,split),partyId=value.slice(split+1);
  const party=kind==='player'?s.players.find(row=>row.id===partyId):s.neutralVillages.find(row=>row.id===partyId);
  const banks=kind==='player'?(party?.factionState.settlements||[]).filter(row=>row.placed):party?[party]:[];
  const units=kind==='player'?party?.factionState.units||[]:party?.defenseUnits||[];
  const actor=units.find(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface'&&!unit.tradeAssignment)||units[0];
  return {kind,partyId,settlementId:banks[0]?.settlementId||banks[0]?.id||'',unitId:actor?.id||'',center:{x:n(banks[0]?.x),y:n(banks[0]?.y)},radius:1,goods:{}};
}
function fresh(s,villageId) {
  const choices=endpoints(s),other=villageId?`village:${villageId}`:choices[0]?.value;
  if(!other)return null;
  const sides=[sideFor(s,`player:${s.activePlayerId}`),sideFor(s,other)];
  const midpoint={x:Math.round((sides[0].center.x+sides[1].center.x)/2),y:Math.round((sides[0].center.y+sides[1].center.y)/2)};
  sides.forEach(side=>{side.center={...midpoint};});
  return {sides,negotiatorId:s.players.find(p=>p.id===s.activePlayerId)?.factionState.selectedUnitId||sides[0].unitId,dueTurn:tradeTurn(s)+8,grace:3,period:0,cycles:1,specialtyTurns:10,method:'exchange',negotiation:'normal'};
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
    if(button.hasAttribute('data-trade-picker-close')){closeResourcePicker();return;}
    if(button.dataset.tradeAddSide!=null){resourcePicker=Number(button.dataset.tradeAddSide);resourceSearch='';renderResourcePicker();return;}
    if(button.dataset.tradeResourceFilter){resourceFilter=button.dataset.tradeResourceFilter;render();return;}
    if(button.dataset.tradeResourceAdd){const name=button.dataset.tradeResourceAdd;selectedItems[sideIndex]=name;if(!Object.hasOwn(draft.sides[sideIndex].goods,name))draft.sides[sideIndex].goods[name]=1;render();return;}
    if(button.dataset.tradeItemSelect){selectedItems[sideIndex]=button.dataset.tradeItemSelect;render();return;}
    if(button.dataset.tradeItemRemove){delete draft.sides[sideIndex].goods[button.dataset.tradeItemRemove];render();return;}
    if(button.dataset.tradeItemStep){const name=button.dataset.tradeResource;draft.sides[sideIndex].goods[name]=Math.max(1,n(draft.sides[sideIndex].goods[name])+Number(button.dataset.tradeItemStep));render();return;}
    if(button.dataset.tradeTab){closeResourcePicker();tab=button.dataset.tradeTab;render();return;}
    if(button.dataset.tradePick){picking=Number(button.dataset.tradePick);root.hidden=true;window.activateV39FooterTab?.('tile');window.showV39TurnBanner?.('待ち合わせのマスを選択してください。Escで取消');return;}
    if(button.dataset.tradeAction)run(button.dataset.tradeAction,button.dataset.tradeId);
  });
  root.addEventListener('toggle',event=>{if(event.target.isConnected&&event.target.dataset.tradeFold){const key=event.target.dataset.tradeFold,changed=folds.get(key)!==event.target.open;folds.set(key,event.target.open);if(key==='delivery'&&changed&&event.target.open)render();}},true);
  root.addEventListener('input',event=>{
    const input=event.target;
    if(input.dataset.sideField==='amount'){
      const amount=Number(input.value),index=Number(input.dataset.tradeSide),name=input.dataset.tradeResource;
      if(!Number.isSafeInteger(amount)||amount<1||!Object.hasOwn(draft.sides[index].goods,name))return;
      draft.sides[index].goods[name]=amount;
      root.querySelectorAll('[data-side-field="amount"]').forEach(control=>{if(Number(control.dataset.tradeSide)===index&&control.dataset.tradeResource===name){if(control.type==='range')control.max=Math.max(Number(control.max),amount);if(control!==input)control.value=amount;}});
      root.querySelectorAll('[data-trade-item-select],[data-trade-resource-add]').forEach(button=>{if(Number(button.dataset.tradeItemSide)===index&&(button.dataset.tradeItemSelect||button.dataset.tradeResourceAdd)===name){button.querySelector('b').textContent=amount;button.setAttribute('aria-label',`${name} ${amount}`);}});
      const preview=proposeV39Trade(state(),state().activePlayerId,draft),button=root.querySelector('[data-trade-action="propose"]');
      if(button)button.disabled=!preview.ok;
      const copy=root.querySelector('.v39-trade-footer-copy');if(copy)copy.textContent=preview.ok?'':preview.reason;
    }
    if(input.hasAttribute('data-trade-resource-search')){resourceSearch=input.value;const grid=root.querySelector('.v39-trade-resource-grid');if(grid)grid.innerHTML=tradeResourcePicker(state(),draft.sides[resourcePicker],resourcePicker,{filter:resourceFilter,search:resourceSearch,selected:selectedItems[resourcePicker]});}
  });
  root.addEventListener('change',event=>{
    const input=event.target;
    if(input.dataset.tradeField){const field=input.dataset.tradeField;
      if(field==='method'&&input.value==='mail'&&Object.keys(draft.sides[1].goods).length&&!window.confirm('郵送では要求物資を指定できません。要求した物資を外して郵送に切り替えますか？')){render();return;}
      draft[field]=['method','negotiation'].includes(field)?input.value:Number(input.value);
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
  const style=document.createElement('style');style.textContent='.v39-trade-backdrop{position:fixed;inset:0;z-index:2600;background:#0009;display:flex;align-items:center;justify-content:center;padding:0}.v39-trade-backdrop[hidden]{display:none}.v39-trade-dialog{width:100%;max-height:100%;display:flex;flex-direction:column;gap:6px;background:#0e1b20;color:#edf4f2;border:0;border-radius:0;padding:0;font-size:var(--font-body)}.v39-trade-dialog header,.v39-trade-dialog nav{display:flex;align-items:center;gap:6px;flex-shrink:0}.v39-trade-dialog header b{flex:1}.v39-trade-body{flex:1;min-height:0;overflow:auto;overflow-anchor:none}.v39-trade-dialog button,.v39-trade-dialog select,.v39-trade-dialog input{font:inherit;min-height:34px;padding:5px 7px;border:1px solid #4b6d75;border-radius:6px;background:#182c33;color:inherit;max-width:100%;min-width:0}.v39-trade-dialog button{cursor:pointer}.v39-trade-dialog button:disabled{opacity:.4;cursor:default}.v39-trade-dialog nav .active{border-color:#e8c56c;color:#e8c56c}.v39-trade-sides{display:grid;grid-template-columns:1fr 1fr;gap:7px}.v39-trade-side,.v39-trade-contract{border:1px solid #39535b;padding:8px;border-radius:7px;margin-bottom:7px;display:grid;gap:6px}.v39-trade-side label{display:grid;grid-template-columns:7em minmax(0,1fr);gap:6px;align-items:center}.v39-trade-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.v39-trade-row input{width:70px}.v39-trade-side small{color:#b6c9c9;font-size:var(--font-secondary);overflow-wrap:anywhere}.v39-trade-dialog output{padding:6px;background:#302917;color:#f4db90;flex-shrink:0;overflow-wrap:anywhere}.v39-trade-warning{color:#f3b581}.v39-trade-contract h4{margin:0}.v39-trade-dialog p{margin:5px 0}.v39-trade-entry{font:inherit;padding:6px;min-height:34px;border:1px solid #c8ab60;border-radius:6px;background:#3a3017;color:#f5deb0;margin-bottom:5px}@media(max-width:620px){.v39-trade-sides{grid-template-columns:1fr}.v39-trade-side label{grid-template-columns:6em minmax(0,1fr)}}';document.head.append(style);
}
function open(villageId='',show='new') {
  window.closeV39VillageMenu?.();
  ensure();const s=state();if(s.timeline.phase!=='player'){window.showV39TurnBanner?.('操作ターンに取引を開いてください');return;}
  draftKey=`${s.activePlayerId}:${villageId||'default'}`;
  const cached=drafts.get(draftKey),matches=row=>row?.sides[0].partyId===s.activePlayerId&&(!villageId||row.sides[1].kind==='village'&&row.sides[1].partyId===villageId);
  draft=(matches(cached)?cached:null)||(villageId?[...drafts.values()].find(matches):null)||fresh(s,villageId);if(draft)drafts.set(draftKey,draft);
  closeResourcePicker();tab=show;message='';modal().hidden=false;render();
}
const option=(value,label,selected)=>`<option value="${html(value)}"${value===selected?' selected':''}>${html(label)}</option>`;
function sideHtml(s,side,index) {
  const party=side.kind==='player'?s.players.find(row=>row.id===side.partyId):s.neutralVillages.find(row=>row.id===side.partyId);
  const banks=side.kind==='player'?party?.factionState.settlements||[]:party?[party]:[];
  const units=side.kind==='player'?party?.factionState.units||[]:party?.defenseUnits||[];
  const attr=field=>`data-trade-side="${index}" data-side-field="${field}"`;
  const bank=tradeBank(s,side);
  const map=window.__v39FieldRuntime?.mapData,turns=Math.max(1,draft.dueTurn-tradeTurn(s));
  const metrics=folds.get('delivery')&&bank&&map?.grid?(side.kind==='village'?inspectV39NeutralVillageEconomy(bank,map):collectV39TerritoryIncome(s,{...party,factionState:{...party.factionState,selectedSettlementId:side.settlementId}},map)):null;
  const maintenance=side.kind==='village'?metrics?.maintenance:buildV39PopulationMaintenanceStock(bank?.populationByRace,units.filter(unit=>tradeAlive(unit)&&(unit.settlementId||party?.factionState.selectedSettlementId)===side.settlementId),FOOD_RESOURCE_KEYS);
  const forecast=metrics?Object.entries(side.goods).map(([resource,amount])=>{const current=tradeBankAmount(bank,resource),needed=Math.ceil(amount/3),income=n(metrics?.income?.food?.[resource]??metrics?.income?.material?.[resource]??metrics?.food?.[resource]??metrics?.material?.[resource]),target=Math.ceil(Math.max(0,amount-needed)/turns),upkeep=n(maintenance?.[resource]);
    return `<small>${tradeResourceChips({[resource]:amount})} / 収入${Math.round(income*10)/10}/T・維持${Math.round(upkeep*10)/10}/T・確保${target}/T${income<target?'<span class="v39-trade-warning"> / 期日までに収入不足の見込み</span>':''}${current-needed+turns*(income-target-upkeep)<0?'<span class="v39-trade-warning"> / 維持費不足の見込み</span>':''}</small>`;}).join(''):'';
  return `<section class="v39-trade-side"><b>${index?'要求物資を運ぶ相手側':'提供物資を運ぶ自分側'} / ${html(party?.label||party?.name||side.partyId)}</b>
    <label>出発拠点<select ${attr('settlementId')}>${banks.filter(row=>row.placed||side.kind==='village').map(row=>option(row.settlementId||row.id,row.name||row.id,side.settlementId)).join('')}</select></label>
    <label>担当者・部隊<select ${attr('unitId')}>${units.filter(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface').map(unit=>option(unit.id,`${unit.name} ${unit.tradeAssignment?'[取引中]':''}`,side.unitId)).join('')}</select></label>
    <div class="v39-trade-row">X<input type="number" min="0" value="${side.center.x}" ${attr('x')}>Y<input type="number" min="0" value="${side.center.y}" ${attr('y')}><button data-trade-pick="${index}">マップで指定</button></div>
    <label>許容範囲<input type="number" min="0" max="${config.maxRadius}" value="${side.radius}" ${attr('radius')}></label>${forecast}</section>`;
}
function render() {
  ensure();if(modal().hidden)return;const s=state(),body=modal().querySelector('.v39-trade-body'),scroll=body.scrollTop;
  body.querySelectorAll('[data-trade-fold]').forEach(details=>folds.set(details.dataset.tradeFold,details.open));
  modal().querySelectorAll('[data-trade-tab]').forEach(button=>button.classList.toggle('active',button.dataset.tradeTab===tab));
  const footer=modal().querySelector('.v39-trade-footer');footer.hidden=tab!=='new'||!draft;
  if(tab==='new'&&draft){const preview=proposeV39Trade(s,s.activePlayerId,draft);
    footer.innerHTML=`<div class="v39-trade-footer-copy">${preview.ok?'':html(preview.reason)}</div><button data-trade-action="propose"${preview.ok?'':' disabled'}>提案</button>`;
    body.innerHTML=`<div class="v39-trade-partner"><label>取引相手 <select data-trade-side="1" data-side-field="party">${endpoints(s).map(row=>option(row.value,row.label,`${draft.sides[1].kind}:${draft.sides[1].partyId}`)).join('')}</select></label><label>方法 <select data-trade-field="method">${option('exchange','交換・要求',draft.method)}${option('mail','郵送（一方向）',draft.method)}</select></label></div>
    <div class="v39-trade-baskets">${draft.sides.map((side,index)=>tradeBasketHtml(s,side,index,{mail:draft.method==='mail',selected:selectedItems[index]})).join('')}</div>
    <details class="v39-trade-options" data-trade-fold="delivery"${folds.get('delivery')?' open':''}><summary>配送・日程 / T${draft.dueTurn} / ${draft.period?`${draft.period}Tごと・${draft.cycles}回`:'単発'}</summary><div class="v39-trade-options-content"><div class="v39-trade-row">
    <label>交渉 <select data-trade-field="negotiation">${option('normal','通常交渉',draft.negotiation)}${option('intimidation','威圧交渉',draft.negotiation)}</select></label>
    <label>取引日 T<input type="number" min="${tradeTurn(s)+1}" value="${draft.dueTurn}" data-trade-field="dueTurn"></label>
    <label>猶予<input type="number" min="3" max="30" value="${draft.grace}" data-trade-field="grace"></label>
    <label>周期<input type="number" min="0" value="${draft.period}" data-trade-field="period"></label>
    <label>回数<input type="number" min="1" max="100" value="${draft.cycles}" data-trade-field="cycles"></label></div><div class="v39-trade-sides">${draft.sides.map((side,i)=>sideHtml(s,side,i)).join('')}</div></div></details>
    ${draft.sides.some(side=>Object.keys(side.goods).some(name=>V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty))?`<label>特産品の貸出 ⌛<input type="number" min="1" max="100" value="${draft.specialtyTurns||10}" data-trade-field="specialtyTurns" aria-label="特産品の貸出ターン数"></label>`:''}
    <details class="v39-trade-options" data-trade-fold="rules"${folds.get('rules')?' open':''}><summary>予約在庫・維持費について</summary><p>成立時に双方の次回分1/3を手持ちから確保します。残りは実収入から予約し、維持費には使えません。周期0は単発。双方の到着後、指定日から猶予内に同時交換し、担当者は帰還します。</p></details>`;
  }
  else {
    const visible=listV39Trades(s).filter(row=>row.sides.some(side=>side.kind==='player'&&side.partyId===s.activePlayerId));
    const labels={proposed:'承諾待ち',active:'自動取引中',interrupted:'中断・再協議',cancelling:'中止・帰還中',complete:'完了',cancelled:'中止完了',rejected:'拒否/取下げ'};
    const stages={collecting:'収入確保・拠点へ集合',outbound:'取引場所へ移動',waiting:'到着待ち',returning:'帰還・荷下ろし',returned:'帰還済み'};
    const partyName=side=>side.kind==='player'?s.players.find(row=>row.id===side.partyId)?.label:s.neutralVillages.find(row=>row.id===side.partyId)?.name;
    body.innerHTML=visible.map(row=>`<article class="v39-trade-contract" data-trade-contract="${html(row.id)}"><h4>取引 #${row.sequence} / ${labels[row.status]}</h4><span>取引日 T${row.dueTurn}〜T${row.dueTurn+row.grace} / ${row.completedCycles}/${row.cycles}回${row.reason?` / ${html(row.reason)}`:''}</span>
      ${row.sides.map(side=>`<div class="v39-trade-side-progress"><b>${html(partyName(side)||side.partyId)} / ${side.kind==='player'&&side.partyId===s.activePlayerId?'渡す物資':'受け取る物資'}</b><div class="v39-trade-summary-items">${tradeResourceChips(side.goods)}</div><small>${html(stages[side.stage]||'未成立')}${side.reason?` / ${html(side.reason)}`:''}</small><details><summary>予約・運搬の詳細</summary>${Object.entries(side.goods).map(([name,total])=>{const reserved=n(side.reserved?.[name]),carried=n(getTradeCargo(s,side).resourcesByType[name]),missing=Math.max(0,total-reserved-carried);return `<p>${tradeResourceChips({[name]:total})} / 予約${reserved} / 搬送${carried}${['collecting','outbound','waiting'].includes(side.stage)?` / 未確保${missing} / 毎T目標${Math.ceil(missing/Math.max(1,row.dueTurn-tradeTurn(s)))}`:''}</p>`;}).join('')}</details></div>`).join('')}
      <div class="v39-trade-row">${row.status==='proposed'&&(row.sides[1].kind==='village'?row.ownerId===s.activePlayerId:row.sides[1].partyId===s.activePlayerId)?`<button data-trade-action="accept" data-trade-id="${html(row.id)}">${row.sides[1].kind==='village'?'村へ条件を提示・判定':'承諾'}</button>`:''}
      ${row.status==='active'?`<button data-trade-action="pause" data-trade-id="${html(row.id)}">中断</button><button data-trade-action="reserve-stock" data-trade-id="${html(row.id)}">手持ちから追加確保</button>${row.sides.some(side=>side.kind==='village')&&row.ownerId===s.activePlayerId?`<button data-trade-action="reserve-village" data-trade-id="${html(row.id)}">村へ備蓄の確保を交渉</button>`:''}`:''}
      ${row.status==='interrupted'?`<label>再開日 T<input id="trade-date-${html(row.id)}" type="number" value="${Math.max(row.dueTurn,tradeTurn(s)+3)}"></label><button data-trade-action="resume" data-trade-id="${html(row.id)}">この日程で再開を確認</button>`:''}
      ${['proposed','active','interrupted'].includes(row.status)?`<button data-trade-action="cancel" data-trade-id="${html(row.id)}">${row.status==='proposed'?'拒否・取下げ':'中止・引き返す'}</button>`:''}
      <button data-trade-action="revise" data-trade-id="${html(row.id)}">条件を変えて再提案</button></div></article>`).join('')||'<p>取引はありません。相手がいれば「提案」タブから作成できます。</p>';
  }
  body.scrollTop=scroll;modal().querySelector('output').textContent=message;modal().querySelector('output').hidden=!message;
  if(draft){const own=s.players.find(p=>p.id===s.activePlayerId),other=draft.sides[1],units=own.factionState.units.filter(unit=>tradeAlive(unit)&&(unit.worldId||'surface')==='surface');
    const actor=units.find(unit=>unit.id===draft.negotiatorId)||units.find(unit=>unit.id===own.factionState.selectedUnitId)||units[0];
    const peers=other.kind==='village'?s.neutralVillages.find(v=>v.id===other.partyId)?.defenseUnits:s.players.find(p=>p.id===other.partyId)?.factionState.units;
    const village=other.kind==='village'?s.neutralVillages.find(v=>v.id===other.partyId):null;
    const conversation=document.createElement('details');conversation.className='v39-trade-conversation-fold';conversation.dataset.tradeFold='conversation';conversation.open=folds.get('conversation')===true;
    const summary=document.createElement('summary');summary.textContent=`会話・スキル / ${actor?.name||'交渉役なし'} / AP ${n(actor?.ap??actor?.currentAp)}`;conversation.append(summary);
    const conversationBody=document.createElement('div');conversation.append(conversationBody);body.prepend(conversation);
    renderV39Conversation(conversationBody,{target:other.partyId,actor,units,peer:peers?.find(tradeAlive)||{race:village?.race||'只人',className:'ファイター',name:village?`${village.name}の代表`:'相手の代表'},onActorChange:id=>{
      draft.negotiatorId=id;let next=s;
      for(const contract of listV39Trades(s))if(contract.ownerId===s.activePlayerId&&['proposed','active','interrupted'].includes(contract.status)&&contract.sides.some(side=>side.kind==='village'&&side.partyId===other.partyId))next=updateV39Trade(next,{...contract,negotiatorId:id});
      if(next!==s)window.setV39GameState(next,{reason:'trade-negotiator-selected'});render();}});
    body.scrollTop=scroll;
  }
  renderResourcePicker();
}
function commit(result) {
  message=result.ok?result.message:result.reason;if(draft)recordV39Conversation(draft.sides[1].partyId,'提示した条件をご確認ください。',message);
  if(result.ok){window.setV39GameState(result.state,{reason:'trade-operation'});window.appendV39ActivityLog?.(state().activePlayerId,'取引',message);}render();return result;
}
function run(action,id) {
  if(action==='close'){closeResourcePicker();modal().hidden=true;return;}
  if(window.isV39MapInputLocked?.()||state().timeline.phase!=='player'){message='処理完了後、操作ターンに実行してください';render();return;}
  const s=state(),playerId=s.activePlayerId;
  if(action==='propose'){const map=window.__v39FieldRuntime?.mapData;
    if(draft?.sides.some(side=>map&&(side.center.x>=map.w||side.center.y>=map.h))){message='マップ内の待ち合わせマスを指定してください';render();return;}
    const result=proposeV39Trade(s,playerId,draft);if(result.ok)tab='contracts';commit(result);}
  else if(action==='accept'){const contract=listV39Trades(s).find(row=>row.id===id);if(!window.confirm(contract?.sides[1].kind==='village'?'この条件で交渉しますか？ 成否に関わらず交渉役のAP20を消費します。':'この取引を承諾しますか？ 次回分の1/3を確保します。'))return;commit(acceptV39Trade(s,playerId,id));}
  else if(action==='pause'||action==='cancel')commit(stopV39Trade(s,playerId,id,action==='cancel'));
  else if(action==='reserve-stock'||action==='reserve-village'){if(action==='reserve-village'&&!window.confirm('村の備蓄を追加確保する交渉を行いますか？ AP20を消費します。'))return;commit(reserveV39TradeFromStock(s,playerId,id,action==='reserve-village'));}
  else if(action==='resume'){const row=listV39Trades(s).find(row=>row.id===id);if(row.sides.some(side=>side.kind==='village')&&!window.confirm('この日程で再開を交渉しますか？ AP20を消費します。'))return;commit(resumeV39Trade(s,playerId,id,Number(document.getElementById(`trade-date-${id}`).value),row.grace));}
  else if(action==='revise'){const row=listV39Trades(s).find(row=>row.id===id);draft=structuredClone(row);if(draft.sides[0].partyId!==playerId)draft.sides.reverse();draft.dueTurn=tradeTurn(s)+8;drafts.set(draftKey,draft);tab='new';message='旧取引は勝手に変更されません。旧取引を中止・荷下ろししてから再提案してください。';render();}
}
function entries() {
  const s=state();if(!s?.players?.length)return;
  for(const [host,village] of [[document.getElementById('footSettlement'),null],[document.getElementById('v39-world-contact-buttons'),document.getElementById('v39-world-contact-actions')?.dataset.targetId]]) {
    if(!host||host.querySelector('[data-open-v39-trade]'))continue;
    const button=document.createElement('button');button.type='button';button.className='v39-trade-entry';button.dataset.openV39Trade='true';button.textContent='取引・郵送';button.onclick=()=>open(s.neutralVillages?.some(row=>row.id===village)?village:'');host.prepend(button);
  }
}
function queue() {if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;entries();if(!modal()?.hidden&&!modal()?.contains(document.activeElement))render();});}
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
window.getV39TradeRules=()=>({listV39Trades,proposeV39Trade,acceptV39Trade,stopV39Trade,resumeV39Trade,divertV39TradeIncome,advanceV39TradeLogistics,reserveV39TradeFromStock,tradeCapacity,tradeSpeed,getV39SpecialtyAccess});
window.addEventListener('v39:game-state-changed',queue);window.addEventListener('v39:footer-tab-changed',queue);window.addEventListener('v39:tile-selected',event=>{
  if(picking>=0&&draft){draft.sides[picking].center={x:event.detail.x,y:event.detail.y};picking=-1;modal().hidden=false;render();}else queue();
});
window.addEventListener('v39:village-menu-opened',queue);
window.addEventListener('v39:conversation-updated',queue);
window.addEventListener('v39:field-generated',()=>{closeResourcePicker();drafts.clear();draft=null;message='';if(modal())modal().hidden=true;});
window.addEventListener('keydown',event=>{if(event.key==='Escape'){if(resourcePicker>=0){closeResourcePicker();return;}if(picking>=0){picking=-1;modal().hidden=false;render();}else if(modal())modal().hidden=true;}});
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
