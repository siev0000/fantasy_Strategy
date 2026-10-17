import { renderV39UnitSkills } from "./v39-unit-skills.js";
import { openV39EquipmentPicker } from "./v39-equipment-picker.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { currentV39TurnNumber, remainingV39Turns } from "../../lib/v39-turn-timing.js";
import { renderV39UnitAbility, renderV39DetailTabs, renderV39UnitEquipment, renderV39UnitGrowth } from "./v39-unit-detail.js";
import { renderV39UnitCard } from "./v39-unit-card.js";
import {resolveV39ToolSlots,getV39ToolLoadout,getV39ConsumableDefinitions,setV39ToolLoadout} from "../../lib/v39-consumables.js";
import {getV39ClassPromotionOptions,acquireV39UpperClass} from "../../lib/v39-class-progression.js";
import {renderV39SquadCoordination} from './v39-squad-coordination-ui.js';

let activeTab = "character";
let selectedId = "";
let selectedSquadMemberId = "";
let selectedSquadId = "";
let locationFilter = 'all';
const detailUnitId = () => activeTab === 'squad' ? selectedSquadMemberId : selectedId;
let detailTab = "status";
let pinnedResistanceElement = null;
let expandedSkillName = "";
let equipmentMessage = "";
let pendingRender = 0;
const renderedMarkup = new WeakMap();

function updateMarkup(host, markup) {
  if (renderedMarkup.get(host) === markup) return false;
  host.innerHTML = markup;
  renderedMarkup.set(host, markup);
  return true;
}

function updateDetailPanel(host, markup, preserveDrafts) {
  if (preserveDrafts && renderedMarkup.get(host) === markup) return;
  const previous = host.querySelector('.v39-char-detail-scroll');
  const scroll = previous?.scrollTop || 0;
  const sections = [...host.querySelectorAll('details')].map(section => section.open);
  const controls = [...host.querySelectorAll('select,input')];
  const values = preserveDrafts ? controls.map(control => control.value) : [];
  const focusIndex = controls.indexOf(document.activeElement);
  const focusedSkill = host.contains(document.activeElement)
    ? document.activeElement.closest('[data-v39-character-skill]')?.dataset.v39CharacterSkill : undefined;
  if (!preserveDrafts) renderedMarkup.delete(host);
  updateMarkup(host, markup);
  host.querySelectorAll('details').forEach((section,index) => {
    if (index < sections.length) section.open = sections[index];
  });
  const nextControls = [...host.querySelectorAll('select,input')];
  nextControls.forEach((control,index) => {
    if (index < values.length) control.value = values[index];
  });
  if (focusIndex >= 0) nextControls[focusIndex]?.focus({preventScroll:true});
  if (focusedSkill !== undefined) [...host.querySelectorAll('[data-v39-character-skill]')]
    .find(card => card.dataset.v39CharacterSkill === focusedSkill)?.focus({preventScroll:true});
  const next = host.querySelector('.v39-char-detail-scroll');
  if (next) next.scrollTop = scroll;
}

function updateList(host, entries) {
  const existing = new Map([...host.children].map(node => [node.dataset.v39RowKey,node]));
  let cursor = host.firstElementChild;
  for (const [key,markup] of entries) {
    let node = existing.get(key);
    existing.delete(key);
    if (!node || renderedMarkup.get(node) !== markup) {
      const template = document.createElement('template');
      template.innerHTML = markup;
      const next = template.content.firstElementChild;
      if (node) {
        for (const attr of [...node.attributes]) if (attr.name !== 'data-v39-row-key') node.removeAttribute(attr.name);
        for (const attr of next.attributes) node.setAttribute(attr.name,attr.value);
        node.innerHTML = next.innerHTML;
      } else node = next;
      node.dataset.v39RowKey = key;
      renderedMarkup.set(node,markup);
    }
    if (node !== cursor) host.insertBefore(node,cursor);
    cursor = node.nextElementSibling;
  }
  for (const node of existing.values()) node.remove();
}

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;
const storageOf = unit => unit?.characterStorage || unit?.reserveEntry?.corpseStorage;
const storageLabel = unit => {
  const storage=storageOf(unit);
  return storage ? `${storage.facilityName} (${storage.tileKey})${storage.worldId&&storage.worldId!=='surface'?' / 洞窟':''}` : '';
};

function characterRows(current) {
  const field=current.units.filter(unit=>!isDead(unit));
  const stored=(current.facilityStorage||[]).filter(entry=>entry.unit?.id).map(entry=>({...entry.unit,characterStorage:entry}));
  const corpses=(current.deadUnitReserve||[]).filter(entry=>entry.corpseStorage&&entry.unit?.id).map(entry=>({...entry.unit,reserveEntry:entry}));
  return [...new Map([...field,...stored,...corpses].map(unit=>[unit.id,unit])).values()];
}

function unitListRow(unit, id, selected) {
  return renderV39UnitCard(unit, {id,selected,character:true,dead:isDead(unit),...(storageOf(unit)?{position:storageLabel(unit)}:{})});
}
function faction() {
  return window.getV39ActiveFactionState?.() || null;
}

function rowsForTab(current) {
  if (activeTab === "character") return characterRows(current).filter(unit=>locationFilter==='all'
    ||locationFilter==='field'&&!storageOf(unit)
    ||locationFilter==='facility'&&unit.characterStorage
    ||locationFilter==='mausoleum'&&unit.reserveEntry?.corpseStorage);
  if (activeTab === "squad") return current.squads;
  if (activeTab === "corpse") return current.units.filter(isDead);
  if (activeTab === "dead") return current.deadUnitReserve.map((entry) => ({ ...entry.unit, reserveEntry:entry }));
  return [];
}

function statusPanel(unit) {
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll">${renderV39UnitAbility(unit, {mapData:storageOf(unit)?null:window.__v39FieldRuntime?.mapData})}</div>`;
}
function skillsPanel(unit) {
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll"><div class="technique-list v39-char-technique-list">${renderV39UnitSkills(unit, {mapData:storageOf(unit)?null:window.__v39FieldRuntime?.mapData, expandedName:expandedSkillName})}</div></div>`;
}
function equipmentPanel(unit) {
  if(storageOf(unit))return `<div class="squad-detail-tab-panel v39-char-detail-scroll"><p class="v39-char-note">保管中は閲覧のみです。変更する場合は施設から取り出してください。</p>${renderV39UnitEquipment(unit)}</div>`;
  const fixed = isMobUnit(unit) || isDead(unit) || !!unit.summon;
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll">
    <p class="v39-char-note">${fixed ? "このユニットの装備は変更できません。" : "装備を押して変更候補と性能を比較"}</p>
    ${renderV39UnitEquipment(unit,{readOnly:false,disabled:fixed})}
    <section class="v39-char-tool-settings"><h4>道具枠 ${resolveV39ToolSlots(unit)} / デフォルト携帯</h4>
      <p class="v39-char-note">上から優先して補充。設定だけでは道具を支給しません。枠外の在庫は消えず、拠点へ預けられます。</p>
      ${Array.from({length:resolveV39ToolSlots(unit)},(_,index)=>{
        const row=getV39ToolLoadout(unit)[index];
        return `<div data-v39-tool-setting-row><select data-v39-tool-setting-name aria-label="道具枠${index+1}"${isDead(unit)?" disabled":""}><option value="">なし</option>${getV39ConsumableDefinitions().map(item=>`<option value="${escapeHtml(item.名前)}"${item.名前===row?.name?" selected":""}>${escapeHtml(item.名前)}（在庫${number(unit.toolStockByType?.[item.名前],0)}）</option>`).join('')}</select><input type="number" data-v39-tool-setting-count aria-label="携帯個数${index+1}" min="1" value="${row?.count || 1}"${isDead(unit)?" disabled":""}></div>`;
      }).join('') || '<p class="v39-char-note">胴装備なしでは携帯できません。</p>'}
      <button type="button" class="v39-char-squad-action" data-v39-tool-settings-save${isDead(unit)?" disabled":""}>携帯設定を保存</button>
    </section><output class="v39-char-note" aria-live="polite">${escapeHtml(equipmentMessage)}</output>
  </div>`;
}
function growthPanel(unit) {
  if(storageOf(unit))return `<div class="v39-char-detail-scroll"><h4>成長</h4>${renderV39UnitGrowth(unit)}<p class="v39-char-note">保管中は閲覧のみです。</p></div>`;
  const state=window.getV39GameState({includeWorlds:false}),options=getV39ClassPromotionOptions(state,state.activePlayerId,unit);
  return `<div class="v39-char-detail-scroll">
    <h4>成長</h4>
    ${renderV39UnitGrowth(unit)}
    ${unit.fusionGrowth?'<p class="v39-char-note">合体後のEXPは、基礎と追加クラスへ配分されます。EXPゲージは基礎分です。</p>':''}
    <details class="v39-char-note"><summary>Lvの内訳について</summary><p>種族Lvの表示は初期種族ボーナスLv5を含まない値です。</p></details>
    <h4>上位クラス取得</h4>
    <p class="v39-char-note">前提職の上限を超えたLvを移します。総合LvとEXPは増えません。</p>
    ${options.length?options.map(option=>`<details class="v39-char-promotion"><summary><b>${escapeHtml(option.row.ルビ || option.row.名前)}</b><span>${option.available?'取得可能':'条件未達'}</span></summary><p>${option.available?`${escapeHtml(unit.className)}Lv${option.limit}＋${escapeHtml(option.row.名前)}Lv${option.surplus}`:escapeHtml(option.reasons.join(' / '))}</p><button data-v39-class-acquire="${escapeHtml(option.row.名前)}" ${option.available?'':'disabled'}>取得する</button></details>`).join(''):'<p class="v39-char-note">現在職を前提とする上位候補はありません。</p>'}
    ${equipmentMessage?`<p role="status">${escapeHtml(equipmentMessage)}</p>`:''}
  </div>`;
}

function detailTabs(unit) {
  const tabs = [["status", "能力"], ["skills", "スキル"], ["equipment", "装備"], ["growth", "成長"]];
  const panel = detailTab === "skills" ? skillsPanel(unit)
    : detailTab === "equipment" ? equipmentPanel(unit)
    : detailTab === "growth" ? growthPanel(unit)
    : statusPanel(unit);
  return `${renderV39DetailTabs(tabs, detailTab, "data-v39-character-detail-tab")}
    <div class="squad-detail-tab-content v39-char-detail-panel">${panel}</div>`;
}
function unitDetail(unit,current=faction()) {
  if (!unit) return '<div class="detail-pane squad-detail-pane"><p>表示対象がありません。</p></div>';
  const remainingTurns = remainingV39Turns(unit?.deadExpireTurn, currentV39TurnNumber());
  const role = text(unit?.role || unit?.state, "キャラクター");
  return `<div class="detail-pane squad-detail-pane v39-char-unit-detail">
    <div class="v39-char-unit-head">
      <div class="squad-detail-minihead v39-char-unit-meta">
        <span class="squad-detail-chip">${escapeHtml(unit?.race || '-')} / ${escapeHtml(unit?.className || '-')}</span>
        <span class="squad-detail-chip">${escapeHtml(role)} ・ Lv${Math.max(1, Math.floor(number(unit?.level, 1)))}</span>
      </div>
      ${activeTab === "corpse" ? `<p>消滅まで ${remainingTurns}ターン / 座標 (${number(unit.x)}, ${number(unit.y)})</p>` : ""}
      ${activeTab === "dead"&&!storageOf(unit) ? `<p>回収: ${new Date(number(unit?.reserveEntry?.storedAtMs, Date.now())).toLocaleTimeString("ja-JP")}</p>` : ""}
      ${storageOf(unit)?`<p class="v39-char-storage-location">${escapeHtml(storageLabel(unit))}${isDead(unit)?' / 遺体保管・消滅停止':' / 施設格納中'}</p>`:''}
      ${activeTab==='corpse'||activeTab==='dead'||storageOf(unit)?'':renderV39SquadCoordination(unit,current)}
    </div>
    ${detailTabs(unit)}
  </div>`;
}

function squadDetail(squad, current) {
  if (!squad) return '<div class="detail-pane"><p>表示対象がありません。</p></div>';
  const ids = Array.isArray(squad.unitIds) ? squad.unitIds : Array.isArray(squad.memberIds) ? squad.memberIds : [];
  const members = current.units.filter((unit) => ids.includes(unit.id));
  const member = members.find(unit => unit.id === selectedSquadMemberId) || members[0];
  selectedSquadMemberId = member?.id || "";
  return `<div class="v39-char-squad-detail">${unitDetail(member,current)}</div>`;
}

function render({preserveDrafts=true} = {}) {
  if (pendingRender) cancelAnimationFrame(pendingRender);
  pendingRender = 0;
  const modal = document.getElementById("characterModal");
  const body = modal?.querySelector(".modal-body");
  const current = faction();
  if (!(body instanceof HTMLElement)) return false;
  if (!current) {
    updateMarkup(body, '<div class="detail-pane v39-char-empty-panel"><p class="v39-char-empty">ゲーム開始後にキャラクター情報を表示します。</p></div>');
    return false;
  }
  const rows = rowsForTab(current);
  const idFor = (row, index) => text(row?.id, `row-${index}`);
  if (!rows.some((row, index) => idFor(row, index) === selectedId)) selectedId = idFor(rows[0], 0);
  const selected = rows.find((row, index) => idFor(row, index) === selectedId) || null;
  const tabs = [["character", "キャラクター"], ["squad", "部隊"], ["corpse", "死体回収"], ["dead", "死亡者一覧"]];
  if (!body.querySelector('[data-v39-character-detail-host]')) {
    body.innerHTML = `<div class="modal-tabs">${tabs.map(([key,label]) => `<button data-v39-character-tab="${key}">${label}</button>`).join('')}</div><div class="v39-char-squad-toolbar" hidden></div>
      <div class="character-layout"><div class="list-pane"></div><div data-v39-character-detail-host style="display:contents"></div></div>`;
    renderedMarkup.delete(body);
  }
  for (const button of body.querySelectorAll('[data-v39-character-tab]')) button.classList.toggle('active',button.dataset.v39CharacterTab === activeTab);
  const toolbar=body.querySelector('.v39-char-squad-toolbar');
  toolbar.hidden=activeTab!=='squad';
  if(activeTab==='squad'){
    selectedSquadId=selected?.id||'';
    updateMarkup(toolbar,`<select data-v39-character-squad-select aria-label="表示する部隊">${rows.map(squad=>`<option value="${escapeHtml(squad.id)}"${squad.id===selectedId?' selected':''}>${escapeHtml(squad.name||squad.label||'部隊')} / ${current.units.filter(u=>(squad.unitIds||squad.memberIds||[]).includes(u.id)).length}体</option>`).join('')}</select><button type="button" class="v39-char-squad-action" id="v39-squad-edit" data-v39-character-squad-edit="">新規部隊</button>${selected&&!['solo','単独'].includes(selected.id)?`<button type="button" class="v39-char-squad-action" data-v39-character-squad-edit="${escapeHtml(selected.id)}">編制変更</button>`:''}`);
  }
  const list = body.querySelector('.list-pane');
  if (activeTab === 'squad') {
    const ids = selected?.unitIds || selected?.memberIds || [];
    if (!ids.includes(selectedSquadMemberId)) selectedSquadMemberId = ids[0] || '';
  }
  const entries = (activeTab==='squad'?(selected?[selected]:[]):rows).flatMap((row,index) => {
    const id = idFor(row,index);
    if (activeTab !== 'squad') return [[`${activeTab}:${id}`,unitListRow(row,id,id === selectedId)]];
    const ids = row.unitIds || row.memberIds || [];
    const members = current.units.filter(unit=>ids.includes(unit.id));
    return members.map(unit=>[`member:${id}:${unit.id}`,renderV39UnitCard(unit,{character:true,attribute:'data-v39-squad-member',selected:id===selectedId&&unit.id===selectedSquadMemberId})]);
  });
  if (!entries.length) entries.push(['empty','<div class="char-row">該当なし</div>']);
  if(activeTab==='character') {
    const all=characterRows(current),counts={all:all.length,field:all.filter(u=>!storageOf(u)).length,facility:all.filter(u=>u.characterStorage).length,mausoleum:all.filter(u=>u.reserveEntry?.corpseStorage).length};
    entries.unshift(['location-filter',`<select data-v39-character-location aria-label="保管場所で絞り込み">${[['all','すべて'],['field','活動中'],['facility','施設内'],['mausoleum','霊廟']].map(([key,label])=>`<option value="${key}"${locationFilter===key?' selected':''}>${label} ${counts[key]}</option>`).join('')}</select>`]);
  }
  updateList(list,entries);
  const host = body.querySelector('[data-v39-character-detail-host]');
  const key = JSON.stringify([window.getV39ActivePlayerId?.(),activeTab,selectedId,selectedSquadMemberId,detailTab]);
  if (host.dataset.detailKey !== key) {
    // Identical equipment on a different unit must not inherit an unsaved draft.
    renderedMarkup.delete(host);
    updateMarkup(host,activeTab === 'squad' ? squadDetail(selected,current) : unitDetail(selected,current));
    host.dataset.detailKey = key;
    for (const part of host.querySelectorAll('.v39-char-unit-head,.v39-char-detail-panel')) renderedMarkup.set(part,part.innerHTML);
  } else if (activeTab === 'squad' || !selected) {
    updateMarkup(host,activeTab === 'squad' ? squadDetail(selected,current) : unitDetail(selected,current));
  } else {
    const template = document.createElement('template');
    const markup = unitDetail(selected,current);
    if (renderedMarkup.get(host) !== markup || !preserveDrafts) {
      template.innerHTML = markup;
      const head = host.querySelector('.v39-char-unit-head');
      updateMarkup(head,template.content.querySelector('.v39-char-unit-head').innerHTML);
      updateDetailPanel(host.querySelector('.v39-char-detail-panel'),template.content.querySelector('.v39-char-detail-panel').innerHTML,preserveDrafts);
      renderedMarkup.set(host,markup);
    }
  }
  requestAnimationFrame(() => window.refreshV39SquadCardVitals?.());
  return true;
}

function openCharacterModal() {
  const modal = document.getElementById("characterModal");
  if (!(modal instanceof HTMLElement)) return false;
  modal.classList.add("open");
  render();
  return true;
}

function installStyles() {
  if (document.getElementById("v39-character-modal-style")) return;
  const style = document.createElement("style");
  style.id = "v39-character-modal-style";
  style.textContent = `
    #characterModal .v39-char-tool-settings{margin-top:10px;border-top:1px solid #38535d;padding-top:6px}#characterModal [data-v39-tool-setting-row]{display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:4px;margin-bottom:5px}#characterModal [data-v39-tool-setting-row] select,#characterModal [data-v39-tool-setting-row] input{min-width:0;min-height:32px;padding:4px;border:1px solid #53717c;border-radius:5px;font-size:var(--font-body);background:#172d35;color:#e8efec}
    #characterModal .v39-char-squad-action{font-size:var(--font-body);min-height:34px;padding:6px 10px;border:1px solid #53717c;border-radius:6px;background:#172d35;color:#e8efec;margin-bottom:6px}
    #characterModal .v39-char-unit-detail{display:grid;grid-template-rows:auto auto minmax(0,1fr);height:100%;min-height:0;overflow:hidden}
    #characterModal .v39-char-squad-detail{display:grid;grid-template-rows:minmax(0,1fr);height:100%;min-height:0;min-width:0;overflow:hidden}
    #characterModal .v39-char-squad-toolbar{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:4px;min-width:0}
    #characterModal .v39-char-squad-toolbar[hidden]{display:none}
    #characterModal .v39-char-squad-toolbar select{min-width:0;width:100%;min-height:34px;font:inherit;background:#172d35;color:#e8efec;border:1px solid #53717c;border-radius:5px}
    #characterModal .v39-char-squad-toolbar .v39-char-squad-action{margin:0;padding:5px 7px}
    #characterModal .v39-char-squad-header{display:flex;justify-content:space-between;align-items:center;gap:6px}
    #characterModal .v39-char-group-heading{font:inherit;min-height:30px;padding:4px 0;border:0;border-bottom:1px solid #40575e;background:transparent;color:#a8dfe5;text-align:left;overflow-wrap:anywhere}
    #characterModal .v39-char-promotion{border-bottom:1px solid #40575e;padding:5px 0}
    #characterModal .v39-char-promotion summary{cursor:pointer;padding:5px 0;overflow-wrap:anywhere}
    #characterModal .v39-char-promotion summary span{display:block;color:#a9bbbf;font-size:var(--font-secondary)}
    #characterModal .char-row{min-width:0;overflow-wrap:anywhere}
    #characterModal .v39-char-unit-head{padding-bottom:8px}
    #characterModal [data-v39-character-location]{position:sticky;top:0;z-index:1;width:100%;min-width:0;min-height:32px;font:inherit;background:#172d35;color:#e8efec;border:1px solid #53717c;border-radius:5px}
    #characterModal .v39-char-storage-location{margin:4px 0;font-size:var(--font-secondary);color:#a8dfe5;overflow-wrap:anywhere}
    #characterModal .v39-char-unit-row .squad-pos{white-space:normal;overflow-wrap:anywhere}
    #characterModal .modal{width:min(900px,96vw);height:min(780px,94svh)}
    #characterModal .modal-body{display:grid;grid-template-rows:auto auto minmax(0,1fr);min-height:0;overflow:hidden;gap:7px}
    #characterModal .modal-body:has(.v39-char-squad-toolbar[hidden]){grid-template-rows:auto minmax(0,1fr)}
    #characterModal .v39-char-detail-scroll{height:100%;overflow:auto;padding:8px}
    #characterModal .v39-char-detail-scroll h4{margin:5px 0 7px}
    #v39ResistancePopover{position:fixed;z-index:100000;display:none;max-width:min(220px,calc(100vw - 24px));padding:5px 9px;border:1px solid rgba(112,144,153,.9);border-radius:6px;background:#0d171b;color:#eef7f6;box-shadow:0 5px 16px rgba(0,0,0,.36);font-size:var(--font-compact);font-weight:800;line-height:1.2;white-space:nowrap;pointer-events:none;transform:translate(-50%,-100%)}
    #characterModal .v39-char-equipment-list,#characterModal .v39-char-growth-list{display:grid;gap:6px}
    #characterModal .v39-char-equipment-row,#characterModal .v39-char-growth-row{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #31464d;border-radius:6px;background:#17252a;padding:7px 9px;min-width:0}
    #characterModal .v39-char-equipment-row span,#characterModal .v39-char-growth-row span{color:#a8b8ba}
    #characterModal .v39-char-equipment-row{width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer}
    #characterModal .v39-char-equipment-row:disabled{opacity:.65;cursor:default}
    #characterModal .v39-char-equipment-row b{overflow-wrap:anywhere;text-align:right}
    #characterModal .v39-char-note,#characterModal .v39-char-empty{color:#9eafb2;font-size:var(--font-secondary)}
    #characterModal .v39-char-empty-panel{display:grid;place-items:center;min-height:160px}
    #characterModal .character-layout{grid-template-columns:minmax(150px,190px) minmax(0,1fr);height:100%;min-height:0;gap:7px}
    #characterModal .list-pane{display:grid;grid-auto-rows:max-content;align-content:start;gap:5px;padding:4px;overflow:auto;min-width:0}
    #characterModal .v39-char-unit-row{margin:0;width:100%;color:#e6efed}
    #characterModal .v39-char-unit-row.dead{opacity:.65;border-color:#b86860}
    @media(max-width:760px){
      #characterModal{padding:0}
      #characterModal .modal{box-sizing:border-box;width:100vw;height:100svh;max-height:100svh;border-radius:0}
      #characterModal .modal-body{padding:6px}
      #characterModal .modal-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}
      #characterModal .modal-tabs button{min-width:0;padding:4px 2px;overflow-wrap:anywhere;font-size:var(--font-body)}
      #characterModal .character-layout{grid-template-columns:minmax(116px,40%) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:5px}
      #characterModal .v39-char-unit-detail{padding:5px}

    }
    @media(max-width:430px){

    }`;
  document.head.appendChild(style);
}

function resistancePopoverElement() {
  let popover = document.getElementById("v39ResistancePopover");
  if (popover instanceof HTMLElement) return popover;
  popover = document.createElement("div");
  popover.id = "v39ResistancePopover";
  popover.setAttribute("role", "tooltip");
  document.body.appendChild(popover);
  return popover;
}

function showResistancePopover(element) {
  if (!(element instanceof HTMLElement)) return;
  const label = text(element.dataset.v39ResistanceLabel);
  if (!label) return;
  const popover = resistancePopoverElement();
  const rect = element.getBoundingClientRect();
  const useBottom = rect.top < 52;
  popover.textContent = label;
  popover.style.left = `${Math.max(12, Math.min(window.innerWidth - 12, rect.left + rect.width / 2))}px`;
  popover.style.top = `${useBottom ? rect.bottom + 7 : rect.top - 7}px`;
  popover.style.transform = useBottom ? "translate(-50%,0)" : "translate(-50%,-100%)";
  popover.style.display = "block";
}

function hideResistancePopover() {
  const popover = document.getElementById("v39ResistancePopover");
  if (popover instanceof HTMLElement) popover.style.display = "none";
}

function install() {
  installStyles();
  document.addEventListener('change',event=>{
    if(event.target.matches?.('#characterModal [data-v39-character-squad-select]')){
      selectedId=event.target.value;selectedSquadId=selectedId;selectedSquadMemberId='';equipmentMessage='';expandedSkillName='';render();return;
    }
    if(!event.target.matches?.('#characterModal [data-v39-character-location]'))return;
    locationFilter=event.target.value;selectedId='';equipmentMessage='';expandedSkillName='';render();
  });

  document.addEventListener("pointerover", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const resistance = element?.closest("[data-v39-resistance-label]");
    if (resistance && resistance !== pinnedResistanceElement) showResistancePopover(resistance);
  });

  document.addEventListener("pointerout", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const resistance = element?.closest("[data-v39-resistance-label]");
    if (!resistance || resistance === pinnedResistanceElement) return;
    const next = event.relatedTarget instanceof Element ? event.relatedTarget : null;
    if (next && resistance.contains(next)) return;
    hideResistancePopover();
  });

  document.addEventListener("focusin", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const resistance = element?.closest("[data-v39-resistance-label]");
    if (resistance) showResistancePopover(resistance);
  });

  document.addEventListener("focusout", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    const resistance = element?.closest("[data-v39-resistance-label]");
    if (resistance && resistance !== pinnedResistanceElement) hideResistancePopover();
  });

  document.addEventListener("click", (event) => {
    const promotion=event.target instanceof Element?event.target.closest('[data-v39-class-acquire]'):null;
    if(promotion?.closest('#characterModal')) {
      const state=window.getV39GameState();
      if(!window.confirm('前提職の超過Lvを移して上位クラスを取得しますか？'))return;
      const result=acquireV39UpperClass(state,state.activePlayerId,detailUnitId(),promotion.dataset.v39ClassAcquire);
      equipmentMessage=result.ok?result.message:result.reason;
      if(result.ok)window.setV39GameState({players:result.state.players},{reason:'class-promotion'});
      window.refreshV39SquadDerivedUI?.();render();return;
    }
    const element = event.target instanceof Element ? event.target : null;
    const resistance = element?.closest("[data-v39-resistance-label]");
    if (resistance) {
      if (pinnedResistanceElement === resistance) {
        pinnedResistanceElement = null;
        hideResistancePopover();
      } else {
        pinnedResistanceElement = resistance;
        showResistancePopover(resistance);
      }
      return;
    }
    if (pinnedResistanceElement) {
      pinnedResistanceElement = null;
      hideResistancePopover();
    }
    if (element?.closest('[data-open="character"]')) {
      window.setTimeout(openCharacterModal, 0);
      return;
    }
    const squadEdit = element?.closest("[data-v39-character-squad-edit]");
    if (squadEdit) {
      window.openV39SquadEditor?.({squadId:squadEdit.dataset.v39CharacterSquadEdit,
        onClose:openCharacterModal});
      return;
    }
    const skill = element?.closest("[data-v39-character-skill]");
    if (skill) {
      expandedSkillName = expandedSkillName === skill.dataset.v39CharacterSkill ? "" : skill.dataset.v39CharacterSkill;
      for (const card of skill.parentElement.querySelectorAll("[data-v39-character-skill]")) {
        const expanded = card.dataset.v39CharacterSkill === expandedSkillName;
        card.classList.toggle("is-expanded", expanded);
        card.setAttribute("aria-expanded", String(expanded));
      }
      return;
    }
    const equipment = element?.closest("[data-v39-character-equip-open]");
    if (equipment) {
      openV39EquipmentPicker(detailUnitId(), equipment.dataset.v39CharacterEquipOpen, () => {
        equipmentMessage = "装備を更新しました";
        render();
      });
      return;
    }
    if(element?.closest('[data-v39-tool-settings-save]')) {
      if(window.isV39MapInputLocked?.())return;
      const state=window.getV39GameState(),rows=[...document.querySelectorAll('#characterModal [data-v39-tool-setting-row]')];
      const loadout=rows.map(row=>({name:row.querySelector('select').value,count:Number(row.querySelector('input').value)})).filter(row=>row.name);
      const result=setV39ToolLoadout(state,state.activePlayerId,detailUnitId(),loadout);
      if(result.ok)window.setV39GameState({players:result.state.players},{reason:'tool-loadout'});
      equipmentMessage=result.ok?'携帯設定を保存しました':result.reason;render({preserveDrafts:!result.ok});return;
    }
    const tab = element?.closest("[data-v39-character-tab]");
    const member = element?.closest('[data-v39-squad-member]');
    if (member) {
      selectedSquadMemberId = member.dataset.v39SquadMember;
      selectedId = faction()?.squads?.find(squad=>(squad.unitIds || squad.memberIds || []).includes(selectedSquadMemberId))?.id || selectedId;
      expandedSkillName = ''; equipmentMessage = ''; render(); return;
    }
    if (tab) {
      activeTab = text(tab.dataset.v39CharacterTab, "character");
      selectedId = activeTab==='squad'?selectedSquadId:"";
      expandedSkillName = "";
      equipmentMessage = "";
      render();
      return;
    }
    const detail = element?.closest("[data-v39-character-detail-tab]");
    if (detail) {
      detailTab = text(detail.dataset.v39CharacterDetailTab, "status");
      render();
      return;
    }
    const row = element?.closest("[data-v39-character-row]");
    if (row) {
      selectedId = text(row.dataset.v39CharacterRow);
      expandedSkillName = "";
      equipmentMessage = "";
      render();
    }
  });
  window.addEventListener("v39:game-state-changed", (event) => {
    if (event.detail?.reason === 'activity-log' || pendingRender) return;
    if (document.getElementById("characterModal")?.classList.contains("open")) pendingRender = requestAnimationFrame(() => {
      pendingRender = 0;
      if (document.getElementById("characterModal")?.classList.contains("open")) render();
    });
  });
  window.openV39CharacterModal = openCharacterModal;
  window.renderV39CharacterModal = render;
}

install();
