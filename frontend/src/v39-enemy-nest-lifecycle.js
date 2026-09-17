import { advanceV39EnemyNestLifecycle } from "./lib/v39-enemy-nest-lifecycle-rules.js";

function run(turnNumber) {
  const state = window.getV39GameState?.();
  const result = advanceV39EnemyNestLifecycle(state, window.__v39FieldRuntime?.mapData, turnNumber || state?.timeline?.turnNumber || 1);
  window.setV39GameState?.({ enemies:result.state.enemies, enemyNests:result.state.enemyNests, enemySquads:result.state.enemySquads, groundLootByTile:result.state.groundLootByTile }, { reason:"enemy-nest-lifecycle" });
  for (const report of result.reports) {
    window.dispatchEvent(new CustomEvent("v39:enemy-nest-lifecycle", { detail:report }));
  }
  return result;
}

window.advanceV39EnemyNestLifecycle = run;
window.addEventListener("v39:economy-turn-resolved", event => run(event?.detail?.turnNumber));
