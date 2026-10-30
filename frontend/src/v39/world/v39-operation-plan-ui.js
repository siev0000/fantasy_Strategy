import {isV39TerritoryPhase,usesV39OperationPhases} from '../../lib/v39-operation-phases.js';
import {editV39OperationPlan} from '../../lib/v39-operation-plans.js';
import {getFactionSettlements} from '../../lib/settlement-state.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const V39_TERRITORY_GUIDE_STEPS=['expansion','construction','units'];
export function renderV39TerritoryGuide(state,step='expansion'){
  if(!isV39TerritoryPhase(state))return '';
  const index=Math.max(0,V39_TERRITORY_GUIDE_STEPS.indexOf(step));
  const titles=['領土拡張','建設','ユニット追加'];
  const hints=['地図の候補を押すと、その順に追加されます。','施設と建設先を選んで、建設順に追加します。','訓練を予約します。追加しない場合も確認へ進めます。'];
  return `<section class="v39-territory-guide" aria-label="拠点フェーズの操作手順"><strong>${index+1}/3 ${titles[index]}</strong><small>${hints[index]}</small><div>${index?`<button type="button" data-territory-guide="${V39_TERRITORY_GUIDE_STEPS[index-1]}">前へ：${titles[index-1]}</button>`:''}<button type="button" class="primary" data-territory-guide="${V39_TERRITORY_GUIDE_STEPS[index+1]||'review'}">${index===2?'予約の確認へ':`次へ：${titles[index+1]}`}</button></div></section>`;
}
export function renderV39OperationPlans(state,player,base,{scope='all',showFinish=true}={}){
  if(!usesV39OperationPhases(state))return '';
  const editable=isV39TerritoryPhase(state)&&state.timeline.phase==='player';
  const matches=plan=>scope==='all'||(scope==='expansion'?plan.kind==='expansion':plan.kind!=='expansion');
  const plans=(base.operationPlans||[]).filter(matches);
  return `${showFinish?(editable?'<button type="button" class="settlement-chip" data-plans-confirm>拠点フェーズを終了</button>':'<b>次の領土運営まで自動進行</b>'):''}<p>${editable?'上から順に判定。着手できない計画は保留し、後続を先に開始します。':'戦闘・探索中：毎ターンの収入後に自動着手します。編集は次の領土運営で行います。'}</p>${plans.map((plan,index)=>`<article class="v39-operation-plan" data-plan-scope="${esc(scope)}" data-plan-id="${esc(plan.id)}" data-plan-base="${esc(base.settlementId)}"><b>${index+1}. ${esc(plan.kind==='expansion'?'領土拡張':plan.facilityName)} (${plan.tile.x},${plan.tile.y})</b><label>開始予定 T<input type="number" min="1" step="1" data-plan-turn value="${plan.notBeforeTurn}"${editable?'':' disabled'}></label><small>${esc(plan.reason||'着手待ち')}</small>${editable?'<div><button type="button" data-plan-action="up" aria-label="計画を前へ">↑</button><button type="button" data-plan-action="down" aria-label="計画を後ろへ">↓</button><button type="button" data-plan-action="cancel">取消</button></div>':''}</article>`).join('')||'<p>予約なし。土地を選び、領土拡張・建築から追加してください。</p>'}<details><summary>着手履歴</summary>${(base.operationPlanHistory||[]).filter(matches).slice(-10).reverse().map(plan=>`<p>T${plan.startedTurn}: ${esc(plan.facilityName||'領土拡張')} (${plan.tile.x},${plan.tile.y})</p>`).join('')||'記録なし'}</details>`;
}
function edit(target,action,value){
  const row=target.closest('[data-plan-id]');if(!row||window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState({includeWorlds:false});
  const result=editV39OperationPlan(state,state.activePlayerId,row.dataset.planBase,row.dataset.planId,action,value,row.dataset.planScope||'all');
  if(result.ok)window.setV39GameState({players:result.state.players},{reason:'operation-plan-edited'});
  else window.showV39TurnBanner?.(result.reason);
}
document.addEventListener('click',event=>{
  const guide=event.target.closest?.('[data-territory-guide]');
  if(guide){if(guide.dataset.territoryGuide==='review')void window.reviewV39TerritoryPlans?.();else window.setV39TerritoryGuideStep?.(guide.dataset.territoryGuide);return;}
  if(event.target.closest?.('[data-plans-confirm]')){void window.advanceV39Turn?.();return;}
  const button=event.target.closest?.('[data-plan-action]');if(button)edit(button,button.dataset.planAction);
});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-plan-turn]'))edit(event.target,'turn',event.target.value);});

export function renderV39TerritoryPhaseReview(state){
  const player=state.players?.find(row=>row.id===state.activePlayerId);
  const bases=getFactionSettlements(player?.factionState);
  const rows=bases.map(base=>{
    const plans=base.operationPlans||[],expansion=plans.filter(plan=>plan.kind==='expansion').length;
    const training=(player?.factionState?.unitTrainingQueue||[]).filter(task=>task.settlementId===base.settlementId).length;
    return `<li><b>${esc(base.name||'拠点')}</b><span>領土拡張 ${expansion}件 / 建設 ${plans.length-expansion}件</span><span>訓練中・予約 ${training}件</span></li>`;
  }).join('');
  const total=bases.reduce((sum,base)=>sum+(base.operationPlans||[]).length,0)+(player?.factionState?.unitTrainingQueue||[]).length;
  return `<p>この勢力の拠点操作を終了しますか？</p><ul>${rows||'<li>拠点なし</li>'}</ul>${total?'':'<p class="v39-phase-review-warning">予約がありません。このまま終了することもできます。</p>'}<p>領土拡張・建設の予約は収入後に順次着手します。条件不足は保留されます。ユニット訓練は訓練待ち行列で進みます。終了後は次の拠点フェーズまで領土拡張・建設の予約を追加・並べ替えできません。</p>`;
}
export async function confirmV39TerritoryPhaseEnd(state){
  if(!isV39TerritoryPhase(state))return false;
  const dialog=document.createElement('dialog');
  if(typeof dialog.showModal!=='function')return window.confirm?.('拠点フェーズを終了しますか？ 予約は自動進行し、次の拠点フェーズまで編集できません。')===true;
  dialog.className='v39-territory-phase-review';
  dialog.setAttribute('aria-labelledby','v39-phase-review-title');
  dialog.innerHTML=`<form method="dialog"><h2 id="v39-phase-review-title">最終確認：拠点フェーズ終了</h2><div>${renderV39TerritoryPhaseReview(state)}</div><footer><button value="cancel">戻って見直す</button><button value="confirm" class="primary">確認して終了</button></footer></form>`;
  document.body.appendChild(dialog);
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='confirm';dialog.remove();resolve(accepted);},{once:true});
    dialog.showModal();dialog.querySelector('[value="cancel"]')?.focus();
  });
}
window.confirmV39TerritoryPhaseEnd=confirmV39TerritoryPhaseEnd;
