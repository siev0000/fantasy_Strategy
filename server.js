
const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const chokidar = require("chokidar");
const { Server } = require("socket.io");
const V39_RACE_DEFINITIONS = require("./data/source/export/json/種族.json");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const DEV_MODE = process.env.NODE_ENV !== "production";
const app = express();
const server = http.createServer(app);
const FRONTEND_DIST_DIR = path.join(__dirname, "web-vue-dist");
const V39_GAME_SNAPSHOT_MAX_BYTES = 16 * 1024 * 1024;
const SOCKET_CORS_ORIGINS = (process.env.SOCKET_CORS_ORIGINS || "")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
const DEFAULT_DEV_SOCKET_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];
const allowedSocketOrigins = new Set(
  SOCKET_CORS_ORIGINS.length > 0 ? SOCKET_CORS_ORIGINS : DEFAULT_DEV_SOCKET_ORIGINS
);
const allowAllSocketOriginsInDev = DEV_MODE && SOCKET_CORS_ORIGINS.length === 0;
const io = new Server(server, {
  maxHttpBufferSize: V39_GAME_SNAPSHOT_MAX_BYTES,
  cors: {
    origin(origin, callback) {
      if (allowAllSocketOriginsInDev || !origin || allowedSocketOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Socket.IO CORS blocked origin: ${origin}`));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

const RACES = {
  "只人": { hp: 110, atk: 22 },
  "エルフ": { hp: 85, atk: 26 },
  "オーガ": { hp: 145, atk: 30 },
  "ゴブリン": { hp: 78, atk: 18 },
  "竜人": { hp: 125, atk: 28 },
  "悪魔": { hp: 95, atk: 32 },
  "天使": { hp: 105, atk: 21 },
  "ヴァンパイア": { hp: 100, atk: 24 }
};

const ALLY_ORDER = ["只人", "エルフ", "竜人", "天使"];
const ENEMY_ORDER = ["オーガ", "ゴブリン", "悪魔", "ヴァンパイア"];
const VALID_ACTIONS = new Set(["attack", "skill", "next", "reset"]);
const ROOM_CHAT_MAX_ITEMS = 120;
const ROOM_CHAT_MAX_LENGTH = 240;
// v39ロビーで表示するルーム名の最大文字数。ルームIDとは別の表示用名称。
const ROOM_NAME_MAX_LENGTH = 40;
// 参加者へ共有するv39ルームID。既存ルームと重複した場合は再抽選する。
const V39_ROOM_ID_LENGTH = 8;
// v39ワールド用ロビーの上限。現行のゲーム開始設定と同じ最大勢力数に揃える。
const V39_ROOM_PARTICIPANT_LIMIT = 8;
const V39_ROOM_PROTOCOL_VERSION = "v39-room-v1";
const V39_SELECTABLE_RACE_KEYS = new Set(
  (Array.isArray(V39_RACE_DEFINITIONS) ? V39_RACE_DEFINITIONS : [])
    .map(row => String(row?.key || "").trim())
    .filter(Boolean)
);
// ロビー段階で共有するマップ設定JSONの最大サイズ。ワールド状態はまだ保存しない。
const V39_LOBBY_GAME_SETUP_MAX_BYTES = 12 * 1024;
const rooms = new Map();
const DEV_WATCH_TARGETS = ["web-vue-dist", "assets", "config", "data"].map(p => path.join(__dirname, p));
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIST_DIR, "index.html");

function getLanIPv4Addresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  for (const netList of Object.values(nets)) {
    if (!Array.isArray(netList)) continue;
    for (const net of netList) {
      if (!net) continue;
      if (net.family !== "IPv4") continue;
      if (net.internal) continue;
      addresses.push(net.address);
    }
  }
  return addresses;
}

function resolveStartupUrls(host, port) {
  const urls = new Set();
  const add = target => urls.add(`http://${target}:${port}`);
  if (host === "0.0.0.0" || host === "::") {
    add("localhost");
    add("127.0.0.1");
    for (const ip of getLanIPv4Addresses()) add(ip);
    return [...urls];
  }
  add(host);
  if (host === "localhost") add("127.0.0.1");
  return [...urls];
}

function unitFromRace(race, side, id) {
  const base = RACES[race];
  return {
    id,
    side,
    race,
    name: `${race}${side === "ally" ? "兵" : "敵"}`,
    hp: base.hp,
    maxHp: base.hp,
    atk: base.atk,
    alive: true
  };
}

function createInitialBattleState() {
  return {
    turn: 1,
    buffAtk: 0,
    allies: ALLY_ORDER.map((race, idx) => unitFromRace(race, "ally", `a${idx}`)),
    enemies: ENEMY_ORDER.map((race, idx) => unitFromRace(race, "enemy", `e${idx}`)),
    activeSide: "ally",
    ended: false,
    statusText: "ターン: 1 / あなたの行動",
    statusClass: "",
    log: [{ text: "戦闘開始。あなたが先攻です。", strong: false }]
  };
}

function aliveUnits(state, side) {
  const list = side === "ally" ? state.allies : state.enemies;
  return list.filter(unit => unit.alive);
}

function firstAlive(state, side) {
  return aliveUnits(state, side)[0] || null;
}

function damage(target, amount) {
  target.hp = Math.max(0, target.hp - amount);
  if (target.hp === 0) target.alive = false;
}

function heal(target, amount) {
  if (!target.alive) return;
  target.hp = Math.min(target.maxHp, target.hp + amount);
}

function pushLog(state, text, strong = false) {
  state.log.unshift({ text, strong });
  if (state.log.length > 120) state.log.length = 120;
}

function setStatus(state, text, cls = "") {
  state.statusText = text;
  state.statusClass = cls;
}

function checkEnd(state) {
  if (state.ended) return;
  const allyAlive = aliveUnits(state, "ally").length;
  const enemyAlive = aliveUnits(state, "enemy").length;
  if (allyAlive === 0 || enemyAlive === 0) {
    state.ended = true;
    const win = enemyAlive === 0;
    setStatus(state, win ? "勝利" : "敗北", win ? "win" : "lose");
    pushLog(state, win ? "敵部隊を壊滅させました。" : "味方部隊が全滅しました。", true);
  }
}

function runNormalAttack(state) {
  if (state.ended || state.activeSide !== "ally") return;
  const actor = firstAlive(state, "ally");
  const target = firstAlive(state, "enemy");
  if (!actor || !target) return;
  const value = actor.atk + state.buffAtk;
  state.buffAtk = 0;
  damage(target, value);
  pushLog(state, `${actor.name}が${target.name}へ${value}ダメージ。`);
  if (!target.alive) pushLog(state, `${target.name}を撃破。`);
  checkEnd(state);
}

function runRaceSkill(state) {
  if (state.ended || state.activeSide !== "ally") return;
  const actor = firstAlive(state, "ally");
  const targetEnemy = firstAlive(state, "enemy");
  if (!actor || !targetEnemy) return;

  switch (actor.race) {
    case "只人":
      state.buffAtk = 10;
      pushLog(state, `${actor.name}の戦術眼。次の通常攻撃が+10。`);
      break;
    case "エルフ":
      heal(actor, 20);
      pushLog(state, `${actor.name}が森の加護で20回復。`);
      break;
    case "オーガ":
      damage(targetEnemy, 40);
      pushLog(state, `${actor.name}が暴走し${targetEnemy.name}へ40ダメージ。`);
      break;
    case "ゴブリン":
      damage(targetEnemy, 24);
      pushLog(state, `${actor.name}の奇襲で${targetEnemy.name}へ24ダメージ。`);
      break;
    case "竜人":
      aliveUnits(state, "enemy").forEach(unit => damage(unit, 16));
      pushLog(state, `${actor.name}が竜炎で敵全体へ16ダメージ。`);
      break;
    case "悪魔":
      damage(targetEnemy, 30);
      heal(actor, 10);
      pushLog(state, `${actor.name}が魂喰で${targetEnemy.name}へ30ダメージ、10回復。`);
      break;
    case "天使":
      aliveUnits(state, "ally").forEach(unit => heal(unit, 12));
      pushLog(state, `${actor.name}が聖域を展開し味方全体を12回復。`);
      break;
    case "ヴァンパイア":
      damage(targetEnemy, 26);
      heal(actor, 13);
      pushLog(state, `${actor.name}が吸血で${targetEnemy.name}へ26ダメージ、13回復。`);
      break;
    default:
      break;
  }

  checkEnd(state);
}

function runEnemyTurn(state) {
  if (state.ended) return;
  const actor = firstAlive(state, "enemy");
  const target = firstAlive(state, "ally");
  if (!actor || !target) return;

  let value = actor.atk;
  if (actor.race === "ゴブリン") value += 6;
  if (actor.race === "悪魔") {
    value += 4;
    heal(actor, 6);
  }

  damage(target, value);
  pushLog(state, `${actor.name}が${target.name}へ${value}ダメージ。`);
  if (!target.alive) pushLog(state, `${target.name}が倒れた。`);
  checkEnd(state);
}

function runEndTurn(state) {
  if (state.ended) return;
  if (state.activeSide === "ally") {
    state.activeSide = "enemy";
    setStatus(state, `ターン: ${state.turn} / 敵の行動`);
    runEnemyTurn(state);
    if (!state.ended) {
      state.activeSide = "ally";
      state.turn += 1;
      setStatus(state, `ターン: ${state.turn} / あなたの行動`);
    }
  }
}

function applyBattleAction(state, action) {
  if (action === "reset") return createInitialBattleState();

  switch (action) {
    case "attack":
      runNormalAttack(state);
      break;
    case "skill":
      runRaceSkill(state);
      break;
    case "next":
      runEndTurn(state);
      break;
    default:
      break;
  }

  return state;
}

function normalizeRoomId(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 20);
}

function normalizePlayerName(raw) {
  return String(raw || "")
    .trim()
    .slice(0, 20) || "Player";
}

function normalizeV39DisplayName(raw) {
  return String(raw || "")
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, 20);
}

function createUniqueV39DisplayName(room, rawName, fallbackName, excludeParticipantId = "") {
  const requestedName = normalizeV39DisplayName(rawName);
  const baseName = requestedName || normalizeV39DisplayName(fallbackName) || "プレイヤー1";
  const usedNames = new Set();
  if (room?.participants instanceof Map) {
    for (const participant of room.participants.values()) {
      if (participant.participantId === excludeParticipantId) continue;
      const displayName = normalizeV39DisplayName(participant.displayName);
      if (displayName) usedNames.add(displayName);
    }
  }
  if (!usedNames.has(baseName)) return baseName;

  const numberMatch = baseName.match(/^(.*?)(\d+)$/u);
  const stem = (numberMatch ? numberMatch[1] : baseName) || "プレイヤー";
  let suffixNumber = numberMatch ? Math.max(2, Number(numberMatch[2]) + 1) : 2;
  while (true) {
    const suffix = String(suffixNumber);
    const candidate = `${stem.slice(0, Math.max(1, 20 - suffix.length))}${suffix}`;
    if (!usedNames.has(candidate)) return candidate;
    suffixNumber += 1;
  }
}

function normalizeRoomChatMessage(raw) {
  return String(raw || "")
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, ROOM_CHAT_MAX_LENGTH);
}

function normalizeRoomName(raw, fallbackPlayerName = "") {
  const roomName = String(raw || "").replace(/\r?\n/g, " ").trim().slice(0, ROOM_NAME_MAX_LENGTH);
  return roomName || `${normalizePlayerName(fallbackPlayerName)}のルーム`;
}

function generateRoomId() {
  let roomId = "";
  do {
    roomId = String(crypto.randomInt(10 ** (V39_ROOM_ID_LENGTH - 1), 10 ** V39_ROOM_ID_LENGTH));
  } while (rooms.has(roomId));
  return roomId;
}

function isV39RoomId(roomId) {
  return new RegExp(`^\\d{${V39_ROOM_ID_LENGTH}}$`).test(roomId);
}

function createRoom(roomId, mode = "legacy-battle", roomName = "") {
  const room = {
    roomId,
    roomName,
    // legacy-battleは旧Vueの簡易戦闘用。v39-worldだけが下記ロビー状態を使う。
    mode,
    state: createInitialBattleState(),
    players: new Map(),
    chatLog: [],
    participants: new Map(),
    hostParticipantId: "",
    phase: "lobby",
    settings: {
      factionCount: 1,
      playerParticipantAssignments: {},
      playerFactionSelections: {},
      gameSetup: null
    },
    createdAt: Date.now(),
    stateRevision: 0,
    gameSnapshotJson: "",
    startedAt: 0
  };
  rooms.set(roomId, room);
  return room;
}

function getOrCreateRoom(roomId, mode = "legacy-battle", roomName = "") {
  return rooms.get(roomId) || createRoom(roomId, mode, roomName);
}

function generateParticipantId() {
  return `participant-${crypto.randomUUID()}`;
}

function generateReconnectToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function isV39WorldRoom(room) {
  return room?.mode === "v39-world";
}

function normalizeV39LobbyGameSetup(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    const encoded = JSON.stringify(raw);
    if (Buffer.byteLength(encoded, "utf8") > V39_LOBBY_GAME_SETUP_MAX_BYTES) return null;
    const cloned = JSON.parse(encoded);
    return cloned && typeof cloned === "object" && !Array.isArray(cloned) ? cloned : null;
  } catch {
    return null;
  }
}

function normalizeV39RoomSettings(raw, room) {
  const source = raw && typeof raw === "object" ? raw : {};
  const participantOrder = Array.from(room.participants.keys());
  const participantIds = new Set(participantOrder);
  const participantMinimum = Math.max(1, participantOrder.length);
  const requestedFactionCount = Math.floor(Number(source.factionCount)) || 1;
  const factionCount = Math.max(
    participantMinimum,
    Math.min(V39_ROOM_PARTICIPANT_LIMIT, requestedFactionCount)
  );
  const fallbackParticipantId = room.hostParticipantId || participantOrder[0] || "";
  const requestedAssignments = source.playerParticipantAssignments && typeof source.playerParticipantAssignments === "object"
    ? source.playerParticipantAssignments
    : {};
  const playerParticipantAssignments = {};
  for (let index = 1; index <= factionCount; index += 1) {
    const playerId = `player-${index}`;
    const requestedParticipantId = String(requestedAssignments[playerId] || "");
    const automaticParticipantId = participantOrder[(index - 1) % participantOrder.length] || fallbackParticipantId;
    playerParticipantAssignments[playerId] = participantIds.has(requestedParticipantId)
      ? requestedParticipantId
      : automaticParticipantId;
  }
  const requestedFactionSelections = Object.prototype.hasOwnProperty.call(source, "playerFactionSelections")
    ? source.playerFactionSelections
    : room?.settings?.playerFactionSelections;
  const playerFactionSelections = {};
  for (let index = 1; index <= factionCount; index += 1) {
    const playerId = `player-${index}`;
    const raceKey = String(requestedFactionSelections?.[playerId] || "").trim();
    if (V39_SELECTABLE_RACE_KEYS.has(raceKey)) playerFactionSelections[playerId] = raceKey;
  }
  const requestedGameSetup = Object.prototype.hasOwnProperty.call(source, "gameSetup")
    ? source.gameSetup
    : room?.settings?.gameSetup;
  return {
    factionCount,
    playerParticipantAssignments,
    playerFactionSelections,
    gameSetup:normalizeV39LobbyGameSetup(requestedGameSetup)
  };
}

function syncV39ParticipantAssignments(room) {
  if (!isV39WorldRoom(room)) return;
  room.settings = normalizeV39RoomSettings(room.settings, room);
  for (const participant of room.participants.values()) participant.assignedPlayerIds = [];
  for (const [playerId, participantId] of Object.entries(room.settings.playerParticipantAssignments)) {
    room.participants.get(participantId)?.assignedPlayerIds.push(playerId);
  }
}

function serializeV39Participants(room) {
  return Array.from(room.participants.values()).map(participant => ({
    participantId: participant.participantId,
    displayName: participant.displayName,
    connected: !!participant.connected,
    ready: !!participant.ready,
    assignedPlayerIds: [...participant.assignedPlayerIds],
    joinedAt: participant.joinedAt
  }));
}

function serializeV39RoomSnapshot(room) {
  syncV39ParticipantAssignments(room);
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    protocolVersion: V39_ROOM_PROTOCOL_VERSION,
    phase: room.phase,
    hostParticipantId: room.hostParticipantId,
    participants: serializeV39Participants(room),
    settings: room.settings,
    stateRevision: room.stateRevision,
    startedAt: room.startedAt || 0
  };
}

function emitV39RoomSnapshot(room, socket = null) {
  if (!isV39WorldRoom(room)) return;
  const payload = serializeV39RoomSnapshot(room);
  if (socket) socket.emit("room:snapshot", payload);
  else io.to(room.roomId).emit("room:snapshot", payload);
}

function resetV39ReadyStates(room, exceptParticipantId = "") {
  if (!isV39WorldRoom(room)) return;
  for (const participant of room.participants.values()) {
    if (participant.participantId !== exceptParticipantId) participant.ready = false;
  }
}

function pushRoomChat(room, sender, message) {
  const normalizedMessage = normalizeRoomChatMessage(message);
  if (!normalizedMessage) return;
  room.chatLog.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sender: String(sender || "Player").trim().slice(0, 20) || "Player",
    message: normalizedMessage,
    timestamp: Date.now()
  });
  if (room.chatLog.length > ROOM_CHAT_MAX_ITEMS) room.chatLog.length = ROOM_CHAT_MAX_ITEMS;
}

function serializePlayers(room) {
  return Array.from(room.players.entries()).map(([socketId, name]) => ({
    socketId,
    name
  }));
}

function broadcastRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;
  const players = serializePlayers(room);
  io.to(roomId).emit("room:players", { roomId, players });
  io.to(roomId).emit("room:state", { roomId, state: room.state, players, chatLog: room.chatLog });
  emitV39RoomSnapshot(room);
}

function detachSocketFromRoom(socket, options = {}) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = "";
    socket.data.participantId = "";
    socket.leave(roomId);
    return;
  }

  const playerName = room.players.get(socket.id) || "Player";
  room.players.delete(socket.id);
  socket.leave(roomId);
  socket.data.roomId = "";
  const participantId = String(socket.data.participantId || "");
  socket.data.participantId = "";

  if (isV39WorldRoom(room) && participantId) {
    const participant = room.participants.get(participantId);
    if (participant?.socketId === socket.id) {
      participant.socketId = "";
      participant.connected = false;
    }
    if (options.removeParticipant) {
      room.participants.delete(participantId);
      if (room.hostParticipantId === participantId) {
        room.hostParticipantId = room.participants.keys().next().value || "";
        resetV39ReadyStates(room);
      }
      syncV39ParticipantAssignments(room);
    }
    if (room.participants.size === 0) {
      rooms.delete(roomId);
      return;
    }
    if (!options.silent) {
      pushRoomChat(room, "System", `${participant?.displayName || playerName} が${options.removeParticipant ? "ルームを退出" : "切断"}。`);
    }
    broadcastRoom(roomId);
    return;
  }

  if (room.players.size === 0) {
    rooms.delete(roomId);
    return;
  }

  pushRoomChat(room, "System", `${playerName} がルームを退出。`);
  pushLog(room.state, `${playerName} がルームを退出。`);
  broadcastRoom(roomId);
}

function emitV39RoomError(socket, message) {
  socket.emit("room:error", { message });
}

function validateV39GameSnapshotJson(snapshotJson, room) {
  if (typeof snapshotJson !== "string" || !snapshotJson.trim()) return { ok:false, message:"ゲーム状態が空です。" };
  if (Buffer.byteLength(snapshotJson, "utf8") > V39_GAME_SNAPSHOT_MAX_BYTES) {
    return { ok:false, message:"ゲーム状態が大きすぎます。" };
  }
  try {
    const parsed = JSON.parse(snapshotJson);
    if (parsed?.format !== "fantasy-strategy-v39") return { ok:false, message:"v39ゲーム状態ではありません。" };
    if (!parsed?.gameState || !Array.isArray(parsed.gameState.players)) return { ok:false, message:"プレイヤー状態がありません。" };
    if (!parsed?.field || !Array.isArray(parsed.field?.mapData?.grid)) return { ok:false, message:"マップ状態がありません。" };
    const expectedFactionCount = Math.max(1, Number(room?.settings?.factionCount) || 1);
    if (parsed.gameState.players.length !== expectedFactionCount) {
      return { ok:false, message:"ロビーの操作勢力数とゲーム状態の勢力数が一致しません。" };
    }
    const assignments = room?.settings?.playerParticipantAssignments || {};
    const selections = room?.settings?.playerFactionSelections || {};
    for (let index = 1; index <= expectedFactionCount; index += 1) {
      const playerId = `player-${index}`;
      const player = parsed.gameState.players.find(row => String(row?.id || "") === playerId);
      if (!player) return { ok:false, message:`勢力${index}のゲーム状態がありません。` };
      if (String(player?.controllerParticipantId || "") !== String(assignments[playerId] || "")) {
        return { ok:false, message:`勢力${index}の担当参加者がロビー設定と一致しません。` };
      }
      if (String(player?.race || "") !== String(selections[playerId] || "")) {
        return { ok:false, message:`勢力${index}の開始種族がロビー設定と一致しません。` };
      }
    }
    return { ok:true, parsed };
  } catch {
    return { ok:false, message:"ゲーム状態JSONを読み取れませんでした。" };
  }
}

function validateV39CompletedSetupSnapshotJson(snapshotJson, room) {
  const validation = validateV39GameSnapshotJson(snapshotJson, room);
  if (!validation.ok) return validation;
  for (const [index, player] of validation.parsed.gameState.players.entries()) {
    const faction = player?.factionState || {};
    const sovereign = (Array.isArray(faction.units) ? faction.units : []).find(unit => unit?.isSovereign === true);
    if (!sovereign) return { ok:false, message:`勢力${index + 1}の統治者作成が完了していません。` };
    const placed = (Array.isArray(faction.settlements) ? faction.settlements : []).some(row => row?.placed === true);
    if (!placed) return { ok:false, message:`勢力${index + 1}の初期拠点配置が完了していません。` };
    if (faction.villagePlacementMode === true) return { ok:false, message:`勢力${index + 1}の初期拠点配置が継続中です。` };
  }
  return validation;
}

function participantControlsV39Player(room, participantId, playerId) {
  syncV39ParticipantAssignments(room);
  return String(room?.settings?.playerParticipantAssignments?.[String(playerId || "")] || "") === String(participantId || "");
}

function emitToV39Host(room, event, payload) {
  const host = room?.participants?.get(room?.hostParticipantId);
  if (!host?.socketId) return false;
  io.to(host.socketId).emit(event, payload);
  return true;
}

function resetV39GameStartToLobby(room, message = "") {
  if (!isV39WorldRoom(room)) return;
  room.phase = "lobby";
  room.gameSnapshotJson = "";
  room.startedAt = 0;
  room.stateRevision += 1;
  emitV39RoomSnapshot(room);
  if (message) io.to(room.roomId).emit("game:start-failed", { roomId:room.roomId, message });
}

function validateV39RoomSocket(socket, payload) {
  const roomId = normalizeRoomId(payload?.roomId);
  const room = rooms.get(roomId);
  if (!roomId || socket.data.roomId !== roomId || !isV39WorldRoom(room)) {
    emitV39RoomError(socket, "v39ワールドルームへ参加後に操作してください。");
    return null;
  }
  const participantId = String(socket.data.participantId || "");
  const participant = room.participants.get(participantId);
  if (!participant || participant.socketId !== socket.id) {
    emitV39RoomError(socket, "参加者の認証状態が一致しません。再参加してください。");
    return null;
  }
  return { room, participant };
}

io.on("connection", socket => {
  socket.data.roomId = "";
  socket.data.participantId = "";

  socket.on("room:create", payload => {
    const isV39 = payload?.mode === "v39-world";
    const playerName = isV39
      ? createUniqueV39DisplayName(null, payload?.playerName, "ホストプレイヤー")
      : normalizePlayerName(payload?.playerName);
    if (isV39 && payload?.protocolVersion !== V39_ROOM_PROTOCOL_VERSION) {
      emitV39RoomError(socket, "通信バージョンが一致しません。画面を更新してください。");
      return;
    }
    if (socket.data.roomId) detachSocketFromRoom(socket, { removeParticipant: true, silent: true });

    const roomId = generateRoomId();
    const roomName = isV39 ? normalizeRoomName(payload?.roomName, playerName) : "";
    const room = getOrCreateRoom(roomId, isV39 ? "v39-world" : "legacy-battle", roomName);
    socket.join(roomId);
    socket.data.roomId = roomId;
    room.players.set(socket.id, playerName);
    if (isV39) {
      const participantId = generateParticipantId();
      const reconnectToken = generateReconnectToken();
      const participant = {
        participantId,
        reconnectToken,
        displayName: playerName,
        connected: true,
        socketId: socket.id,
        ready: false,
        assignedPlayerIds: [],
        joinedAt: Date.now()
      };
      room.participants.set(participantId, participant);
      room.hostParticipantId = participantId;
      room.settings = normalizeV39RoomSettings(room.settings, room);
      syncV39ParticipantAssignments(room);
      socket.data.participantId = participantId;
      socket.emit("room:created", {
        roomId,
        roomName:room.roomName,
        participantId,
        reconnectToken,
        displayName:playerName,
        protocolVersion: V39_ROOM_PROTOCOL_VERSION
      });
      pushRoomChat(room, "System", `${playerName} がルームを作成。`);
      emitV39RoomSnapshot(room, socket);
      broadcastRoom(roomId);
      return;
    }
    pushRoomChat(room, "System", `${playerName} がルームを作成。`);
    pushLog(room.state, `${playerName} がルームを作成。`);
    socket.emit("room:created", { roomId });
    broadcastRoom(roomId);
  });

  socket.on("room:join", payload => {
    const roomId = normalizeRoomId(payload?.roomId);
    const rawPlayerName = payload?.playerName;
    if (!roomId) {
      socket.emit("room:error", { message: "ルームIDが不正です。" });
      return;
    }
    if (payload?.mode === "v39-world" && !isV39RoomId(roomId)) {
      emitV39RoomError(socket, "参加用ルームIDは8桁の数字で入力してください。");
      return;
    }
    if (!rooms.has(roomId)) {
      socket.emit("room:error", { message: "ルームが存在しません。先に作成してください。" });
      return;
    }

    const room = getOrCreateRoom(roomId);
    const isV39 = room.mode === "v39-world";
    if (payload?.mode === "v39-world" && !isV39) {
      emitV39RoomError(socket, "このルームはv39ワールド用ではありません。");
      return;
    }
    if (isV39 && payload?.protocolVersion !== V39_ROOM_PROTOCOL_VERSION) {
      emitV39RoomError(socket, "通信バージョンが一致しません。画面を更新してください。");
      return;
    }
    if (socket.data.roomId && socket.data.roomId !== roomId) detachSocketFromRoom(socket, { removeParticipant: true, silent: true });
    socket.join(roomId);
    socket.data.roomId = roomId;

    if (isV39) {
      const requestedParticipantId = String(payload?.participantId || "");
      const reconnectToken = String(payload?.reconnectToken || "");
      let participant = room.participants.get(requestedParticipantId);
      if (!participant && room.phase !== "lobby") {
        socket.leave(roomId);
        socket.data.roomId = "";
        emitV39RoomError(socket, "ゲーム開始後は新しい参加者として入室できません。再接続情報がある場合は同じ参加者として復帰してください。");
        return;
      }
      if (participant && participant.reconnectToken !== reconnectToken) {
        socket.leave(roomId);
        socket.data.roomId = "";
        emitV39RoomError(socket, "再接続情報が一致しません。");
        return;
      }

      let playerName = "";
      if (!participant) {
        if (room.participants.size >= V39_ROOM_PARTICIPANT_LIMIT) {
          socket.leave(roomId);
          socket.data.roomId = "";
          emitV39RoomError(socket, `参加人数は最大${V39_ROOM_PARTICIPANT_LIMIT}人です。`);
          return;
        }
        playerName = createUniqueV39DisplayName(room, rawPlayerName, "プレイヤー1");
        participant = {
          participantId: generateParticipantId(),
          reconnectToken: generateReconnectToken(),
          displayName: playerName,
          connected: true,
          socketId: socket.id,
          ready: false,
          assignedPlayerIds: [],
          joinedAt: Date.now()
        };
        room.participants.set(participant.participantId, participant);
        resetV39ReadyStates(room);
        pushRoomChat(room, "System", `${playerName} がルームに参加。`);
      } else {
        const previousSocket = participant.socketId ? io.sockets.sockets.get(participant.socketId) : null;
        if (previousSocket && previousSocket.id !== socket.id) {
          previousSocket.leave(roomId);
          previousSocket.data.roomId = "";
          previousSocket.data.participantId = "";
          room.players.delete(previousSocket.id);
        }
        playerName = createUniqueV39DisplayName(
          room,
          normalizeV39DisplayName(rawPlayerName) || participant.displayName,
          participant.displayName || "プレイヤー1",
          participant.participantId
        );
        participant.displayName = playerName;
        participant.connected = true;
        participant.socketId = socket.id;
      }

      room.players.set(socket.id, playerName);
      socket.data.participantId = participant.participantId;
      syncV39ParticipantAssignments(room);
      socket.emit("room:joined", {
        roomId,
        participantId: participant.participantId,
        reconnectToken: participant.reconnectToken,
        displayName:playerName,
        protocolVersion: V39_ROOM_PROTOCOL_VERSION
      });
      emitV39RoomSnapshot(room, socket);
      if (room.gameSnapshotJson) {
        socket.emit(room.phase === "setup" ? "game:setup-snapshot" : "game:snapshot", {
          roomId,
          snapshotJson:room.gameSnapshotJson,
          stateRevision:room.stateRevision
        });
      }
      broadcastRoom(roomId);
      return;
    }

    const playerName = normalizePlayerName(rawPlayerName);
    room.players.set(socket.id, playerName);
    pushRoomChat(room, "System", `${playerName} がルームに参加。`);
    pushLog(room.state, `${playerName} がルームに参加。`);
    broadcastRoom(roomId);
  });

  socket.on("room:leave", () => {
    const roomId = String(socket.data.roomId || "");
    const room = rooms.get(roomId);
    const reconnectable = isV39WorldRoom(room)
      && room.phase !== "lobby"
      && !!String(socket.data.participantId || "");
    const phase = String(room?.phase || "");
    const removeParticipant = !isV39WorldRoom(room) || room.phase === "lobby";
    detachSocketFromRoom(socket, { removeParticipant });
    socket.emit("room:left", { roomId, phase, reconnectable });
  });

  socket.on("room:select-faction", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.phase !== "lobby") {
      emitV39RoomError(socket, "開始勢力を変更できるのはロビーだけです。");
      return;
    }
    syncV39ParticipantAssignments(room);
    const playerId = String(payload?.playerId || "").trim();
    const factionCount = Math.max(1, Number(room.settings?.factionCount) || 1);
    const playerIndex = Number(playerId.replace(/^player-/, ""));
    if (!/^player-\d+$/.test(playerId) || !Number.isInteger(playerIndex) || playerIndex < 1 || playerIndex > factionCount) {
      emitV39RoomError(socket, "開始勢力の対象が不正です。");
      return;
    }
    if (String(room.settings?.playerParticipantAssignments?.[playerId] || "") !== participant.participantId) {
      emitV39RoomError(socket, "担当している勢力だけ選択できます。");
      return;
    }
    const raceKey = String(payload?.raceKey || "").trim();
    if (raceKey && !V39_SELECTABLE_RACE_KEYS.has(raceKey)) {
      emitV39RoomError(socket, "選択できない開始勢力です。");
      return;
    }
    const nextSelections = { ...(room.settings?.playerFactionSelections || {}) };
    if (raceKey) nextSelections[playerId] = raceKey;
    else delete nextSelections[playerId];
    room.settings = normalizeV39RoomSettings({
      ...room.settings,
      playerFactionSelections:nextSelections
    }, room);
    participant.ready = false;
    room.stateRevision += 1;
    emitV39RoomSnapshot(room);
  });

  socket.on("room:ready", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    if (context.room.phase !== "lobby") {
      emitV39RoomError(socket, "準備状態を変更できるのはロビーだけです。");
      return;
    }
    if (payload?.ready === true) {
      syncV39ParticipantAssignments(context.room);
      const selections = context.room.settings?.playerFactionSelections || {};
      const missingPlayerId = context.participant.assignedPlayerIds.find(playerId => !V39_SELECTABLE_RACE_KEYS.has(String(selections[playerId] || "")));
      if (missingPlayerId) {
        emitV39RoomError(socket, "担当勢力の開始種族をすべて選択してから準備完了にしてください。");
        return;
      }
    }
    context.participant.ready = payload?.ready === true;
    context.room.stateRevision += 1;
    emitV39RoomSnapshot(context.room);
  });

  socket.on("room:update-settings", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    if (context.room.hostParticipantId !== context.participant.participantId) {
      emitV39RoomError(socket, "ゲーム開始設定を変更できるのはホストだけです。");
      return;
    }
    if (context.room.phase !== "lobby") {
      emitV39RoomError(socket, "ゲーム開始後はロビー設定を変更できません。");
      return;
    }
    const previousSettings = context.room.settings || {};
    const previousAssignments = { ...(previousSettings.playerParticipantAssignments || {}) };
    const nextSettings = normalizeV39RoomSettings(payload?.settings, context.room);
    let assignmentChanged = false;
    for (let index = 1; index <= Math.max(Number(previousSettings.factionCount) || 1, Number(nextSettings.factionCount) || 1); index += 1) {
      const playerId = `player-${index}`;
      if (String(previousAssignments[playerId] || "") !== String(nextSettings.playerParticipantAssignments?.[playerId] || "")) {
        assignmentChanged = true;
        delete nextSettings.playerFactionSelections[playerId];
      }
    }
    const factionCountChanged = Number(previousSettings.factionCount) !== Number(nextSettings.factionCount);
    context.room.settings = nextSettings;
    if (assignmentChanged || factionCountChanged) {
      resetV39ReadyStates(context.room, context.participant.participantId);
      context.participant.ready = false;
    }
    context.room.stateRevision += 1;
    emitV39RoomSnapshot(context.room);
  });

  socket.on("game:start", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.hostParticipantId !== participant.participantId) {
      emitV39RoomError(socket, "ゲームを開始できるのはホストだけです。");
      return;
    }
    if (room.phase !== "lobby") {
      emitV39RoomError(socket, "ゲーム開始処理はすでに進行しています。");
      return;
    }
    if (!room.settings?.gameSetup) {
      emitV39RoomError(socket, "ゲーム開始設定を先に保存してください。");
      return;
    }
    const participants = [...room.participants.values()];
    if (!participants.length || participants.some(row => !row.connected || !row.ready)) {
      emitV39RoomError(socket, "接続中の参加者全員が準備完了になるまで開始できません。");
      return;
    }
    syncV39ParticipantAssignments(room);
    const factionCount = Math.max(1, Number(room.settings?.factionCount) || 1);
    const assignments = room.settings?.playerParticipantAssignments || {};
    const factionSelections = room.settings?.playerFactionSelections || {};
    for (let index = 1; index <= factionCount; index += 1) {
      const playerId = `player-${index}`;
      const participantId = String(assignments[playerId] || "");
      if (!room.participants.has(participantId)) {
        emitV39RoomError(socket, `勢力${index}の担当参加者が不正です。`);
        return;
      }
      if (!V39_SELECTABLE_RACE_KEYS.has(String(factionSelections[playerId] || ""))) {
        emitV39RoomError(socket, `勢力${index}の開始種族を選択してください。`);
        return;
      }
    }
    room.phase = "setup";
    room.gameSnapshotJson = "";
    room.startedAt = 0;
    room.stateRevision += 1;
    emitV39RoomSnapshot(room);
    io.to(room.roomId).emit("game:starting", {
      roomId:room.roomId,
      stateRevision:room.stateRevision
    });
    socket.emit("game:start:host", {
      roomId:room.roomId,
      settings:room.settings,
      participants:serializeV39Participants(room),
      stateRevision:room.stateRevision
    });
  });

  socket.on("game:snapshot", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.hostParticipantId !== participant.participantId) {
      emitV39RoomError(socket, "ゲーム状態を確定できるのはホストだけです。");
      return;
    }
    if (room.phase !== "setup") {
      emitV39RoomError(socket, "現在は初期設定中のゲーム状態を受け付けていません。");
      return;
    }
    const snapshotJson = String(payload?.snapshotJson || "");
    const validation = validateV39GameSnapshotJson(snapshotJson, room);
    if (!validation.ok) {
      resetV39GameStartToLobby(room, validation.message);
      return;
    }
    room.gameSnapshotJson = snapshotJson;
    room.stateRevision += 1;
    emitV39RoomSnapshot(room);
    io.to(room.roomId).emit("game:setup-snapshot", {
      roomId:room.roomId,
      snapshotJson,
      stateRevision:room.stateRevision
    });
  });

  socket.on("game:setup-profile", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.phase !== "setup") {
      emitV39RoomError(socket, "統治者を設定できるのはゲーム開始準備中だけです。");
      return;
    }
    const playerId = String(payload?.playerId || "").trim();
    if (!participantControlsV39Player(room, participant.participantId, playerId)) {
      emitV39RoomError(socket, "担当勢力の統治者だけ設定できます。");
      return;
    }
    const profile = {
      playerId,
      race:String(room.settings?.playerFactionSelections?.[playerId] || ""),
      className:String(payload?.className || "").trim().slice(0, 40),
      characterName:String(payload?.characterName || "").trim().slice(0, 20),
      villageName:String(payload?.villageName || "").trim().slice(0, 20)
    };
    if (!profile.className || !profile.characterName || !profile.villageName) {
      emitV39RoomError(socket, "統治者のクラス・名前・拠点名を入力してください。");
      return;
    }
    if (!emitToV39Host(room, "game:setup-profile:host", {
      roomId:room.roomId,
      participantId:participant.participantId,
      profile,
      stateRevision:room.stateRevision
    })) {
      emitV39RoomError(socket, "ホストへ統治者設定を送信できません。");
    }
  });

  socket.on("game:setup-place", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.phase !== "setup") {
      emitV39RoomError(socket, "初期拠点を配置できるのはゲーム開始準備中だけです。");
      return;
    }
    const playerId = String(payload?.playerId || "").trim();
    if (!participantControlsV39Player(room, participant.participantId, playerId)) {
      emitV39RoomError(socket, "担当勢力の初期拠点だけ配置できます。");
      return;
    }
    const x = Math.floor(Number(payload?.x));
    const y = Math.floor(Number(payload?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      emitV39RoomError(socket, "初期拠点の座標が不正です。");
      return;
    }
    if (!emitToV39Host(room, "game:setup-place:host", {
      roomId:room.roomId,
      participantId:participant.participantId,
      playerId,
      x,
      y,
      stateRevision:room.stateRevision
    })) {
      emitV39RoomError(socket, "ホストへ初期拠点配置を送信できません。");
    }
  });

  socket.on("game:setup-complete", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.hostParticipantId !== participant.participantId || room.phase !== "setup") return;
    const snapshotJson = String(payload?.snapshotJson || "");
    const validation = validateV39CompletedSetupSnapshotJson(snapshotJson, room);
    if (!validation.ok) {
      emitV39RoomError(socket, validation.message);
      return;
    }
    room.gameSnapshotJson = snapshotJson;
    room.phase = "playing";
    room.startedAt = Date.now();
    room.stateRevision += 1;
    emitV39RoomSnapshot(room);
    io.to(room.roomId).emit("game:snapshot", {
      roomId:room.roomId,
      snapshotJson,
      stateRevision:room.stateRevision
    });
    io.to(room.roomId).emit("game:started", {
      roomId:room.roomId,
      stateRevision:room.stateRevision,
      startedAt:room.startedAt
    });
  });

  socket.on("game:start-failed", payload => {
    const context = validateV39RoomSocket(socket, payload);
    if (!context) return;
    const { room, participant } = context;
    if (room.hostParticipantId !== participant.participantId || room.phase !== "setup") return;
    const message = String(payload?.message || "ホスト側でゲーム開始に失敗しました。").slice(0, 240);
    resetV39GameStartToLobby(room, message);
  });

  socket.on("battle:action", payload => {
    const roomId = normalizeRoomId(payload?.roomId);
    const action = String(payload?.action || "");
    if (!roomId || socket.data.roomId !== roomId) {
      socket.emit("room:error", { message: "ルーム参加後に操作してください。" });
      return;
    }
    if (!VALID_ACTIONS.has(action)) {
      socket.emit("room:error", { message: "不正なアクションです。" });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room:error", { message: "ルームが見つかりません。" });
      return;
    }

    room.state = applyBattleAction(room.state, action);
    broadcastRoom(roomId);
  });

  socket.on("room:chat:send", payload => {
    const roomId = normalizeRoomId(payload?.roomId);
    if (!roomId || socket.data.roomId !== roomId) {
      socket.emit("room:error", { message: "ルーム参加後にチャットできます。" });
      return;
    }

    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("room:error", { message: "ルームが見つかりません。" });
      return;
    }

    const message = normalizeRoomChatMessage(payload?.message);
    if (!message) {
      socket.emit("room:error", { message: "チャット内容を入力してください。" });
      return;
    }

    const playerName = room.players.get(socket.id) || "Player";
    pushRoomChat(room, playerName, message);
    io.to(roomId).emit("room:chat", { roomId, chatLog: room.chatLog });
  });

  socket.on("disconnect", () => {
    detachSocketFromRoom(socket);
  });
});

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/config", express.static(path.join(__dirname, "config")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.use(express.static(FRONTEND_DIST_DIR));

app.get("/health", (_, res) => {
  res.json({ ok: true });
});

function sendSpaIndex(res) {
  res.sendFile(FRONTEND_INDEX_PATH, err => {
    if (!err) return;
    if (err.code === "ENOENT" && DEV_MODE) {
      res.status(503).type("html").send(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0.7" />
    <title>Rebuilding...</title>
    <style>
      body { font-family: system-ui, sans-serif; background:#101318; color:#e9eef7; margin:0; display:grid; place-items:center; min-height:100vh; }
      .box { background:#1a212b; border:1px solid #324155; border-radius:10px; padding:16px 18px; }
    </style>
  </head>
  <body>
    <div class="box">フロントエンドを再ビルド中です。自動で再読み込みします...</div>
  </body>
</html>`);
      return;
    }
    res.status(err.statusCode || 500).end();
  });
}

function shouldServeSpaIndex(req) {
  const requestPath = typeof req?.path === "string" ? req.path : "";
  if (!requestPath || requestPath === "/") return true;
  if (requestPath.startsWith("/socket.io")) return false;
  const ext = path.extname(requestPath);
  if (ext) return false;
  return true;
}

app.get("/", (_, res) => {
  sendSpaIndex(res);
});

app.get("*", (req, res) => {
  if (!shouldServeSpaIndex(req)) {
    res.status(404).type("text/plain").send("Not found");
    return;
  }
  sendSpaIndex(res);
});

function setupDevAutoReload() {
  if (!DEV_MODE) return;

  const watcher = chokidar.watch(DEV_WATCH_TARGETS, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 120,
      pollInterval: 20
    }
  });

  let timer = null;
  const pendingReasons = new Set();
  let pendingChangeCount = 0;

  function isFrontReloadTarget(filePath, eventName) {
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, "/");
    if (!relativePath.startsWith("web-vue-dist/")) return true;
    if (eventName !== "change") return false;
    if (relativePath === "web-vue-dist/index.html") return true;
    return /\.(css|js)$/i.test(relativePath);
  }

  function normalizeReloadReason(filePath, eventName) {
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, "/");
    if (relativePath.startsWith("web-vue-dist/")) {
      return "front rebuild";
    }
    return `${eventName}: ${relativePath}`;
  }

  function queueReload(filePath, eventName) {
    if (!isFrontReloadTarget(filePath, eventName)) return;
    pendingReasons.add(normalizeReloadReason(filePath, eventName));
    pendingChangeCount += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      const reasonList = [...pendingReasons];
      let reason = "file change";
      if (reasonList.length === 1) {
        reason = reasonList[0];
      } else if (reasonList.length > 1) {
        const head = reasonList.slice(0, 2).join(", ");
        reason = `${head} (+${reasonList.length - 2})`;
      }
      io.emit("dev:reload", { reason, at: Date.now() });
      console.log(`[dev] browser reload -> ${reason} [${pendingChangeCount} changes]`);
      pendingReasons.clear();
      pendingChangeCount = 0;
      timer = null;
    }, 1200);
  }

  watcher.on("change", filePath => queueReload(filePath, "change"));
  watcher.on("add", filePath => queueReload(filePath, "add"));
  watcher.on("unlink", filePath => queueReload(filePath, "unlink"));

  const shutdown = () => {
    watcher.close().catch(() => {});
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

setupDevAutoReload();

server.on("error", error => {
  if (error?.code === "EADDRINUSE") {
    console.error(`[server] port ${PORT} is already in use. Stop the existing process or change PORT.`);
    return;
  }
  console.error("[server] startup error", error);
});

server.listen(PORT, HOST, () => {
  console.log("Fantasy Strategy server listening:");
  for (const url of resolveStartupUrls(HOST, PORT)) {
    console.log(`  - ${url}`);
  }
});
