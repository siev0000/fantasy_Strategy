import fixture from '../../../../config/v39-village-incident-test.json';
import {buildV39UnitEntity} from '../../lib/v39-unit-creation-rules.js';
import {replaceFactionSettlement} from '../../lib/settlement-state.js';
import {receiveV39VillageSacrifice} from '../../lib/v39-village-sacrifice.js';
import {restAtIncidentVillage,startVillageIncidentBattle,finishVillageIncidentBattle,
  replaceIncidentVillage,villageIncidentMode,releaseVillageCaptives} from '../../lib/v39-village-incidents.js';

const testVillage=state=>state?.neutralVillages?.find(row=>row.incidentTest);
const alive=unit=>Number(unit.hp??unit.currentHp)>0&&unit.state!=='死亡';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let message='村の支援依頼・人口報酬の交渉・部隊休息を試せます。';
let scheduled=false;

function start() {
  const created=window.startV39ExpeditionTest?.();if(!created?.ok)return created;
  const state=window.getV39GameState(),first=state.players[0],original=state.neutralVillages[0];
  const build=(id,name,race,level,x,y,squadId)=>({...buildV39UnitEntity({id,name,race,className:'ファイター',level,x,y,squadId,isNamed:true,
    equipment:[{slot:'武器1',name:'剣'},{slot:'体',name:'鎧'}]}),worldId:'surface',testOnly:true});
  const units=[build('village-visitor-1','訪問者1','只人',10,10,5,'village-visitors'),
    build('village-visitor-2','訪問者2','只人',10,10,4,'village-visitors'),build('village-visitor-3','訪問者3','只人',10,11,5,'village-visitors')];
  const demonId='village-test-demon',demonUnit=build('village-demon','契約する悪魔','悪魔',15,11,4,'solo');
  const guards=[build('village-guard-1','村の戦士1','只人',5,9,5,'village-guards'),build('village-guard-2','村の戦士2','只人',5,9,4,'village-guards')]
    .map(unit=>({...unit,count:1,neutral:true,isNeutralVillageGuard:true,neutralVillageId:original.id,ownerNeutralVillageId:original.id}));
  const village={...original,name:'契約・依頼検証村',population:200,populationByRace:{只人:200},incidentTest:true,defenseUnits:guards,
    foodStockByType:{穀物:0,野菜:0,肉:0,魚:0},
    materialStockByType:{...original.materialStockByType,金:100},
    relationsByPlayerId:{[first.id]:0,[demonId]:0},questsByPlayerId:{},heldUnits:[],
    sacrificeContract:{active:false,playerId:demonId,alliedPlayerIds:[]},incidentByPlayerId:{}};
  const visitor={...first,name:'一般プレイヤー',label:'一般側',race:'只人',factionState:{...first.factionState,units,eventDialogueById:{},
    squads:[{id:'village-visitors',label:'訪問部隊',unitIds:units.map(u=>u.id)},{id:'solo',label:'単独',unitIds:[]}],selectedUnitId:units[0].id}};
  const base=structuredClone(first.factionState.settlements[0]);base.id='demon-test-base';base.settlementId=base.id;base.ownerPlayerId=demonId;base.name='悪魔の物資庫';
  const demon={...first,id:demonId,name:'悪魔プレイヤー',label:'悪魔側',race:'悪魔',factionState:{...first.factionState,units:[demonUnit],eventDialogueById:{},
    squads:[{id:'solo',label:'単独',unitIds:[demonUnit.id]}],settlements:[],selectedUnitId:demonUnit.id}};
  demon.factionState=replaceFactionSettlement(demon.factionState,base,{ownerPlayerId:demonId});
  const enemies=[build('village-quest-wolf-1','依頼対象ウルフ1','ウルフ',3,12,5,'village-quest-wolves'),
    build('village-quest-wolf-2','依頼対象ウルフ2','ウルフ',3,12,6,'village-quest-wolves')].map(unit=>({...unit,incidentQuestTarget:true,aggressive:true,strength:1000}));
  const next=replaceIncidentVillage({...state,players:[visitor,demon],enemies,enemySquads:[],enemyNests:[],activePlayerId:first.id,
    timeline:{...state.timeline,phase:'player',playerTurnOrder:[first.id,demonId],activeTurnPlayerId:first.id,endedPlayerIds:[]}},village);
  window.setV39GameState(next,{reason:'village-incident-test-start'});
  window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:village.x,y:village.y,terrain:'平地'}}));
  window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();window.activateV39FooterTab('tile');
  void (async()=>{
    await window.waitForV39MapRenderSettled?.();
    const scene=window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0],marker=window.getV39MapEntityMarker?.(units[0].id);
    if(scene&&marker){scene.cameras.main.setZoom(fixture.previewZoom);scene.cameras.main.centerOn(marker.x,marker.y);}
  })();
  message='一般側/悪魔側とも同じ支援依頼を受注できます。受注前に「報酬の変更を要求」→「人口」で交渉し、達成後の人口移転を確認してください。';render();
  window.openV39VillageMenu?.(village.id);
  return {ok:true};
}
function receive(state,village,playerId) {
  return receiveV39VillageSacrifice(state,playerId,village.id);
}
function run(action) {
  let state=window.getV39GameState(),village=testVillage(state);if(!village)return;
  if(window.isV39MapInputLocked?.()||state.timeline.phase!=='player'){message='処理完了後に操作してください';render();return;}
  const playerId=state.activePlayerId;let result;
  if(action==='visitor'||action==='demon') {
    const id=action==='demon'?village.sacrificeContract.playerId:state.players.find(row=>row.id!==village.sacrificeContract.playerId).id;
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('village-test-switch');
    window.setV39GameState({activePlayerId:id,timeline:{...state.timeline,activeTurnPlayerId:id}},{reason:'village-test-switch'});return;
  }
  if(action==='contract') {
    if(playerId!==village.sacrificeContract.playerId)result={ok:false,reason:'悪魔側で契約してください'};
    else result={ok:true,state:replaceIncidentVillage(state,{...village,sacrificeContract:{...village.sacrificeContract,active:true}}),message:'仮の生贄供給契約を成立させました（威圧交渉の成否判定は別途）'};
  } else if(action==='rest')result=restAtIncidentVillage(state,playerId,village.id,fixture.balance);
  else if(action==='battle')result=startVillageIncidentBattle(state,playerId,village.id,village.defenseUnits||[]);
  else if(action==='victory')result=finishVillageIncidentBattle(state,playerId,village.id);
  else if(action==='receive')result=receive(state,village,playerId);
  else if(action==='escape') {
    const incident=village.incidentByPlayerId?.[playerId];
    result=incident?.status==='choice'&&incident.unitIds.length?{ok:true,state:replaceIncidentVillage(state,{...village,incidentByPlayerId:{...village.incidentByPlayerId,[playerId]:{...incident,status:'escaped'}}}),message:'逃走を選択しました。移動して村を離れられます。拘束者は村に残ります'}:{ok:false,reason:'強襲に耐えたメンバーがいる場合に逃走を選べます'};
  } else if(action==='rescue') {
    if(village.incidentByPlayerId?.[playerId]?.status!=='rescue')result={ok:false,reason:'救援要請がありません'};
    else {
      const updated={...village,sacrificeContract:{...village.sacrificeContract,active:false},relationsByPlayerId:{...village.relationsByPlayerId,[playerId]:Math.min(100,(Number(village.relationsByPlayerId?.[playerId])||0)+fixture.balance.relationGain)}};
      let next=replaceIncidentVillage(state,updated);
      let failure;
      for(const id of state.players.map(row=>row.id)){const freed=releaseVillageCaptives(next,id,village.id);if(!freed.ok){failure=freed;break;}next=freed.state;}
      result=failure?{ok:false,reason:failure.reason}:{ok:true,state:next,message:'仮操作で契約を解除。救援完了 / 友好度+10（解除交渉は未接続）'};
    }
  } else if(action==='low'||action==='high') {
    result={ok:true,state:replaceIncidentVillage(state,{...village,relationsByPlayerId:{...village.relationsByPlayerId,[village.sacrificeContract.playerId]:action==='high'?20:-20}}),message:`テスト設定: 契約先との友好度 ${action==='high'?'+20':'-20'}`};
  } else if(action==='weak'||action==='heal') {
    const player=state.players.find(row=>row.id===playerId);
    result={ok:true,state:{...state,players:state.players.map(row=>row.id!==playerId?row:{...row,factionState:{...player.factionState,
      units:player.factionState.units.map(unit=>({...unit,hp:action==='weak'?1:unit.maxHp,currentHp:action==='weak'?1:unit.maxHp,ap:100,currentAp:100}))}})},message:'テスト用HP/APを変更しました'};
  }
  if(!result)return;
  message=result.ok?result.message:result.reason;
  if(result.ok)window.setV39GameState(result.state,{reason:`village-incident-${action}`});
  window.appendV39ActivityLog?.(playerId,'村イベント',message);window.showV39TurnBanner?.(message);render();
}
function render() {
  const state=window.getV39GameState({includeWorlds:false}),village=testVillage(state),parent=document.getElementById('v39-world-contact-actions');
  let panel=document.getElementById('v39-village-incident-panel');
  if(!village||state.activeWorldId!=='surface'){panel?.remove();return;}
  if(!parent)return;
  if(!panel){panel=document.createElement('section');panel.id='v39-village-incident-panel';panel.style.cssText='grid-column:1/-1;border-top:1px solid #786542;padding-top:6px';parent.append(panel);
    panel.addEventListener('click',event=>{const action=event.target.closest('[data-village-incident]')?.dataset.villageIncident;if(action)run(action);});}
  const playerId=state.activePlayerId,player=state.players.find(row=>row.id===playerId),isDemon=playerId===village.sacrificeContract.playerId;
  const incident=village.incidentByPlayerId?.[playerId];
  const expanded=panel.querySelector('[data-village-incident-values]')?.open;
  const toolsOpen=panel.querySelector('[data-village-incident-tools]')?.open;
  const button=(id,label)=>`<button type="button" data-village-incident="${id}">${label}</button>`;
  const heldLabel=(village.heldUnits||[]).map(row=>`${row.unit.name}: ${row.kind==='captive'?'拘束':'死亡'} / 装備${row.unit.equipment?.length||0}`).join('、');
  const modeLabel={supply:'生贄供給',rescue:'救援要請',none:'事件なし'}[villageIncidentMode(village,fixture.balance)];
  panel.innerHTML=`<details data-village-incident-tools${toolsOpen?' open':''}><summary>テスト操作 / ${escape(player.name)}</summary><p>契約: ${village.sacrificeContract.active?'有効':'なし'} / 悪魔との友好度 ${Number(village.relationsByPlayerId?.[village.sacrificeContract.playerId])||0} / 分岐 ${modeLabel}<br>保管 ${village.heldUnits.length}体<br>受領した捕虜・死体 ${player.factionState.villagePrisoners?.length||0}体${heldLabel?`<br>${escape(heldLabel)}`:''}</p>
    <div class="v39-test-button-row">${button('visitor','一般側')}${button('demon','悪魔側')}${isDemon?button('contract','仮契約を成立')+button('receive','捕虜・装備を受け取る'):button('rest','部隊で休息 AP30')}
    ${incident?.status==='choice'?(incident.unitIds.length?button('battle','反撃して戦闘')+button('escape','逃走'):'全員拘束。別部隊による救援待ち。'):''}${incident?.status==='battle'?button('victory','村の戦闘勝利を報告'):''}${incident?.status==='rescue'?button('rescue','仮操作: 契約解除して救援'):''}</div>
    <details data-village-incident-values${expanded?' open':''}><summary>検証値の操作</summary><div class="v39-test-button-row">${button('high','悪魔との友好度+20')}${button('low','悪魔との友好度-20')}${button('weak','操作側HP1/AP全快')}${button('heal','操作側HP/AP全快')}</div></details>
    <p role="status">${escape(message)}</p><small>報酬の人口は村から受取拠点へ移転。交渉・脅迫はAP20。強襲発生率100%、基準威力160。実戦時の兵はフィールドに出現します。</small></details>`;
}
window.startV39VillageIncidentTest=start;
const style=document.createElement('style');style.textContent='#v39-village-incident-panel{font-size:var(--font-body);overflow-wrap:anywhere}#v39-village-incident-panel .v39-test-button-row{display:flex;flex-wrap:wrap;gap:4px}#v39-village-incident-panel button{font:inherit;color:#ffe6a0;background:#493a18;border:1px solid #d4af58;border-radius:6px;padding:6px;min-height:34px}#v39-village-incident-panel small{font-size:var(--font-secondary)}';document.head.append(style);
window.addEventListener('v39:game-state-changed',()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;render();});});
window.addEventListener('v39:tile-selected',()=>requestAnimationFrame(render));
window.addEventListener('v39:village-menu-opened',render);
