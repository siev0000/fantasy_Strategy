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

function randomRoomId() {
  return `ROOM-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function initBattle() {
  const statusEl = document.getElementById("status");
  const alliesEl = document.getElementById("allies");
  const enemiesEl = document.getElementById("enemies");
  const logEl = document.getElementById("log");
  const attackBtn = document.getElementById("attackBtn");
  const skillBtn = document.getElementById("skillBtn");
  const nextBtn = document.getElementById("nextBtn");
  const resetBtn = document.getElementById("resetBtn");
  const roomIdInput = document.getElementById("roomIdInput");
  const playerNameInput = document.getElementById("playerNameInput");
  const joinRoomBtn = document.getElementById("joinRoomBtn");
  const quickJoinBtn = document.getElementById("quickJoinBtn");
  const leaveRoomBtn = document.getElementById("leaveRoomBtn");
  const sessionStatusEl = document.getElementById("sessionStatus");
  const roomPlayersEl = document.getElementById("roomPlayers");

  let localState = createInitialBattleState();
  let roomState = null;
  let activeRoomId = "";
  let isConnected = false;
  let players = [];
  if (typeof window.io === "function" && !window.__fsSocket) {
    window.__fsSocket = window.io();
  }
  const socket = window.__fsSocket || null;
  if (socket && !window.__fsDevReloadBound) {
    window.__fsDevReloadBound = true;
    socket.on("dev:reload", () => {
      window.location.reload();
    });
  }

  function setSessionStatus(text, cls = "") {
    sessionStatusEl.className = `session-status ${cls}`.trim();
    sessionStatusEl.textContent = text;
  }

  function renderPlayers() {
    if (!activeRoomId) {
      roomPlayersEl.textContent = "参加者: -";
      return;
    }
    const labels = players.map(player => player.name);
    roomPlayersEl.textContent = `参加者(${labels.length}): ${labels.join(", ") || "-"}`;
  }

  function unitCard(unit) {
    const hpRatio = Math.round((unit.hp / unit.maxHp) * 100);
    return `
      <article class="unit ${unit.side} ${unit.alive ? "" : "dead"}">
        <h3>${unit.name}</h3>
        <div class="small">種族: ${unit.race}</div>
        <div class="small">ATK: ${unit.atk} / HP: ${unit.hp}/${unit.maxHp}</div>
        <div class="hp-wrap"><div class="hp" style="width:${hpRatio}%;"></div></div>
      </article>
    `;
  }

  function renderLog(entries) {
    logEl.innerHTML = "";
    entries.forEach(entry => {
      const text = typeof entry === "string" ? entry : entry.text;
      const strong = typeof entry === "string" ? false : Boolean(entry.strong);
      const line = document.createElement("div");
      if (strong) {
        const bold = document.createElement("b");
        bold.textContent = text;
        line.appendChild(bold);
      } else {
        line.textContent = text;
      }
      logEl.appendChild(line);
    });
  }

  function currentState() {
    if (activeRoomId) return roomState || localState;
    return localState;
  }

  function render() {
    const state = currentState();
    statusEl.className = `status ${state.statusClass || ""}`.trim();
    statusEl.textContent = state.statusText || `ターン: ${state.turn} / ${state.activeSide === "ally" ? "あなたの行動" : "敵の行動"}`;

    alliesEl.innerHTML = state.allies.map(unitCard).join("");
    enemiesEl.innerHTML = state.enemies.map(unitCard).join("");
    renderLog(state.log || []);

    const roomLocked = Boolean(activeRoomId) && !isConnected;
    const disableAction = state.ended || state.activeSide !== "ally" || roomLocked;
    attackBtn.disabled = disableAction;
    skillBtn.disabled = disableAction;
    nextBtn.disabled = state.ended || roomLocked;
    resetBtn.disabled = roomLocked;
  }

  function runAction(action) {
    if (activeRoomId) {
      if (!socket || !isConnected) return;
      socket.emit("battle:action", { roomId: activeRoomId, action });
      return;
    }
    localState = applyBattleAction(localState, action);
    render();
  }

  function joinRoom(roomId) {
    if (!socket) {
      setSessionStatus("Socket.IOが利用不可のためローカル専用です。", "error");
      return;
    }
    const normalizedRoomId = normalizeRoomId(roomId);
    const playerName = normalizePlayerName(playerNameInput.value);
    if (!normalizedRoomId) {
      setSessionStatus("ルームIDを入力してください。", "error");
      return;
    }

    roomIdInput.value = normalizedRoomId;
    playerNameInput.value = playerName;
    setSessionStatus(`ルーム ${normalizedRoomId} に接続中...`, "warn");
    socket.emit("room:join", { roomId: normalizedRoomId, playerName });
  }

  function leaveRoom() {
    if (!activeRoomId) return;
    if (socket) socket.emit("room:leave");
    activeRoomId = "";
    roomState = null;
    players = [];
    setSessionStatus("ローカルモード（1人プレイ）", "");
    renderPlayers();
    render();
  }

  attackBtn.addEventListener("click", () => runAction("attack"));
  skillBtn.addEventListener("click", () => runAction("skill"));
  nextBtn.addEventListener("click", () => runAction("next"));
  resetBtn.addEventListener("click", () => runAction("reset"));
  joinRoomBtn.addEventListener("click", () => joinRoom(roomIdInput.value));
  quickJoinBtn.addEventListener("click", () => {
    const id = randomRoomId();
    roomIdInput.value = id;
    joinRoom(id);
  });
  leaveRoomBtn.addEventListener("click", leaveRoom);

  if (socket) {
    socket.on("connect", () => {
      isConnected = true;
      if (activeRoomId) {
        socket.emit("room:join", {
          roomId: activeRoomId,
          playerName: normalizePlayerName(playerNameInput.value)
        });
      } else {
        setSessionStatus("ローカルモード（1人プレイ）", "");
      }
      render();
    });

    socket.on("disconnect", () => {
      isConnected = false;
      if (activeRoomId) setSessionStatus("通信切断。再接続待機中...", "warn");
      render();
    });

    socket.on("room:error", payload => {
      setSessionStatus(payload?.message || "通信エラーが発生しました。", "error");
    });

    socket.on("room:players", payload => {
      if (!payload || payload.roomId !== activeRoomId) return;
      players = Array.isArray(payload.players) ? payload.players : [];
      renderPlayers();
    });

    socket.on("room:state", payload => {
      if (!payload?.state) return;
      activeRoomId = payload.roomId || activeRoomId;
      roomState = payload.state;
      players = Array.isArray(payload.players) ? payload.players : players;
      setSessionStatus(`ルーム ${activeRoomId} 参加中`, "ok");
      renderPlayers();
      render();
    });

    socket.on("room:left", () => {
      activeRoomId = "";
      roomState = null;
      players = [];
      setSessionStatus("ローカルモード（1人プレイ）", "");
      renderPlayers();
      render();
    });
  } else {
    setSessionStatus("Socket.IOがないためローカル専用です。", "warn");
  }

  renderPlayers();
  render();
}

window.App = window.App || {};
window.App.initBattle = initBattle;
