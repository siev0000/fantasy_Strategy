import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/combat-visibility", { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil: "networkidle" });
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button", { name: "探索ゲーム", exact: true }).click();
  await page.getByRole("button", { name: "探索開始", exact: true }).click();
  await page.waitForTimeout(700);
  const report = await page.evaluate(async () => {
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const pause = () => new Promise(resolve => setTimeout(resolve, 350));
    const map = window.__v39FieldRuntime.mapData;
    map.grid = map.grid.map(row => row.map(() => "洞窟"));
    map.heightLevelMap = map.grid.map(row => row.map(() => 0));
    map.specialMap = []; map.lavaMap = [];
    const state = window.getV39GameState(), player = state.players[0];
    const actor = { ...player.factionState.units[0], x: 10, y: 10,
      hp: 10000, maxHp: 10000, ap: 100, currentAp: 100,
      skillLevels: { 索敵: 0, 隠密: 0 }, status: { 攻撃: 100, 防御: 0, 索敵: 0, 隠密: 0 }, scoutRange: 0, 索敵: 0 };
    const enemy = { id: "visibility-target", name: "露見試験対象", x: 13, y: 10,
      hp: 10000, currentHp: 10000, maxHp: 10000, ap: 100, currentAp: 100,
      skillLevels: { 隠密: 90, 索敵: 300 }, status: { 攻撃: 100, 防御: 0, 隠密: 90 }, techniques: [], equipment: [] };
    window.__v39SuppressCombatEffects = true;
    await window.setV39TestMode(false);
    window.setV39GameState({ testMode: false, enemies: [enemy], enemyNests: [], enemySquads: [], neutralVillages: [], settlements: [],
      players: [{ ...player, factionState: { ...player.factionState, units: [actor], villages: [], selectedUnitId: actor.id, villagePlacementMode: false, combatRuntime: {} } }] });
    window.renderV39Visibility(); await pause();
    const before = { units: window.getV39ActiveFactionState().units.map(row => ({id:row.id, x:row.x, y:row.y, skillLevels:row.skillLevels, status:row.status})), inspection: window.inspectV39PlayerDetectionForEnemy(enemy) };
    check(!window.isV39EntityDetected(enemy), "stealthy enemy initially hidden");
    const skillRow = { 名前: "露見射撃", 行動: "A", 全威力: 1, 判定: "攻撃", 攻撃手段: "弓", 射程: 30, AP消費: 1 };
    check(window.executeV39EnemyCombatAction({ enemyId: enemy.id, targetUnitId: actor.id, skillRow }), "enemy attack succeeds");
    window.renderV39Visibility(); await pause();
    const updated = window.getV39GameState().enemies.find(row => row.id === enemy.id);
    const inspection = window.inspectV39PlayerDetectionForEnemy(updated);
    check(updated.hp > 0, "enemy data remains alive");
    check(window.isV39EntityDetected(updated), `attacker must remain visible: ${JSON.stringify(inspection)}`);
    check(!!window.getV39MapEntityMarker(enemy.id), "exposed enemy marker drawn");
    check(window.executeV39FactionCombatAction({ playerId: player.id, attackerId: actor.id, targetUnitId: enemy.id, skillRow: { ...skillRow, 名前: "被攻撃露見" } }), "player attack succeeds");
    window.renderV39Visibility(); await pause();
    check(window.isV39EntityDetected(window.getV39GameState().enemies[0]), "direct target remains visible");
    const d = await import("/src/lib/v39-detection-rules.js");
    check(d.resolveEffectiveScoutAtDistance(50, 3) === 0, "distance decay stops at zero");
    check(!d.isDetectedByScout({ scout: 50, stealth: 1, distance: 3 }), "stealth still prevents detection");
    check(!d.isDetectedByScout({ scout: 0, stealth: 0, distance: 2, inRange: false }), "no visibility outside sight");
    check(window.getV39VisibilityStatus().testMode === false, "normal mode, not debug visibility");
    window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.centerOn(window.getV39MapEntityMarker(enemy.id).x, window.getV39MapEntityMarker(enemy.id).y);
    return { before, inspection, enemyAttackVisible: true, playerAttackVisible: true };
  });
  await page.screenshot({ path: "output/web-game/combat-visibility/result.png" });
  await page.evaluate(async () => {
    window.updateV39TimelineState({ turnNumber: window.getV39GameState().timeline.turnNumber + 1 });
    window.renderV39Visibility(); await new Promise(resolve => setTimeout(resolve, 350));
    if (window.isV39EntityDetected(window.getV39GameState().enemies[0])) throw new Error("recovered stealth requires detection again");
    const map = window.__v39FieldRuntime.mapData;
    map.grid[10][12] = "岩壁";
    const enemy = { ...window.getV39GameState().enemies[0], lastStealthBreakTurn: window.getV39GameState().timeline.turnNumber };
    window.setV39GameState({ enemies: [enemy] });
    window.renderV39Visibility(); await new Promise(resolve => setTimeout(resolve, 350));
    if (window.isV39EntityDetected(enemy)) throw new Error("exposure must not reveal enemies through walls");
  });
  assert.deepEqual(errors, []);
  report.recovery = true; report.wallOcclusion = true;
  console.log("PASS", JSON.stringify(report));
} finally { await browser.close(); }
