const MAX_MESSAGES = 150;
const DETAIL_COLLAPSE_CHAR_LIMIT = 120;
const DETAIL_COLLAPSE_LINE_LIMIT = 4;

let sequence = 0;
let activeChannel = "notification";
let collapsed = false;
const messages = [];

const text = (value, fallback = "") => String(value ?? "").trim() || fallback;

function normalizeChannel(value) {
  return String(value || "notification") === "chat" ? "chat" : "notification";
}

function currentTurn() {
  const turn = Number(window.getV39GameState?.()?.timeline?.turnNumber);
  return Number.isFinite(turn) ? Math.max(1, Math.floor(turn)) : null;
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
    <div class="v39-side-log-entry-head">${turn}<b>${escapeHtml(entry.title || (entry.channel === "chat" ? "チャット" : "通知"))}</b></div>
    <p>${multilineHtml(entry.message)}</p>
    ${renderDetails(entry)}
    ${meta}
  </article>`;
}

function render() {
  const rail = document.getElementById("v39-side-log");
  const list = document.getElementById("v39-side-log-list");
  if (!(rail instanceof HTMLElement) || !(list instanceof HTMLElement)) return;

  rail.classList.toggle("collapsed", collapsed);
  rail.dataset.channel = activeChannel;
  for (const button of rail.querySelectorAll("[data-v39-side-channel]")) {
    button.classList.toggle("active", button.dataset.v39SideChannel === activeChannel);
  }

  const rows = messages.filter(entry => entry.channel === activeChannel);
  if (!rows.length) {
    list.innerHTML = `<div class="v39-side-log-empty">${activeChannel === "chat" ? "チャットは未接続です" : "通知はまだありません"}</div>`;
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
    title:text(source.title, channel === "chat" ? "チャット" : "通知"),
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
      position:absolute;right:max(8px,var(--safe-r,0px));top:50px;bottom:52px;z-index:29;
      width:var(--v39-side-log-width);min-width:0;
      display:grid;grid-template-rows:auto minmax(0,1fr);
      border:1px solid rgba(108,139,148,.62);border-radius:9px;
      background:linear-gradient(180deg,rgba(10,20,24,.62),rgba(7,14,17,.52));
      box-shadow:0 8px 24px rgba(0,0,0,.22);overflow:hidden;
      backdrop-filter:blur(4px)
    }
    #v39-side-log.collapsed{width:30px;grid-template-rows:auto 0;border-radius:7px}
    .v39-side-log-head{display:grid;grid-template-columns:minmax(0,1fr) 30px;gap:4px;padding:4px;border-bottom:1px solid rgba(52,71,78,.72);background:rgba(17,31,36,.68)}
    .v39-side-log-tabs{min-width:0;display:grid;grid-template-columns:1fr 1fr;gap:3px}
    .v39-side-log-tabs button,.v39-side-log-collapse{
      min-height:30px;border:1px solid rgba(65,85,93,.82);border-radius:6px;background:rgba(19,33,40,.72);color:#c9d7d9;
      font-size:11px;font-weight:800;cursor:pointer
    }
    .v39-side-log-tabs button.active{border-color:#70cbd9;background:rgba(26,59,67,.82);color:#f1fbfb}
    .v39-side-log-collapse{font-size:14px;padding:0}
    #v39-side-log.collapsed .v39-side-log-tabs{display:none}
    #v39-side-log.collapsed .v39-side-log-head{grid-template-columns:1fr;gap:0;padding:2px;border-bottom:0;background:rgba(17,31,36,.58)}
    #v39-side-log.collapsed .v39-side-log-collapse{width:24px;min-width:24px;min-height:24px;height:24px;border-radius:5px;font-size:12px}
    #v39-side-log-list{min-height:0;overflow-y:auto;overflow-x:hidden;padding:5px;display:grid;gap:5px;align-content:start;scrollbar-width:thin}
    #v39-side-log.collapsed #v39-side-log-list{display:none}
    .v39-side-log-entry{border:1px solid rgba(57,75,82,.82);border-left:3px solid #5eb8c6;border-radius:6px;background:rgba(18,31,36,.70);padding:6px 7px;display:grid;gap:3px}
    #v39-side-log:hover,#v39-side-log:focus-within{background:linear-gradient(180deg,rgba(10,20,24,.78),rgba(7,14,17,.70))}
    #v39-side-log:hover .v39-side-log-head,#v39-side-log:focus-within .v39-side-log-head{background:rgba(17,31,36,.82)}
    .v39-side-log-entry.success{border-left-color:#67c887}.v39-side-log-entry.warn{border-left-color:#d6b45f}.v39-side-log-entry.danger{border-left-color:#d87365}.v39-side-log-entry.debug{border-left-color:#9c87d8}
    .v39-side-log-entry-head{display:flex;align-items:center;gap:5px;min-width:0}
    .v39-side-log-entry-head span{flex:0 0 auto;color:#79d29b;font-size:9px;font-weight:800}
    .v39-side-log-entry-head b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e5d194;font-size:10px}
    .v39-side-log-entry p{margin:0;color:#e2e9e9;font-size:10px;line-height:1.35;word-break:break-word}
    .v39-side-log-entry small{color:#93a6aa;font-size:9px;line-height:1.25}
    .v39-side-log-details-inline{padding-top:3px;border-top:1px solid rgba(78,102,111,.45);color:#b9c8ca!important}
    .v39-side-log-details{margin-top:2px;border-top:1px solid rgba(78,102,111,.45);padding-top:3px}
    .v39-side-log-details summary{list-style:none;cursor:pointer;color:#9cc9d0;font-size:9px;font-weight:800;user-select:none}
    .v39-side-log-details summary::-webkit-details-marker{display:none}
    .v39-side-log-details summary::before{content:"▷";display:inline-block;width:12px;color:#78cbd8}
    .v39-side-log-details[open] summary::before{content:"▽"}
    .v39-side-log-details p{margin-top:4px!important;color:#b9c8ca!important;font-size:9px!important;line-height:1.4!important}
    .v39-side-log-empty{padding:16px 8px;color:#82969b;font-size:10px;text-align:center}
    @media(max-width:700px){
      .playfield{--v39-side-log-width:min(36vw,190px)}
      #v39-side-log{right:max(5px,var(--safe-r,0px));top:46px;bottom:48px}
      .v39-side-log-entry{padding:5px 6px}.v39-side-log-entry p{font-size:9px}.v39-side-log-entry-head b{font-size:9px}
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
  rail.setAttribute("aria-label", "通知・チャットログ");
  rail.innerHTML = `<div class="v39-side-log-head">
    <div class="v39-side-log-tabs">
      <button type="button" class="active" data-v39-side-channel="notification">通知</button>
      <button type="button" data-v39-side-channel="chat">チャット</button>
    </div>
    <button type="button" class="v39-side-log-collapse" aria-label="通知欄を折りたたむ">›</button>
  </div><div id="v39-side-log-list"></div>`;
  playfield.appendChild(rail);
  playfield.classList.add("v39-has-side-log");
  rail.addEventListener("click", event => {
    const channelButton = event.target instanceof Element ? event.target.closest("[data-v39-side-channel]") : null;
    if (channelButton) {
      activeChannel = normalizeChannel(channelButton.dataset.v39SideChannel);
      render();
      return;
    }
    if (event.target instanceof Element && event.target.closest(".v39-side-log-collapse")) {
      collapsed = !collapsed;
      rail.querySelector(".v39-side-log-collapse").textContent = collapsed ? "‹" : "›";
      render();
    }
  });
  render();
}

window.pushV39SideRailMessage = pushV39SideRailMessage;
window.pushV39Notification = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"notification", message });
window.pushV39ChatMessage = (message, options = {}) => pushV39SideRailMessage({ ...options, channel:"chat", message });
window.updateV39SideRailMessage = updateV39SideRailMessage;
window.getV39SideRailMessages = () => messages.map(entry => ({ ...entry }));

install();
