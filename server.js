const express = require("express");
const http = require("http");
const path = require("path");
const chokidar = require("chokidar");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const server = http.createServer(app);
const FRONTEND_DIST_DIR = path.join(__dirname, "web-vue-dist");
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
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      if (!origin || allowedSocketOrigins.has(origin)) {
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
const rooms = new Map();
const DEV_MODE = process.env.NODE_ENV !== "production";
const DEV_WATCH_TARGETS = ["web-vue-dist", "assets", "config", "data"].map(p => path.join(__dirname, p));
const FRONTEND_INDEX_PATH = path.join(FRONTEND_DIST_DIR, "index.html");

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

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let roomId = "";
  do {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    roomId = `ROOM-${code}`;
  } while (rooms.has(roomId));
  return roomId;
}

function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      state: createInitialBattleState(),
      players: new Map()
    });
  }
  return rooms.get(roomId);
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
  io.to(roomId).emit("room:state", { roomId, state: room.state, players });
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) {
    socket.data.roomId = "";
    socket.leave(roomId);
    return;
  }

  const playerName = room.players.get(socket.id) || "Player";
  room.players.delete(socket.id);
  socket.leave(roomId);
  socket.data.roomId = "";

  if (room.players.size === 0) {
    rooms.delete(roomId);
    return;
  }

  pushLog(room.state, `${playerName} がルームを退出。`);
  broadcastRoom(roomId);
}

io.on("connection", socket => {
  socket.data.roomId = "";

  socket.on("room:create", payload => {
    const playerName = normalizePlayerName(payload?.playerName);
    if (socket.data.roomId) leaveRoom(socket);

    const roomId = generateRoomId();
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;
    room.players.set(socket.id, playerName);
    pushLog(room.state, `${playerName} がルームを作成。`);
    socket.emit("room:created", { roomId });
    broadcastRoom(roomId);
  });

  socket.on("room:join", payload => {
    const roomId = normalizeRoomId(payload?.roomId);
    const playerName = normalizePlayerName(payload?.playerName);
    if (!roomId) {
      socket.emit("room:error", { message: "ルームIDが不正です。" });
      return;
    }
    if (!rooms.has(roomId)) {
      socket.emit("room:error", { message: "ルームが存在しません。先に作成してください。" });
      return;
    }

    if (socket.data.roomId && socket.data.roomId !== roomId) leaveRoom(socket);
    const room = getOrCreateRoom(roomId);
    socket.join(roomId);
    socket.data.roomId = roomId;
    room.players.set(socket.id, playerName);
    pushLog(room.state, `${playerName} がルームに参加。`);
    broadcastRoom(roomId);
  });

  socket.on("room:leave", () => {
    leaveRoom(socket);
    socket.emit("room:left");
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

  socket.on("disconnect", () => {
    leaveRoom(socket);
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

app.get("/", (_, res) => {
  sendSpaIndex(res);
});

app.get("*", (_, res) => {
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
  let reason = "file change";

  function queueReload(filePath, eventName) {
    const relativePath = path.relative(__dirname, filePath).replace(/\\/g, "/");
    reason = `${eventName}: ${relativePath}`;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      io.emit("dev:reload", { reason, at: Date.now() });
      console.log(`[dev] browser reload -> ${reason}`);
      timer = null;
    }, 120);
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

server.listen(PORT, () => {
  console.log(`Fantasy Strategy server listening on http://localhost:${PORT}`);
});
