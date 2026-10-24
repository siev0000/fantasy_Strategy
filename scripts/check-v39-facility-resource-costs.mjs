import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_TEST_URL||"http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function");
  const report = await page.evaluate(async () => {
    const economy = await import("/src/lib/v39-economy-rules.js");
    const { getGameDataRows } = await import("/src/lib/game-data-registry.js");
    const rows = getGameDataRows("施設");
    const special = getGameDataRows("特産品").filter(row => row.分類 === "特殊資源");
    const map = { w:12, h:12, grid:Array.from({ length:12 }, () => Array(12).fill("平地")) };
    const fixture = (blackwood, residential = false) => {
      const village = economy.normalizeV39Village({
        id:"a", settlementId:"a", placed:true, x:5, y:5, type:"村", scaleKey:"village",
        population:500, populationByRace:{ 只人:500 },
        materialStockByType:{ ...Object.fromEntries(economy.MATERIAL_RESOURCE_KEYS.map(key => [key, 10000])), 黒木:blackwood },
        foodStockByType:{ 穀物:10000 }, cityLevels:{ 軍事Lv:7, 経済Lv:7 },
        territoryTileModeMap:residential ? { "6,5":"settlement" } : {}
      });
      return { activePlayerId:"p", timeline:{ turnNumber:1 },
        players:[{ id:"p", race:"只人", factionState:{ units:[], settlements:[village], selectedSettlementId:"a", research:{} } }],
        territoryOwnerByTile:{ "5,5":"p", "6,5":"p" },
        territoryStateByTile:{ "5,5":{ settlementId:"a" }, "6,5":{ settlementId:"a" } }
      };
    };
    const wall = economy.facilityDefinitions().find(row => row.name === "城壁");
    const poor = fixture(4);
    const enough = fixture(5);
    const poorCheck = economy.inspectV39Construction(poor, poor.players[0], wall, { x:6, y:5 }, map);
    const enoughCheck = economy.inspectV39Construction(enough, enough.players[0], wall, { x:6, y:5 }, map);
    const built = economy.startV39Construction(enough, "p", "城壁", { x:6, y:5 }, map);
    const substituted = fixture(2);
    substituted.players[0].factionState.settlements[0].materialStockByType.銀鉄 = 1;
    const substituteBuilt = economy.startV39Construction(substituted, "p", "城壁", { x:6, y:5 }, map);
    const substituteStock = substituteBuilt.state.players[0].factionState.settlements[0].materialStockByType;
    const short = fixture(4);
    short.players[0].factionState.settlements[0].materialStockByType.木材 = wall.cost.木材 + 99;
    const rejected = economy.startV39Construction(short, "p", "城壁", { x:6, y:5 }, map);
    const townPoor = economy.inspectV39SettlementDevelopment(fixture(0, true), "p");
    const townEnoughState = fixture(1, true);
    const townEnough = economy.inspectV39SettlementDevelopment(townEnoughState, "p");
    const developed = economy.startV39SettlementDevelopment(townEnoughState, "p");
    const substituteDevelopment = economy.startV39SettlementDevelopment(fixture(0, true), "p");
    const shortTown = fixture(0, true);
    shortTown.players[0].factionState.settlements[0].materialStockByType.木材 = 299;
    const rejectedTown = economy.startV39SettlementDevelopment(shortTown, "p");
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.getElementById("v39-play-mode-select")?.classList.remove("open");
    window.setV39GameState({ ...fixture(0, true), enemies:[], enemyNests:[], settlements:[] });
    window.openV39SettlementDevelopment();
    return {
      costs:rows.filter(row => ["町", "都市", "大都市"].includes(row.施設名)).map(row => ({ name:row.施設名, blackwood:row.黒木 })),
      integerCosts:rows.every(row => special.every(resource => Number.isInteger(Number(row[resource.名前] || 0)))),
      cycles:special.map(row => [row.採取周期, row.採取量]), wallCost:wall.cost.黒木,
      poor:poorCheck, enough:enoughCheck.available,
      built:{ ok:built.ok, reason:built.reason, stock:built.state.players[0].factionState.settlements[0].materialStockByType.黒木, queue:built.queueItem },
      townPoor:{ available:townPoor.available, blackwood:townPoor.requirements.find(row => row.resourceKey === "黒木"), wood:townPoor.requirements.find(row => row.resourceKey === "木材") },
      substituteStock, substituteBuiltOk:substituteBuilt.ok,
      rejected:{ ok:rejected.ok, reason:rejected.reason, unchanged:rejected.state === short },
      substituteDevelopment:{ ok:substituteDevelopment.ok, stock:substituteDevelopment.state.players[0].factionState.settlements[0].materialStockByType },
      rejectedTown:{ ok:rejectedTown.ok, reason:rejectedTown.reason, unchanged:rejectedTown.state === shortTown },
      townEnough:{ available:townEnough.available, reason:townEnough.reason },
      developed:{ ok:developed.ok, reason:developed.reason, stock:developed.state.players[0].factionState.settlements[0].materialStockByType.黒木 }
    };
  });
  assert.deepEqual(report.costs.map(row => row.blackwood), [1, 2, 4]);
  assert.equal(report.integerCosts, true);
  assert.equal(report.cycles.length, 7);
  assert.ok(report.cycles.every(([turns, amount]) => turns === 5 && amount === 1));
  assert.equal(report.wallCost, 5);
  assert.equal(report.poor.available, true);
  assert.equal(report.poor.materialPayment.cost.黒木, 4);
  assert.equal(report.poor.materialPayment.cost.木材, 250);
  assert.equal(report.substituteBuiltOk, true);
  assert.equal(report.substituteStock.黒木, 0);
  assert.equal(report.substituteStock.銀鉄, 0);
  assert.equal(report.substituteStock.木材, 9550);
  assert.equal(report.substituteStock.鉄, 9450);
  assert.equal(report.rejected.ok, false);
  assert.match(report.rejected.reason, /木材/);
  assert.equal(report.rejected.unchanged, true);
  assert.equal(report.enough, true, JSON.stringify(report));
  assert.equal(report.built.ok, true, report.built.reason);
  assert.equal(report.built.stock, 0);
  assert.ok(report.built.queue.remainingTurns > 0);
  assert.equal(report.townPoor.available, true);
  assert.equal(report.townPoor.blackwood, undefined);
  assert.equal(report.townPoor.wood.required, 300);
  assert.equal(report.substituteDevelopment.ok, true);
  assert.equal(report.substituteDevelopment.stock.黒木, 0);
  assert.equal(report.substituteDevelopment.stock.木材, 9700);
  assert.equal(report.rejectedTown.ok, false);
  assert.match(report.rejectedTown.reason, /木材/);
  assert.equal(report.rejectedTown.unchanged, true);
  assert.equal(report.townEnough.available, true, report.townEnough.reason);
  assert.equal(report.developed.ok, true, report.developed.reason);
  assert.equal(report.developed.stock, 0);
  const directory = "output/facility-resource-conversion/substitution-ui";
  mkdirSync(directory, { recursive:true });
  for (const width of [1100, 390]) {
    await page.setViewportSize({ width, height:844 });
    await page.evaluate(()=>window.openV39SettlementDevelopment());
    assert.match(await page.locator("#v39-development").textContent(), /黒木不足1 → 木材\+100/);
    await page.evaluate(()=>window.openV39LandConstruction({x:6,y:5}));
    await page.locator('[data-land-build-facility="城壁"]').click();
    assert.match(await page.locator('.v39-land-build-detail').textContent(), /黒木不足5 → 木材 500/);
    await page.locator('#v39-land-construction').screenshot({ path:`${directory}/${width}.png` });
    await page.locator('[data-land-construction-back]').click();
  }
  assert.deepEqual(errors, []);
  console.log("facility costs: 5T/1 harvest, original costs, full/partial substitutes, combined costs, shortage rejection and exact debit passed");
} finally {
  await browser.close();
}
