import { V39_LOG_PREVIEW_BALANCE } from "../../lib/v39-gameplay-balance.js";
import {buildV39EnvironmentDamageLogs,mergeV39EnvironmentDamageLogs} from '../../lib/v39-environment-damage-log.js';

const CHANNELS = ["notification", "battle", "chat"];
const LABELS = { notification:"通知", battle:"戦闘", chat:"チャット" };
const MAX_MESSAGES = 150;
const DETAIL_COLLAPSE_CHAR_LIMIT = 120;
const DETAIL_COLLAPSE_LINE_LIMIT = 4;

let chatPreviewTimer = 0;
let previews = [];
let previewSequence = 0;

let sequence = 0;
let activeChannel = "notification";
let collapsed = true;
const unreadIds = new Set();
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
  if(entry.audiencePlayerId&&entry.audiencePlayerId!==(window.getV39GameState?.({includeWorlds:false})||window.getV39EnemyTurnState?.())?.activePlayerId)return false;
  if(entry.environmentVisibility){
    const state=window.getV39EnemyTurnState?.(),visibility=entry.environmentVisibility;
    if(visibility.playerId!==state?.activePlayerId)return false;
    if(window.isV39TestMode?.()!==true&&(!visibility.observed||visibility.worldId!==(state?.activeWorldId||'surface')))return false;
  }
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
    ${entry.action?.kind==='diplomacy'?`<button type="button" class="v39-side-diplomacy-link" data-v39-side-diplomacy="${escapeHtml(entry.id)}">外交を開く</button>`:''}
    ${renderDetails(entry)}
    ${meta}
  </article>`;
}

export function openV39SideLogDiplomacy(entry){
  const state=window.getV39GameState?.({includeWorlds:false});
  if(!entry||!canSeeMessage(entry)||entry.action?.kind!=='diplomacy'||entry.audiencePlayerId!==state?.activePlayerId
    ||!state.players?.some(player=>player.id===entry.action.targetPlayerId)||typeof window.openV39FactionDiplomacy!=='function')return false;
  window.openV39FactionDiplomacy(entry.action.targetPlayerId);return true;
}

function hideChatPreview() {
  previews = previews.filter(entry => entry.channel !== "chat");
  renderPreviews();
}

function renderPreviews() {
  window.clearTimeout(chatPreviewTimer);
  previews = previews.filter(entry => entry.expiresAt > Date.now() && canSeeMessage(entry));
  for (const channel of CHANNELS) {
    const preview = document.getElementById(`v39-${channel}-preview`);
    if (!(preview instanceof HTMLElement)) continue;
    const rows = collapsed ? previews.filter(entry => entry.channel === channel&&canSeeMessage(entry)) : [];
    preview.innerHTML = rows.map(entry => `<button type="button" style="order:${-entry.previewOrder}" data-preview-channel="${entry.channel}" data-preview-log-id="${escapeHtml(entry.id)}"><strong>${escapeHtml(entry.title)}</strong><p>${multilineHtml(entry.message)}</p></button>`).join("");
    preview.classList.toggle("show", rows.length > 0);
  }
  if (previews.length) chatPreviewTimer = window.setTimeout(renderPreviews, Math.max(1, Math.min(...previews.map(entry => entry.expiresAt)) - Date.now()));
}

function showChatPreview(entry) {
  if (entry.channel === "notification" && !entry.preview) return;
  if (!canSeeMessage(entry)) return;
  if (!collapsed) return;
  // 同じ案内の連続更新は1件にまとめ、チャンネルをまたいで新着順に並べる。
  previews = previews.filter(row => row.channel !== entry.channel || row.message !== entry.message);
  previews.push({ ...entry, previewOrder:++previewSequence, expiresAt:Date.now() + (entry.durationMs || V39_LOG_PREVIEW_BALANCE.durationMs) });
  previews = previews.slice(-V39_LOG_PREVIEW_BALANCE.maxEntries);
  renderPreviews();
}

function render() {
  const rail = document.getElementById("v39-side-log");
  const list = document.getElementById("v39-side-log-list");
  if (!(rail instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

  rail.classList.toggle("collapsed", collapsed);
  renderPreviews();
  rail.dataset.channel = activeChannel;
  const channelLabel = rail.querySelector("[data-v39-side-channel-label]");
  const channelSwitch = rail.querySelector("[data-v39-side-channel-switch]");
  const activeLabel = LABELS[activeChannel];
  const nextLabel = LABELS[CHANNELS[(CHANNELS.indexOf(activeChannel) + 1) % CHANNELS.length]];
  if (!collapsed) {
    messages.filter(entry => entry.channel === activeChannel && canSeeMessage(entry)).forEach(entry => unreadIds.delete(entry.id));
    previews = previews.filter(entry => entry.channel !== activeChannel);
    renderPreviews();
  }
  const unread = messages.filter(entry => unreadIds.has(entry.id) && canSeeMessage(entry)).length;
  if (channelLabel instanceof HTMLElement) channelLabel.textContent = `${activeLabel}${collapsed && unread ? ` (${unread})` : ""}`;
  const toggle = rail.querySelector(".v39-side-log-collapse");
  toggle.textContent = collapsed ? "‹" : "›";
  toggle.setAttribute("aria-expanded", String(!collapsed));
  toggle.setAttribute("aria-label", collapsed ? `通知欄を開く。未読${unread}件` : "通知欄を折りたたむ");
  toggle.title = collapsed ? `履歴を開く（未読${unread}件）` : "折りたたむ";
  if (channelSwitch instanceof HTMLElement) {
    channelSwitch.setAttribute("aria-label", collapsed ? `${activeLabel}の履歴を開く。未読${unread}件` : `${activeLabel}表示中。ヘッダーをタップして${nextLabel}へ切り替え`);
    channelSwitch.title = collapsed ? "履歴を開く" : `${nextLabel}へ切り替え`;
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
    environmentVisibility:source.environmentVisibility,
    audiencePlayerId:source.audiencePlayerId,
    action:source.action?.kind==='diplomacy'?{kind:'diplomacy',targetPlayerId:source.action.targetPlayerId}:null,
    title:text(source.title, LABELS[channel]),
    message,
    details:text(source.details ?? options.details),
    collapsible:source.collapsible === true || options.collapsible === true,
    meta:text(source.meta),
    tone:text(source.tone, "info"),
    turn:Number.isFinite(Number(source.turn)) ? Math.max(1, Math.floor(Number(source.turn))) : currentTurn(),
    createdAt:Date.now()
  };
  entry.preview = source.preview === true;
  entry.durationMs = source.durationMs;
  messages.push(entry);
  unreadIds.add(entry.id);
  if (messages.length > MAX_MESSAGES) messages.splice(0, messages.length - MAX_MESSAGES).forEach(row => unreadIds.delete(row.id));
  render();
  showChatPreview(entry);
  window.dispatchEvent(new CustomEvent("v39:side-log-message", { detail:{ entry } }));
  return entry.id;
}

export function showV39SideNotice(message, options = {}) {
  const value = text(message);
  if (!value) return false;
  const entry = {channel:"notification",message:value,title:text(options.title,"通知"),
    tone:text(options.tone,"info"),meta:text(options.meta),preview:true,
    durationMs:Math.max(800,Number(options.durationMs) || V39_LOG_PREVIEW_BALANCE.durationMs)};
  if (options.log === false) showChatPreview(entry);
  else pushV39SideRailMessage(entry);
  return true;
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
  previews=previews.map(entry=>entry.id===id?{...entry,...messages[index],expiresAt:entry.expiresAt,previewOrder:entry.previewOrder}:entry);
  render();
  renderPreviews();
  return true;
}

function installStyles() {
  if (document.getElementById("v39-side-log-style")) return;
  const style = document.createElement("style");
  style.id = "v39-side-log-style";
  style.textContent = `
    .playfield{--v39-side-log-width:min(35vw,220px)}
    #v39-side-log{
      position:absolute;right:0;top:6px;bottom:0;z-index:29;
      width:var(--v39-side-log-width);min-width:0;
      display:grid;grid-template-rows:auto minmax(0,1fr);
      border:1px solid rgba(108,139,148,.62);border-right:0;border-radius:9px 0 0 9px;
      background:linear-gradient(180deg,rgba(10,20,24,.35),rgba(7,14,17,.25));
      box-shadow:0 8px 24px rgba(0,0,0,.22);overflow:hidden;
      pointer-events:auto
    }
    #v39-side-log.collapsed{width:15px;height:auto;bottom:auto;grid-template-rows:auto 0;border-radius:5px 0 0 5px}
    .v39-side-log-head{
      display:grid;grid-template-columns:minmax(0,1fr) 22px;gap:2px;padding:2px;
      border-bottom:1px solid rgba(52,71,78,.72);background:rgba(17,31,36,.40);
      cursor:pointer;user-select:none;touch-action:manipulation
    }
    #v39-side-log[data-channel="chat"] .v39-side-log-head{background:rgba(19,45,52,.45)}
    .v39-side-log-channel-label{min-width:0;display:flex;align-items:center;padding:0 2px;color:#dce8e9;font-size:var(--font-log);font-weight:900}
    .v39-side-log-collapse{
      min-height:22px;border:1px solid rgba(65,85,93,.82);border-radius:6px;background:rgba(19,33,40,.72);color:#c9d7d9;
      font-size:var(--font-size-14);font-weight:800;cursor:pointer;padding:0
    }
    #v39-side-log.collapsed .v39-side-log-channel-label{display:none}
    #v39-side-log.collapsed .v39-side-log-head{grid-template-columns:1fr;gap:0;padding:1px;border-bottom:0;background:rgba(17,31,36,.35)}
    #v39-side-log.collapsed .v39-side-log-collapse{width:13px;min-width:13px;min-height:24px;height:24px;border-radius:4px;font-size:var(--font-log)}
    #v39-side-log-list{min-height:0;overflow-y:auto;overflow-x:hidden;padding:2px;display:grid;gap:2px;align-content:start;}
    #v39-side-log.collapsed #v39-side-log-list{display:none}
    .v39-side-log-entry{border:1px solid rgba(57,75,82,.82);border-left:3px solid #5eb8c6;border-radius:6px;background:rgba(18,31,36,.35);padding:2px;display:grid;gap:2px}
    .v39-side-diplomacy-link{border:1px solid #be9d4b;border-radius:4px;padding:2px 4px;background:#302b19;color:#ffe197;font:inherit;text-align:left;cursor:pointer}
    #v39-side-log:hover,#v39-side-log:focus-within{background:linear-gradient(180deg,rgba(10,20,24,.45),rgba(7,14,17,.35))}
    #v39-side-log:hover .v39-side-log-head,#v39-side-log:focus-within .v39-side-log-head{background:rgba(17,31,36,.50)}
    .v39-side-log-entry.success{border-left-color:#67c887}.v39-side-log-entry.warn{border-left-color:#d6b45f}.v39-side-log-entry.danger{border-left-color:#d87365}.v39-side-log-entry.debug{border-left-color:#9c87d8}
    .v39-side-log-entry-head{display:flex;align-items:center;gap:5px;min-width:0}
    .v39-side-log-entry-head span{flex:0 0 auto;color:#79d29b;font-size:var(--font-log);font-weight:800}
    .v39-side-log-entry-head b{min-width:0;white-space:normal;overflow-wrap:anywhere;color:#e5d194;font-size:var(--font-log)}
    .v39-side-log-entry p{margin:0;color:#e2e9e9;font-size:var(--font-log);line-height:1.35;word-break:break-word}
    .v39-side-log-entry small{color:#93a6aa;font-size:var(--font-log);line-height:1.25}
    .v39-side-log-details-inline{padding-top:3px;border-top:1px solid rgba(78,102,111,.45);color:#b9c8ca!important}
    .v39-side-log-details{margin-top:2px;border-top:1px solid rgba(78,102,111,.45);padding-top:3px}
    .v39-side-log-details summary{list-style:none;cursor:pointer;color:#9cc9d0;font-size:var(--font-log);font-weight:800;user-select:none}
    .v39-side-log-details summary::-webkit-details-marker{display:none}
    .v39-side-log-details summary::before{content:"▷";display:inline-block;width:12px;color:#78cbd8}
    .v39-side-log-details[open] summary::before{content:"▽"}
    .v39-side-log-details p{margin-top:4px!important;color:#b9c8ca!important;font-size:var(--font-log)!important;line-height:1.4!important}
    .v39-side-log-empty{padding:16px 8px;color:#82969b;font-size:var(--font-log);text-align:center}
    .v39-log-preview{
      display:none;width:100%;pointer-events:auto
    }
    .v39-log-preview.show{display:contents}
    #v39-log-previews{position:absolute;right:0;top:34px;bottom:52px;width:var(--v39-side-log-width);max-width:100%;z-index:30;display:flex;flex-direction:column;gap:2px;overflow-y:auto;overflow-x:hidden;pointer-events:none}
    #v39-log-previews .v39-log-preview{flex:0 0 auto;pointer-events:none}
    #v39-log-previews button{pointer-events:auto}
    #v39-log-previews #modeBanner{width:100%;max-width:100%;padding:2px;font-size:var(--font-log);text-align:left;flex:0 0 auto}
    #v39-side-log:not(.collapsed) ~ #v39-log-previews{right:var(--v39-side-log-width)}
    .v39-log-preview button{min-width:0;padding:2px;text-align:left;border:1px solid #70cbd9;border-radius:8px;background:rgba(9,25,30,.60);box-shadow:0 4px 12px #0005;cursor:pointer}
    .v39-log-preview strong{font-size:var(--font-secondary);color:#8ee0ec}
    .v39-log-preview p{margin:0;font-size:var(--font-secondary);line-height:1.4;color:#eef6f6;word-break:break-word}
    @media(max-width:700px){
      #v39-side-log{right:0;top:5px}
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

  // 戦闘イベントもチャットと同じ右側の枠へ。別々の絶対配置では重なってしまう。
  const previewHost = document.createElement("div");
  previewHost.id = "v39-log-previews";
  playfield.appendChild(previewHost);
  const modeBanner = document.getElementById("modeBanner");
  if (modeBanner) previewHost.appendChild(modeBanner);
  for (const channel of CHANNELS) {
    if (document.getElementById(`v39-${channel}-preview`)) continue;
    const preview = document.createElement("div");
    preview.id = `v39-${channel}-preview`;
    preview.className = "v39-log-preview";
    preview.setAttribute("role", "status");
    preview.setAttribute("aria-live", "polite");
    previewHost.appendChild(preview);
    preview.addEventListener("click", event => {
      const button = event.target.closest("[data-preview-channel]");
      if (!button) return;
      if(openV39SideLogDiplomacy(messages.find(entry=>entry.id===button.dataset.previewLogId)))return;
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
    if (collapsed) collapsed = false;
    else activeChannel = CHANNELS[(CHANNELS.indexOf(activeChannel) + 1) % CHANNELS.length];
    render();
  };
  rail.addEventListener("click", event => {
    event.stopPropagation();
    const action=event.target instanceof Element?event.target.closest('[data-v39-side-diplomacy]'):null;
    if(action){openV39SideLogDiplomacy(messages.find(entry=>entry.id===action.dataset.v39SideDiplomacy));return;}
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
window.showV39SideNotice = showV39SideNotice;
window.pushV39Notification = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"notification", message });
window.pushV39ChatMessage = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"chat", message });
window.updateV39SideRailMessage = updateV39SideRailMessage;
window.getV39SideRailMessages = () => messages.filter(canSeeMessage).map(entry => ({ ...entry }));

window.addEventListener("v39:combat-log", event => {
  if (!event.detail?.summary) return;
  const detail = event.detail;
  const entries = (detail.entries || []).filter(entry => text(entry.targetName) && Number.isFinite(entry.total));
  const message = entries.length
    ? [`${text(detail.attackerName, detail.summary.split("：")[0])} / ${text(detail.skillName)}`,
      ...entries.map(entry => {
        const hits = (entry.hitResults || []).map(hit => hit.hit ? hit.damage : "Miss");
        const result = hits.length && hits.every(hit => hit === "Miss") ? "Miss" : `${entry.total}ダメージ`;
        return `${text(entry.targetName)} ${result}${hits.length > 1 ? ` (${hits.join(",")})` : ""}`;
      })].join("\n")
    : detail.summary;
  const map = window.__v39FieldRuntime?.mapData;
  pushV39SideRailMessage({channel:"battle",title:map?.isUnderground ? `洞窟 ${map.caveFloor}階` : "戦闘",message,details:entries.length ? detail.summary : "",collapsible:true,combatVisibility:combatVisibility(detail)});
});

let logViewKey = "";
const environmentDamageGroups=new Map();
window.addEventListener('v39:field-generated',()=>environmentDamageGroups.clear());
window.addEventListener('v39:save-loaded',()=>environmentDamageGroups.clear());
for(const [eventName,fallback]of [['v39:natural-events-resolved','災害'],['v39:terrain-damage','地形・災害'],['v39:territory-hazard-damage','領土災害']]){
  window.addEventListener(eventName,event=>{
    const state=window.getV39EnemyTurnState?.()||window.getV39GameState?.({includeWorlds:false});
    const logs=buildV39EnvironmentDamageLogs(event.detail||{},state,{fallback,testMode:window.isV39TestMode?.()===true,
      background:window.__v39BackgroundWorldTurn===true,isVisible:(x,y)=>window.isV39TileInCurrentVision?.(x,y)===true,isDetected:unit=>window.isV39EntityDetected?.(unit)!==false});
    for(const log of logs){
      const visibility=log.combatVisibility,key=JSON.stringify([visibility.playerId,visibility.worldId,log.turn,log.title]);
      const previous=environmentDamageGroups.get(key);
      const combined=previous&&messages.some(entry=>entry.id===previous.id)?mergeV39EnvironmentDamageLogs(previous.log,log):log;
      const {environmentDamageEntries,...message}=combined;
      let id=previous?.id;
      if(!id||!updateV39SideRailMessage(id,message))id=pushV39SideRailMessage(message);
      environmentDamageGroups.delete(key);environmentDamageGroups.set(key,{id,log:combined});
      while(environmentDamageGroups.size>MAX_MESSAGES)environmentDamageGroups.delete(environmentDamageGroups.keys().next().value);
    }
  });
}
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
