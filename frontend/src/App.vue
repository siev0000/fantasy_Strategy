<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { io } from "socket.io-client";
import AppHeader from "./components/AppHeader.vue";
import PhaserMapGeneratorPanel from "./components/PhaserMapGeneratorPanel.vue";
import MenuPanel from "./components/MenuPanel.vue";
import RoomModal from "./components/RoomModal.vue";
import BattleModal from "./components/BattleModal.vue";
import SimulatorModal from "./components/SimulatorModal.vue";

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

function pushLog(state, text, strong) {
  state.log.unshift({ text, strong: Boolean(strong) });
  if (state.log.length > 140) state.log.length = 140;
}

function setStatus(state, text, cls) {
  state.statusText = text;
  state.statusClass = cls || "";
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
  if (action === "attack") runNormalAttack(state);
  if (action === "skill") runRaceSkill(state);
  if (action === "next") runEndTurn(state);
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
  return String(raw || "").trim().slice(0, 20) || "Player";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rollDisasterSeverity() {
  const r = Math.random() * 100;
  if (r < 60) return { label: "軽度", yieldPenalty: -10, popDamage: 0 };
  if (r < 90) return { label: "中度", yieldPenalty: -25, popDamage: 0 };
  return { label: "重度", yieldPenalty: -40, popDamage: -1 };
}

const socket = ref(null);
const socketReady = ref(false);
const showRoomModal = ref(false);
const showBattleModal = ref(false);
const showSimModal = ref(false);
const localState = ref(createInitialBattleState());
const roomState = ref(null);
const activeRoomId = ref("");
const roomIdInput = ref("ROOM1");
const playerNameInput = ref("Player");
const players = ref([]);
const sessionStatusText = ref("ローカルモード（1人プレイ）");
const sessionStatusClass = ref("");
const simResult = ref("ここに計算結果を表示");
const sim = reactive({
  terrainDifficulty: 3,
  developmentPower: 20,
  participants: 2,
  currentProgress: 0,
  govBonus: 0,
  facilityBonus: 0,
  policyBonus: 0,
  monsterRisk: 50,
  foodBalance: 1,
  dissatisfaction: 20,
  jobsFilled: 1,
  popOver: 0,
  defenseLow: 0
});

let globalKeyHandler = null;

const currentState = computed(() => {
  if (activeRoomId.value) return roomState.value || localState.value;
  return localState.value;
});

const actionDisabled = computed(() => {
  const state = currentState.value;
  const roomLocked = activeRoomId.value && !socketReady.value;
  return state.ended || state.activeSide !== "ally" || roomLocked;
});

const nextDisabled = computed(() => {
  const state = currentState.value;
  const roomLocked = activeRoomId.value && !socketReady.value;
  return state.ended || roomLocked;
});

const resetDisabled = computed(() => activeRoomId.value && !socketReady.value);
const playersLabel = computed(() => {
  if (!activeRoomId.value) return "-";
  return players.value.map(p => p.name).join(", ") || "-";
});

function openModal(kind) {
  showRoomModal.value = kind === "room";
  showBattleModal.value = kind === "battle";
  showSimModal.value = kind === "sim";
}

function closeModal(kind) {
  if (kind === "room") showRoomModal.value = false;
  if (kind === "battle") showBattleModal.value = false;
  if (kind === "sim") showSimModal.value = false;
}

function closeAllModals() {
  showRoomModal.value = false;
  showBattleModal.value = false;
  showSimModal.value = false;
}

function setSessionStatus(text, cls = "") {
  sessionStatusText.value = text;
  sessionStatusClass.value = cls;
}

function runAction(action) {
  if (activeRoomId.value) {
    if (!socket.value || !socketReady.value) return;
    socket.value.emit("battle:action", { roomId: activeRoomId.value, action });
    return;
  }
  localState.value = applyBattleAction(localState.value, action);
}

function createRoom() {
  if (!socket.value || !socketReady.value) return;
  const playerName = normalizePlayerName(playerNameInput.value);
  playerNameInput.value = playerName;
  setSessionStatus("ルーム作成中...", "warn");
  socket.value.emit("room:create", { playerName });
}

function joinRoom() {
  if (!socket.value || !socketReady.value) return;
  const roomId = normalizeRoomId(roomIdInput.value);
  const playerName = normalizePlayerName(playerNameInput.value);
  if (!roomId) {
    setSessionStatus("ルームIDを入力してください。", "error");
    return;
  }
  roomIdInput.value = roomId;
  playerNameInput.value = playerName;
  setSessionStatus(`ルーム ${roomId} に接続中...`, "warn");
  socket.value.emit("room:join", { roomId, playerName });
}

function leaveRoom() {
  if (!activeRoomId.value) return;
  if (socket.value) socket.value.emit("room:leave");
  activeRoomId.value = "";
  roomState.value = null;
  players.value = [];
  setSessionStatus("ローカルモード（1人プレイ）");
}

function runSimulatorTurn() {
  const terrainDifficulty = clamp(Number(sim.terrainDifficulty) || 1, 1, 5);
  const developmentPower = Math.max(1, Number(sim.developmentPower) || 10);
  const participants = clamp(Number(sim.participants) || 1, 1, 4);
  const currentProgress = clamp(Number(sim.currentProgress) || 0, 0, 100);
  const govBonus = Number(sim.govBonus) || 0;
  const facilityBonus = Number(sim.facilityBonus) || 0;
  const policyBonus = Number(sim.policyBonus) || 0;
  const monsterRisk = clamp(Number(sim.monsterRisk) || 0, 0, 100);
  const foodBalance = Number(sim.foodBalance);
  const dissatisfaction = clamp(Number(sim.dissatisfaction) || 0, 0, 100);
  const jobsFilled = Number(sim.jobsFilled) === 1;
  const popOver = Number(sim.popOver) === 1;
  const defenseLow = Number(sim.defenseLow) === 1;

  const requiredWork = terrainDifficulty * 4;
  const baseProgressPerTurn = (developmentPower / 10) * participants;
  const sumPct = govBonus + facilityBonus + policyBonus;
  const multiplier = clamp(1 + (sumPct / 100), 0.25, 5.0);
  const effectiveProgressPerTurn = baseProgressPerTurn * multiplier;
  const progressGainPercent = (effectiveProgressPerTurn / requiredWork) * 100;
  const newProgress = clamp(currentProgress + progressGainPercent, 0, 100);
  const estimatedTurnsLeft = newProgress >= 100
    ? 0
    : Math.ceil((requiredWork * (1 - newProgress / 100)) / effectiveProgressPerTurn);

  let dissDelta = 0;
  if (foodBalance < 0) dissDelta += 5;
  if (!jobsFilled) dissDelta += 3;
  if (popOver) dissDelta += 4;
  if (defenseLow) dissDelta += 2;
  if (foodBalance > 0 && jobsFilled) dissDelta -= 3;
  const newDiss = clamp(dissatisfaction + dissDelta, 0, 100);

  let dissTier = "安定";
  if (newDiss >= 75) dissTier = "暴動寸前（産出-30%・反乱判定）";
  else if (newDiss >= 50) dissTier = "高不満（産出-15%・治安-1）";
  else if (newDiss >= 25) dissTier = "不満（産出-5%）";

  let securityDelta = 1;
  if (foodBalance < 0) securityDelta -= 2;
  if (newDiss >= 75) securityDelta -= 3;

  const disasterResults = [];
  if (Math.random() * 100 < 2) {
    const s = rollDisasterSeverity();
    disasterResults.push(`都市災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
  }
  if (Math.random() * 100 < 3) {
    const s = rollDisasterSeverity();
    disasterResults.push(`天候災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
  }
  if (Math.random() * 100 < monsterRisk) {
    const s = rollDisasterSeverity();
    disasterResults.push(`モンスター災害: ${s.label}（産出${s.yieldPenalty}%${s.popDamage ? ` / 人口${s.popDamage}` : ""}）`);
  }

  simResult.value = [
    `開拓進行: ${newProgress.toFixed(1)}%（+${progressGainPercent.toFixed(1)}%）`,
    `補正倍率: ${multiplier.toFixed(2)}倍（加算合計 ${sumPct}% を適用、0.25〜5.00でクランプ）`,
    `残りターン目安: ${estimatedTurnsLeft}`,
    `不満度: ${dissatisfaction} -> ${newDiss}（変化 ${dissDelta >= 0 ? "+" : ""}${dissDelta}）`,
    `不満段階: ${dissTier}`,
    `治安変化（仮）: ${securityDelta >= 0 ? "+" : ""}${securityDelta}`,
    `災害判定: ${disasterResults.length ? disasterResults.join(" / ") : "発生なし"}`
  ].join("\n");

  sim.currentProgress = Number(newProgress.toFixed(1));
  sim.dissatisfaction = newDiss;
}

function renderGameStateToText() {
  const state = currentState.value || {};
  const mapSize = document.getElementById("mapSizeInfo")?.textContent || "";
  const mapCenter = document.getElementById("mapCenterInfo")?.textContent || "";
  const mapClick = document.getElementById("mapClickInfo")?.textContent || "";
  const mapStats = document.getElementById("mapStats")?.textContent || "";
  const payload = {
    mode: "menu",
    activeRoomId: activeRoomId.value || null,
    modal: {
      room: showRoomModal.value,
      battle: showBattleModal.value,
      sim: showSimModal.value
    },
    battle: {
      turn: state.turn,
      activeSide: state.activeSide,
      ended: state.ended,
      statusText: state.statusText,
      alliesAlive: Array.isArray(state.allies) ? state.allies.filter(u => u.alive).length : 0,
      enemiesAlive: Array.isArray(state.enemies) ? state.enemies.filter(u => u.alive).length : 0
    },
    map: {
      size: mapSize,
      center: mapCenter,
      click: mapClick,
      stats: mapStats
    }
  };
  return JSON.stringify(payload);
}

onMounted(() => {
  globalKeyHandler = event => {
    if (event.key === "Escape") closeAllModals();
  };
  window.addEventListener("keydown", globalKeyHandler);

  const defaultSocketUrl = window.location.port === "5173" ? "http://localhost:3000" : window.location.origin;
  const socketUrl = import.meta.env.VITE_SOCKET_URL || defaultSocketUrl;
  socket.value = io(socketUrl, { path: "/socket.io" });

  socket.value.on("connect", () => {
    socketReady.value = true;
    if (!activeRoomId.value) setSessionStatus("ローカルモード（1人プレイ）");
  });

  socket.value.on("disconnect", () => {
    socketReady.value = false;
    if (activeRoomId.value) setSessionStatus("通信切断。再接続待機中...", "warn");
  });

  socket.value.on("room:error", payload => {
    setSessionStatus(payload?.message || "通信エラーが発生しました。", "error");
  });

  socket.value.on("room:created", payload => {
    if (!payload?.roomId) return;
    roomIdInput.value = payload.roomId;
    activeRoomId.value = payload.roomId;
    setSessionStatus(`ルーム ${payload.roomId} を作成`, "ok");
  });

  socket.value.on("room:players", payload => {
    if (!payload || payload.roomId !== activeRoomId.value) return;
    players.value = Array.isArray(payload.players) ? payload.players : [];
  });

  socket.value.on("room:state", payload => {
    if (!payload?.state) return;
    activeRoomId.value = payload.roomId || activeRoomId.value;
    roomState.value = payload.state;
    players.value = Array.isArray(payload.players) ? payload.players : players.value;
    setSessionStatus(`ルーム ${activeRoomId.value} 参加中`, "ok");
  });

  socket.value.on("room:left", () => {
    activeRoomId.value = "";
    roomState.value = null;
    players.value = [];
    setSessionStatus("ローカルモード（1人プレイ）");
  });

  socket.value.on("dev:reload", () => {
    window.location.reload();
  });

  window.render_game_to_text = () => renderGameStateToText();
  window.advanceTime = ms => ms;
});

onBeforeUnmount(() => {
  if (globalKeyHandler) {
    window.removeEventListener("keydown", globalKeyHandler);
  }
  if (socket.value) {
    socket.value.close();
    socket.value = null;
  }
  if (window.render_game_to_text) delete window.render_game_to_text;
  if (window.advanceTime) delete window.advanceTime;
});
</script>

<template>
  <div class="app">
    <app-header :active-room-id="activeRoomId" @open-modal="openModal" />

    <phaser-map-generator-panel />

    <menu-panel @open-modal="openModal" />

    <room-modal
      :show="showRoomModal"
      :socket-ready="socketReady"
      :active-room-id="activeRoomId"
      :room-id-input="roomIdInput"
      :player-name-input="playerNameInput"
      :session-status-text="sessionStatusText"
      :session-status-class="sessionStatusClass"
      :players-label="playersLabel"
      @close="closeModal('room')"
      @update:room-id-input="roomIdInput = $event"
      @update:player-name-input="playerNameInput = $event"
      @create-room="createRoom"
      @join-room="joinRoom"
      @leave-room="leaveRoom"
    />

    <battle-modal
      :show="showBattleModal"
      :current-state="currentState"
      :action-disabled="actionDisabled"
      :next-disabled="nextDisabled"
      :reset-disabled="resetDisabled"
      @close="closeModal('battle')"
      @action="runAction"
    />

    <simulator-modal
      :show="showSimModal"
      :sim="sim"
      :sim-result="simResult"
      @close="closeModal('sim')"
      @run-turn="runSimulatorTurn"
    />
  </div>
</template>
