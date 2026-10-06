import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const output = "output/web-game/enemy-ap";
mkdirSync(output, { recursive:true });
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1100, height:850 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.runV39EnemyTurn === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "enemy-ap");
    await new Promise(resolve => setTimeout(resolve, 350));
    const map = window.__v39FieldRuntime.mapData;
    map.grid = Array.from({ length:map.h }, () => Array(map.w).fill("平地"));
    map.heightLevelMap = Array.from({ length:map.h }, () => Array(map.w).fill(0));
    map.specialMap = [];
    map.lavaMap = [];
    const state = window.getV39GameState(), player = state.players[0];
    const target = { ...player.factionState.units[0], x:10, y:10, hp:10000, currentHp:10000, maxHp:10000,
      techniques:[], equipment:[], status:{ HP:10000, 防御:0, 精神:0, 索敵:750 }, skillLevels:{} };
    const skill = { 名前:"AP試験攻撃", 行動:"A", 威力:10, 判定:"攻撃", AP消費:30, 射程:1, 攻撃手段:"爪" };
    const enemy = { id:"test-enemy", name:"敵AP試験", level:15, x:11, y:10, hp:1000, maxHp:1000,
      ap:100, currentAp:100, maxAp:100, aggressive:true, neverFlee:true,
      aggroTargetUnitId:target.id, techniques:[{ source:skill }], status:{ 攻撃:100, 索敵:750, 移動:100 }, equipment:[] };
    const reset = enemies => window.setV39GameState({ enemies, enemyNests:[], enemySquads:[], neutralVillages:[],
      settlements:[], enemyCombatRuntime:{ pendingActionsByEnemyId:{}, lastActionTurnByEnemyId:{}, cooldownsByEnemyId:{}, decisionLogsByFactionId:{} },
      players:[{ ...player, factionState:{ ...player.factionState, villagePlacementMode:false, units:[target], squads:[] } }] });
    const originalPresentation = window.playV39EnemyTurnPresentation;
    let events = [];
    window.playV39EnemyTurnPresentation = async rows => { events = rows; return 0; };
    reset([enemy]);
    const logs = [];
    const onLog = event => { if (event.detail.enemyAction) logs.push(event.detail.summary); };
    window.addEventListener("v39:combat-log", onLog);
    const attacks = await window.runV39EnemyTurn(2);
    const attackState = window.getV39GameState();
    const attackAp = attackState.enemies[0].ap;
    const attackEvents = events.filter(event => event.type === "attack").length;
    window.removeEventListener("v39:combat-log", onLog);
    reset([{ ...enemy, techniques:[{ source:{ ...skill, AP消費:0 } }] }]);
    const free = await window.runV39EnemyTurn(3);
    const freeAttackCount = events.filter(event => event.type === "attack").length;
    reset([{ ...enemy, techniques:[{ source:{ ...skill, CT:1 } }] }]);
    await window.runV39EnemyTurn(4);
    const cooldownAttackCount = events.filter(event => event.type === "attack").length;
    reset([{ ...enemy, ap:20, currentAp:20 }]);
    await window.runV39EnemyTurn(5);
    const insufficientAttackCount = events.filter(event => event.type === "attack").length;
    reset([{ ...enemy, techniques:[{ source:{ ...skill, 待機:1 } }] }]);
    await window.runV39EnemyTurn(6);
    const pendingCount = Object.keys(window.getV39GameState().enemyCombatRuntime.pendingActionsByEnemyId).length;
    const WorkerClass = window.Worker;
    reset([enemy]);
    window.Worker = undefined;
    const fallback = await window.runV39EnemyTurn(7);
    const fallbackAp = window.getV39GameState().enemies[0].ap;
    window.Worker = WorkerClass;
    reset([{ ...enemy, hp:0, state:"死亡" }]);
    await window.runV39EnemyTurn(8);
    const deadActions = events.length;
    reset([{ ...enemy, aggressive:false, aggroTargetUnitId:"", techniques:[], x:20, y:15 }]);
    const roaming = await window.runV39EnemyTurn(9);
    const moves = events.filter(event => event.type === "move");
    const moveAp = window.getV39GameState().enemies[0].ap;
    window.playV39EnemyTurnPresentation = originalPresentation;
    const vision = window.isV39TileInCurrentVision, detected = window.isV39EntityDetected;
    window.isV39TileInCurrentVision = () => true;
    window.isV39EntityDetected = () => true;
    window.refreshV39MapEntities();
    const marker = window.getV39MapEntityMarker(enemy.id);
    const scene = marker.scene, addTween = scene.tweens.add.bind(scene.tweens);
    let tweenCount = 0;
    scene.tweens.add = config => { if (config.targets === marker) tweenCount++; return addTween(config); };
    const shown = await originalPresentation(moves);
    window.isV39TileInCurrentVision = () => false;
    const hidden = await originalPresentation(moves);
    scene.tweens.add = addTween;
    window.isV39TileInCurrentVision = vision;
    window.isV39EntityDetected = detected;
    return { attacks, attackAp, attackEvents, logs, free, freeAttackCount, cooldownAttackCount,
      insufficientAttackCount, pendingCount, fallback, fallbackAp, deadActions, roaming, moveAp,
      moveCount:moves.length, shown, hidden, tweenCount,
      aiNames:Object.values(attackState.enemyCombatRuntime.decisionLogsByFactionId).flat().map(log => log.actorName) };
  });
  assert.equal(report.attackAp, 70, JSON.stringify(report));
  assert.equal(report.attackEvents, 1);
  assert.ok(report.logs.every(log => log.includes("Lv15")));
  assert.ok(report.aiNames.every(name => name.includes("Lv15")));
  assert.equal(report.freeAttackCount, 1);
  assert.equal(report.cooldownAttackCount, 1);
  assert.equal(report.insufficientAttackCount, 0);
  assert.equal(report.pendingCount, 1);
  assert.ok(report.fallback.fallbackUsed);
  assert.equal(report.fallbackAp, 70);
  assert.equal(report.deadActions, 0);
  assert.ok(report.moveCount > 1 && report.moveAp === 0, JSON.stringify(report));
  assert.equal(report.shown, report.moveCount);
  assert.equal(report.tweenCount, report.moveCount);
  assert.equal(report.hidden, 0);
  assert.deepEqual(errors, []);
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.screenshot({ path:`${output}/screen.png` });
  console.log(JSON.stringify({ ...report, errors }, null, 2));
} finally {
  await browser.close();
}
