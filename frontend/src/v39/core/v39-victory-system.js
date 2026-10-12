import { evaluateV39Victory } from "../../lib/v39-victory-rules.js";
import { advanceV39GuardianQuests } from "../../lib/v39-guardian-quests.js";

function resolveVictory(event) {
  const state = window.getV39GameState?.();
  if (!state || !Object.keys(state.victoryLandmarksByTile || {}).length) return null;
  const turn=event?.detail?.turnNumber||state.timeline?.turnNumber||1;
  const advanced=advanceV39GuardianQuests(state,turn);
  if(advanced!==state) window.setV39GameState?.({victoryLandmarksByTile:advanced.victoryLandmarksByTile},{reason:"guardian-quest-progress"});
  const result = evaluateV39Victory(advanced, turn);
  if (!result.changed) return result;
  window.setV39GameState?.({ victory:result.victory }, { reason:"victory-evaluated" });
  if (!result.victory.completed) return result;
  const winner = state.players?.find(player => player.id === result.victory.winnerPlayerId);
  const message = `${winner?.label || result.victory.winnerPlayerId}が勝利しました`;
  window.showV39TurnBanner?.(message, true);
  window.appendV39ActivityLog?.((state.players || []).map(player => player.id), "勝利", message, result.victory);
  window.dispatchEvent(new CustomEvent("v39:game-victory", { detail:{ ...result.victory, message } }));
  return result;
}

window.addEventListener("v39:turn-stage-exploration", resolveVictory);
window.resolveV39Victory=resolveVictory;
window.evaluateV39Victory = (turnNumber = window.getV39GameState?.()?.timeline?.turnNumber) => {
  const state = window.getV39GameState?.();
  if (!state) return null;
  return evaluateV39Victory(state, turnNumber);
};
