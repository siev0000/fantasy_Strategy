import { applyV39TerritoryRepair, inspectV39TerritoryRepair } from "./lib/v39-territory-repair-rules.js";
import { getFactionSettlements, replaceFactionSettlement } from "./lib/settlement-state.js";

const text = value => String(value ?? "").trim();

function commitRepair(playerId, settlementId, turnNumber, reason) {
  const state = window.getV39GameState?.();
  const result = applyV39TerritoryRepair(state, playerId, settlementId, turnNumber);
  if (!result.reports.length) return result;
  window.setV39GameState?.({ players:result.state.players, territoryStateByTile:result.state.territoryStateByTile }, { reason });
  for (const report of result.reports) window.appendV39ActivityLog?.(playerId, "修復", `領土${report.key} HP ${report.beforeHp}→${report.hp}`, report);
  window.dispatchEvent(new CustomEvent("v39:territory-repaired", { detail:{ playerId, settlementId, reports:result.reports } }));
  return result;
}

function setAutoRepair(playerId, settlementId, enabled) {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => text(row?.id) === text(playerId));
  const settlement = getFactionSettlements(player?.factionState).find(row => text(row?.settlementId) === text(settlementId));
  if (!player || !settlement) return false;
  const factionState = replaceFactionSettlement(player.factionState, { ...settlement, autoRepair:enabled === true }, { ownerPlayerId:player.id });
  const players = state.players.map(row => text(row?.id) === text(player.id) ? { ...row, factionState } : row);
  window.setV39GameState?.({ players }, { reason:"territory-auto-repair-setting" });
  return true;
}

window.runV39TerritoryRepair = (playerId, settlementId) => commitRepair(
  playerId,
  settlementId,
  window.getV39GameState?.()?.timeline?.turnNumber || 1,
  "territory-manual-repair"
);
window.inspectV39TerritoryRepair = (playerId, settlementId) => inspectV39TerritoryRepair(window.getV39GameState?.(), playerId, settlementId);
window.setV39TerritoryAutoRepair = setAutoRepair;

window.addEventListener("v39:economy-turn-resolved", event => {
  const state = window.getV39GameState?.();
  const turnNumber = event?.detail?.turnNumber || state?.timeline?.turnNumber || 1;
  for (const player of state?.players || []) {
    for (const settlement of getFactionSettlements(player?.factionState)) {
      if (settlement.autoRepair === true) commitRepair(player.id, settlement.settlementId, turnNumber, "territory-auto-repair");
    }
  }
});
