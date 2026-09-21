import { V39_SQUAD_MOVEMENT_BALANCE } from "./v39-gameplay-balance.js";
import { getV39SquadUnitIds, normalizeV39SquadLogistics } from "./v39-logistics-state.js";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const integer = (value, fallback = 0) => Math.floor(number(value, fallback));

function unitId(unit) {
  return text(unit?.id || unit?.unitId || unit?.characterId);
}

function isLivingUnit(unit) {
  return !!unit
    && text(unit?.state || unit?.statusName) !== "死亡"
    && number(unit?.hp ?? unit?.currentHp, 0) > 0;
}

function unitMovement(unit) {
  const candidates = [unit?.status?.移動, unit?.移動, unit?.movement, unit?.moveRange, unit?.move];
  for (const value of candidates) {
    if (Number.isFinite(Number(value))) return Math.max(1, integer(value, 1));
  }
  return 1;
}

function unitCurrentAp(unit) {
  return Math.max(0, integer(unit?.ap, integer(unit?.currentAp, integer(unit?.actionPoint, 0))));
}

function unitMaxAp(unit) {
  return Math.max(0, integer(unit?.maxAp, integer(unit?.maxActionPoint, 100)));
}

function embeddedSquadMemberIds(unit) {
  return (Array.isArray(unit?.squads) ? unit.squads : [])
    .map(row => text(row?.memberId || row?.id))
    .filter(Boolean);
}

function offsetToAxial(x, y) {
  const row = integer(y);
  return { q:integer(x) - ((row - (row & 1)) / 2), r:row };
}

function axialToOffset(q, r) {
  const row = integer(r);
  return { x:integer(q) + ((row - (row & 1)) / 2), y:row };
}

export function translateV39SquadFormation(group = {}, target = {}) {
  const anchor = offsetToAxial(group?.x, group?.y);
  const destination = offsetToAxial(target?.x, target?.y);
  const deltaQ = destination.q - anchor.q;
  const deltaR = destination.r - anchor.r;
  return (Array.isArray(group?.participants) ? group.participants : []).map(unit => {
    const current = offsetToAxial(unit?.x, unit?.y);
    return { id:unitId(unit), ...axialToOffset(current.q + deltaQ, current.r + deltaR) };
  });
}

function resolveSquadRecord(faction, selected) {
  const selectedId = unitId(selected);
  const selectedSquadId = text(selected?.squadId);
  const squads = Array.isArray(faction?.squads) ? faction.squads : [];
  return squads.find(squad => {
    const squadId = text(squad?.id || squad?.squadId);
    if (!squadId || squadId === "solo" || squadId === "単独") return false;
    return squadId === selectedSquadId || getV39SquadUnitIds(squad).includes(selectedId);
  }) || null;
}

function resolveParticipantIds(faction, selected, squad) {
  const selectedId = unitId(selected);
  const units = Array.isArray(faction?.units) ? faction.units : [];
  const squadId = text(squad?.id || selected?.squadId);
  let ids = squad ? getV39SquadUnitIds(squad) : [];
  if (!ids.length && squadId && squadId !== "solo" && squadId !== "単独") {
    ids = units.filter(unit => text(unit?.squadId) === squadId).map(unitId);
  }
  if (!ids.length && text(selected?.squadLeaderId)) {
    const leaderId = text(selected.squadLeaderId);
    const leader = units.find(unit => unitId(unit) === leaderId) || null;
    ids = [leaderId, ...embeddedSquadMemberIds(leader)];
  }
  if (!ids.length && embeddedSquadMemberIds(selected).length) {
    ids = [selectedId, ...embeddedSquadMemberIds(selected)];
  }
  return [...new Set((ids.length ? ids : [selectedId]).map(text).filter(Boolean))];
}

export function resolveV39SquadMovementGroup(faction = {}, selectedUnitId = "") {
  const units = Array.isArray(faction?.units) ? faction.units : [];
  const selectedId = text(selectedUnitId);
  const selected = units.find(unit => unitId(unit) === selectedId) || null;
  if (!selected) return { ok:false, reason:"移動対象が見つかりません。" };
  if (!isLivingUnit(selected)) return { ok:false, reason:"死亡したユニットは移動できません。" };

  const squad = resolveSquadRecord(faction, selected);
  const participantIds = resolveParticipantIds(faction, selected, squad);
  const participantSet = new Set(participantIds);
  const participants = units.filter(unit => participantSet.has(unitId(unit)) && isLivingUnit(unit));
  if (!participants.length) return { ok:false, reason:"移動可能な部隊員がいません。" };

  const leader = participants.find(unit => unitId(unit) === getV39SquadUnitIds(squad)[0]) || selected || participants[0];
  const x = integer(leader?.x, -1);
  const y = integer(leader?.y, -1);
  if (x < 0 || y < 0) return { ok:false, reason:"部隊位置が未確定です。" };
  if (participants.some(unit => integer(unit?.x, -1) < 0 || integer(unit?.y, -1) < 0)) {
    return { ok:false, reason:"部隊員の位置が未確定です。" };
  }

  const isSquad = !!squad || participants.length > 1;
  const squadId = isSquad
    ? text(squad?.id || selected?.squadId || participants[0]?.squadId, `squad-${unitId(participants[0])}`)
    : `solo:${selectedId}`;
  const moveApMax = participants.reduce(
    (minimum, unit) => Math.min(minimum, unitMaxAp(unit)),
    Number.POSITIVE_INFINITY
  );
  const moveAp = participants.reduce(
    (minimum, unit) => Math.min(minimum, unitCurrentAp(unit)),
    Number.POSITIVE_INFINITY
  );
  const movement = participants.reduce((minimum, unit) => Math.min(minimum, unitMovement(unit)), Number.POSITIVE_INFINITY);
  return {
    ok:true,
    squadId,
    squad,
    isSquad,
    selected,
    leader,
    participants,
    participantIds:participants.map(unitId),
    positions:participants.map(unit => ({ id:unitId(unit), x:integer(unit?.x), y:integer(unit?.y) })),
    x,
    y,
    movement:Number.isFinite(movement) ? movement : 1,
    moveApMax:Number.isFinite(moveApMax) ? moveApMax : V39_SQUAD_MOVEMENT_BALANCE.moveApMax,
    moveAp:Number.isFinite(moveAp) ? moveAp : 0
  };
}

export function applyV39SquadMovement(faction = {}, group = {}, target = {}, moveApCost = 0) {
  if (!group?.ok) return { ok:false, faction, reason:group?.reason || "部隊を確定できません。" };
  const x = integer(target?.x, -1);
  const y = integer(target?.y, -1);
  const cost = Math.max(0, integer(moveApCost));
  if (x < 0 || y < 0) return { ok:false, faction, reason:"移動先が不正です。" };
  if (cost > group.moveAp) return { ok:false, faction, reason:"部隊移動APが不足しています。" };

  const participantSet = new Set(group.participantIds);
  const targetPositions = Array.isArray(target?.positions) && target.positions.length
    ? target.positions
    : translateV39SquadFormation(group, target);
  const targetPositionById = new Map(targetPositions.map(row => [text(row?.id), {
    x:integer(row?.x, -1),
    y:integer(row?.y, -1)
  }]));
  if (group.participantIds.some(id => {
    const position = targetPositionById.get(id);
    return !position || position.x < 0 || position.y < 0;
  })) return { ok:false, faction, reason:"部隊員の移動先が不正です。" };
  const nextMoveAp = Math.max(0, group.moveAp-cost);
  const units = (Array.isArray(faction?.units) ? faction.units : []).map(unit => {
    if (!participantSet.has(unitId(unit))) return unit;
    const position = targetPositionById.get(unitId(unit));
    const ap = Math.max(0, unitCurrentAp(unit) - cost);
    return { ...unit, x:position.x, y:position.y, ap, currentAp:ap, actionPoint:ap };
  });
  let squadFound = false;
  const squads = (Array.isArray(faction?.squads) ? faction.squads : []).map(raw => {
    if (!group.isSquad || text(raw?.id || raw?.squadId) !== group.squadId) return raw;
    squadFound = true;
    return normalizeV39SquadLogistics({ ...raw, x, y });
  });
  if (group.isSquad && !squadFound) {
    squads.push(normalizeV39SquadLogistics({
      id:group.squadId,
      label:text(group?.leader?.squadName, group.squadId),
      unitIds:[...group.participantIds],
      x,
      y
    }));
  }
  return { ok:true, faction:{ ...faction, units, squads }, moveAp:nextMoveAp };
}

export function restoreV39SquadMovementForTurn(faction = {}) {
  // 移動と戦闘は同じAPを使う。共通AP自体の回復はターン処理の restoreUnitForTurn が行う。
  return { ...faction };
}

if (typeof window !== "undefined") {
  window.resolveV39SquadMovementGroup = resolveV39SquadMovementGroup;
  window.applyV39SquadMovement = applyV39SquadMovement;
  window.translateV39SquadFormation = translateV39SquadFormation;
  window.restoreV39SquadMovementForTurn = restoreV39SquadMovementForTurn;
}
