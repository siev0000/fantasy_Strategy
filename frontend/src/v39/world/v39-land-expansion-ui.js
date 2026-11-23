import { getSelectedSettlement,getFactionSettlements,getFactionSettlementById,selectFactionSettlement } from "../../lib/settlement-state.js";
import { V39_LAND_EXPANSION_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { getV39LandExpansionCandidates, inspectV39LandExpansion, startV39LandExpansion, cancelV39LandExpansion } from "../../lib/v39-land-expansion-rules.js";
import {usesV39OperationPhases,isV39TerritoryPhase} from '../../lib/v39-operation-phases.js';
import {queueV39OperationPlan,editV39OperationPlan,projectV39OperationTerritory} from '../../lib/v39-operation-plans.js';
import {renderV39OperationPlans} from './v39-operation-plan-ui.js';
import {inspectV39SettlementDevelopment} from '../../lib/v39-economy-rules.js';
import {renderV39ScreenHelp} from '../ui/v39-screen-help.js';
import {V39_SCREEN_HELP_COPY} from '../ui/v39-screen-help-copy.js';

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
let selection = null;
let graphics = null;
let orderLabels=[];

const fixedPlacement = () => window.v39FixedMapPlacement;
const fixedExpansion = base => ({kind:'territory',baseKey:`${base.x},${base.y}`});
function fixedExpansionCandidates(map, base) {
  return (map?.grid ?? []).flatMap((row,y) => row.flatMap((_,x) => {
    const tile = {x,y};
    return fixedPlacement().inspect(tile,fixedExpansion(base)).ok ? [tile] : [];
  }));
}

export function inspectV39LandExpansionEntry(state,player,tile,map){
  const bases=getFactionSettlements(player?.factionState).filter(base=>base.placed);
  if(fixedPlacement()){
    const base=getSelectedSettlement(player?.factionState) ?? bases[0];
    const result=base ? fixedPlacement().inspect(tile,fixedExpansion(base)) : {ok:false,reason:'配置済みの拠点がありません'};
    return {check:{...result,settlement:base,workers:0,totalTurns:0},reason:result.reason,available:result.ok};
  }
  const checks=bases.map(base=>inspectV39LandExpansion(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,base):state,player.id,base.settlementId,tile,map));
  const selected=getSelectedSettlement(player?.factionState)?.settlementId;
  const check=checks.find(row=>row.ok&&row.settlement.settlementId===selected)||checks.find(row=>row.ok)||checks.find(row=>row.settlement?.settlementId===selected)||checks[0];
  const pending=bases.flatMap(base=>(base.landExpansionProjects||[]).filter(project=>project.tileKey===`${tile?.x},${tile?.y}`).map(project=>({base,project})))[0];
  const reason=state?.activeWorldId&&state.activeWorldId!=='surface'?'地上の土地を選択してください':state?.timeline?.phase!=='player'?'自分の操作ターンに開拓してください':usesV39OperationPhases(state)&&!isV39TerritoryPhase(state)?'領土運営フェーズで予約してください':check?.reason||(!check?'配置済みの拠点がありません':'');
  return {check,pending,reason,available:!!check?.ok&&!reason};
}

export function renderV39LandExpansionEntry(state,player,tile,map){
  if(!tile||!player)return '';
  const entry=inspectV39LandExpansionEntry(state,player,tile,map);
  if(entry.pending){
    const {base,project}=entry.pending;
    return `<b>開拓中 / 残り${project.remainingTurns}T</b><button type="button" class="settlement-chip" data-expansion-action="cancel" data-expansion-settlement="${escapeHtml(base.settlementId)}" data-expansion-key="${escapeHtml(project.tileKey)}">開拓を中止</button>`;
  }
  if(state.territoryOwnerByTile?.[`${tile.x},${tile.y}`])return '';
  return `<button type="button" class="settlement-chip" data-expansion-action="tile" data-expansion-x="${tile.x}" data-expansion-y="${tile.y}"${entry.available?'':' disabled'}>領土に加える</button><small>${escapeHtml(entry.available?`${entry.check.settlement.name||'拠点'} / ${fixedPlacement()?'即時':`${entry.check.workers}人・${entry.check.totalTurns}T`}`:entry.reason)}</small>`;
}

function context() {
  const state = window.getV39GameState?.({includeWorlds:false});
  const player = state?.players?.find(row => row.id === state.activePlayerId);
  return { state, player, settlement:getSelectedSettlement(player?.factionState), map:window.__v39FieldRuntime?.mapData };
}

function clearSelection() {
  const wasSelecting=Boolean(selection);
  selection = null;
  graphics?.destroy(); graphics = null;
  for(const label of orderLabels)label.destroy();orderLabels=[];
  if(wasSelecting)window.dispatchEvent(new Event('v39:territory-guide-selection-changed'));
}

function drawCandidates(tiles) {
  graphics?.destroy(); graphics = null;
  for(const label of orderLabels)label.destroy();orderLabels=[];
  const scene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if (!scene) return;
  graphics = scene.add.graphics().setDepth(19);
  const { width, height, rowStep, oddRowOffsetX } = HEX_TILE_CONFIG;
  for (const tile of tiles) {
    const left = tile.x * width + (tile.y % 2 ? oddRowOffsetX : 0), top = tile.y * rowStep;
    const points = [{ x:left+width/2,y:top }, { x:left+width,y:top+height-rowStep },
      { x:left+width,y:top+rowStep }, { x:left+width/2,y:top+height },
      { x:left,y:top+rowStep }, { x:left,y:top+height-rowStep }];
    graphics.fillStyle(0xe8cf58, 0.22).fillPoints(points, true);
    graphics.lineStyle(2, 0xe8cf58, 0.85).strokePoints(points, true);
  }
  if(typeof scene.add.text==='function'){
    const base=context().settlement;
    for(const [index,plan] of (base?.operationPlans||[]).filter(plan=>plan.kind==='expansion').entries()){
      const {x,y}=plan.tile;
      const label=scene.add.text(x*width+(y%2?oddRowOffsetX:0)+width/2,y*rowStep+height/2,String(index+1),{fontSize:'16px',fontStyle:'bold',color:'#ffe29a',backgroundColor:'#11232b',padding:{x:4,y:2}}).setOrigin(.5).setDepth(20);
      orderLabels.push(label);
    }
  }
}

export function renderV39LandExpansionControls(state, player, settlement) {
  const map = window.__v39FieldRuntime?.mapData;
  if(fixedPlacement()){
    if(selection && (selection.playerId !== player.id || selection.settlementId !== settlement.settlementId)) clearSelection();
    const check=selection?.tile && fixedPlacement().inspect(selection.tile,fixedExpansion(settlement));
    return `<header class="v39-expansion-heading"><strong>領土拡張</strong></header>
      <p class="v39-expansion-purpose">地図で土地を選ぶと、費用・工期なしで領土に加えられます。</p>
      <div class="settlement-chip-list"><button type="button" class="settlement-chip" data-expansion-action="choose">${selection?'選択解除':'土地を選ぶ'}</button></div>
      ${check?`<div class="settlement-inline-facts"><b>(${selection.tile.x},${selection.tile.y})</b>
        <span>${escapeHtml(check.reason||'即時')}</span><button type="button" class="settlement-chip" data-expansion-action="start"${check.ok?'':' disabled'}>領土に加える</button></div>`:''}`;
  }
  if(selection?.playerId===player.id&&selection.settlementId!==settlement.settlementId&&isV39TerritoryPhase(state)){
    selection={playerId:player.id,settlementId:settlement.settlementId,tile:null};
  }else if(selection&&(selection.playerId!==player.id||selection.settlementId!==settlement.settlementId))clearSelection();
  if(selection&&isV39TerritoryPhase(state))drawCandidates(getV39LandExpansionCandidates(projectV39OperationTerritory(state,player.id,settlement),player.id,settlement.settlementId,map));
  const projects = settlement.landExpansionProjects || [];
  const rows = projects.map(project => {
    const [x,y] = project.tileKey.split(",").map(Number);
    const check = inspectV39LandExpansion(state, player.id, settlement.settlementId, { x,y }, map, { project });
    return `<div class="settlement-inline-facts"><b>${escapeHtml(project.tileKey)} / 残り${project.remainingTurns}T</b><span>${check.ok ? `開拓 ${project.workers}人` : `停止: ${escapeHtml(check.reason)}`}</span><button type="button" class="settlement-chip" data-expansion-action="cancel" data-expansion-key="${escapeHtml(project.tileKey)}">中止</button></div>`;
  }).join("");
  let target = "";
  if (selection?.tile) {
    const check = inspectV39LandExpansion(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,settlement):state, player.id, settlement.settlementId, selection.tile, map);
    const bases=getFactionSettlements(player.factionState).filter(base=>base.placed);
    target = `<label>編入先 <select data-expansion-base>${bases.map(base=>`<option value="${escapeHtml(base.settlementId)}"${base.settlementId===settlement.settlementId?' selected':''}>${escapeHtml(base.name||base.type||'拠点')}</option>`).join('')}</select></label><div class="settlement-inline-facts"><b>${escapeHtml(check.key)}</b><span>${check.ok ? `${check.workers}人 / ${check.totalTurns}T / 資材消費なし` : escapeHtml(check.reason)}</span><button type="button" class="settlement-chip" data-expansion-action="start"${check.ok ? "" : " disabled"}>${usesV39OperationPhases(state)?"計画に追加":"開拓開始"}</button></div>`;
  }
  const canChoose = isV39TerritoryPhase(state)||projects.length < V39_LAND_EXPANSION_BALANCE.maxProjects;
  const phased=usesV39OperationPhases(state);
  const labor=`着手すると担当${V39_LAND_EXPANSION_BALANCE.workers}人が生産を離れ、${V39_LAND_EXPANSION_BALANCE.turns}ターンかけて開拓します。停止中は担当者が生産へ戻ります。`;
  const development=inspectV39SettlementDevelopment(state,player.id,settlement.settlementId);
  const available=state.timeline?.phase==='player'&&(!phased||isV39TerritoryPhase(state));
  const canReserve=available&&phased&&!!development.next&&!development.project;
  const canDevelop=available&&(development.available||canReserve);
  const developmentStatus=!available?(phased?'開発フェーズで操作できます。':'自分のターンに操作できます。'):!development.available
    ? [development.reason,canReserve?'予約可・着手条件未達':''].filter(Boolean).join(' ／ ')
    : '';
  const reservationCount=(settlement.operationPlans||[]).filter(plan=>plan.kind==='expansion').length;
  const copy=V39_SCREEN_HELP_COPY.expansion;
  const help=renderV39ScreenHelp('領土拡張',[
    ['領土拡張',phased?copy.plan:copy.start],
    ...copy.order,
    ['担当人数',labor],
    ['拠点発展',copy.develop+developmentStatus]
  ]);
  const header=`<header class="v39-expansion-heading"><strong>${phased?`拡張順 ${reservationCount}件`:'領土拡張'}</strong><button type="button" class="settlement-chip" data-settlement-development${canDevelop?'':' disabled'}>拠点発展</button>${help}</header>
    <p class="v39-expansion-purpose">資源の採取や建築に使える土地を増やします。</p>
    ${developmentStatus?`<small class="v39-expansion-development-status">${escapeHtml(developmentStatus)}</small>`:''}`;
  return `${header}${phased?renderV39OperationPlans(state,player,settlement,{scope:'expansion',showFinish:false}):''}${target}${rows}${phased?'':`<div class="settlement-chip-list"><button type="button" class="settlement-chip" data-expansion-action="choose"${canChoose ? "" : " disabled"}>${selection ? "選択解除" : "土地を選ぶ"}</button></div>`}${selection&&!isV39TerritoryPhase(state) ? '<div class="settlement-empty">地図の黄色の土地を選択</div>' : ""}`;
}

function selectBase(player,id){
  if(getSelectedSettlement(player.factionState)?.settlementId===id)return;
  const state=window.getV39GameState({includeWorlds:false});
  window.setV39GameState({players:state.players.map(row=>row.id===player.id?{...row,factionState:selectFactionSettlement(row.factionState,id)}:row)},{reason:'expansion-base-selected'});
}

function appendExpansionTile(state,player,settlement,tile,map){
  const key=`${tile.x},${tile.y}`;
  const queued=settlement.operationPlans?.find(plan=>plan.kind==='expansion'&&`${plan.tile.x},${plan.tile.y}`===key);
  if(queued){
    const removed=editV39OperationPlan(state,player.id,settlement.settlementId,queued.id,'cancel');
    if(!removed.ok){window.showV39TurnBanner?.(removed.reason);return false;}
    window.setV39GameState({players:removed.state.players},{reason:'expansion-unplanned'});
    window.renderV39SettlementPanel?.();return true;
  }
  const check=inspectV39LandExpansion(projectV39OperationTerritory(state,player.id,settlement),player.id,settlement.settlementId,tile,map);
  if(!check.ok){window.showV39TurnBanner?.(check.reason);return false;}
  const result=queueV39OperationPlan(state,player.id,settlement.settlementId,{kind:'expansion',tile});
  if(!result.ok){window.showV39TurnBanner?.(result.reason);return false;}
  selection={playerId:player.id,settlementId:settlement.settlementId,tile:null};
  window.dispatchEvent(new Event('v39:territory-guide-selection-changed'));
  window.setV39GameState({players:result.state.players},{reason:'expansion-planned'});
  const base=getFactionSettlementById(result.state.players.find(row=>row.id===player.id).factionState,settlement.settlementId);
  drawCandidates(getV39LandExpansionCandidates(projectV39OperationTerritory(result.state,player.id,base),player.id,base.settlementId,map));
  window.renderV39SettlementPanel?.();return true;
}

export function beginV39LandExpansionSelection(){
  const {state,player,settlement,map}=context();
  if(!settlement||!isV39TerritoryPhase(state)||state.timeline?.phase!=='player')return false;
  selection={playerId:player.id,settlementId:settlement.settlementId,tile:null};
  drawCandidates(getV39LandExpansionCandidates(projectV39OperationTerritory(state,player.id,settlement),player.id,settlement.settlementId,map));
  window.renderV39SettlementPanel?.();return true;
}
window.beginV39LandExpansionSelection=beginV39LandExpansionSelection;
window.clearV39LandExpansionSelection=clearSelection;
window.isV39LandExpansionSelecting=()=>Boolean(selection);

document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-expansion-action]") : null;
  if (!button || window.isV39MapInputLocked?.()) return;
  let { state, player, settlement, map } = context();
  if(button.dataset.expansionSettlement)settlement=getFactionSettlementById(player?.factionState,button.dataset.expansionSettlement);
  if (!settlement || state.timeline?.phase !== "player") return;
  const action = button.dataset.expansionAction;
  if(fixedPlacement()){
    if(action==='open'||action==='tile'){
      window.openV39SettlementExpansion?.();
      const tile=action==='tile'?{x:Number(button.dataset.expansionX),y:Number(button.dataset.expansionY)}:null;
      selection={playerId:player.id,settlementId:settlement.settlementId,tile};
      drawCandidates(fixedExpansionCandidates(map,settlement));
    }else if(action==='choose'){
      if(selection)clearSelection();
      else{
        selection={playerId:player.id,settlementId:settlement.settlementId,tile:null};
        drawCandidates(fixedExpansionCandidates(map,settlement));
      }
    }else if(action==='start'&&selection?.tile){
      const result=fixedPlacement().place(selection.tile,fixedExpansion(settlement));
      if(!result.ok){window.showV39TurnBanner?.(result.reason);return;}
      selection.tile=null;
      drawCandidates(fixedExpansionCandidates(map,settlement));
    }
    window.renderV39SettlementPanel?.();
    return;
  }
  if(usesV39OperationPhases(state)&&!isV39TerritoryPhase(state)&&action!=='open'){window.showV39TurnBanner?.('領土運営フェーズで操作してください');return;}
  if(action==='start'&&usesV39OperationPhases(state)){
    if(selection?.tile)appendExpansionTile(state,player,settlement,selection.tile,map);return;
  }
  if(action==='open'||action==='tile'){
    if(state.activeWorldId&&state.activeWorldId!=='surface'){window.showV39TurnBanner?.('地上で領土拡張を行ってください');return;}
    const tile=action==='tile'?{x:Number(button.dataset.expansionX),y:Number(button.dataset.expansionY)}:null;
    if(tile){const entry=inspectV39LandExpansionEntry(state,player,tile,map);if(!entry.available){window.showV39TurnBanner?.(entry.reason);return;}settlement=entry.check.settlement;selectBase(player,settlement.settlementId);const fresh=context();state=fresh.state;player=fresh.player;}
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
    window.openV39SettlementExpansion?.();
    selection={playerId:player.id,settlementId:settlement.settlementId,tile};
    window.dispatchEvent(new Event('v39:territory-guide-selection-changed'));
    if(tile&&isV39TerritoryPhase(state)){appendExpansionTile(state,player,settlement,tile,map);return;}
    drawCandidates(getV39LandExpansionCandidates(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,settlement):state,player.id,settlement.settlementId,map));
    window.renderV39SettlementPanel?.();return;
  }
  if (action === "choose") {
    if (selection) clearSelection();
    else {
      const candidates = getV39LandExpansionCandidates(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,settlement):state, player.id, settlement.settlementId, map);
      if (!candidates.length) { window.showV39TurnBanner?.("開拓可能な土地がありません"); return; }
      window.cancelV39SelectedUnitMove?.(); window.cancelV39SelectedUnitAttack?.();
      selection = { playerId:player.id, settlementId:settlement.settlementId, tile:null };
      drawCandidates(candidates);
    }
    window.renderV39SettlementPanel?.();
    return;
  }
  const result = action === "cancel"
    ? cancelV39LandExpansion(state, player.id, settlement.settlementId, button.dataset.expansionKey)
    : startV39LandExpansion(state, player.id, settlement.settlementId, selection?.tile, map);
  if (!result.ok) { window.showV39TurnBanner?.(result.reason); return; }
  clearSelection();
  window.setV39GameState?.({ players:result.state.players }, { reason:"land-expansion" });
  window.appendV39ActivityLog?.(player.id, "開拓", action === "cancel" ? `開拓中止: ${button.dataset.expansionKey}` : `開拓開始: ${result.project.tileKey}`);
});

window.addEventListener("v39:tile-selected", event => {
  if (!selection) return;
  const { state, player, settlement, map } = context();
  if (player?.id !== selection.playerId || settlement?.settlementId !== selection.settlementId) { clearSelection(); return; }
  if(fixedPlacement()){
    if(!Number.isInteger(event.detail?.x)||!Number.isInteger(event.detail?.y))return;
    selection.tile={x:event.detail.x,y:event.detail.y};
    window.renderV39SettlementPanel?.();
    return;
  }
  if(isV39TerritoryPhase(state)){appendExpansionTile(state,player,settlement,{x:event.detail.x,y:event.detail.y},map);return;}
  const check = inspectV39LandExpansion(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,settlement):state, player.id, settlement.settlementId, event.detail, map);
  selection.tile = { x:event.detail.x, y:event.detail.y };
  if (!check.ok) window.showV39TurnBanner?.(check.reason);
  window.renderV39SettlementPanel?.();
});
window.addEventListener("v39:footer-tab-changed", event => { if (event.detail?.tab !== "settlement") clearSelection(); });
window.addEventListener("v39:field-generated", clearSelection);
window.addEventListener("keydown", event => { if (event.key === "Escape" && selection) { clearSelection(); window.renderV39SettlementPanel?.(); } });
document.addEventListener('change',event=>{
  if(!selection||!event.target.matches?.('[data-expansion-base]'))return;
  const {player}=context(),id=event.target.value;
  selection={...selection,settlementId:id};selectBase(player,id);
  const {state,settlement,map}=context();
  drawCandidates(getV39LandExpansionCandidates(isV39TerritoryPhase(state)?projectV39OperationTerritory(state,player.id,settlement):state,player.id,settlement.settlementId,map));
  window.renderV39SettlementPanel?.();
});
document.addEventListener('click',event=>{
  if(event.target.closest?.('[data-settlement-page-select]'))clearSelection();
});
