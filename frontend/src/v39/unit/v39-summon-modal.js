import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {getV39SummonEntries,inspectV39Summon,summonV39Units,describeV39SummonEquipment} from "../../lib/v39-summon-rules.js";
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
  let entries,checks,selector='';
  if(session.mode==='facility') {
    const slots=getV39FacilitySummonSlots(state,session.playerId);
    if(!slots.some(slot=>slot.id===session.slotId))session.slotId=slots[0]?.id;
    const slot=slots.find(slot=>slot.id===session.slotId);
    entries=getV39FacilitySummonEntries(slot);
    checks=entries.map(entry=>inspectV39FacilitySummon(state,session.playerId,session.slotId,entry.row.名前,window.__v39FieldRuntime.mapData));
    selector=`<label>召喚施設<select data-facility-slot aria-label="召喚施設">${slots.map(item=>`<option value="${escape(item.id)}" ${item.id===session.slotId?'selected':''}>${escape(item.base.name)} / ${escape(item.row.施設名)} / ${item.activeUnitIds.length?'活動中'+item.activeUnitIds.length+'駒':item.remainingTurns?'残'+item.remainingTurns+'T':'空き'}</option>`).join('')}</select></label>`;
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
  const entry=check?.entry,displayEntry=check?.creationEntry||entry;
  let host=document.getElementById('v39-summon-modal');
  if(!host){host=document.createElement('div');host.id='v39-summon-modal';host.className='modal-backdrop open';document.body.append(host);}
  const facilityMode=session.mode==='facility';
  const materialSummary=(costs)=>Object.entries(costs||{}).map(([name,amount])=>`${name}${amount}（所持${getV39SummonMaterialStock(check.slot?.base||check.paymentBase,name)}）`).join(' / ');
  const countryBonus=check?.facility?.countryBonus||0,cityBonus=check?.facility?.cityBonus||0,facilityBonus=(check?.facility?.bonusLevel||0)-countryBonus-cityBonus;
  const levelBonusLabel=[facilityBonus?`＋施設${facilityBonus}`:'',countryBonus?`＋国${countryBonus}`:'',cityBonus?`＋都市${cityBonus}`:''].join('');
  const details=entry?`${facilityMode?`<div class="v39-summon-batch-controls"><label>召喚数<select data-summon-count aria-label="召喚数">${check.batchOptions.map(option=>`<option value="${option.count}"${option.count===check.count?' selected':''}>${option.count}体${option.count>1?`（元Lv${option.maximumLevel}以下）`:''}</option>`).join('')}</select></label><label>編成<select data-summon-formation aria-label="召喚編成"${check.count===1?' disabled':''}><option value="split"${check.formation==='split'?' selected':''}>個別</option><option value="army"${check.formation==='army'?' selected':''}>軍隊1駒</option></select></label></div>`:''}<p>Lv${check.preview?.level??entry.spec?.level??'-'}${check.facility?.bonusLevel?`（元Lv${entry.spec.level}${levelBonusLabel}）`:''} / ${displayEntry.spec.members?`軍隊${displayEntry.spec.members}人`:'個人'} / ${displayEntry.spec.count}ユニット</p>
    <p>${facilityMode?`召喚 ${check.goldCost}金（所持${check.goldHeld}） / 維持 ${check.goldCost}金・${check.upkeepIntervalTurns}Tごと<br>施設ごとに同種1組 / 効果時間なし / 全員消滅後${check.slot?.row.施設召喚再使用T??0}T`:`AP ${check.cost} ${check.hpCost?'/ HP '+check.hpCost:''} / ⌛${check.duration}`}</p>
    ${Object.keys(check.initialMaterials||{}).length?`<p>必要資材: ${escape(materialSummary(facilityMode?check.initialMaterials:check.initialPayment))}</p>`:''}
    ${Object.keys(check.upkeepMaterials||{}).length?`<p>維持素材: ${escape(materialSummary(facilityMode?check.totalUpkeepMaterials:check.upkeepMaterials))} / ${check.upkeepIntervalTurns||resolveV39FacilitySummonCosts(check.preview).upkeepIntervalTurns}Tごと${facilityMode?'・合計':'・1体あたり'}</p>`:''}
    <p>${facilityMode?'施設':'スキル'}上限Lv${check.facility.maximumLevel} / ${escape(check.facility.family||'全般')}${facilityMode?` / ${check.radius?'周囲'+check.radius+'マス以内':'施設マスのみ'}`:''}</p>`:'';
  updateView(host,`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="v39-summon-title">
    <header class="modal-header"><h3 id="v39-summon-title">${facilityMode?'施設召喚':'召喚'}</h3><button data-summon-close aria-label="閉じる">×</button></header>
    <div class="modal-body character-layout"><div class="list-pane">${selector}${checks.map(item=>`<div data-summon-option="${escape(item.entry.row.名前)}" class="${item.available?'':'unavailable'}">${item.preview?renderV39UnitCard(item.preview,{id:item.entry.row.名前,character:true,portrait:true,attribute:'data-summon-card',selected:item.entry.row.名前===session.skillName,position:`${item.entry.spec.members?item.entry.spec.members+'人編成 / ':''}${item.entry.spec.count}ユニット`}):`<button>${escape(item.entry.row.名前)}（設定不正）</button>`}</div>`).join('')||'<p>召喚条件を満たす候補がありません</p>'}</div>
    <div class="summon-detail squad-detail-pane"><h4>${escape(entry?.spec.target||'候補を選択')}</h4>
    ${describeV39SummonEquipment(entry?.spec.target)?`<p class="summon-equipment-note">${escape(describeV39SummonEquipment(entry.spec.target))}</p>`:''}${details}
    ${renderV39DetailTabs([['ability','能力'],['skills','スキル']],tab,'data-summon-tab')}
    <div class="summon-scroll">${check?.preview?(tab==='ability'?renderV39UnitAbility(check.preview):renderV39UnitSkills(check.preview)):''}</div>
    <footer><p role="status">${escape(message||(check?.available?'召喚先を確保できます':check?.reasons.join(' / '))||'召喚施設を選択してください')}</p>
    <button data-summon-confirm ${check?.available?'':'disabled'}>${facilityMode?'召喚先を選ぶ':'召喚する'}</button></footer></div></div></section>`);
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
  const option=el.closest('[data-summon-option]');if(option){session.skillName=option.dataset.summonOption;message='';render();return;}
  const selectedTab=el.closest('[data-summon-tab]');if(selectedTab){tab=selectedTab.dataset.summonTab;render();return;}
  if(el.closest('[data-call-confirm]')) {
    const result=callV39Units(window.getV39GameState(),session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
    if(!result.ok){message=result.reason;render();return;}
    close();window.setV39GameState({players:result.state.players},{reason:'call-completed'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.showV39TurnBanner?.(result.message);return;
  }
  if(el.closest('[data-summon-confirm]')) {
    if(session.mode==='facility'){beginPlacement();return;}
    const result=summonV39Units(window.getV39GameState(),session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData);
    if(!result.ok){message=result.reason;render();return;}
    close();window.setV39GameState({players:result.state.players},{reason:'summon-created'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
    window.showV39TurnBanner?.(result.message);
  }
});
document.addEventListener('change',event=>{
  if(!session||!(event.target instanceof Element))return;
  if(event.target.matches('#v39-summon-modal [data-summon-count]')){session.count=Number(event.target.value);message='';render();return;}
  if(event.target.matches('#v39-summon-modal [data-summon-formation]')){session.formation=event.target.value;message='';render();return;}
  if(event.target.matches('#v39-summon-modal [data-facility-slot]')){session.slotId=event.target.value;session.skillName=null;message='';render();return;}
  if(event.target.matches('#v39-summon-modal [data-call-skill]')){session.skillName=event.target.value;session.selectedIds=[];message='';render();}
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
.v39-summon-batch-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}
.v39-summon-batch-controls label{display:grid;min-width:0;gap:2px}
.v39-summon-batch-controls select{width:100%;min-width:0;box-sizing:border-box;min-height:32px;background:#14252b;color:#e6eeeb;border:1px solid #56737c;border-radius:5px;font:inherit}
#v39-facility-summon-placement{position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:2100;display:flex;flex-wrap:wrap;gap:6px;align-items:center;max-width:calc(100vw - 16px);width:max-content;padding:8px;background:#102025;border:2px solid #79d4e8;border-radius:8px;color:#eef9f9;font-size:var(--font-body)}
#v39-facility-summon-placement span{flex:1 1 100%}#v39-facility-summon-placement button{padding:6px 9px;background:#19353f;border:1px solid #6aa9b8;border-radius:6px;color:#eef9f9;font-size:var(--font-body)}#v39-facility-summon-placement button:disabled{opacity:.45}
#v39-summon-modal{position:fixed;inset:0;z-index:2100;background:#0009;display:grid;place-items:center}
#v39-summon-modal .modal{width:min(900px,96vw);height:min(780px,94svh);display:flex;flex-direction:column;background:#102025;border:1px solid #65858b;border-radius:10px;color:#e6eeeb;overflow:hidden;font-size:var(--font-body)}
#v39-summon-modal .modal-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;flex-shrink:0}#v39-summon-modal h3,#v39-summon-modal h4,#v39-summon-modal p{margin:4px 0}
#v39-summon-modal .character-layout{flex:1;min-height:0;height:auto;overflow:hidden;display:grid;grid-template-columns:minmax(150px,190px) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:7px;padding:8px}
#v39-summon-modal .list-pane label{display:flex;flex-direction:column;gap:4px}#v39-summon-modal .list-pane select{max-width:100%;min-height:34px;color:#e6eeeb;background:#19353f}#v39-summon-modal .list-pane{overflow:auto;min-width:0;display:flex;flex-direction:column;gap:5px}#v39-summon-modal .squad-card{width:100%}#v39-summon-modal .unavailable{opacity:.55}
#v39-summon-modal .summon-detail{min-width:0;min-height:0;display:flex;flex-direction:column;padding:7px;border:1px solid #35535b;border-radius:7px}#v39-summon-modal .summon-scroll{overflow:auto;flex:1;min-height:0}#v39-summon-modal footer{border-top:1px solid #35535b;padding-top:6px;flex-shrink:0}
#v39-summon-modal button{font-size:var(--font-body);color:#e6eeeb}#v39-summon-modal [data-summon-confirm],#v39-summon-modal [data-call-confirm],#v39-summon-modal [data-summon-close]{background:#19353f;border:1px solid #6aa9b8;border-radius:6px;min-height:34px;padding:6px 12px}#v39-summon-modal button:disabled{opacity:.45}
@media(max-width:600px){#v39-summon-modal .character-layout{grid-template-columns:minmax(110px,40%) minmax(0,1fr);gap:5px;padding:5px}#v39-summon-modal .summon-detail{padding:5px}}
`;document.head.append(style);
