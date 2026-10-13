import {getV39SummonEntries,inspectV39Summon,summonV39Units,describeV39SummonEquipment} from "../../lib/v39-summon-rules.js";
import {renderV39UnitCard} from "./v39-unit-card.js";
import {renderV39UnitAbility,renderV39DetailTabs} from "./v39-unit-detail.js";
import {renderV39UnitSkills} from "./v39-unit-skills.js";
import {getV39CallEntries,inspectV39Call,callV39Units} from '../../lib/v39-call-rules.js';
const escape=value=>String(value || '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let session=null,message='',tab='ability',inputLock=null;
function close(){document.getElementById('v39-summon-modal')?.remove();session=null;if(inputLock!==null)window.endV39MapInputLock?.(inputLock);inputLock=null;}
function renderCall(host,state,caster) {
  const entries=getV39CallEntries(caster);
  if(!entries.some(entry=>entry.row.名前===session.skillName))session.skillName=entries[0]?.row.名前;
  const check=inspectV39Call(state,session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
  const focused=check.candidates.find(item=>item.unit.id===session.previewId)||check.candidates[0];
  host.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="v39-summon-title">
    <header class="modal-header"><h3 id="v39-summon-title">呼集</h3><button data-summon-close aria-label="閉じる">×</button></header>
    <div class="modal-body character-layout"><div class="list-pane">
      <select data-call-skill aria-label="呼集の種類">${entries.map(entry=>`<option value="${escape(entry.row.名前)}" ${entry.row.名前===session.skillName?'selected':''}>${escape(entry.spec?.target||entry.row.名前)} / 最大${entry.spec?.count||0}体</option>`).join('')}</select>
      ${check.candidates.map(item=>`<div data-call-option="${escape(item.unit.id)}" class="${item.available?'':'unavailable'}">
        <span>${session.selectedIds.includes(item.unit.id)?'☑ 選択済み':'☐ 選択'}${item.available?'':` / ${escape(item.reasons.join('・'))}`}</span>
        ${renderV39UnitCard(item.unit,{character:true,attribute:'data-call-card',selected:session.selectedIds.includes(item.unit.id)})}</div>`).join('')||'<p>条件に合う味方がいません</p>'}
    </div><div class="summon-detail squad-detail-pane"><h4>${escape(focused?.unit.name||'対象を選択')}</h4>
      <p>AP ${check.cost}${check.hpCost?` / HP ${check.hpCost}`:''} / 選択 ${session.selectedIds.length}/${check.entry?.spec?.count||0}</p>
      ${renderV39DetailTabs([['ability','能力'],['skills','スキル']],tab,'data-summon-tab')}
      <div class="summon-scroll">${focused?(tab==='ability'?renderV39UnitAbility(focused.unit):renderV39UnitSkills(focused.unit)):'同ワールド・自領土の味方から選択します'}</div>
      <footer><p role="status">${escape(message||(check.available?'選択した味方を隣へ呼び寄せ、同じ部隊へ加入させます':check.reasons.join(' / ')))}</p>
        <button data-call-confirm ${check.available?'':'disabled'}>呼び寄せる</button></footer>
    </div></div></section>`;
}
function render() {
  const state=window.getV39GameState(),caster=state.players.find(row=>row.id===session?.playerId)?.factionState.units.find(row=>row.id===session?.unitId);
  if(!session||!caster||state.activePlayerId!==session.playerId||state.activeWorldId!==session.worldId||state.timeline.turnNumber!==session.turn||state.timeline.phase!=='player'){close();return;}
  if(session.mode==='call') {
    let host=document.getElementById('v39-summon-modal');
    if(!host){host=document.createElement('div');host.id='v39-summon-modal';host.className='modal-backdrop open';document.body.append(host);}
    renderCall(host,state,caster);return;
  }
  const entries=getV39SummonEntries(caster),checks=entries.map(entry=>inspectV39Summon(state,session.playerId,session.unitId,entry.row.名前,window.__v39FieldRuntime.mapData));
  if(!entries.some(entry=>entry.row.名前===session.skillName))session.skillName=entries[0]?.row.名前;
  const check=checks.find(check=>check.entry?.row.名前===session.skillName),entry=check?.entry;
  let host=document.getElementById('v39-summon-modal');
  if(!host){host=document.createElement('div');host.id='v39-summon-modal';host.className='modal-backdrop open';document.body.append(host);}
  host.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="v39-summon-title"><header class="modal-header"><h3 id="v39-summon-title">召喚</h3><button data-summon-close aria-label="閉じる">×</button></header><div class="modal-body character-layout"><div class="list-pane">${checks.map(item=>`<div data-summon-option="${escape(item.entry?.row.名前)}" class="${item.available?'':'unavailable'}">${item.preview?renderV39UnitCard(item.preview,{id:item.entry.row.名前,character:true,attribute:"data-summon-card",selected:item.entry.row.名前===session.skillName,position:`${item.entry.spec.members?item.entry.spec.members+'人編成 / ':''}${item.entry.spec.count}ユニット`}):`<button>${escape(item.entry?.row.名前)}（設定不正）</button>`}</div>`).join('')}</div><div class="summon-detail squad-detail-pane"><h4>${escape(entry?.spec?.target || '候補を選択')}</h4>${entry?`<p>Lv${entry.spec?.level ?? '-'} / ${entry.spec?.members?`軍隊${entry.spec.members}人`:'個人'} / ${entry.spec?.count ?? '-'}ユニット</p><p>AP ${check.cost} ${check.hpCost?`/ HP ${check.hpCost}`:''} / ⌛${check.duration}</p>`:''}${renderV39DetailTabs([['ability','能力'],['skills','スキル']],tab,'data-summon-tab')}<div class="summon-scroll">${check?.preview?(tab==='ability'?renderV39UnitAbility(check.preview):renderV39UnitSkills(check.preview)):''}</div><footer><p role="status">${escape(message || (check?.available?'召喚先を確保できます':check?.reasons.join(' / ')))}</p><button data-summon-confirm ${check?.available?'':'disabled'}>召喚する</button></footer></div></div></section>`;
  const equipmentNote=describeV39SummonEquipment(entry?.spec?.target);
  if(equipmentNote){const note=document.createElement('p');note.textContent=equipmentNote;host.querySelector('.summon-detail h4')?.after(note);}
}
function open(unitId,mode='summon') {
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState();window.cancelV39SelectedUnitAttack?.('summon-selected');window.cancelV39SelectedUnitMove?.();
  session={unitId,mode,selectedIds:[],playerId:state.activePlayerId,worldId:state.activeWorldId,turn:state.timeline.turnNumber};message='';tab='ability';
  inputLock=window.beginV39MapInputLock?.('summon-modal') ?? null;render();
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  const trigger=el?.closest('[data-v39-summon-open]');if(trigger){open(trigger.dataset.v39SummonOpen);return;}
  const callTrigger=el?.closest('[data-v39-call-open]');if(callTrigger){open(callTrigger.dataset.v39CallOpen,'call');return;}
  const host=el?.closest('#v39-summon-modal');if(!host)return;
  if(el.closest('[data-summon-close]')||el===host){close();return;}
  const callOption=el.closest('[data-call-option]');if(callOption){
    const state=window.getV39GameState(),check=inspectV39Call(state,session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData,session.selectedIds);
    const id=callOption.dataset.callOption,item=check.candidates.find(item=>item.unit.id===id);session.previewId=id;message='';
    if(item?.available) {
      if(session.selectedIds.includes(id))session.selectedIds=session.selectedIds.filter(value=>value!==id);
      else if(session.selectedIds.length<check.entry.spec.count)session.selectedIds.push(id);
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
    const result=summonV39Units(window.getV39GameState(),session.playerId,session.unitId,session.skillName,window.__v39FieldRuntime.mapData);
    if(!result.ok){message=result.reason;render();return;}
    close();window.setV39GameState({players:result.state.players},{reason:'summon-created'});window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
    window.showV39TurnBanner?.(result.message);
  }
});
document.addEventListener('change',event=>{if(event.target instanceof Element&&event.target.matches('#v39-summon-modal [data-call-skill]')){session.skillName=event.target.value;session.selectedIds=[];message='';render();}});
window.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
for(const name of ['v39:game-state-changed','v39:unit-selected','v39:save-loaded','v39:field-generated'])window.addEventListener(name,()=>{if(session)close();});
const style=document.createElement('style');style.textContent=`
#v39-summon-modal{position:fixed;inset:0;z-index:2100;background:#0009;display:grid;place-items:center}
#v39-summon-modal .modal{width:min(900px,96vw);height:min(780px,94svh);display:flex;flex-direction:column;background:#102025;border:1px solid #65858b;border-radius:10px;color:#e6eeeb;overflow:hidden;font-size:var(--font-body)}
#v39-summon-modal .modal-header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;flex-shrink:0}#v39-summon-modal h3,#v39-summon-modal h4,#v39-summon-modal p{margin:4px 0}
#v39-summon-modal .character-layout{flex:1;min-height:0;height:auto;overflow:hidden;display:grid;grid-template-columns:minmax(150px,190px) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:7px;padding:8px}
#v39-summon-modal .list-pane{overflow:auto;min-width:0;display:flex;flex-direction:column;gap:5px}#v39-summon-modal .squad-card{width:100%}#v39-summon-modal .unavailable{opacity:.55}
#v39-summon-modal .summon-detail{min-width:0;min-height:0;display:flex;flex-direction:column;padding:7px;border:1px solid #35535b;border-radius:7px}#v39-summon-modal .summon-scroll{overflow:auto;flex:1;min-height:0}#v39-summon-modal footer{border-top:1px solid #35535b;padding-top:6px;flex-shrink:0}
#v39-summon-modal button{font-size:var(--font-body);color:#e6eeeb}#v39-summon-modal [data-summon-confirm],#v39-summon-modal [data-call-confirm],#v39-summon-modal [data-summon-close]{background:#19353f;border:1px solid #6aa9b8;border-radius:6px;min-height:34px;padding:6px 12px}#v39-summon-modal button:disabled{opacity:.45}
@media(max-width:600px){#v39-summon-modal .character-layout{grid-template-columns:minmax(110px,40%) minmax(0,1fr);gap:5px;padding:5px}#v39-summon-modal .summon-detail{padding:5px}}
`;document.head.append(style);
