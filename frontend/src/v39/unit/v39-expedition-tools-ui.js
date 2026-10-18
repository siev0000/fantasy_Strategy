import { getV39ToolDefinitions, useV39ExpeditionTool, replenishV39ExpeditionTools, gatherV39ExpeditionHerbs, depositV39ExpeditionCargo } from "../../lib/v39-expedition-tools.js";
import { inspectV39ExpeditionReplenishment, inspectV39ExpeditionGather, inspectV39ExpeditionDeposit } from "../../lib/v39-expedition-tools.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import "./v39-expedition-tools-ui.css";
import {getV39ToolLoadout,resolveV39ToolSlots,inspectV39ToolProduction,startV39ToolProduction,cancelV39ToolProduction} from "../../lib/v39-consumables.js";
let expandedToolId="",selectedUnitId="";
let selectedToolTile=null;
window.addEventListener('v39:tile-selected',event=>{selectedToolTile=event.detail;schedule();});
for(const name of ['v39:unit-selected','v39:field-layer-changed','v39:save-loaded','v39:turn-advanced'])window.addEventListener(name,()=>{selectedToolTile=null;});

function invoke(operation,...args) {
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState(),unit=window.getV39SelectedSquadUnit?.();
  if(!unit)return;
  const result=operation(state,state.activePlayerId,unit.id,...args);
  if(result.ok){
    if(result.map)for(const key of ['caveSites','fogMap','purificationByTile'])if(key in result.map)window.__v39FieldRuntime.mapData[key]=result.map[key];
    window.setV39GameState({players:result.state.players},{reason:"expedition-tools"});
    window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
    window.appendV39ActivityLog?.(state.activePlayerId,"道具",result.message,{worldId:state.activeWorldId});
  }
  window.showV39TurnBanner?.(result.message||result.reason);renderTools();
}
function addCard(list,id,label,description,perform) {
  list.push({id,label,description,perform});
}
function createCard(id) {
  const card=document.createElement("div");card.className="technique-card technique-select-card system-action-card";
  card.dataset.expeditionTool=id;card.tabIndex=0;card.setAttribute("role","button");
  const summary=document.createElement("span");summary.className="technique-summary";
  const title=document.createElement("b");title.className="technique-name";summary.append(title);
  const detail=document.createElement("span");detail.className="technique-detail";
  const text=document.createElement("span");text.className="technique-detail-description";
  const use=document.createElement("button");use.type="button";use.textContent="実行";
  use.addEventListener("click",event=>{event.stopPropagation();card.__v39Perform?.();});detail.append(text,use);card.append(summary,detail);
  const expand=()=>{window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('tool-preview');expandedToolId=expandedToolId===id?"":id;card.classList.toggle("is-expanded",expandedToolId===id);card.setAttribute("aria-expanded",String(expandedToolId===id));schedule();};
  card.addEventListener("click",expand);card.addEventListener("keydown",event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();expand();}});
  return card;
}
function updateCards(host,choices) {
  const existing=new Map();
  for(const card of host.querySelectorAll('[data-expedition-tool]')){
    const id=card.dataset.expeditionTool;
    if(!existing.has(id))existing.set(id,[]);
    existing.get(id).push(card);
  }
  const ordered=[];
  for(const choice of choices){
    const card=existing.get(choice.id)?.shift()||createCard(choice.id);
    // Keep the node/focus but always refresh the action's captured context.
    card.__v39Perform=choice.perform;
    const title=card.querySelector('.technique-name'),text=card.querySelector('.technique-detail-description');
    if(title.textContent!==choice.label)title.textContent=choice.label;
    if(text.textContent!==choice.description)text.textContent=choice.description;
    const expanded=choice.id===expandedToolId;
    card.classList.toggle('is-expanded',expanded);
    if(card.getAttribute('aria-expanded')!==String(expanded))card.setAttribute('aria-expanded',String(expanded));
    ordered.push(card);
  }
  for(const cards of existing.values())for(const card of cards)card.remove();
  let next=host.querySelector('[data-expedition-tool]');
  for(const card of ordered){
    if(next!==card)host.insertBefore(card,next);
    next=card.nextElementSibling;
  }
}
function renderTools() {
  const host=document.getElementById("detailBasicList")||document.getElementById("techniqueList");
  if(!host)return;
  const list=[];
  const unit=window.getV39SelectedSquadUnit?.(),map=window.__v39FieldRuntime?.mapData;
  if(unit?.id!==selectedUnitId){selectedUnitId=unit?.id||"";expandedToolId="";}
  if(!unit||Number(unit.hp??unit.currentHp)<=0){updateCards(host,[]);return;}
  const state=window.getV39GameState({includeWorlds:false}),player=state.players.find(row=>row.id===state.activePlayerId);
  if(!player?.factionState.units.some(row=>row.id===unit.id)||(unit.worldId||"surface")!==(state.activeWorldId||"surface")){updateCards(host,[]);return;}
  if((state.activeWorldId||'surface')==='surface')for(const village of state.neutralVillages||[]){
    if(!village.territoryTileKeys?.includes(`${unit.x},${unit.y}`))continue;
    addCard(list,`village-talk-${village.id}`,'村で会話・依頼',`${village.name} / 依頼の受注・納品・報告を開きます。`,()=>window.openV39VillageMenu?.(village.id));
    addCard(list,`village-rest-${village.id}`,'村で休息',`AP30 / 部隊全員が村の領域内にいるとき休息できます。選択後に実行で確定します。`,()=>{window.restV39VillageParty?.(village.id);schedule();});
  }
  if(unit.caveDuty?.duty==='guard')addCard(list,"mine-duty",`入口警備: ${unit.caveDuty.status}`,`実行で警備任務を解除します。`,()=>{
    const result=window.assignV39MineDuty(unit.id,'none');window.showV39TurnBanner?.(result.ok?'鉱床任務を解除しました':result.reason);schedule();
  });
  for(const item of getV39ToolDefinitions()){
    if(Number(unit.toolStockByType?.[item.名前])>0&&getV39ToolLoadout(unit).some(row=>row.name===item.名前))addCard(list,`use-${item.名前}`,`${item.名前} ×${unit.toolStockByType[item.名前]}`,
      `AP ${item.AP消費} / ${item.効果==='浄化'?'使用マスを浄化（HP回復なし）':item.効果==='霧'?`対象マスをタップして通常霧 ⌛${item.持続ターン} / 対象 ${selectedToolTile?`(${selectedToolTile.x},${selectedToolTile.y})`:'未選択'}`:`即時HP+${item.即時回復} / 毎ターンHP+${item.毎ターン回復} ⌛${item.持続ターン} / 回復効果は上書き`}`,
      ()=>invoke(useV39ExpeditionTool,item.名前,map,selectedToolTile));
    const inspection=inspectV39ExpeditionReplenishment(state,state.activePlayerId,unit.id,map,item.名前);
    if(inspection.ok)addCard(list,`refill-${item.名前}`,`${item.名前}の補充`,`${item.名前}の現地完成品在庫を消費 / 上限${item.携帯上限} / AP消費なし`,()=>invoke(replenishV39ExpeditionTools,map,item.名前));
    const production=inspectV39ToolProduction(state,state.activePlayerId,unit.id,item.名前);
    if(production.available)addCard(list,`produce-${item.名前}`,`${item.名前}を製造`,`${item.製造施設} / 素材 ${item.必要素材} / ${production.amount}個 / ⌛${item.製造ターン}（暫定）`,()=>invoke(startV39ToolProduction,item.名前));
  }
  const productionQueues=(player.factionState.settlements || []).filter(village=>unit.worldId!=='surface'&&unit.worldId?false:unit.x===village.x&&unit.y===village.y||village.territoryResidentialCenterMap?.[`${unit.x},${unit.y}`]===`${village.x},${village.y}`)
    .flatMap(village=>(village.toolProductionQueue || []).map(row=>({...row,settlementId:village.settlementId})));
  for(const row of productionQueues)addCard(list,`production-${row.name}`,`${row.name}製造 ⌛${row.remainingTurns}`,`${row.facilityName} / ${row.status || '製造中'} / 拠点内に担当者がいる間進行。実行で予約を取消し素材を返却`,()=>{
    if(window.isV39MapInputLocked?.())return;
    const current=window.getV39GameState(),result=cancelV39ToolProduction(current,current.activePlayerId,row.settlementId,row.name);
    if(result.ok)window.setV39GameState({players:result.state.players},{reason:'tool-production-cancel'});
    window.showV39TurnBanner?.(result.message || result.reason);schedule();
  });
  for(const site of map?.caveSites||[]){
    if(!site.discovered||!['herb','mushroom'].includes(site.kind)||getHexDistance(unit,site)>1)continue;
    const inspection=inspectV39ExpeditionGather(state,state.activePlayerId,unit.id,map,site.id);
    if(inspection.ok)addCard(list,`gather-${site.id}`,`${site.icon} 採取`,"AP 30 / 素材を携帯します。休息または拠点で補充可能。キノコの使用効果は未定。",()=>invoke(gatherV39ExpeditionHerbs,map,site.id));
  }
  const deposit=inspectV39ExpeditionDeposit(state,state.activePlayerId,unit.id);
  if(Object.values(unit.expeditionCargoByType||{}).some(value=>value>0)&&deposit.ok)
    addCard(list,"deposit","道具素材を預ける",Object.entries(unit.expeditionCargoByType).map(([name,amount])=>`${name} ${amount}`).join(" / "),()=>invoke(depositV39ExpeditionCargo));
  if(Object.values(unit.toolStockByType || {}).some(value=>value>0)&&deposit.ok)
    addCard(list,'deposit-tools','携帯道具を預ける',`枠外を含む全道具を現地拠点へ預けます / 道具枠${resolveV39ToolSlots(unit)}`,()=>invoke(depositV39ExpeditionCargo,true));
  updateCards(host,list);
}
let pending=false;
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderTools();});}
for(const name of ['v39:unit-selected','v39:squad-selected','v39:game-state-changed','v39:field-layer-changed','v39:visibility-changed','v39:turn-advanced','v39:save-loaded'])window.addEventListener(name,schedule);
window.addEventListener('v39:squad-detail-rendered',schedule);
window.refreshV39ExpeditionTools=schedule;
