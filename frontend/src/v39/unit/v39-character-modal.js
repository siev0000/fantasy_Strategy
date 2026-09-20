import { currentV39TurnNumber, remainingV39Turns } from "../../lib/v39-turn-timing.js";

let activeTab = "character";
let selectedId = "";

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

function statusCards(unit) {
  const hp = Math.max(0, number(unit?.hp, unit?.currentHp));
  const maxHp = Math.max(1, number(unit?.maxHp, unit?.status?.HP || 1));
  const ap = Math.max(0, number(unit?.ap, unit?.currentAp));
  const maxAp = Math.max(1, number(unit?.maxAp, 100));
  const cards = [
    ["種族", unit?.race], ["クラス", unit?.className], ["Lv", unit?.level],
    ["HP", `${hp} / ${maxHp}`], ["AP", `${ap} / ${maxAp}`], ["状態", unit?.state || "生存"],
    ["攻撃", unit?.status?.攻撃], ["防御", unit?.status?.防御], ["魔力", unit?.status?.魔力],
    ["精神", unit?.status?.精神], ["速度", unit?.status?.速度], ["命中", unit?.status?.命中]
  ];
  if (number(unit?.guard) > 0) cards.splice(6, 0, ["ガード", Math.floor(number(unit.guard))]);
  return cards.map(([label, value]) => `<div class="detail-card"><span>${label}</span><b>${escapeHtml(value ?? "-")}</b></div>`).join("");
}

function unitDetail(unit) {
  if (!unit) return '<div class="detail-pane"><p>表示対象がありません。</p></div>';
  const skills = (Array.isArray(unit?.techniques) ? unit.techniques : [])
    .map((entry) => text(entry?.name ?? entry?.名前 ?? entry?.source?.名前)).filter(Boolean);
  const remainingTurns = remainingV39Turns(unit?.deadExpireTurn, currentV39TurnNumber());
  return `<div class="detail-pane">
    <h3 style="margin:3px 0 8px">${escapeHtml(unit.name)} / ${escapeHtml(unit.role || unit.state || "キャラクター")}</h3>
    <div class="detail-grid">${statusCards(unit)}</div>
    ${activeTab === "corpse" ? `<p>消滅まで ${remainingTurns}ターン / 座標 (${number(unit.x)}, ${number(unit.y)})</p>` : ""}
    ${activeTab === "dead" ? `<p>回収: ${new Date(number(unit?.reserveEntry?.storedAtMs, Date.now())).toLocaleTimeString("ja-JP")}</p>` : ""}
    <h4>取得スキル</h4><div class="costs">${skills.map((name) => `<span class="cost">${escapeHtml(name)}</span>`).join("") || '<span class="cost">なし</span>'}</div>
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
  if (!(body instanceof HTMLElement) || !current) return;
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
}

function install() {
  document.addEventListener("click", (event) => {
    const element = event.target instanceof Element ? event.target : null;
    if (element?.closest('[data-open="character"]')) window.setTimeout(render, 0);
    const tab = element?.closest("[data-v39-character-tab]");
    if (tab) {
      activeTab = text(tab.dataset.v39CharacterTab, "character");
      selectedId = "";
      render();
      return;
    }
    const row = element?.closest("[data-v39-character-row]");
    if (row) {
      selectedId = text(row.dataset.v39CharacterRow);
      render();
    }
  });
  window.addEventListener("v39:game-state-changed", () => {
    if (document.getElementById("characterModal")?.classList.contains("open")) render();
  });
  window.renderV39CharacterModal = render;
}

install();
