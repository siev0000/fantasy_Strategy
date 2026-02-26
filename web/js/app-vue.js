(function initVueApp() {
  const { createApp } = window.Vue || {};
  if (!createApp) return;

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

  createApp({
    components: {
      AppHeader: window.FSComponents?.AppHeader,
      MapGeneratorPanel: window.FSComponents?.MapGeneratorPanel,
      MenuPanel: window.FSComponents?.MenuPanel,
      RoomModal: window.FSComponents?.RoomModal,
      BattleModal: window.FSComponents?.BattleModal,
      SimulatorModal: window.FSComponents?.SimulatorModal
    },
    data() {
      return {
        socket: null,
        socketReady: false,
        showRoomModal: false,
        showBattleModal: false,
        showSimModal: false,
        localState: createInitialBattleState(),
        roomState: null,
        activeRoomId: "",
        roomIdInput: "ROOM1",
        playerNameInput: "Player",
        players: [],
        sessionStatusText: "ローカルモード（1人プレイ）",
        sessionStatusClass: "",
        globalKeyHandler: null,
        sim: {
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
        },
        simResult: "ここに計算結果を表示"
      };
    },
    computed: {
      currentState() {
        if (this.activeRoomId) return this.roomState || this.localState;
        return this.localState;
      },
      actionDisabled() {
        const state = this.currentState;
        const roomLocked = this.activeRoomId && !this.socketReady;
        return state.ended || state.activeSide !== "ally" || roomLocked;
      },
      nextDisabled() {
        const state = this.currentState;
        const roomLocked = this.activeRoomId && !this.socketReady;
        return state.ended || roomLocked;
      },
      resetDisabled() {
        return this.activeRoomId && !this.socketReady;
      },
      playersLabel() {
        if (!this.activeRoomId) return "-";
        return this.players.map(p => p.name).join(", ") || "-";
      }
    },
    methods: {
      openModal(kind) {
        this.showRoomModal = kind === "room";
        this.showBattleModal = kind === "battle";
        this.showSimModal = kind === "sim";
      },
      closeModal(kind) {
        if (kind === "room") this.showRoomModal = false;
        if (kind === "battle") this.showBattleModal = false;
        if (kind === "sim") this.showSimModal = false;
      },
      closeAllModals() {
        this.showRoomModal = false;
        this.showBattleModal = false;
        this.showSimModal = false;
      },
      setSessionStatus(text, cls) {
        this.sessionStatusText = text;
        this.sessionStatusClass = cls || "";
      },
      runAction(action) {
        if (this.activeRoomId) {
          if (!this.socket || !this.socketReady) return;
          this.socket.emit("battle:action", { roomId: this.activeRoomId, action });
          return;
        }
        this.localState = applyBattleAction(this.localState, action);
      },
      createRoom() {
        if (!this.socket || !this.socketReady) return;
        const playerName = normalizePlayerName(this.playerNameInput);
        this.playerNameInput = playerName;
        this.setSessionStatus("ルーム作成中...", "warn");
        this.socket.emit("room:create", { playerName });
      },
      joinRoom() {
        if (!this.socket || !this.socketReady) return;
        const roomId = normalizeRoomId(this.roomIdInput);
        const playerName = normalizePlayerName(this.playerNameInput);
        if (!roomId) {
          this.setSessionStatus("ルームIDを入力してください。", "error");
          return;
        }
        this.roomIdInput = roomId;
        this.playerNameInput = playerName;
        this.setSessionStatus(`ルーム ${roomId} に接続中...`, "warn");
        this.socket.emit("room:join", { roomId, playerName });
      },
      leaveRoom() {
        if (!this.activeRoomId) return;
        if (this.socket) this.socket.emit("room:leave");
        this.activeRoomId = "";
        this.roomState = null;
        this.players = [];
        this.setSessionStatus("ローカルモード（1人プレイ）");
      },
      runSimulatorTurn() {
        const terrainDifficulty = clamp(Number(this.sim.terrainDifficulty) || 1, 1, 5);
        const developmentPower = Math.max(1, Number(this.sim.developmentPower) || 10);
        const participants = clamp(Number(this.sim.participants) || 1, 1, 4);
        const currentProgress = clamp(Number(this.sim.currentProgress) || 0, 0, 100);
        const govBonus = Number(this.sim.govBonus) || 0;
        const facilityBonus = Number(this.sim.facilityBonus) || 0;
        const policyBonus = Number(this.sim.policyBonus) || 0;
        const monsterRisk = clamp(Number(this.sim.monsterRisk) || 0, 0, 100);
        const foodBalance = Number(this.sim.foodBalance);
        const dissatisfaction = clamp(Number(this.sim.dissatisfaction) || 0, 0, 100);
        const jobsFilled = Number(this.sim.jobsFilled) === 1;
        const popOver = Number(this.sim.popOver) === 1;
        const defenseLow = Number(this.sim.defenseLow) === 1;

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

        this.simResult = [
          `開拓進行: ${newProgress.toFixed(1)}%（+${progressGainPercent.toFixed(1)}%）`,
          `補正倍率: ${multiplier.toFixed(2)}倍（加算合計 ${sumPct}% を適用、0.25〜5.00でクランプ）`,
          `残りターン目安: ${estimatedTurnsLeft}`,
          `不満度: ${dissatisfaction} -> ${newDiss}（変化 ${dissDelta >= 0 ? "+" : ""}${dissDelta}）`,
          `不満段階: ${dissTier}`,
          `治安変化（仮）: ${securityDelta >= 0 ? "+" : ""}${securityDelta}`,
          `災害判定: ${disasterResults.length ? disasterResults.join(" / ") : "発生なし"}`
        ].join("\n");

        this.sim.currentProgress = Number(newProgress.toFixed(1));
        this.sim.dissatisfaction = newDiss;
      },
      renderGameStateToText() {
        const state = this.currentState || {};
        const mapSize = document.getElementById("mapSizeInfo")?.textContent || "";
        const mapCenter = document.getElementById("mapCenterInfo")?.textContent || "";
        const mapClick = document.getElementById("mapClickInfo")?.textContent || "";
        const mapStats = document.getElementById("mapStats")?.textContent || "";
        const payload = {
          mode: "menu",
          activeRoomId: this.activeRoomId || null,
          modal: {
            room: this.showRoomModal,
            battle: this.showBattleModal,
            sim: this.showSimModal
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
    },
    mounted() {
      this.globalKeyHandler = event => {
        if (event.key === "Escape") this.closeAllModals();
      };
      window.addEventListener("keydown", this.globalKeyHandler);

      if (typeof window.io === "function") {
        this.socket = window.io();
        this.socket.on("connect", () => {
          this.socketReady = true;
          if (!this.activeRoomId) this.setSessionStatus("ローカルモード（1人プレイ）");
        });
        this.socket.on("disconnect", () => {
          this.socketReady = false;
          if (this.activeRoomId) this.setSessionStatus("通信切断。再接続待機中...", "warn");
        });
        this.socket.on("room:error", payload => {
          this.setSessionStatus(payload?.message || "通信エラーが発生しました。", "error");
        });
        this.socket.on("room:created", payload => {
          if (!payload?.roomId) return;
          this.roomIdInput = payload.roomId;
          this.activeRoomId = payload.roomId;
          this.setSessionStatus(`ルーム ${payload.roomId} を作成`, "ok");
        });
        this.socket.on("room:players", payload => {
          if (!payload || payload.roomId !== this.activeRoomId) return;
          this.players = Array.isArray(payload.players) ? payload.players : [];
        });
        this.socket.on("room:state", payload => {
          if (!payload?.state) return;
          this.activeRoomId = payload.roomId || this.activeRoomId;
          this.roomState = payload.state;
          this.players = Array.isArray(payload.players) ? payload.players : this.players;
          this.setSessionStatus(`ルーム ${this.activeRoomId} 参加中`, "ok");
        });
        this.socket.on("room:left", () => {
          this.activeRoomId = "";
          this.roomState = null;
          this.players = [];
          this.setSessionStatus("ローカルモード（1人プレイ）");
        });
        this.socket.on("dev:reload", () => {
          window.location.reload();
        });
      } else {
        this.setSessionStatus("Socket.IOに接続できないためローカル専用です。", "warn");
      }

      window.render_game_to_text = () => this.renderGameStateToText();
      window.advanceTime = ms => ms;
    },
    beforeUnmount() {
      if (this.globalKeyHandler) {
        window.removeEventListener("keydown", this.globalKeyHandler);
      }
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      if (window.render_game_to_text) delete window.render_game_to_text;
      if (window.advanceTime) delete window.advanceTime;
    }
  }).mount("#app");
})();
