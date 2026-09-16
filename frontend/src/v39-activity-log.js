const MAX_LOGS = 300;
let sequence = 0;

const text = value => String(value ?? "").trim();
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function playerIdsForCombat(state, detail) {
  const ids = new Set();
  const actorId = text(detail?.attackerId);
  const targetIds = new Set((detail?.entries || []).map(row => text(row?.targetId)).filter(Boolean));
  for (const player of state?.players || []) {
    const units = player?.factionState?.units || [];
    if (units.some(unit => text(unit?.id) === actorId || targetIds.has(text(unit?.id)))) ids.add(player.id);
  }
  if (!ids.size && state?.activePlayerId) ids.add(state.activePlayerId);
  return [...ids];
}

export function appendV39ActivityLog(playerIds, category, message, detail = {}) {
  const state = window.getV39GameState?.();
  const targetIds = new Set((Array.isArray(playerIds) ? playerIds : [playerIds]).map(text).filter(Boolean));
  if (!state || !targetIds.size || !text(message)) return null;
  const turn = Math.max(1, Math.floor(number(state?.timeline?.turnNumber, 1)));
  const entry = {
    id:`log:${turn}:${Date.now()}:${sequence += 1}`,
    turn,
    category:text(category) || "システム",
    message:text(message),
    detail:detail && typeof detail === "object" ? detail : {}
  };
  const players = state.players.map(player => targetIds.has(text(player?.id)) ? ({
    ...player,
    factionState:{ ...player.factionState, activityLog:[...(player.factionState.activityLog || []), entry].slice(-MAX_LOGS) }
  }) : player);
  window.setV39GameState?.({ players }, { reason:"activity-log" });
  return entry;
}

function activeLog() {
  return window.getV39ActiveFactionState?.()?.activityLog || [];
}

function renderLogModal() {
  const modal = document.getElementById("rulerLogModal");
  if (!(modal instanceof HTMLElement)) return;
  if (modal.dataset.v39LogReady !== "true") {
    modal.dataset.v39LogReady = "true";
    modal.innerHTML = `<div class="modal v39-log-modal"><div class="modal-head"><h2>活動ログ</h2><button class="close" data-close>×</button></div><div class="modal-body v39-log-body"><div id="v39-log-list"></div></div></div>`;
    modal.querySelector("[data-close]")?.addEventListener("click", () => modal.classList.remove("open"));
  }
  const list = modal.querySelector("#v39-log-list");
  const rows = [...activeLog()].reverse();
  if (list) list.innerHTML = rows.length ? rows.map(entry => `<article class="v39-log-row"><span>T${Math.max(1, Math.floor(number(entry.turn, 1)))}</span><b>${text(entry.category) || "システム"}</b><p>${text(entry.message)}</p></article>`).join("") : `<div class="v39-log-empty">ログはありません</div>`;
}

function installStyles() {
  if (document.getElementById("v39-activity-log-style")) return;
  const style = document.createElement("style");
  style.id = "v39-activity-log-style";
  style.textContent = `.v39-log-modal{width:min(760px,94vw);height:min(620px,86vh)}.v39-log-body{overflow:auto!important}.v39-log-row{display:grid;grid-template-columns:48px 90px minmax(0,1fr);gap:8px;align-items:start;padding:9px;border-bottom:1px solid #30434a}.v39-log-row span{color:#83d9a4;font-weight:800}.v39-log-row b{color:#e3c778}.v39-log-row p{margin:0;color:#dce6e6;line-height:1.45}.v39-log-empty{padding:24px;color:#91a2a6;text-align:center}@media(max-width:620px){.v39-log-row{grid-template-columns:40px 72px minmax(0,1fr);gap:5px;padding:7px;font-size:14px}}`;
  document.head.appendChild(style);
}

window.addEventListener("v39:combat-log", event => {
  const state = window.getV39GameState?.();
  const summary = text(event?.detail?.summary);
  if (state && summary) appendV39ActivityLog(playerIdsForCombat(state, event.detail), "戦闘", summary, event.detail);
});
window.addEventListener("v39:terrain-damage", event => {
  const state = window.getV39GameState?.();
  for (const player of state?.players || []) {
    const ids = new Set((player?.factionState?.units || []).map(unit => text(unit?.id)));
    const entries = (event?.detail?.entries || []).filter(row => ids.has(text(row?.targetId)));
    if (entries.length) appendV39ActivityLog(player.id, "地形", `溶岩被害: ${entries.map(row => `${text(row.name) || text(row.targetId)} ${number(row.damage)}`).join(" / ")}`, { entries });
  }
});
window.addEventListener("v39:construction-started", event => appendV39ActivityLog(window.getV39GameState?.()?.activePlayerId, "建設", `${text(event?.detail?.facilityName)}の建設を開始`));
window.addEventListener("v39:construction-completed", event => {
  for (const row of event?.detail?.completed || []) appendV39ActivityLog(row.playerId, "建設", `${text(row.facilityName)}が完成`);
});
window.addEventListener("v39:research-completed", event => appendV39ActivityLog(event?.detail?.playerId || window.getV39GameState?.()?.activePlayerId, "研究", `${text(event?.detail?.itemName || event?.detail?.name)}を完了`));
window.addEventListener("v39:turn-advanced", event => appendV39ActivityLog(window.getV39GameState?.()?.activePlayerId, "ターン", `ターン${event?.detail?.turnNumber}開始`));
window.addEventListener("v39:game-state-changed", () => {
  if (document.getElementById("rulerLogModal")?.classList.contains("open")) renderLogModal();
});
document.addEventListener("click", event => {
  if (event.target instanceof Element && event.target.closest('[data-open="rulerLog"]')) window.requestAnimationFrame(renderLogModal);
}, true);

window.appendV39ActivityLog = appendV39ActivityLog;
window.renderV39ActivityLog = renderLogModal;
installStyles();
renderLogModal();
