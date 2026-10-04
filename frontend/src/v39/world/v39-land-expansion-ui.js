import { getSelectedSettlement } from "../../lib/settlement-state.js";
import { V39_LAND_EXPANSION_BALANCE } from "../../lib/v39-gameplay-balance.js";
import { HEX_TILE_CONFIG } from "../../lib/phaser-map-panel-config.js";
import { getV39LandExpansionCandidates, inspectV39LandExpansion, startV39LandExpansion, cancelV39LandExpansion } from "../../lib/v39-land-expansion-rules.js";

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
let selection = null;
let graphics = null;

function context() {
  const state = window.getV39GameState?.();
  const player = state?.players?.find(row => row.id === state.activePlayerId);
  return { state, player, settlement:getSelectedSettlement(player?.factionState), map:window.__v39FieldRuntime?.mapData };
}

function clearSelection() {
  selection = null;
  graphics?.destroy(); graphics = null;
}

function drawCandidates(tiles) {
  graphics?.destroy(); graphics = null;
  const scene = window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0];
  if (!scene) return;
  graphics = scene.add.graphics().setDepth(19);
  const { width, height, rowStep, oddRowOffsetX } = HEX_TILE_CONFIG;
  for (const tile of tiles) {
    const left = tile.x * width + (tile.y % 2 ? oddRowOffsetX : 0), top = tile.y * rowStep;
    const points = [{ x:left+width/2,y:top }, { x:left+width,y:top+height-rowStep },
      { x:left+width,y:top+rowStep }, { x:left+width/2,y:top+height },
      { x:left,y:top+rowStep }, { x:left,y:top+height-rowStep }];
    graphics.fillStyle(0xe8cf58, 0.22).fillPoints(points, true);
    graphics.lineStyle(2, 0xe8cf58, 0.85).strokePoints(points, true);
  }
}

export function renderV39LandExpansionControls(state, player, settlement) {
  const map = window.__v39FieldRuntime?.mapData;
  if (selection && (selection.playerId !== player.id || selection.settlementId !== settlement.settlementId)) clearSelection();
  const projects = settlement.landExpansionProjects || [];
  const rows = projects.map(project => {
    const [x,y] = project.tileKey.split(",").map(Number);
    const check = inspectV39LandExpansion(state, player.id, settlement.settlementId, { x,y }, map, { project });
    return `<div class="settlement-inline-facts"><b>${escapeHtml(project.tileKey)} / 残り${project.remainingTurns}T</b><span>${check.ok ? `開拓 ${project.workers}人` : `停止: ${escapeHtml(check.reason)}`}</span><button type="button" class="settlement-chip" data-expansion-action="cancel" data-expansion-key="${escapeHtml(project.tileKey)}">中止</button></div>`;
  }).join("");
  let target = "";
  if (selection?.tile) {
    const check = inspectV39LandExpansion(state, player.id, settlement.settlementId, selection.tile, map);
    target = `<div class="settlement-inline-facts"><b>${escapeHtml(check.key)}</b><span>${check.ok ? `${check.workers}人 / ${check.totalTurns}T` : escapeHtml(check.reason)}</span><button type="button" class="settlement-chip" data-expansion-action="start"${check.ok ? "" : " disabled"}>開拓開始</button></div>`;
  }
  const canChoose = projects.length < V39_LAND_EXPANSION_BALANCE.maxProjects;
  return `${rows}<div class="settlement-chip-list"><button type="button" class="settlement-chip" data-expansion-action="choose"${canChoose ? "" : " disabled"}>${selection ? "選択解除" : "開拓する"}</button></div>${selection ? '<div class="settlement-empty">地図の黄色の土地を選択</div>' : ""}${target}<div class="settlement-empty">担当${V39_LAND_EXPANSION_BALANCE.workers}人を生産から外す / ${V39_LAND_EXPANSION_BALANCE.turns}ターン。停止中は生産へ復帰。</div>`;
}

document.addEventListener("click", event => {
  const button = event.target instanceof Element ? event.target.closest("[data-expansion-action]") : null;
  if (!button || window.isV39MapInputLocked?.()) return;
  const { state, player, settlement, map } = context();
  if (!settlement || state.timeline?.phase !== "player") return;
  const action = button.dataset.expansionAction;
  if (action === "choose") {
    if (selection) clearSelection();
    else {
      const candidates = getV39LandExpansionCandidates(state, player.id, settlement.settlementId, map);
      if (!candidates.length) { window.showV39TurnBanner?.("開拓可能な土地がありません"); return; }
      window.cancelV39SelectedUnitMove?.(); window.cancelV39SelectedUnitAttack?.();
      selection = { playerId:player.id, settlementId:settlement.settlementId, tile:null };
      drawCandidates(candidates);
    }
    window.renderV39SettlementPanel?.();
    return;
  }
  const result = action === "cancel"
    ? cancelV39LandExpansion(state, player.id, settlement.settlementId, button.dataset.expansionKey)
    : startV39LandExpansion(state, player.id, settlement.settlementId, selection?.tile, map);
  if (!result.ok) { window.showV39TurnBanner?.(result.reason); return; }
  clearSelection();
  window.setV39GameState?.({ players:result.state.players }, { reason:"land-expansion" });
  window.appendV39ActivityLog?.(player.id, "開拓", action === "cancel" ? `開拓中止: ${button.dataset.expansionKey}` : `開拓開始: ${result.project.tileKey}`);
});

window.addEventListener("v39:tile-selected", event => {
  if (!selection) return;
  const { state, player, settlement, map } = context();
  if (player?.id !== selection.playerId || settlement?.settlementId !== selection.settlementId) { clearSelection(); return; }
  const check = inspectV39LandExpansion(state, player.id, settlement.settlementId, event.detail, map);
  selection.tile = check.ok ? { x:event.detail.x, y:event.detail.y } : null;
  if (!check.ok) window.showV39TurnBanner?.(check.reason);
  window.renderV39SettlementPanel?.();
});
window.addEventListener("v39:footer-tab-changed", event => { if (event.detail?.tab !== "settlement") clearSelection(); });
window.addEventListener("v39:field-generated", clearSelection);
window.addEventListener("keydown", event => { if (event.key === "Escape" && selection) { clearSelection(); window.renderV39SettlementPanel?.(); } });
