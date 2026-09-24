import { io } from "socket.io-client";

// Socket.IO側のv39ロビー識別子。旧簡易戦闘ルームとは混在させない。
const PROTOCOL_VERSION = "v39-room-v1";
const CREDENTIALS_STORAGE_KEY = "v39-multiplayer-room-credentials-v1";
const DISPLAY_NAME_STORAGE_KEY = "v39-multiplayer-display-name-v1";
const HOST_DEFAULT_DISPLAY_NAME = "ホストプレイヤー";
const JOIN_DEFAULT_DISPLAY_NAME = "プレイヤー1";
const LEGACY_DEFAULT_DISPLAY_NAME = "参加者";

let socket = null;
let socketReady = false;
let roomSnapshot = null;
let credentials = loadCredentials();
let autoJoinAttempted = false;
let modal = null;
let pendingGameSetupSave = false;
let pendingGameStart = false;
let lobbyEntryMode = "create";

function text(value) {
  return String(value ?? "").trim();
}

function escapeHtml(value) {
  return text(value).replace(/[&<>"']/g, char => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;"
  })[char]);
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
#v39-multiplayer-lobby.open{display:grid}.v39-room-dialog{box-sizing:border-box;width:min(650px,100%);max-height:calc(100dvh - 24px);display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden;border:1px solid #49636a;border-radius:11px;background:linear-gradient(180deg,#142126,#0a1216);box-shadow:0 20px 56px rgba(0,0,0,.6);color:#e8efec}
.v39-room-head{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px 10px;padding:10px 12px;border-bottom:1px solid #34474d}.v39-room-head h2{margin:0;font-size:17px}.v39-room-head small{color:#93a6aa;font-size:12px}.v39-room-head>[data-v39-room-action="close"]{grid-column:2;grid-row:1;margin-left:auto;width:34px;height:32px;border:1px solid #4b6269;border-radius:7px;background:#16252a;color:#e8efec;font-size:20px}.v39-room-tabs{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}.v39-room-tabs button{min-height:34px;border:1px solid #41575e;border-radius:7px;background:#101d22;color:#aebfc1;font-weight:800}.v39-room-tabs button[aria-selected="true"]{border-color:#6abfcf;background:#174650;color:#effafa}.v39-room-tabs[hidden]{display:none}
.v39-room-body{min-height:0;overflow:auto;padding:10px;display:grid;gap:9px;align-content:start}.v39-room-section{display:grid;gap:7px;padding:9px;border:1px solid #32464c;border-radius:8px;background:#0e191d}.v39-room-section h3{margin:0;color:#c7d8d9;font-size:14px}.v39-room-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.v39-room-form label,.v39-room-assignment label{display:grid;gap:3px;color:#aebfc1;font-size:12px}.v39-room-form input,.v39-room-form select,.v39-room-assignment select{min-width:0;min-height:34px;border:1px solid #465d64;border-radius:6px;background:#152328;color:#edf4f1;padding:5px 7px;font:inherit}.v39-room-actions{display:flex;gap:7px;flex-wrap:wrap}.v39-room-actions button{min-height:34px;border:1px solid #52727a;border-radius:7px;background:#19343d;color:#edf6f3;padding:5px 10px;font-weight:800}.v39-room-actions button[data-v39-room-action="create"]{border-color:#6abfcf;background:#174650}.v39-room-actions button[data-v39-room-action="leave"]{margin-left:auto;border-color:#76544e;background:#291d1a}.v39-room-actions button:disabled{opacity:.45;cursor:not-allowed}.v39-room-status{min-height:18px;margin:0;color:#9aadb0;font-size:12px}.v39-room-status[data-kind="ok"]{color:#83d8a0}.v39-room-status[data-kind="error"]{color:#ed9684}.v39-room-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;color:#aebfc1}.v39-room-id{font-family:monospace;font-size:14px;font-weight:800;color:#9ee5ef}.v39-room-participants{display:grid;gap:6px}.v39-room-participant{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;padding:7px 8px;border:1px solid #31454b;border-radius:7px;background:#111e23}.v39-room-participant.is-self{border-color:#4a9baa;background:#123039}.v39-room-participant-name{font-size:14px;font-weight:800}.v39-room-participant-info{margin-top:2px;color:#9fb2b5;font-size:11px}.v39-room-tags{display:flex;align-items:start;justify-content:end;gap:4px;flex-wrap:wrap}.v39-room-tag{padding:2px 5px;border:1px solid #466068;border-radius:999px;color:#b8cbd0;font-size:10px}.v39-room-tag.host{border-color:#b99855;color:#f0cf83}.v39-room-tag.ready{border-color:#4d8f66;color:#91dfaa}.v39-room-tag.offline{border-color:#735454;color:#e3a09a}.v39-room-host-settings{display:grid;gap:7px}.v39-room-assignment-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.v39-room-note{margin:0;color:#91a4a8;font-size:11px;line-height:1.45}.v39-room-stage-note{margin:0;padding:8px;border-left:3px solid #c79d56;background:#211e16;color:#dcc99d;font-size:12px;line-height:1.45}
.v39-room-section>.mp-label,.v39-room-entry-panel label{display:grid;gap:3px;color:#aebfc1;font-size:12px}.v39-room-section>.mp-label input,.v39-room-entry-panel input{min-width:0;min-height:34px;border:1px solid #465d64;border-radius:6px;background:#152328;color:#edf4f1;padding:5px 7px;font:inherit}.v39-room-entry-panel{display:grid;gap:7px}.v39-room-entry-panel[hidden]{display:none}.v39-room-entry-panel button{min-height:36px;border:1px solid #52727a;border-radius:7px;background:#19343d;color:#edf6f3;padding:5px 10px;font-weight:800}.v39-room-entry-panel[data-v39-room-panel="create"] button{border-color:#6abfcf;background:#174650}.v39-room-start{border-color:#72b985!important;background:#1d4a2b!important}.v39-room-start:disabled{opacity:.42!important}
@media(max-width:600px){#v39-multiplayer-lobby{padding:7px}.v39-room-dialog{max-height:calc(100dvh - 14px);border-radius:7px}.v39-room-form,.v39-room-assignment-list{grid-template-columns:1fr}.v39-room-actions button{flex:1}.v39-room-actions button[data-v39-room-action="leave"]{margin-left:0}.v39-room-head small{display:none}}
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
  modal.addEventListener("click", event => { if (event.target === modal) closeLobby(); });
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
      playerParticipantAssignments:settings.playerParticipantAssignments
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
    const snapshotJson = buildSnapshotJsonForRoom();
    socket?.emit("game:snapshot", { roomId:roomSnapshot.roomId, snapshotJson });
    setStatus("ワールド生成完了。参加者へ同期しています...", "ok");
  } catch (error) {
    const message = error instanceof Error ? error.message : "ホスト側でゲーム開始に失敗しました。";
    pendingGameStart = false;
    setStatus(message, "error");
    socket?.emit("game:start-failed", { roomId:roomSnapshot.roomId, message });
  }
}

function importRoomGameSnapshot(payload) {
  if (!payload || !roomSnapshot || payload.roomId !== roomSnapshot.roomId || typeof payload.snapshotJson !== "string") return;
  try {
    if (typeof window.importV39SaveJson !== "function") throw new Error("ゲーム状態の読込機能が準備できていません。");
    window.importV39SaveJson(payload.snapshotJson);
    setStatus("ワールド状態を受信しました。", "ok");
    if (roomSnapshot?.phase === "playing") closeLobby();
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
  const settings = roomSnapshot.settings || { factionCount:1, playerParticipantAssignments:{}, gameSetup:null };
  const hostParticipant = getParticipantById(roomSnapshot.hostParticipantId);
  const mine = getParticipantById(getMyParticipantId());
  const allReady = participants.length > 0 && participants.every(participant => participant.ready && participant.connected);
  const participantRows = participants.map(participant => {
    const assigned = Array.isArray(participant.assignedPlayerIds) && participant.assignedPlayerIds.length
      ? `担当: ${participant.assignedPlayerIds.map(id => id.replace("player-", "勢力")).join(" / ")}`
      : "担当勢力なし";
    const tags = [
      participant.participantId === roomSnapshot.hostParticipantId ? '<span class="v39-room-tag host">ホスト</span>' : "",
      participant.ready ? '<span class="v39-room-tag ready">準備完了</span>' : '<span class="v39-room-tag">未準備</span>',
      participant.connected ? "" : '<span class="v39-room-tag offline">切断中</span>'
    ].join("");
    return `<article class="v39-room-participant${participant.participantId === getMyParticipantId() ? " is-self" : ""}"><div><div class="v39-room-participant-name">${escapeHtml(participant.displayName)}</div><div class="v39-room-participant-info">${escapeHtml(assigned)}</div></div><div class="v39-room-tags">${tags}</div></article>`;
  }).join("");
  const assignmentRows = Array.from({ length:Math.max(1, Number(settings.factionCount) || 1) }, (_, index) => {
    const playerId = `player-${index + 1}`;
    const assignedId = text(settings.playerParticipantAssignments?.[playerId]);
    const options = participants.map(participant => `<option value="${escapeHtml(participant.participantId)}"${participant.participantId === assignedId ? " selected" : ""}>${escapeHtml(participant.displayName)}</option>`).join("");
    return `<label>勢力${index + 1}<select data-v39-room-assignment="${playerId}">${options}</select></label>`;
  }).join("");
  const hostSettings = isHost() ? `
    <section class="v39-room-host-settings">
      <h3>ホスト設定</h3>
      <div class="v39-room-actions">
        <button type="button" data-v39-room-action="game-settings">ゲーム開始設定</button>
        <button type="button" class="v39-room-start" data-v39-room-action="start-game"${(!allReady || !settings.gameSetup || roomSnapshot.phase !== "lobby" || pendingGameStart) ? " disabled" : ""}>ゲーム開始</button>
      </div>
      <p class="v39-room-note">ゲーム設定: ${escapeHtml(formatGameSetupSummary(settings.gameSetup))}</p>
      <label class="v39-room-assignment">操作勢力数<select data-v39-room-faction-count>${Array.from({ length:8 }, (_, index) => `<option value="${index + 1}"${index + 1 === Number(settings.factionCount) ? " selected" : ""}>${index + 1}</option>`).join("")}</select></label>
      <div class="v39-room-assignment-list">${assignmentRows}</div>
      <p class="v39-room-note">設定変更時は、他参加者の準備完了を解除します。</p>
    </section>` : "";
  lobby.innerHTML = `
    <div class="v39-room-meta"><span>ルーム名</span><strong>${escapeHtml(roomSnapshot.roomName || "-")}</strong><span>ルームID</span><strong class="v39-room-id">${escapeHtml(roomSnapshot.roomId)}</strong><span>ホスト: ${escapeHtml(hostParticipant?.displayName || "-")}</span></div>
    <div class="v39-room-actions">
      <button type="button" data-v39-room-action="ready"${roomSnapshot.phase !== "lobby" ? " disabled" : ""}>${mine?.ready ? "準備を解除" : "準備完了"}</button>
      <button type="button" data-v39-room-action="leave">退出</button>
    </div>
    <div class="v39-room-participants">${participantRows}</div>
    ${hostSettings}
    <p class="v39-room-stage-note">${roomSnapshot.phase === "setup" ? "ホストがワールドを生成しています。完了後に同じワールド状態を受信します。" : (roomSnapshot.phase === "playing" ? "ゲームを開始しました。" : "ゲーム開始設定を確認し、全員が準備完了になったらホストがゲーム開始できます。")}</p>
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
  socket.on("game:snapshot", payload => {
    importRoomGameSnapshot(payload);
  });
  socket.on("game:started", payload => {
    if (!roomSnapshot || payload?.roomId !== roomSnapshot.roomId) return;
    pendingGameStart = false;
    setStatus("ゲームを開始しました。", "ok");
    renderLobby();
    closeLobby();
  });
  socket.on("game:start-failed", payload => {
    pendingGameStart = false;
    setStatus(payload?.message || "ゲーム開始に失敗しました。", "error");
    renderLobby();
  });
  socket.on("room:left", () => {
    roomSnapshot = null;
    saveCredentials(null);
    autoJoinAttempted = false;
    pendingGameStart = false;
    setStatus("ルームから退出しました。", "ok");
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
  socket?.emit("room:ready", { roomId:roomSnapshot.roomId, ready:!mine.ready });
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
  const button = event.target instanceof Element ? event.target.closest("[data-v39-room-action],[data-v39-room-tab]") : null;
  if (!(button instanceof HTMLElement)) return;
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
  window.openV39MultiplayerLobby = openLobby;
  window.closeV39MultiplayerLobby = closeLobby;
}

boot();
