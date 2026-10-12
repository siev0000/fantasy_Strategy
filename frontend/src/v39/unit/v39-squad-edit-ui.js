import {editV39Squad,getV39EditableSquads,getV39SquadMemberRestriction} from "../../lib/v39-squad-edit-rules.js";
import {V39_SQUAD_MOVEMENT_BALANCE as balance} from "../../lib/v39-gameplay-balance.js";
import "./v39-squad-edit-ui.css";

const html=value=>String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
let context=null;
function render(id="") {
  const faction=window.getV39ActiveFactionState(),dialog=document.getElementById("v39-squad-editor");
  const squads=getV39EditableSquads(faction).filter(row=>row.id!=="solo"&&row.id!=="単独");
  const squad=squads.find(row=>row.id===id);
  dialog.innerHTML=`<header><h2 id="v39-squad-editor-title">部隊編制</h2><button type="button" data-squad-edit-close aria-label="閉じる">${context.onClose ? "戻る" : "×"}</button></header>
    <div class="v39-squad-edit-body"><label>編集する部隊<select id="v39-squad-edit-target"><option value="">新規作成</option>${squads.map(row=>`<option value="${html(row.id)}"${row.id===id?" selected":""}>${html(row.label || row.id)}</option>`).join("")}</select></label>
    <label>部隊名<input id="v39-squad-edit-name" value="${html(squad?.label || "新部隊")}" maxlength="40"></label>
    <p>メンバー <b id="v39-squad-edit-count"></b> / ${balance.maxMembers}体。離れたマスでも編制できます。座標・APは変わりません。</p>
    <div class="v39-squad-edit-members">${(faction.units || []).map(unit=>{
      const restriction=getV39SquadMemberRestriction(faction,unit,context.worldId);
      const member=squad?.unitIds.includes(unit.id);
      return `<label><input type="checkbox" data-squad-edit-unit="${html(unit.id)}"${member?" checked":""}${restriction&&!member?" disabled":""}><span><b>${html(unit.name || unit.id)}</b><small>Lv${unit.level || unit.lv || 1} (${unit.x},${unit.y}) · ${html(restriction || getV39EditableSquads(faction).find(row=>row.unitIds.includes(unit.id))?.label || "単独")}</small></span></label>`;
    }).join("")}</div>
    <label>移動先頭<select id="v39-squad-edit-leader"></select></label>
    <label>隊列<select id="v39-squad-edit-formation"><option value="column">縦列</option><option value="front-two"${squad?.formationType==="front-two"?" selected":""}>前2人</option></select></label></div>
    <output aria-live="polite"></output><footer><button type="button" data-squad-edit-disband${squad?"":" hidden"}>解散して単独に戻す</button><button type="button" data-squad-edit-save>${squad?"編制を保存":"部隊を作成"}</button></footer>`;
  updateMembers(squad?.movementLeaderId);
}
function selectedIds(){return [...document.querySelectorAll('#v39-squad-editor [data-squad-edit-unit]:checked')].map(row=>row.dataset.squadEditUnit);}
function updateMembers(preferred) {
  const dialog=document.getElementById("v39-squad-editor"),ids=selectedIds(),faction=window.getV39ActiveFactionState();
  const select=dialog.querySelector("#v39-squad-edit-leader"),previous=preferred || select.value;
  select.innerHTML=ids.map(id=>`<option value="${html(id)}">${html(faction.units.find(unit=>unit.id===id)?.name || id)}</option>`).join("");
  if(ids.includes(previous)) select.value=previous;
  dialog.querySelector("#v39-squad-edit-count").textContent=ids.length;
  dialog.querySelector("[data-squad-edit-save]").disabled=ids.length<1||ids.length>balance.maxMembers;
}
function open(options = {}) {
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState?.(),player=window.getV39ActivePlayer?.();
  if(!state||!player)return;
  context={playerId:player.id,worldId:state.activeWorldId || "surface",turn:state.timeline?.turnNumber,onClose:options.onClose};
  const selected=player.factionState.selectedUnitId;
  render(options.squadId ?? getV39EditableSquads(player.factionState).find(row=>row.id!=="solo"&&row.unitIds.includes(selected))?.id);
  document.getElementById("v39-squad-editor").showModal();
  document.getElementById("characterModal")?.classList.remove("open");
}
function install() {
  const dialog=document.createElement("dialog");dialog.id="v39-squad-editor";dialog.setAttribute("aria-labelledby","v39-squad-editor-title");document.body.appendChild(dialog);
  dialog.addEventListener("close",()=>{const onClose=context?.onClose;context=null;onClose?.();});
  dialog.addEventListener("keydown",event=>event.stopPropagation());
  dialog.addEventListener("change",event=>{
    if(event.target.id==="v39-squad-edit-target") render(event.target.value);
    else if(event.target.matches("[data-squad-edit-unit]"))updateMembers();
  });
  dialog.addEventListener("click",event=>{
    if(event.target.closest("[data-squad-edit-close]"))dialog.close();
    const disband=!!event.target.closest("[data-squad-edit-disband]");
    if(!disband&&!event.target.closest("[data-squad-edit-save]"))return;
    const state=window.getV39GameState();
    if(!context||window.isV39MapInputLocked?.()||state.activePlayerId!==context.playerId||(state.activeWorldId || "surface")!==context.worldId||state.timeline?.turnNumber!==context.turn){dialog.close();return;}
    const result=editV39Squad(state,context.playerId,{squadId:dialog.querySelector("#v39-squad-edit-target").value,
      label:dialog.querySelector("#v39-squad-edit-name").value,unitIds:selectedIds(),movementLeaderId:dialog.querySelector("#v39-squad-edit-leader").value,
      formationType:dialog.querySelector("#v39-squad-edit-formation").value,disband});
    if(!result.ok){dialog.querySelector("output").textContent=result.reason;return;}
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
    window.setV39GameState({players:result.state.players},{reason:"squad-edited"});
    window.refreshV39SquadDerivedUI?.();dialog.close();
  });
  window.openV39SquadEditor=open;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
