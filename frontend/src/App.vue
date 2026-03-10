<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { io } from "socket.io-client";
import PhaserMapGeneratorPanel from "./components/PhaserMapGeneratorPanel.vue";
import RoomModal from "./components/RoomModal.vue";
import BattleModal from "./components/BattleModal.vue";
import SimulatorModal from "./components/SimulatorModal.vue";
import SkillTreeModal from "./components/SkillTreeModal.vue";
import RaceSelectModal from "./components/RaceSelectModal.vue";
import ClassSelectModal from "./components/ClassSelectModal.vue";
import CharacterStatusModal from "./components/CharacterStatusModal.vue";
import CharacterNameModal from "./components/CharacterNameModal.vue";
import raceSelectionDb from "../../data/source/export/json/種族.json";

const DEFAULT_RACE_STATS = { hp: 100, atk: 20 };
const RACES = Array.isArray(raceSelectionDb)
  ? raceSelectionDb.reduce((acc, item) => {
    const key = String(item?.key || "").trim();
    if (!key) return acc;
    const hp = Number(item?.hp);
    const atk = Number(item?.atk);
    acc[key] = {
      hp: Number.isFinite(hp) ? hp : DEFAULT_RACE_STATS.hp,
      atk: Number.isFinite(atk) ? atk : DEFAULT_RACE_STATS.atk
    };
    return acc;
  }, {})
  : {};

const ALLY_ORDER = ["只人", "エルフ", "竜人", "天使"];
const ENEMY_ORDER = ["オーガ", "ゴブリン", "悪魔", "ヴァンパイア"];
const SAVE_FORMAT_VERSION = 1;

function unitFromRace(race, side, id) {
  const base = RACES[race] || DEFAULT_RACE_STATS;
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
const showSkillTreeModal = ref(false);
const showRaceModal = ref(false);
const showClassModal = ref(false);
const showCharacterStatusModal = ref(false);
const showCharacterNameModal = ref(false);
const skillTreeCategories = ref(["魔法", "軍事", "経済", "信仰"]);
const selectedRace = ref(raceSelectionDb?.[0]?.key || "只人");
const selectedClass = ref("");
const selectedCharacterName = ref("主人公");
const selectedVillageName = ref("はじまりの村");
const gameSetupReady = ref(false);
const gameFlowStep = ref("idle");
const characterCommand = ref(null);
const testControlsVisible = ref(false);
const gameOnlyMode = computed(() => true);
const mapCharacterState = ref({
  village: null,
  units: [],
  squads: [],
  selectedUnitId: "",
  unitMoveMode: false,
  villageScale: "村",
  namedLimit: 2,
  namedCount: 0,
  ruleText: ""
});
const latestMapSaveSnapshot = ref(null);
const characterCount = computed(() => {
  return Array.isArray(mapCharacterState.value?.units) ? mapCharacterState.value.units.length : 0;
});
const characterListLabel = computed(() => {
  const units = Array.isArray(mapCharacterState.value?.units) ? mapCharacterState.value.units : [];
  if (!units.length) return "なし";
  const names = units.map(unit => String(unit?.name || "").trim()).filter(Boolean);
  if (!names.length) return "なし";
  const shown = names.slice(0, 5);
  return names.length > 5 ? `${shown.join(", ")} ...` : shown.join(", ");
});
const gameFlowLabel = computed(() => {
  if (gameFlowStep.value === "sovereign") return "統治者作成";
  if (gameFlowStep.value === "village") return "初期村を配置";
  if (gameFlowStep.value === "mob") return "モブを作成";
  if (gameFlowStep.value === "ready") return "完了";
  return "未開始";
});
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
let saveSnapshotWaiters = [];

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

function openModal(kind, payload = null) {
  if (kind === "game-start") {
    closeAllModals();
    gameSetupReady.value = false;
    gameFlowStep.value = "sovereign";
    mapCharacterState.value = {
      village: null,
      units: [],
      squads: [],
      selectedUnitId: "",
      unitMoveMode: false,
      villageScale: "村",
      namedLimit: 2,
      namedCount: 0,
      ruleText: ""
    };
    showRaceModal.value = true;
    setSessionStatus("ゲーム開始: 統治者を作成してください（種族 → クラス → 名前）", "warn");
    return;
  }
  showRoomModal.value = kind === "room";
  showBattleModal.value = kind === "battle";
  showSimModal.value = kind === "sim";
  showSkillTreeModal.value = kind === "skill";
  showRaceModal.value = kind === "race";
  showClassModal.value = kind === "class";
  showCharacterStatusModal.value = kind === "characters";
  showCharacterNameModal.value = kind === "name";
  if (kind === "skill" && Array.isArray(payload?.categories)) {
    skillTreeCategories.value = payload.categories;
  } else if (kind === "skill" && !skillTreeCategories.value.length) {
    skillTreeCategories.value = ["魔法", "軍事", "経済", "信仰"];
  }
}

function closeModal(kind) {
  if (kind === "room") showRoomModal.value = false;
  if (kind === "battle") showBattleModal.value = false;
  if (kind === "sim") showSimModal.value = false;
  if (kind === "skill") showSkillTreeModal.value = false;
  if (kind === "race") showRaceModal.value = false;
  if (kind === "class") showClassModal.value = false;
  if (kind === "characters") showCharacterStatusModal.value = false;
  if (kind === "name") showCharacterNameModal.value = false;
}

function closeAllModals() {
  showRoomModal.value = false;
  showBattleModal.value = false;
  showSimModal.value = false;
  showSkillTreeModal.value = false;
  showRaceModal.value = false;
  showClassModal.value = false;
  showCharacterStatusModal.value = false;
  showCharacterNameModal.value = false;
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

function applySelectedRace(raceKey) {
  const key = String(raceKey || "").trim();
  if (!Object.prototype.hasOwnProperty.call(RACES, key)) return;
  selectedRace.value = key;
  setSessionStatus(`開始種族を ${key} に設定。次にクラスを選択してください。`, "ok");
  showRaceModal.value = false;
  showClassModal.value = true;
}

function applySelectedClass(payload) {
  const className = String(payload?.className || "").trim();
  if (!className) return;
  selectedClass.value = className;
  showClassModal.value = false;
  showCharacterNameModal.value = true;
  setSessionStatus(`開始クラスを ${className} に設定。次に名前を設定してください。`, "ok");
}

function applyCharacterName(payload) {
  const characterName = String(payload?.characterName || "").trim().slice(0, 20);
  const villageName = String(payload?.villageName || "").trim().slice(0, 20);
  if (!characterName || !villageName) return;
  selectedCharacterName.value = characterName;
  selectedVillageName.value = villageName;
  gameSetupReady.value = true;
  gameFlowStep.value = "village";
  showCharacterNameModal.value = false;
  setSessionStatus(`統治者作成完了: ${characterName} / 村名 ${villageName}。次に初期村を配置してください。`, "warn");
  characterCommand.value = {
    type: "startVillagePlacement",
    nonce: `${Date.now()}-${Math.floor(Math.random() * 99999)}`
  };
}

function handleCharacterStateChange(payload) {
  const units = Array.isArray(payload?.units)
    ? payload.units.map(unit => ({
      ...unit,
      iconName: String(unit?.iconName || ""),
      iconSrc: String(unit?.iconSrc || ""),
      status: unit?.status ? { ...unit.status } : null,
      skillLevels: unit?.skillLevels ? { ...unit.skillLevels } : null,
      baseResistances: unit?.baseResistances ? { ...unit.baseResistances } : null,
      resistances: unit?.resistances ? { ...unit.resistances } : null,
      equipmentSlots: unit?.equipmentSlots ? { ...unit.equipmentSlots } : null,
      growthRule: unit?.growthRule ? { ...unit.growthRule } : null,
      equipment: Array.isArray(unit?.equipment) ? unit.equipment.map(e => ({ ...e })) : [],
      skills: Array.isArray(unit?.skills) ? [...unit.skills] : []
    }))
    : [];
  const squads = Array.isArray(payload?.squads)
    ? payload.squads.map(squad => ({
      ...squad,
      memberIds: Array.isArray(squad?.memberIds) ? squad.memberIds.map(v => String(v || "").trim()).filter(Boolean) : []
    }))
    : [];
  mapCharacterState.value = {
    village: payload?.village ? { ...payload.village } : null,
    units,
    squads,
    selectedUnitId: String(payload?.selectedUnitId || ""),
    unitMoveMode: !!payload?.unitMoveMode,
    villageScale: String(payload?.villageScale || "村"),
    namedLimit: Number(payload?.namedLimit || 2),
    namedCount: Number(payload?.namedCount || 0),
    ruleText: String(payload?.ruleText || "")
  };
  const villagePlaced = !!mapCharacterState.value?.village?.placed;
  if (gameFlowStep.value === "village" && villagePlaced) {
    gameFlowStep.value = "mob";
    setSessionStatus("初期村を配置しました。次にモブを作成してください。", "warn");
    characterCommand.value = {
      type: "openUnitCreate",
      nonce: `${Date.now()}-${Math.floor(Math.random() * 99999)}`
    };
    return;
  }
  const hasMobUnit = units.some(unit => !unit?.isSovereign);
  if (gameFlowStep.value === "mob" && hasMobUnit) {
    gameFlowStep.value = "ready";
    setSessionStatus("ゲーム開始フロー完了。マップ探索を開始できます。", "ok");
  }
}

function deepCloneJsonValue(value, fallback = null) {
  try {
    const raw = JSON.stringify(value);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function handleSaveSnapshot(payload) {
  const snapshot = payload?.snapshot ? deepCloneJsonValue(payload.snapshot, null) : null;
  latestMapSaveSnapshot.value = snapshot;
  if (!saveSnapshotWaiters.length) return;
  const waiters = [...saveSnapshotWaiters];
  saveSnapshotWaiters = [];
  waiters.forEach(resolve => {
    try {
      resolve(snapshot);
    } catch {
      // noop
    }
  });
}

function requestMapSaveSnapshot(reason = "manual") {
  characterCommand.value = {
    type: "requestSaveSnapshot",
    reason: String(reason || "manual"),
    nonce: `${Date.now()}-${Math.floor(Math.random() * 99999)}`
  };
}

function requestMapSaveSnapshotAsync(reason = "manual", timeoutMs = 1500) {
  return new Promise(resolve => {
    const timerId = window.setTimeout(() => {
      saveSnapshotWaiters = saveSnapshotWaiters.filter(fn => fn !== onResolve);
      resolve(latestMapSaveSnapshot.value);
    }, Math.max(100, Number(timeoutMs) || 1500));
    const onResolve = snapshot => {
      window.clearTimeout(timerId);
      resolve(snapshot);
    };
    saveSnapshotWaiters.push(onResolve);
    requestMapSaveSnapshot(reason);
  });
}

function buildPrimaryFactionSaveData() {
  const units = Array.isArray(mapCharacterState.value?.units)
    ? mapCharacterState.value.units.map(unit => deepCloneJsonValue(unit, {}))
    : [];
  const squads = Array.isArray(mapCharacterState.value?.squads)
    ? mapCharacterState.value.squads.map(squad => deepCloneJsonValue(squad, {}))
    : [];
  const village = mapCharacterState.value?.village
    ? deepCloneJsonValue(mapCharacterState.value.village, null)
    : null;
  const sovereign = units.find(unit => !!unit?.isSovereign) || null;
  const factionId = String(
    sovereign?.id
    || selectedCharacterName.value
    || selectedRace.value
    || "faction-player"
  );
  const factionName = String(selectedRace.value || "勢力");
  return {
    factionId,
    name: factionName,
    race: String(selectedRace.value || ""),
    village,
    units,
    squads,
    selectedUnitId: String(mapCharacterState.value?.selectedUnitId || ""),
    unitMoveMode: !!mapCharacterState.value?.unitMoveMode,
    villageScale: String(mapCharacterState.value?.villageScale || "村"),
    namedLimit: Number(mapCharacterState.value?.namedLimit || 2),
    namedCount: Number(mapCharacterState.value?.namedCount || 0),
    ruleText: String(mapCharacterState.value?.ruleText || "")
  };
}

function buildSaveDataDraft() {
  const nowIso = new Date().toISOString();
  const roomId = String(activeRoomId.value || "");
  const playerSlots = Array.isArray(players.value)
    ? players.value.map((player, index) => ({
      slotId: String(player?.id || `slot-${index + 1}`),
      displayName: String(player?.name || `Player${index + 1}`),
      assignedFactionId: null
    }))
    : [];
  return {
    meta: {
      formatVersion: SAVE_FORMAT_VERSION,
      createdAt: nowIso,
      appVersion: "0.1.0"
    },
    session: {
      roomId: roomId || null,
      gameFlowStep: String(gameFlowStep.value || "idle"),
      gameSetupReady: !!gameSetupReady.value
    },
    map: deepCloneJsonValue(latestMapSaveSnapshot.value, null),
    factions: [buildPrimaryFactionSaveData()],
    systems: {
      battle: deepCloneJsonValue(currentState.value, null)
    },
    multiplayer: {
      playerSlots,
      assignmentRequired: true
    }
  };
}

async function exportGameSaveDataAsJson() {
  await requestMapSaveSnapshotAsync("export");
  return JSON.stringify(buildSaveDataDraft(), null, 2);
}

function parseImportedSaveData(jsonText) {
  const text = String(jsonText || "").trim();
  if (!text) {
    throw new Error("ロード失敗: 入力データが空です。");
  }
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("ロード失敗: JSONの形式が不正です。");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("ロード失敗: セーブデータ構造が不正です。");
  }
  if (!parsed.map || typeof parsed.map !== "object") {
    throw new Error("ロード失敗: mapデータが見つかりません。");
  }
  return parsed;
}

function applyImportedSaveData(saveData) {
  const mapSnapshot = deepCloneJsonValue(saveData?.map, null);
  const faction = Array.isArray(saveData?.factions) ? saveData.factions[0] : null;
  if (!mapSnapshot) {
    throw new Error("ロード失敗: mapスナップショットを復元できません。");
  }

  latestMapSaveSnapshot.value = mapSnapshot;
  if (faction && typeof faction === "object") {
    const race = String(faction?.race || "").trim();
    const villageName = String(faction?.village?.name || "").trim();
    const sovereign = Array.isArray(faction?.units)
      ? faction.units.find(unit => !!unit?.isSovereign) || faction.units[0]
      : null;
    const sovereignName = String(sovereign?.name || "").trim();
    if (race) selectedRace.value = race;
    if (villageName) selectedVillageName.value = villageName;
    if (sovereignName) selectedCharacterName.value = sovereignName;
  }

  if (saveData?.systems?.battle) {
    const restoredBattle = deepCloneJsonValue(saveData.systems.battle, null);
    if (restoredBattle && !activeRoomId.value) {
      localState.value = restoredBattle;
    }
  }

  gameSetupReady.value = true;
  gameFlowStep.value = "ready";
  setSessionStatus("セーブデータをロードしました。", "ok");
  characterCommand.value = {
    type: "loadSaveState",
    payload: {
      saveData,
      mapSnapshot,
      faction
    },
    nonce: `${Date.now()}-${Math.floor(Math.random() * 99999)}`
  };
}

async function importGameSaveDataFromJson(jsonText) {
  try {
    const saveData = parseImportedSaveData(jsonText);
    applyImportedSaveData(saveData);
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ロード失敗: 不明なエラー";
    setSessionStatus(reason, "error");
    return { ok: false, reason };
  }
}

function handleTestControlsChange(visible) {
  testControlsVisible.value = !!visible;
}

watch(gameOnlyMode, enabled => {
  if (typeof document === "undefined") return;
  document.body.classList.toggle("game-only-mode", !!enabled);
}, { immediate: true });

function sendCharacterCommand(type, unitId, extras = {}) {
  const cmdType = String(type || "").trim();
  const id = String(unitId || "").trim();
  if (!cmdType || !id) return;
  const payloadExtras = extras && typeof extras === "object" ? extras : {};
  characterCommand.value = {
    ...payloadExtras,
    type: cmdType,
    unitId: id,
    nonce: `${Date.now()}-${Math.floor(Math.random() * 99999)}`
  };
}

function requestPromoteUnit(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  sendCharacterCommand("promoteNamed", unitId);
}

function requestToggleUnitSquad(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  const memberIds = Array.isArray(payload?.memberIds)
    ? payload.memberIds
      .map(id => String(id || "").trim())
      .filter(Boolean)
    : [];
  sendCharacterCommand("toggleSquad", unitId, { memberIds });
}

function requestRemoveMob(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  sendCharacterCommand("removeMob", unitId);
}

function requestCreateSquad(payload) {
  const leaderId = String(payload?.leaderId || "").trim();
  if (!leaderId) return;
  const memberIds = Array.isArray(payload?.memberIds)
    ? payload.memberIds.map(id => String(id || "").trim()).filter(Boolean)
    : [];
  const squadName = String(payload?.squadName || "").trim();
  sendCharacterCommand("createSquad", leaderId, { memberIds, squadName });
}

function requestRenameSquad(payload) {
  const leaderId = String(payload?.leaderId || "").trim();
  if (!leaderId) return;
  const squadName = String(payload?.squadName || "").trim();
  if (!squadName) return;
  sendCharacterCommand("renameSquad", leaderId, { squadName });
}

function requestDissolveSquad(payload) {
  const leaderId = String(payload?.leaderId || "").trim();
  if (!leaderId) return;
  sendCharacterCommand("dissolveSquad", leaderId);
}

function requestUpdateUnitEquipment(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  const equipmentName = String(payload?.equipmentName || "").trim();
  if (!equipmentName) return;
  const rarity = String(payload?.rarity || "").trim();
  const slotKey = String(payload?.slotKey || "").trim();
  const slotIndex = Number.isFinite(Number(payload?.slotIndex)) ? Math.max(0, Math.floor(Number(payload.slotIndex))) : 0;
  sendCharacterCommand("updateEquipment", unitId, {
    equipmentName,
    rarity,
    slotKey,
    slotIndex
  });
}

function requestUpdateUnitIcon(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  const iconName = String(payload?.iconName || "").trim();
  if (!iconName) return;
  sendCharacterCommand("updateIcon", unitId, { iconName });
}

function requestLevelUnit(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  const deltaRaw = Number(payload?.delta);
  const delta = Number.isFinite(deltaRaw) ? Math.max(-5, Math.min(5, Math.floor(deltaRaw))) : 1;
  if (!delta) return;
  sendCharacterCommand("levelUnit", unitId, { delta });
}

function requestAssignSecondaryClass(payload) {
  const unitId = String(payload?.unitId || "").trim();
  if (!unitId) return;
  const secondaryClassName = String(payload?.secondaryClassName || "").trim();
  if (!secondaryClassName) return;
  sendCharacterCommand("assignSecondaryClass", unitId, { secondaryClassName });
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
      sim: showSimModal.value,
      skill: showSkillTreeModal.value,
      race: showRaceModal.value,
      class: showClassModal.value,
      characters: showCharacterStatusModal.value,
      name: showCharacterNameModal.value
    },
    playerSetup: {
      selectedRace: selectedRace.value,
      selectedClass: selectedClass.value || null,
      selectedCharacterName: selectedCharacterName.value || null,
      selectedVillageName: selectedVillageName.value || null,
      gameSetupReady: gameSetupReady.value,
      gameFlowStep: gameFlowStep.value
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
  window.request_map_save_snapshot = reason => {
    requestMapSaveSnapshot(String(reason || "manual"));
    return true;
  };
  window.export_game_save_data = () => exportGameSaveDataAsJson();
  window.import_game_save_data = jsonText => importGameSaveDataFromJson(jsonText);
});

onBeforeUnmount(() => {
  if (typeof document !== "undefined") {
    document.body.classList.remove("game-only-mode");
  }
  if (globalKeyHandler) {
    window.removeEventListener("keydown", globalKeyHandler);
  }
  if (socket.value) {
    socket.value.close();
    socket.value = null;
  }
  if (window.render_game_to_text) delete window.render_game_to_text;
  if (window.advanceTime) delete window.advanceTime;
  if (window.request_map_save_snapshot) delete window.request_map_save_snapshot;
  if (window.export_game_save_data) delete window.export_game_save_data;
  if (window.import_game_save_data) delete window.import_game_save_data;
  saveSnapshotWaiters = [];
});
</script>

<template>
  <div class="app" :class="{ 'game-only': gameOnlyMode }">
    <phaser-map-generator-panel
      :selected-race="selectedRace"
      :selected-class="selectedClass"
      :selected-character-name="selectedCharacterName"
      :selected-village-name="selectedVillageName"
      :game-setup-ready="gameSetupReady"
      :character-command="characterCommand"
      @open-modal="openModal"
      @character-state-change="handleCharacterStateChange"
      @save-snapshot="handleSaveSnapshot"
      @test-controls-change="handleTestControlsChange"
    />

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

    <skill-tree-modal
      :show="showSkillTreeModal"
      :categories="skillTreeCategories"
      @close="closeModal('skill')"
    />

    <race-select-modal
      :show="showRaceModal"
      :selected-race="selectedRace"
      @close="closeModal('race')"
      @confirm="applySelectedRace"
    />

    <class-select-modal
      :show="showClassModal"
      :selected-race="selectedRace"
      :selected-class="selectedClass"
      @close="closeModal('class')"
      @confirm="applySelectedClass"
    />

    <character-name-modal
      :show="showCharacterNameModal"
      :selected-name="selectedCharacterName"
      :selected-village-name="selectedVillageName"
      @close="closeModal('name')"
      @confirm="applyCharacterName"
    />

    <character-status-modal
      :show="showCharacterStatusModal"
      :units="mapCharacterState.units"
      :squads="mapCharacterState.squads"
      :village="mapCharacterState.village"
      :rule-text="mapCharacterState.ruleText"
      :default-selected-id="mapCharacterState.selectedUnitId"
      :test-mode="testControlsVisible"
      @promote-unit="requestPromoteUnit"
      @toggle-squad="requestToggleUnitSquad"
      @remove-mob="requestRemoveMob"
      @create-squad="requestCreateSquad"
      @rename-squad="requestRenameSquad"
      @dissolve-squad="requestDissolveSquad"
      @update-unit-equipment="requestUpdateUnitEquipment"
      @update-unit-icon="requestUpdateUnitIcon"
      @level-unit="requestLevelUnit"
      @assign-secondary-class="requestAssignSecondaryClass"
      @close="closeModal('characters')"
    />
  </div>
</template>
