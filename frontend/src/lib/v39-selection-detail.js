import {
  classData,
  descriptionData,
  raceData,
  skillData
} from "./game-data-registry.js";
import { RACE_CLASS_NAME_MAP, RESISTANCE_FIELDS, SKILL_FIELD_DEFS } from "../constants/unitCommon.js";
import { computeSkillScaledTriplet } from "./skill-power.js";

export const V39_SELECTION_STATUS_ROWS = Object.freeze([
  Object.freeze(["HP", "攻撃", "防御", "魔力"]),
  Object.freeze(["精神", "速度", "命中", "SIZ"])
]);

const ACQUIRED_SKILL_FIELDS_LV5 = Object.freeze(["Skill1", "Skill2", "Skill3", "Skill4", "Skill5"]);

function text(value) {
  return String(value ?? "").trim();
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function placeholderSkill(value) {
  const valueText = text(value).toLowerCase();
  return !valueText || valueText === "0" || valueText === "-" || valueText === "－" || valueText === "なし" || valueText === "null";
}

function fieldKeys(field) {
  if (!field) return [];
  if (typeof field === "string") return [field];
  return [...new Set([
    text(field?.key),
    ...(Array.isArray(field?.aliases) ? field.aliases.map(text) : [])
  ].filter(Boolean))];
}

const classRows = Array.isArray(classData) ? classData.filter(row => text(row?.名前)) : [];
const classByName = new Map(classRows.map(row => [text(row?.名前), row]));
const raceRows = Array.isArray(raceData) ? raceData.filter(row => text(row?.key)) : [];
const raceByKey = new Map(raceRows.map(row => [text(row?.key), row]));
const descriptionBySkill = new Map(
  (Array.isArray(descriptionData) ? descriptionData : [])
    .map(row => [text(row?.技能名), text(row?.説明)])
    .filter(([name]) => name)
);
const skillByName = new Map(
  (Array.isArray(skillData) ? skillData : [])
    .map(row => [text(row?.名前), row])
    .filter(([name]) => name)
);

function skillValue(row, field) {
  for (const key of fieldKeys(field)) {
    const value = numberOrNull(row?.[key]);
    if (value !== null) return value;
  }
  return 0;
}

function skillDescription(field) {
  for (const key of fieldKeys(field)) {
    const description = descriptionBySkill.get(key);
    if (description) return description;
  }
  return "";
}

function acquiredSkillNames(row) {
  const out = [];
  const seen = new Set();
  for (const field of ACQUIRED_SKILL_FIELDS_LV5) {
    const name = text(row?.[field]);
    if (placeholderSkill(name) || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function displayValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return String(numeric);
  return text(value) || "-";
}

function actionType(value) {
  const valueText = text(value).toUpperCase();
  return valueText === "P" || valueText === "PASSIVE" || valueText === "パッシブ" ? "passive" : "action";
}

function buildAcquiredSkillRows(names, statusSource) {
  return names.map(name => {
    const row = skillByName.get(name) || {};
    const type = actionType(row?.行動);
    const scaled = computeSkillScaledTriplet(row, statusSource);
    return {
      name,
      ruby:text(row?.ルビ),
      family:displayValue(row?.系統),
      actionType:type,
      actionShort:type === "passive" ? "P" : "A",
      power:displayValue(scaled.power),
      state:displayValue(scaled.state),
      guard:displayValue(scaled.guard),
      apCost:displayValue(row?.AP消費),
      ct:displayValue(row?.CT),
      duration:displayValue(row?.効果時間),
      detail:displayValue(row?.詳細)
    };
  });
}

export function buildV39SelectionDetailFromClassRow(row) {
  if (!row) return null;
  const names = acquiredSkillNames(row);
  return {
    sourceRow:row,
    statusRows:V39_SELECTION_STATUS_ROWS.map((fields, index) => ({
      key:`status-row-${index}`,
      fields:fields.map(key => ({ key, value:numberOrNull(row?.[key]) }))
    })),
    skillRows:SKILL_FIELD_DEFS.map(field => ({
      key:field.key,
      label:field.label || field.key,
      value:skillValue(row, field),
      desc:skillDescription(field)
    })).filter(item => item.value > 0),
    resistanceRows:RESISTANCE_FIELDS
      .map(key => ({ key, value:numberOrNull(row?.[key]) }))
      .filter(item => item.value !== null && item.value !== 0),
    acquiredSkillNames:names,
    acquiredSkillRows:buildAcquiredSkillRows(names, row)
  };
}

export function getV39RaceSelectionDetail(raceKey) {
  const key = text(raceKey);
  const race = raceByKey.get(key);
  if (!race) return null;
  const className = RACE_CLASS_NAME_MAP[key] || text(race?.className) || key;
  const classRow = classByName.get(className) || null;
  return {
    kind:"race",
    key,
    name:text(race?.name) || key,
    summary:text(race?.summary),
    description:text(race?.detail),
    icon:text(race?.icon),
    className,
    ...buildV39SelectionDetailFromClassRow(classRow)
  };
}

export function getV39ClassSelectionDetail(className) {
  const name = text(className);
  const classRow = classByName.get(name);
  if (!classRow) return null;
  return {
    kind:"class",
    key:name,
    name,
    classType:text(classRow?.種類),
    description:text(classRow?.詳細),
    total:classRow?.合計 ?? "",
    ...buildV39SelectionDetailFromClassRow(classRow)
  };
}
