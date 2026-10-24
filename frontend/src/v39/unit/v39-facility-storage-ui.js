import {getV39StorageFacilities,getV39FacilityStoredEntries,inspectV39FacilityDeposit,depositV39FacilityUnit,withdrawV39FacilityUnit} from '../../lib/v39-facility-storage.js';
import {getV39CorpseStorageCandidates,recoverV39CorpseToFacility,releaseV39StoredCorpse} from '../../lib/v39-corpse-storage.js';
import {renderV39UnitCard} from './v39-unit-card.js';
import {renderV39UnitAbility} from './v39-unit-detail.js';
import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import './v39-facility-storage-ui.css';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let session=null,lock=null;
const current=()=>window.getV39GameState({includeWorlds:false});
export function renderV39FacilityStorageButtons(state,playerId,settlement,selected=null){
  const keys=new Set([...(settlement?.territoryTileKeys||[]),...Object.keys(settlement?.tileFacilityMap||{})]);
  return getV39StorageFacilities(state,playerId).filter(f=>keys.has(f.tileKey)&&(!selected||(f.tileKey===selected.tileKey&&f.name===selected.name))).map(f=>
    `<button type="button" class="settlement-chip" data-storage-open="${esc(f.tileKey)}" data-storage-name="${esc(f.name)}">${esc(f.name)} (${f.x},${f.y}) · ${f.type==='soul'?'魂':'格納'} ${getV39FacilityStoredEntries(state,playerId,f).length}</button>`).join('');
}
function close(){document.getElementById('v39-facility-storage')?.remove();session=null;if(lock!==null)window.endV39MapInputLock?.(lock);lock=null;}
function render(){
  if(!session)return;
  const state=current(),playerId=session.playerId;
  if(state.activePlayerId!==playerId||state.activeWorldId!==session.world||state.timeline.turnNumber!==session.turn){close();return;}
  const facility=getV39StorageFacilities(state,playerId).find(f=>f.tileKey===session.tileKey&&f.name===session.name);
  if(!facility){close();return;}
  const faction=state.players.find(p=>p.id===playerId).factionState;
  const entries=getV39FacilityStoredEntries(state,playerId,facility);
  const corpse=facility.type==='corpse';
  const depositing=session.tab==='deposit'&&facility.type!=='soul';
  const units=depositing?(corpse?getV39CorpseStorageCandidates(state,playerId,facility):faction.units):entries.map(e=>facility.type==='soul'?e:e.unit);
  const selected=units.find(u=>u.id===session.selectedId)||units[0];
  const cards=units.map(unit=>{
    const reason=depositing&&!corpse?inspectV39FacilityDeposit(state,playerId,facility,unit):'';
    return `<div class="storage-row" data-storage-row="${esc(unit.id)}">${renderV39UnitCard(unit,{selected:unit.id===selected?.id,attribute:'data-storage-select',position:depositing?undefined:corpse?'遺体 / 保管中':facility.type==='soul'?'魂 / 合成専用':'施設内'})}
      ${facility.type==='soul'?'':`<button type="button" data-storage-${depositing?'deposit':'withdraw'}="${esc(unit.id)}"${reason?' disabled':''}>${depositing?(corpse?'回収して保管':'格納'):'取り出す'}</button>`}${reason?`<small>${esc(reason)}</small>`:''}</div>`;
  }).join('');
  let root=document.getElementById('v39-facility-storage');
  if(!root){root=document.createElement('div');root.id='v39-facility-storage';document.body.append(root);}
  updateV39RetainedMarkup(root,`<section role="dialog" aria-modal="true" aria-label="施設格納"><header><b>${esc(facility.name)} (${facility.x},${facility.y})</b><button type="button" data-storage-close>閉じる</button></header>
    <nav><button type="button" data-storage-tab="stored" aria-pressed="${!depositing}">${facility.type==='soul'?'保管魂':corpse?'保管遺体':'格納中'} ${entries.length}${facility.capacity?` / ${facility.capacity}`:''}</button>${facility.type!=='soul'?`<button type="button" data-storage-tab="deposit" aria-pressed="${depositing}">${corpse?'回収する':'格納する'}</button>`:''}${facility.target==='player'?'<small>プレイヤー種族のみ</small>':''}</nav>
    <div class="storage-panes"><div class="squad-member-list">${cards||'<p>対象がありません</p>'}</div><div class="squad-detail-pane">${selected?renderV39UnitAbility(selected):'<p>ユニットを選択してください</p>'}</div></div>
    <footer>${esc(session.message|| (corpse?'施設上・隣接の死体と回収済み遺体を保管。保管中は浄化低下・自然アンデッド化・消滅なし。取り出しても死亡状態です。':facility.type==='soul'?'魂回収スキルで死体から保管。出撃不可・合成専用。':'施設上/隣接から格納。取り出すと単独・AP0になります。装備とHPは保持。'))}</footer></section>`);
}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null,open=el?.closest('[data-storage-open]');
  if(open){
    close();const state=current();session={playerId:state.activePlayerId,world:state.activeWorldId,turn:state.timeline.turnNumber,tileKey:open.dataset.storageOpen,name:open.dataset.storageName,tab:'stored'};
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();lock=window.beginV39MapInputLock?.('facility-storage')??null;render();return;
  }
  if(!session||!el?.closest('#v39-facility-storage'))return;
  if(el.closest('[data-storage-close]')){close();return;}
  const tab=el.closest('[data-storage-tab]'),select=el.closest('[data-storage-select]');
  if(tab){session.tab=tab.dataset.storageTab;session.selectedId='';session.message='';render();return;}
  if(select){session.selectedId=select.dataset.storageSelect;render();return;}
  const deposit=el.closest('[data-storage-deposit]'),withdraw=el.closest('[data-storage-withdraw]');
  if(!deposit&&!withdraw)return;
  const state=current(),facility=getV39StorageFacilities(state,session.playerId).find(f=>f.tileKey===session.tileKey&&f.name===session.name);
  const result=facility?.type==='corpse'?(deposit?recoverV39CorpseToFacility(state,session.playerId,facility,deposit.dataset.storageDeposit):releaseV39StoredCorpse(state,session.playerId,facility,withdraw.dataset.storageWithdraw))
    :deposit?depositV39FacilityUnit(state,session.playerId,facility,deposit.dataset.storageDeposit)
    :withdrawV39FacilityUnit(state,session.playerId,facility,withdraw.dataset.storageWithdraw,window.__v39FieldRuntime?.mapData);
  session.message=result.ok?(deposit?'保管しました':facility?.type==='corpse'?'死亡状態で取り出しました':'取り出しました（AP0）'):result.reason;
  if(result.ok)window.setV39GameState({players:result.state.players,enemies:result.state.enemies},{reason:'facility-storage'});
  render();
});
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&session)close();});
window.addEventListener('v39:game-state-changed',render);
window.addEventListener('v39:field-generated',close);
