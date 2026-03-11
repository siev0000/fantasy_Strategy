function nonEmptyText(value) {
  if (typeof value !== "string") return "";
  const normalized = value.trim();
  return normalized.length ? normalized : "";
}

function toSafeNumber(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return fallback;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function roundTo1(value) {
  return Math.round(toSafeNumber(value, 0) * 10) / 10;
}

export function createOwnSquadNavigatorEntries({
  squadSummaries = [],
  unitByIdMap = new Map(),
  moveUnitIconSrc = () => "",
  moveUnitIconGlyph = () => "兵"
}) {
  const isMap = unitByIdMap && typeof unitByIdMap.get === "function";
  return [...squadSummaries]
    .map(summary => {
      const leaderId = nonEmptyText(summary?.leaderId);
      const leader = isMap && leaderId ? unitByIdMap.get(leaderId) : null;
      const rawX = toSafeNumber(summary?.x, NaN);
      const rawY = toSafeNumber(summary?.y, NaN);
      const positioned = Number.isFinite(rawX) && Number.isFinite(rawY) && rawX >= 0 && rawY >= 0;
      return {
        id: nonEmptyText(summary?.id) || `squad-${leaderId || "unknown"}`,
        name: nonEmptyText(summary?.name) || nonEmptyText(summary?.leaderName) || "部隊",
        leaderId,
        leaderName: nonEmptyText(summary?.leaderName) || nonEmptyText(leader?.name) || "リーダー",
        positioned,
        x: positioned ? Math.floor(rawX) : null,
        y: positioned ? Math.floor(rawY) : null,
        totalMemberCount: Math.max(1, Math.floor(toSafeNumber(summary?.totalMemberCount, 1))),
        scoutValue: roundTo1(toSafeNumber(summary?.scoutValue, 0)),
        stealthValue: roundTo1(toSafeNumber(summary?.stealthValue, 0)),
        leaderIconSrc: leader ? moveUnitIconSrc(leader) : "",
        leaderIconGlyph: leader ? moveUnitIconGlyph(leader) : "兵"
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export function createOwnCharacterNavigatorEntries({
  unitList = [],
  isSovereignUnit = () => false,
  isNamedUnit = () => false,
  toUnitRoleLabel = () => "",
  moveUnitIconSrc = () => "",
  moveUnitIconGlyph = () => "兵"
}) {
  const rolePriority = unit => {
    if (isSovereignUnit(unit)) return 0;
    if (isNamedUnit(unit)) return 1;
    return 2;
  };
  return [...unitList]
    .map(unit => {
      const rawX = toSafeNumber(unit?.x, NaN);
      const rawY = toSafeNumber(unit?.y, NaN);
      const positioned = Number.isFinite(rawX) && Number.isFinite(rawY) && rawX >= 0 && rawY >= 0;
      return {
        id: nonEmptyText(unit?.id),
        name: nonEmptyText(unit?.name) || "ユニット",
        roleLabel: toUnitRoleLabel(unit),
        race: nonEmptyText(unit?.race) || "-",
        className: nonEmptyText(unit?.className) || "-",
        level: Math.max(1, Math.floor(toSafeNumber(unit?.level, 1))),
        squadName: nonEmptyText(unit?.squadName),
        moveRemaining: Math.max(0, Math.floor(toSafeNumber(unit?.moveRemaining, 0))),
        moveRange: Math.max(0, Math.floor(toSafeNumber(unit?.moveRange, 0))),
        scoutValue: roundTo1(toSafeNumber(unit?.skillLevels?.索敵, unit?.scoutRange)),
        stealthValue: roundTo1(toSafeNumber(unit?.skillLevels?.隠密, 0)),
        hpCurrent: Math.max(0, Math.floor(toSafeNumber(unit?.currentHp, unit?.status?.HP))),
        hpMax: Math.max(1, Math.floor(toSafeNumber(unit?.maxHp, unit?.status?.HP))),
        status: {
          HP: Math.max(0, Math.floor(toSafeNumber(unit?.status?.HP, 0))),
          攻撃: Math.max(0, Math.floor(toSafeNumber(unit?.status?.攻撃, 0))),
          防御: Math.max(0, Math.floor(toSafeNumber(unit?.status?.防御, 0))),
          魔力: Math.max(0, Math.floor(toSafeNumber(unit?.status?.魔力, 0))),
          精神: Math.max(0, Math.floor(toSafeNumber(unit?.status?.精神, 0))),
          速度: Math.max(0, Math.floor(toSafeNumber(unit?.status?.速度, 0))),
          命中: Math.max(0, Math.floor(toSafeNumber(unit?.status?.命中, 0)))
        },
        rolePriority: rolePriority(unit),
        positioned,
        x: positioned ? Math.floor(rawX) : null,
        y: positioned ? Math.floor(rawY) : null,
        iconSrc: moveUnitIconSrc(unit),
        iconGlyph: moveUnitIconGlyph(unit)
      };
    })
    .filter(entry => entry.id)
    .sort((a, b) => {
      if (a.rolePriority !== b.rolePriority) return a.rolePriority - b.rolePriority;
      return a.name.localeCompare(b.name, "ja");
    });
}
