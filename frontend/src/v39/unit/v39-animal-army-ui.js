import {getV39AnimalArmyEntries,getV39AnimalArmyMemberUnits,inspectV39AnimalArmyUnit,inspectV39AnimalArmyCandidate,editV39AnimalArmy} from '../../lib/v39-animal-army.js';
import {isV39AnimalArmy,isV39OrdinaryAnimal,V39_ANIMAL_ARMY_SETTINGS as settings} from '../../lib/v39-animal-army-profile.js';
import {resolveV39AnimalArmyProgress} from '../../lib/v39-unit-experience.js';
import {renderV39UnitCard} from './v39-unit-card.js';
import './v39-animal-army-ui.css';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,lock=null;
export function renderV39AnimalArmyControls(unit) {
  if(!isV39OrdinaryAnimal(unit))return '';
  return `<button type="button" class="v39-char-squad-action" data-animal-army-open="${esc(unit.id)}">${isV39AnimalArmy(unit)?`軍隊編成 ${unit.animalArmy.members.length}体`:'軍隊化'}</button>`;
}
function close(){
  const callback=session?.onClose;session=null;
  document.getElementById('v39-animal-army')?.close();
  if(lock!==null)window.endV39MapInputLock?.(lock);lock=null;callback?.();
}
function context(){
  const state=window.getV39GameState({includeWorlds:false}),entries=getV39AnimalArmyEntries(state,session.playerId);
  const anchor=entries.find(e=>e.unit.id===session.anchorId);
  if(!anchor)return {state};
  const originals=getV39AnimalArmyMemberUnits(anchor.unit);
  const candidates=[...originals.map(unit=>({unit,internal:true})),...entries.filter(e=>e.unit.id!==anchor.unit.id&&e.unit.race===anchor.unit.race)];
  return {state,anchor,originals,candidates};
}
function render(){
  if(!session)return;
  const {state,anchor,originals,candidates}=context();
  if(!anchor||state.activePlayerId!==session.playerId||(state.activeWorldId||'surface')!==session.worldId||state.timeline.turnNumber!==session.turn){close();return;}
  const dialog=document.getElementById('v39-animal-army'),scroll=dialog.querySelector('.animal-army-list')?.scrollTop||0;
  const selected=candidates.filter(e=>session.ids.has(e.unit.id)),progress=resolveV39AnimalArmyProgress(selected.map(e=>e.unit));
  const army=isV39AnimalArmy(anchor.unit),unchanged=army&&session.ids.size===originals.length&&originals.every(u=>session.ids.has(u.id));
  const reason=inspectV39AnimalArmyUnit(state,session.playerId,anchor);
  const invalid=!!reason||selected.length<settings.minimumMembers||selected.length>settings.maximumMembers||unchanged;
  dialog.innerHTML=`<header><h2 id="v39-animal-army-title">${esc(anchor.unit.race)}の軍隊編成</h2><button type="button" data-animal-army-close>戻る</button></header>
    <p class="animal-army-note">同種・同じクラス構成を${settings.minimumMembers}〜${settings.maximumMembers}体で1駒に。${anchor.storage?'同じ施設内':'周囲'+settings.assemblyRadius+'マス'}から選択。編成後はAP0。</p>
    <div class="animal-army-body"><div class="animal-army-list">${candidates.map(entry=>{
      const u=entry.unit,why=entry.internal?'':inspectV39AnimalArmyCandidate(state,session.playerId,anchor,entry),fixed=u.id===originals[0].id;
      return `<div class="animal-army-candidate${why?' unavailable':''}"><div class="animal-army-member-check"><input type="checkbox" data-animal-army-select="${esc(u.id)}" aria-label="${esc(u.name)}を編成"${session.ids.has(u.id)?' checked':''}${fixed||why?' disabled':''}><span>${fixed?'代表':entry.internal?'編成中':entry.storage?esc(entry.storage.facilityName):'活動中'}</span></div>${renderV39UnitCard(u,{attribute:'data-animal-army-card',selected:session.ids.has(u.id)})}${why?`<small>${esc(why)}</small>`:''}</div>`;
    }).join('')}</div><section class="animal-army-preview"><h3>編成後</h3><b>${selected.length} / ${settings.maximumMembers}体</b><p>平均 Lv${progress.level}</p><p>EXP ${progress.exp} / ${progress.need}</p><p>攻撃回数 ${selected.length}回</p><p>HP倍率 ×${1+Math.max(0,selected.length-1)*settings.hpBonusPerMember}</p><hr><p>外した個体は${anchor.storage?'同じ施設内':'周囲の空きマス'}へ戻ります。</p><p>個体のLv・EXP・装備を保持。獲得EXPは構成個体に分配します。</p></section></div>
    <output aria-live="polite">${esc(session.message||reason)}</output><footer>${army?'<button type="button" data-animal-army-disband>解散</button>':''}<button type="button" data-animal-army-save${invalid?' disabled':''}>${army?'編成を保存':'軍隊化する'}</button></footer>`;
  dialog.querySelector('.animal-army-list').scrollTop=scroll;
}
export function openV39AnimalArmyEditor(anchorId,onClose){
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState({includeWorlds:false}),anchor=getV39AnimalArmyEntries(state,state.activePlayerId).find(e=>e.unit.id===anchorId);
  if(!anchor)return;
  if(!document.getElementById('v39-animal-army')){
    const dialog=document.createElement('dialog');dialog.id='v39-animal-army';dialog.setAttribute('aria-labelledby','v39-animal-army-title');document.body.append(dialog);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
    dialog.addEventListener('close',()=>{if(!dialog.open&&session)close();});
    dialog.addEventListener('keydown',e=>e.stopPropagation());
    dialog.addEventListener('change',e=>{const id=e.target.dataset.animalArmySelect;if(!id)return;e.target.checked?session.ids.add(id):session.ids.delete(id);session.message='';render();});
    dialog.addEventListener('click',e=>{
      if(e.target.closest('[data-animal-army-close]')){close();return;}
      const card=e.target.closest('[data-animal-army-card]');
      if(card){const input=card.parentElement.querySelector('input');if(!input.disabled){input.checked=!input.checked;input.dispatchEvent(new Event('change',{bubbles:true}));}return;}
      const disband=!!e.target.closest('[data-animal-army-disband]');
      if(!disband&&!e.target.closest('[data-animal-army-save]'))return;
      const {state}=context();
      if(state.activePlayerId!==session.playerId||(state.activeWorldId||'surface')!==session.worldId||state.timeline.turnNumber!==session.turn){close();return;}
      const result=editV39AnimalArmy(state,session.playerId,{anchorId:session.anchorId,memberIds:[...session.ids],disband},window.__v39FieldRuntime?.mapData);
      if(!result.ok){session.message=result.reason;render();return;}
      window.setV39GameState({players:result.state.players},{reason:'animal-army-edited'});close();window.refreshV39SquadDerivedUI?.();
    });
  }
  session={anchorId,playerId:state.activePlayerId,worldId:state.activeWorldId||'surface',turn:state.timeline.turnNumber,ids:new Set(getV39AnimalArmyMemberUnits(anchor.unit).map(u=>u.id)),onClose};
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
  document.getElementById('characterModal')?.classList.remove('open');lock=window.beginV39MapInputLock?.('animal-army')??null;
  render();document.getElementById('v39-animal-army').showModal();
}
window.addEventListener('v39:game-state-changed',e=>{if(session&&e.detail?.reason!=='activity-log')render();});
window.addEventListener('v39:field-generated',()=>{if(session)close();});
