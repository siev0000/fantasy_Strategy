(function initPhaserVueApp() {
  const { createApp } = window.Vue || {};
  const PhaserLib = window.Phaser;
  if (!createApp || !PhaserLib) return;

  const GRID_WIDTH = 10;
  const GRID_HEIGHT = 8;
  const TILE_SIZE = 64;
  const BOARD_WIDTH = GRID_WIDTH * TILE_SIZE;
  const BOARD_HEIGHT = GRID_HEIGHT * TILE_SIZE;

  function createInitialUnits() {
    return [
      {
        id: "p-knight",
        side: "player",
        name: "Knight",
        x: 1,
        y: 6,
        hp: 24,
        maxHp: 24,
        atk: 8,
        move: 3,
        range: 1,
        acted: false,
        alive: true
      },
      {
        id: "p-archer",
        side: "player",
        name: "Archer",
        x: 2,
        y: 6,
        hp: 18,
        maxHp: 18,
        atk: 6,
        move: 2,
        range: 3,
        acted: false,
        alive: true
      },
      {
        id: "e-raider",
        side: "enemy",
        name: "Raider",
        x: 7,
        y: 1,
        hp: 20,
        maxHp: 20,
        atk: 7,
        move: 2,
        range: 1,
        acted: false,
        alive: true
      },
      {
        id: "e-mage",
        side: "enemy",
        name: "Mage",
        x: 8,
        y: 2,
        hp: 16,
        maxHp: 16,
        atk: 5,
        move: 2,
        range: 2,
        acted: false,
        alive: true
      }
    ];
  }

  function createInitialState() {
    return {
      turn: 1,
      side: "player",
      mode: "playing",
      message: "Select a player unit.",
      winner: "",
      units: createInitialUnits()
    };
  }

  function inBounds(x, y) {
    return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
  }

  function manhattan(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  function unitLabel(unit) {
    return unit.name.slice(0, 1);
  }

  function sideColor(side) {
    return side === "player" ? 0x3aa3ff : 0xff5d5d;
  }

  function sideStroke(side) {
    return side === "player" ? 0xc9e7ff : 0xffd0d0;
  }

  function nextStepToward(unit, target) {
    const candidates = [];
    if (target.x !== unit.x) {
      candidates.push({ x: unit.x + Math.sign(target.x - unit.x), y: unit.y });
    }
    if (target.y !== unit.y) {
      candidates.push({ x: unit.x, y: unit.y + Math.sign(target.y - unit.y) });
    }
    return candidates;
  }

  const vm = createApp({
    data() {
      return {
        state: createInitialState(),
        selectedUnitId: "",
        hoveredTile: null,
        logs: ["Battle started. Player turn."],
        bridge: null
      };
    },
    computed: {
      selectedUnit() {
        return this.getUnitById(this.selectedUnitId);
      },
      playerUnits() {
        return this.state.units.filter(unit => unit.side === "player");
      },
      enemyUnits() {
        return this.state.units.filter(unit => unit.side === "enemy");
      }
    },
    methods: {
      setBridge(bridge) {
        this.bridge = bridge;
        this.refreshBoard();
      },
      refreshBoard() {
        if (this.bridge && typeof this.bridge.render === "function") {
          this.bridge.render();
        }
      },
      addLog(text) {
        this.logs.unshift(text);
        if (this.logs.length > 18) {
          this.logs.length = 18;
        }
      },
      getUnitById(id) {
        if (!id) return null;
        return this.state.units.find(unit => unit.id === id) || null;
      },
      getUnitAt(x, y) {
        return this.state.units.find(unit => unit.alive && unit.x === x && unit.y === y) || null;
      },
      aliveUnits(side) {
        return this.state.units.filter(unit => unit.side === side && unit.alive);
      },
      selectUnit(unit) {
        if (!unit || !unit.alive) return;
        if (this.state.mode !== "playing" || this.state.side !== "player") return;
        if (unit.side !== "player" || unit.acted) return;
        this.selectedUnitId = unit.id;
        this.state.message = `${unit.name} selected.`;
        this.refreshBoard();
      },
      resetGame() {
        this.state = createInitialState();
        this.logs = ["Battle restarted."];
        this.selectedUnitId = "";
        this.hoveredTile = null;
        this.refreshBoard();
      },
      moveUnit(unit, x, y) {
        unit.x = x;
        unit.y = y;
        unit.acted = true;
        this.selectedUnitId = "";
      },
      damage(target, amount) {
        target.hp = Math.max(0, target.hp - amount);
        if (target.hp === 0) {
          target.alive = false;
        }
      },
      attack(attacker, target) {
        this.damage(target, attacker.atk);
        attacker.acted = true;
        this.selectedUnitId = "";
        this.addLog(`${attacker.name} hits ${target.name} for ${attacker.atk}.`);
        if (!target.alive) {
          this.addLog(`${target.name} was defeated.`);
        }
        this.checkBattleEnd();
      },
      checkBattleEnd() {
        if (this.state.mode !== "playing") return true;
        const hasPlayer = this.aliveUnits("player").length > 0;
        const hasEnemy = this.aliveUnits("enemy").length > 0;
        if (!hasPlayer || !hasEnemy) {
          this.state.mode = "ended";
          this.state.winner = hasPlayer ? "player" : "enemy";
          this.state.message = hasPlayer ? "Victory." : "Defeat.";
          this.addLog(hasPlayer ? "All enemies defeated." : "All player units defeated.");
          return true;
        }
        return false;
      },
      handleTileClick(x, y) {
        if (!inBounds(x, y)) return;
        if (this.state.mode !== "playing" || this.state.side !== "player") return;

        const clickedUnit = this.getUnitAt(x, y);
        const selected = this.selectedUnit;

        if (clickedUnit && clickedUnit.side === "player") {
          this.selectUnit(clickedUnit);
          return;
        }

        if (!selected) {
          this.state.message = "Select one of your units first.";
          this.refreshBoard();
          return;
        }

        if (selected.acted) {
          this.state.message = "That unit already acted.";
          this.selectedUnitId = "";
          this.refreshBoard();
          return;
        }

        if (clickedUnit && clickedUnit.side === "enemy") {
          const distance = manhattan(selected.x, selected.y, clickedUnit.x, clickedUnit.y);
          if (distance <= selected.range) {
            this.attack(selected, clickedUnit);
            this.state.message = "Attack complete.";
          } else {
            this.state.message = "Target is out of range.";
          }
          this.refreshBoard();
          return;
        }

        if (clickedUnit) {
          this.state.message = "Tile is occupied.";
          this.refreshBoard();
          return;
        }

        const moveDistance = manhattan(selected.x, selected.y, x, y);
        if (moveDistance > selected.move) {
          this.state.message = "Move target is too far.";
          this.refreshBoard();
          return;
        }

        this.moveUnit(selected, x, y);
        this.addLog(`${selected.name} moved to (${x}, ${y}).`);
        this.state.message = "Move complete.";
        this.refreshBoard();
      },
      firstTargetInRange(attacker, targets) {
        const ordered = [...targets].sort((a, b) => {
          const da = manhattan(attacker.x, attacker.y, a.x, a.y);
          const db = manhattan(attacker.x, attacker.y, b.x, b.y);
          return da - db;
        });
        return ordered.find(target => manhattan(attacker.x, attacker.y, target.x, target.y) <= attacker.range) || null;
      },
      nearestTarget(unit, targets) {
        if (targets.length === 0) return null;
        return [...targets].sort((a, b) => {
          const da = manhattan(unit.x, unit.y, a.x, a.y);
          const db = manhattan(unit.x, unit.y, b.x, b.y);
          return da - db;
        })[0];
      },
      moveEnemyToward(enemy, target) {
        let moved = false;
        for (let step = 0; step < enemy.move; step += 1) {
          const options = nextStepToward(enemy, target);
          const candidate = options.find(tile => {
            if (!inBounds(tile.x, tile.y)) return false;
            const occupied = this.getUnitAt(tile.x, tile.y);
            return !occupied;
          });
          if (!candidate) break;
          enemy.x = candidate.x;
          enemy.y = candidate.y;
          moved = true;
        }
        return moved;
      },
      runEnemyTurn() {
        const enemies = this.aliveUnits("enemy");
        for (let i = 0; i < enemies.length; i += 1) {
          const enemy = enemies[i];
          const players = this.aliveUnits("player");
          if (players.length === 0) break;

          let target = this.firstTargetInRange(enemy, players);
          if (!target) {
            target = this.nearestTarget(enemy, players);
            if (target) {
              const moved = this.moveEnemyToward(enemy, target);
              if (moved) {
                this.addLog(`${enemy.name} advanced.`);
              }
            }
          }

          const attackTarget = this.firstTargetInRange(enemy, this.aliveUnits("player"));
          if (attackTarget) {
            this.damage(attackTarget, enemy.atk);
            this.addLog(`${enemy.name} hits ${attackTarget.name} for ${enemy.atk}.`);
            if (!attackTarget.alive) {
              this.addLog(`${attackTarget.name} was defeated.`);
            }
            if (this.checkBattleEnd()) break;
          }
        }
      },
      endPlayerTurn() {
        if (this.state.mode !== "playing" || this.state.side !== "player") return;

        this.selectedUnitId = "";
        this.state.side = "enemy";
        this.state.message = "Enemy phase.";
        this.refreshBoard();

        this.runEnemyTurn();
        if (this.state.mode === "ended") {
          this.refreshBoard();
          return;
        }

        this.state.turn += 1;
        this.state.side = "player";
        this.state.units.forEach(unit => {
          unit.acted = false;
        });
        this.state.message = "Player phase.";
        this.addLog(`Turn ${this.state.turn} begins.`);
        this.refreshBoard();
      },
      onHoverTile(x, y) {
        if (!inBounds(x, y)) {
          this.hoveredTile = null;
        } else {
          this.hoveredTile = { x, y };
        }
        this.refreshBoard();
      },
      createTextState() {
        const payload = {
          mode: this.state.mode,
          turn: this.state.turn,
          side: this.state.side,
          winner: this.state.winner || null,
          selectedUnitId: this.selectedUnitId || null,
          coordinateSystem: {
            origin: "top-left",
            xDirection: "right",
            yDirection: "down"
          },
          units: this.state.units
            .filter(unit => unit.alive)
            .map(unit => ({
              id: unit.id,
              side: unit.side,
              name: unit.name,
              x: unit.x,
              y: unit.y,
              hp: unit.hp,
              atk: unit.atk,
              move: unit.move,
              range: unit.range,
              acted: unit.acted
            }))
        };
        return JSON.stringify(payload);
      }
    }
  }).mount("#phaser-vue-app");

  function createPhaserBridge(appVm) {
    const scene = new PhaserLib.Scene("BoardScene");
    let baseGrid = null;
    let highlights = null;
    let unitsLayer = null;
    let labels = [];

    function clearLabels() {
      labels.forEach(label => label.destroy());
      labels = [];
    }

    function tileToPixel(tile) {
      return {
        x: tile.x * TILE_SIZE,
        y: tile.y * TILE_SIZE
      };
    }

    function drawBaseGrid(graphics) {
      graphics.clear();
      graphics.fillStyle(0x131d2a, 1);
      graphics.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
      graphics.lineStyle(1, 0x32465e, 1);
      for (let x = 0; x <= GRID_WIDTH; x += 1) {
        graphics.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, BOARD_HEIGHT);
      }
      for (let y = 0; y <= GRID_HEIGHT; y += 1) {
        graphics.lineBetween(0, y * TILE_SIZE, BOARD_WIDTH, y * TILE_SIZE);
      }
    }

    function drawRanges(graphics, selected) {
      if (!selected || !selected.alive || selected.side !== "player" || selected.acted) return;

      graphics.fillStyle(0x2f7bff, 0.16);
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const distance = manhattan(selected.x, selected.y, x, y);
          const occupied = appVm.getUnitAt(x, y);
          if (distance > 0 && distance <= selected.move && !occupied) {
            graphics.fillRect(x * TILE_SIZE + 2, y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
          }
        }
      }

      graphics.fillStyle(0xff7066, 0.16);
      for (let y = 0; y < GRID_HEIGHT; y += 1) {
        for (let x = 0; x < GRID_WIDTH; x += 1) {
          const distance = manhattan(selected.x, selected.y, x, y);
          if (distance > 0 && distance <= selected.range) {
            graphics.fillRect(x * TILE_SIZE + 10, y * TILE_SIZE + 10, TILE_SIZE - 20, TILE_SIZE - 20);
          }
        }
      }
    }

    function drawHighlights(graphics) {
      graphics.clear();
      const selected = appVm.selectedUnit;
      drawRanges(graphics, selected);

      if (appVm.hoveredTile) {
        const h = appVm.hoveredTile;
        graphics.lineStyle(2, 0xffffff, 0.7);
        graphics.strokeRect(h.x * TILE_SIZE + 2, h.y * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
      }

      if (selected && selected.alive) {
        graphics.lineStyle(3, 0x8ae1ff, 0.95);
        graphics.strokeRect(selected.x * TILE_SIZE + 3, selected.y * TILE_SIZE + 3, TILE_SIZE - 6, TILE_SIZE - 6);
      }
    }

    function drawUnits(graphics, sceneRef) {
      graphics.clear();
      clearLabels();
      appVm.state.units.forEach(unit => {
        if (!unit.alive) return;
        const pixel = tileToPixel(unit);
        graphics.fillStyle(sideColor(unit.side), 0.92);
        graphics.fillRect(pixel.x + 8, pixel.y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        graphics.lineStyle(2, sideStroke(unit.side), 1);
        graphics.strokeRect(pixel.x + 8, pixel.y + 8, TILE_SIZE - 16, TILE_SIZE - 16);
        const nameText = sceneRef.add.text(pixel.x + 13, pixel.y + 11, unitLabel(unit), {
          fontFamily: "Arial",
          fontSize: "20px",
          color: "#ffffff"
        });
        const hpText = sceneRef.add.text(pixel.x + 12, pixel.y + 37, String(unit.hp), {
          fontFamily: "Arial",
          fontSize: "15px",
          color: "#ffffff"
        });
        labels.push(nameText, hpText);
      });
    }

    function renderBoard() {
      if (!baseGrid || !highlights || !unitsLayer) return;
      drawBaseGrid(baseGrid);
      drawHighlights(highlights);
      drawUnits(unitsLayer, scene);
    }

    scene.preload = function preload() {};

    scene.create = function create() {
      baseGrid = this.add.graphics();
      highlights = this.add.graphics();
      unitsLayer = this.add.graphics();

      this.input.on("pointerdown", pointer => {
        const tileX = Math.floor(pointer.x / TILE_SIZE);
        const tileY = Math.floor(pointer.y / TILE_SIZE);
        appVm.handleTileClick(tileX, tileY);
      });

      this.input.on("pointermove", pointer => {
        const tileX = Math.floor(pointer.x / TILE_SIZE);
        const tileY = Math.floor(pointer.y / TILE_SIZE);
        appVm.onHoverTile(tileX, tileY);
      });

      this.input.on("pointerout", () => {
        appVm.onHoverTile(-1, -1);
      });

      appVm.setBridge({ render: renderBoard });
      renderBoard();
    };

    scene.events.on("shutdown", () => {
      clearLabels();
    });

    new PhaserLib.Game({
      type: PhaserLib.AUTO,
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      parent: "phaser-game-root",
      scene,
      backgroundColor: "#0d131b",
      fps: {
        target: 60,
        forceSetTimeOut: true
      }
    });
  }

  createPhaserBridge(vm);

  window.render_game_to_text = function renderGameToText() {
    return vm.createTextState();
  };

  window.advanceTime = function advanceTime(ms) {
    vm.refreshBoard();
    return ms;
  };
})();
