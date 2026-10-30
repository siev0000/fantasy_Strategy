import {inspectV39ResourceSoulRecovery,inspectV39SoulRecoveryTiles,recoverV39SoulTiles} from '../../lib/v39-soul-recovery.js';
import {showV39Feedback} from '../ui/v39-feedback.js';
import {resolveV39SoulResourceValue} from '../../lib/v39-soul-resource-value.js';

let session=null,lastScene=null,lastOverlay='';
const context=()=>{
  const state=window.getV39GameState?.({includeWorlds:false});
  const player=state?.players?.find(p=>p.id===state.activePlayerId);
  const unit=player?.factionState?.units?.find(u=>u.id===player.factionState.selectedUnitId);
  return {state,player,unit};
};
const scene=()=>window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
const message=text=>showV39Feedback(text,{banner:true});
window.addEventListener('v39:basic-action-changed',event=>{
  if(session&&event.detail?.key!=='mobileSoulRecovery'){cancel();renderV39SoulRecoveryControl();}
});
function cancel(){
  session=null;lastScene?.v39Input?.showActionTiles?.([]);lastScene=null;lastOverlay='';
}
function start(){
  if(window.isV39MapInputLocked?.())return;
  const {state,player,unit}=context(),check=inspectV39ResourceSoulRecovery(state,player?.id,unit?.id);
  if(!check.available){message(check.reason);return;}
  window.cancelV39SelectedUnitMove?.('soul-recovery');window.cancelV39SelectedUnitAttack?.('soul-recovery');
  session={playerId:player.id,unitId:unit.id,worldId:state.activeWorldId||'surface',x:unit.x,y:unit.y,keys:[]};
  renderV39SoulRecoveryControl();
}
function confirm(){
  if(!session||window.isV39MapInputLocked?.())return;
  const {state}=context(),result=recoverV39SoulTiles(state,session.playerId,session.unitId,session.keys);
  if(!result.ok){message(result.reason);renderV39SoulRecoveryControl();return;}
  const playerId=session.playerId;cancel();
  window.setV39GameState?.({players:result.state.players,enemies:result.state.enemies,neutralVillages:result.state.neutralVillages,settlements:result.state.settlements},{reason:'soul-recovered'});
  const summary=`魂 ${resolveV39SoulResourceValue(result.amount)}を回収 / ${result.tileCount}マス / AP-${result.apCost}`;
  window.appendV39ActivityLog?.([playerId],'回収',summary);message(summary);renderV39SoulRecoveryControl();
}
export function handleV39SoulRecoveryTap(tile){
  if(!session)return false;
  if(window.isV39MapInputLocked?.())return true;
  const {state}=context(),key=`${tile.x},${tile.y}`;
  const keys=session.keys.includes(key)?session.keys.filter(k=>k!==key):[...session.keys,key];
  const check=inspectV39SoulRecoveryTiles(state,session.playerId,session.unitId,keys);
  if(!session.keys.includes(key)&&!check.available){message(check.reason);return true;}
  session.keys=keys;renderV39SoulRecoveryControl();return true;
}
export function renderV39SoulRecoveryControl(){
  const root=document.getElementById('mobileSoulRecovery');if(!root)return;
  const {state,player,unit}=context();
  if(session&&(!unit||session.unitId!==unit.id||session.playerId!==player?.id||session.worldId!==(state.activeWorldId||'surface')
    ||unit.x!==session.x||unit.y!==session.y||state.timeline?.phase!=='player'))cancel();
  const base=inspectV39ResourceSoulRecovery(state,player?.id,unit?.id);
  if(session&&!base.eligible)cancel();
  const check=inspectV39SoulRecoveryTiles(state,player?.id,unit?.id,session?.keys||[]);
  root.hidden=!base.eligible;
  document.getElementById('mobileSoulRecoveryAp').textContent=session?`AP ${check.apCost}`:`AP ${base.apCost}/マス`;
  document.getElementById('mobileSoulRecoveryHint').textContent=session?`選択${check.selectedKeys.length}マス / 魂${resolveV39SoulResourceValue(check.amount)}`:`対象${check.tiles.length}マス`;
  document.getElementById('mobileSoulRecoveryReason').textContent=session
    ?check.selectedKeys.length?(check.reason||'選択マスをもう一度タップすると解除できます'):'フィールド上の強調されたマスを選択してください'
    :base.reason||'マス選択を開始し、周囲1マスから回収するマスを選びます';
  const use=document.getElementById('mobileSoulRecoveryUse'),stop=document.getElementById('mobileSoulRecoveryCancel');
  use.textContent=session?'回収確定':'マスを選択';use.disabled=session?!check.available:!base.available;stop.hidden=!session;
  if(!use.dataset.bound){
    use.dataset.bound='1';
    use.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();session?confirm():start();},true);
    stop.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();cancel();renderV39SoulRecoveryControl();},true);
  }
  if(session){
    const active=scene(),signature=JSON.stringify([check.tiles.map(t=>[t.key,t.points]),session.keys]);
    if(active!==lastScene||signature!==lastOverlay){
      if(lastScene!==active)lastScene?.v39Input?.showActionTiles?.([]);
      active?.v39Input?.showActionTiles?.(check.tiles,session.keys);lastScene=active;lastOverlay=signature;
    }
  }
}
window.handleV39SoulRecoveryTap=handleV39SoulRecoveryTap;
window.isV39SoulRecoverySelecting=()=>!!session;
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&session){cancel();renderV39SoulRecoveryControl();}});
document.addEventListener('click',event=>{
  const card=event.target instanceof Element?event.target.closest('[data-v39-technique-name]'):null;
  if(session&&card&&card.dataset.v39TechniqueName!=='__system_soul_recovery__'){cancel();renderV39SoulRecoveryControl();}
},true);
window.addEventListener('v39:map-render-batch-ended',renderV39SoulRecoveryControl);
window.addEventListener('v39:field-layer-changed',()=>{cancel();renderV39SoulRecoveryControl();});
window.addEventListener('v39:footer-tab-changed',event=>{if(event.detail?.tab!=='squad'){cancel();renderV39SoulRecoveryControl();}});
