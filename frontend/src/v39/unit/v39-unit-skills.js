import { applyV39TerrainModifiers } from "../../lib/v39-terrain-modifiers.js";
import { getIconSrcByName } from "../../lib/icon-library.js";
import { resolveAttackApCost, resolveAttackPower, resolveAttackRawRange, resolveAttackRows, resolveSkillGuard, resolveSkillHealing } from "../../lib/v39-combat-engine.js";
import { getV39UnitTestTechniques } from "../../lib/v39-test-skill-rules.js";
import { inspectV39Passive } from "../../lib/v39-passive-rules.js";
import "./v39-unit-skills.css";
const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const num = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
function techniqueEntries(unit) {
  const normal = Array.isArray(unit?.techniques) ? unit.techniques.filter(Boolean) : [];
  const rows = [...normal];
  const names = new Set(normal.map(row => text(row?.name ?? row?.名前 ?? row?.source?.名前)).filter(Boolean));
  for (const row of getV39UnitTestTechniques(unit)) {
    const name = text(row?.name ?? row?.名前 ?? row?.source?.名前);
    if (!name || names.has(name)) continue;
    names.add(name);
    rows.push(row);
  }
  return rows;
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

function techniqueAccentClass(power, guard, healing) {
  const hasPower = Number(power) > 0;
  const hasGuard = Number(guard) > 0;
  const hasHealing = Number(healing) > 0;
  if (hasPower && hasGuard) return "technique-icon-mixed";
  if (hasGuard) return "technique-icon-guard";
  if (hasPower) return "technique-icon-power";
  if (hasHealing) return "technique-icon-heal";
  return "technique-icon-neutral";
}

function techniqueDurationLabel(row, source) {
  const raw = text(source?.効果時間 ?? row?.duration);
  if (!raw) return "";
  const match = raw.match(/^(\d+)\s*t$/i);
  return match ? `${match[1]}ターン` : raw;
}

function techniqueDescription(row, source) {
  return text(source?.詳細 ?? row?.detail ?? source?.説明 ?? row?.description);
}


export function renderV39UnitSkills(unit, {mapData, expandedName = "", interactive = false} = {}) {
    const rows = techniqueEntries(unit);
    const weaponAttackRows = resolveAttackRows(unit).filter(row => row?.装備攻撃 === true);
    const bodyNames = new Set(weaponAttackRows.filter(row => row.身体武器).map(row => row.名前));
    const activeRows = [
      ...weaponAttackRows,
      ...rows.filter(row => text(techniqueSource(row)?.行動 ?? row?.action).toUpperCase() !== "P"
        && !bodyNames.has(text(techniqueSource(row)?.名前 ?? row?.name)))
    ];
    const passiveRows = rows.filter(row => text(techniqueSource(row)?.行動 ?? row?.action).toUpperCase() === "P");
    const adjustedUnit = applyV39TerrainModifiers(unit, mapData);
    const renderTechnique = row => {
          const source = techniqueSource(row) || {};
          const name = text(source?.名前 ?? row?.name, "名称未設定");
          const action = text(source?.行動 ?? row?.action).toUpperCase();
          const apValue = action === "A" ? resolveAttackApCost(source, unit) : num(row?.apCost ?? source?.AP消費, null);
          const powerValue = action === "A"
            ? resolveAttackPower(source, adjustedUnit)
            : num(source?.威力 ?? row?.power, null);
          const rangeValue = action === "A"
            ? resolveAttackRawRange(source, adjustedUnit)
            : source?.射程補正 !== undefined
              ? `${num(source.射程補正,0) >= 0 ? "+" : ""}${num(source.射程補正,0)}`
              : num(row?.range ?? source?.射程, null);
          const guardValue = action === "A"
            ? resolveSkillGuard(source, adjustedUnit)
            : Math.max(0, num(source?.ガード ?? row?.guard, 0) || 0);
          const healingValue = action === "A"
            ? resolveSkillHealing(source, adjustedUnit)
            : Math.max(0, num(source?.回復 ?? row?.healing, 0) || 0);
          const icon = techniqueIconMarkup(source);
          const iconAccent = techniqueAccentClass(powerValue, guardValue, healingValue);
          const combatValueParts = [
            Number(powerValue) > 0 ? `威${powerValue}` : "",
            Number(guardValue) > 0 ? `守${guardValue}` : "",
            Number(healingValue) > 0 ? `回${healingValue}` : ""
          ].filter(Boolean);
          const combatValueText = combatValueParts.join("/");
          const durationLabel = techniqueDurationLabel(row, source);
          const description = techniqueDescription(row, source);
          const unsupported=action==="P" ? inspectV39Passive(source) : [];
          const expanded = name === expandedName;
          const detailHtml = `<span class="technique-detail-head"><b>説明</b>${durationLabel ? `<small>${escapeHtml(durationLabel)}</small>` : ""}</span>
            <span class="technique-detail-description">${description ? escapeHtml(description) : "説明なし"}${unsupported.length ? `<br>未対応: ${escapeHtml(unsupported.join(" / "))}` : ""}</span>`;
          const attackAttr = interactive && action === "A" ? ` data-v39-attack-name="${escapeHtml(name)}" aria-pressed="false"` : "";
          return `<button type="button" class="technique-card technique-select-card${action === "A" ? " action-technique" : ""}${expanded ? " is-expanded" : ""}" ${interactive ? "data-v39-technique-name" : "data-v39-character-skill"}="${escapeHtml(name)}" aria-expanded="${expanded}"${attackAttr}>
            <span class="technique-summary">
              <span class="technique-icon ${iconAccent}" data-attack-category="${escapeHtml(icon.category)}" title="${escapeHtml(icon.category)}">${icon.markup}</span>
              <b class="technique-name">${escapeHtml(name)}</b>
              <small class="technique-ap">AP ${apValue ?? "-"}</small>
              ${combatValueText ? `<span class="technique-power">${escapeHtml(combatValueText)}</span>` : ""}
              <span class="technique-range">射 ${rangeValue ?? "-"}</span>
            </span>
            <span class="technique-detail">${detailHtml}</span>
          </button>`;
        };
    const activeHtml = activeRows.map(renderTechnique).join("");
    const passiveHtml = passiveRows.length
      ? `<div class="technique-passive-divider">パッシブ</div>${passiveRows.map(renderTechnique).join("")}`
      : "";
    return activeRows.length || passiveRows.length
      ? activeHtml + passiveHtml
      : '<div class="squad-empty">行動データなし</div>';

}
