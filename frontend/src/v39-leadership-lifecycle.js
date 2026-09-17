const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const alive = unit => number(unit?.hp ?? unit?.currentHp) > 0 && text(unit?.state) !== "死亡";
const rank = unit => [number(unit?.level), number(unit?.skillLevels?.指揮, unit?.status?.指揮), text(unit?.id)];

function bestCandidate(units) {
  return [...units].filter(alive).sort((a, b) => rank(b)[0]-rank(a)[0] || rank(b)[1]-rank(a)[1] || rank(a)[2].localeCompare(rank(b)[2]))[0] || null;
}

export function normalizeV39Leadership(player) {
  const faction = player?.factionState;
  if (!faction) return { player, changed:false, reports:[] };
  let changed = false;
  const reports = [];
  let units = (faction.units || []).map(unit => ({ ...unit }));
  const byId = () => new Map(units.map(unit => [text(unit.id), unit]));
  const squads = (faction.squads || []).map(squad => {
    const ids = [...new Set([...(squad.unitIds || squad.memberIds || []), squad.leaderId].map(text).filter(Boolean))];
    const current = byId().get(text(squad.leaderId));
    if (!text(squad.leaderId) || alive(current)) return squad;
    const next = bestCandidate(ids.map(id => byId().get(id)).filter(Boolean));
    changed = true;
    reports.push({ type:"squad-leader", squadId:text(squad.id), beforeId:text(squad.leaderId), afterId:text(next?.id) });
    const livingIds = ids.filter(id => alive(byId().get(id)));
    units = units.map(unit => ids.includes(text(unit.id)) ? {
      ...unit,
      squadLeaderId:alive(unit) && next && text(unit.id) !== text(next.id) ? text(next.id) : "",
      role:next && text(unit.id) === text(next.id) ? "リーダー" : unit.role === "リーダー" ? "隊員" : unit.role
    } : unit);
    return { ...squad, leaderId:text(next?.id), leaderName:text(next?.name), unitIds:livingIds, memberIds:livingIds };
  });
  const sovereign = units.find(unit => unit.isSovereign === true);
  if (sovereign && !alive(sovereign)) {
    const next = bestCandidate(units.filter(unit => text(unit.id) !== text(sovereign.id)));
    units = units.map(unit => ({ ...unit, isSovereign:next ? text(unit.id) === text(next.id) : false }));
    changed = true;
    reports.push({ type:"sovereign", beforeId:text(sovereign.id), afterId:text(next?.id) });
  }
  const settlements = (faction.settlements || []).map(settlement => {
    const governorId = text(settlement.governorUnitId);
    if (!governorId || alive(byId().get(governorId))) return settlement;
    const candidates = units.filter(unit => text(unit.settlementId || faction.selectedSettlementId) === text(settlement.settlementId));
    const next = bestCandidate(candidates);
    changed = true;
    reports.push({ type:"governor", settlementId:text(settlement.settlementId), beforeId:governorId, afterId:text(next?.id) });
    return { ...settlement, governorUnitId:text(next?.id) };
  });
  return { player:changed ? { ...player, factionState:{ ...faction, units, squads, settlements } } : player, changed, reports };
}

let applying = false;
function reconcile() {
  if (applying) return;
  const state = window.getV39GameState?.();
  if (!state) return;
  const results = state.players.map(normalizeV39Leadership);
  if (!results.some(row => row.changed)) return;
  applying = true;
  window.setV39GameState?.({ players:results.map(row => row.player) }, { reason:"leadership-successor" });
  for (const result of results) for (const report of result.reports) {
    const playerId = text(result.player?.id);
    window.appendV39ActivityLog?.(playerId, "継承", report.afterId ? `${report.beforeId}から${report.afterId}へ引継ぎ` : `${report.beforeId}の役職が空席`, report);
  }
  applying = false;
}

window.addEventListener("v39:game-state-changed", reconcile);
window.normalizeV39Leadership = normalizeV39Leadership;
