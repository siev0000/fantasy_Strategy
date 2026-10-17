import {editV39Squad,getV39EditableSquads,getV39SquadMemberRestriction} from "../../lib/v39-squad-edit-rules.js";
import {V39_SQUAD_MOVEMENT_BALANCE as balance} from "../../lib/v39-gameplay-balance.js";
import "./v39-squad-edit-ui.css";
import {inspectV39SquadAssembly} from '../../lib/v39-squad-coordination.js';

const html=value=>String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll('"',"&quot;");
let context=null;
function render(id="") {
  const faction=window.getV39ActiveFactionState(),dialog=document.getElementById("v39-squad-editor");
  const squads=getV39EditableSquads(faction).filter(row=>row.id!=="solo"&&row.id!=="単独");
  const squad=squads.find(row=>row.id===id);
  context.originalMemberIds=squad?.unitIds || [];
  const membership=new Map(squads.flatMap(row=>row.unitIds.map(unitId=>[unitId,row])));
  dialog.innerHTML=`<header><h2 id="v39-squad-editor-title">部隊編制</h2><button type="button" data-squad-edit-close aria-label="閉じる">${context.onClose ? "戻る" : "×"}</button></header>
    <div class="v39-squad-edit-body"><label>編集する部隊<select id="v39-squad-edit-target"><option value="">新規作成</option>${squads.map(row=>`<option value="${html(row.id)}"${row.id===id?" selected":""}>${html(row.label || row.id)}</option>`).join("")}</select></label>
    <label>部隊名<input id="v39-squad-edit-name" value="${html(squad?.label || "新部隊")}" maxlength="40"></label>
    <p>メンバー <b id="v39-squad-edit-count"></b>。通常${balance.maxMembers}体まで・召喚は別枠。</p>
    <nav class="v39-squad-member-filters" aria-label="編制候補の表示"><button type="button" data-squad-member-filter="available">${squad?'単独・この部隊':'単独のみ'}</button><button type="button" data-squad-member-filter="all">他の部隊も表示</button></nav>
    <div class="v39-squad-edit-members">${(faction.units || []).map(unit=>{
      const restriction=getV39SquadMemberRestriction(faction,unit,context.worldId);
      const member=squad?.unitIds.includes(unit.id);
      const source=membership.get(unit.id),label=source?.label || source?.name || source?.id || '単独';
      return `<label data-squad-candidate><input type="checkbox" data-squad-edit-unit="${html(unit.id)}" data-squad-source-id="${html(source?.id || '')}" data-squad-source-label="${html(label)}"${member?" checked":""}${restriction&&!member?" disabled":""}><span><b>${html(unit.name || unit.id)}</b><small>Lv${unit.level || unit.lv || 1} (${unit.x},${unit.y})</small><span class="v39-squad-membership${source&&source.id!==id?' other':''}">所属：${html(label)}${source?.id===id?'（編集中）':''}</span>${restriction?`<small class="v39-squad-restriction">${html(restriction)}</small>`:''}</span></label>`;
    }).join("")}</div>
    <label>移動先頭<select id="v39-squad-edit-leader"></select></label>
    <label>隊列<select id="v39-squad-edit-formation"><option value="column">縦列</option><option value="front-two"${squad?.formationType==="front-two"?" selected":""}>前2人</option></select></label></div>
    <p class="v39-squad-edit-note">同じ拠点の領土内＋周囲${balance.assemblyBorderRadius}マス。遠征中は隣接して編制。編成後は通常移動で集合します（AP消費）。他部隊からは移籍になります。</p>
    <output aria-live="polite"></output><footer><p id="v39-squad-edit-changes" aria-live="polite"></p><button type="button" data-squad-edit-disband${squad?"":" hidden"}>解散して単独に戻す</button><button type="button" data-squad-edit-save>${squad?"編制を保存":"部隊を作成"}</button></footer>`;
  updateMembers(squad?.movementLeaderId);
}
function selectedIds(){return [...document.querySelectorAll('#v39-squad-editor [data-squad-edit-unit]:checked')].map(row=>row.dataset.squadEditUnit);}
function updateMembers(preferred) {
  const dialog=document.getElementById("v39-squad-editor"),ids=selectedIds(),faction=window.getV39ActiveFactionState();
  const select=dialog.querySelector("#v39-squad-edit-leader"),previous=preferred || select.value;
  select.innerHTML=ids.map(id=>`<option value="${html(id)}">${html(faction.units.find(unit=>unit.id===id)?.name || id)}</option>`).join("");
  if(ids.includes(previous)) select.value=previous;
  const normal=ids.filter(id=>!faction.units.find(unit=>unit.id===id)?.summon).length;
  dialog.querySelector("#v39-squad-edit-count").textContent=`通常${normal}/${balance.maxMembers}・召喚${ids.length-normal}`;
  dialog.querySelector("[data-squad-edit-save]").disabled=ids.length<1||normal>balance.maxMembers;
  const target=dialog.querySelector('#v39-squad-edit-target').value;
  const destination=dialog.querySelector('#v39-squad-edit-name').value.trim() || '新部隊';
  dialog.querySelectorAll('[data-squad-member-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.squadMemberFilter===context.filter)));
  const changes=[];
  const state=window.getV39GameState({includeWorlds:false}),map=window.__v39FieldRuntime?.mapData;
  const members=faction.units.filter(unit=>ids.includes(unit.id));
  dialog.querySelector('output').textContent='';
  for(const input of dialog.querySelectorAll('[data-squad-edit-unit]')) {
    const unit=faction.units.find(row=>row.id===input.dataset.squadEditUnit);
    const base=getV39SquadMemberRestriction(faction,unit,context.worldId);
    const region=!input.checked&&ids.length?inspectV39SquadAssembly(state,context.playerId,[...members,unit],map):{ok:true};
    input.disabled=!input.checked&&!!(base||!region.ok);
    let note=input.closest('label').querySelector('[data-squad-region-reason]');
    if(!note){note=document.createElement('small');note.dataset.squadRegionReason='';input.nextElementSibling.append(note);}
    note.textContent=base?'':region.ok?'':'編制範囲外（集合が必要）';
    note.title=region.ok?'':region.reason;
    note.hidden=!note.textContent;
    const other=input.dataset.squadSourceId&&input.dataset.squadSourceId!==target;
    input.closest('[data-squad-candidate]').hidden=context.filter!=='all'&&other&&!input.checked;
    if(input.checked&&other)changes.push(`${faction.units.find(unit=>unit.id===input.dataset.squadEditUnit)?.name || input.dataset.squadEditUnit}：${input.dataset.squadSourceLabel} → ${destination}`);
  }
  const removed=context.originalMemberIds.filter(id=>!ids.includes(id));
  if(removed.length)changes.push(`外す${removed.length}体 → 単独`);
  dialog.querySelector('#v39-squad-edit-changes').textContent=changes.join(' / ');
  dialog.querySelector('#v39-squad-edit-changes').hidden=!changes.length;
  if(ids.some(id=>!context.originalMemberIds.includes(id))){
    const inspection=inspectV39SquadAssembly(state,context.playerId,members,map);
    if(!inspection.ok){dialog.querySelector('[data-squad-edit-save]').disabled=true;dialog.querySelector('output').textContent=inspection.reason;}
    else dialog.querySelector('output').textContent='';
  }
}
function open(options = {}) {
  if(window.isV39MapInputLocked?.())return;
  const state=window.getV39GameState?.(),player=window.getV39ActivePlayer?.();
  if(!state||!player)return;
  context={playerId:player.id,worldId:state.activeWorldId || "surface",turn:state.timeline?.turnNumber,onClose:options.onClose,filter:'available'};
  const selected=player.factionState.selectedUnitId;
  render(options.squadId ?? getV39EditableSquads(player.factionState).find(row=>row.id!=="solo"&&row.unitIds.includes(selected))?.id);
  document.getElementById("v39-squad-editor").showModal();
  document.getElementById("characterModal")?.classList.remove("open");
}
function install() {
  const dialog=document.createElement("dialog");dialog.id="v39-squad-editor";dialog.setAttribute("aria-labelledby","v39-squad-editor-title");document.body.appendChild(dialog);
  dialog.addEventListener("close",()=>{if(dialog.open)return;const onClose=context?.onClose;context=null;onClose?.();});
  dialog.addEventListener("keydown",event=>event.stopPropagation());
  dialog.addEventListener("change",event=>{
    if(event.target.id==="v39-squad-edit-target") render(event.target.value);
    else if(event.target.matches("[data-squad-edit-unit]"))updateMembers();
  });
  dialog.addEventListener('input',event=>{if(event.target.id==='v39-squad-edit-name')updateMembers();});
  dialog.addEventListener("click",event=>{
    const filter=event.target.closest('[data-squad-member-filter]');
    if(filter){context.filter=filter.dataset.squadMemberFilter;updateMembers();return;}
    if(event.target.closest("[data-squad-edit-close]"))dialog.close();
    const disband=!!event.target.closest("[data-squad-edit-disband]");
    if(!disband&&!event.target.closest("[data-squad-edit-save]"))return;
    const state=window.getV39GameState();
    if(!context||window.isV39MapInputLocked?.()||state.activePlayerId!==context.playerId||(state.activeWorldId || "surface")!==context.worldId||state.timeline?.turnNumber!==context.turn){dialog.close();return;}
    const result=editV39Squad(state,context.playerId,{squadId:dialog.querySelector("#v39-squad-edit-target").value,
      label:dialog.querySelector("#v39-squad-edit-name").value,unitIds:selectedIds(),movementLeaderId:dialog.querySelector("#v39-squad-edit-leader").value,
      formationType:dialog.querySelector("#v39-squad-edit-formation").value,disband},window.__v39FieldRuntime?.mapData);
    if(!result.ok){dialog.querySelector("output").textContent=result.reason;return;}
    window.cancelV39SelectedUnitMove?.();window.cancelV39SelectedUnitAttack?.();
    window.setV39GameState({players:result.state.players},{reason:"squad-edited"});
    window.refreshV39SquadDerivedUI?.();dialog.close();
    if(result.rallyStarted)void window.advanceV39ActiveSquadRallies?.();
  });
  window.openV39SquadEditor=open;
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",install,{once:true});else install();
