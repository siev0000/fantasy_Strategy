import { getGameDataRows } from "./game-data-registry.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

export function isV39TestSkillModeEnabled() {
  if (typeof window === "undefined") return false;
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

export function getV39TestSkillRows() {
  return getGameDataRows("テストスキル").filter(row => row?.テスト専用 === true && text(row?.名前));
}

export function getV39UnitTestSkillRows(unit) {
  if (!isV39TestSkillModeEnabled()) return [];
  const names = new Set((Array.isArray(unit?.testSkillNames) ? unit.testSkillNames : []).map(text).filter(Boolean));
  if (!names.size) return [];
  return getV39TestSkillRows().filter(row => names.has(text(row?.名前)));
}

export function getV39UnitTestTechniques(unit) {
  return getV39UnitTestSkillRows(unit).map(row => ({
    name:text(row?.名前),
    apCost:Number.isFinite(Number(row?.AP消費)) ? Number(row.AP消費) : null,
    hpCost:Number.isFinite(Number(row?.HP消費)) ? Number(row.HP消費) : null,
    range:row?.射程 ?? null,
    area:row?.範囲 ?? row?.炸裂 ?? null,
    target:row?.対象 ?? null,
    detail:text(row?.詳細),
    action:text(row?.行動),
    testOnly:true,
    source:row
  }));
}

export function isV39TestInstantDeathSkill(skillRow) {
  return skillRow?.テスト専用 === true && text(skillRow?.効果) === "即死";
}
