import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.openV39Research === "function");
  const report = await page.evaluate(async () => {
    const effects = await import("/src/lib/v39-research-effects.js");
    const economy = await import("/src/lib/v39-economy-rules.js");
    const civic = await import("/src/lib/v39-civic-rules.js");
    const progress = await import("/src/lib/research-progress.js");
    const { getGameDataRows } = await import("/src/lib/game-data-registry.js");
    const { researchTreeData } = await import("/src/lib/research-tree-config.js");
    const row = getGameDataRows("研究").find(row => row.Lv === 1);
    const id = row.ID;
    const fields = { 農業:10, 林業:15, 漁業:20, 工業:-5, 幸福度:8, 治安:12 };
    // Test-only runtime values; the spreadsheet and generated JSON remain untouched.
    Object.assign(row, fields);
    const selected = progress.selectResearch({}, `${row.技術対象}Lv`, id, { id:"u", level:10 }).state;
    const mid = progress.addResearchExperience(selected, `${row.技術対象}Lv`, 99).state;
    const completed = progress.addResearchExperience(mid, `${row.技術対象}Lv`, 1).state;
    const loaded = progress.normalizeResearchState(JSON.parse(JSON.stringify(completed)));
    const duplicated = structuredClone(loaded);
    duplicated.progress.completedByCategoryLevel.other = { 1:[id, id, "unknown"] };
    const village = economy.normalizeV39Village({ id:"a", settlementId:"a", placed:true, x:5, y:5,
      population:50, populationByRace:{ 只人:50 }, employmentRate:1, employmentSlots:50,
      foodStockByType:{ 穀物:100000 }, populationGrowthByRace:{ 只人:{ remainingTurns:10 } } });
    const player = research => ({ id:"p", race:"只人", factionState:{ research, settlements:[village], selectedSettlementId:"a", units:[] } });
    const before = economy.resolveV39SettlementProductionMetrics(null, player({}), village);
    const after = economy.resolveV39SettlementProductionMetrics(null, player(loaded), village);
    const again = economy.resolveV39SettlementProductionMetrics(null, player(loaded), village);
    const noResearch = civic.resolveV39CivicTurn(village, 1);
    const withResearch = civic.resolveV39CivicTurn(village, 1, [], { names:[], bonus:0 }, effects.resolveV39ResearchEffects(loaded));
    const map = { w:12, h:12, grid:Array.from({ length:12 }, () => Array(12).fill("平地")) };
    const state = { activePlayerId:"p", timeline:{ turnNumber:1 }, players:[player(loaded)],
      territoryOwnerByTile:{ "5,5":"p" }, territoryStateByTile:{ "5,5":{ settlementId:"a" } }, enemies:[], enemyNests:[], settlements:[] };
    const turn = economy.advanceV39EconomyTurn(state, map).state;
    const baselineIncome = economy.collectV39TerritoryIncome(state, player({}), map);
    const researchIncome = economy.collectV39TerritoryIncome(state, player(loaded), map);
    const repeated = economy.advanceV39EconomyTurn(turn, map).state;
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.getElementById("v39-play-mode-select")?.classList.remove("open");
    window.setV39GameState(state);
    const item = Object.values(researchTreeData.categories).flatMap(cat => cat.levels.flatMap(level => level.items)).find(item => item.id === id);
    item.details = [...Object.entries(fields).map(([key, value]) => ({ key, value:String(value) })), { key:"道路発展数", value:"1" }];
    window.openV39Research(`${row.技術対象}Lv`);
    return { id, fields, mid:effects.resolveV39ResearchEffects(mid), loaded:effects.resolveV39ResearchEffects(loaded),
      duplicate:effects.resolveV39ResearchEffects(duplicated), before, after, again,
      civicBefore:noResearch, civicAfter:withResearch,
      baselineIncome, researchIncome,
      turn:turn.players[0].factionState.settlements[0].civicState,
      repeated:repeated.players[0].factionState.settlements[0].civicState };
  });
  assert.ok(Object.values(report.mid).every(value => value === 0));
  assert.deepEqual(report.loaded, report.fields);
  assert.deepEqual(report.duplicate, report.fields);
  for (const key of ["農業", "林業", "漁業", "工業"]) assert.equal(report.after.skills[key] - report.before.skills[key], report.fields[key]);
  assert.deepEqual(report.after, report.again);
  assert.ok(report.researchIncome.food.穀物 > report.baselineIncome.food.穀物, "research must increase real grain income");
  assert.equal(report.civicAfter.modifiers.happinessTarget - report.civicBefore.modifiers.happinessTarget, 8);
  assert.equal(report.civicAfter.modifiers.researchSecurity, 12);
  assert.equal(report.turn.modifiers.researchHappiness, 8);
  assert.equal(report.turn.modifiers.researchSecurity, 12);
  assert.deepEqual(report.turn, report.repeated);
  mkdirSync("output/research-effects", { recursive:true });
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height:844 });
    await page.locator(`[data-research-item="${report.id}"]`).first().click();
    assert.match(await page.locator(".v39-research-detail").textContent(), /生産技能加算/);
    assert.match(await page.locator(".v39-research-detail").textContent(), /道路発展数（未接続）/);
    await page.screenshot({ path:`output/research-effects/${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log("research effects: completion only, duplicate/unknown IDs, signed skill modifiers, repeated evaluation, load, civic/economy turns, PC/mobile labels passed");
} finally {
  await browser.close();
}
