import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';
import {V39_TRADE_RESOURCES,V39_TRADE_CONFIG,tradeBank,tradeBankAmount,tradeMembers,tradeCapacity} from '../../lib/v39-trade-state.js';
import {getV39TradeResourceAvailability,getV39KnownTradeResources} from '../../lib/v39-trade-resource-availability.js';

import './v39-trade-dialog.css';

const html=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function tradeResourceIcon(name) {
  const icon=resolveV39ResourceIcon(name);
  return `<span class="v39-trade-resource-icon" style="${icon.color?`color:${html(icon.color)}`:''}" aria-hidden="true">${html(icon.glyph)}</span>`;
}
export function tradeResourceChips(goods) {
  return Object.entries(goods||{}).map(([name,amount])=>`<span class="v39-trade-resource-chip" title="${html(name)} ${amount}" aria-label="${html(name)} ${amount}">${tradeResourceIcon(name)}<b>${amount}</b></span>`).join('')||'<span class="v39-trade-empty-chip">—</span>';
}
const category=name=>V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty?'specialties':['穀物','野菜','肉','魚'].includes(name)?'food':['木材','石材','鉄'].includes(name)?'basic':'special';
const selectedResource=(side,selected)=>Object.hasOwn(side.goods,selected)?selected:Object.keys(side.goods)[0];
export function tradeAmountEditor(state,side,index,selected,{steps=false}={}) {
  const name=selectedResource(side,selected);
  if(!name)return '<div class="v39-trade-amount-editor" aria-hidden="true"></div>';
  const amount=side.goods[name],max=index===1?Math.max(amount,V39_TRADE_CONFIG.requestSliderMaximum||1000):Math.max(amount,1,V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty?tradeBankAmount(tradeBank(state,side),name):Math.floor(tradeCapacity(tradeMembers(state,side))));
  const attr=`data-trade-side="${index}" data-side-field="amount" data-trade-resource="${html(name)}"`;
  if(steps)return `<div class="v39-trade-amount-editor v39-trade-stepped-editor"><button type="button" data-trade-item-step="-1" data-trade-resource="${html(name)}" data-trade-item-side="${index}" aria-label="${html(name)}を減らす">−</button><input type="range" min="1" max="${max}" step="1" value="${amount}" ${attr} aria-label="${html(name)}の数量メーター"><button type="button" data-trade-item-step="1" data-trade-resource="${html(name)}" data-trade-item-side="${index}" aria-label="${html(name)}を増やす">＋</button><button type="button" data-trade-item-remove="${html(name)}" data-trade-item-side="${index}" aria-label="${html(name)}を削除">×</button></div>`;
  return `<div class="v39-trade-amount-editor"><span title="${html(name)}" aria-label="${html(name)}">${tradeResourceIcon(name)}</span><input type="range" min="1" max="${max}" step="1" value="${amount}" ${attr} aria-label="${html(name)}の数量メーター"><input type="number" min="1" step="1" value="${amount}" ${attr} aria-label="${html(name)}の数量"><button type="button" data-trade-item-remove="${html(name)}" data-trade-item-side="${index}" aria-label="${html(name)}を削除">×</button></div>`;
}
export function tradePickerModalHtml(state,side,index,{filter='all',search='',selected='',items=null,title=null,titleId='v39-trade-picker-title',categories=[['all','すべて'],['food','食料'],['basic','資材'],['special','特殊資源'],['specialties','特産品']]}={}) {
  return `<section class="v39-trade-dialog v39-trade-resource-picker" role="dialog" aria-modal="true" aria-labelledby="${html(titleId)}"><header><b id="${html(titleId)}">${html(title||`${index?'受け取る':'渡す'}物資`)}</b><button type="button" data-trade-picker-close aria-label="物資選択を閉じる">×</button></header><div class="v39-trade-picker-tabs">${categories.map(([value,label])=>`<button type="button" data-trade-resource-filter="${value}" class="${filter===value?'active':''}">${label}</button>`).join('')}</div><input type="search" data-trade-resource-search value="${html(search)}" placeholder="検索" aria-label="物資を検索"><div class="v39-trade-resource-grid">${tradeResourcePicker(state,side,index,{filter,search,selected,items})}</div><div class="v39-trade-picker-caption"><span data-trade-picker-name aria-live="polite">${html(selectedResource(side,selected)||'物資を選択')}</span><span>${index===1?'要求数量':'選択数／保有数'}</span></div><div class="v39-trade-picker-editor">${tradeAmountEditor(state,side,index,selected,{steps:true})}</div><footer><button type="button" data-trade-picker-close>決定</button></footer></section>`;
}
function tradePickerItem(name,amount,active,index,{iconName=name,label=name,count=amount||0}={}) {
  const picked=amount!==undefined;
  return `<button type="button" class="v39-trade-icon-button${active?' active':''}${picked?' picked':''}" data-trade-resource-add="${html(name)}" data-trade-item-side="${index}" title="${html(label)}" aria-label="${html(label)}" aria-pressed="${picked}">${tradeResourceIcon(iconName)}<b>${html(count)}</b></button>`;
}
export function tradeResourcePicker(state,side,index,{filter='all',search='',selected='',items=null}={}) {
  if(items)return items.filter(row=>(filter==='all'||(row.category||category(row.name))===filter)&&row.name.includes(search.trim())).map(row=>tradePickerItem(row.name,side.goods[row.name],selected===row.name,index,{iconName:row.iconName})).join('')||'<p>該当する物資はありません。</p>';
  const requesting=index===1,bank=requesting?null:tradeBank(state,side),active=selectedResource(side,selected),known=requesting?getV39KnownTradeResources(state):null,availability=requesting?null:getV39TradeResourceAvailability(state,side,window.__v39FieldRuntime?.mapData);
  return V39_TRADE_RESOURCES.filter(row=>(requesting?known.has(row.name):availability[row.name]?.canSelect)&&(filter==='all'||category(row.name)===filter)&&row.name.includes(search.trim())).map(row=>{
    const picked=Object.hasOwn(side.goods,row.name),count=picked?side.goods[row.name]:0,stock=requesting?null:Math.floor(tradeBankAmount(bank,row.name));
    const label=requesting?`${row.name} / 要求 ${count}`:`${row.name} / 選択 ${count} / 保有 ${stock}${availability[row.name].income>0?` / 収入 +${Math.round(availability[row.name].income*100)/100}/T`:''}`;
    return tradePickerItem(row.name,picked?count:undefined,active===row.name,index,{label,count:requesting?count:`${count}/${stock}`});
  }).join('')||'<p>該当する物資はありません。</p>';
}
export function tradeBasketHtml(state,side,index,{mail=false,selected='',rows:showRows=false,warnings={},title=null,iconName=name=>name,readOnly=false}={}) {
  const active=selectedResource(side,selected);
  if(readOnly)return `<section class="v39-trade-basket v39-trade-basket-rows"><header><h3>${html(title||'達成条件')}</h3></header><ul>${Object.entries(side.goods).map(([name,amount])=>`<li><span class="v39-trade-icon-button" title="${html(name)} ${html(amount)}" aria-label="${html(name)} ${html(amount)}">${tradeResourceIcon(iconName(name))}<b>${html(amount)}</b></span></li>`).join('')}</ul></section>`;
  const heading=`<header><h3>${html(title||(index?'相手への要求':'自国の提供'))}</h3><button type="button" class="v39-trade-add-inline" data-trade-add-side="${index}"${index&&mail?' disabled':''} aria-label="物資を追加" title="物資を追加">＋</button></header>`;
  if(showRows){
    const editing=Object.hasOwn(side.goods,selected)?selected:'';
    return `<section class="v39-trade-basket v39-trade-basket-rows" data-trade-basket="${index}">${heading}<ul aria-label="${index?'要求':'提供'}する物資">${Object.entries(side.goods).map(([name,amount])=>`<li data-trade-item="${html(name)}"><button type="button" class="v39-trade-icon-button${editing===name?' active':''}" data-trade-item-select="${html(name)}" data-trade-item-side="${index}" title="${html(name)}" aria-label="${html(name)} ${amount}" aria-pressed="${editing===name}">${tradeResourceIcon(iconName(name))}</button><input class="v39-trade-icon-amount" type="number" min="1" step="1" value="${amount}" data-trade-side="${index}" data-side-field="amount" data-trade-resource="${html(name)}" aria-label="${html(name)}の数量"><button type="button" class="v39-trade-item-warning" data-trade-warning="${html(name)}" data-trade-item-side="${index}" title="${html(warnings[name]||'')}" aria-label="${html(warnings[name]||'')}"${warnings[name]?'':' hidden'}>!</button></li>`).join('')}</ul><div class="v39-trade-selected-editor">${editing?tradeAmountEditor(state,side,index,editing,{steps:true}):''}</div></section>`;
  }
  const rows=Object.entries(side.goods).map(([name,amount])=>`<li data-trade-item="${html(name)}"><button type="button" class="v39-trade-icon-button${active===name?' active':''}" data-trade-item-select="${html(name)}" data-trade-item-side="${index}" title="${html(name)}" aria-label="${html(name)} ${amount}" aria-pressed="${active===name}">${tradeResourceIcon(iconName(name))}<b>${amount}</b></button></li>`).join('');
  return `<section class="v39-trade-basket" data-trade-basket="${index}">${heading}<ul>${rows}</ul>${tradeAmountEditor(state,side,index,selected)}</section>`;
}
