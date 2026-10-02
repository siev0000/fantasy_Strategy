import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const errors = [];
try {
  for (const [width, expected] of [[1280, 15], [390, 12]]) {
    const page = await browser.newPage({ viewport:{ width, height:800 } });
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3011", { waitUntil:"networkidle" });
    await page.waitForFunction(() => typeof window.openV39TestTools === "function");
    const report = await page.evaluate(async () => {
      window.startV39LocalSession(1, { playMode:"single-test" });
      window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "test-bulk-turns");
      document.querySelector("#v39-play-mode-select")?.remove();
      document.querySelectorAll(".vue-modal-backdrop").forEach(node => node.remove());
      window.setV39TestMode(true);
      window.openV39TestTools();
      const state = window.getV39GameState();
      const player = state.players.find(row => row.id === state.activePlayerId);
      const village = {
        settlementId:"test-work", id:"test-work", name:"建設試験", placed:true, x:4, y:4,
        population:50, populationByRace:{ 只人:50 },
        foodStockByType:{ 穀物:1000, 野菜:1000, 肉:1000, 魚:1000 }, materialStockByType:{ 木材:1000 },
        buildings:[], tileFacilityMap:{},
        constructionQueue:[{ id:"test-work-queue", facilityName:"兵舎", tileKey:"4,5", remainingTurns:3, totalTurns:3, startedTurn:state.timeline.turnNumber }]
      };
      window.setV39GameState({
        players:state.players.map(row => row.id !== player.id ? row : ({ ...row, factionState:{ ...row.factionState, village:undefined, settlements:[village], selectedSettlementId:village.id, villagePlacementMode:false, units:[] } })),
        settlements:[{ ...village, type:"村" }],
        territoryOwnerByTile:{ "4,4":player.id, "4,5":player.id },
        territoryStateByTile:{ "4,4":{ settlementId:village.id }, "4,5":{ settlementId:village.id } }
      });
      window.runV39EnemyTurn = async () => {};
      const font = getComputedStyle(document.documentElement).fontSize;
      const inputFont = getComputedStyle(document.getElementById("v39-test-turn-count")).fontSize;
      const start = window.getV39GameState().timeline.turnNumber;
      document.querySelector('[data-test-action="turn-production"]').click();
      await new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          if (!document.querySelector('[data-test-action="turn-many"]').disabled) { clearInterval(timer); resolve(); }
        }, 30);
        setTimeout(() => { clearInterval(timer); reject(new Error("ターン進行タイムアウト")); }, 15000);
      });
      const after = window.getV39GameState();
      const completedVillage = after.players.find(row => row.id === player.id).factionState.settlements[0];
      const result = { font, inputFont, status:document.getElementById("v39-test-tools-status").textContent, advanced:after.timeline.turnNumber - start, completed:completedVillage.tileFacilityMap["4,5"]?.includes("兵舎"), queueLength:completedVillage.constructionQueue.length };
      window.setV39TestMode(false);
      document.querySelector('[data-test-action="turn-many"]').click();
      result.blockedWhenOff = window.getV39GameState().timeline.turnNumber === after.timeline.turnNumber;
      window.setV39TestMode(true);
      window.openV39TestTools();
      const probe = document.createElement("b");
      probe.className = "squad-name";
      document.getElementById("footSquad").appendChild(probe);
      result.squadNameFont = getComputedStyle(probe).fontSize;
      const slider = document.getElementById("v39-font-size");
      slider.value = "120";
      slider.dispatchEvent(new Event("input", { bubbles:true }));
      result.scaledFont = getComputedStyle(probe).fontSize;
      const root = document.documentElement;
      root.style.setProperty("--pc-base-font", "18px");
      root.style.setProperty("--mobile-base-font", "14px");
      result.adjustedFont = getComputedStyle(probe).fontSize;
      root.style.removeProperty("--pc-base-font");
      root.style.removeProperty("--mobile-base-font");
      slider.value = "100";
      slider.dispatchEvent(new Event("input", { bubbles:true }));
      result.noLateFontOverride = !document.getElementById("v39-readable-fonts-style");
      const label = document.createElement("span");
      label.style.fontSize = "var(--font-size-8)";
      document.body.appendChild(label);
      result.smallLabelFont = getComputedStyle(label).fontSize;
      label.remove();
      const originalSnapshot = window.getV39ResourceSnapshot;
      const deltas = [-57.599999999999994, 17.6, -0.4, 8.5];
      window.getV39ResourceSnapshot = () => Object.fromEntries(["food", "wood", "ore", "precious"].map((key, index) => [key, { title:key, icon:"", items:[{ name:key, value:100, delta:deltas[index] }] }]));
      window.renderV39ResourceTop();
      result.roundedDeltas = [...document.querySelectorAll("#resourceSet .value-delta")].map(node => node.textContent);
      result.rawDeltas = deltas;
      window.getV39ResourceSnapshot = originalSnapshot;
      window.renderV39ResourceTop();
      probe.remove();
      return result;
    });
    console.log(JSON.stringify({ width, ...report }));
    assert.equal(report.font, `${expected}px`);
    assert.equal(report.inputFont, `${expected}px`);
    assert.equal(report.advanced, 3);
    assert.equal(report.completed, true);
    assert.equal(report.queueLength, 0);
    assert.equal(report.blockedWhenOff, true);
    assert.equal(report.squadNameFont, `${expected}px`);
    assert.ok(Math.abs(parseFloat(report.scaledFont) - expected * 1.2) < 0.001);
    assert.ok(Math.abs(parseFloat(report.adjustedFont) - (width < 700 ? 14 : 18) * 1.2) < 0.001);
    assert.equal(report.noLateFontOverride, true);
    assert.equal(report.smallLabelFont, width < 700 ? "10px" : "11px");
    assert.deepEqual(report.roundedDeltas, ["-58", "+18", "0", "+9"]);
    assert.equal(report.rawDeltas[0], -57.599999999999994);
    await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
    await page.screenshot({ path:`output/web-game/v39-test-turns-${width}.png` });
    await page.evaluate(() => {
      window.activateV39FooterTab("squad");
      document.querySelector('[data-squad-detail-tab="action"]').click();
    });
    await page.waitForTimeout(150);
    const actionFonts = await page.evaluate(() => ({
      name:getComputedStyle(document.querySelector("#mobileBattleMove .technique-name")).fontSize,
      ap:getComputedStyle(document.querySelector("#mobileBattleMove .technique-ap")).fontSize
    }));
    assert.equal(actionFonts.name, `${expected}px`);
    assert.equal(actionFonts.ap, width < 700 ? "10px" : "11px");
    await page.screenshot({ path:`output/web-game/v39-action-fonts-${width}.png` });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
}
