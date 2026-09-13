import classDb from "../../data/source/export/json/クラス.json";
import skillDb from "../../data/source/export/json/スキル一覧.json";
import { RACE_CLASS_NAME_MAP, SKILL_LEVEL_FIELDS, STATUS_GROWTH_FIELDS } from "./constants/unitCommon.js";
import { buildCharacterStatusFromRules, buildUnitSkillLevelsFromRules } from "./composables/unitStatusUtils.js";

const INITIAL_RACE_BONUS_LEVEL = 5;
const STATUS_GROWTH_DIVISOR = 10;

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isPlaceholder(value) {
  const valueText = text(value).toLowerCase();
  return !valueText || valueText === "0" || valueText === "-" || valueText === "－" || valueText === "なし" || valueText === "null";
}

const classRows = Array.isArray(classDb) ? classDb : [];
const skillRows = Array.isArray(skillDb) ? skillDb : [];
const classByName = new Map(classRows.map(row => [text(row?.名前), row]).filter(([name]) => name));
const skillByName = new Map(skillRows.map(row => [text(row?.名前), row]).filter(([name]) => name));

function resolveRaceName(unit = {}) {
  return text(unit.race ?? unit.raceName ?? unit.種族);
}

function resolveClassName(unit = {}) {
  return text(unit.className ?? unit.class ?? unit.クラス);
}

function resolveSecondClassName(unit = {}) {
  return text(unit.secondClassName ?? unit.subClassName ?? unit.第二クラス);
}

function resolveLevel(unit = {}) {
  return Math.max(1, Math.round(number(unit.level ?? unit.lv ?? unit.Lv, 1)));
}

function resolveRaceRow(raceName) {
  const mappedName = RACE_CLASS_NAME_MAP[raceName] || raceName;
  return classByName.get(mappedName) || null;
}

function internalLevels(level, isHumanRace) {
  if (isHumanRace) return { raceLevels: 0, classLevels: level };
  return {
    raceLevels: Math.ceil(level / 2),
    classLevels: Math.floor(level / 2)
  };
}

function skillNameAt(row, level) {
  const index = Math.max(1, Math.round(number(level, 1)));
  const candidates = [row?.[`Skill${index}`], row?.[`スキル${index}`]];
  for (const candidate of candidates) {
    if (!isPlaceholder(candidate)) return text(candidate);
  }
  return "";
}

function collectSkills(row, levels) {
  const out = [];
  const count = Math.max(0, Math.round(number(levels, 0)));
  for (let level = 1; level <= count; level += 1) {
    const name = skillNameAt(row, level);
    if (name) out.push(name);
  }
  return out;
}

function techniqueFromName(name) {
  const row = skillByName.get(name) || null;
  if (!row) return { name, apCost: null, hpCost: null, range: null, area: null, target: null, detail: "", action: "", source: null };
  return {
    name,
    apCost: Number.isFinite(Number(row.AP消費)) ? Number(row.AP消費) : null,
    hpCost: Number.isFinite(Number(row.HP消費)) ? Number(row.HP消費) : null,
    range: row.射程 ?? null,
    area: row.範囲 ?? row.炸裂 ?? null,
    target: row.対象 ?? null,
    detail: text(row.詳細),
    action: text(row.行動),
    source: row
  };
}

export function deriveV39CharacterFromRaceClass(unit = {}) {
  const race = resolveRaceName(unit);
  const className = resolveClassName(unit);
  const secondClassName = resolveSecondClassName(unit);
  const level = resolveLevel(unit);
  const raceRow = resolveRaceRow(race);
  const classRow = classByName.get(className) || null;

  if (!race || !className || !raceRow || !classRow) {
    return {
      ok: false,
      race,
      className,
      level,
      missing: {
        race: !race,
        className: !className,
        raceRow: !!race && !raceRow,
        classRow: !!className && !classRow
      }
    };
  }

  const isHumanRace = text(raceRow.種類) === "人族";
  const { raceLevels, classLevels } = internalLevels(level, isHumanRace);

  const statusResult = buildCharacterStatusFromRules({
    raceRow,
    classRow,
    level,
    raceLevels,
    classLevels,
    isHumanRace,
    statusGrowthFields: STATUS_GROWTH_FIELDS,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR,
    raceLevelBaseOffset: INITIAL_RACE_BONUS_LEVEL,
    defaultSizBase: 100
  });

  const skillLevels = buildUnitSkillLevelsFromRules({
    raceRow,
    classRow,
    raceLevels,
    classLevels,
    raceLevelBaseOffset: INITIAL_RACE_BONUS_LEVEL,
    skillLevelFields: SKILL_LEVEL_FIELDS,
    statusGrowthDivisor: STATUS_GROWTH_DIVISOR
  });

  const acquiredNames = [
    ...collectSkills(raceRow, raceLevels),
    ...collectSkills(classRow, classLevels)
  ];

  let secondClassRow = null;
  if (isHumanRace && level >= 10 && secondClassName && secondClassName !== className) {
    secondClassRow = classByName.get(secondClassName) || null;
    if (secondClassRow) acquiredNames.push(...collectSkills(secondClassRow, 1));
  }

  const uniqueNames = [...new Set(acquiredNames.filter(Boolean))];
  const techniques = uniqueNames.map(techniqueFromName);
  const status = statusResult.status || {};

  return {
    ok: true,
    race,
    className,
    secondClassName: secondClassRow ? secondClassName : "",
    level,
    isHumanRace,
    raceLevels,
    classLevels,
    initialRaceBonusLevel: INITIAL_RACE_BONUS_LEVEL,
    status,
    skillLevels,
    acquiredSkillNames: uniqueNames,
    techniques,
    uiStats: {
      atk: number(status.攻撃),
      def: number(status.防御),
      matk: number(status.魔力),
      mdef: number(status.精神),
      spd: number(status.速度),
      hit: number(status.命中),
      siz: number(status.SIZ, 100)
    },
    maxHp: number(status.HP),
    raceRow,
    classRow,
    secondClassRow
  };
}

export function applyV39DerivedCharacterData(unit = {}) {
  const derived = deriveV39CharacterFromRaceClass(unit);
  if (!derived.ok) return { ...unit, derivedCharacter: derived };
  return {
    ...unit,
    race: derived.race,
    className: derived.className,
    level: derived.level,
    status: { ...derived.status },
    skillLevels: { ...derived.skillLevels },
    acquiredSkillNames: [...derived.acquiredSkillNames],
    techniques: derived.techniques.map(row => ({ ...row })),
    derivedCharacter: derived,
    maxHp: derived.maxHp
  };
}

window.deriveV39CharacterFromRaceClass = deriveV39CharacterFromRaceClass;
window.applyV39DerivedCharacterData = applyV39DerivedCharacterData;
