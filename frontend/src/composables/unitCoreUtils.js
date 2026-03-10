export function isSovereignUnit(unit) {
  return !!unit?.isSovereign;
}

export function isNamedUnit(unit, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  return !!unit?.isNamed || nonEmptyText(unit?.unitType) === "ネームド" || isSovereignUnit(unit);
}

export function isMobUnit(unit, options = {}) {
  if (!unit) return false;
  if (isSovereignUnit(unit)) return false;
  if (isNamedUnit(unit, options)) return false;
  return true;
}

export function normalizeSquadEntries(entries, leaderId = "", options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  if (!Array.isArray(entries)) return [];
  const keyPrefix = nonEmptyText(leaderId) || "unit";
  const out = [];
  const seen = new Set();
  for (const raw of entries) {
    const memberId = nonEmptyText(raw?.memberId || raw?.id);
    if (!memberId || seen.has(memberId)) continue;
    seen.add(memberId);
    out.push({
      id: nonEmptyText(raw?.id) || `${keyPrefix}-sq-${out.length + 1}`,
      memberId,
      name: nonEmptyText(raw?.name)
    });
  }
  return out;
}

export function unitHasSquad(unit, options = {}) {
  if (!unit) return false;
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const squads = normalizeSquadEntries(unit?.squads, unit?.id, options);
  return squads.length > 0 || Math.max(0, Math.floor(toSafeNumber(unit?.squadCount, 0))) > 0;
}

export function squadMemberIds(unit, options = {}) {
  return normalizeSquadEntries(unit?.squads, unit?.id, options).map(row => row.memberId);
}

export function resolveUnitScoutValue(unit, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function"
    ? options.roundTo1
    : value => Math.round(Number(value || 0) * 10) / 10;
  const skillScout = Number(unit?.skillLevels?.索敵);
  if (Number.isFinite(skillScout)) return Math.max(0, roundTo1(skillScout));
  return 0;
}

export function resolveUnitStealthValue(unit, options = {}) {
  const roundTo1 = typeof options?.roundTo1 === "function"
    ? options.roundTo1
    : value => Math.round(Number(value || 0) * 10) / 10;
  const skillStealth = Number(unit?.skillLevels?.隠密);
  if (Number.isFinite(skillStealth)) return Math.max(0, roundTo1(skillStealth));
  return 0;
}

export function toUnitRoleLabel(unit, options = {}) {
  if (!unit) return "-";
  if (isSovereignUnit(unit)) return "統治者";
  if (isNamedUnit(unit, options)) return "ネームド";
  return "モブ";
}

export function resolveDefaultSquadName(units = [], options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const source = Array.isArray(units) ? units : [];
  let maxNo = 0;
  for (const unit of source) {
    const name = nonEmptyText(unit?.squadName);
    if (!name.startsWith("部隊")) continue;
    const tail = name.slice(2);
    const no = Number(tail);
    if (Number.isFinite(no) && no > maxNo) {
      maxNo = no;
    }
  }
  return `部隊${maxNo + 1}`;
}

export function buildSquadSummaryList(units = [], options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const roundTo1 = typeof options?.roundTo1 === "function"
    ? options.roundTo1
    : value => Math.round(Number(value || 0) * 10) / 10;
  const resolveDefaultSquadNameFn = typeof options?.resolveDefaultSquadName === "function"
    ? options.resolveDefaultSquadName
    : (rows => resolveDefaultSquadName(rows, { nonEmptyText }));
  const normalizeSquadEntriesFn = typeof options?.normalizeSquadEntries === "function"
    ? options.normalizeSquadEntries
    : ((entries, leaderId) => normalizeSquadEntries(entries, leaderId, { nonEmptyText }));
  const unitHasSquadFn = typeof options?.unitHasSquad === "function"
    ? options.unitHasSquad
    : (unit => unitHasSquad(unit, { nonEmptyText, toSafeNumber }));
  const resolveUnitScoutValueFn = typeof options?.resolveUnitScoutValue === "function"
    ? options.resolveUnitScoutValue
    : (unit => resolveUnitScoutValue(unit, { roundTo1 }));
  const resolveUnitStealthValueFn = typeof options?.resolveUnitStealthValue === "function"
    ? options.resolveUnitStealthValue
    : (unit => resolveUnitStealthValue(unit, { roundTo1 }));

  const source = Array.isArray(units) ? units : [];
  const byId = new Map(source.map(unit => [unit?.id, unit]));
  const out = [];
  for (const leader of source) {
    if (!leader || !unitHasSquadFn(leader)) continue;
    const leaderId = nonEmptyText(leader.id);
    if (!leaderId) continue;
    const squads = normalizeSquadEntriesFn(leader.squads, leaderId);
    if (!squads.length) continue;
    const memberIds = squads.map(row => row.memberId);
    const memberUnits = memberIds
      .map(id => byId.get(id))
      .filter(Boolean);
    const fullUnits = [leader, ...memberUnits];
    const scoutValues = fullUnits.map(resolveUnitScoutValueFn).sort((a, b) => b - a);
    const stealthValues = fullUnits.map(resolveUnitStealthValueFn);
    const maxScout = scoutValues.length ? Math.max(...scoutValues) : 0;
    const supportScout = scoutValues.slice(1).reduce((sum, value) => sum + (value / 5), 0);
    const totalStealth = stealthValues.reduce((sum, value) => sum + value, 0);
    const memberCount = fullUnits.length;
    const stealthDivisor = memberCount > 1 ? Math.max(1, memberCount * 0.75) : 1;
    out.push({
      id: nonEmptyText(leader.squadId) || `squad-${leaderId}`,
      name: nonEmptyText(leader.squadName) || resolveDefaultSquadNameFn(source),
      leaderId,
      leaderName: nonEmptyText(leader.name) || "リーダー",
      leaderPos: {
        x: Number.isFinite(leader?.x) ? leader.x : null,
        y: Number.isFinite(leader?.y) ? leader.y : null
      },
      memberIds,
      memberNames: memberUnits.map(unit => nonEmptyText(unit?.name)).filter(Boolean),
      totalMemberCount: memberCount,
      scoutValue: roundTo1(maxScout + supportScout),
      stealthValue: roundTo1(totalStealth / stealthDivisor)
    });
  }
  return out;
}

export function stripRemovedUnitFromSquads(units, removedUnitId, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const toSafeNumber = typeof options?.toSafeNumber === "function"
    ? options.toSafeNumber
    : (value, fallback = 0) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
  const normalizeSquadEntriesFn = typeof options?.normalizeSquadEntries === "function"
    ? options.normalizeSquadEntries
    : ((entries, leaderId) => normalizeSquadEntries(entries, leaderId, { nonEmptyText }));

  const removedId = nonEmptyText(removedUnitId);
  if (!removedId || !Array.isArray(units)) return Array.isArray(units) ? units : [];
  return units.map(unit => {
    if (!unit) return unit;
    const prevSquads = normalizeSquadEntriesFn(unit?.squads, unit?.id);
    const nextSquads = prevSquads.filter(row => row.memberId !== removedId);
    const prevLeaderId = nonEmptyText(unit?.squadLeaderId);
    const nextLeaderId = prevLeaderId === removedId ? "" : prevLeaderId;
    if (
      nextSquads.length === prevSquads.length
      && nextLeaderId === prevLeaderId
      && Math.max(0, Math.floor(toSafeNumber(unit?.squadCount, 0))) === nextSquads.length
    ) {
      return unit;
    }
    return {
      ...unit,
      squads: nextSquads,
      squadCount: nextSquads.length,
      squadLeaderId: nextLeaderId
    };
  });
}

export function configureUnitSquadState(units, unitId, memberIds = [], options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const normalizeSquadEntriesFn = typeof options?.normalizeSquadEntries === "function"
    ? options.normalizeSquadEntries
    : ((entries, leaderId) => normalizeSquadEntries(entries, leaderId, { nonEmptyText }));
  const unitHasSquadFn = typeof options?.unitHasSquad === "function"
    ? options.unitHasSquad
    : (unit => unitHasSquad(unit, options));
  const resolveDefaultSquadNameFn = typeof options?.resolveDefaultSquadName === "function"
    ? options.resolveDefaultSquadName
    : (rows => resolveDefaultSquadName(rows, { nonEmptyText }));
  const maxSquadMemberCount = Math.max(1, Math.floor(Number(options?.maxSquadMemberCount || 5)));

  const currentUnits = Array.isArray(units) ? units : [];
  const leaderId = nonEmptyText(unitId);
  const idx = currentUnits.findIndex(unit => unit?.id === leaderId);
  if (idx < 0) return { ok: false, reason: "対象ユニットが見つかりません。" };

  const leaderUnit = currentUnits[idx];
  const leaderX = Number.isFinite(leaderUnit?.x) ? leaderUnit.x : null;
  const leaderY = Number.isFinite(leaderUnit?.y) ? leaderUnit.y : null;
  if (!Number.isFinite(leaderX) || !Number.isFinite(leaderY) || leaderX < 0 || leaderY < 0) {
    return { ok: false, reason: "リーダーの座標が未確定です。" };
  }
  if (nonEmptyText(leaderUnit?.squadLeaderId)) {
    return { ok: false, reason: "このユニットは既に別部隊の隊員です。" };
  }

  const selected = [];
  const seen = new Set();
  const sourceIds = Array.isArray(memberIds) ? memberIds : [];
  for (const raw of sourceIds) {
    const memberId = nonEmptyText(raw);
    if (!memberId || memberId === leaderId || seen.has(memberId)) continue;
    const target = currentUnits.find(unit => unit?.id === memberId);
    if (!target) continue;
    if (unitHasSquadFn(target)) {
      return { ok: false, reason: `${target.name || "ユニット"} は既に部隊リーダーです。` };
    }
    const memberLeaderId = nonEmptyText(target?.squadLeaderId);
    if (memberLeaderId && memberLeaderId !== leaderId) {
      return { ok: false, reason: `${target.name || "ユニット"} は既に別部隊に所属しています。` };
    }
    const targetX = Number.isFinite(target?.x) ? target.x : null;
    const targetY = Number.isFinite(target?.y) ? target.y : null;
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY) || targetX !== leaderX || targetY !== leaderY) {
      return { ok: false, reason: "同じ座標にいるユニットのみ部隊編成できます。" };
    }
    seen.add(memberId);
    selected.push(memberId);
    if (selected.length >= maxSquadMemberCount) break;
  }

  const selectedSet = new Set(selected);
  const nextSquadName = nonEmptyText(options?.squadName)
    || nonEmptyText(leaderUnit?.squadName)
    || resolveDefaultSquadNameFn(currentUnits);
  const nextSquadId = nonEmptyText(leaderUnit?.squadId) || `squad-${leaderId}`;

  let nextUnits = currentUnits.map(unit => {
    if (!unit) return unit;
    const currentSquads = normalizeSquadEntriesFn(unit?.squads, unit?.id);
    let nextSquads = currentSquads;
    let nextLeaderId = nonEmptyText(unit?.squadLeaderId);
    let nextSquadIdForUnit = nonEmptyText(unit?.squadId);
    let nextSquadNameForUnit = nonEmptyText(unit?.squadName);

    if (unit.id === leaderId) {
      nextSquads = [];
      nextLeaderId = "";
      nextSquadIdForUnit = "";
      nextSquadNameForUnit = "";
    } else {
      nextSquads = currentSquads.filter(row => !selectedSet.has(row.memberId));
      if (nextLeaderId === leaderId) {
        nextLeaderId = "";
        nextSquadIdForUnit = "";
        nextSquadNameForUnit = "";
      }
      if (selectedSet.has(unit.id)) {
        nextLeaderId = leaderId;
        nextSquadIdForUnit = nextSquadId;
        nextSquadNameForUnit = nextSquadName;
      }
    }

    return {
      ...unit,
      squads: nextSquads,
      squadCount: nextSquads.length,
      squadLeaderId: nextLeaderId,
      squadId: nextSquadIdForUnit,
      squadName: nextSquadNameForUnit
    };
  });

  const nextSquads = selected.map((memberId, order) => {
    const member = nextUnits.find(unit => unit?.id === memberId);
    return {
      id: `${leaderId}-sq-${order + 1}`,
      memberId,
      name: nonEmptyText(member?.name) || `隊員${order + 1}`
    };
  });

  nextUnits = nextUnits.map(unit => (
    unit?.id === leaderId
      ? {
        ...unit,
        squads: nextSquads,
        squadCount: nextSquads.length,
        squadLeaderId: "",
        squadId: nextSquads.length ? nextSquadId : "",
        squadName: nextSquads.length ? nextSquadName : ""
      }
      : unit
  ));

  return {
    ok: true,
    hasSquad: nextSquads.length > 0,
    memberCount: nextSquads.length,
    memberNames: nextSquads.map(row => nonEmptyText(row.name)).filter(Boolean),
    squadName: nextSquadName,
    nextUnits
  };
}

export function renameLeaderSquad(units, unitId, squadName, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const unitHasSquadFn = typeof options?.unitHasSquad === "function"
    ? options.unitHasSquad
    : (unit => unitHasSquad(unit, options));
  const source = Array.isArray(units) ? units : [];
  const leaderId = nonEmptyText(unitId);
  const nextName = nonEmptyText(squadName);
  if (!leaderId || !nextName) return { ok: false, reason: "部隊名が未入力です。" };
  const idx = source.findIndex(unit => unit?.id === leaderId);
  if (idx < 0) return { ok: false, reason: "部隊リーダーが見つかりません。" };
  const leader = source[idx];
  if (!unitHasSquadFn(leader)) return { ok: false, reason: "このユニットは部隊を持っていません。" };
  const nextUnits = source.map((unit, index) => (
    index === idx
      ? { ...unit, squadName: nextName }
      : unit
  ));
  return { ok: true, squadName: nextName, nextUnits };
}

export function dissolveLeaderSquad(units, unitId, options = {}) {
  const nonEmptyText = typeof options?.nonEmptyText === "function"
    ? options.nonEmptyText
    : value => String(value ?? "").trim();
  const unitHasSquadFn = typeof options?.unitHasSquad === "function"
    ? options.unitHasSquad
    : (unit => unitHasSquad(unit, options));
  const source = Array.isArray(units) ? units : [];
  const leaderId = nonEmptyText(unitId);
  if (!leaderId) return { ok: false, reason: "部隊リーダーが未指定です。" };
  const leader = source.find(unit => unit?.id === leaderId);
  if (!leader) return { ok: false, reason: "部隊リーダーが見つかりません。" };
  if (!unitHasSquadFn(leader)) return { ok: false, reason: "このユニットは部隊を持っていません。" };
  return configureUnitSquadState(source, leaderId, [], {
    ...options,
    squadName: ""
  });
}
