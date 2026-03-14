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
  const buildMemberEntry = (unit, fallbackName = "") => {
    const hpMax = Math.max(1, Math.floor(toSafeNumber(unit?.maxHp, unit?.status?.HP)));
    const hpCurrent = Math.max(0, Math.floor(toSafeNumber(unit?.currentHp, hpMax)));
    return {
      id: nonEmptyText(unit?.id),
      name: nonEmptyText(unit?.name) || nonEmptyText(fallbackName) || "メンバー",
      race: nonEmptyText(unit?.race) || "-",
      level: Math.max(1, Math.floor(toSafeNumber(unit?.level, 1))),
      className: nonEmptyText(unit?.className) || "-",
      hpCurrent,
      hpMax
    };
  };
  return [...squadSummaries]
    .map(summary => {
      const leaderId = nonEmptyText(summary?.leaderId);
      const leader = isMap && leaderId ? unitByIdMap.get(leaderId) : null;
      const memberIds = Array.isArray(summary?.memberIds) ? summary.memberIds : [];
      const memberNames = Array.isArray(summary?.memberNames) ? summary.memberNames : [];
      const members = [];
      if (leader) {
        members.push({
          ...buildMemberEntry(leader, nonEmptyText(summary?.leaderName) || "リーダー"),
          isLeader: true
        });
      }
      for (let i = 0; i < memberIds.length; i += 1) {
        const memberId = nonEmptyText(memberIds[i]);
        if (!memberId) continue;
        const unit = isMap ? unitByIdMap.get(memberId) : null;
        if (unit) {
          members.push({
            ...buildMemberEntry(unit, memberNames[i] || "メンバー"),
            isLeader: false
          });
        } else {
          members.push({
            id: memberId,
            name: nonEmptyText(memberNames[i]) || "メンバー",
            race: "-",
            level: 1,
            className: "-",
            hpCurrent: 0,
            hpMax: 1,
            isLeader: false
          });
        }
      }
      const rawX = toSafeNumber(summary?.x, NaN);
      const rawY = toSafeNumber(summary?.y, NaN);
      const positioned = Number.isFinite(rawX) && Number.isFinite(rawY) && rawX >= 0 && rawY >= 0;
      const squadIconName = nonEmptyText(summary?.squadIconName);
      const leaderRaceIconSrc = leader
        ? moveUnitIconSrc({ ...leader, subIconName: "", iconName: "" })
        : "";
      const leaderSubIconName = nonEmptyText(leader?.subIconName);
      const leaderSubIconSrc = leaderSubIconName
        ? moveUnitIconSrc({ ...leader, subIconName: leaderSubIconName, iconName: leaderSubIconName, race: "" })
        : "";
      const squadIconSrc = squadIconName
        ? moveUnitIconSrc({ ...(leader || {}), subIconName: squadIconName, iconName: squadIconName, race: "" })
        : "";
      const squadIconGlyph = squadIconName
        ? Array.from(squadIconName)[0] || "隊"
        : (leader ? moveUnitIconGlyph(leader) : "兵");
      return {
        id: nonEmptyText(summary?.id) || `squad-${leaderId || "unknown"}`,
        name: nonEmptyText(summary?.name) || nonEmptyText(summary?.leaderName) || "部隊",
        leaderId,
        leaderName: nonEmptyText(summary?.leaderName) || nonEmptyText(leader?.name) || "リーダー",
        squadIconName,
        positioned,
        x: positioned ? Math.floor(rawX) : null,
        y: positioned ? Math.floor(rawY) : null,
        totalMemberCount: Math.max(1, Math.floor(toSafeNumber(summary?.totalMemberCount, 1))),
        scoutValue: roundTo1(toSafeNumber(summary?.scoutValue, 0)),
        stealthValue: roundTo1(toSafeNumber(summary?.stealthValue, 0)),
        members,
        leaderIconSrc: leaderRaceIconSrc,
        leaderIconGlyph: leader ? moveUnitIconGlyph(leader) : "兵",
        iconSrc: leaderRaceIconSrc,
        iconGlyph: leader ? moveUnitIconGlyph(leader) : squadIconGlyph,
        subIconSrc: squadIconSrc || leaderSubIconSrc
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
      const raceIconSrc = moveUnitIconSrc({ ...unit, subIconName: "", iconName: "" });
      const subIconName = nonEmptyText(unit?.subIconName);
      const subIconSrc = subIconName
        ? moveUnitIconSrc({ ...unit, subIconName, iconName: subIconName, race: "" })
        : "";
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
        iconSrc: raceIconSrc,
        iconGlyph: moveUnitIconGlyph(unit),
        subIconSrc
      };
    })
    .filter(entry => entry.id)
    .sort((a, b) => {
      if (a.rolePriority !== b.rolePriority) return a.rolePriority - b.rolePriority;
      return a.name.localeCompare(b.name, "ja");
    });
}
