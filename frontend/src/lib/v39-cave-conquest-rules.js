import { V39_CAVE_NEST_BALANCE as balance } from "./v39-gameplay-balance.js";
import { advanceV39CaveNestProgress } from "./v39-cave-nest-rules.js";

const alive = unit => Number(unit?.hp ?? unit?.currentHp ?? 0) > 0;

// ボスのIDは除去後もマップに残す。再巣化ごとに新しいIDへ置き換える。
export function updateV39CaveConquest(map, enemies, turnNumber) {
  if (!map?.isUnderground || !map.caveBossIds?.length || map.caveMine) return map?.caveConquest || null;
  const bosses = enemies.filter(unit => map.caveBossIds.includes(unit.id));
  const previous = map.caveConquest || { generation:0, progressTurns:0, deferredByPlayerId:{} };
  if (bosses.some(alive)) return previous;
  if (previous.bossDefeated) return previous;
  return { ...previous, bossDefeated:true, defeatedTurn:turnNumber, progressTurns:0, lastProcessedTurn:turnNumber,
    previousRace:bosses[0]?.race || map.caveBossRace || map.caveHabitatRace || "", deferredByPlayerId:{} };
}

export function advanceV39CaveRecolonization(conquest, turnNumber, { playerPresent, plan, hasEnemies }, rules = balance) {
  if (!conquest?.bossDefeated || !rules.recolonizeUnclaimed) return conquest;
  const hasFood = !plan?.requiresFood || Number(plan?.foodAmount) >= rules.minimumArrivalFood;
  const canProgress = !!plan && Number(plan.settlerCount) >= rules.requiredSameRaceUnits
    && (!rules.requireEnoughFood || hasFood) && !hasEnemies;
  return advanceV39CaveNestProgress(conquest, turnNumber, { playerPresent, canProgress }, rules);
}
