import { V39_LOG_PREVIEW_BALANCE } from "../../lib/v39-gameplay-balance.js";

const CHANNELS = ["notification", "battle", "chat"];
const LABELS = { notification:"通知", battle:"戦闘", chat:"チャット" };
const MAX_MESSAGES = 150;
const DETAIL_COLLAPSE_CHAR_LIMIT = 120;
const DETAIL_COLLAPSE_LINE_LIMIT = 4;

let chatPreviewTimer = 0;
let previews = [];

let sequence = 0;
let activeChannel = "notification";
let collapsed = false;
const messages = [];

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

function normalizeChannel(value) {
  return CHANNELS.includes(value) ? value : "notification";
}

function currentTurn() {
  const turn = Number(window.getV39TimelineState?.()?.turnNumber);
  return Number.isFinite(turn) ? Math.max(1, Math.floor(turn)) : null;
}

function canSeeMessage(entry) {
  if (entry.channel !== "battle" || !entry.combatVisibility) return true;
  if (window.isV39TestMode?.() === true) return true;
  const state = window.getV39EnemyTurnState?.();
  const visibility = entry.combatVisibility;
  return visibility.observed && visibility.playerId === state?.activePlayerId
    && visibility.worldId === (state?.activeWorldId || "surface");
}

// 発生時の索敵で判定。後で地図を探索しても過去の見えなかった戦闘は公開しない。
function combatVisibility(detail) {
  const state = window.getV39EnemyTurnState?.();
  const units = (state?.players || []).flatMap(player => player.factionState?.units || []);
  const guards = (state?.neutralVillages || []).flatMap(village => village.defenseUnits || []);
  const attacker = [...units, ...(state?.enemies || []), ...guards].find(unit => String(unit.id) === String(detail.attackerId));
  const points = [attacker, detail.target, ...(detail.entries || [])];
  const observed = !window.__v39BackgroundWorldTurn && points.some(point =>
    Number.isFinite(point?.x) && Number.isFinite(point?.y)
      && window.isV39TileInCurrentVision?.(point.x, point.y) === true);
  return { playerId:state?.activePlayerId, worldId:state?.activeWorldId || "surface", observed };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[char]));
}

function multilineHtml(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function renderDetails(entry) {
  const details = text(entry.details);
  if (!details) return "";
  const lineCount = details.split(/\r?\n/).length;
  const shouldCollapse = entry.collapsible === true
    || details.length >= DETAIL_COLLAPSE_CHAR_LIMIT
    || lineCount >= DETAIL_COLLAPSE_LINE_LIMIT;
  if (!shouldCollapse) return `<p class="v39-side-log-details-inline">${multilineHtml(details)}</p>`;
  return `<details class="v39-side-log-details">
    <summary><span>詳細</span></summary>
    <p>${multilineHtml(details)}</p>
  </details>`;
}

function renderMessage(entry) {
  const tone = ["info", "success", "warn", "danger", "debug"].includes(entry.tone) ? entry.tone : "info";
  const meta = entry.meta ? `<small>${escapeHtml(entry.meta)}</small>` : "";
  const turn = entry.turn ? `<span>T${entry.turn}</span>` : "";
  return `<article class="v39-side-log-entry ${tone}" data-v39-side-log-id="${escapeHtml(entry.id)}">
    <div class="v39-side-log-entry-head">${turn}<b>${escapeHtml(entry.title || LABELS[entry.channel])}</b></div>
    <p>${multilineHtml(entry.message)}</p>
    ${renderDetails(entry)}
    ${meta}
  </article>`;
}

function hideChatPreview() {
  previews = previews.filter(entry => entry.channel !== "chat");
  renderPreviews();
}

function renderPreviews() {
  window.clearTimeout(chatPreviewTimer);
  previews = previews.filter(entry => entry.expiresAt > Date.now() && canSeeMessage(entry));
  for (const channel of ["chat", "battle"]) {
    const preview = document.getElementById(`v39-${channel}-preview`);
    if (!(preview instanceof HTMLElement)) continue;
    const rows = previews.filter(entry => entry.channel === channel);
    preview.innerHTML = rows.map(entry => `<button type="button" data-preview-channel="${entry.channel}"><strong>${escapeHtml(entry.title)}</strong><p>${multilineHtml(entry.message)}</p></button>`).join("");
    preview.classList.toggle("show", rows.length > 0);
  }
  if (previews.length) chatPreviewTimer = window.setTimeout(renderPreviews, Math.max(1, Math.min(...previews.map(entry => entry.expiresAt)) - Date.now()));
}

function showChatPreview(entry) {
  if (entry.channel !== "battle" && entry.channel !== "chat") return;
  if (!canSeeMessage(entry)) return;
  if (entry.channel === "chat" && !collapsed && activeChannel === "chat") return;
  previews.push({ ...entry, expiresAt:Date.now() + V39_LOG_PREVIEW_BALANCE.durationMs });
  const channelRows = previews.filter(row => row.channel === entry.channel).slice(-V39_LOG_PREVIEW_BALANCE.maxEntries);
  previews = [...previews.filter(row => row.channel !== entry.channel), ...channelRows];
  renderPreviews();
}

function render() {
  const rail = document.getElementById("v39-side-log");
  const list = document.getElementById("v39-side-log-list");
  if (!(rail instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

  rail.classList.toggle("collapsed", collapsed);
  rail.dataset.channel = activeChannel;
  const channelLabel = rail.querySelector("[data-v39-side-channel-label]");
  const channelSwitch = rail.querySelector("[data-v39-side-channel-switch]");
  const activeLabel = LABELS[activeChannel];
  const nextLabel = LABELS[CHANNELS[(CHANNELS.indexOf(activeChannel) + 1) % CHANNELS.length]];
  if (channelLabel instanceof HTMLElement) channelLabel.textContent = activeLabel;
  if (channelSwitch instanceof HTMLElement) {
    channelSwitch.setAttribute("aria-label", `${activeLabel}表示中。ヘッダーをタップして${nextLabel}へ切り替え`);
    channelSwitch.title = `${nextLabel}へ切り替え`;
  }

  const rows = messages.filter(entry => entry.channel === activeChannel && canSeeMessage(entry));
  if (!rows.length) {
    list.innerHTML = `<div class="v39-side-log-empty">${activeLabel}はまだありません</div>`;
    return;
  }
  list.innerHTML = rows.map(renderMessage).join("");
  list.scrollTop = list.scrollHeight;
}

export function pushV39SideRailMessage(input, options = {}) {
  const source = typeof input === "string" ? { message:input } : (input || {});
  const message = text(source.message ?? source.text);
  if (!message) return null;
  const channel = normalizeChannel(source.channel ?? options.channel);
  const entry = {
    id:text(source.id) || `side-log:${Date.now()}:${sequence += 1}`,
    channel,
    combatVisibility:source.combatVisibility,
    title:text(source.title, LABELS[channel]),
    message,
    details:text(source.details ?? options.details),
    collapsible:source.collapsible === true || options.collapsible === true,
    meta:text(source.meta),
    tone:text(source.tone, "info"),
    turn:Number.isFinite(Number(source.turn)) ? Math.max(1, Math.floor(Number(source.turn))) : currentTurn(),
    createdAt:Date.now()
  };
  messages.push(entry);
  if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES);
  render();
  showChatPreview(entry);
  window.dispatchEvent(new CustomEvent("v39:side-log-message", { detail:{ entry } }));
  return entry.id;
}

export function updateV39SideRailMessage(id, patch = {}) {
  const index = messages.findIndex(entry => entry.id === String(id || ""));
  if (index < 0) return false;
  messages[index] = {
    ...messages[index],
    ...patch,
    id:messages[index].id,
    channel:normalizeChannel(patch.channel ?? messages[index].channel),
    message:text(patch.message ?? messages[index].message),
    details:text(patch.details ?? messages[index].details),
    collapsible:patch.collapsible === undefined ? messages[index].collapsible : patch.collapsible === true
  };
  render();
  return true;
}

function installStyles() {
  if (document.getElementById("v39-side-log-style")) return;
  const style = document.createElement("style");
  style.id = "v39-side-log-style";
  style.textContent = `
    .playfield{--v39-side-log-width:clamp(170px,21vw,250px)}
    #v39-side-log{
      position:absolute;right:0;top:6px;bottom:52px;z-index:29;
      width:var(--v39-side-log-width);min-width:0;
      display:grid;grid-template-rows:auto minmax(0,1fr);
      border:1px solid rgba(108,139,148,.62);border-right:0;border-radius:9px 0 0 9px;
      background:linear-gradient(180deg,rgba(10,20,24,.62),rgba(7,14,17,.52));
      box-shadow:0 8px 24px rgba(0,0,0,.22);overflow:hidden;
      backdrop-filter:blur(4px);pointer-events:auto
    }
    #v39-side-log.collapsed{width:15px;grid-template-rows:auto 0;border-radius:5px 0 0 5px}
    .v39-side-log-head{
      display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:4px;padding:4px;
      border-bottom:1px solid rgba(52,71,78,.72);background:rgba(17,31,36,.68);
      cursor:pointer;user-select:none;touch-action:manipulation
    }
    #v39-side-log[data-channel="chat"] .v39-side-log-head{background:rgba(19,45,52,.82)}
    .v39-side-log-channel-label{min-width:0;display:flex;align-items:center;padding:0 5px;color:#dce8e9;font-size:var(--font-size-11);font-weight:900}
    .v39-side-log-collapse{
      min-height:30px;border:1px solid rgba(65,85,93,.82);border-radius:6px;background:rgba(19,33,40,.72);color:#c9d7d9;
      font-size:var(--font-size-14);font-weight:800;cursor:pointer;padding:0
    }
    #v39-side-log.collapsed .v39-side-log-channel-label{display:none}
    #v39-side-log.collapsed .v39-side-log-head{grid-template-columns:1fr;gap:0;padding:1px;border-bottom:0;background:rgba(17,31,36,.58)}
    #v39-side-log.collapsed .v39-side-log-collapse{width:13px;min-width:13px;min-height:24px;height:24px;border-radius:4px;font-size:var(--font-size-10)}
    #v39-side-log-list{min-height:0;overflow-y:auto;overflow-x:hidden;padding:5px;display:grid;gap:5px;align-content:start;scrollbar-width:thin}
    #v39-side-log.collapsed #v39-side-log-list{display:none}
    .v39-side-log-entry{border:1px solid rgba(57,75,82,.82);border-left:3px solid #5eb8c6;border-radius:6px;background:rgba(18,31,36,.70);padding:6px 7px;display:grid;gap:3px}
    #v39-side-log:hover,#v39-side-log:focus-within{background:linear-gradient(180deg,rgba(10,20,24,.78),rgba(7,14,17,.70))}
    #v39-side-log:hover .v39-side-log-head,#v39-side-log:focus-within .v39-side-log-head{background:rgba(17,31,36,.82)}
    .v39-side-log-entry.success{border-left-color:#67c887}.v39-side-log-entry.warn{border-left-color:#d6b45f}.v39-side-log-entry.danger{border-left-color:#d87365}.v39-side-log-entry.debug{border-left-color:#9c87d8}
    .v39-side-log-entry-head{display:flex;align-items:center;gap:5px;min-width:0}
    .v39-side-log-entry-head span{flex:0 0 auto;color:#79d29b;font-size:var(--font-size-9);font-weight:800}
    .v39-side-log-entry-head b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e5d194;font-size:var(--font-size-10)}
    .v39-side-log-entry p{margin:0;color:#e2e9e9;font-size:var(--font-size-10);line-height:1.35;word-break:break-word}
    .v39-side-log-entry small{color:#93a6aa;font-size:var(--font-size-9);line-height:1.25}
    .v39-side-log-details-inline{padding-top:3px;border-top:1px solid rgba(78,102,111,.45);color:#b9c8ca!important}
    .v39-side-log-details{margin-top:2px;border-top:1px solid rgba(78,102,111,.45);padding-top:3px}
    .v39-side-log-details summary{list-style:none;cursor:pointer;color:#9cc9d0;font-size:var(--font-size-9);font-weight:800;user-select:none}
    .v39-side-log-details summary::-webkit-details-marker{display:none}
    .v39-side-log-details summary::before{content:"▷";display:inline-block;width:12px;color:#78cbd8}
    .v39-side-log-details[open] summary::before{content:"▽"}
    .v39-side-log-details p{margin-top:4px!important;color:#b9c8ca!important;font-size:var(--font-size-9)!important;line-height:1.4!important}
    .v39-side-log-empty{padding:16px 8px;color:#82969b;font-size:var(--font-size-10);text-align:center}
    .v39-log-preview{
      display:none;width:min(520px,96%);pointer-events:auto
    }
    .v39-log-preview.show{display:grid;gap:5px}
    #v39-chat-preview{position:absolute;right:6px;top:44px;bottom:52px;width:calc(var(--v39-side-log-width) - 6px);max-width:calc(100% - 12px);z-index:30;align-content:start;overflow-y:auto;overflow-x:hidden;pointer-events:none}
    #v39-chat-preview button{pointer-events:auto}
    .playfield:has(#v39-turn-banner.show) #v39-battle-preview{margin-top:calc(var(--font-size-16)*3 + 16px)}
    .v39-log-preview button{min-width:0;padding:7px 10px;text-align:left;border:1px solid #70cbd9;border-radius:8px;background:rgba(9,25,30,.96);box-shadow:0 4px 12px #0005;cursor:pointer}
    .v39-log-preview strong{font-size:var(--font-body);color:#8ee0ec}
    .v39-log-preview p{margin:0;font-size:var(--font-body);line-height:1.4;color:#eef6f6;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;word-break:break-word}
    @media(max-width:700px){
      .playfield{--v39-side-log-width:min(36vw,190px)}
      #v39-side-log{right:0;top:5px;bottom:48px}
      .v39-side-log-entry{padding:5px 6px}.v39-side-log-entry p{font-size:var(--font-size-9)}.v39-side-log-entry-head b{font-size:var(--font-size-9)}
    }
  `;
  document.head.appendChild(style);
}

function install() {
  const playfield = document.querySelector(".playfield");
  if (!(playfield instanceof HTMLElement) || document.getElementById("v39-side-log")) return;
  installStyles();
  const rail = document.createElement("aside");
  rail.id = "v39-side-log";
  rail.setAttribute("aria-label", "通知・戦闘・チャットログ");
  rail.innerHTML = `<div class="v39-side-log-head" data-v39-side-channel-switch role="button" tabindex="0" aria-label="通知表示中。ヘッダーをタップしてチャットへ切り替え">
    <div class="v39-side-log-channel-label" data-v39-side-channel-label>通知</div>
    <button type="button" class="v39-side-log-collapse" aria-label="通知欄を折りたたむ">›</button>
  </div><div id="v39-side-log-list"></div>`;
  playfield.appendChild(rail);
  playfield.classList.add("v39-has-side-log");

  const feedbackLane = document.getElementById("v39FeedbackLane");
  for (const [channel, parent] of [["chat", playfield], ["battle", feedbackLane]]) {
    if (!(parent instanceof HTMLElement) || document.getElementById(`v39-${channel}-preview`)) continue;
    const preview = document.createElement("div");
    preview.id = `v39-${channel}-preview`;
    preview.className = "v39-log-preview";
    preview.setAttribute("role", "status");
    preview.setAttribute("aria-live", "polite");
    parent.appendChild(preview);
    preview.addEventListener("click", event => {
      const button = event.target.closest("[data-preview-channel]");
      if (!button) return;
      activeChannel = button.dataset.previewChannel;collapsed = false;
      rail.querySelector(".v39-side-log-collapse").textContent = "›";
      render();
      if (activeChannel === "chat") hideChatPreview();
    });
    for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "click", "dblclick", "contextmenu"]) {
      preview.addEventListener(eventName, event => event.stopPropagation());
    }
  }

  for (const eventName of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "dblclick", "contextmenu"]) {
    rail.addEventListener(eventName, event => event.stopPropagation());
  }
  const toggleChannel = () => {
    activeChannel = CHANNELS[(CHANNELS.indexOf(activeChannel) + 1) % CHANNELS.length];
    render();
  };
  rail.addEventListener("click", event => {
    event.stopPropagation();
    if (event.target instanceof Element && event.target.closest(".v39-side-log-collapse")) {
      collapsed = !collapsed;
      rail.querySelector(".v39-side-log-collapse").textContent = collapsed ? "‹" : "›";
      render();
      if (!collapsed && activeChannel === "chat") hideChatPreview();
      return;
    }
    if (event.target instanceof Element && event.target.closest("[data-v39-side-channel-switch]")) {
      toggleChannel();
      if (!collapsed && activeChannel === "chat") hideChatPreview();
    }
  });
  rail.addEventListener("keydown", event => {
    if (!(event.target instanceof Element) || !event.target.matches("[data-v39-side-channel-switch]")) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    toggleChannel();
    if (!collapsed && activeChannel === "chat") hideChatPreview();
  });
  render();
}

window.pushV39SideRailMessage = pushV39SideRailMessage;
window.pushV39Notification = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"notification", message });
window.pushV39ChatMessage = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"chat", message });
window.updateV39SideRailMessage = updateV39SideRailMessage;
window.getV39SideRailMessages = () => messages.filter(canSeeMessage).map(entry => ({ ...entry }));

window.addEventListener("v39:combat-log", event => {
  if (!event.detail?.summary) return;
  const map = window.__v39FieldRuntime?.mapData;
  pushV39SideRailMessage({channel:"battle",title:map?.isUnderground ? `洞窟 ${map.caveFloor}階` : "戦闘",message:event.detail.summary,combatVisibility:combatVisibility(event.detail)});
});

let logViewKey = "";
function refreshLogVisibility() {
  if (window.__v39BackgroundWorldTurn) return;
  const state = window.getV39EnemyTurnState?.();
  const key = `${state?.activePlayerId}:${state?.activeWorldId}:${window.isV39TestMode?.() === true}`;
  if (key === logViewKey) return;
  logViewKey = key;
  render();
  renderPreviews();
}
window.addEventListener("v39:display-settings-changed", refreshLogVisibility);
window.addEventListener("v39:game-state-changed", refreshLogVisibility);

install();
