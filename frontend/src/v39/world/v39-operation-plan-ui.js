import {isV39TerritoryPhase,usesV39OperationPhases} from '../../lib/v39-operation-phases.js';
import {editV39OperationPlan} from '../../lib/v39-operation-plans.js';
import {getFactionSettlements} from '../../lib/settlement-state.js';
import {facilityDefinitions,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS} from '../../lib/v39-economy-rules.js';
import {resolveV39ConstructionMaterials} from '../../lib/v39-construction-materials.js';
import {v39WallEdgeKey} from '../../lib/v39-wall-edges.js';
import {renderV39ResourceIcon} from '../ui/v39-resource-item-icon.js';
import {V39_SCREEN_HELP_COPY} from '../ui/v39-screen-help-copy.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const V39_TERRITORY_GUIDE_STEPS=['expansion','construction','units'];
const guideTitles=['領土拡張','土地開発','ユニット追加'];
let completedGuideStep='';
const guideCompletionReasons={
  expansion:['expansion-planned'],
  construction:['construction-planned','development-planned','wall-planned','territory-settlement-conversion-started'],
  units:['units-created']
};
export const isV39TerritoryGuideActionCompleted=step=>completedGuideStep===step;

function currentGuideStep(){
  const state={gameSettings:window.getV39GameSettings?.(),timeline:window.getV39TimelineState?.(),activePlayerId:window.getV39ActivePlayerId?.()};
  return {state,step:isV39TerritoryPhase(state)?window.getV39TerritoryGuideStep?.(state):''};
}

export function isV39TerritoryUnitGuideActive(){
  return currentGuideStep().step==='units';
}

export function renderV39TerritoryUnitListGuide(){
  const {state,step}=currentGuideStep();
  return step==='units'?renderV39TerritoryGuide(state,step,{target:'unit-create'}):'';
}

export function renderV39TerritoryGuide(state,step,{target='',highlightNext=false}={}){
  if(!isV39TerritoryPhase(state))return '';
  const index=V39_TERRITORY_GUIDE_STEPS.indexOf(step);
  if(index<0)return '';
  const steps=guideTitles.map((title,position)=>
    `<button type="button" data-territory-guide="${V39_TERRITORY_GUIDE_STEPS[position]}"${position===index?' aria-current="step"':''}><b>${position+1}</b> <span>${title}</span></button>`).join('');
  return `<nav class="v39-territory-guide" aria-label="開発フェーズの操作手順">
    <div class="v39-territory-guide-steps">${steps}</div>
    ${step==='units'?`<button type="button"${highlightNext?' class="v39-territory-guide-highlight"':''} data-territory-guide="review">ターン終了</button>`:''}
    ${target?`<p class="v39-territory-guide-hint">${esc(V39_SCREEN_HELP_COPY.territoryGuide[target])}</p>`:''}
  </nav>`;
}

function updateTerritoryGuide(){
  const app=document.querySelector('.app');
  if(!app)return;
  const {state,step}=currentGuideStep();
  let target='';
  if(step==='expansion'){
    if(!document.getElementById('footSettlement')?.classList.contains('v39-footer-panel-active'))target='settlement';
    else target=window.isV39LandExpansionSelecting?.()?'expansion-picking':'expansion';
  }
  if(step==='construction'){
    const land=document.getElementById('footTile');
    if(!land?.classList.contains('v39-footer-panel-active'))target='land';
    else if(land.classList.contains('is-construction-open')){
      target=land.querySelector('[data-awaiting-land]')?'construction-tile'
        :land.querySelector('[data-land-construction-start]:enabled')?'construction-reserve':'construction-facility';
    }
    else if(document.getElementById('v39-land-tab-facilities')?.getAttribute('aria-selected')!=='true')target='facilities';
    else target='facility-action';
  }
  if(step==='units'){
    target=document.getElementById('footSquad')?.classList.contains('v39-footer-panel-active')?'unit-list':'squad';
  }
  const highlightNext=Boolean(step&&isV39TerritoryGuideActionCompleted(step));
  const caption=document.getElementById('v39-territory-guide-caption');
  if(caption){
    const markup=renderV39TerritoryGuide(state,step,{target:step==='units'&&highlightNext?'review':target,highlightNext});
    if(markup!==caption.innerHTML)caption.innerHTML=markup;
    caption.hidden=!markup;
  }
  app.dataset.v39TerritoryGuideTarget=highlightNext?'':target;
}

for(const event of ['v39:operation-ui-ready','v39:footer-tab-changed','v39:land-tab-changed','v39:territory-guide-selection-changed','v39:construction-preview-changed']){
  window.addEventListener(event,updateTerritoryGuide);
}
for(const event of ['v39:territory-guide-changed','v39:field-layer-changed','v39:field-generated','v39:save-loaded']){
  window.addEventListener(event,()=>{completedGuideStep='';updateTerritoryGuide();});
}
window.addEventListener('v39:game-state-changed',event=>{
  const reason=event.detail?.reason;
  if(reason==='activity-log')return;
  if(reason==='territory-planning-finished'||reason==='expansion-unplanned'||reason==='settlement-selected')completedGuideStep='';
  const state={timeline:window.getV39TimelineState?.(),activePlayerId:window.getV39ActivePlayerId?.()};
  const step=window.getV39TerritoryGuideStep?.(state);
  if(guideCompletionReasons[step]?.includes(reason))completedGuideStep=step;
  updateTerritoryGuide();
});
export function getV39ConstructionPlans(base){
  return (base?.operationPlans||[]).filter(plan=>plan.kind!=='expansion');
}

export function renderV39ConstructionMaterialTotals(base){
  const plans=getV39ConstructionPlans(base);
  if(!plans.length)return '';
  const definitions=new Map(facilityDefinitions({includeSettlementScales:true}).map(definition=>[definition.name,definition]));
  const materialKeys=new Set(MATERIAL_RESOURCE_KEYS);
  const round=value=>Math.round(value*10)/10;
  const format=value=>value.toLocaleString('ja-JP',{maximumFractionDigits:1});
  const stock={...base.foodStockByType,...base.materialStockByType};
  const byTurn=new Map();
  for(const plan of plans){
    const definition=definitions.get(plan.facilityName);
    if(!definition)continue;
    let group=byTurn.get(plan.notBeforeTurn);
    if(!group){
      group={stock:{...stock},total:{}};
      byTurn.set(plan.notBeforeTurn,group);
    }
    const edges=plan.kind==='wall'?new Set((plan.edges||[]).filter(edge=>edge?.from&&edge?.to).map(v39WallEdgeKey)).size:1;
    const materials=Object.fromEntries(Object.entries(definition.cost).map(([name,amount])=>[name,amount*edges]));
    const {cost}=resolveV39ConstructionMaterials(materials,group.stock);
    if(plan.kind==='development')for(const name of FOOD_RESOURCE_KEYS)if(!materialKeys.has(name))cost[name]=Number(definition.row?.[name])||0;
    for(const [name,amount] of Object.entries(cost)){
      if(amount<=0)continue;
      group.total[name]=round((group.total[name]||0)+amount);
      group.stock[name]=Math.max(0,round((Number(group.stock[name])||0)-amount));
    }
  }
  const rows=[...byTurn].sort(([a],[b])=>a-b).map(([turn,{total}])=>{
    const costs=Object.entries(total).map(([name,needed])=>{
      const available=Number(stock[name])||0,shortage=round(Math.max(0,needed-available));
      return `<li>${renderV39ResourceIcon(name)} <span>${esc(name)} ${format(needed)} / ${format(available)}</span>${shortage?`<b>不足 ${format(shortage)}</b>`:''}</li>`;
    }).join('');
    return `<div><strong>T${esc(turn)}</strong>${costs?`<ul>${costs}</ul>`:' 素材なし'}</div>`;
  }).join('');
  return rows?`<section class="v39-plan-material-totals"><strong>開始予定ターン別 素材合計</strong><small>必要量 / 現在庫。着手時に消費します。</small>${rows}</section>`:'';
}

export function renderV39OperationPlans(state,player,base,{scope='all',showFinish=true,showMaterialTotals=true}={}){
  if(!usesV39OperationPhases(state))return '';
  const editable=isV39TerritoryPhase(state)&&state.timeline.phase==='player';
  const matches=plan=>scope==='all'||(scope==='expansion'?plan.kind==='expansion':plan.kind!=='expansion');
  const construction=scope==='construction';
  const plans=construction?getV39ConstructionPlans(base):(base.operationPlans||[]).filter(matches);
  const cards=plans.map((plan,index)=>{
    const title=`${index+1}. ${esc(plan.kind==='expansion'?'領土拡張':plan.facilityName)} (${plan.tile.x},${plan.tile.y})`;
    const heading=editable&&construction
      ? `<header><button type="button" data-plan-drag aria-label="予約を並べ替え" title="ドラッグ、または上下キーで並べ替え">⠿</button><b>${title}</b><button type="button" data-plan-action="cancel" aria-label="この予約を取り消す" title="この予約を取り消す">×</button></header>`
      : `<b>${title}</b>`;
    return `<article class="v39-operation-plan" data-plan-scope="${esc(scope)}" data-plan-id="${esc(plan.id)}" data-plan-base="${esc(base.settlementId)}">${heading}<label>開始予定 T<input type="number" min="1" step="1" data-plan-turn value="${plan.notBeforeTurn}"${editable?'':' disabled'}></label><small>${esc(plan.reason||'着手待ち')}</small>${editable&&!construction?'<div><button type="button" data-plan-action="up" aria-label="計画を前へ">↑</button><button type="button" data-plan-action="down" aria-label="計画を後ろへ">↓</button><button type="button" data-plan-action="cancel">取消</button></div>':''}</article>`;
  }).join('');
  const instructions=scope==='expansion'?'':`<p>${editable?'上から順に判定。着手できない計画は保留し、後続を先に開始します。':'戦闘・探索中：毎ターンの収入後に自動着手します。編集は次の領土運営で行います。'}</p>`;
  return `${showFinish?(editable?'<button type="button" class="settlement-chip" data-plans-confirm>拠点フェーズを終了</button>':'<b>次の領土運営まで自動進行</b>'):''}${instructions}${cards||'<p>予約なし</p>'}${construction&&showMaterialTotals?renderV39ConstructionMaterialTotals(base):''}<details><summary>着手履歴</summary>${(base.operationPlanHistory||[]).filter(matches).slice(-10).reverse().map(plan=>`<p>T${plan.startedTurn}: ${esc(plan.facilityName||'領土拡張')} (${plan.tile.x},${plan.tile.y})</p>`).join('')||'記録なし'}</details>`;
}
function edit(target,action,value){
  const row=target.closest('[data-plan-id]');if(!row||window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState({includeWorlds:false});
  const result=editV39OperationPlan(state,state.activePlayerId,row.dataset.planBase,row.dataset.planId,action,value,row.dataset.planScope||'all');
  if(result.ok)window.setV39GameState({players:result.state.players},{reason:'operation-plan-edited'});
  else window.showV39TurnBanner?.(result.reason);
}

let planDrag;

function updatePlanDrop(){
  if(!planDrag)return;
  const {row,x,y}=planDrag;
  const hit=document.elementFromPoint(x,y)?.closest('[data-plan-id]');
  const target=hit!==row&&hit?.parentElement===row.parentElement?hit:null;
  if(planDrag.target!==target)delete planDrag.target?.dataset.planDrop;
  planDrag.target=target;
  if(target){
    const bounds=target.getBoundingClientRect();
    target.dataset.planDrop=y<bounds.top+bounds.height/2?'before':'after';
  }
}

function scrollPlanDrag(){
  if(!planDrag)return;
  if(!planDrag.row.isConnected){clearPlanDrag();return;}
  const {scroller,y}=planDrag;
  const {top,bottom}=scroller.getBoundingClientRect();
  const before=scroller.scrollTop;
  if(y>=top-30&&y<top+30)scroller.scrollTop-=8;
  else if(y<=bottom+30&&y>bottom-30)scroller.scrollTop+=8;
  if(scroller.scrollTop!==before)updatePlanDrop();
  planDrag.frame=requestAnimationFrame(scrollPlanDrag);
}

function clearPlanDrag(){
  const {row,target,frame}=planDrag;
  planDrag=null;
  cancelAnimationFrame(frame);
  delete row.dataset.planDragging;
  if(target)delete target.dataset.planDrop;
}

document.addEventListener('pointerdown',event=>{
  const handle=event.target.closest?.('[data-plan-drag]');
  if(!handle||event.button!==0||planDrag||window.isV39MapInputLocked?.())return;
  const row=handle.closest('[data-plan-id]');
  const scroller=row.closest('.v39-land-build-detail,.settlement-fold-list');
  if(!scroller)return;
  handle.setPointerCapture(event.pointerId);
  row.dataset.planDragging='true';
  planDrag={row,scroller,pointerId:event.pointerId,x:event.clientX,y:event.clientY,frame:requestAnimationFrame(scrollPlanDrag)};
});
document.addEventListener('pointermove',event=>{
  if(planDrag?.pointerId!==event.pointerId)return;
  planDrag.x=event.clientX;
  planDrag.y=event.clientY;
  updatePlanDrop();
});
for(const type of ['pointerup','pointercancel','lostpointercapture']){
  document.addEventListener(type,event=>{
    if(planDrag?.pointerId!==event.pointerId)return;
    if(type==='pointerup'){
      planDrag.x=event.clientX;
      planDrag.y=event.clientY;
      updatePlanDrop();
    }
    const {row,target}=planDrag;
    const after=target?.dataset.planDrop==='after';
    clearPlanDrag();
    if(type==='pointerup'&&target&&row.isConnected)edit(row,'move',{targetId:target.dataset.planId,after});
  });
}
document.addEventListener('keydown',event=>{
  const handle=event.target.closest?.('[data-plan-drag]');
  if(!handle||!['ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();
  const id=handle.closest('[data-plan-id]').dataset.planId;
  edit(handle,event.key==='ArrowUp'?'up':'down');
  document.querySelector(`[data-plan-id="${CSS.escape(id)}"] [data-plan-drag]`)?.focus({preventScroll:true});
});

document.addEventListener('click',event=>{
  const guide=event.target.closest?.('[data-territory-guide]');
  if(guide){
    if(guide.dataset.territoryGuide==='review')void window.reviewV39TerritoryPlans?.();
    else if(!guide.hasAttribute('aria-current')){
      window.setV39TerritoryGuideStep?.(guide.dataset.territoryGuide);
      document.querySelector('#v39-territory-guide-caption [aria-current="step"]')?.focus({preventScroll:true});
    }
    return;
  }
  if(event.target.closest?.('[data-plans-confirm]')){void window.advanceV39Turn?.();return;}
  const button=event.target.closest?.('[data-plan-action]');if(button)edit(button,button.dataset.planAction);
});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-plan-turn]'))edit(event.target,'turn',event.target.value);});

export function renderV39TerritoryPhaseReview(state){
  const player=state.players?.find(row=>row.id===state.activePlayerId);
  const bases=getFactionSettlements(player?.factionState);
  const rows=bases.map(base=>{
    const plans=base.operationPlans||[],expansion=plans.filter(plan=>plan.kind==='expansion').length;
    const conversion=Object.keys(base.territoryTileConversionMap||{}).length;
    const training=(player?.factionState?.unitTrainingQueue||[]).filter(task=>task.settlementId===base.settlementId).length;
    return `<li><b>${esc(base.name||'拠点')}</b><span>領土拡張 ${expansion}件 / 土地開発 ${plans.length-expansion+conversion}件</span><span>訓練中・予約 ${training}件</span></li>`;
  }).join('');
  const total=bases.reduce((sum,base)=>sum+(base.operationPlans||[]).length+Object.keys(base.territoryTileConversionMap||{}).length,0)+(player?.factionState?.unitTrainingQueue||[]).length;
  return `<ul>${rows||'<li>拠点なし</li>'}</ul>${total?'':'<p class="v39-phase-review-warning">予約はありません。このまま終了できます。</p>'}<p>拡張・建設の予約は収入後に順次着手し、条件不足なら保留されます。土地開発の件数には進行中の居住化・解除も含みます。終了後は次の開発フェーズまで拡張・建設の予約を編集できません。</p>`;
}
export async function confirmV39TerritoryPhaseEnd(state){
  if(!isV39TerritoryPhase(state))return false;
  const dialog=document.createElement('dialog');
  if(typeof dialog.showModal!=='function')return window.confirm?.('拠点フェーズを終了しますか？ 予約は自動進行し、次の拠点フェーズまで編集できません。')===true;
  dialog.className='v39-territory-phase-review';
  dialog.setAttribute('aria-labelledby','v39-phase-review-title');
  dialog.innerHTML=`<form method="dialog"><h2 id="v39-phase-review-title">開発フェーズを終了しますか？</h2><div>${renderV39TerritoryPhaseReview(state)}</div><footer><button value="cancel">戻って見直す</button><button value="confirm" class="primary">確認して終了</button></footer></form>`;
  document.body.appendChild(dialog);
  return new Promise(resolve=>{
    dialog.addEventListener('close',()=>{const accepted=dialog.returnValue==='confirm';dialog.remove();resolve(accepted);},{once:true});
    dialog.showModal();dialog.querySelector('[value="cancel"]')?.focus();
  });
}
window.confirmV39TerritoryPhaseEnd=confirmV39TerritoryPhaseEnd;
