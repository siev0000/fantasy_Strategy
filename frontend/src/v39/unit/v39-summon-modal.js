import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {readV39ItemListAction,renderV39ItemListScreen1} from '../ui/v39-item-list-screen-1.js';
import {V39_SCREEN_HELP_COPY} from '../ui/v39-screen-help-copy.js';
import {getV39SummonEntries,inspectV39Summon,summonV39Units,getV39SummonEquipmentGroups} from "../../lib/v39-summon-rules.js";
import {renderV39UnitCard} from "./v39-unit-card.js";
import {renderV39UnitAbility,renderV39DetailTabs} from "./v39-unit-detail.js";
import {renderV39UnitSkills} from "./v39-unit-skills.js";
import {getV39CallEntries,inspectV39Call,callV39Units} from '../../lib/v39-call-rules.js';
import {getV39FacilitySummonSlots,getV39FacilitySummonEntries,inspectV39FacilitySummon,summonV39FacilityUnit} from '../../lib/v39-facility-summoning.js';
import {getV39SummonMaterialStock} from '../../lib/v39-summon-materials.js';
import {resolveV39FacilitySummonCosts} from '../../lib/v39-facility-summon-costs.js';
import {focusV39MapTile} from '../map/v39-map-focus.js';
const escape=value=>String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let session=null,message='',tab='ability',inputLock=null;
let scheduled=false;
function close(){document.getElementById('v39-summon-modal')?.remove();document.getElementById('v39-facility-summon-placement')?.remove();session=null;if(inputLock!==null)window.endV39MapInputLock?.(inputLock);inputLock=null;window.renderV39Visibility?.();}
function batchRequest(){return {count:session.count||1,formation:session.formation||'split'};}
function placementCheck(){return inspectV39FacilitySummon(window.getV39GameState(),session.playerId,session.slotId,session.skillName,window.__v39FieldRuntime.mapData,batchRequest());}
function renderPlacement(){
  const check=placementCheck();
  session.destinations=(session.destinations||[]).filter(target=>check.tiles.some(tile=>tile.x===target.x&&tile.y===target.y));
  session.candidateTileKeys=check.available?check.tiles.map(tile=>tile.key):[];
  let toolbar=document.getElementById('v39-facility-summon-placement');
  if(!toolbar){toolbar=document.createElement('div');toolbar.id='v39-facility-summon-placement';toolbar.setAttribute('role','region');toolbar.setAttribute('aria-label','施設召喚の配置');document.body.append(toolbar);}
  toolbar.innerHTML=`<span role="status">${escape(!check.available?check.reasons.join(' / '):message||`${check.slot.row.施設名}：${check.radius?'周囲'+check.radius+'マス以内':'施設マス'} / 選択${session.destinations.length}/${check.unitCount}マス（再選択で解除）`)}</span><button data-facility-placement-confirm ${check.available&&session.destinations.length===check.unitCount?'':'disabled'}>ここに召喚</button><button data-facility-placement-back>候補へ戻る</button><button data-facility-placement-cancel>中止</button>`;
  window.renderV39Visibility?.();
}
function beginPlacement(){
  const check=placementCheck();if(!check.available){message=check.reasons.join(' / ');render();return;}
  session.picking=true;session.destinations=[];message='';document.getElementById('v39-summon-modal')?.remove();
  if(inputLock!==null)window.endV39MapInputLock?.(inputLock);inputLock=null;
  const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0],camera=scene?.cameras?.main;
  if(camera&&scene.v39FitZoom&&camera.zoom<scene.v39FitZoom*3){
    const rect=scene.game.canvas.getBoundingClientRect();
    scene.v39Input?.zoomAt(rect.left+rect.width/2,rect.top+rect.height/2,scene.v39FitZoom*3/camera.zoom);
  }
  focusV39MapTile(check.slot,{worldId:check.slot.worldId});renderPlacement();
}
function returnToCandidates(){
  session.picking=false;session.destinations=[];session.candidateTileKeys=[];message='';
  document.getElementById('v39-facility-summon-placement')?.remove();window.renderV39Visibility?.();
  inputLock=window.beginV39MapInputLock?.('summon-modal')??null;render();
}
window.getV39FacilitySummonSelection=()=>session?.picking?{candidateTileKeys:session.candidateTileKeys||[],selectedTileKeys:(session.destinations||[]).map(tile=>`${tile.x},${tile.y}`)}:null;
function updateView(host,markup){
  const listScroll=host.querySelector('.list-pane')?.scrollTop||0;
  const detailScroll=host.querySelector('.summon-scroll')?.scrollTop||0;
  const context=`${session.mode}:${session.slotId||''}:${session.skillName}:${session.count||1}:${session.formation||'split'}:${session.mode==='call'?session.previewId:''}:${tab}`;
  const changed=host.dataset.detailContext!==context;
  if(changed){host.querySelector('.summon-scroll')?.replaceChildren();host.__v39RetainedMarkup=null;}
  updateV39RetainedMarkup(host,markup,{preserveInput:true});
  host.querySelector('.list-pane').scrollTop=listScroll;
  host.querySelector('.summon-scroll').scrollTop=changed?0:detailScroll;
  host.dataset.detailContext=context;
}
function renderCall(host,state,caster) {
  const entries=getV39CallEntries(caster);
  if(!entries.some(entry=>entry.row.名前===session.skillName)){session.skillName=entries[0]?.row.名前;session.selectedIds=[];session.previewId=null;}
  let check=inspectV39Call(state,session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
  const ids=session.selectedIds.filter(id=>check.candidates.some(item=>item.unit.id===id));
  if(ids.length!==session.selectedIds.length){session.selectedIds=ids;check=inspectV39Call(state,session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,ids);}
  const focused=check.candidates.find(item=>item.unit.id===session.previewId)||check.candidates[0];
  session.previewId=focused?.unit.id;
  updateView(host,`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="v39-summon-title">
    <header class="modal-header"><h3 id="v39-summon-title">呼集</h3><button data-summon-close aria-label="閉じる">×</button></header>
    <div class="modal-body character-layout"><div class="list-pane">
      <select data-call-skill aria-label="呼集の種類">${entries.map(entry=>`<option value="${escape(entry.row.名前)}" ${entry.row.名前===session.skillName?'selected':''}>${escape(entry.spec?.target||entry.row.名前)} / 最大${entry.spec?.count||0}体</option>`).join('')}</select>
      ${check.candidates.map(item=>`<div data-call-option="${escape(item.unit.id)}" class="${item.available?'':'unavailable'}">
        <span>${session.selectedIds.includes(item.unit.id)?'☑ 選択済み':'☐ 選択'}${item.available?'':` / ${escape(item.reasons.join('・'))}`}</span>
        ${renderV39UnitCard(item.unit,{character:true,portrait:true,attribute:'data-call-card',selected:session.selectedIds.includes(item.unit.id)})}</div>`).join('')||'<p>条件に合う味方がいません</p>'}
    </div><div class="summon-detail squad-detail-pane"><h4>${escape(focused?.unit.name||'対象を選択')}</h4>
      <p>AP ${check.cost}${check.hpCost?` / HP ${check.hpCost}`:''} / 選択 ${session.selectedIds.length}/${check.entry?.spec?.count||0}</p>
      ${renderV39DetailTabs([['ability','能力'],['skills','スキル']],tab,'data-summon-tab')}
      <div class="summon-scroll">${focused?(tab==='ability'?renderV39UnitAbility(focused.unit):renderV39UnitSkills(focused.unit)):'同ワールド・自領土の味方から選択します'}</div>
      <footer><p role="status">${escape(message||(check.available?'選択した味方を隣へ呼び寄せ、同じ部隊へ加入させます':check.reasons.join(' / ')))}</p>
        <button data-call-confirm ${check.available?'':'disabled'}>呼び寄せる</button></footer>
    </div></div></section>`);
}
function render() {
  const state=window.getV39GameState(),caster=state.players.find(row=>row.id===session?.playerId)?.factionState.units.find(row=>row.id===session?.unitId);
  if(!session||state.activePlayerId!==session.playerId||state.activeWorldId!==session.worldId||state.timeline.turnNumber!==session.turn||state.timeline.phase!=='player'){close();return;}
  if(session.mode!=='facility'&&(!caster||Number(caster.hp??caster.currentHp)<=0)){close();return;}
  if(session.picking){renderPlacement();return;}
  if(session.mode==='call') {
    let host=document.getElementById('v39-summon-modal');
    if(!host){host=document.createElement('div');host.id='v39-summon-modal';host.className='modal-backdrop open';document.body.append(host);}
    renderCall(host,state,caster);return;
  }
  let entries,checks,listControls=[];
  if(session.mode==='facility') {
    const slots=getV39FacilitySummonSlots(state,session.playerId);
    if(!slots.some(slot=>slot.id===session.slotId))session.slotId=slots[0]?.id;
    const slot=slots.find(slot=>slot.id===session.slotId);
    entries=getV39FacilitySummonEntries(slot);
    checks=entries.map(entry=>inspectV39FacilitySummon(state,session.playerId,session.slotId,entry.row.名前,window.__v39FieldRuntime.mapData));
    listControls=[{id:'facility',label:'召喚施設',attribute:'data-facility-slot',value:session.slotId,
      options:slots.map(item=>({value:item.id,label:`${item.base.name} / ${item.row.施設名} / ${item.activeUnitIds.length?'活動中'+item.activeUnitIds.length+'駒':item.remainingTurns?'残'+item.remainingTurns+'T':'空き'}`}))}];
  } else {
    entries=getV39SummonEntries(caster);
    checks=entries.map(entry=>inspectV39Summon(state,session.playerId,session.unitId,entry.row.名前,window.__v39FieldRuntime.mapData));
  }
  checks=checks.filter(check=>check.eligible);
  if(!checks.some(check=>check.entry.row.名前===session.skillName))session.skillName=checks[0]?.entry.row.名前;
  let check=checks.find(check=>check.entry?.row.名前===session.skillName);
  if(session.mode==='facility'&&check){
    if(!check.batchOptions.some(option=>option.count===(session.count||1)))session.count=1;
    if((session.count||1)===1)session.formation='split';
    check=inspectV39FacilitySummon(state,session.playerId,session.slotId,session.skillName,window.__v39FieldRuntime.mapData,batchRequest());
    checks=checks.map(item=>item.entry.row.名前===session.skillName?check:item);
  }
  const entry=check?.entry;
  let host=document.getElementById('v39-summon-modal');
  if(!host){host=document.createElement('div');host.id='v39-summon-modal';host.className='modal-backdrop open';document.body.append(host);}
  const facilityMode=session.mode==='facility';
  const getStock=name=>getV39SummonMaterialStock(check?.slot?.base||check?.paymentBase,name);
  const shortages=Object.fromEntries(Object.entries(check?.initialPayment||{}).filter(([name,amount])=>getStock(name)<amount));
  const reasons=check?.reasons.filter(reason=>!reason.startsWith('召喚素材不足:'))||[];
  const upkeep=facilityMode
    ? {...check?.totalUpkeepMaterials,金:(check?.totalUpkeepMaterials?.金||0)+(check?.goldCost||0)}
    : check?.upkeepMaterials;
  const controls=[];
  if(entry&&facilityMode){
    controls.push({id:'count',label:'召喚する体数',attribute:'data-summon-count',value:check.count,
      options:check.batchOptions.map(({count})=>({value:count,label:`${count}体`}))});
    if(check.count>1)controls.push({id:'formation',label:'配置',attribute:'data-summon-formation',value:check.formation,
      options:[{value:'split',label:'1体ずつ配置'},{value:'army',label:'軍隊1駒にまとめる'}]});
  }
  const copy=V39_SCREEN_HELP_COPY.summon;
  const help=facilityMode&&check?[
    copy.select,
    `${check.slot?.row.施設名||'召喚施設'}　召喚上限Lv${check.facility.maximumLevel}（${check.facility.family||'全般'}）`,
    copy.placement(check.radius),
    copy.cooldown(check.slot?.row.施設召喚再使用T??0)
  ]:[];
  const costs=[];
  if(entry){
    costs.push({label:'召喚時',amounts:check.initialPayment,
      summary:facilityMode?'':`AP ${check.cost}${check.hpCost?` / HP ${check.hpCost}`:''} / 持続 ${check.duration}T`});
    if(Object.values(upkeep||{}).some(amount=>amount>0))costs.push({
      label:`維持（${check.upkeepIntervalTurns||resolveV39FacilitySummonCosts(check.preview).upkeepIntervalTurns}Tごと${facilityMode?'':'・1体あたり'}）`,amounts:upkeep});
  }
  if(Object.keys(shortages).length)costs.push({label:'素材不足',amounts:shortages,
    stock:Object.fromEntries(Object.keys(shortages).map(name=>[name,getStock(name)]))});
  updateView(host,renderV39ItemListScreen1({
    title:facilityMode?'施設召喚':'召喚',titleId:'v39-summon-title',closeAttribute:'data-summon-close',help,listControls,costs,
    rows:checks.map(item=>({id:item.entry.row.名前,unit:item.preview,unavailable:!item.available,
      label:`${item.entry.row.名前}（設定不正）`,
      meta:facilityMode?'':(item.entry.spec.members?`${item.entry.spec.members}人編成`:item.entry.spec.count>1?`${item.entry.spec.count}体`:'')})),
    detail:{selectedId:session.skillName,candidateAttribute:'data-summon-option',cardAttribute:'data-summon-card',
      emptyText:'召喚条件を満たす候補がありません',unit:check?.preview,activeDetailTab:tab,detailTabAttribute:'data-summon-tab',controls,
      equipment:getV39SummonEquipmentGroups(entry,check?.preview)},
    status:message||reasons.join(' / '),
    actions:[{id:'summon',label:facilityMode?'召喚先を選ぶ':'召喚する',attribute:'data-summon-confirm',disabled:!check?.available}]
  }));
}
function open(unitId,mode='summon',slotId=null) {
  if(window.isV39MapInputLocked?.())return;
  if(session)close();
  const state=window.getV39GameState();window.cancelV39SelectedUnitAttack?.('summon-selected');window.cancelV39SelectedUnitMove?.();
  session={unitId,mode,slotId,selectedIds:[],count:1,formation:'split',playerId:state.activePlayerId,worldId:state.activeWorldId,turn:state.timeline.turnNumber};message='';tab='ability';
  inputLock=window.beginV39MapInputLock?.('summon-modal') ?? null;render();
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  if(session?.picking){
    if(el?.closest('[data-facility-placement-back]')){returnToCandidates();return;}
    if(el?.closest('[data-facility-placement-cancel]')){close();return;}
    if(el?.closest('[data-facility-placement-confirm]')){
      const result=summonV39FacilityUnit(window.getV39GameState(),session.playerId,session.slotId,session.skillName,window.__v39FieldRuntime.mapData,session.destinations,batchRequest());
      if(!result.ok){message=result.reason;renderPlacement();return;}
      close();window.setV39GameState({players:result.state.players},{reason:'summon-created'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.showV39TurnBanner?.(result.message);return;
    }
  }
  const facilityTrigger=el?.closest('[data-facility-summon-open]');if(facilityTrigger){open(null,'facility',facilityTrigger.dataset.facilitySummonOpen);return;}
  const trigger=el?.closest('[data-v39-summon-open]');if(trigger){open(trigger.dataset.v39SummonOpen);return;}
  const callTrigger=el?.closest('[data-v39-call-open]');if(callTrigger){open(callTrigger.dataset.v39CallOpen,'call');return;}
  const host=el?.closest('#v39-summon-modal');if(!host)return;
  if(el.closest('[data-summon-close]')||el===host){close();return;}
  if(el.closest('select'))return;
  const action=readV39ItemListAction(el);
  const callOption=el.closest('[data-call-option]');if(callOption){
    const state=window.getV39GameState(),check=inspectV39Call(state,session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
    const id=callOption.dataset.callOption,item=check.candidates.find(item=>item.unit.id===id);session.previewId=id;message='';
    if(session.selectedIds.includes(id))session.selectedIds=session.selectedIds.filter(value=>value!==id);
    else if(item?.available) {
      if(session.selectedIds.length<check.entry.spec.count)session.selectedIds.push(id);
      else message=`最大${check.entry.spec.count}体です。先に選択を解除してください`;
    }
    render();return;
  }
  if(action?.id==='candidate'){session.skillName=action.value;message='';render();return;}
  if(action?.id==='detail-tab'){tab=action.value;render();return;}
  const selectedTab=el.closest('[data-summon-tab]');if(selectedTab){tab=selectedTab.dataset.summonTab;render();return;}
  if(el.closest('[data-call-confirm]')) {
    const result=callV39Units(window.getV39GameState(),session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
    if(!result.ok){message=result.reason;render();return;}
    close();window.setV39GameState({players:result.state.players},{reason:'call-completed'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.showV39TurnBanner?.(result.message);return;
  }
  if(action?.id==='summon') {
    if(session.mode==='facility'){beginPlacement();return;}
    const result=summonV39Units(window.getV39GameState(),session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData);
    if(!result.ok){message=result.reason;render();return;}
    close();window.setV39GameState({players:result.state.players},{reason:'summon-created'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
    window.showV39TurnBanner?.(result.message);
  }
});
document.addEventListener('change',event=>{
  if(!session||!(event.target instanceof Element)||!event.target.closest('#v39-summon-modal'))return;
  const action=readV39ItemListAction(event.target);
  if(action?.id==='count')session.count=Number(action.value);
  else if(action?.id==='formation')session.formation=action.value;
  else if(action?.id==='facility'){session.slotId=action.value;session.skillName=null;}
  else if(event.target.matches('[data-call-skill]')){session.skillName=event.target.value;session.selectedIds=[];}
  else return;
  message='';render();
});
window.addEventListener('v39:tile-selected',event=>{
  if(!session?.picking)return;event.stopImmediatePropagation();
  const check=placementCheck(),tile=check.tiles.find(tile=>tile.x===event.detail?.x&&tile.y===event.detail?.y);
  const selected=session.destinations||[];
  if(check.available&&tile){
    const index=selected.findIndex(target=>target.x===tile.x&&target.y===tile.y);
    if(index>=0)selected.splice(index,1);
    else if(check.unitCount===1)selected.splice(0,selected.length,{x:tile.x,y:tile.y});
    else if(selected.length<check.unitCount)selected.push({x:tile.x,y:tile.y});
    else {message=`最大${check.unitCount}マスです。選択済みのマスを押すと解除できます`;render();return;}
    session.destinations=selected;
  }else if(check.unitCount===1)session.destinations=[];
  message=check.available?'':check.reasons.join(' / ');render();
},true);
window.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
window.addEventListener('v39:game-state-changed',()=>{
  if(!session||scheduled)return;scheduled=true;const current=session;
  requestAnimationFrame(()=>{scheduled=false;if(session===current)render();});
});
for(const name of ['v39:unit-selected','v39:save-loaded','v39:field-generated'])window.addEventListener(name,()=>{if(session)close();});
window.openV39FacilitySummonModal=slotId=>open(null,'facility',slotId);
const style=document.createElement('style');style.textContent=`
#v39-facility-summon-placement{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2100;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 16px);width:max-content;padding:8px;background:#102025;border:2px solid #79d4e8;border-radius:8px;color:#eef9f9;font-size:var(--font-body)}
#v39-facility-summon-placement span{flex:1 1 100%}#v39-facility-summon-placement button{padding:6px 9px;background:#19353f;border:1px solid #6aa9b8;border-radius:6px;color:#eef9f9;font-size:var(--font-body)}#v39-facility-summon-placement button:disabled{opacity:.45}
#v39-summon-modal{position:fixed;inset:0;z-index:2100;background:#0009;display:grid;place-items:center}
`;document.head.append(style);
