import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const url = process.env.V39_BASE_URL || "http://127.0.0.1:3022";
const browser = await chromium.launch({ headless:true });
mkdirSync("output/web-game/action-experience", { recursive:true });
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:850 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url, { waitUntil:"networkidle" });
    await page.waitForFunction(() => typeof window.startV39Survey === "function");
    const report = await page.evaluate(async () => {
      const { researchTreeData } = await import("http://127.0.0.1:3022/src/lib/research-tree-config.js");
      const { requiredResearchExp } = await import("http://127.0.0.1:3022/src/lib/research-progress.js");
      const { grantV39ActionExperience, resolveV39UnitTotalExpForLevel, resolveV39UnitRaceCategory } = await import("http://127.0.0.1:3022/src/lib/v39-unit-experience.js");
      const { advanceV39ExplorationTurn } = await import("http://127.0.0.1:3022/src/lib/v39-exploration-rules.js");
      window.startV39LocalSession(2, { playMode:"single-test" });
      window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "action-experience");
      const initial = window.getV39GameState();
      const category = Object.keys(researchTreeData.categories)[0];
      const item = researchTreeData.categories[category].levels.find(row => row.level === 1).items[0];
      const units = initial.players.map(player => player.factionState.units[0]);
      const ids = units.map(unit => unit.id);
      const map = window.__v39FieldRuntime.mapData;
      map.grid[5][5] = "平地"; map.heightLevelMap[5][5] = 0;
      window.setV39GameState({ enemies:[], enemyNests:[], neutralVillages:[], players:initial.players.map((player, index) => ({
        ...player, factionState:{ ...player.factionState, villagePlacementMode:false, selectedUnitId:ids[index],
          research:{ selection:{ [category]:item.id }, assignedUnitIdByCategory:{ [category]:ids[index] },
            progress:{ targetExpMap:{ [item.id]:requiredResearchExp(1) - 1 } }, lastProcessedTurn:0 },
          units:player.factionState.units.map((unit, i) => i ? unit : { ...unit, totalExp:resolveV39UnitTotalExpForLevel(unit.level, resolveV39UnitRaceCategory(unit)), x:5, y:5, worldId:"surface", hp:unit.maxHp, currentHp:unit.maxHp, state:"生存", ap:40, currentAp:40, actionPoint:40, actionExpRemainders:{} }),
          exploration:{ surveyedTileKeys:[], history:[], lastProcessedTurn:0 } }
      })) });
      const get = index => window.getV39GameState().players[index].factionState.units.find(unit => unit.id === ids[index]);
      const before = ids.map((_, index) => get(index).totalExp);
      window.dispatchEvent(new CustomEvent("v39:turn-stage-research"));
      const research = ids.map((_, index) => ({ gain:get(index).totalExp - before[index], remainder:get(index).actionExpRemainders.research }));
      const researchState = window.getV39GameState().players.map(player => player.factionState.research);
      window.dispatchEvent(new CustomEvent("v39:turn-stage-research"));
      const duplicateResearch = ids.map((_, index) => get(index).totalExp - before[index]);
      const surveyBefore = get(0).totalExp;
      const first = window.startV39Survey({ x:5, y:5 });
      window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:2 } }));
      const partial = { gain:get(0).totalExp - surveyBefore, paid:get(0).surveyTask?.expProcessedAp };
      window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:2 } }));
      const duplicateSurvey = get(0).totalExp - surveyBefore;
      const saved = window.createV39SaveData();
      window.importV39SaveJson(JSON.stringify(saved));
      const restored = get(0).surveyTask?.expProcessedAp;
      const current = window.getV39GameState();
      window.setV39GameState({ players:current.players.map((player, index) => index ? player : ({ ...player, factionState:{ ...player.factionState,
        units:player.factionState.units.map(unit => unit.id === ids[0] ? { ...unit, ap:80, currentAp:80, actionPoint:80 } : unit) } })) });
      const continued = window.startV39Survey({ x:5, y:5 });
      window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:3 } }));
      const completed = { gain:get(0).totalExp - surveyBefore, task:get(0).surveyTask || null };
      // Fractional rewards survive serialization; a level-up uses the shared derived-stat path.
      let unit = get(1);
      const fractionalBefore = unit.totalExp;
      for (let i = 0; i < 10; i++) unit = grantV39ActionExperience(JSON.parse(JSON.stringify(unit)), "test", .1).unit;
      const fractionalGain = unit.totalExp - fractionalBefore;
      const nextThreshold = resolveV39UnitTotalExpForLevel(unit.level + 1, resolveV39UnitRaceCategory(unit));
      unit = { ...unit, totalExp:nextThreshold - 1, hp:Math.floor(unit.maxHp / 2), currentHp:Math.floor(unit.maxHp / 2) };
      const levelUp = grantV39ActionExperience(unit, "test", 1);
      const cancelled = ["dead", "world"].map(reason => {
        const state = structuredClone(window.getV39GameState());
        const worker = state.players[0].factionState.units.find(row => row.id === ids[0]);
        worker.surveyTask = { x:worker.x, y:worker.y, key:"5,5", worldId:"surface", progressAp:100, expProcessedAp:0, expTotal:10 };
        if (reason === "dead") worker.hp = 0;
        else worker.worldId = "cave:other";
        const next = advanceV39ExplorationTurn(state, 99);
        const after = next.state.players[0].factionState.units.find(row => row.id === ids[0]);
        return after.totalExp === worker.totalExp && !after.surveyTask;
      });
      const hpStable = grantV39ActionExperience({ ...get(1), hp:77, currentHp:77, maxHp:103 }, "small", .1).unit.hp;
      const recordedLogs = window.getV39GameState().players[0].factionState.activityLog.filter(row => row.type === "survey-experience" || row.type === "research-experience").length;
      const base = window.getV39GameState();
      const researchStartLevel = get(0).level;
      const threshold = resolveV39UnitTotalExpForLevel(researchStartLevel + 1, resolveV39UnitRaceCategory(get(0)));
      const deadBefore = get(1).totalExp;
      let levelUpEvents = 0;
      window.addEventListener("v39:unit-level-up", () => levelUpEvents++);
      window.setV39GameState({ players:base.players.map((player, index) => ({ ...player, factionState:{ ...player.factionState,
        research:{ selection:{ [category]:item.id }, assignedUnitIdByCategory:{ [category]:ids[index] }, progress:{}, lastProcessedTurn:1 },
        units:player.factionState.units.map(row => row.id !== ids[index] ? row : { ...row, totalExp:index ? row.totalExp : threshold - 1,
          hp:index ? 0 : row.hp, currentHp:index ? 0 : row.hp, state:index ? "死亡" : "生存", actionExpRemainders:{} }) } })) });
      for (let turn = 2; turn <= 20; turn++) {
        window.setV39GameState({ timeline:{ ...window.getV39GameState().timeline, turnNumber:turn } });
        window.dispatchEvent(new CustomEvent("v39:turn-stage-research"));
      }
      const fullResearch = { gain:get(0).totalExp - (threshold - 1), level:get(0).level, fromLevel:researchStartLevel, levelUpEvents,
        deadGain:get(1).totalExp - deadBefore, deadSelected:!!window.getV39GameState().players[1].factionState.research.selection[category] };
      return { first:first.ok, continued:continued.ok, research, researchState, duplicateResearch, partial, duplicateSurvey, restored, completed,
        fractionalGain, cancelled, hpStable, fullResearch, levelUp:{ ok:levelUp.leveledUp, hp:levelUp.unit.hp, maxHp:levelUp.unit.maxHp }, logs:recordedLogs };
    });
    assert.equal(report.first, true); assert.equal(report.continued, true);
    for (const item of report.research) { assert.equal(item.gain, 0); assert.ok(Math.abs(item.remainder - .1) < 1e-8); }
    assert.deepEqual(report.duplicateResearch, [0, 0]);
    assert.equal(report.partial.gain, 4); assert.equal(report.partial.paid, 40);
    assert.equal(report.duplicateSurvey, 4); assert.equal(report.restored, 40);
    assert.equal(report.completed.gain, 10); assert.equal(report.completed.task, null);
    assert.equal(report.fractionalGain, 1); assert.equal(report.levelUp.ok, true);
    assert.deepEqual(report.cancelled, [true, true]); assert.equal(report.hpStable, 77);
    assert.equal(report.fullResearch.gain, 10); assert.equal(report.fullResearch.deadGain, 0);
    assert.equal(report.fullResearch.deadSelected, true); assert.ok(report.fullResearch.level > report.fullResearch.fromLevel);
    assert.ok(report.fullResearch.levelUpEvents > 0);
    assert.ok(report.levelUp.hp > 0 && report.levelUp.hp <= report.levelUp.maxHp / 2);
    assert.equal(report.logs, 3); assert.deepEqual(errors, []);
    await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
    await page.screenshot({ path:`output/web-game/action-experience/${width}.png` });
    console.log(`action experience ${width}: research cap, fractional EXP, survey progress, save/load, idempotence, players, level-up OK`);
    await page.close();
  }
} finally { await browser.close(); }
