import {advanceV39SquadRallies,orderV39SquadMovement,v39SquadMoveMode,v39SquadMoveLabel,v39SquadAutomaticDuty} from '../../lib/v39-squad-coordination.js';
import {playV39UnitMovementPath} from './v39-unit-movement.js';
import './v39-squad-coordination-ui.css';

const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let picking=null;
window.addEventListener('v39:basic-action-changed',event=>{
  if(event.detail?.key!=='v39-basic-coordination')picking=null;
});
const collapsedUnits=new Set();
document.addEventListener('toggle',event=>{
  const target=event.target;
  if(!target?.matches?.('details.v39-squad-coordination'))return;
  if(target.open)collapsedUnits.delete(target.dataset.unitId);
  else collapsedUnits.add(target.dataset.unitId);
},true);
export function renderV39SquadCoordination(unit,faction) {
  const squad=faction?.squads?.find(row=>!['solo','単独'].includes(row.id)&&row.unitIds?.includes(unit?.id));
  if(!squad||!(Number(unit?.hp??unit?.currentHp)>0))return '';
  const members=faction.units.filter(member=>squad.unitIds.includes(member.id)&&Number(member.hp??member.currentHp)>0&&(member.worldId||'surface')===(unit.worldId||'surface'));
  const pending=members.filter(member=>v39SquadMoveMode(member)==='gather');
  const ready=members.filter(member=>v39SquadMoveMode(member)==='follow'&&!v39SquadAutomaticDuty(faction,member)).length;
  const mode=v39SquadMoveMode(unit);
  const button=(action,label,icon,description,current=false)=>`<button type="button" class="technique-card technique-select-card system-action-card v39-squad-order-card" data-squad-coordination="${action}" data-squad-id="${escape(squad.id)}" data-member-id="${escape(unit.id)}"${current?' disabled aria-pressed="true"':''}><span class="technique-summary"><span class="technique-icon"><span class="technique-icon-glyph" aria-hidden="true">${icon}</span></span><b class="technique-name">${label}</b>${current?'<small class="technique-ap">現在</small>':''}</span><span class="v39-squad-order-description">${description}</span></button>`;
  return `<details class="v39-squad-coordination" data-unit-id="${escape(unit.id)}"${collapsedUnits.has(String(unit.id))?'':' open'} aria-label="部隊行動"><summary>部隊行動：${escape(v39SquadMoveLabel(unit))}${pending.length?` · 集合 ${ready}/${ready+pending.length}`:''}</summary><div>${button('follow','追従','↪','移動先頭に合わせて移動する',mode==='follow')}${button('independent','単独行動','➜','部隊に所属したまま個別に移動する',mode==='independent')}${button('scatter','全員散開','↗','部隊の全員を単独行動にする')}${button('gather','先頭へ集合','↩','部隊の移動先頭に集まる')}${button('pick','集合先を指定','⌖','フィールドのマスを選んで集合する')}${pending.length?button('cancel','集合を中止','×','未到着メンバーの集合を取り消す'):''}</div>${unit.squadGather?.reason?`<p>${escape(unit.squadGather.reason)}</p>`:''}</details>`;
}
async function advanceActive({move=true}={}) {
  if(move&&window.isV39MapInputLocked?.())return false;
  const state=window.getV39GameState({includeWorlds:false}),runtime=window.__v39FieldRuntime;
  const result=advanceV39SquadRallies(state,state.activePlayerId,runtime?.mapData,state.timeline.turnNumber,{move});
  if(result.state===state)return true;
  const lock=move?window.beginV39MapInputLock?.('squad-rally'):null;
  const app=document.getElementById('app'),wasInert=app?.inert;
  try {
    if(move&&app)app.inert=true;
    if(move&&result.paths.length){await window.waitForV39MapRenderSettled?.();window.refreshV39MapEntities?.();}
    if(move)for(const path of result.paths)await playV39UnitMovementPath(runtime?.game?.scene?.getScenes(true)?.[0],path.positions.map(position=>[position]),runtime.mapData);
    const next=result.state.players.find(player=>player.id===state.activePlayerId).factionState;
    window.updateV39ActiveFactionState({units:next.units,squads:next.squads},{reason:'squad-rally'});
    window.refreshV39SquadDerivedUI?.();return true;
  } finally {if(lock)window.endV39MapInputLock?.(lock,'squad-rally');if(move&&app)app.inert=wasInert;}
}
async function command(squadId,action,unitId='',point=null) {
  if(window.isV39MapInputLocked?.())return false;
  const state=window.getV39GameState({includeWorlds:false});
  const result=orderV39SquadMovement(state,state.activePlayerId,squadId,action,unitId,point);
  if(!result.ok){window.showV39TurnBanner?.(result.reason);return false;}
  window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
  window.setV39GameState({players:result.state.players},{reason:'squad-order'});
  if(action==='gather'||action==='follow')await advanceActive();
  window.showV39TurnBanner?.(({gather:'集合を開始しました',follow:'追従へ戻ります',independent:'単独行動に切り替えました',scatter:'部隊を散開しました',cancel:'未到着メンバーの集合を中止しました'})[action]);
  return true;
}
document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-squad-coordination]');if(!button)return;
  if(button.dataset.squadCoordination==='pick') {
    const state=window.getV39GameState({includeWorlds:false});
    if(window.isV39MapInputLocked?.()||state.timeline.phase!=='player')return;
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
    picking={squadId:button.dataset.squadId,unitId:button.dataset.memberId,playerId:state.activePlayerId,worldId:state.activeWorldId||'surface',turn:state.timeline.turnNumber};
    document.getElementById('characterModal')?.classList.remove('open');window.activateV39FooterTab?.('squad');
    window.showV39TurnBanner?.('集合先のマスを選択してください。Escで取消');return;
  }
  void command(button.dataset.squadId,button.dataset.squadCoordination,button.dataset.memberId);
});
window.addEventListener('v39:tile-selected',event=>{
  if(!picking)return;
  const state=window.getV39GameState({includeWorlds:false}),map=window.__v39FieldRuntime?.mapData,request=picking;picking=null;
  if(state.activePlayerId!==request.playerId||(state.activeWorldId||'surface')!==request.worldId||state.timeline.turnNumber!==request.turn||window.isV39MapInputLocked?.())return;
  const {x,y}=event.detail||{};
  if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=map.w||y>=map.h){window.showV39TurnBanner?.('マップ内の集合先を選んでください');return;}
  void command(request.squadId,'gather',request.unitId,{x,y});
});
window.addEventListener('keydown',event=>{if(event.key==='Escape')picking=null;});
for(const type of ['v39:field-generated','v39:save-loaded','v39:turn-phase-changed','v39:player-turn-switched'])window.addEventListener(type,()=>{picking=null;});
window.addEventListener('v39:game-state-changed',event=>{if(['move-command-armed','attack-command-started'].includes(event.detail?.reason))picking=null;});
window.addEventListener('v39:unit-moved',()=>{void advanceActive({move:false});});
window.commandV39SquadMovement=command;
window.advanceV39ActiveSquadRallies=advanceActive;
