import { classData as classDb, skillData as skillDb, testClassData as testClassDb, testSkillData as testSkillDb } from "../../lib/game-data-registry.js";
import { isV39TestSkillModeEnabled } from "../../lib/v39-test-skill-rules.js";
import { RACE_CLASS_NAME_MAP, RESISTANCE_FIELDS, SKILL_LEVEL_FIELDS, STATUS_GROWTH_FIELDS } from "../../constants/unitCommon.js";
import { buildCharacterStatusFromRules, buildUnitResistances, buildUnitSkillLevelsFromRules, rowStatusVector } from "../../composables/unitStatusUtils.js";
import { applyMilitaryProfileToStatus } from "../../composables/militaryUnitUtils.js";
import { buildV39EquipmentResistanceBonus, normalizeV39EquipmentItem } from "../../lib/v39-equipment-rules.js";
import { resolveV39MovementStatFromStatus } from "../../lib/v39-gameplay-balance.js";
import {applyV39SizStatusModifiers} from '../../lib/v39-siz-status-rules.js';
import { isV39InvalidDataToken } from "../../lib/v39-class-rules.js";
import { deriveV39BodyWeaponLevels } from "../../lib/v39-body-weapon-rules.js";
import { getV39PassiveRows, isV39ConditionalPassive, collectV39PassiveBonuses, addV39PassiveValues } from "../../lib/v39-passive-rules.js";
import { V39_BODY_WEAPON_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { resolveV39FacilityClassGrowth } from "../../lib/v39-facility-growth-rules.js";

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
  return isV39InvalidDataToken(value);
}

const classRows = Array.isArray(classDb) ? classDb : [];
const skillRows = Array.isArray(skillDb) ? skillDb : [];
const testClassRows = Array.isArray(testClassDb) ? testClassDb : [];
const testSkillRows = Array.isArray(testSkillDb) ? testSkillDb : [];
const classByName = new Map(classRows.map(row => [text(row?.名前), row]).filter(([name]) => name));
const skillByName = new Map(skillRows.map(row => [text(row?.名前), row]).filter(([name]) => name));
const testClassByName = new Map(testClassRows.map(row => [text(row?.名前), row]).filter(([name]) => name));
const testSkillByName = new Map(testSkillRows.map(row => [text(row?.名前), row]).filter(([name]) => name));

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

function techniqueFromName(name, { allowTest = false } = {}) {
  const row = skillByName.get(name) || (allowTest ? testSkillByName.get(name) : null) || null;
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
  let level = resolveLevel(unit);
  const raceRow = resolveRaceRow(race);
  const testMode = unit.testOnly === true || isV39TestSkillModeEnabled();
  const classRow = classByName.get(className) || (testMode ? testClassByName.get(className) : null) || null;

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
  const facilityGrowth = unit.summonGrowth||unit.fusionGrowth||unit.promotionGrowthStart||unit.undeadGrowthStart||unit.reincarnationGrowthStart?null:resolveV39FacilityClassGrowth({...unit,level},raceRow.種類);
  if (facilityGrowth) level = Math.min(level,facilityGrowth.levelCap);
  const strongAnimalClassName = text(unit.strongAnimalClassName);
  const strongAnimalClassRow = classByName.get(strongAnimalClassName) || null;
  const strongAnimalClassLevel = strongAnimalClassRow
    ? Math.max(0, Math.min(level - 1, Math.round(number(unit.strongAnimalClassLevel)))) : 0;
  const baseLevel = level - strongAnimalClassLevel;
  let { raceLevels, classLevels:totalClassLevels } = internalLevels(baseLevel, isHumanRace);
  const prerequisiteClasses = Object.entries(unit.prerequisiteClassLevels || {})
    .filter(([name,levels]) => name !== className && (!(unit.summonGrowth||unit.fusionGrowth)||name!==race) && (classByName.has(name)||(testMode&&testClassByName.has(name))) && Number(levels) > 0)
    .map(([name,levels]) => ({name,levels:Math.floor(Number(levels)),row:classByName.get(name)||(testMode?testClassByName.get(name):null)}));
  let classLevels = Math.max(0,totalClassLevels - prerequisiteClasses.reduce((sum,item) => sum + item.levels,0));
  // 施設徴兵の初期配分を保持し、その後に得たLvだけ通常の成長配分へ渡す。
  if (unit.classGrowthStart && prerequisiteClasses.length) {
    const start = unit.classGrowthStart;
    const gained = internalLevels(Math.max(0,baseLevel - number(start.level,baseLevel)),isHumanRace);
    raceLevels = Math.max(0,number(start.raceLevels)) + gained.raceLevels;
    classLevels = Math.max(0,number(start.classLevels)) + gained.classLevels;
  }
  if (facilityGrowth) {
    raceLevels = facilityGrowth.raceLevels;
    classLevels = facilityGrowth.classLevels;
  }
  if(unit.promotionGrowthStart) {
    const start=unit.promotionGrowthStart;
    const gained=internalLevels(Math.max(0,baseLevel-number(start.level,baseLevel)),isHumanRace);
    raceLevels=Math.max(0,number(start.raceLevels))+gained.raceLevels;
    classLevels=Math.max(0,number(start.classLevels))+gained.classLevels;
  }
  if(unit.undeadGrowthStart) {
    const start=unit.undeadGrowthStart;
    const gained=internalLevels(Math.max(0,baseLevel-number(start.level,baseLevel)),isHumanRace);
    raceLevels=Math.max(0,number(start.raceLevels))+gained.raceLevels;
    classLevels=Math.max(0,number(start.classLevels))+gained.classLevels;
  }

  if(unit.fusionGrowth?.levelsByClass) {
    raceLevels=Math.max(0,number(unit.fusionGrowth.levelsByClass[race]));
    classLevels=race===className?0:Math.max(0,number(unit.fusionGrowth.levelsByClass[className]));
  }
  if(unit.summonGrowth?.levelsByClass) {
    raceLevels=Math.max(0,number(unit.summonGrowth.levelsByClass[race]));
    classLevels=race===className?0:Math.max(0,number(unit.summonGrowth.levelsByClass[className]));
  }
  if(unit.reincarnationGrowthStart){
    const start=unit.reincarnationGrowthStart;
    const gained=internalLevels(Math.max(0,baseLevel-number(start.level,baseLevel)),isHumanRace);
    raceLevels=Math.max(0,number(start.raceLevels))+gained.raceLevels;
    classLevels=Math.max(0,number(start.classLevels))+gained.classLevels;
  }

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
  const resistances = buildUnitResistances(raceRow, classRow, { resistanceFields:RESISTANCE_FIELDS });

  for (const prior of prerequisiteClasses) {
    const growth = rowStatusVector(prior.row,{statusGrowthFields:STATUS_GROWTH_FIELDS,statusGrowthDivisor:STATUS_GROWTH_DIVISOR});
    for (const key of STATUS_GROWTH_FIELDS) statusResult.status[key] += growth[key] * prior.levels;
    const skills = buildUnitSkillLevelsFromRules({classRow:prior.row,classLevels:prior.levels,
      skillLevelFields:SKILL_LEVEL_FIELDS,statusGrowthDivisor:STATUS_GROWTH_DIVISOR});
    for (const key of SKILL_LEVEL_FIELDS) skillLevels[key] += skills[key];
    for (const key of RESISTANCE_FIELDS) resistances[key] += number(prior.row[key]);
  }

  if (strongAnimalClassRow && strongAnimalClassLevel > 0) {
    const growth = rowStatusVector(strongAnimalClassRow, {statusGrowthFields:STATUS_GROWTH_FIELDS,statusGrowthDivisor:STATUS_GROWTH_DIVISOR});
    for (const key of STATUS_GROWTH_FIELDS) statusResult.status[key] += growth[key] * strongAnimalClassLevel;
    const skills = buildUnitSkillLevelsFromRules({classRow:strongAnimalClassRow,classLevels:strongAnimalClassLevel,
      skillLevelFields:SKILL_LEVEL_FIELDS,statusGrowthDivisor:STATUS_GROWTH_DIVISOR});
    for (const key of SKILL_LEVEL_FIELDS) skillLevels[key] += skills[key];
    for (const key of RESISTANCE_FIELDS) resistances[key] += number(strongAnimalClassRow[key]);
  }

  const acquiredNames = [
    ...prerequisiteClasses.flatMap(prior => collectSkills(prior.row,prior.levels)),
    ...collectSkills(raceRow, raceLevels),
    ...collectSkills(classRow, classLevels)
  ];
  if (strongAnimalClassRow) acquiredNames.push(...collectSkills(strongAnimalClassRow, strongAnimalClassLevel));
  // Direct fusion rewards are permanent, independent of class skill unlock levels.
  const fusionSkillNames = Array.isArray(unit.fusionGrowth?.acquiredSkillNames)
    ? unit.fusionGrowth.acquiredSkillNames.filter(name => typeof name === 'string' && !isPlaceholder(name)).map(text) : [];
  acquiredNames.push(...fusionSkillNames);
  acquiredNames.push(...(unit.reincarnationInheritedSkillNames||[]));

  let secondClassRow = null;
  if ((isHumanRace && level >= 10 || unit.reincarnationSecondClassName===secondClassName) && secondClassName && secondClassName !== className) {
    secondClassRow = classByName.get(secondClassName) || null;
    if (secondClassRow) acquiredNames.push(...collectSkills(secondClassRow, 1));
  }

  const uniqueNames = [...new Set(acquiredNames.filter(Boolean))];
  const techniques = uniqueNames.map(name => {
    const technique = techniqueFromName(name, { allowTest:testMode });
    return !technique.source && fusionSkillNames.includes(name)
      ? {...technique, detail:'スキル一覧に未登録のため、名前のみ保持しています。効果はありません。'} : technique;
  });
  const basePassives=getV39PassiveRows({techniques}).filter(row=>!isV39ConditionalPassive(row));
  const passiveBonuses=collectV39PassiveBonuses(basePassives);
  const sized=applyV39SizStatusModifiers(statusResult.status||{},skillLevels);
  const status = addV39PassiveValues(applyMilitaryProfileToStatus(sized.status, unit?.combatProfile),passiveBonuses.status);
  const bodyWeaponLevels=deriveV39BodyWeaponLevels([raceRow,classRow,secondClassRow,strongAnimalClassRow,...prerequisiteClasses.map(prior=>prior.row)]);
  for (const [key,value] of Object.entries(passiveBonuses.bodyWeaponValues)) {
    bodyWeaponLevels[key]=(bodyWeaponLevels[key]||0)+value/V39_BODY_WEAPON_BALANCE.levelDivisor;
  }

  return {
    ok: true,
    race,
    className,
    secondClassName: secondClassRow ? secondClassName : "",
    level,
    isHumanRace,
    raceLevels,
    classLevels,
    prerequisiteClassLevels:Object.fromEntries(prerequisiteClasses.map(prior => [prior.name,prior.levels])),
    growthCaps:facilityGrowth?.caps || null,
    baseLevel,
    strongAnimalClassName:strongAnimalClassRow ? strongAnimalClassName : "",
    strongAnimalClassLevel,
    initialRaceBonusLevel: INITIAL_RACE_BONUS_LEVEL,
    status,
    skillLevels:addV39PassiveValues(sized.skillLevels,passiveBonuses.skillLevels),
    sizModifiers:sized.modifiers,
    resistances:addV39PassiveValues(resistances,passiveBonuses.resistances),
    passiveBaseSkillNames:basePassives.map(row=>row.名前),
    passiveDiagnostics:passiveBonuses.unsupported,
    passiveBonuses,
    acquiredSkillNames: uniqueNames,
    techniques,
    bodyWeaponLevels,
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
  const equipment = (Array.isArray(unit?.equipment) ? unit.equipment : [])
    .map(normalizeV39EquipmentItem)
    .filter(Boolean);
  const equipmentResistances = buildV39EquipmentResistanceBonus(equipment);
  const resistances = Object.fromEntries(RESISTANCE_FIELDS.map(key => [
    key,
    number(derived.resistances?.[key]) + number(equipmentResistances?.[key])
  ]));
  const status = { ...derived.status };
  for (const item of equipment) {
    for (const [key, value] of Object.entries(item?.statusBonus || {})) {
      if (Object.prototype.hasOwnProperty.call(status, key)) status[key] = number(status[key]) + number(value);
    }
    for (const [key, value] of Object.entries(item?.enchantBonus || {})) {
      if (Object.prototype.hasOwnProperty.call(status, key)) status[key] = number(status[key]) + number(value);
    }
  }
  const movement = resolveV39MovementStatFromStatus(status, {
    legCount: derived.raceRow?.脚数
  });
  status.移動 = movement + number(derived.passiveBonuses?.status?.移動);
  if(unit.testOnly===true)status.移動=Math.max(status.移動,number(unit.testMovementMinimum));
  const maxHp=number(status.HP,derived.maxHp),oldMax=Number(unit.maxHp??unit.status?.HP),currentHp=Number(unit.hp??unit.currentHp);
  let hpPatch={};
  if(oldMax>0&&Number.isFinite(currentHp)&&oldMax!==maxHp){
    const hp=currentHp<=0||unit.state==='死亡'?0:Math.max(1,Math.min(maxHp,Math.round(maxHp*Math.min(1,currentHp/oldMax))));
    hpPatch={hp,currentHp:hp};
  }
  return {
    ...unit,
    ...hpPatch,
    race: derived.race,
    className: derived.className,
    level: derived.level,
    movement:status.移動,
    status,
    squadSupportModifiers:{},
    squadSupportSkillModifiers:{},
    squadSupportResistanceModifiers:{},
    skillLevels: { ...derived.skillLevels },
    resistances: { ...resistances, ...(unit?.resistanceOverrides || {}) },
    equipment,
    acquiredSkillNames: [...derived.acquiredSkillNames],
    passiveBaseSkillNames:[...derived.passiveBaseSkillNames],
    passiveDiagnostics:[...derived.passiveDiagnostics],
    techniques: derived.techniques.map(row => ({ ...row })),
    bodyWeaponLevels: { ...derived.bodyWeaponLevels },
    derivedCharacter: derived,
    maxHp
  };
}

if(typeof window!=='undefined'){
  window.deriveV39CharacterFromRaceClass = deriveV39CharacterFromRaceClass;
  window.applyV39DerivedCharacterData = applyV39DerivedCharacterData;
}
