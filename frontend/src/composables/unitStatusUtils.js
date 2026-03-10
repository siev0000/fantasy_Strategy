export function formatStatusCompact(status) {
  if (!status) return "-";
  return `HP${status.HP} 攻${status.攻撃} 防${status.防御} 魔${status.魔力} 精${status.精神} 速${status.速度} 命${status.命中} SIZ${status.SIZ}`;
}

export function rowStatusVector(row, options = {}) {
  const fields = Array.isArray(options?.statusGrowthFields) ? options.statusGrowthFields : [];
  const divisor = Number.isFinite(options?.statusGrowthDivisor) ? options.statusGrowthDivisor : 1;
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

  const out = {};
  for (const key of fields) {
    const raw = Math.max(0, toSafeNumber(row?.[key], 0));
    out[key] = Math.max(0, Math.round(raw / Math.max(divisor, 1)));
  }
  return out;
}

export function buildUnitSkillLevelsFromClass(classRow, options = {}) {
  const fields = Array.isArray(options?.skillLevelFields) ? options.skillLevelFields : [];
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const out = {};
  for (const key of fields) {
    const raw = toSafeNumber(classRow?.[key], 0);
    out[key] = Math.max(0, Math.round(raw));
  }
  return out;
}

export function buildUnitSkillLevelsFromRules(input) {
  const raceRow = input?.raceRow || {};
  const classRow = input?.classRow || {};
  const raceLevelsRaw = input?.raceLevels;
  const classLevelsRaw = input?.classLevels;
  const raceLevelBaseOffset = Number.isFinite(input?.raceLevelBaseOffset) ? input.raceLevelBaseOffset : 0;
  const skillLevelFields = Array.isArray(input?.skillLevelFields) ? input.skillLevelFields : [];
  const statusGrowthDivisor = Number.isFinite(input?.statusGrowthDivisor) ? input.statusGrowthDivisor : 1;
  const toSafeNumber = typeof input?.toSafeNumber === "function"
    ? input.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

  const raceLevels = Math.max(0, Math.round(toSafeNumber(raceLevelsRaw, 0)));
  const classLevels = Math.max(0, Math.round(toSafeNumber(classLevelsRaw, 0)));
  const effectiveRaceLevels = raceLevels + Math.max(0, Math.round(toSafeNumber(raceLevelBaseOffset, 0)));

  const raceGrowth = multiplyStatusVector(
    rowStatusVector(raceRow, { statusGrowthFields: skillLevelFields, statusGrowthDivisor, toSafeNumber }),
    effectiveRaceLevels,
    toSafeNumber
  );
  const classGrowth = multiplyStatusVector(
    rowStatusVector(classRow, { statusGrowthFields: skillLevelFields, statusGrowthDivisor, toSafeNumber }),
    classLevels,
    toSafeNumber
  );
  return addStatusVectors([raceGrowth, classGrowth], skillLevelFields, toSafeNumber);
}

export function buildUnitResistances(raceRow, classRow, options = {}) {
  const fields = Array.isArray(options?.resistanceFields) ? options.resistanceFields : [];
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const out = {};
  for (const key of fields) {
    const raceValue = toSafeNumber(raceRow?.[key], 0);
    const classValue = toSafeNumber(classRow?.[key], 0);
    out[key] = Math.round(raceValue + classValue);
  }
  return out;
}

function multiplyStatusVector(vector, factor, toSafeNumber) {
  const out = {};
  const scale = Math.max(0, Math.round(toSafeNumber(factor, 0)));
  for (const key of Object.keys(vector || {})) {
    out[key] = Math.max(0, Math.round(toSafeNumber(vector[key], 0) * scale));
  }
  return out;
}

function addStatusVectors(vectors, fields, toSafeNumber) {
  const out = {};
  for (const field of fields) out[field] = 0;
  for (const vec of vectors) {
    if (!vec) continue;
    for (const field of fields) {
      out[field] += Math.max(0, Math.round(toSafeNumber(vec[field], 0)));
    }
  }
  return out;
}

export function buildCharacterStatusFromRules(input) {
  const raceRow = input?.raceRow || {};
  const classRow = input?.classRow || {};
  const level = input?.level;
  const raceLevelsOption = input?.raceLevels;
  const classLevelsOption = input?.classLevels;
  const isHumanRace = !!input?.isHumanRace;
  const statusGrowthFields = Array.isArray(input?.statusGrowthFields) ? input.statusGrowthFields : [];
  const toSafeNumber = typeof input?.toSafeNumber === "function"
    ? input.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };

  const initialLevelMin = Number.isFinite(input?.initialLevelMin) ? input.initialLevelMin : 1;
  const initialLevelMax = Number.isFinite(input?.initialLevelMax) ? input.initialLevelMax : 99;
  const baseRaceLevel = Number.isFinite(input?.baseRaceLevel) ? input.baseRaceLevel : 0;
  const bonusRaceLevel = Number.isFinite(input?.bonusRaceLevel) ? input.bonusRaceLevel : 0;
  const humanClassBonusLevel = Number.isFinite(input?.humanClassBonusLevel) ? input.humanClassBonusLevel : 0;
  const statusGrowthDivisor = Number.isFinite(input?.statusGrowthDivisor) ? input.statusGrowthDivisor : 1;
  const raceLevelBaseOffset = Number.isFinite(input?.raceLevelBaseOffset) ? input.raceLevelBaseOffset : 0;
  const defaultSizBase = Number.isFinite(input?.defaultSizBase) ? input.defaultSizBase : 100;

  const safeLevel = Math.max(
    initialLevelMin,
    Math.min(initialLevelMax, Math.round(toSafeNumber(level, initialLevelMin)))
  );
  const defaultRaceLevels = baseRaceLevel + bonusRaceLevel;
  const hasFixedRaceLevels = raceLevelsOption !== undefined && raceLevelsOption !== null;
  const raceLevels = hasFixedRaceLevels
    ? Math.max(0, Math.round(toSafeNumber(raceLevelsOption, defaultRaceLevels)))
    : defaultRaceLevels;
  const defaultClassPerLevelGain = Math.max(0, safeLevel - 1);
  const defaultClassBonus = isHumanRace ? humanClassBonusLevel : 0;
  const hasFixedClassLevels = classLevelsOption !== undefined && classLevelsOption !== null;
  const classLevels = hasFixedClassLevels
    ? Math.max(0, Math.round(toSafeNumber(classLevelsOption, defaultClassPerLevelGain + defaultClassBonus)))
    : (defaultClassPerLevelGain + defaultClassBonus);
  const classPerLevelGain = hasFixedClassLevels ? classLevels : defaultClassPerLevelGain;
  const classBonus = hasFixedClassLevels ? 0 : defaultClassBonus;
  const effectiveRaceLevels = raceLevels + Math.max(0, Math.round(toSafeNumber(raceLevelBaseOffset, 0)));

  const raceGrowth = multiplyStatusVector(
    rowStatusVector(raceRow, { statusGrowthFields, statusGrowthDivisor, toSafeNumber }),
    effectiveRaceLevels,
    toSafeNumber
  );
  const classGrowth = multiplyStatusVector(
    rowStatusVector(classRow, { statusGrowthFields, statusGrowthDivisor, toSafeNumber }),
    classLevels,
    toSafeNumber
  );
  const mergedGrowth = addStatusVectors([raceGrowth, classGrowth], statusGrowthFields, toSafeNumber);
  const sizBase = Math.max(1, Math.round(toSafeNumber(raceRow?.SIZ, toSafeNumber(classRow?.SIZ, defaultSizBase))));
  const status = {
    ...mergedGrowth,
    SIZ: sizBase
  };

  return {
    level: safeLevel,
    raceLevels,
    effectiveRaceLevels,
    classLevels,
    classBonus,
    classPerLevelGain,
    status
  };
}
