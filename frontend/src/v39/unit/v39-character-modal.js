import { currentV39TurnNumber, remainingV39Turns } from "../../lib/v39-turn-timing.js";
import { EQUIPMENT_SLOT_KEYS, RESISTANCE_FIELDS, SKILL_FIELD_DEFS } from "../../constants/unitCommon.js";
import { formatResistanceValue, getResistanceIconSrc, resistanceValueTone } from "../../lib/resistance-display.js";

let activeTab = "character";
let selectedId = "";
let detailTab = "status";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = (value) => text(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const isDead = (unit) => text(unit?.state) === "死亡" || number(unit?.hp, unit?.currentHp) <= 0;

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

function skillLevel(unit, field) {
  const keys = [field?.key, ...(Array.isArray(field?.aliases) ? field.aliases : [])].map(value => text(value)).filter(Boolean);
  for (const key of keys) {
    const raw = Number(unit?.skillLevels?.[key]);
    if (Number.isFinite(raw)) return Math.max(0, Math.round(raw));
  }
  return 0;
}

function statusPanel(unit) {
  const hp = Math.max(0, number(unit?.hp, unit?.currentHp));
  const maxHp = Math.max(1, number(unit?.maxHp, unit?.status?.HP || 1));
  const ap = Math.max(0, number(unit?.ap, unit?.currentAp));
  const maxAp = Math.max(1, number(unit?.maxAp, 100));
  const status = [
    ["HP", `${hp} / ${maxHp}`],
    ["AP", `${ap} / ${maxAp}`],
    ["攻撃", unit?.status?.攻撃],
    ["防御", unit?.status?.防御],
    ["魔力", unit?.status?.魔力],
    ["精神", unit?.status?.精神],
    ["速度", unit?.status?.速度],
    ["命中", unit?.status?.命中],
    ["SIZ", unit?.status?.SIZ]
  ];
  if (number(unit?.guard) > 0) status.splice(2, 0, ["ガード", Math.floor(number(unit.guard))]);
  const statusHtml = status.map(([label, value]) => `<div class="detail-card"><span>${label}</span><b>${escapeHtml(value ?? "-")}</b></div>`).join("");
  const skillsHtml = SKILL_FIELD_DEFS.map((field) => `<div class="v39-char-skill-row"><span>${escapeHtml(field.label || field.key)}</span><b>${skillLevel(unit, field)}</b></div>`).join("");
  const resistanceHtml = RESISTANCE_FIELDS
    .map((key) => [key, Number(unit?.resistances?.[key])])
    .filter(([, value]) => Number.isFinite(value) && value !== 0)
    .map(([key, value]) => {
      const iconSrc = getResistanceIconSrc(key);
      const tone = resistanceValueTone(value);
      return `<div class="v39-char-resistance-row ${tone}">
        <span class="v39-char-resistance-label">
          ${iconSrc ? `<img src="${escapeHtml(iconSrc)}" alt="${escapeHtml(key)} アイコン" class="v39-char-resistance-icon">` : ""}
          <span>${escapeHtml(key)}</span>
        </span>
        <b>${escapeHtml(formatResistanceValue(value))}</b>
      </div>`;
    }).join("");
  return `<div class="v39-char-detail-scroll">
    <h4>ステータス</h4>
    <div class="detail-grid v39-char-status-grid">${statusHtml}</div>
    <h4>技能</h4>
    <div class="v39-char-skill-grid">${skillsHtml}</div>
    <h4>耐性</h4>
    <div class="v39-char-resistance-grid">${resistanceHtml || '<span class="v39-char-empty">補正なし</span>'}</div>
  </div>`;
}

function techniqueMeta(entry) {
  const rows = [];
  if (Number.isFinite(Number(entry?.apCost))) rows.push(["AP", Math.round(Number(entry.apCost))]);
  if (Number.isFinite(Number(entry?.hpCost)) && Number(entry.hpCost) !== 0) rows.push(["HP", Math.round(Number(entry.hpCost))]);
  if (entry?.range !== null && entry?.range !== undefined && text(entry.range)) rows.push(["射程", entry.range]);
  if (entry?.area !== null && entry?.area !== undefined && text(entry.area)) rows.push(["範囲", entry.area]);
  if (entry?.target !== null && entry?.target !== undefined && text(entry.target)) rows.push(["対象", entry.target]);
  if (text(entry?.action)) rows.push(["行動", entry.action]);
  return rows;
}

function skillsPanel(unit) {
  const techniques = Array.isArray(unit?.techniques) ? unit.techniques : [];
  if (!techniques.length) return '<div class="v39-char-detail-scroll"><p class="v39-char-empty">取得スキルなし</p></div>';
  return `<div class="v39-char-detail-scroll v39-char-technique-list">${techniques.map((entry) => {
    const name = text(entry?.name ?? entry?.名前 ?? entry?.source?.名前, "名称不明");
    const meta = techniqueMeta(entry);
    return `<article class="v39-char-technique-card">
      <header><strong>${escapeHtml(name)}</strong>${Number.isFinite(Number(entry?.apCost)) ? `<span>AP ${Math.round(Number(entry.apCost))}</span>` : ""}</header>
      ${meta.length ? `<div class="v39-char-technique-meta">${meta.map(([label, value]) => `<span><small>${escapeHtml(label)}</small><b>${escapeHtml(value)}</b></span>`).join("")}</div>` : ""}
      ${text(entry?.detail) ? `<p>${escapeHtml(entry.detail)}</p>` : ""}
    </article>`;
  }).join("")}</div>`;
}

function equipmentPanel(unit) {
  const equipment = Array.isArray(unit?.equipment) ? unit.equipment : [];
  return `<div class="v39-char-detail-scroll">
    <h4>装備</h4>
    <div class="v39-char-equipment-list">${EQUIPMENT_SLOT_KEYS.map((slot) => {
      const item = equipment.find((row) => text(row?.slot) === slot);
      const quality = text(item?.qualityLabel || item?.quality);
      return `<div class="v39-char-equipment-row"><span>${escapeHtml(slot)}</span><b>${escapeHtml(item?.name || "なし")}${quality ? ` [${escapeHtml(quality)}]` : ""}</b></div>`;
    }).join("")}</div>
    <p class="v39-char-note">装備の変更・生成・付与は装備画面から行います。</p>
  </div>`;
}

function growthPanel(unit) {
  const derived = unit?.derivedCharacter;
  const raceLevel = Math.max(0, Math.floor(number(derived?.raceLevels, 0)));
  const classLevel = Math.max(0, Math.floor(number(derived?.classLevels, 0)));
  const secondClassName = text(derived?.secondClassName || unit?.secondClassName || unit?.subClassName);
  const rows = [
    ["総合Lv", Math.max(1, Math.floor(number(unit?.level, 1)))],
    [`${text(unit?.race, "種族")} Lv`, raceLevel],
    [`${text(unit?.className, "クラス")} Lv`, classLevel]
  ];
  if (secondClassName) rows.push([`${secondClassName} Lv`, 1]);
  return `<div class="v39-char-detail-scroll">
    <h4>成長</h4>
    <div class="v39-char-growth-list">${rows.map(([label, value]) => `<div class="v39-char-growth-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("")}</div>
    <p class="v39-char-note">種族Lvは内部Lvのみ表示し、初期種族ボーナスLv5は表示値に含めません。</p>
  </div>`;
}

function detailTabs(unit) {
  const tabs = [["status", "ステータス技能"], ["skills", "スキル"], ["equipment", "装備"], ["growth", "成長"]];
  const panel = detailTab === "skills" ? skillsPanel(unit)
    : detailTab === "equipment" ? equipmentPanel(unit)
    : detailTab === "growth" ? growthPanel(unit)
    : statusPanel(unit);
  return `<div class="v39-char-detail-tabs">${tabs.map(([key, label]) => `<button type="button" class="${key === detailTab ? "active" : ""}" data-v39-character-detail-tab="${key}">${label}</button>`).join("")}</div>
    <div class="v39-char-detail-panel">${panel}</div>`;
}

function unitDetail(unit) {
  if (!unit) return '<div class="detail-pane"><p>表示対象がありません。</p></div>';
  const remainingTurns = remainingV39Turns(unit?.deadExpireTurn, currentV39TurnNumber());
  const role = text(unit?.role || unit?.state, "キャラクター");
  return `<div class="detail-pane v39-char-unit-detail">
    <div class="v39-char-unit-head">
      <h3>${escapeHtml(unit.name)}</h3>
      <div class="v39-char-unit-meta">
        <div><span>Lv</span><b>${Math.max(1, Math.floor(number(unit?.level, 1)))}</b></div>
        <div><span>種族</span><b>${escapeHtml(unit?.race || "-")}</b></div>
        <div><span>クラス</span><b>${escapeHtml(unit?.className || "-")}</b></div>
        <div><span>役割</span><b>${escapeHtml(role)}</b></div>
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
      <div class="list-pane">${rows.map((row, index) => {
        const id = idFor(row, index);
        const label = activeTab === "squad"
          ? `${row.name || row.label || row.id}`
          : `${row.name || row.id}　Lv${number(row.level, 1)}`;
        return `<button class="char-row${id === selectedId ? " active" : ""}" data-v39-character-row="${escapeHtml(id)}">${escapeHtml(label)}</button>`;
      }).join("") || '<div class="char-row">該当なし</div>'}</div>
      ${activeTab === "squad" ? squadDetail(selected, current) : unitDetail(selected)}
    </div>`;
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
    #characterModal .v39-char-unit-detail{display:grid;grid-template-rows:auto auto minmax(0,1fr);height:100%;min-height:0;overflow:hidden}
    #characterModal .v39-char-unit-head{padding-bottom:8px}
    #characterModal .v39-char-unit-head h3{margin:3px 0 8px;font-size:22px}
    #characterModal .v39-char-unit-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
    #characterModal .v39-char-unit-meta>div{display:grid;gap:2px;border:1px solid #31464d;border-radius:6px;background:#17252a;padding:6px 8px;min-width:0}
    #characterModal .v39-char-unit-meta span{font-size:12px;color:#91a3a7}
    #characterModal .v39-char-unit-meta b{font-size:15px;overflow-wrap:anywhere}
    #characterModal .v39-char-detail-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:0 0 7px}
    #characterModal .v39-char-detail-tabs button{min-width:0;min-height:38px;border:1px solid #41565d;border-radius:6px;background:#17242a;color:#dce6e5;padding:5px 4px;font-size:14px;font-weight:700}
    #characterModal .v39-char-detail-tabs button.active{border-color:#65d4e6;background:#17323a;color:#f3ffff}
    #characterModal .v39-char-detail-panel{height:100%;min-height:0;overflow:hidden;border:1px solid #31464d;border-radius:7px;background:#0f191d}
    #characterModal .v39-char-detail-scroll{height:100%;overflow:auto;padding:8px}
    #characterModal .v39-char-detail-scroll h4{margin:5px 0 7px}
    #characterModal .v39-char-status-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
    #characterModal .v39-char-skill-grid,#characterModal .v39-char-resistance-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
    #characterModal .v39-char-skill-row,#characterModal .v39-char-resistance-row,#characterModal .v39-char-equipment-row,#characterModal .v39-char-growth-row{display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid #31464d;border-radius:6px;background:#17252a;padding:7px 9px;min-width:0}
    #characterModal .v39-char-skill-row span,#characterModal .v39-char-resistance-row span,#characterModal .v39-char-equipment-row span,#characterModal .v39-char-growth-row span{color:#a8b8ba}
    #characterModal .v39-char-resistance-label{min-width:0;display:flex;align-items:center;gap:6px}
    #characterModal .v39-char-resistance-label>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #characterModal .v39-char-resistance-icon{width:20px;height:20px;flex:0 0 auto;object-fit:contain;border-radius:4px}
    #characterModal .v39-char-resistance-row.positive{border-color:rgba(104,205,139,.5);background:rgba(25,59,39,.72)}
    #characterModal .v39-char-resistance-row.positive b{color:#7de0a0}
    #characterModal .v39-char-resistance-row.negative{border-color:rgba(224,116,99,.52);background:rgba(67,31,29,.72)}
    #characterModal .v39-char-resistance-row.negative b{color:#f08f7f}
    #characterModal .v39-char-equipment-list,#characterModal .v39-char-growth-list{display:grid;gap:6px}
    #characterModal .v39-char-equipment-row b{overflow-wrap:anywhere;text-align:right}
    #characterModal .v39-char-note,#characterModal .v39-char-empty{color:#9eafb2;font-size:13px}
    #characterModal .v39-char-empty-panel{display:grid;place-items:center;min-height:160px}
    #characterModal .v39-char-technique-list{display:grid;align-content:start;gap:7px}
    #characterModal .v39-char-technique-card{border:1px solid #3a5057;border-radius:7px;background:#17252a;padding:8px}
    #characterModal .v39-char-technique-card header{display:flex;justify-content:space-between;gap:8px;align-items:center}
    #characterModal .v39-char-technique-card header strong{font-size:16px}
    #characterModal .v39-char-technique-card header>span{border:1px solid #56676c;border-radius:5px;padding:3px 6px;font-size:13px}
    #characterModal .v39-char-technique-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;margin-top:6px}
    #characterModal .v39-char-technique-meta>span{display:grid;gap:1px;border:1px solid #31464d;border-radius:5px;padding:4px 6px}
    #characterModal .v39-char-technique-meta small{color:#91a3a7}
    #characterModal .v39-char-technique-card p{margin:7px 0 0;color:#d5dfde;line-height:1.45}
    @media(max-width:760px){
      #characterModal .character-layout{grid-template-columns:minmax(92px,28%) minmax(0,1fr);grid-template-rows:minmax(0,1fr)}
      #characterModal .v39-char-unit-meta{grid-template-columns:repeat(2,minmax(0,1fr))}
      #characterModal .v39-char-detail-tabs button{font-size:12px;padding:4px 2px}
      #characterModal .v39-char-status-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
      #characterModal .v39-char-technique-meta{grid-template-columns:repeat(2,minmax(0,1fr))}
    }
    @media(max-width:430px){
      #characterModal .v39-char-unit-head h3{font-size:19px}
      #characterModal .v39-char-detail-tabs{gap:3px}
      #characterModal .v39-char-detail-tabs button{font-size:11px;min-height:36px}
      #characterModal .v39-char-skill-row,#characterModal .v39-char-resistance-row{padding:6px}
    }`;
  document.head.appendChild(style);
}

function install() {
  installStyles();
  document.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-open="character"]')) {
      window.setTimeout(openCharacterModal, 0);
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
