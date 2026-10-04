import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.locator("[data-v39-play-mode=single-normal]").click();
  await page.locator('[data-v39-race-option="エルフ"]').click();
  assert.equal(await page.locator(".race-terrain-preferences .preferred dd").textContent(), "森");
  assert.equal(await page.locator(".race-terrain-preferences .unfavorable dd").textContent(), "荒野・砂漠・火山");
  await page.screenshot({ path:"artifacts/race-terrain-desktop.png" });
  await page.setViewportSize({ width:440, height:900 });
  assert.ok(await page.locator(".race-terrain-preferences").isVisible());
  await page.screenshot({ path:"artifacts/race-terrain-mobile.png" });
  await page.locator('[data-v39-race-option="只人"]').click();
  assert.equal(await page.locator(".race-terrain-preferences .preferred dd").textContent(), "平地・河川");
  assert.equal(await page.locator(".race-terrain-preferences .unfavorable").count(), 0);
  const report = await page.evaluate(async () => {
    const civic = await import("http://127.0.0.1:3022/src/lib/v39-civic-rules.js");
    const economy = await import("http://127.0.0.1:3022/src/lib/v39-economy-rules.js");
    const base = { population:100, populationCapacity:100, populationByRace:{ エルフ:100 }, civicState:{ happiness:50 } };
    const safe = civic.resolveV39CivicTurn(base, 2, ["森","森"]);
    const half = civic.resolveV39CivicTurn(base, 2, ["森","砂漠"]);
    const all = civic.resolveV39CivicTurn(base, 2, ["砂漠","荒野"]);
    const mixed = civic.resolveV39CivicTurn({ ...base, populationByRace:{ エルフ:50, 只人:50 } }, 2, ["砂漠"]);
    const village = { ...base, id:"test", settlementId:"test", placed:true, x:1,y:1,
      territoryTileModeMap:{ "2,1":"settlement", "3,1":"resource" },
      foodStockByType:{ 穀物:10000,野菜:10000,肉:10000,魚:10000 }, materialStockByType:{} };
    const player = { id:"p1", race:"エルフ", factionState:{ settlements:[village], selectedSettlementId:"test",units:[] } };
    const map = { w:5,h:3, grid:Array.from({ length:3 },()=>Array(5).fill("森")) };
    map.grid[1][2]="砂漠"; map.grid[1][3]="砂漠";
    const keys = ["1,1","2,1","3,1"];
    const state = { players:[player],timeline:{ turnNumber:2 },
      territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,player.id])),
      territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{ settlementId:"test" }])) };
    const next = economy.advanceV39EconomyTurn(state,map).state.players[0].factionState.settlements[0];
    return { safe:safe.happinessTargetByRace.エルフ, half:half.happinessTargetByRace.エルフ,
      all:all.happinessTargetByRace.エルフ, mixed:mixed.happinessModifiersByRace,
      actual:next.civicState.happinessModifiersByRace.エルフ };
  });
  assert.equal(report.safe-report.half,15);
  assert.equal(report.safe-report.all,30);
  assert.equal(report.mixed.エルフ.unfavorableTerrain,-30);
  assert.ok(report.mixed.只人.unfavorableTerrain === 0);
  assert.equal(report.actual.unfavorableTerrainRate,0.5);
  assert.equal(report.actual.unfavorableTerrain,-15);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ report, errors },null,2));
} finally { await browser.close(); }
