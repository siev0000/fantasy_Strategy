const MAX_LOGS = 300;
let sequence = 0;
let selectedLogGroupId = "";

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));

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

function testModeEnabled() {
  return window.isV39TestMode?.() === true || window.getV39DisplaySettings?.().testMode === true;
}

function logGroups() {
  const state = window.getV39GameState?.();
  const activePlayer = state?.players?.find(player => text(player?.id) === text(state?.activePlayerId)) || state?.players?.[0] || null;
  const groups = [{ id:`player:${text(activePlayer?.id, "active")}`, label:"自勢力", rows:activeLog(), kind:"activity" }];
  if (!testModeEnabled()) return groups;

  for (const player of state?.players || []) {
    if (player?.isPlayer !== false) continue;
    groups.push({
      id:`player:${text(player.id)}`,
      label:text(player.label, player.id),
      kind:"ai",
      rows:(player?.factionState?.aiState?.history || []).map((entry, index) => ({
        id:`player-ai:${text(player.id)}:${entry?.turn || 0}:${index}`,
        turn:Math.max(1, Math.floor(number(entry?.turn, 1))),
        actorName:text(player.label, player.id),
        decision:(entry?.commands || []).join(" / ") || "待機",
        reason:(entry?.commands || []).length ? "国家AIが実行したコマンド" : "実行可能な国家コマンドなし"
      }))
    });
  }

  const enemyLogs = state?.enemyCombatRuntime?.decisionLogsByFactionId || {};
  const knownIds = new Set(groups.map(group => group.id));
  for (const nest of state?.enemyNests || []) {
    const id = `nest:${text(nest.id)}`;
    knownIds.add(id);
    groups.push({ id, label:`${text(nest.name, nest.nestType || "敵の巣")} (${Math.floor(number(nest.x))},${Math.floor(number(nest.y))})`, kind:"ai", rows:enemyLogs[id] || [] });
  }
  for (const [id, rows] of Object.entries(enemyLogs)) {
    if (knownIds.has(id)) continue;
    groups.push({ id, label:text(rows?.[rows.length - 1]?.factionLabel, id), kind:"ai", rows:Array.isArray(rows) ? rows : [] });
  }
  return groups;
}

function renderLogRow(entry, kind) {
  if (kind === "activity") return `<article class="v39-log-row"><span>T${Math.max(1, Math.floor(number(entry.turn, 1)))}</span><b>${escapeHtml(text(entry.category) || "システム")}</b><p>${escapeHtml(entry.message)}</p></article>`;
  return `<article class="v39-log-row v39-ai-log-row"><span>T${Math.max(1, Math.floor(number(entry.turn, 1)))}</span><b>${escapeHtml(entry.actorName || "AI")}</b><p><strong>${escapeHtml(entry.decision || "待機")}</strong>${entry.reason ? `<small>${escapeHtml(entry.reason)}</small>` : ""}</p></article>`;
}

function renderLogModal() {
  const modal = document.getElementById("rulerLogModal");
  if (!(modal instanceof HTMLElement)) return;
  if (modal.dataset.v39LogReady !== "true") {
    modal.dataset.v39LogReady = "true";
    modal.innerHTML = `<div class="modal v39-log-modal"><div class="modal-head"><h2>活動ログ</h2><button class="close" data-close>×</button></div><div class="modal-body v39-log-body"><nav id="v39-log-group-tabs" class="v39-log-group-tabs" hidden></nav><div id="v39-log-list"></div></div></div>`;
    modal.querySelector("[data-close]")?.addEventListener("click", () => modal.classList.remove("open"));
    modal.querySelector("#v39-log-group-tabs")?.addEventListener("click", event => {
      const button = event.target instanceof Element ? event.target.closest("[data-v39-log-group]") : null;
      if (!button) return;
      selectedLogGroupId = text(button.dataset.v39LogGroup);
      renderLogModal();
    });
  }
  const groups = logGroups();
  if (!groups.some(group => group.id === selectedLogGroupId)) selectedLogGroupId = groups[0]?.id || "";
  const selected = groups.find(group => group.id === selectedLogGroupId) || groups[0];
  const tabs = modal.querySelector("#v39-log-group-tabs");
  if (tabs) {
    tabs.hidden = !testModeEnabled() || groups.length < 2;
    tabs.innerHTML = groups.map(group => `<button type="button" data-v39-log-group="${escapeHtml(group.id)}" class="${group.id === selected?.id ? "active" : ""}">${escapeHtml(group.label)} <small>${group.rows.length}</small></button>`).join("");
  }
  const list = modal.querySelector("#v39-log-list");
  const rows = [...(selected?.rows || [])].reverse();
  if (list) list.innerHTML = rows.length ? rows.map(entry => renderLogRow(entry, selected?.kind)).join("") : `<div class="v39-log-empty">この勢力のログはありません</div>`;
}

function installStyles() {
  if (document.getElementById("v39-activity-log-style")) return;
  const style = document.createElement("style");
  style.id = "v39-activity-log-style";
  style.textContent = `.v39-log-modal{width:min(760px,94vw);height:min(620px,86vh)}.v39-log-body{overflow:auto!important}.v39-log-group-tabs{display:flex;gap:6px;overflow-x:auto;padding:0 0 9px;border-bottom:1px solid #30434a}.v39-log-group-tabs[hidden]{display:none}.v39-log-group-tabs button{flex:0 0 auto;min-height:38px;border:1px solid #486169;border-radius:7px;background:#142329;color:#e8efee;padding:6px 10px;font-size:15px;font-weight:800}.v39-log-group-tabs button.active{border-color:#63d6e7;background:#1d4b55}.v39-log-group-tabs small{color:#a9bbc0}.v39-log-row{display:grid;grid-template-columns:48px 90px minmax(0,1fr);gap:8px;align-items:start;padding:9px;border-bottom:1px solid #30434a}.v39-log-row span{color:#83d9a4;font-weight:800}.v39-log-row b{color:#e3c778}.v39-log-row p{margin:0;color:#dce6e6;line-height:1.45}.v39-ai-log-row p{display:grid;gap:3px}.v39-ai-log-row strong{color:#f0d17b}.v39-ai-log-row small{color:#aebdc0;font-size:14px}.v39-log-empty{padding:24px;color:#91a2a6;text-align:center}@media(max-width:620px){.v39-log-row{grid-template-columns:40px 72px minmax(0,1fr);gap:5px;padding:7px;font-size:14px}.v39-log-group-tabs button{font-size:14px;padding:5px 8px}}`;
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
window.addEventListener("v39:territory-hazard-damage", event => {
  const grouped = new Map();
  for (const entry of event?.detail?.entries || []) {
    const playerId = text(entry?.ownerPlayerId);
    if (!playerId) continue;
    if (!grouped.has(playerId)) grouped.set(playerId, []);
    grouped.get(playerId).push(entry);
  }
  for (const [playerId, entries] of grouped) {
    const populationLoss = (event?.detail?.populationEntries || [])
      .filter(row => text(row?.playerId) === playerId)
      .reduce((sum, row) => sum + number(row?.damage), 0);
    appendV39ActivityLog(playerId, "地形", `領土被害: ${entries.length}マス${populationLoss ? ` / 人口-${populationLoss}` : ""}`, { entries });
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
window.addEventListener("v39:ai-log-added", () => {
  if (document.getElementById("rulerLogModal")?.classList.contains("open")) renderLogModal();
});
window.addEventListener("v39:display-settings-changed", () => {
  if (document.getElementById("rulerLogModal")?.classList.contains("open")) renderLogModal();
});
document.addEventListener("click", event => {
  if (event.target instanceof Element && event.target.closest('[data-open="rulerLog"]')) window.requestAnimationFrame(renderLogModal);
}, true);

window.appendV39ActivityLog = appendV39ActivityLog;
window.renderV39ActivityLog = renderLogModal;
installStyles();
renderLogModal();
