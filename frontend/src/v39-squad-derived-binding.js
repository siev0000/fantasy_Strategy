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
  const m = raw.match(/(\d+)/);
  return m ? `squad${m[1]}` : raw;
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
  return unit?.movement ?? unit?.move ?? unit?.moveRange ?? unit?.移動 ?? "-";
}

function statusValue(unit, key) {
  const value = unit?.status?.[key];
  return Number.isFinite(Number(value)) ? Number(value) : "-";
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

let selectedSquadKey = "squad1";
let selectedUnitId = "";

function getUnits() {
  const factionState = typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
  return Array.isArray(factionState?.units) ? factionState.units : [];
}

function getSquads() {
  const factionState = typeof window.getV39ActiveFactionState === "function"
    ? window.getV39ActiveFactionState()
    : null;
  const rows = Array.isArray(factionState?.squads) ? factionState.squads.filter(Boolean) : [];
  if (rows.length) return rows;
  const keys = [...new Set(getUnits().map(unit => squadKey(unit)))];
  return keys.map(key => ({ id:key, label:key === "solo" ? "単独" : key, unitIds:[] }));
}

function unitsForSelectedSquad() {
  const units = getUnits();
  const squad = getSquads().find(row => text(row?.id ?? row?.squadId ?? row?.key) === selectedSquadKey);
  const unitIds = new Set(Array.isArray(squad?.unitIds) ? squad.unitIds.map(String) : []);
  return unitIds.size
    ? units.filter((unit, index) => unitIds.has(unitId(unit, index)))
    : units.filter(unit => squadKey(unit) === selectedSquadKey);
}

function updateSelectorCounts() {
  const units = getUnits();
  const selector = document.getElementById("squadSelector");
  const squads = getSquads();
  if (!(selector instanceof HTMLElement)) return;
  const keys = squads.map(row => text(row?.id ?? row?.squadId ?? row?.key)).filter(Boolean);
  if (!keys.includes(selectedSquadKey)) selectedSquadKey = keys[0] || "";
  selector.innerHTML = squads.map((squad, index) => {
    const key = text(squad?.id ?? squad?.squadId ?? squad?.key, `squad-${index + 1}`);
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
    tech.innerHTML = rows.length
      ? rows.map((row) => {
          const cost = row.apCost != null ? `AP${row.apCost}` : (row.hpCost != null ? `HP${row.hpCost}` : "-");
          const meta = text(row.detail, row.range != null ? `射程${row.range}` : text(row.action, ""));
          return `<div class="technique-card"><b>${text(row.name, "名称未設定")}</b><small>${cost}</small><span>${meta}</span></div>`;
        }).join("")
      : '<div class="squad-empty">技データなし</div>';
  }
}

function render() {
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

  selector.addEventListener("click", (event) => {
    const btn = event.target instanceof Element ? event.target.closest("[data-squad-select]") : null;
    if (!btn) return;
    selectedSquadKey = btn.dataset.squadSelect || "squad1";
    selectedUnitId = "";
    window.setTimeout(scheduleRender, 0);
  }, true);

  list.addEventListener("click", (event) => {
    const card = event.target instanceof Element ? event.target.closest("[data-v39-unit-id]") : null;
    if (!card) return;
    selectedUnitId = card.dataset.v39UnitId || "";
    scheduleRender();
  }, true);

  window.addEventListener("v39:game-state-changed", scheduleRender);
  window.refreshV39SquadDerivedUI = render;
  window.getV39SelectedSquadUnit = () => {
    const units = unitsForSelectedSquad();
    return units.find((item, index) => unitId(item, index) === selectedUnitId) || units[0] || null;
  };

  render();
}

install();
