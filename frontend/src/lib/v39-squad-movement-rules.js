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

function embeddedSquadMemberIds(unit) {
  return (Array.isArray(unit?.squads) ? unit.squads : [])
    .map(row => text(row?.memberId || row?.id))
    .filter(Boolean);
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

  const x = integer(participants[0]?.x, -1);
  const y = integer(participants[0]?.y, -1);
  if (x < 0 || y < 0) return { ok:false, reason:"部隊位置が未確定です。" };
  if (participants.some(unit => integer(unit?.x, -1) !== x || integer(unit?.y, -1) !== y)) {
    return { ok:false, reason:"部隊員が同じ座標に揃っていません。" };
  }

  const isSquad = !!squad || participants.length > 1;
  const squadId = isSquad
    ? text(squad?.id || selected?.squadId || participants[0]?.squadId, `squad-${unitId(participants[0])}`)
    : `solo:${selectedId}`;
  const moveApMax = Math.max(1, integer(
    isSquad ? squad?.moveApMax : selected?.fieldMoveApMax,
    V39_SQUAD_MOVEMENT_BALANCE.moveApMax
  ));
  const moveAp = Math.max(0, Math.min(moveApMax, integer(
    isSquad ? squad?.moveAp : selected?.fieldMoveAp,
    moveApMax
  )));
  const movement = participants.reduce((minimum, unit) => Math.min(minimum, unitMovement(unit)), Number.POSITIVE_INFINITY);
  const leader = participants.find(unit => unitId(unit) === getV39SquadUnitIds(squad)[0]) || participants[0];
  return {
    ok:true,
    squadId,
    squad,
    isSquad,
    selected,
    leader,
    participants,
    participantIds:participants.map(unitId),
    x,
    y,
    movement:Number.isFinite(movement) ? movement : 1,
    moveApMax,
    moveAp
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
  const nextMoveAp = Math.max(0, group.moveAp-cost);
  const units = (Array.isArray(faction?.units) ? faction.units : []).map(unit => {
    if (!participantSet.has(unitId(unit))) return unit;
    const next = { ...unit, x, y };
    if (!group.isSquad) {
      next.fieldMoveApMax = group.moveApMax;
      next.fieldMoveAp = nextMoveAp;
    }
    return next;
  });
  let squadFound = false;
  const squads = (Array.isArray(faction?.squads) ? faction.squads : []).map(raw => {
    if (!group.isSquad || text(raw?.id || raw?.squadId) !== group.squadId) return raw;
    squadFound = true;
    return normalizeV39SquadLogistics({ ...raw, x, y, moveApMax:group.moveApMax, moveAp:nextMoveAp });
  });
  if (group.isSquad && !squadFound) {
    squads.push(normalizeV39SquadLogistics({
      id:group.squadId,
      label:text(group?.leader?.squadName, group.squadId),
      unitIds:[...group.participantIds],
      x,
      y,
      moveApMax:group.moveApMax,
      moveAp:nextMoveAp
    }));
  }
  return { ok:true, faction:{ ...faction, units, squads }, moveAp:nextMoveAp };
}

export function restoreV39SquadMovementForTurn(faction = {}) {
  const squads = (Array.isArray(faction?.squads) ? faction.squads : []).map(raw => {
    const squad = normalizeV39SquadLogistics(raw);
    const id = text(squad?.id || squad?.squadId);
    if (id === "solo" || id === "単独") return squad;
    return { ...squad, moveAp:squad.moveApMax };
  });
  const units = (Array.isArray(faction?.units) ? faction.units : []).map(unit => {
    const squadId = text(unit?.squadId);
    if (squadId && squadId !== "solo" && squadId !== "単独") return unit;
    const fieldMoveApMax = Math.max(1, integer(unit?.fieldMoveApMax, V39_SQUAD_MOVEMENT_BALANCE.moveApMax));
    return { ...unit, fieldMoveApMax, fieldMoveAp:fieldMoveApMax };
  });
  return { ...faction, units, squads };
}

if (typeof window !== "undefined") {
  window.resolveV39SquadMovementGroup = resolveV39SquadMovementGroup;
  window.applyV39SquadMovement = applyV39SquadMovement;
  window.restoreV39SquadMovementForTurn = restoreV39SquadMovementForTurn;
}
