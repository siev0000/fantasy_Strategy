import {resolveV39ResourceIcon} from '../../lib/resource-icon-glyphs.js';
import {V39_TRADE_RESOURCES,tradeBank,tradeBankAmount,tradeMembers,tradeCapacity} from '../../lib/v39-trade-state.js';

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
export function tradeAmountEditor(state,side,index,selected) {
  const name=selectedResource(side,selected);
  if(!name)return '<div class="v39-trade-amount-editor" aria-hidden="true"></div>';
  const amount=side.goods[name],capacity=tradeCapacity(tradeMembers(state,side)),max=Math.max(amount,1,V39_TRADE_RESOURCES.find(row=>row.name===name)?.specialty?tradeBankAmount(tradeBank(state,side),name):Math.floor(capacity));
  const attr=`data-trade-side="${index}" data-side-field="amount" data-trade-resource="${html(name)}"`;
  return `<div class="v39-trade-amount-editor"><span title="${html(name)}" aria-label="${html(name)}">${tradeResourceIcon(name)}</span><input type="range" min="1" max="${max}" step="1" value="${amount}" ${attr} aria-label="${html(name)}の数量メーター"><input type="number" min="1" step="1" value="${amount}" ${attr} aria-label="${html(name)}の数量"><button type="button" data-trade-item-remove="${html(name)}" data-trade-item-side="${index}" aria-label="${html(name)}を削除">×</button></div>`;
}
export function tradePickerModalHtml(state,side,index,{filter='all',search='',selected=''}={}) {
  return `<section class="v39-trade-dialog v39-trade-resource-picker" role="dialog" aria-modal="true" aria-labelledby="v39-trade-picker-title"><header><b id="v39-trade-picker-title">${index?'受け取る':'渡す'}物資</b><button type="button" data-trade-picker-close aria-label="物資選択を閉じる">×</button></header><div class="v39-trade-picker-tabs">${[['all','すべて'],['food','食料'],['basic','資材'],['special','特殊資源'],['specialties','特産品']].map(([value,label])=>`<button type="button" data-trade-resource-filter="${value}" class="${filter===value?'active':''}">${label}</button>`).join('')}</div><input type="search" data-trade-resource-search value="${html(search)}" placeholder="検索" aria-label="物資を検索"><div class="v39-trade-resource-grid">${tradeResourcePicker(state,side,index,{filter,search,selected})}</div><div class="v39-trade-picker-editor">${tradeAmountEditor(state,side,index,selected)}</div><footer><button type="button" data-trade-picker-close>決定</button></footer></section>`;
}
export function tradeResourcePicker(state,side,index,{filter='all',search='',selected=''}={}) {
  const bank=tradeBank(state,side),active=selectedResource(side,selected);
  return V39_TRADE_RESOURCES.filter(row=>(filter==='all'||category(row.name)===filter)&&row.name.includes(search.trim())).map(row=>{
    const picked=Object.hasOwn(side.goods,row.name),count=picked?side.goods[row.name]:Math.floor(tradeBankAmount(bank,row.name));
    return `<button type="button" class="v39-trade-icon-button${active===row.name?' active':''}${picked?' picked':''}" data-trade-resource-add="${html(row.name)}" data-trade-item-side="${index}" title="${html(row.name)} / 在庫 ${tradeBankAmount(bank,row.name)}" aria-label="${html(row.name)}${picked?` 選択 ${count}`:` 在庫 ${count}`}" aria-pressed="${picked}">${tradeResourceIcon(row.name)}<b>${count}</b></button>`;
  }).join('')||'<p>該当する物資はありません。</p>';
}
export function tradeBasketHtml(state,side,index,{mail=false,selected=''}={}) {
  const active=selectedResource(side,selected);
  const rows=Object.entries(side.goods).map(([name,amount])=>`<li data-trade-item="${html(name)}"><button type="button" class="v39-trade-icon-button${active===name?' active':''}" data-trade-item-select="${html(name)}" data-trade-item-side="${index}" title="${html(name)}" aria-label="${html(name)} ${amount}" aria-pressed="${active===name}">${tradeResourceIcon(name)}<b>${amount}</b></button></li>`).join('');
  return `<section class="v39-trade-basket" data-trade-basket="${index}"><header><h3>${index?'受け取る':'渡す'}</h3></header><ul>${rows}<li><button type="button" class="v39-trade-add-resource" data-trade-add-side="${index}"${index&&mail?' disabled':''} aria-label="物資を追加">＋</button></li></ul>${tradeAmountEditor(state,side,index,selected)}</section>`;
}