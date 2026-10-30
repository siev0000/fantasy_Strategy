import {getV39TeleportEntries,getV39TeleportTargets,inspectV39Teleport,registerV39TeleportLocation,beginV39Teleport,
  isV39ForcedTeleport,getV39TeleportVictims,v39TeleportCastTurns,v39TeleportGateDuration,
  getV39TeleportGates,inspectV39TeleportGateUse,useV39TeleportGate} from '../../lib/v39-teleport-rules.js';
import './v39-teleport-ui.css';
import balance from '../../../../config/v39-teleport.json';

const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
let view=null;
let gateMode='self';
export function renderV39TeleportGateActions(unit,map){
  if(!window.hasV39ActiveTeleportGates?.())return '';
  const state=window.getV39GameState({includeWorlds:false});
  const gates=getV39TeleportGates(state).filter(g=>[g.a,g.b].some(t=>t.x===unit.x&&t.y===unit.y));
  if(!gates.length)return '';
  return `<section class="v39-gate-actions"><label>転移門の利用対象<select data-teleport-gate-mode><option value="self">使用者のみ</option><option value="squad"${gateMode==='squad'?' selected':''}>所属部隊全員</option></select></label>${gates.map(g=>{
    const c=inspectV39TeleportGateUse(state,state.activePlayerId,unit.id,g.id,map,gateMode);
    return `<button type="button" data-teleport-gate-use="${esc(g.id)}" data-teleport-gate-unit="${esc(unit.id)}"${c.available?'':' disabled'}>転移門に入る / 各AP${c.cost}<small>${esc(c.reasons.join(' / ')||`${g.skillName} → (${c.target.x},${c.target.y}) / 残${g.expiresAtTurn-state.timeline.turnNumber}T`)}</small></button>`;
  }).join('')}</section>`;
}
export function renderV39TeleportPanel(unit,map){
  if(!view||view.unitId!==unit.id)return null;
  const state=window.getV39GameState({includeWorlds:false}),playerId=state.activePlayerId;
  if(view.playerId!==playerId){view=null;return null;}
  const targets=getV39TeleportTargets(state,playerId,unit.id);
  const entries=getV39TeleportEntries(unit);
  const victims=view.mode==='other'?getV39TeleportVictims(state,playerId,map):[];
  const selected=targets.find(t=>t.id===view.targetId);
  return `<section class="v39-teleport-panel" data-teleport-unit="${esc(unit.id)}">
    <header><button type="button" data-teleport-back>← スキル</button><b>転移</b></header>
    <label>転移先<select data-teleport-target aria-label="転移先"><option value="">地点を選択</option>${targets.map(t=>`<option value="${esc(t.id)}"${t.id===view.targetId?' selected':''}>${esc(t.name)} (${t.x},${t.y})${t.worldId===(unit.worldId||'surface')?'':'［別マップ］'}</option>`).join('')}</select></label>
    <div class="teleport-register"><input data-teleport-name aria-label="登録地点名" maxlength="40" placeholder="登録地点名" value="${esc(view.name||'')}"/><button type="button" data-teleport-register>${targets.some(t=>!t.base)?'現在地で上書き':'現在地を登録'}</button>${targets.some(t=>!t.base)?'<button type="button" data-teleport-delete>解除</button>':''}</div>
    <label>対象<select data-teleport-mode aria-label="転移対象"><option value="self">使用者のみ</option><option value="squad"${view.mode==='squad'?' selected':''}>所属部隊全員</option>${entries.some(e=>isV39ForcedTeleport(e.row))?`<option value="other"${view.mode==='other'?' selected':''}>相手のみ（抵抗判定）</option>`:''}</select></label>
    ${view.mode==='other'?`<label>転移させる相手<select data-teleport-victim aria-label="転移させる相手"><option value="">相手を選択</option>${victims.map(r=>`<option value="${esc(r.unit.id)}"${view.targetUnitId===r.unit.id?' selected':''}>${esc(r.unit.name||r.unit.id)} (${r.unit.x},${r.unit.y})</option>`).join('')}</select></label>`:''}
    ${unit.pendingTeleport?`<p role="status">${unit.pendingTeleport.interrupted?'被ダメージにより転移が中断されました。':`転移準備中。残り${Math.max(0,unit.pendingTeleport.readyTurn-Number(state.timeline?.turnNumber||1))}ターン。`}</p><button type="button" data-teleport-cancel>転移を中止</button>`:''}
    <div class="teleport-skills">${entries.map(e=>{
      const c=inspectV39Teleport(state,playerId,unit.id,e.row.名前,view.targetId,map,view.mode,{targetUnitId:view.targetUnitId});
      const duration=v39TeleportGateDuration(e.row),turns=v39TeleportCastTurns(e.row);
      return `<button type="button" data-teleport-cast="${esc(e.row.名前)}"${c.available?'':' disabled'}><b>${esc(e.row.名前)}</b><span>射程${c.range}マス / AP${c.cost}${duration?` / 門${duration}T`:''}</span><small>${selected?esc(c.reasons.join(' / ')||`${duration?'門を開く':'転移する'}（準備${turns}ターン）`):'転移先を選択してください'}${e.spec.terrain?` / ${esc(e.spec.terrain)}→${esc(e.spec.terrain)}`:''}${c.resistance?` / 成功率${Math.round(c.resistance.chance*100)}%`:''}</small></button>`;
    }).join('')}</div><p class="teleport-note">地点は全転移スキルで共有。効果時間のある技は双方向の門を残します（利用時に各AP${balance.gateUseAp}）。被ダメージ・移動で準備が中断し、消費APは戻りません。</p>${view.message?`<p role="status">${esc(view.message)}</p>`:''}</section>`;
}
function refresh(){window.refreshV39SquadDerivedUI?.();}
document.addEventListener('input',event=>{if(view&&event.target.matches?.('[data-teleport-name]'))view.name=event.target.value;});
document.addEventListener('change',event=>{
  if(event.target.matches?.('[data-teleport-gate-mode]')){gateMode=event.target.value;refresh();return;}
  if(!view)return;
  if(event.target.matches?.('[data-teleport-target]'))view.targetId=event.target.value;
  else if(event.target.matches?.('[data-teleport-mode]'))view.mode=event.target.value;
  else if(event.target.matches?.('[data-teleport-victim]'))view.targetUnitId=event.target.value;
  else return;
  view.message='';refresh();
});
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  const gate=el?.closest('[data-teleport-gate-use]');
  if(gate){
    if(gate.disabled||window.isV39MapInputLocked?.())return;
    const state=window.getV39GameState(),unitId=gate.dataset.teleportGateUnit;
    if(window.getV39SelectedSquadUnit?.()?.id!==unitId)return;
    const result=useV39TeleportGate(state,state.activePlayerId,unitId,gate.dataset.teleportGateUse,window.__v39FieldRuntime.mapData,gateMode);
    if(result.ok){window.setV39GameState({players:result.state.players},{reason:'teleport-gate-use',returnState:false});window.refreshV39MapEntities?.();}
    else window.showV39TurnBanner?.(result.reason);
    refresh();return;
  }
  const trigger=el?.closest('[data-v39-teleport-open]');
  if(trigger){
    window.cancelV39SelectedUnitMove?.('teleport');window.cancelV39SelectedUnitAttack?.('teleport');
    view={unitId:trigger.dataset.v39TeleportOpen,playerId:window.getV39GameState({includeWorlds:false}).activePlayerId,targetId:'',mode:'self',message:'',name:''};refresh();return;
  }
  if(!view||!el?.closest('.v39-teleport-panel'))return;
  if(el.closest('[data-teleport-back]')){view=null;refresh();return;}
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState({includeWorlds:false}),{playerId,unitId}=view;
  const selected=window.getV39SelectedSquadUnit?.();
  if(state.activePlayerId!==playerId||selected?.id!==unitId){view=null;refresh();return;}
  let result;
  if(el.closest('[data-teleport-register]')||el.closest('[data-teleport-delete]')){
    result=registerV39TeleportLocation(state,playerId,unitId,view.name,!!el.closest('[data-teleport-delete]'));
    if(result.ok){view.targetId=el.closest('[data-teleport-delete]')?'':'memory:1';view.message=el.closest('[data-teleport-delete]')?'登録を解除しました':'現在地を登録しました';}
  }else if(el.closest('[data-teleport-cancel]')){
    result={ok:true,state:{...state,players:state.players.map(p=>p.id!==playerId?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===unitId?{...u,pendingTeleport:null}:u)}})}};view.message='転移を中止しました';
  }else{
    const cast=el.closest('[data-teleport-cast]');if(!cast||cast.disabled)return;
    result=beginV39Teleport(window.getV39GameState(),playerId,unitId,cast.dataset.teleportCast,view.targetId,window.__v39FieldRuntime.mapData,view.mode,view.targetUnitId);
    if(result.ok)view.message='転移を発動しました';
  }
  if(!result)return;
  if(result.ok){window.setV39GameState({players:result.state.players,
    ...(result.state.teleportGates?{teleportGates:result.state.teleportGates}:{}),
    ...(result.state.enemies?{enemies:result.state.enemies}:{}),
    ...(result.state.neutralVillages?{neutralVillages:result.state.neutralVillages}:{}),
    ...(result.state.explorationWorlds?{explorationWorlds:result.state.explorationWorlds}:{})},{reason:'teleport-action',returnState:false});window.appendV39ActivityLog?.(playerId,'転移',view.message);}
  else view.message=result.reason;
  refresh();
});
for(const name of ['v39:save-loaded','v39:unit-selected','v39:local-session-started','v39:multiplayer-session-started'])window.addEventListener(name,()=>{view=null;});
window.addEventListener('v39:game-state-changed',event=>{if(event.detail?.reason==='expedition-test-started')view=null;});
