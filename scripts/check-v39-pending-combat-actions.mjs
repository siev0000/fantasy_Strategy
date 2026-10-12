import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const url = process.env.V39_BASE_URL || "http://127.0.0.1:3022";
const count = Number(process.env.CAST_COUNT) || 100;
mkdirSync("output/web-game/pending-actions", { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:850 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url, { waitUntil:"networkidle" });
    await page.waitForFunction(() => typeof window.resolveV39PendingCombatActions === "function");
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
    await page.getByRole("button", { name:"探索開始", exact:true }).click();
    await page.waitForFunction(() => window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.length > 0);
    const order = await page.evaluate(count => {
      window.setV39TestMode(true);
      window.__v39SuppressCombatEffects = true;
      const initial = window.getV39GameState(), player = initial.players[0];
      const map = window.__v39FieldRuntime.mapData;
      map.grid = map.grid.map(row => row.map(() => "洞窟"));
      map.heightLevelMap = map.grid.map(row => row.map(() => 0));
      map.specialMap = []; map.reliefMap = []; map.lavaMap = [];
      // 実データにある技名を使い、ロード時の正本JSON再参照も検証する。
      const skill = { 名前:"牙", 行動:"A", 物理:20, 判定:"攻撃", AP消費:30, 射程:1, 攻撃手段:"牙" };
      const casters = Array.from({ length:count }, (_, index) => ({ id:`cast-${index}`, name:`術者${index}`, race:"只人", className:"ファイター", level:7, status:{ 攻撃:100, 防御:0 }, equipment:[], x:10, y:10,
        worldId:initial.activeWorldId, hp:1000, currentHp:1000, maxHp:1000, ap:90, currentAp:90, actionPoint:90,
        techniques:[{ name:skill.名前, source:skill }] }));
      const pending = Object.fromEntries(casters.map(unit => [unit.id, { unitId:unit.id, playerId:player.id, skillName:skill.名前,
        skillRow:skill, target:{ x:11, y:10 }, startedTurn:1, resolvesAtTurn:2 }]));
      const extras = [
        { ...casters[0], id:"dead-caster", hp:0, currentHp:0 },
        { ...casters[0], id:"out-of-range" }, { ...casters[0], id:"cooldown-caster" },
        { ...casters[0], id:"future-caster" }, { ...casters[0], id:"other-world", worldId:"cave:elsewhere" }
      ];
      for (const unit of [...extras, { id:"missing-caster" }]) pending[unit.id] = { ...pending[casters[0].id], unitId:unit.id };
      pending["out-of-range"].target = { x:30, y:30 };
      pending["future-caster"].resolvesAtTurn = 4;
      window.setV39GameState({ timeline:{ ...initial.timeline, turnNumber:1 }, enemies:[{ id:"target", name:"予約対象", x:11, y:10,
        worldId:initial.activeWorldId, hp:1e7, currentHp:1e7, maxHp:1e7, level:1, status:{ 防御:0, 精神:0 } }],
        enemyNests:[], enemySquads:[], neutralVillages:[], players:[{ ...player, factionState:{ ...player.factionState,
          villagePlacementMode:false, squads:[], selectedSquadId:"", units:[...casters, ...extras], selectedUnitId:casters[0].id,
          combatRuntime:{ pendingActionsByUnitId:pending, cooldownsByUnitId:{ "cooldown-caster":{ [skill.名前]:4 } } } } }] });
      // 予約の保存復元を検証。フィールド再生成は別のワールド往来テストで扱う。
      const save = JSON.parse(window.exportV39SaveJson());
      save.field = null;
      window.importV39SaveJson(JSON.stringify(save));
      const order = Object.keys(window.getV39GameState().players[0].factionState.combatRuntime.pendingActionsByUnitId);
      window.setV39GameState({ timeline:{ ...window.getV39GameState().timeline, turnNumber:2 } });
      return order;
    }, count);
    await page.waitForFunction(() => window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.length > 0);
    const report = await page.evaluate(() => {
      const ended = [], attacks = [];
      window.addEventListener("v39:cast-ended", event => ended.push(event.detail));
      window.addEventListener("v39:combat-log", event => { if (event.detail.skillName === "牙") attacks.push(event.detail.attackerId); });
      const token = window.beginV39MapRenderBatch("pending-test");
      const runtime = window.__v39FieldRuntime, game = runtime.game;
      runtime.game = null;
      window.resolveV39PendingCombatActions(2);
      const unreadyCount = Object.keys(window.getV39GameState().players[0].factionState.combatRuntime.pendingActionsByUnitId).length;
      runtime.game = game;
      const start = performance.now();
      try {
        window.resolveV39PendingCombatActions(2);
        window.resolveV39PendingCombatActions(2);
      } finally { window.endV39MapRenderBatch(token); }
      const duration = performance.now() - start;
      const state = window.getV39GameState(), faction = state.players[0].factionState;
      return { unreadyCount, duration, remaining:Object.keys(faction.combatRuntime.pendingActionsByUnitId), attacks, ended,
        ap:faction.units.filter(unit => unit.id.startsWith("cast-")).map(unit => unit.ap), targetHp:state.enemies[0].hp };
    });
    assert.equal(order.length, count + 6);
    const expectedOrder = Array.from({ length:count }, (_, index) => `cast-${index}`);
    assert.deepEqual(order.slice(0, count), expectedOrder);
    assert.equal(report.unreadyCount, count + 6);
    assert.equal(report.attacks.length, count); assert.equal(new Set(report.attacks).size, count);
    assert.deepEqual(report.attacks, expectedOrder);
    assert.equal(report.ended.length, count + 4); assert.equal(new Set(report.ended.map(entry => entry.unitId)).size, count + 4);
    assert.deepEqual(report.remaining.sort(), ["future-caster", "other-world"]);
    assert.ok(report.ap.every(ap => ap === 90), "prepaid AP is not deducted twice");
    assert.ok(report.targetHp < 1e7); assert.deepEqual(errors, []);
    await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
    await page.screenshot({ path:`output/web-game/pending-actions/${width}.png` });
    console.log(`pending actions ${width}: ${count} casts, invalid cancellation, save/order, duplicate resolution, AP, world/future deferral OK (${Math.round(report.duration)}ms)`);
    await page.close();
  }
} finally { await browser.close(); }
