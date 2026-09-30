import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.spawnV39VictoryLandmarkGuards === "function" && typeof window.runV39FactionAiTurn === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "victory-guard-check");
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const beforePlacement = window.getV39GameState();
    const initialPlayer = beforePlacement.players.find(row => row.id === beforePlacement.activePlayerId);
    window.setV39GameState({ players:beforePlacement.players.map(row => row.id !== initialPlayer.id ? row : ({
      ...row,
      factionState:{ ...row.factionState, settlements:[{ id:"victory-guard-start", settlementId:"victory-guard-start", placed:true, x:2, y:2 }], selectedSettlementId:"victory-guard-start" }
    })) }, { reason:"victory-guard-test-initial-placement" });
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", { detail:{ mapData:window.__v39FieldRuntime?.mapData } }));
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const before = window.getV39GameState();
    const landmark = Object.values(before.victoryLandmarksByTile || {})[0];
    if (!landmark) throw new Error("勝利対象土地がありません");
    const spawned = before.enemies?.some(row => row?.victoryLandmarkKey === landmark.key)
      ? { reports:[{ landmarkKey:landmark.key }] }
      : window.spawnV39VictoryLandmarkGuards();
    if (!spawned?.reports?.length) throw new Error(`守護編成を生成できません: ${JSON.stringify(spawned)}`);
    const state = window.getV39GameState();
    const nest = state.enemyNests.find(row => row?.victoryLandmarkKey === landmark.key);
    const guards = state.enemies.filter(row => row?.victoryLandmarkKey === landmark.key);
    if (!nest || !guards.some(row => row?.strongEnemy === true) || guards.length < 2) {
      throw new Error(`守護巣・ボス・配下が既存敵状態へ保存されません: ${JSON.stringify({ nest, guards:guards.map(row => ({ id:row.id, strongEnemy:row.strongEnemy, strongMinion:row.strongMinion })) })}`);
    }
    const player = state.players.find(row => row.isPlayer !== false);
    const unit = player?.factionState?.units?.[0];
    const players = state.players.map(row => row.id !== player.id ? row : ({
      ...row,
      factionState:{ ...row.factionState, units:row.factionState.units.map(candidate => candidate.id === unit.id ? { ...candidate, x:landmark.x, y:landmark.y, surveyTask:{ key:landmark.key, x:landmark.x, y:landmark.y } } : candidate) }
    }));
    window.setV39GameState({ players, dangerPercentByTile:{ ...state.dangerPercentByTile, [landmark.key]:0 } }, { reason:"victory-guard-claim-check" });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:1 } }));
    const afterSurvey = window.getV39GameState();
    if (afterSurvey.territoryOwnerByTile?.[landmark.key]) throw new Error("守護ボスが生存している勝利対象土地を領土化できます");

    const added = window.addV39TestFaction("npc");
    if (!added?.ok) throw new Error("NPC勢力を追加できません");
    const boss = guards.find(row => row.strongEnemy === true);
    const neighbor = window.__v39FieldRuntime.mapData.worldWrapEnabled
      ? { x:(Number(boss.x) + 1) % window.__v39FieldRuntime.mapData.w, y:Number(boss.y) }
      : { x:Math.min(window.__v39FieldRuntime.mapData.w - 1, Number(boss.x) + 1), y:Number(boss.y) };
    const combatBase = window.getV39GameState();
    const combatPlayers = combatBase.players.map(row => {
      if (row.id === player.id) return {
        ...row,
        factionState:{ ...row.factionState, units:row.factionState.units.map(unit => ({ ...unit, x:0, y:0 })) }
      };
      if (row.id !== added.player.id) return row;
      return ({
      ...row,
      factionState:{
        ...row.factionState,
        units:row.factionState.units.slice(0, 1).map(unit => ({ ...unit, x:neighbor.x, y:neighbor.y, ap:100, currentAp:100, maxAp:100 })),
        exploration:{ ...row.factionState.exploration, discoveredFeaturesByTile:{ [landmark.key]:{ ...landmark } } },
        aiState:{ ...row.factionState.aiState, lastProcessedTurn:0 }
      }
      });
    });
    const combatPrepared = { ...combatBase, players:combatPlayers };
    const npcResult = window.runV39FactionAiTurn(combatPrepared, 2, window.__v39FieldRuntime.mapData);
    const combatAction = npcResult.reports.find(row => row.playerId === added.player.id)?.combatActions?.find(action => action.targetType === "victory-guard");
    if (!combatAction || combatAction.targetUnitId !== boss.id) throw new Error(`NPCが守護ボスを攻撃対象にしません: ${JSON.stringify(combatAction)}`);
    window.setV39GameState({ players:npcResult.state.players, enemies:npcResult.state.enemies, enemyNests:npcResult.state.enemyNests, enemySquads:npcResult.state.enemySquads }, { reason:"victory-guard-npc-combat" });
    const beforeAp = window.getV39GameState().players.find(row => row.id === added.player.id)?.factionState?.units?.[0]?.ap;
    const resolved = window.executeV39FactionCombatAction(combatAction);
    const afterAp = window.getV39GameState().players.find(row => row.id === added.player.id)?.factionState?.units?.[0]?.ap;
    if (resolved !== true || !(Number(afterAp) < Number(beforeAp))) throw new Error(`NPCの守護攻撃が既存戦闘へ接続されません: ${JSON.stringify({ resolved, beforeAp, afterAp, combatAction, attacker:window.getV39GameState().players.find(row => row.id === added.player.id)?.factionState?.units?.[0], target:window.getV39GameState().enemies.find(row => row.id === boss.id) })}`);
    const afterCombat = window.getV39GameState();
    const clearedPlayers = afterCombat.players.map(row => row.id !== added.player.id ? row : ({
      ...row,
      factionState:{ ...row.factionState, units:row.factionState.units.map(unit => {
        const { surveyTask, ...rest } = unit;
        return { ...rest, x:landmark.x, y:landmark.y };
      }) }
    }));
    const clearedEnemies = afterCombat.enemies.map(enemy => enemy.id !== boss.id ? enemy : ({ ...enemy, hp:0, currentHp:0, state:"死亡" }));
    window.setV39GameState({ players:clearedPlayers, enemies:clearedEnemies, dangerPercentByTile:{ ...afterCombat.dangerPercentByTile, [landmark.key]:0 } }, { reason:"victory-guard-cleared" });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:3 } }));
    const claimedState = window.getV39GameState();
    const occupiedTileKeys = landmark.occupiedTileKeys?.length ? landmark.occupiedTileKeys : [landmark.key];
    if (!occupiedTileKeys.every(key => claimedState.territoryOwnerByTile?.[key] === added.player.id)) {
      throw new Error("守護ボス撃破後、勝利対象の大都市相当7マスを領土化できません");
    }
    return { landmark:landmark.name, guardCount:guards.length, nestId:nest.id, territoryRadius:nest.territoryRadius, guardAttack:combatAction.skillRow?.名前, claimed:true };
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
