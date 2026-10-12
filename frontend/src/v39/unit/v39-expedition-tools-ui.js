import { getV39ToolDefinitions, useV39ExpeditionTool, replenishV39ExpeditionTools, gatherV39ExpeditionHerbs, depositV39ExpeditionCargo } from "../../lib/v39-expedition-tools.js";
import { getHexDistance } from "../../lib/hex-grid.js";
import "./v39-expedition-tools-ui.css";
let expandedToolId="",selectedUnitId="";

function invoke(operation,...args) {
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState(),unit=window.getV39SelectedSquadUnit?.();
  if(!unit)return;
  const result=operation(state,state.activePlayerId,unit.id,...args);
  if(result.ok){
    if(result.map)window.__v39FieldRuntime.mapData.caveSites=result.map.caveSites;
    window.setV39GameState({players:result.state.players},{reason:"expedition-tools"});
    window.refreshV39SquadDerivedUI?.();window.refreshV39MapEntities?.();
    window.appendV39ActivityLog?.(state.activePlayerId,"道具",result.message,{worldId:state.activeWorldId});
  }
  window.showV39TurnBanner?.(result.message||result.reason);renderTools();
}
function addCard(list,id,label,description,perform) {
  const card=document.createElement("div");card.className="technique-card technique-select-card system-action-card";
  card.dataset.expeditionTool=id;card.tabIndex=0;card.setAttribute("role","button");
  const summary=document.createElement("span");summary.className="technique-summary";
  const title=document.createElement("b");title.className="technique-name";title.textContent=label;summary.append(title);
  const detail=document.createElement("span");detail.className="technique-detail";
  const text=document.createElement("span");text.className="technique-detail-description";text.textContent=description;
  const use=document.createElement("button");use.type="button";use.textContent="実行";
  use.addEventListener("click",event=>{event.stopPropagation();perform();});detail.append(text,use);card.append(summary,detail);
  const expand=()=>{window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.('tool-preview');expandedToolId=expandedToolId===id?"":id;card.classList.toggle("is-expanded",expandedToolId===id);card.setAttribute("aria-expanded",String(expandedToolId===id));};
  card.addEventListener("click",expand);card.addEventListener("keydown",event=>{if(event.target===card&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();expand();}});
  list.append(card);
}
function renderTools() {
  const list=document.getElementById("techniqueList")||document.getElementById("detailTechniqueList");
  if(!list)return;
  list.querySelectorAll('[data-expedition-tool]').forEach(row=>row.remove());
  const unit=window.getV39SelectedSquadUnit?.(),map=window.__v39FieldRuntime?.mapData;
  if(unit?.id!==selectedUnitId){selectedUnitId=unit?.id||"";expandedToolId="";}
  if(!unit||Number(unit.hp??unit.currentHp)<=0)return;
  const state=window.getV39GameState({includeWorlds:false}),player=state.players.find(row=>row.id===state.activePlayerId);
  if(!player?.factionState.units.some(row=>row.id===unit.id)||(unit.worldId||"surface")!==(state.activeWorldId||"surface"))return;
  if(unit.caveDuty)addCard(list,"mine-duty",`鉱床任務: ${unit.caveDuty.status}`,`積載: ${Object.entries(unit.caveDuty.cargo||{}).filter(([,value])=>value>0).map(([name,value])=>`${name} ${value}`).join(' / ')||'なし'} / 実行で任務解除（積載中は先に搬入）`,()=>{
    const result=window.assignV39MineDuty(unit.id,'none');window.showV39TurnBanner?.(result.ok?'鉱床任務を解除しました':result.reason);schedule();
  });
  for(const item of getV39ToolDefinitions()){
    if(Number(unit.toolStockByType?.[item.名前])>0)addCard(list,`use-${item.名前}`,`${item.名前} ×${unit.toolStockByType[item.名前]}`,
      `AP ${item.AP消費} / 即時HP+${item.即時回復} / 毎ターンHP+${item.毎ターン回復} ⌛${item.持続ターン} / 自身に使用・回復効果は上書き`,()=>invoke(useV39ExpeditionTool,item.名前));
    const inspection=replenishV39ExpeditionTools(state,state.activePlayerId,unit.id,map,item.名前);
    if(inspection.ok)addCard(list,`refill-${item.名前}`,`${item.名前}の補充`,`${item.名前}の在庫${item.材料?`、または研究後に${item.材料}`:""}を消費 / 上限${item.携帯上限} / AP消費なし`,()=>invoke(replenishV39ExpeditionTools,map,item.名前));
  }
  for(const site of map?.caveSites||[]){
    if(!site.discovered||!['herb','mushroom'].includes(site.kind)||getHexDistance(unit,site)>1)continue;
    const inspection=gatherV39ExpeditionHerbs(state,state.activePlayerId,unit.id,map,site.id);
    if(inspection.ok)addCard(list,`gather-${site.id}`,`${site.icon} 採取`,"AP 30 / 素材を携帯します。休息または拠点で補充可能。キノコの使用効果は未定。",()=>invoke(gatherV39ExpeditionHerbs,map,site.id));
  }
  if(Object.values(unit.expeditionCargoByType||{}).some(value=>value>0)&&depositV39ExpeditionCargo(state,state.activePlayerId,unit.id).ok)
    addCard(list,"deposit","道具素材を預ける",Object.entries(unit.expeditionCargoByType).map(([name,amount])=>`${name} ${amount}`).join(" / "),()=>invoke(depositV39ExpeditionCargo));
  for(const card of list.querySelectorAll('[data-expedition-tool]'))if(card.dataset.expeditionTool===expandedToolId){card.classList.add("is-expanded");card.setAttribute("aria-expanded","true");}
}
let pending=false;
function schedule(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;renderTools();});}
for(const name of ['v39:unit-selected','v39:squad-selected','v39:game-state-changed','v39:field-layer-changed','v39:visibility-changed','v39:turn-advanced','v39:save-loaded'])window.addEventListener(name,schedule);
window.addEventListener('v39:squad-derived-updated',schedule);
document.addEventListener('click',schedule);
window.refreshV39ExpeditionTools=schedule;
