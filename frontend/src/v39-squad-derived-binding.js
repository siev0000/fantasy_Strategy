import { applyV39TerrainModifiers } from "./lib/v39-terrain-modifiers.js";
import { getIconSrcByName } from "./lib/icon-library.js";
import { resolveAttackApCost, resolveAttackPower, resolveAttackRange, resolveSkillGuard } from "./lib/v39-combat-engine.js";

function text(value, fallback = "") {
  const out = String(value ?? "").trim();
  return out || fallback;
}

function num(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampPercent(current, max) {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(100, (current / max) * 100));
}

function unitId(unit, index) {
  return text(unit?.id ?? unit?.unitId ?? unit?.characterId ?? unit?.名前, `unit-${index}`);
}

function unitName(unit, index) {
  return text(unit?.name ?? unit?.displayName ?? unit?.名前, `ユニット${index + 1}`);
}

function squadKey(unit) {
  if (unit?.solo === true || unit?.isSolo === true) return "solo";
  const raw = text(unit?.squadId ?? unit?.squadKey ?? unit?.groupId ?? unit?.partyId ?? unit?.squad);
  if (!raw) return "squad1";
  if (raw === "solo" || raw === "単独") return "solo";
  if (/^squad\d+$/i.test(raw)) return raw.toLowerCase();
  const match = raw.match(/(\d+)/);
  return match ? `squad${match[1]}` : raw;
}

function unitPosition(unit) {
  const x = num(unit?.x ?? unit?.tileX ?? unit?.pos?.x, null);
  const y = num(unit?.y ?? unit?.tileY ?? unit?.pos?.y, null);
  return x !== null && y !== null ? `(${x},${y})` : "(-,-)";
}

function hpValues(unit) {
  const max = Math.max(0, num(unit?.maxHp ?? unit?.status?.HP, 0));
  const current = Math.max(0, num(unit?.hp ?? unit?.currentHp, max));
  return { current, max };
}

function apValues(unit) {
  const max = Math.max(0, num(unit?.maxAp ?? unit?.apMax ?? unit?.status?.AP, 0));
  const current = Math.max(0, num(unit?.ap ?? unit?.currentAp, max));
  return { current, max };
}

function gauge(kind, label, values) {
  const pct = clampPercent(values.current, values.max);
  return `<div class="v39-card-vital ${kind}">
    <span class="v39-card-vital-label">${label}</span>
    <span class="v39-card-vital-track">
      <i class="v39-card-vital-fill" style="width:${pct.toFixed(2)}%"></i>
      <b class="v39-card-vital-value">${values.current}/${values.max}</b>
    </span>
  </div>`;
}

function roleText(unit) {
  const role = text(unit?.role ?? unit?.positionRole);
  const race = text(unit?.race ?? unit?.raceName ?? unit?.種族);
  const className = text(unit?.className ?? unit?.class ?? unit?.クラス);
  if (role) return role;
  if (race && className) return `${race} / ${className}`;
  return className || race || "-";
}

function movementValue(unit) {
  return unit?.movement ?? unit?.status?.移動 ?? unit?.move ?? unit?.moveRange ?? unit?.移動 ?? "-";
}

function statusValue(unit, key) {
  const adjusted = applyV39TerrainModifiers(unit, window.__v39FieldRuntime?.mapData);
  const value = adjusted?.status?.[key];
  if (!Number.isFinite(Number(value))) return "-";
  const modifier = num(adjusted?.terrainModifiers?.[key], 0);
  return modifier ? `${Number(value)} (${modifier > 0 ? "+" : ""}${modifier})` : Number(value);
}

function skillEntries(unit) {
  const source = unit?.skillLevels && typeof unit.skillLevels === "object" ? unit.skillLevels : {};
  return Object.entries(source)
    .map(([name, value]) => [name, Number(value)])
    .filter(([, value]) => Number.isFinite(value) && value !== 0);
}

function techniqueEntries(unit) {
  return Array.isArray(unit?.techniques) ? unit.techniques.filter(Boolean) : [];
}

function techniqueSource(technique) {
  return technique?.source && typeof technique.source === "object" ? technique.source : technique;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const BODY_ATTACK_METHODS = new Set(["素手", "角", "牙", "爪", "翼", "尾", "吐息", "針"]);

function techniqueAttackCategory(source = {}) {
  const method = text(source?.攻撃手段);
  if (method === "武器") return "武器";
  if (method === "魔法") return "魔法";
  if (BODY_ATTACK_METHODS.has(method)) return "肉体";
  return "その他";
}

function techniqueIconMarkup(source = {}) {
  const category = techniqueAttackCategory(source);
  if (category === "その他") {
    return { category, markup:'<span class="technique-icon-glyph" aria-hidden="true">◆</span>' };
  }
  const src = getIconSrcByName(category, "肉体");
  return {
    category,
    markup:`<img class="technique-icon-image" src="${escapeHtml(src)}" alt="" aria-hidden="true">`
  };
}

function techniqueAccentClass(power, guard) {
  const hasPower = Number(power) > 0;
  const hasGuard = Number(guard) > 0;
  if (hasPower && hasGuard) return "technique-icon-mixed";
  if (hasGuard) return "technique-icon-guard";
  if (hasPower) return "technique-icon-power";
  return "technique-icon-neutral";
}

function techniqueDetailRows(row, source) {
  const candidates = [
    ["行動", source?.行動 ?? row?.action],
    ["系統", source?.系統 ?? row?.system],
    ["攻撃手段", source?.攻撃手段 ?? row?.attackMethod],
    ["判定", source?.判定 ?? row?.judge],
    ["範囲", source?.範囲 ?? row?.area],
    ["炸裂", source?.炸裂 ?? row?.splash],
    ["攻撃回数", source?.攻撃回数 ?? row?.attackCount],
    ["ガード", source?.ガード ?? row?.guard],
    ["待機", source?.待機 ?? row?.cast],
    ["CT", source?.CT ?? row?.cooldown],
    ["効果時間", source?.効果時間 ?? row?.duration],
    ["効果", source?.効果 ?? row?.effect],
    ["条件", source?.条件 ?? row?.condition],
    ["説明", row?.detail ?? source?.詳細 ?? source?.説明]
  ];
  return candidates.filter(([, value]) => value !== null && value !== undefined && text(value) && text(value) !== "-");
}

function setExpandedTechnique(name = "") {
  expandedTechniqueName = text(name);
  const list = document.getElementById("detailTechniqueList");
  if (!(list instanceof HTMLElement)) return;
  list.querySelectorAll("[data-v39-technique-name]").forEach(card => {
    const expanded = text(card?.dataset?.v39TechniqueName) === expandedTechniqueName;
    card.classList.toggle("is-expanded", expanded);
    card.setAttribute("aria-expanded", String(expanded));
  });
}

function notifyDetailRendered(unit = null) {
  window.dispatchEvent(new CustomEvent("v39:squad-detail-rendered", {
    detail:{ unitId:unit ? unitId(unit) : "" }
  }));
}

let selectedSquadKey = "squad1";
let selectedUnitId = "";
let expandedTechniqueName = "";

function getFactionState() {
  return typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
}

function getUnits() {
  const factionState = getFactionState();
  return Array.isArray(factionState?.units) ? factionState.units : [];
}

function getSquads() {
  const factionState = getFactionState();
  const rows = Array.isArray(factionState?.squads) ? factionState.squads.filter(Boolean) : [];
  if (rows.length) return rows;
  const keys = [...new Set(getUnits().map(unit => squadKey(unit)))];
  return keys.map(key => ({ id:key, label:key === "solo" ? "単独" : key, unitIds:[] }));
}

function squadIdOf(row, index = 0) {
  return text(row?.id ?? row?.squadId ?? row?.key, `squad-${index + 1}`);
}

function unitsForSquad(key) {
  const units = getUnits();
  const squad = getSquads().find((row, index) => squadIdOf(row, index) === key);
  const unitIds = new Set(Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : []);
  return unitIds.size
    ? units.filter((unit, index) => unitIds.has(unitId(unit, index)))
    : units.filter(unit => squadKey(unit) === key);
}

function unitsForSelectedSquad() {
  return unitsForSquad(selectedSquadKey);
}

function squadKeyForUnitId(targetUnitId) {
  const id = text(targetUnitId);
  if (!id) return "";
  const squads = getSquads();
  for (let index = 0; index < squads.length; index += 1) {
    const squad = squads[index];
    const ids = Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : [];
    if (ids.includes(id)) return squadIdOf(squad, index);
  }
  const units = getUnits();
  const unit = units.find((row, index) => unitId(row, index) === id);
  return unit ? squadKey(unit) : "";
}

function findUnit(targetUnitId) {
  const id = text(targetUnitId);
  return getUnits().find((row, index) => unitId(row, index) === id) || null;
}

function syncSelectionFromGameState() {
  const faction = getFactionState();
  const authoritativeId = text(faction?.selectedUnitId);
  if (!authoritativeId || !findUnit(authoritativeId)) return;
  selectedUnitId = authoritativeId;
  const key = squadKeyForUnitId(authoritativeId);
  if (key) selectedSquadKey = key;
}

function persistSelectedUnit(targetUnitId, reason = "squad-unit-selected") {
  const id = text(targetUnitId);
  const unit = findUnit(id);
  if (!id || !unit) return;
  const faction = getFactionState();
  if (text(faction?.selectedUnitId) !== id && typeof window.updateV39ActiveFactionState === "function") {
    window.updateV39ActiveFactionState({ selectedUnitId:id }, { reason });
  }
  window.dispatchEvent(new CustomEvent("v39:unit-selected", { detail:{ unitId:id, unit } }));
}

function updateSelectorCounts() {
  const units = getUnits();
  const selector = document.getElementById("squadSelector");
  const squads = getSquads();
  if (!(selector instanceof HTMLElement)) return;
  const keys = squads.map((row, index) => squadIdOf(row, index)).filter(Boolean);
  if (!keys.includes(selectedSquadKey)) selectedSquadKey = keys[0] || "";
  selector.innerHTML = squads.map((squad, index) => {
    const key = squadIdOf(squad, index);
    const ids = new Set(Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : []);
    const count = ids.size
      ? units.filter((unit, unitIndex) => ids.has(unitId(unit, unitIndex))).length
      : units.filter(unit => squadKey(unit) === key).length;
    const label = text(squad?.label ?? squad?.name, key === "solo" ? "単独" : key);
    return `<button class="squad-select-btn${key === selectedSquadKey ? " active" : ""}" data-squad-select="${key}"><b>${label}</b><small>${count}体</small></button>`;
  }).join("");
}

function renderMemberList() {
  const list = document.getElementById("squadMemberList");
  if (!(list instanceof HTMLElement)) return;

  const units = unitsForSelectedSquad();
  if (!units.length) {
    selectedUnitId = "";
    list.innerHTML = '<div class="squad-empty">この部隊に実ユニットはいません</div>';
    return;
  }

  if (!units.some((unit, index) => unitId(unit, index) === selectedUnitId)) {
    selectedUnitId = unitId(units[0], 0);
  }

  list.innerHTML = units.map((unit, index) => {
    const id = unitId(unit, index);
    const selected = id === selectedUnitId;
    const hp = hpValues(unit);
    const ap = apValues(unit);
    const icon = text(unit?.icon ?? unit?.glyph ?? unit?.symbol, "◆");
    return `<button class="squad-card ${selected ? "selected" : ""}" data-v39-unit-id="${id}">
      <div class="squad-card-top">
        <div class="squad-main">
          <span class="squad-icon">${icon}</span>
          <div class="squad-name-wrap">
            <b class="squad-name">${unitName(unit, index)}</b>
            <small class="squad-pos">${unitPosition(unit)}</small>
          </div>
        </div>
      </div>
      <div class="squad-bars" data-v39-gauge="1">
        ${gauge("hp", "HP", hp)}
        ${gauge("ap", "AP", ap)}
      </div>
    </button>`;
  }).join("");
}

function renderDetail() {
  const units = unitsForSelectedSquad();
  const unit = units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0];
  const pane = document.getElementById("squadDetailPane");
  if (!unit) {
    if (pane) pane.dataset.empty = "1";
    const prof = document.getElementById("detailProficiencyList");
    const tech = document.getElementById("detailTechniqueList");
    if (prof) prof.innerHTML = '<div class="squad-empty">技能データなし</div>';
    if (tech) tech.innerHTML = '<div class="squad-empty">技データなし</div>';
    notifyDetailRendered();
    return;
  }
  if (pane) delete pane.dataset.empty;

  const level = Math.max(1, Math.round(num(unit?.level ?? unit?.lv ?? unit?.Lv, 1)));
  const map = {
    detailRole: roleText(unit),
    detailLevel: `Lv${level}`,
    detailAtk: statusValue(unit, "攻撃"),
    detailDef: statusValue(unit, "防御"),
    detailMatk: statusValue(unit, "魔力"),
    detailMdef: statusValue(unit, "精神"),
    detailSpd: statusValue(unit, "速度"),
    detailHit: statusValue(unit, "命中"),
    detailSiz: statusValue(unit, "SIZ"),
    detailMov: movementValue(unit)
  };
  Object.entries(map).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  });
  const guard = Math.max(0, Math.floor(num(unit?.guard, 0)));
  const guardChip = document.getElementById("detailGuard");
  if (guardChip) {
    guardChip.hidden = guard <= 0;
    guardChip.textContent = guard > 0 ? `ガード ${guard}` : "";
  }

  const prof = document.getElementById("detailProficiencyList");
  if (prof) {
    const rows = skillEntries(unit);
    prof.innerHTML = rows.length
      ? rows.map(([name, value]) => `<div class="proficiency-item"><span>${name}</span><b>${value}</b></div>`).join("")
      : '<div class="squad-empty">技能データなし</div>';
  }

  const tech = document.getElementById("detailTechniqueList");
  if (tech) {
    const rows = techniqueEntries(unit);
    const adjustedUnit = applyV39TerrainModifiers(unit, window.__v39FieldRuntime?.mapData);
    tech.innerHTML = rows.length
      ? rows.map(row => {
          const source = techniqueSource(row) || {};
          const name = text(source?.名前 ?? row?.name, "名称未設定");
          const action = text(source?.行動 ?? row?.action).toUpperCase();
          const apValue = action === "A" ? resolveAttackApCost(source) : num(row?.apCost ?? source?.AP消費, null);
          const powerValue = action === "A"
            ? resolveAttackPower(source, adjustedUnit)
            : num(source?.威力 ?? row?.power, null);
          const rangeValue = action === "A"
            ? resolveAttackRange(source, adjustedUnit)
            : num(row?.range ?? source?.射程, null);
          const guardValue = action === "A"
            ? resolveSkillGuard(source, adjustedUnit)
            : Math.max(0, num(source?.ガード ?? row?.guard, 0) || 0);
          const icon = techniqueIconMarkup(source);
          const iconAccent = techniqueAccentClass(powerValue, guardValue);
          const details = techniqueDetailRows(row, source);
          const expanded = name === expandedTechniqueName;
          const detailHtml = details.length
            ? details.map(([label, value]) => `<span class="technique-detail-row"><em>${escapeHtml(label)}</em><b>${escapeHtml(value)}</b></span>`).join("")
            : '<span class="technique-detail-empty">追加情報なし</span>';
          const attackAttr = action === "A" ? ` data-v39-attack-name="${escapeHtml(name)}" aria-pressed="false"` : "";
          return `<button type="button" class="technique-card technique-select-card${action === "A" ? " action-technique" : ""}${expanded ? " is-expanded" : ""}" data-v39-technique-name="${escapeHtml(name)}" aria-expanded="${expanded}"${attackAttr}>
            <span class="technique-summary">
              <span class="technique-icon ${iconAccent}" data-attack-category="${escapeHtml(icon.category)}" title="${escapeHtml(icon.category)}">${icon.markup}</span>
              <b class="technique-name">${escapeHtml(name)}</b>
              <small class="technique-ap">AP ${apValue ?? "-"}</small>
              <span class="technique-power">威力 ${powerValue ?? "-"}</span>
              <span class="technique-range">射 ${rangeValue ?? "-"}</span>
            </span>
            <span class="technique-detail">${detailHtml}</span>
          </button>`;
        }).join("")
      : '<div class="squad-empty">技データなし</div>';
  }
  notifyDetailRendered(unit);
}

function render() {
  syncSelectionFromGameState();
  updateSelectorCounts();
  renderMemberList();
  renderDetail();
  if (typeof window.refreshV39SquadCardVitals === "function") {
    queueMicrotask(() => window.refreshV39SquadCardVitals());
  }
}

function scheduleRender(event) {
  if (event?.detail?.reason === "active-player") {
    selectedSquadKey = "";
    selectedUnitId = "";
  }
  requestAnimationFrame(render);
}

function install() {
  const selector = document.getElementById("squadSelector");
  const list = document.getElementById("squadMemberList");
  if (!(selector instanceof HTMLElement) || !(list instanceof HTMLElement)) {
    window.setTimeout(install, 50);
    return;
  }

  const active = selector.querySelector("[data-squad-select].active");
  selectedSquadKey = active?.dataset?.squadSelect || "squad1";
  syncSelectionFromGameState();

  selector.addEventListener("click", event => {
    const btn = event.target instanceof Element ? event.target.closest("[data-squad-select]") : null;
    if (!btn) return;
    selectedSquadKey = btn.dataset.squadSelect || "squad1";
    expandedTechniqueName = "";
    const first = unitsForSquad(selectedSquadKey)[0] || null;
    selectedUnitId = first ? unitId(first, 0) : "";
    if (selectedUnitId) persistSelectedUnit(selectedUnitId, "squad-selection-changed");
    scheduleRender();
  }, true);

  list.addEventListener("click", event => {
    const card = event.target instanceof Element ? event.target.closest("[data-v39-unit-id]") : null;
    if (!card) return;
    selectedUnitId = card.dataset.v39UnitId || "";
    expandedTechniqueName = "";
    if (selectedUnitId) persistSelectedUnit(selectedUnitId, "squad-unit-selected");
    scheduleRender();
  }, true);

  const techniqueList = document.getElementById("detailTechniqueList");
  techniqueList?.addEventListener("click", event => {
    const card = event.target instanceof Element ? event.target.closest("[data-v39-technique-name]") : null;
    if (!card) return;
    const name = text(card.dataset.v39TechniqueName);
    setExpandedTechnique(expandedTechniqueName === name ? "" : name);
  }, true);

  window.addEventListener("v39:game-state-changed", scheduleRender);
  window.addEventListener("v39:unit-selected", scheduleRender);
  window.refreshV39SquadDerivedUI = render;
  window.getV39SelectedSquadUnit = () => {
    syncSelectionFromGameState();
    const units = unitsForSelectedSquad();
    return units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0] || null;
  };

  render();
}

install();
