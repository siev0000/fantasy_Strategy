import {configureLogisticsRoute,controlLogisticsRoute,advanceLogisticsRoutes,logisticsEndpoints,logisticsGroups,logisticsPath,V39_LOGISTICS_RESOURCES} from '../../lib/v39-logistics-routes.js';
import {resolveV39AutomaticRoute,getV39TransportCargo,configureV39TransportRoute,setV39UnitTransportAssignment} from '../../lib/v39-transport-rules.js';
import {resolveV39MineRoute} from '../../lib/v39-cave-operations.js';
import {listV39Trades,tradeBank,getTradeCargo} from '../../lib/v39-trade-state.js';
import {resolveV39TradeMovementPath} from '../../lib/v39-trade-logistics.js';

import {updateV39RetainedMarkup} from '../ui/v39-retained-markup.js';
import {HEX_TILE_CONFIG as hex} from '../../lib/phaser-map-panel-config.js';
import './v39-logistics-ui.css';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected='',filter='all',active=false,queued=false,layer=null,modal=null,message='';
function snapshot(capture=false){
  const s=window.getV39GameState({includeWorlds:false}),id=s.activeWorldId||'surface';
  const worlds=capture?window.captureV39ExplorationWorlds?.():window.getV39EnemyTurnState?.().explorationWorlds;
  const spatial={...worlds?.[id]?.spatial,...Object.fromEntries(['territoryOwnerByTile','territoryStateByTile','facilitiesByTile','enemies','enemySquads','enemyNests','neutralVillages','settlements','groundLootByTile'].map(key=>[key,s[key]]))};
  return {...s,explorationWorlds:{...worlds,[id]:{...worlds?.[id],map:window.__v39FieldRuntime?.mapData,spatial}}};
}
const own=s=>s.players.find(p=>p.id===s.activePlayerId)?.factionState;
const goods=bag=>Object.entries(bag||{}).filter(([,n])=>n>0).map(([name,n])=>`${name} ${Math.round(n*10)/10}`).join(' / ')||'空荷';
const statusText=status=>({'delivering':'搬送中','returning':'帰還中','waiting-stock':'物資待ち','waiting-unit':'味方の移動待ち','blocked':'停止','paused':'中断中','awaiting-route':'経路未設定','ready':'準備完了','outbound':'取引地点へ移動','waiting':'交換待ち'}[status]||status||'設定待ち');
const center=p=>({x:p.x*hex.width+(p.y%2?hex.oddRowOffsetX:0)+hex.width/2,y:p.y*hex.rowStep+hex.height/2});
function rows(s){
  const f=own(s);if(!f)return [];
  const ends=logisticsEndpoints(s,s.activePlayerId),result=(f.logisticsRoutes||[]).map(r=>({...r,kind:'route',unit:f.units.find(u=>u.id===r.leaderId),
    from:ends.find(e=>e.id===r.sourceId)?.name||'運搬元なし',to:ends.find(e=>e.id===r.destinationId)?.name||'搬送先なし',cargo:getV39TransportCargo(f,r.leaderId).resourcesByType}));
  for(const u of f.units){
    if(u.transportAssignment?.logisticsRouteId)continue;
    const d=u.caveDuty||u.transportAssignment;if(!d||u.caveDuty?.duty==='guard')continue;
    result.push({id:`legacy:${u.id}`,kind:'legacy',name:u.name,unit:u,enabled:u.caveDuty?!d.paused:d.enabled,status:statusText(d.status),reason:d.reason,
      from:u.caveDuty?s.explorationWorlds?.[d.mineWorldId]?.map?.caveMine?.name||'洞窟鉱床':f.settlements.find(b=>(b.settlementId||b.id)===d.originSettlementId)?.name||'拠点',
      to:f.settlements.find(b=>(b.settlementId||b.id)===(d.settlementId||d.destinationSettlementId))?.name||'搬送先未設定',cargo:d.cargo||getV39TransportCargo(f,u.id).resourcesByType,memberIds:[u.id]});
  }
  for(const c of listV39Trades(s))for(const side of c.sides.filter(side=>side.kind==='player'&&side.partyId===s.activePlayerId&&side.unitId)){
    const u=f.units.find(u=>u.id===side.unitId);if(!u||u.tradeAssignment?.contractId!==c.id)continue;
    result.push({id:`trade:${c.id}`,kind:'trade',contract:c,side,unit:u,name:`${c.mode==='mail'?'郵送':'貿易'} / ${u.name}`,memberIds:side.memberIds,status:side.stage||c.status,reason:side.reason||c.reason,enabled:u.tradeAssignment.automatic,from:tradeBank(s,side)?.name||'拠点',to:'取引地点',cargo:getTradeCargo(s,side).resourcesByType});
  }
  return result;
}
function routePath(s,row){
  if(!row.unit)return null;
  if(row.kind==='route')return logisticsPath(s,s.activePlayerId,row);
  const u=row.unit,d=u.caveDuty||u.transportAssignment,id=u.worldId||'surface',map=s.explorationWorlds?.[id]?.map;
  let target;
  if(row.kind==='trade'){
    const path=row.side.stage==='waiting'?[]:resolveV39TradeMovementPath(s,row.side,row.contract,map,['returning','collecting'].includes(row.side.stage));
    return {leg:{worldId:id},path};
  }else if(u.caveDuty){
    const chain=resolveV39MineRoute(s.explorationWorlds,d.mineWorldId),i=chain?.findIndex(e=>e.id===id);
    target=i>=0?(d.leg==='home'?(i===0?own(s).settlements.find(b=>(b.settlementId||b.id)===d.settlementId):chain[i].backward):chain[i].forward):null;
  }else target=own(s).settlements.find(b=>(b.settlementId||b.id)===(d.leg==='outbound'?d.destinationSettlementId:d.originSettlementId));
  if(!map||!target)return null;
  return {leg:{worldId:id,target},path:resolveV39AutomaticRoute({...s,...s.explorationWorlds[id].spatial,players:s.players},map,s.activePlayerId,u,target,map.worldWrapEnabled===true,row.memberIds)};
}
function clearLayer(){layer?.destroy();layer=null;}
function drawRoutes(s,all){
  clearLayer();if(!active)return;
  const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];if(!scene)return;
  layer=scene.add.container(0,0).setDepth(15).setName('v39-logistics-routes');
  for(const row of all){
    if(!row.unit||(row.unit.worldId||'surface')!==(s.activeWorldId||'surface'))continue;
    const resolved=routePath(s,row),path=resolved?.path,highlight=row.id===selected,color=highlight?0xf1d36b:0x62bac7;
    const g=scene.add.graphics().lineStyle(highlight?3:1.5,color,highlight?0.95:0.45).setName('v39-logistics-route-line');g.setData('routeId',row.id);g.setData('path',(path||[]).map(p=>({x:p.x,y:p.y})));layer.add(g);
    let previous=row.unit,visibleSegments=0;
    for(const step of path||[]){
      if(window.isV39TestMode?.()||window.isV39TileExplored?.(previous.x,previous.y)&&window.isV39TileExplored?.(step.x,step.y)){
        visibleSegments++;
        const a=center(previous),b=center(step);g.lineBetween(a.x,a.y,b.x,b.y);
        const angle=Math.atan2(b.y-a.y,b.x-a.x),size=5,x=(a.x+b.x)/2,y=(a.y+b.y)/2;
        g.lineBetween(x,y,x-size*Math.cos(angle-.5),y-size*Math.sin(angle-.5));g.lineBetween(x,y,x-size*Math.cos(angle+.5),y-size*Math.sin(angle+.5));
      }previous=step;
    }
    g.setData('visibleSegments',visibleSegments);
    const stopped=/停止|塞が|blocked/.test(`${row.status} ${row.reason}`)||!path&&!resolved?.unresolved;
    const waiting=!row.enabled||/待ち|待機|中断/.test(row.status||'')||path?.waitingForFriendlyUnitId;
    if(stopped||waiting){
      const p=center(path?.waitingForFriendlyUnitId&&path.length?path.at(-1):row.unit);
      const label=scene.add.text(p.x,p.y-hex.height*.25,stopped?'×':'Ⅱ',{fontSize:'22px',fontStyle:'bold',color:stopped?'#ff7777':'#f1d36b',stroke:'#122027',strokeThickness:4}).setOrigin(.5).setInteractive();
      label.setName('v39-logistics-stop');label.setData('routeId',row.id);label.on('pointerdown',()=>{selected=row.id;message=row.reason||row.status||'経路を確認してください';render();});layer.add(label);
    }
    const p=center(row.unit);g.fillStyle(color,1).fillCircle(p.x,p.y,3);
  }
}
function render(){
  const panel=document.getElementById('footLogistics');if(!panel||!active)return;
  const s=snapshot(),all=rows(s),visible=all.filter(r=>filter==='all'||filter==='active'&&r.enabled||filter==='paused'&&!r.enabled);
  if(!visible.some(r=>r.id===selected))selected=visible[0]?.id||'';
  const row=visible.find(r=>r.id===selected);
  updateV39RetainedMarkup(panel,`<header><b>物流</b><select data-logistics-filter aria-label="物流の絞り込み">${[['all','すべて'],['active','稼働中'],['paused','中断・完了']].map(([id,name])=>`<option value="${id}"${id===filter?' selected':''}>${name}</option>`).join('')}</select><button data-logistics-new>運搬を設定</button></header>
    <div class="logistics-panes"><div class="logistics-list">${visible.map(r=>`<button data-logistics-select="${esc(r.id)}" aria-pressed="${r.id===selected}"><b>${esc(r.name)}</b><small>${esc(r.from)} → ${esc(r.to)}</small><span>${esc(statusText(r.status))}</span><small>${esc(goods(r.cargo))}</small></button>`).join('')||'<p>輸送任務がありません。</p>'}</div><div class="logistics-detail">${row?`<h3>${esc(row.name)}</h3><p>${esc(row.from)} → ${esc(row.to)}</p><p>${esc(statusText(row.status))}${row.reason?` / ${esc(row.reason)}`:''}</p><p>積荷：${esc(goods(row.cargo))}</p>${row.kind==='route'?`<p>${esc(row.resource)} × ${row.amount} / ${row.repeat?'自動往復':'片道'} / ${row.memberIds.length}体</p><div class="logistics-controls"><button data-logistics-control="${row.enabled?'pause':'resume'}">${row.enabled?'中断':'再開'}</button><button data-logistics-control="return">帰還</button><button data-logistics-control="remove">任務解除</button></div>`:row.kind==='legacy'?'<p>既存のユニット任務</p><button data-logistics-legacy>中断・再開</button><button data-logistics-legacy-remove>任務解除</button>':'<button data-logistics-trade>取引画面を開く</button>'}<p class="logistics-hint">地図は現在の世界の経路を表示。矢印＝進行方向、×＝停止、Ⅱ＝待機。未探索区間は表示しません。</p>${row.unit?`<p>現在地：${(row.unit.worldId||'surface')==='surface'?'地上':'洞窟'} (${row.unit.x},${row.unit.y})</p><details><summary>担当 ${row.memberIds.length}体</summary>${row.memberIds.map(id=>`<p>${esc(own(s).units.find(u=>u.id===id)?.name||'不在')}</p>`).join('')}</details>`:''}`:'<p>任務を選ぶと物資と経路を確認できます。</p>'}</div></div><output>${esc(message)}</output>`,{preserveInput:true});
  drawRoutes(s,visible);
}
function closeModal(){document.getElementById('v39-logistics-dialog')?.remove();if(modal?.lock!==undefined)window.endV39MapInputLock?.(modal.lock);modal=null;}
function openModal(){
  if(window.isV39MapInputLocked?.())return;
  const s=snapshot(),f=own(s);if(!f)return;
  const ends=logisticsEndpoints(s,s.activePlayerId),groups=logisticsGroups(f);
  modal={playerId:s.activePlayerId,turn:s.timeline.turnNumber,world:s.activeWorldId,lock:window.beginV39MapInputLock?.('logistics-settings')};
  const root=document.createElement('div');root.id='v39-logistics-dialog';
  const options=values=>values.map(v=>`<option value="${esc(v.id)}">${esc(v.name)}</option>`).join('');
  root.innerHTML=`<form role="dialog" aria-modal="true" aria-label="運搬設定"><header><h3>運搬を設定</h3><button type="button" data-logistics-modal-close>戻る</button></header><div class="logistics-fields"><label>担当部隊・単独<select name="groupId">${options(groups)}</select></label><label>運搬元<select name="sourceId">${options(ends)}</select></label><label>搬送先<select name="destinationId">${options(ends.filter(e=>e.kind==='settlement'))}</select></label><label>物資<select name="resource">${V39_LOGISTICS_RESOURCES.map(r=>`<option>${esc(r)}</option>`).join('')}</select></label><label>1回の上限数<input name="amount" type="number" min="1" value="10" required></label><label>運び方<select name="repeat"><option value="true">自動往復</option><option value="false">片道</option></select></label></div><p>部隊は周囲2マス以内へ集合。部隊員全員のAP・通行条件・積載量を使用します。1回の運搬量は部隊の積載上限まで。設定変更は帰還・荷下ろし後に任務解除して再設定してください。</p><output></output><footer><button type="submit">運搬開始</button></footer></form>`;
  document.body.append(root);
  if(ends.filter(e=>e.kind==='settlement').length>1)root.querySelector('[name=destinationId]').selectedIndex=1;
  root.querySelector('form').addEventListener('submit',event=>{
    event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));data.repeat=data.repeat==='true';
    const current=snapshot(true),result=configureLogisticsRoute(current,current.activePlayerId,data);
    if(!result.ok){root.querySelector('output').textContent=result.reason;return;}
    window.setV39GameState({players:result.state.players},{reason:'logistics-route-configured'});selected=result.route.id;closeModal();message='運搬任務を設定しました';render();
  });
}
function schedule(){if(queued||!active)return;queued=true;requestAnimationFrame(()=>{queued=false;render();});}
document.addEventListener('click',event=>{
  const el=event.target instanceof Element?event.target:null;
  if(el?.closest('[data-logistics-modal-close]')){closeModal();return;}
  if(el?.closest('[data-logistics-new]')){openModal();return;}
  if(!el?.closest('#footLogistics'))return;
  const s=snapshot(true),row=rows(s).find(r=>r.id===selected),button=el.closest('[data-logistics-select]');
  if(button){selected=button.dataset.logisticsSelect;message='';const u=rows(s).find(r=>r.id===selected)?.unit;
    if(u&&(u.worldId||'surface')===(s.activeWorldId||'surface')){
      const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0],route=rows(s).find(r=>r.id===selected),points=[u,...(routePath(s,route)?.path||[])].map(center);
      if(scene){const xs=points.map(p=>p.x),ys=points.map(p=>p.y),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys),camera=scene.cameras.main;
        const zoom=Math.max(scene.v39FitZoom||.1,Math.min(1.2,camera.width/(right-left+hex.width*3),camera.height/(bottom-top+hex.height*3)));
        camera.setZoom(zoom);scene.v39RequestedZoom=zoom;camera.centerOn((left+right)/2,(top+bottom)/2);}
    }render();return;}
  const control=el.closest('[data-logistics-control]');
  if(control&&row){const result=controlLogisticsRoute(s,s.activePlayerId,row.id,control.dataset.logisticsControl);message=result.ok?'任務を更新しました':result.reason;if(result.ok)window.setV39GameState({players:result.state.players},{reason:'logistics-route-control'});render();}
  if(el.closest('[data-logistics-trade]'))window.openV39TradeModal?.('','contracts');
  if(el.closest('[data-logistics-legacy-remove]')&&row){
    const u=row.unit,result=u.caveDuty?window.assignV39MineDuty?.(u.id,'none'):setV39UnitTransportAssignment(s,s.activePlayerId,u.transportAssignment.originSettlementId,u.id,false);
    if(result?.ok&&!u.caveDuty)window.setV39GameState({players:result.state.players},{reason:'logistics-legacy-removed'});message=result?.ok?'任務を解除しました':result?.reason||'解除できません';render();
  }
  if(el.closest('[data-logistics-legacy]')&&row){
    const f=own(s),u=row.unit;
    if(u.caveDuty)window.setV39GameState({players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:f.units.map(v=>v.id===u.id?{...v,caveDuty:{...v.caveDuty,paused:!v.caveDuty.paused,status:!v.caveDuty.paused?'中断中':'再開'}}:v)}}:p)},{reason:'logistics-legacy-control'});
    else{const d=u.transportAssignment,result=configureV39TransportRoute(s,s.activePlayerId,u.id,d.destinationSettlementId,d.resource,!d.enabled);if(result.ok)window.setV39GameState({players:result.state.players},{reason:'logistics-legacy-control'});else message=result.reason;}render();
  }
});
document.addEventListener('change',event=>{if(event.target.matches?.('[data-logistics-filter]')){filter=event.target.value;render();}});
window.addEventListener('keydown',event=>{if(event.key==='Escape')closeModal();});
window.addEventListener('v39:footer-tab-changed',event=>{active=event.detail?.tab==='logistics';if(active){window.cancelV39SelectedUnitMove?.('logistics');window.cancelV39SelectedUnitAttack?.('logistics');render();}else clearLayer();});
window.addEventListener('v39:game-state-changed',event=>{if(event.detail?.reason==='activity-log')return;
  if(modal){const s=window.getV39GameState({includeWorlds:false});if(s.activePlayerId!==modal.playerId||s.timeline.turnNumber!==modal.turn||s.activeWorldId!==modal.world)closeModal();}schedule();});
window.addEventListener('v39:field-generated',()=>{closeModal();clearLayer();schedule();});
window.addEventListener('v39:visibility-rendered',schedule);
window.advanceV39LogisticsRoutes=(playerId,turn)=>{
  if(!window.getV39EnemyTurnState?.().players.find(p=>p.id===playerId)?.factionState.logisticsRoutes?.some(r=>r.enabled&&!(r.lastProcessedTurn>=turn)))return;
  const s=snapshot(true),next=advanceLogisticsRoutes(s,playerId,turn);if(next===s)return;
  const map=next.explorationWorlds?.[next.activeWorldId||'surface']?.map;
  if(map?.caveMine)window.__v39FieldRuntime.mapData.caveMine=map.caveMine;
  window.setV39GameState({players:next.players,explorationWorlds:next.explorationWorlds},{reason:'logistics-route-advanced'});
};
window.getV39LogisticsState=()=>snapshot(true);
