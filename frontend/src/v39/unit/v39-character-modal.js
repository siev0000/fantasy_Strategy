import { renderV39UnitSkills } from "./v39-unit-skills.js";
import { openV39EquipmentPicker } from "./v39-equipment-picker.js";
import { isMobUnit } from "../../composables/unitCoreUtils.js";
import { currentV39TurnNumber, remainingV39Turns } from "../../lib/v39-turn-timing.js";
import { EQUIPMENT_SLOT_KEYS } from "../../constants/unitCommon.js";
import { renderV39UnitAbility, renderV39DetailTabs } from "./v39-unit-detail.js";
import { renderV39UnitCard } from "./v39-unit-card.js";

let activeTab = "character";
let selectedId = "";
let detailTab = "status";
let pinnedResistanceElement = null;
let expandedSkillName = "";
let equipmentMessage = "";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;

function unitListRow(unit, id, selected) {
  return renderV39UnitCard(unit, {id,selected,character:true,dead:isDead(unit)});
}
function faction() {
  return window.getV39ActiveFactionState?.() || null;
}

function rowsForTab(current) {
  if (activeTab === "character") return current.units.filter((unit) => !isDead(unit));
  if (activeTab === "squad") return current.squads;
  if (activeTab === "corpse") return current.units.filter(isDead);
  if (activeTab === "dead") return current.deadUnitReserve.map((entry) => ({ ...entry.unit, reserveEntry:entry }));
  return [];
}

function statusPanel(unit) {
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll">${renderV39UnitAbility(unit, {mapData:window.__v39FieldRuntime?.mapData})}</div>`;
}
function skillsPanel(unit) {
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll"><div class="technique-list v39-char-technique-list">${renderV39UnitSkills(unit, {mapData:window.__v39FieldRuntime?.mapData, expandedName:expandedSkillName})}</div></div>`;
}
function equipmentPanel(unit) {
  const equipment = Array.isArray(unit?.equipment) ? unit.equipment : [];
  const fixed = isMobUnit(unit) || isDead(unit);
  return `<div class="squad-detail-tab-panel v39-char-detail-scroll">
    <p class="v39-char-note">${fixed ? "このユニットの装備は変更できません。" : "装備を押して変更候補と性能を比較"}</p>
    <div class="v39-char-equipment-list">${EQUIPMENT_SLOT_KEYS.map(slot => {
      const item = equipment.find(row => text(row?.slot) === slot);
      const quality = text(item?.qualityLabel || item?.quality);
      return `<button type="button" class="v39-char-equipment-row" data-v39-character-equip-open="${escapeHtml(slot)}"${fixed ? " disabled" : ""}><span>${escapeHtml(slot)}</span><b>${escapeHtml(item?.name || "なし")}${quality ? ` [${escapeHtml(quality)}]` : ""}</b></button>`;
    }).join("")}</div><output class="v39-char-note" aria-live="polite">${escapeHtml(equipmentMessage)}</output>
  </div>`;
}
function growthPanel(unit) {
  const derived = unit?.derivedCharacter;
  const raceLevel = Math.max(0, Math.floor(number(derived?.raceLevels, 0)));
  const classLevel = Math.max(0, Math.floor(number(derived?.classLevels, 0)));
  const secondClassName = text(derived?.secondClassName || unit?.secondClassName || unit?.subClassName);
  const rows = [
    ["総合Lv", Math.max(1, Math.floor(number(unit?.level, 1)))],
    [`${text(unit?.race, "種族")} Lv`, derived?.growthCaps?.raceLevels > 0 ? `${raceLevel} / ${derived.growthCaps.raceLevels}` : raceLevel],
    [`${text(unit?.className, "クラス")} Lv`, derived?.growthCaps ? `${classLevel} / ${derived.growthCaps.classLevels}` : classLevel]
  ];
  for (const [name,levels] of Object.entries(derived?.prerequisiteClassLevels || {})) rows.push([`${name} Lv`,levels]);
  if (secondClassName) rows.push([`${secondClassName} Lv`, 1]);
  if (derived?.strongAnimalClassName) rows.push([`${derived.strongAnimalClassName} Lv`, derived.strongAnimalClassLevel]);
  return `<div class="v39-char-detail-scroll">
    <h4>成長</h4>
    <div class="v39-char-growth-list">${rows.map(([label, value]) => `<div class="v39-char-growth-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>
    <p class="v39-char-note">種族Lvは内部Lvのみ表示し、初期種族ボーナスLv5は表示値に含めません。</p>
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
function unitDetail(unit) {
  if (!unit) return '<div class="detail-pane"><p>表示対象がありません。</p></div>';
  const remainingTurns = remainingV39Turns(unit?.deadExpireTurn, currentV39TurnNumber());
  const role = text(unit?.role || unit?.state, "キャラクター");
  return `<div class="detail-pane squad-detail-pane v39-char-unit-detail">
    <div class="v39-char-unit-head">
      <div class="squad-detail-minihead v39-char-unit-meta">
        <span class="squad-detail-chip">${escapeHtml(unit?.race || '-')} / ${escapeHtml(unit?.className || '-')}</span>
        <span class="squad-detail-chip">${escapeHtml(role)} ・ Lv${Math.max(1, Math.floor(number(unit?.level, 1)))}</span>
      </div>
      ${activeTab === "corpse" ? `<p>消滅まで ${remainingTurns}ターン / 座標 (${number(unit.x)}, ${number(unit.y)})</p>` : ""}
      ${activeTab === "dead" ? `<p>回収: ${new Date(number(unit?.reserveEntry?.storedAtMs, Date.now())).toLocaleTimeString("ja-JP")}</p>` : ""}
    </div>
    ${detailTabs(unit)}
  </div>`;
}

function squadDetail(squad, current) {
  if (!squad) return '<div class="detail-pane"><p>表示対象がありません。</p></div>';
  const ids = Array.isArray(squad.unitIds) ? squad.unitIds : Array.isArray(squad.memberIds) ? squad.memberIds : [];
  const members = current.units.filter((unit) => ids.includes(unit.id));
  return `<div class="detail-pane"><h3 style="margin:3px 0 8px">${escapeHtml(squad.name || squad.label || squad.id)}</h3>
    ${squad.id !== "solo" && squad.id !== "単独" ? `<button type="button" class="v39-char-squad-action" data-v39-character-squad-edit="${escapeHtml(squad.id)}">編制変更</button>` : ""}
    <div class="detail-grid"><div class="detail-card"><span>人数</span><b>${members.length}</b></div><div class="detail-card"><span>ID</span><b>${escapeHtml(squad.id)}</b></div></div>
    <h4>メンバー</h4><div class="costs">${members.map((unit) => `<span class="cost">${escapeHtml(unit.name)}</span>`).join("") || '<span class="cost">なし</span>'}</div></div>`;
}

function render() {
  const modal = document.getElementById("characterModal");
  const body = modal?.querySelector(".modal-body");
  const current = faction();
  if (!(body instanceof HTMLElement)) return false;
  if (!current) {
    body.innerHTML = '<div class="detail-pane v39-char-empty-panel"><p class="v39-char-empty">ゲーム開始後にキャラクター情報を表示します。</p></div>';
    return false;
  }
  const rows = rowsForTab(current);
  const idFor = (row, index) => text(row?.id, `row-${index}`);
  if (!rows.some((row, index) => idFor(row, index) === selectedId)) selectedId = idFor(rows[0], 0);
  const selected = rows.find((row, index) => idFor(row, index) === selectedId) || null;
  const tabs = [["character", "キャラクター"], ["squad", "部隊"], ["corpse", "死体回収"], ["dead", "死亡者一覧"]];
  body.innerHTML = `
    <div class="modal-tabs">${tabs.map(([key, label]) => `<button class="${key === activeTab ? "active" : ""}" data-v39-character-tab="${key}">${label}</button>`).join("")}</div>
    <div class="character-layout">
      <div class="list-pane">${activeTab === "squad" ? '<button type="button" class="v39-char-squad-action" id="v39-squad-edit" data-v39-character-squad-edit="">新規部隊</button>' : ""}${rows.map((row, index) => {
        const id = idFor(row, index);
        if (activeTab !== "squad") return unitListRow(row, id, id === selectedId);
        const label = `${row.name || row.label || row.id}`;
        return `<button class="char-row${id === selectedId ? " active" : ""}" data-v39-character-row="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
      }).join("") || '<div class="char-row">該当なし</div>'}</div>
      ${activeTab === "squad" ? squadDetail(selected, current) : unitDetail(selected)}
    </div>`;
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
    #characterModal .v39-char-squad-action{font-size:var(--font-body);min-height:34px;padding:6px 10px;border:1px solid #53717c;border-radius:6px;background:#172d35;color:#e8efec;margin-bottom:6px}
    #characterModal .v39-char-unit-detail{display:grid;grid-template-rows:auto auto minmax(0,1fr);height:100%;min-height:0;overflow:hidden}
    #characterModal .v39-char-unit-head{padding-bottom:8px}
    #characterModal .modal{width:min(900px,96vw);height:min(780px,94svh)}
    #characterModal .modal-body{display:grid;grid-template-rows:auto minmax(0,1fr);min-height:0;overflow:hidden;gap:7px}
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
      #characterModal .modal{width:100vw;height:100svh;max-height:100svh;border-radius:0}
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
      openV39EquipmentPicker(selectedId, equipment.dataset.v39CharacterEquipOpen, () => {
        equipmentMessage = "装備を更新しました";
        render();
      });
      return;
    }
    const tab = element?.closest("[data-v39-character-tab]");
    if (tab) {
      activeTab = text(tab.dataset.v39CharacterTab, "character");
      selectedId = "";
      detailTab = "status";
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
      detailTab = "status";
      expandedSkillName = "";
      equipmentMessage = "";
      render();
    }
  });
  window.addEventListener("v39:game-state-changed", () => {
    if (document.getElementById("characterModal")?.classList.contains("open")) render();
  });
  window.openV39CharacterModal = openCharacterModal;
  window.renderV39CharacterModal = render;
}

install();
