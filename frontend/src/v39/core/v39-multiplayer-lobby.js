import { io } from "socket.io-client";
import { raceData } from "../../lib/game-data-registry.js";
import { getV39RaceSelectionDetail } from "../../lib/v39-selection-detail.js";
import {
  applyV39InitialSovereignProfile,
  getV39InitialSetupProgress,
  isV39InitialSetupComplete
} from "./v39-initial-sovereign.js";

// Socket.IO側のv39ロビー識別子。旧簡易戦闘ルームとは混在させない。
const PROTOCOL_VERSION = "v39-room-v1";
const CREDENTIALS_STORAGE_KEY = "v39-multiplayer-room-credentials-v1";
const DISPLAY_NAME_STORAGE_KEY = "v39-multiplayer-display-name-v1";
const HOST_DEFAULT_DISPLAY_NAME = "ホストプレイヤー";
const JOIN_DEFAULT_DISPLAY_NAME = "プレイヤー1";
const LEGACY_DEFAULT_DISPLAY_NAME = "参加者";
const SELECTABLE_RACES = (Array.isArray(raceData) ? raceData : [])
  .map(row => ({
    key:String(row?.key || "").trim(),
    name:String(row?.name || row?.key || "").trim()
  }))
  .filter(row => row.key);
const SELECTABLE_RACE_KEYS = new Set(SELECTABLE_RACES.map(row => row.key));

let socket = null;
let socketReady = false;
let roomSnapshot = null;
let credentials = loadCredentials();
let autoJoinAttempted = false;
let modal = null;
let pendingGameSetupSave = false;
let pendingGameStart = false;
let setupProfilePendingPlayerId = "";
let setupPlacementPendingPlayerId = "";
let multiplayerInitialWorldFinalized = false;
let lobbyEntryMode = "create";
const factionDetailTabs = new Map();

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  })[char]);
}

function normalizeFactionDetailTab(value) {
  return value === "skills" || value === "abilities" ? value : "status";
}

function renderFactionStatus(detail) {
  const cells = (detail?.statusRows || []).flatMap(row => row.fields || []).map(item =>
    `<div class="v39-faction-stat"><span>${escapeHtml(item.key)}</span><strong>${item.value ?? "-"}</strong></div>`
  ).join("");
  return `<div class="v39-faction-stat-grid">${cells || '<span class="v39-room-note">ステータスデータなし</span>'}</div>`;
}

function renderFactionSkills(detail) {
  const rows = (detail?.skillRows || []).map(item =>
    `<div class="v39-faction-skill-value" title="${escapeHtml(item.desc || `${item.label}: 詳細なし`)}"><span>${escapeHtml(item.label)}</span><strong>${item.value}</strong></div>`
  ).join("");
  return rows
    ? `<div class="v39-faction-skill-grid">${rows}</div>`
    : '<span class="v39-room-note">技能データなし</span>';
}

function renderFactionAbilities(detail) {
  const rows = (detail?.acquiredSkillRows || []).map(row => `
    <article class="v39-faction-ability">
      <div class="v39-faction-ability-main">
        <strong>${escapeHtml(row.name)}</strong>
        <span class="v39-faction-ability-family">${escapeHtml(row.family)}</span>
        <span class="v39-faction-ability-action">${escapeHtml(row.actionShort)}</span>
      </div>
      <div class="v39-faction-ability-meta">威/状/守 ${escapeHtml(row.power)}/${escapeHtml(row.state)}/${escapeHtml(row.guard)}　AP ${escapeHtml(row.apCost)}　CT ${escapeHtml(row.ct)}　効果 ${escapeHtml(row.duration)}</div>
      <div class="v39-faction-ability-detail">${escapeHtml(row.detail)}</div>
    </article>`
  ).join("");
  return rows || '<span class="v39-room-note">取得スキルなし</span>';
}

function renderFactionSelectionDetail(playerId, raceKey) {
  const detail = getV39RaceSelectionDetail(raceKey);
  if (!detail) return '<div class="v39-faction-detail-empty">開始勢力を選択すると、ステータス・技能・スキルを確認できます。</div>';
  const tab = normalizeFactionDetailTab(factionDetailTabs.get(playerId));
  factionDetailTabs.set(playerId, tab);
  const body = tab === "skills"
    ? renderFactionSkills(detail)
    : tab === "abilities"
      ? renderFactionAbilities(detail)
      : renderFactionStatus(detail);
  return `
    <section class="v39-faction-detail">
      <header class="v39-faction-detail-head">
        <strong>${escapeHtml(detail.name)}</strong>
        <span>${escapeHtml(detail.summary)}</span>
        <small>${escapeHtml(detail.description)}</small>
      </header>
      <nav class="v39-faction-detail-tabs" role="tablist" aria-label="${escapeHtml(detail.name)}の詳細">
        <button type="button" data-v39-faction-detail-tab="status" data-v39-faction-detail-player="${escapeHtml(playerId)}" aria-selected="${tab === "status"}">ステータス</button>
        <button type="button" data-v39-faction-detail-tab="skills" data-v39-faction-detail-player="${escapeHtml(playerId)}" aria-selected="${tab === "skills"}">技能</button>
        <button type="button" data-v39-faction-detail-tab="abilities" data-v39-faction-detail-player="${escapeHtml(playerId)}" aria-selected="${tab === "abilities"}">スキル</button>
      </nav>
      <div class="v39-faction-detail-body">${body}</div>
    </section>`;
}

function loadCredentials() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CREDENTIALS_STORAGE_KEY) || "null");
    return parsed && typeof parsed === "object" ? {
      roomId:text(parsed.roomId),
      participantId:text(parsed.participantId),
      reconnectToken:text(parsed.reconnectToken),
      displayName:text(parsed.displayName)
    } : null;
  } catch {
    return null;
  }
}

function saveCredentials(next) {
  credentials = next && next.roomId && next.participantId && next.reconnectToken ? {
    roomId:text(next.roomId),
    participantId:text(next.participantId),
    reconnectToken:text(next.reconnectToken),
    displayName:text(next.displayName)
  } : null;
  try {
    if (credentials) localStorage.setItem(CREDENTIALS_STORAGE_KEY, JSON.stringify(credentials));
    else localStorage.removeItem(CREDENTIALS_STORAGE_KEY);
  } catch {
    // localStorageが使えない場合も、現在の接続中ロビーは利用できる。
  }
}

function defaultDisplayNameForMode(mode = lobbyEntryMode) {
  return mode === "join" ? JOIN_DEFAULT_DISPLAY_NAME : HOST_DEFAULT_DISPLAY_NAME;
}

function isAutomaticDisplayName(value) {
  const name = text(value);
  return !name
    || name === LEGACY_DEFAULT_DISPLAY_NAME
    || name === HOST_DEFAULT_DISPLAY_NAME
    || name === JOIN_DEFAULT_DISPLAY_NAME;
}

function loadDisplayName(defaultName = defaultDisplayNameForMode()) {
  try {
    const credentialName = text(credentials?.displayName);
    if (credentialName && credentialName !== LEGACY_DEFAULT_DISPLAY_NAME) return credentialName;
    const storedName = text(localStorage.getItem(DISPLAY_NAME_STORAGE_KEY));
    if (storedName && storedName !== LEGACY_DEFAULT_DISPLAY_NAME) return storedName;
    return defaultName;
  } catch {
    const credentialName = text(credentials?.displayName);
    return credentialName && credentialName !== LEGACY_DEFAULT_DISPLAY_NAME ? credentialName : defaultName;
  }
}

function applyEntryModeDisplayName(mode) {
  lobbyEntryMode = mode === "join" ? "join" : "create";
  const nameInput = getDisplayNameInput();
  if (!nameInput || isConnectedToRoom() || !isAutomaticDisplayName(nameInput.value)) return;
  nameInput.value = loadDisplayName(defaultDisplayNameForMode(lobbyEntryMode));
}

function saveDisplayName(value) {
  const displayName = text(value).slice(0, 20);
  try {
    if (displayName) localStorage.setItem(DISPLAY_NAME_STORAGE_KEY, displayName);
    else localStorage.removeItem(DISPLAY_NAME_STORAGE_KEY);
  } catch { /* no-op */ }
  return displayName;
}

function statusElement() {
  return modal?.querySelector("[data-v39-room-status]");
}

function setStatus(message, kind = "") {
  const element = statusElement();
  if (!element) return;
  element.textContent = text(message);
  element.dataset.kind = kind;
}

function createStyles() {
  if (document.getElementById("v39-multiplayer-lobby-style")) return;
  const style = document.createElement("style");
  style.id = "v39-multiplayer-lobby-style";
  style.textContent = `
#v39-multiplayer-lobby{position:fixed;inset:0;z-index:10120;display:none;place-items:center;padding:12px;background:rgba(1,5,8,.82);backdrop-filter:blur(3px)}
#v39-multiplayer-lobby.open{display:grid}.v39-room-dialog{box-sizing:border-box;width:min(820px,100%);max-height:calc(100dvh - 24px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid #49636a;border-radius:11px;background:linear-gradient(180deg,#142126,#0a1216);box-shadow:0 20px 56px rgba(0,0,0,.6);color:#e8efec}
.v39-room-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;padding:10px 12px;border-bottom:1px solid #34474d}.v39-room-head h2{margin:0;font-size:17px}.v39-room-head small{color:#93a6aa;font-size:12px}.v39-room-head>[data-v39-room-action="close"]{grid-column:2;grid-row:1;margin-left:auto;width:34px;height:32px;border:1px solid #4b6269;border-radius:7px;background:#16252a;color:#e8efec;font-size:20px}.v39-room-tabs{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.v39-room-tabs button{min-height:34px;border:1px solid #41575e;border-radius:7px;background:#101d22;color:#aebfc1;font-weight:800}.v39-room-tabs button[aria-selected="true"]{border-color:#6abfcf;background:#174650;color:#effafa}.v39-room-tabs[hidden]{display:none}
.v39-room-body{min-height:0;overflow:auto;padding:10px;display:grid;gap:9px;align-content:start}.v39-room-section{display:grid;gap:7px;padding:9px;border:1px solid #32464c;border-radius:8px;background:#0e191d}.v39-room-section[hidden]{display:none}.v39-room-section h3{margin:0;color:#c7d8d9;font-size:14px}.v39-room-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.v39-room-form label,.v39-room-assignment label{display:grid;gap:3px;color:#aebfc1;font-size:12px}.v39-room-form input,.v39-room-form select,.v39-room-assignment select{min-width:0;min-height:34px;border:1px solid #465d64;border-radius:6px;background:#152328;color:#edf4f1;padding:5px 7px;font:inherit}.v39-room-actions{display:flex;gap:7px;flex-wrap:wrap}.v39-room-actions button{min-height:34px;border:1px solid #52727a;border-radius:7px;background:#19343d;color:#edf6f3;padding:5px 10px;font-weight:800}.v39-room-actions button[data-v39-room-action="create"]{border-color:#6abfcf;background:#174650}.v39-room-actions button[data-v39-room-action="leave"]{margin-left:auto;border-color:#76544e;background:#291d1a}.v39-room-actions button:disabled{opacity:.45;cursor:not-allowed}.v39-room-status{min-height:18px;margin:0;color:#9aadb0;font-size:12px}.v39-room-status[data-kind="ok"]{color:#83d8a0}.v39-room-status[data-kind="error"]{color:#ed9684}.v39-room-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;color:#aebfc1}.v39-room-id{font-family:monospace;font-size:14px;font-weight:800;color:#9ee5ef}.v39-room-participants{display:grid;gap:6px}.v39-room-participant{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:7px 8px;border:1px solid #31454b;border-radius:7px;background:#111e23}.v39-room-participant.is-self{border-color:#4a9baa;background:#123039}.v39-room-participant-name{font-size:14px;font-weight:800}.v39-room-participant-info{margin-top:2px;color:#9fb2b5;font-size:11px}.v39-room-tags{display:flex;align-items:start;justify-content:end;gap:4px;flex-wrap:wrap}.v39-room-tag{padding:2px 5px;border:1px solid #466068;border-radius:999px;color:#b8cbd0;font-size:10px}.v39-room-tag.self{border-color:#4a9baa;color:#9ee5ef}.v39-room-tag.host{border-color:#b99855;color:#f0cf83}.v39-room-tag.ready{border-color:#4d8f66;color:#91dfaa}.v39-room-tag.offline{border-color:#735454;color:#e3a09a}.v39-room-host-settings{display:grid;gap:7px}.v39-room-assignment-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.v39-faction-selection-list{display:grid;gap:8px}.v39-faction-select-card{display:grid;gap:7px;padding:8px;border:1px solid #314950;border-radius:8px;background:#101d22}.v39-faction-select-label{display:grid;gap:3px;color:#b9cbcd;font-size:12px}.v39-faction-select-label select{min-width:0;min-height:34px;border:1px solid #465d64;border-radius:6px;background:#152328;color:#edf4f1;padding:5px 7px;font:inherit}.v39-faction-detail{display:grid;gap:7px}.v39-faction-detail-head{display:grid;gap:2px}.v39-faction-detail-head strong{font-size:18px;color:#eff9f6}.v39-faction-detail-head span{font-size:12px;font-weight:800;color:#b9dde1}.v39-faction-detail-head small{font-size:11px;line-height:1.45;color:#98adb0}.v39-faction-detail-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.v39-faction-detail-tabs button{min-height:34px;border:1px solid #405c64;border-radius:6px;background:#12252b;color:#a9bec1;font-weight:800}.v39-faction-detail-tabs button[aria-selected="true"]{border-color:#76cad7;background:#174650;color:#f3fbfa}.v39-faction-detail-body{min-height:74px;padding:7px;border:1px solid #2d444b;border-radius:7px;background:#0b171b}.v39-faction-detail-empty{padding:9px;border:1px dashed #36545d;border-radius:7px;color:#8fa6aa;font-size:11px}.v39-faction-stat-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.v39-faction-stat{display:grid;gap:1px;padding:5px 6px;border-left:2px solid #4b95a2;background:#102329}.v39-faction-stat span{font-size:10px;color:#93a9ad}.v39-faction-stat strong{font-size:15px;color:#eef7f5}.v39-faction-skill-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px}.v39-faction-skill-value{display:flex;justify-content:space-between;gap:6px;padding:5px 6px;border:1px solid #29454d;border-radius:5px;background:#102329;color:#c9dcde;font-size:11px}.v39-faction-skill-value strong{color:#f0f8f6}.v39-faction-ability{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);gap:4px 8px;padding:6px 0;border-bottom:1px solid #294047;font-size:11px}.v39-faction-ability:last-child{border-bottom:none}.v39-faction-ability-main{display:flex;align-items:center;gap:5px;min-width:0}.v39-faction-ability-main strong{color:#eef6f3}.v39-faction-ability-family,.v39-faction-ability-action{padding:1px 5px;border:1px solid #38545c;border-radius:999px;color:#b5c9cc;font-size:9px}.v39-faction-ability-meta{color:#9eb2b6}.v39-faction-ability-detail{grid-column:2;color:#aebfc1}.v39-room-note{margin:0;color:#91a4a8;font-size:11px;line-height:1.45}.v39-room-stage-note{margin:0;padding:8px;border-left:3px solid #c79d56;background:#211e16;color:#dcc99d;font-size:12px;line-height:1.45}
.v39-multiplayer-identity{flex:0 0 auto;display:grid;gap:1px;max-width:180px;min-height:38px;padding:4px 7px;border:1px solid #41636b;border-radius:7px;background:#102329;white-space:nowrap}.v39-multiplayer-identity[hidden]{display:none}.v39-multiplayer-identity strong{max-width:164px;overflow:hidden;text-overflow:ellipsis;font-size:11px;color:#a8e9f1}.v39-multiplayer-identity small{max-width:164px;overflow:hidden;text-overflow:ellipsis;font-size:9px;color:#9fb2b5}
.v39-room-section>.mp-label,.v39-room-entry-panel label{display:grid;gap:3px;color:#aebfc1;font-size:12px}.v39-room-section>.mp-label input,.v39-room-entry-panel input{min-width:0;min-height:34px;border:1px solid #465d64;border-radius:6px;background:#152328;color:#edf4f1;padding:5px 7px;font:inherit}.v39-room-entry-panel{display:grid;gap:7px}.v39-room-entry-panel[hidden]{display:none}.v39-room-entry-panel button{min-height:36px;border:1px solid #52727a;border-radius:7px;background:#19343d;color:#edf6f3;padding:5px 10px;font-weight:800}.v39-room-entry-panel[data-v39-room-panel="create"] button{border-color:#6abfcf;background:#174650}.v39-room-start{border-color:#72b985!important;background:#1d4a2b!important}.v39-room-start:disabled{opacity:.42!important}
@media(max-width:600px){#v39-multiplayer-lobby{padding:7px}.v39-room-dialog{max-height:calc(100dvh - 14px);border-radius:7px}.v39-room-form,.v39-room-assignment-list{grid-template-columns:1fr}.v39-room-actions button{flex:1}.v39-room-actions button[data-v39-room-action="leave"]{margin-left:0}.v39-room-head small{display:none}.v39-faction-stat-grid,.v39-faction-skill-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.v39-faction-ability{grid-template-columns:1fr}.v39-faction-ability-detail{grid-column:1}}
`;
  document.head.appendChild(style);
}

function createModal() {
  modal?.remove();
  modal = document.createElement("div");
  modal.id = "v39-multiplayer-lobby";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <section class="v39-room-dialog" role="dialog" aria-modal="true" aria-labelledby="v39-room-title">
      <header class="v39-room-head">
        <div><h2 id="v39-room-title">通信ルーム</h2><small>ルームを作成するか、共有されたIDで参加します</small></div>
        <button type="button" data-v39-room-action="close" aria-label="閉じる">×</button>
        <nav class="v39-room-tabs" data-v39-room-tabs aria-label="ルーム接続方法">
          <button type="button" data-v39-room-tab="create" aria-selected="true">ルーム作成</button>
          <button type="button" data-v39-room-tab="join" aria-selected="false">ルーム参加</button>
        </nav>
      </header>
      <div class="v39-room-body">
        <section class="v39-room-section" data-v39-room-entry>
          <label class="mp-label">プレイヤー名（ロビー表示）<input data-v39-room-player-name maxlength="20" autocomplete="nickname"></label>
          <div class="v39-room-entry-panel" data-v39-room-panel="create">
            <label>ルーム名<input data-v39-room-name maxlength="40" placeholder="例: 週末テスト" autocomplete="off"></label>
            <button type="button" data-v39-room-action="create">ルームを作成</button>
          </div>
          <div class="v39-room-entry-panel" data-v39-room-panel="join" hidden>
            <label>参加用ルームID<input data-v39-room-id inputmode="numeric" pattern="[0-9]*" maxlength="8" placeholder="8桁の数字" autocomplete="off"></label>
            <button type="button" data-v39-room-action="join">ルームに参加</button>
          </div>
        </section>
        <p class="v39-room-status" data-v39-room-status></p>
        <section class="v39-room-section" data-v39-room-lobby hidden></section>
      </div>
    </section>`;
  document.body.appendChild(modal);
  modal.addEventListener("click", handleClick);
  modal.addEventListener("change", handleChange);
  modal.addEventListener("input", event => {
    if (event.target instanceof HTMLInputElement && event.target.matches("[data-v39-room-player-name]")) saveDisplayName(event.target.value);
  });
}

function syncMultiplayerIdentityChip() {
  const topbar = document.querySelector(".topbar");
  if (!(topbar instanceof HTMLElement)) return;
  let chip = document.getElementById("v39-multiplayer-identity");
  if (!(chip instanceof HTMLElement)) {
    chip = document.createElement("div");
    chip.id = "v39-multiplayer-identity";
    chip.className = "v39-multiplayer-identity";
    const topActions = topbar.querySelector(".top-actions");
    if (topActions) topbar.insertBefore(chip, topActions);
    else topbar.appendChild(chip);
  }

  const mine = getParticipantById(getMyParticipantId());
  const visible = !!mine && roomSnapshot?.phase !== "lobby";
  chip.hidden = !visible;
  if (!visible) {
    chip.replaceChildren();
    return;
  }

  const state = window.getV39GameState?.();
  const assignedIds = Array.isArray(mine.assignedPlayerIds) ? mine.assignedPlayerIds : [];
  const factionText = assignedIds.map(playerId => {
    const player = state?.players?.find(row => text(row?.id) === text(playerId));
    const number = text(playerId).replace("player-", "勢力");
    return player?.race ? `${number}・${text(player.race)}` : number;
  }).join(" / ") || "担当勢力なし";
  chip.innerHTML = `<strong>${escapeHtml(mine.displayName)}（あなた）</strong><small>${escapeHtml(factionText)}</small>`;
}

function getMyParticipantId() {
  return text(credentials?.participantId);
}

function getParticipantById(participantId) {
  return Array.isArray(roomSnapshot?.participants)
    ? roomSnapshot.participants.find(participant => participant.participantId === participantId)
    : null;
}

function getDisplayNameInput() {
  return modal?.querySelector("[data-v39-room-player-name]");
}

function getRoomNameInput() {
  return modal?.querySelector("[data-v39-room-name]");
}

function getRoomIdInput() {
  return modal?.querySelector("[data-v39-room-id]");
}

function setEntryMode(mode, options = {}) {
  lobbyEntryMode = mode === "join" ? "join" : "create";
  modal?.querySelectorAll("[data-v39-room-tab]").forEach(button => {
    button.setAttribute("aria-selected", String(button.dataset.v39RoomTab === lobbyEntryMode));
  });
  modal?.querySelectorAll("[data-v39-room-panel]").forEach(panel => {
    panel.hidden = panel.dataset.v39RoomPanel !== lobbyEntryMode;
  });
  applyEntryModeDisplayName(lobbyEntryMode);
  if (options.focus === true) {
    if (lobbyEntryMode === "join") getRoomIdInput()?.focus();
    else getRoomNameInput()?.focus();
  }
}

function isHost() {
  return !!roomSnapshot && roomSnapshot.hostParticipantId === getMyParticipantId();
}

function isConnectedToRoom() {
  return !!roomSnapshot && !!getParticipantById(getMyParticipantId());
}

function formatGameSetupSummary(gameSetup) {
  if (!gameSetup || typeof gameSetup !== "object") return "未設定";
  const mapSize = text(gameSetup.mapSize) || "マップ未設定";
  const pattern = text(gameSetup.patternId) || "形状未設定";
  return `${mapSize} / ${pattern}`;
}

function parseMapSize(mapSize) {
  const match = String(mapSize || "").match(/^(\d+)x(\d+)$/i);
  if (!match) return null;
  const w = Math.max(1, Math.floor(Number(match[1])));
  const h = Math.max(1, Math.floor(Number(match[2])));
  return Number.isFinite(w) && Number.isFinite(h) ? { w, h } : null;
}

function buildSnapshotJsonForRoom() {
  if (typeof window.exportV39SaveJson !== "function") throw new Error("ゲーム状態の書き出し機能が準備できていません。");
  const parsed = JSON.parse(window.exportV39SaveJson(0));
  parsed.view = null;
  return JSON.stringify(parsed);
}

function publishSetupSnapshot() {
  if (!roomSnapshot || roomSnapshot.phase !== "setup" || !isHost()) return false;
  const snapshotJson = buildSnapshotJsonForRoom();
  socket?.emit("game:snapshot", { roomId:roomSnapshot.roomId, snapshotJson });
  if (isV39InitialSetupComplete(window.getV39GameState?.())) {
    socket?.emit("game:setup-complete", { roomId:roomSnapshot.roomId, snapshotJson });
  }
  return true;
}

function localAssignedPlayerIds() {
  const mine = getParticipantById(getMyParticipantId());
  return Array.isArray(mine?.assignedPlayerIds) ? mine.assignedPlayerIds.map(text).filter(Boolean) : [];
}

function continueLocalInitialSetup() {
  if (!roomSnapshot || roomSnapshot.phase !== "setup") return;
  const state = window.getV39GameState?.();
  if (!state?.players?.length) return;
  const assignedIds = localAssignedPlayerIds();
  const progressById = new Map(getV39InitialSetupProgress(state).map(row => [row.playerId, row]));
  const targetId = assignedIds.find(playerId => !progressById.get(playerId)?.complete);
  if (!targetId) {
    setupProfilePendingPlayerId = "";
    setupPlacementPendingPlayerId = "";
    closeLobby();
    window.showV39TurnBanner?.("あなたの初期設定は完了しました。他プレイヤーの配置完了を待っています。");
    return;
  }
  const player = state.players.find(row => text(row?.id) === targetId);
  const progress = progressById.get(targetId);
  if (!player || !progress) return;

  if (!progress.sovereignReady) {
    setupPlacementPendingPlayerId = "";
    if (setupProfilePendingPlayerId === targetId) return;
    setupProfilePendingPlayerId = targetId;
    closeLobby();
    window.dispatchEvent(new CustomEvent("v39:multiplayer-sovereign-required", {
      detail:{ playerId:targetId, race:text(player.race) }
    }));
    return;
  }

  setupProfilePendingPlayerId = "";
  setupPlacementPendingPlayerId = targetId;
  closeLobby();
  window.setV39ActivePlayer?.(targetId);
  window.showV39TurnBanner?.("初期拠点を設置するマスを選択してください。");
}

function submitMultiplayerSovereignProfile(detail = {}) {
  if (!roomSnapshot || roomSnapshot.phase !== "setup") return;
  const playerId = text(detail.playerId);
  if (!localAssignedPlayerIds().includes(playerId)) return;
  setStatus("統治者設定をホストへ送信しています...");
  socket?.emit("game:setup-profile", {
    roomId:roomSnapshot.roomId,
    playerId,
    className:text(detail.className),
    characterName:text(detail.characterName),
    villageName:text(detail.villageName)
  });
}

function requestMultiplayerInitialPlacement(detail = {}) {
  if (!roomSnapshot || roomSnapshot.phase !== "setup") return;
  const playerId = text(detail.playerId);
  if (!localAssignedPlayerIds().includes(playerId)) return;
  const x = Math.floor(Number(detail.x));
  const y = Math.floor(Number(detail.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  setupPlacementPendingPlayerId = playerId;
  socket?.emit("game:setup-place", { roomId:roomSnapshot.roomId, playerId, x, y });
}

function startHostedGame(payload) {
  if (!payload || !roomSnapshot || payload.roomId !== roomSnapshot.roomId || !isHost()) return;
  const settings = payload.settings || roomSnapshot.settings || {};
  const gameSetup = settings.gameSetup;
  const size = parseMapSize(gameSetup?.mapSize);
  if (!gameSetup || !size) {
    socket?.emit("game:start-failed", { roomId:roomSnapshot.roomId, message:"共有ゲーム開始設定が不正です。" });
    return;
  }
  try {
    if (typeof window.startV39MultiplayerSession !== "function") throw new Error("マルチプレイ用ゲーム状態の初期化機能が準備できていません。");
    if (typeof window.generateFieldFromSettings !== "function") throw new Error("フィールド生成機能が準備できていません。");
    window.startV39MultiplayerSession(settings.factionCount, {
      gameSettings:gameSetup.gameSettings,
      participants:Array.isArray(payload.participants) ? payload.participants : roomSnapshot.participants,
      playerParticipantAssignments:settings.playerParticipantAssignments,
      playerFactionSelections:settings.playerFactionSelections
    });
    window.setV39GameState?.({ gameSettings:gameSetup.gameSettings }, { reason:"multiplayer-game-start-settings" });
    window.generateFieldFromSettings({
      w:size.w,
      h:size.h,
      patternId:gameSetup.patternId,
      mountainMode:gameSetup.mountainMode,
      enemySpawnTileDivisor:gameSetup.enemySpawnTileDivisor,
      neutralVillageCount:gameSetup.neutralVillageCount,
      islandCustomSettings:gameSetup.islandCustomSettings
    });
    pendingGameStart = true;
    multiplayerInitialWorldFinalized = false;
    const snapshotJson = buildSnapshotJsonForRoom();
    socket?.emit("game:snapshot", { roomId:roomSnapshot.roomId, snapshotJson });
    setStatus("ワールド生成完了。統治者作成と初期拠点配置へ進みます。", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "ホスト側でゲーム開始に失敗しました。";
    pendingGameStart = false;
    setStatus(message, "error");
    socket?.emit("game:start-failed", { roomId:roomSnapshot.roomId, message });
  }
}

function importRoomGameSnapshot(payload, options = {}) {
  if (!payload || !roomSnapshot || payload.roomId !== roomSnapshot.roomId || typeof payload.snapshotJson !== "string") return;
  try {
    if (typeof window.importV39SaveJson !== "function") throw new Error("ゲーム状態の読込機能が準備できていません。");
    window.importV39SaveJson(payload.snapshotJson);
    const ownPlayerId = localAssignedPlayerIds()[0] || "";
    if (ownPlayerId) window.setV39ActivePlayer?.(ownPlayerId);
    syncMultiplayerIdentityChip();
    setStatus(options.setup === true ? "初期設定状態を同期しました。" : "ワールド状態を受信しました。", "ok");
    if (options.setup === true) {
      window.setTimeout(continueLocalInitialSetup, 0);
    } else if (roomSnapshot?.phase === "playing") {
      closeLobby();
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "ワールド状態の同期に失敗しました。", "error");
  }
}

function requestGameStart() {
  if (!roomSnapshot || !isHost() || pendingGameStart) return;
  const participants = Array.isArray(roomSnapshot.participants) ? roomSnapshot.participants : [];
  const allReady = participants.length > 0 && participants.every(participant => participant.ready && participant.connected);
  if (!roomSnapshot.settings?.gameSetup) {
    setStatus("ゲーム開始設定を先に保存してください。", "error");
    return;
  }
  const factionCount = Math.max(1, Number(roomSnapshot.settings?.factionCount) || 1);
  const factionSelections = roomSnapshot.settings?.playerFactionSelections || {};
  const allFactionsSelected = Array.from({ length:factionCount }, (_, index) => `player-${index + 1}`)
    .every(playerId => SELECTABLE_RACE_KEYS.has(text(factionSelections[playerId])));
  if (!allFactionsSelected) {
    setStatus("全勢力の開始種族を選択してください。", "error");
    return;
  }
  if (!allReady) {
    setStatus("参加者全員が準備完了になるまで開始できません。", "error");
    return;
  }
  pendingGameStart = true;
  setStatus("ゲーム開始を要求しています...");
  socket?.emit("game:start", { roomId:roomSnapshot.roomId });
}

function renderLobby() {
  if (!modal) return;
  syncMultiplayerIdentityChip();
  const nameInput = getDisplayNameInput();
  const roomNameInput = getRoomNameInput();
  const roomIdInput = getRoomIdInput();
  if (nameInput && document.activeElement !== nameInput) nameInput.value = loadDisplayName(defaultDisplayNameForMode());
  if (roomNameInput && document.activeElement !== roomNameInput && roomSnapshot?.roomName) roomNameInput.value = roomSnapshot.roomName;
  if (roomIdInput && document.activeElement !== roomIdInput && !text(roomIdInput.value)) roomIdInput.value = credentials?.roomId || "";

  const connected = socketReady;
  const hasRoom = isConnectedToRoom();
  const entry = modal.querySelector("[data-v39-room-entry]");
  const tabs = modal.querySelector("[data-v39-room-tabs]");
  if (entry instanceof HTMLElement) entry.hidden = hasRoom;
  if (tabs instanceof HTMLElement) tabs.hidden = hasRoom;
  modal.querySelectorAll("[data-v39-room-action=\"create\"],[data-v39-room-action=\"join\"]")
    .forEach(button => { button.disabled = !connected || hasRoom; });

  const lobby = modal.querySelector("[data-v39-room-lobby]");
  if (!(lobby instanceof HTMLElement)) return;
  if (!hasRoom) {
    lobby.hidden = true;
    lobby.replaceChildren();
    return;
  }
  lobby.hidden = false;
  const participants = Array.isArray(roomSnapshot.participants) ? roomSnapshot.participants : [];
  const settings = roomSnapshot.settings || {
    factionCount:1,
    playerParticipantAssignments:{},
    playerFactionSelections:{},
    gameSetup:null
  };
  const hostParticipant = getParticipantById(roomSnapshot.hostParticipantId);
  const mine = getParticipantById(getMyParticipantId());
  const participantMinimumFactionCount = Math.max(1, participants.length);
  const factionCount = Math.max(participantMinimumFactionCount, Number(settings.factionCount) || participantMinimumFactionCount);
  const factionSelections = settings.playerFactionSelections || {};
  const playerIds = Array.from({ length:factionCount }, (_, index) => `player-${index + 1}`);
  const allFactionsSelected = playerIds.every(playerId => SELECTABLE_RACE_KEYS.has(text(factionSelections[playerId])));
  const myAssignedPlayerIds = Array.isArray(mine?.assignedPlayerIds) ? mine.assignedPlayerIds : [];
  const myFactionsSelected = myAssignedPlayerIds.every(playerId => SELECTABLE_RACE_KEYS.has(text(factionSelections[playerId])));
  const allReady = participants.length > 0 && participants.every(participant => participant.ready && participant.connected);
  const participantRows = participants.map(participant => {
    const assigned = Array.isArray(participant.assignedPlayerIds) && participant.assignedPlayerIds.length
      ? `担当: ${participant.assignedPlayerIds.map(id => id.replace("player-", "勢力")).join(" / ")}`
      : "担当勢力なし";
    const tags = [
      participant.participantId === getMyParticipantId() ? '<span class="v39-room-tag self">あなた</span>' : "",
      participant.participantId === roomSnapshot.hostParticipantId ? '<span class="v39-room-tag host">ホスト</span>' : "",
      participant.ready ? '<span class="v39-room-tag ready">準備完了</span>' : '<span class="v39-room-tag">未準備</span>',
      participant.connected ? "" : '<span class="v39-room-tag offline">切断中</span>'
    ].join("");
    return `<article class="v39-room-participant${participant.participantId === getMyParticipantId() ? " is-self" : ""}"><div><div class="v39-room-participant-name">${escapeHtml(participant.displayName)}</div><div class="v39-room-participant-info">${escapeHtml(assigned)}</div></div><div class="v39-room-tags">${tags}</div></article>`;
  }).join("");
  const assignmentRows = playerIds.map((playerId, index) => {
    const assignedId = text(settings.playerParticipantAssignments?.[playerId]);
    const options = participants.map(participant => `<option value="${escapeHtml(participant.participantId)}"${participant.participantId === assignedId ? " selected" : ""}>${escapeHtml(participant.displayName)}</option>`).join("");
    return `<label>勢力${index + 1}<select data-v39-room-assignment="${playerId}">${options}</select></label>`;
  }).join("");
  const factionSelectionRows = playerIds.map((playerId, index) => {
    const assignedId = text(settings.playerParticipantAssignments?.[playerId]);
    const assignedParticipant = participants.find(participant => participant.participantId === assignedId);
    const selectedRace = text(factionSelections[playerId]);
    const canEdit = roomSnapshot.phase === "lobby" && assignedId === getMyParticipantId();
    const options = [
      '<option value="">未選択</option>',
      ...SELECTABLE_RACES.map(race => `<option value="${escapeHtml(race.key)}"${race.key === selectedRace ? " selected" : ""}>${escapeHtml(race.name || race.key)}</option>`)
    ].join("");
    return `
      <article class="v39-faction-select-card">
        <label class="v39-faction-select-label">勢力${index + 1} / ${escapeHtml(assignedParticipant?.displayName || "担当未設定")}
          <select data-v39-room-faction-select="${playerId}"${canEdit ? "" : " disabled"}>${options}</select>
        </label>
        ${renderFactionSelectionDetail(playerId, selectedRace)}
      </article>`;
  }).join("");
  const hostSettings = isHost() ? `
    <section class="v39-room-host-settings">
      <h3>ホスト設定</h3>
      <div class="v39-room-actions">
        <button type="button" data-v39-room-action="game-settings">ゲーム開始設定</button>
      </div>
      <p class="v39-room-note">ゲーム設定: ${escapeHtml(formatGameSetupSummary(settings.gameSetup))}</p>
      <label class="v39-room-assignment">操作勢力数<select data-v39-room-faction-count>${Array.from({ length:8 - participantMinimumFactionCount + 1 }, (_, index) => {
        const count = participantMinimumFactionCount + index;
        return `<option value="${count}"${count === Number(settings.factionCount) ? " selected" : ""}>${count}</option>`;
      }).join("")}</select></label>
      <div class="v39-room-assignment-list">${assignmentRows}</div>
      <p class="v39-room-note">操作勢力数は参加者数以上です。参加者が増えると自動で勢力枠を追加し、新しい参加者へ担当を割り当てます。</p>
      <p class="v39-room-note">ゲーム開始設定だけを変更しても準備完了は維持します。勢力数・担当者を変更した場合は準備を解除します。</p>
    </section>` : "";
  const startButton = isHost() && roomSnapshot.phase === "lobby"
    ? `<button type="button" class="v39-room-start" data-v39-room-action="start-game"${(!allReady || !allFactionsSelected || !settings.gameSetup || pendingGameStart) ? " disabled" : ""}>ゲーム開始</button>`
    : "";
  const leaveLabel = roomSnapshot.phase === "lobby" ? "退出" : "ゲームから切断";
  lobby.innerHTML = `
    <div class="v39-room-meta"><span>ルーム名</span><strong>${escapeHtml(roomSnapshot.roomName || "-")}</strong><span>ルームID</span><strong class="v39-room-id">${escapeHtml(roomSnapshot.roomId)}</strong><span>ホスト: ${escapeHtml(hostParticipant?.displayName || "-")}</span></div>
    <div class="v39-room-actions">
      <button type="button" data-v39-room-action="ready"${(roomSnapshot.phase !== "lobby" || (!mine?.ready && !myFactionsSelected)) ? " disabled" : ""}>${mine?.ready ? "準備を解除" : "準備完了"}</button>
      ${startButton}
      <button type="button" data-v39-room-action="leave">${leaveLabel}</button>
    </div>
    <div class="v39-room-participants">${participantRows}</div>
    <section class="v39-room-host-settings">
      <h3>開始勢力</h3>
      <div class="v39-faction-selection-list">${factionSelectionRows}</div>
      <p class="v39-room-note">各プレイヤーは自分の担当勢力の開始種族を選択します。選択肢は 種族.json を使用します。</p>
    </section>
    ${hostSettings}
    <p class="v39-room-stage-note">${roomSnapshot.phase === "setup" ? "初期設定中です。担当勢力の統治者を作成し、マップ上で初期拠点を選択してください。全勢力完了後に通常ゲームへ進みます。" : (roomSnapshot.phase === "playing" ? "ゲームを開始しました。" : (allFactionsSelected ? "開始勢力を確認し、全員が準備完了になったらホストがゲーム開始できます。" : "まず各プレイヤーが担当勢力の開始種族を選択してください。"))}</p>
    <p class="v39-room-note">参加者 ${participants.length}人 / ${allReady ? "全員準備完了" : "準備待ち"} / 接続 ${connected ? "正常" : "切断中"}</p>`;
}

function ensureSocket() {
  if (socket) return socket;
  const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
  socket = io(socketUrl, { path:"/socket.io", autoConnect:true });
  socket.on("connect", () => {
    socketReady = true;
    setStatus("通信サーバーへ接続しました。", "ok");
    renderLobby();
    if (modal?.classList.contains("open")) attemptStoredRejoin();
  });
  socket.on("disconnect", () => {
    socketReady = false;
    setStatus("通信が切断されました。再接続を待機しています。", "error");
    renderLobby();
  });
  socket.on("connect_error", error => {
    socketReady = false;
    setStatus(`通信接続に失敗しました: ${text(error?.message) || "接続できません"}`, "error");
    renderLobby();
  });
  socket.on("room:error", payload => {
    pendingGameSetupSave = false;
    pendingGameStart = false;
    setStatus(payload?.message || "ルーム操作に失敗しました。", "error");
    renderLobby();
  });
  socket.on("room:created", payload => {
    if (!payload?.roomId || !payload?.participantId || !payload?.reconnectToken) return;
    saveCredentials({ ...payload, displayName:text(payload.displayName) || loadDisplayName() });
    autoJoinAttempted = true;
    setStatus(`ルーム「${payload.roomName || ""}」を作成しました。`, "ok");
    renderLobby();
  });
  socket.on("room:joined", payload => {
    if (!payload?.roomId || !payload?.participantId || !payload?.reconnectToken) return;
    saveCredentials({ ...payload, displayName:text(payload.displayName) || loadDisplayName() });
    autoJoinAttempted = true;
    setStatus(`ルーム ${payload.roomId} に参加しました。`, "ok");
    renderLobby();
  });
  socket.on("room:snapshot", snapshot => {
    if (!snapshot || snapshot.protocolVersion !== PROTOCOL_VERSION) return;
    roomSnapshot = snapshot;
    if (pendingGameSetupSave) {
      pendingGameSetupSave = false;
      setStatus("ゲーム開始設定を共有しました。", "ok");
    }
    renderLobby();
  });
  socket.on("game:starting", payload => {
    if (!roomSnapshot || payload?.roomId !== roomSnapshot.roomId) return;
    setStatus(isHost() ? "ワールドを生成します..." : "ホストがワールドを生成しています...");
    renderLobby();
  });
  socket.on("game:start:host", payload => {
    startHostedGame(payload);
  });
  socket.on("game:setup-snapshot", payload => {
    importRoomGameSnapshot(payload, { setup:true });
  });
  socket.on("game:snapshot", payload => {
    importRoomGameSnapshot(payload);
  });
  socket.on("game:setup-profile:host", payload => {
    if (!isHost() || !roomSnapshot || roomSnapshot.phase !== "setup" || payload?.roomId !== roomSnapshot.roomId) return;
    const result = applyV39InitialSovereignProfile(window.getV39GameState?.(), payload?.profile || {});
    if (!result.ok) {
      setStatus(result.reason || "統治者を作成できませんでした。", "error");
      socket?.emit("game:setup-error", {
        roomId:roomSnapshot.roomId,
        participantId:text(payload?.participantId),
        playerId:text(payload?.profile?.playerId),
        step:"profile",
        message:result.reason || "統治者を作成できませんでした。"
      });
      return;
    }
    window.setV39GameState?.(result.state, { reason:"multiplayer-initial-sovereign" });
    publishSetupSnapshot();
  });
  socket.on("game:setup-place:host", payload => {
    if (!isHost() || !roomSnapshot || roomSnapshot.phase !== "setup" || payload?.roomId !== roomSnapshot.roomId) return;
    const playerId = text(payload?.playerId);
    const mapData = window.__v39FieldRuntime?.mapData;
    const x = Math.floor(Number(payload?.x));
    const y = Math.floor(Number(payload?.y));
    if (!mapData?.grid?.[y] || !Number.isFinite(x) || !Number.isFinite(y)) return;
    window.setV39ActivePlayer?.(playerId);
    const placed = window.placeV39InitialBase?.({ x, y, terrain:mapData.grid[y][x] }, { advanceToNextPlayer:false }) === true;
    if (!placed) {
      socket?.emit("game:setup-error", {
        roomId:roomSnapshot.roomId,
        participantId:text(payload?.participantId),
        playerId,
        step:"placement",
        message:"そのマスには初期拠点を配置できません。別のマスを選択してください。"
      });
      publishSetupSnapshot();
      return;
    }
    setupPlacementPendingPlayerId = "";
    if (!multiplayerInitialWorldFinalized && isV39InitialSetupComplete(window.getV39GameState?.())) {
      multiplayerInitialWorldFinalized = true;
      window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", {
        detail:{ multiplayer:true, playerId }
      }));
    }
    publishSetupSnapshot();
  });
  socket.on("game:setup-error", payload => {
    if (!roomSnapshot || payload?.roomId !== roomSnapshot.roomId) return;
    const playerId = text(payload?.playerId);
    if (payload?.step === "profile") setupProfilePendingPlayerId = "";
    if (payload?.step === "placement") setupPlacementPendingPlayerId = "";
    setStatus(payload?.message || "初期設定を確定できませんでした。", "error");
    window.showV39TurnBanner?.(payload?.message || "初期設定をやり直してください。");
    window.setTimeout(continueLocalInitialSetup, 0);
  });
  socket.on("game:started", payload => {
    if (!roomSnapshot || payload?.roomId !== roomSnapshot.roomId) return;
    pendingGameStart = false;
    setupProfilePendingPlayerId = "";
    setupPlacementPendingPlayerId = "";
    setStatus("初期設定が完了しました。ゲームを開始しました。", "ok");
    window.dispatchEvent(new CustomEvent("v39:multiplayer-game-started", {
      detail:{ roomId:roomSnapshot.roomId }
    }));
    renderLobby();
    closeLobby();
  });
  socket.on("game:start-failed", payload => {
    pendingGameStart = false;
    setStatus(payload?.message || "ゲーム開始に失敗しました。", "error");
    renderLobby();
  });
  socket.on("room:left", payload => {
    const reconnectable = payload?.reconnectable === true
      && !!credentials?.participantId
      && credentials?.roomId === text(payload?.roomId);
    roomSnapshot = null;
    if (!reconnectable) saveCredentials(null);
    autoJoinAttempted = false;
    pendingGameStart = false;
    if (reconnectable) {
      setEntryMode("join");
      const roomIdInput = getRoomIdInput();
      if (roomIdInput) roomIdInput.value = credentials?.roomId || "";
      setStatus("ゲームから切断しました。同じルームIDで再参加できます。", "ok");
    } else {
      setStatus("ルームから退出しました。", "ok");
    }
    renderLobby();
  });
  return socket;
}

function joinRoom(options = {}) {
  const activeSocket = ensureSocket();
  if (!socketReady) {
    setStatus("通信サーバーへ接続中です。少し待ってから再度実行してください。", "error");
    return;
  }
  const roomId = text(options.roomId || getRoomIdInput()?.value).replace(/\D/g, "").slice(0, 8);
  const displayName = Object.prototype.hasOwnProperty.call(options, "displayName")
    ? (text(options.displayName).slice(0, 20) || JOIN_DEFAULT_DISPLAY_NAME)
    : (text(getDisplayNameInput()?.value).slice(0, 20) || JOIN_DEFAULT_DISPLAY_NAME);
  if (!roomId) {
    setStatus("ルームIDを入力してください。", "error");
    return;
  }
  const restoring = credentials?.roomId === roomId && credentials?.participantId && credentials?.reconnectToken;
  setStatus(restoring ? "ルームへ再接続中..." : "ルームへ参加中...");
  activeSocket.emit("room:join", {
    roomId,
    playerName:displayName,
    mode:"v39-world",
    protocolVersion:PROTOCOL_VERSION,
    participantId: restoring ? credentials.participantId : "",
    reconnectToken: restoring ? credentials.reconnectToken : ""
  });
}

function createRoom() {
  const activeSocket = ensureSocket();
  if (!socketReady) {
    setStatus("通信サーバーへ接続中です。少し待ってから再度実行してください。", "error");
    return;
  }
  const displayName = text(getDisplayNameInput()?.value).slice(0, 20) || HOST_DEFAULT_DISPLAY_NAME;
  const roomName = text(getRoomNameInput()?.value);
  if (!roomName) {
    setStatus("ルーム名を入力してください。", "error");
    getRoomNameInput()?.focus();
    return;
  }
  setStatus("ルームを作成中...");
  activeSocket.emit("room:create", { playerName:displayName, roomName, mode:"v39-world", protocolVersion:PROTOCOL_VERSION });
}

function leaveRoom() {
  if (!isConnectedToRoom()) return;
  socket?.emit("room:leave");
}

function toggleReady() {
  const mine = getParticipantById(getMyParticipantId());
  if (!mine || !roomSnapshot) return;
  if (!mine.ready) {
    const selections = roomSnapshot.settings?.playerFactionSelections || {};
    const missing = (Array.isArray(mine.assignedPlayerIds) ? mine.assignedPlayerIds : [])
      .some(playerId => !SELECTABLE_RACE_KEYS.has(text(selections[playerId])));
    if (missing) {
      setStatus("担当勢力の開始種族をすべて選択してください。", "error");
      return;
    }
  }
  socket?.emit("room:ready", { roomId:roomSnapshot.roomId, ready:!mine.ready });
}

function selectStartingFaction(playerId, raceKey) {
  if (!roomSnapshot || roomSnapshot.phase !== "lobby") return;
  socket?.emit("room:select-faction", {
    roomId:roomSnapshot.roomId,
    playerId:text(playerId),
    raceKey:text(raceKey)
  });
}

function updateSettings() {
  if (!roomSnapshot || !isHost()) return;
  const factionCount = Number(modal?.querySelector("[data-v39-room-faction-count]")?.value) || 1;
  const playerParticipantAssignments = Object.fromEntries([...modal.querySelectorAll("[data-v39-room-assignment]")]
    .map(select => [text(select.dataset.v39RoomAssignment), text(select.value)])
    .filter(([playerId]) => playerId));
  socket?.emit("room:update-settings", { roomId:roomSnapshot.roomId, settings:{ factionCount, playerParticipantAssignments } });
}

function openLobbyGameSettings() {
  if (!roomSnapshot || !isHost()) return;
  // ロビーの背面を残すと設定モーダルの入力を覆うため、設定中は閉じる。
  closeLobby();
  window.openFieldSettingsModal?.({
    playMode:"multiplayer",
    lobbyGameSettingsMode:true,
    lobbyGameSetup:roomSnapshot.settings?.gameSetup || null
  });
}

function saveLobbyGameSettings(gameSetup) {
  if (!roomSnapshot || !isHost() || !gameSetup || typeof gameSetup !== "object") return;
  pendingGameSetupSave = true;
  setStatus("ゲーム開始設定を共有保存中...");
  openLobby();
  socket?.emit("room:update-settings", {
    roomId:roomSnapshot.roomId,
    settings:{ ...roomSnapshot.settings, gameSetup }
  });
}

function attemptStoredRejoin() {
  if (autoJoinAttempted || roomSnapshot || !credentials?.roomId || !socketReady) return;
  autoJoinAttempted = true;
  joinRoom({ roomId:credentials.roomId, displayName:credentials.displayName });
}

function handleClick(event) {
  const button = event.target instanceof Element
    ? event.target.closest("[data-v39-room-action],[data-v39-room-tab],[data-v39-faction-detail-tab]")
    : null;
  if (!(button instanceof HTMLElement)) return;
  const factionDetailTab = button.dataset.v39FactionDetailTab;
  if (factionDetailTab) {
    const playerId = text(button.dataset.v39FactionDetailPlayer);
    if (playerId) factionDetailTabs.set(playerId, normalizeFactionDetailTab(factionDetailTab));
    renderLobby();
    return;
  }
  const tab = button.dataset.v39RoomTab;
  if (tab) {
    setEntryMode(tab, { focus:true });
    return;
  }
  const action = button.dataset.v39RoomAction;
  if (action === "close") closeLobby();
  if (action === "create") createRoom();
  if (action === "join") joinRoom();
  if (action === "leave") leaveRoom();
  if (action === "ready") toggleReady();
  if (action === "game-settings") openLobbyGameSettings();
  if (action === "start-game") requestGameStart();
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.matches("[data-v39-room-faction-select]")) {
    selectStartingFaction(target.dataset.v39RoomFactionSelect, target.value);
    return;
  }
  if (target.matches("[data-v39-room-faction-count],[data-v39-room-assignment]")) updateSettings();
}

function openLobby(options = {}) {
  createStyles();
  if (!modal) createModal();
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const entryMode = options.mode === "join" ? "join" : "create";
  setEntryMode(entryMode);
  const nameInput = getDisplayNameInput();
  ensureSocket();
  renderLobby();
  attemptStoredRejoin();
  if (!isConnectedToRoom()) {
    if (entryMode === "join") getRoomIdInput()?.focus();
    else nameInput?.focus();
  }
}

function closeLobby() {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function boot() {
  createStyles();
  createModal();
  document.addEventListener("click", event => {
    const button = event.target instanceof Element ? event.target.closest("[data-open-v39-room]") : null;
    if (!(button instanceof HTMLElement)) return;
    event.preventDefault();
    openLobby({ mode:button.dataset.openV39Room || "create" });
  }, true);
  window.addEventListener("v39:lobby-game-settings-saved", event => {
    saveLobbyGameSettings(event.detail?.gameSetup);
  });
  window.addEventListener("v39:multiplayer-sovereign-profile-submitted", event => {
    submitMultiplayerSovereignProfile(event.detail || {});
  });
  window.addEventListener("v39:multiplayer-initial-placement-request", event => {
    requestMultiplayerInitialPlacement(event.detail || {});
  });
  window.openV39MultiplayerLobby = openLobby;
  window.closeV39MultiplayerLobby = closeLobby;
  window.isV39MultiplayerSetup = () => roomSnapshot?.phase === "setup" && isConnectedToRoom();
  window.getV39MultiplayerParticipantId = () => getMyParticipantId();
}

boot();
