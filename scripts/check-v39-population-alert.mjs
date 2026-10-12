import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/population-alert", { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:850 } });
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3022", { waitUntil:"networkidle" });
    await page.waitForFunction(() => typeof window.renderV39SettlementPanel === "function");
    await page.evaluate(() => {
      window.startV39LocalSession(1, { playMode:"single-test" });
      window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "population-alert");
      const faction = window.getV39ActiveFactionState();
      const base = { id:"alert-test", settlementId:"alert-test", name:"試験村", placed:true,
        x:5, y:5, tier:"村", population:50, foodStockByType:{ 穀物:216 } };
      window.updateV39ActiveFactionState({ ...faction, villagePlacementMode:false,
        selectedSettlementId:base.settlementId,
        settlements:[{ ...base, populationByRace:{ 只人:50 }, populationGrowthByRace:{ 只人:{
          gauge:4, lastRequiredGauge:200, condition:"食事", shortage:0, starvationStage:2
        } } }]
      });
      window.activateV39FooterTab("settlement");
      window.renderV39SettlementPanel();
    });
    const warning = page.locator(".settlement-population-alert");
    assert.equal(await warning.textContent(), "備蓄注意");
    await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
    await page.screenshot({ path:`output/web-game/population-alert/${width}.png` });
    for (const [shortage, stage, expected] of [[12, 2, "不足 12"], [0, 0, ""]]) {
      await page.evaluate(({ shortage, stage }) => {
        const faction = window.getV39ActiveFactionState();
        const settlements = faction.settlements.map(base => ({ ...base, populationGrowthByRace:{ 只人:{
          ...base.populationGrowthByRace.只人, shortage, starvationStage:stage
        } } }));
        window.updateV39ActiveFactionState({ ...faction, settlements });
        window.renderV39SettlementPanel();
      }, { shortage, stage });
      assert.equal(await warning.count(), expected ? 1 : 0);
      if (expected) assert.equal(await warning.textContent(), expected);
    }
    assert.deepEqual(errors, []);
    console.log(`population alert ${width}: stock warning / actual shortage / normal OK`);
    await page.close();
  }
} finally { await browser.close(); }
