const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function markUnitActivity(unitIds, field, reason) {
  const ids = new Set((Array.isArray(unitIds) ? unitIds : [unitIds]).map(text).filter(Boolean));
  if (!ids.size) return false;
  const state = window.getV39GameState?.();
  if (!state) return false;
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  let changed = false;
  const apply = unit => {
    if (!ids.has(text(unit?.id)) || number(unit?.[field]) === turn) return unit;
    changed = true;
    return { ...unit, [field]:turn };
  };
  const players = state.players.map(player => ({
    ...player,
    factionState:{ ...player.factionState, units:player.factionState.units.map(apply) }
  }));
  const enemies = state.enemies.map(apply);
  if (changed) window.setV39GameState?.({ players, enemies }, { reason });
  return changed;
}

window.addEventListener("v39:unit-moved", event => markUnitActivity(event?.detail?.unitId, "lastMovedTurn", "turn-activity-player-moved"));
window.addEventListener("v39:enemy-moved", event => markUnitActivity(event?.detail?.enemyId, "lastMovedTurn", "turn-activity-enemy-moved"));
window.addEventListener("v39:combat-log", event => {
  const detail = event?.detail || {};
  if (!text(detail.skillName)) return;
  markUnitActivity([detail.attackerId, ...(detail.entries || []).map(entry => entry?.targetId)], "lastCombatTurn", "turn-activity-combat");
});

window.markV39UnitActivity = markUnitActivity;
