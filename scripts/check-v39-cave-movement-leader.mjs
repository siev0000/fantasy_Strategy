import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-movement-leader", { recursive: true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } }), errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022", { waitUntil: "networkidle" });
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name: "探索ゲーム", exact: true }).click();
    await page.getByRole("button", { name: "探索開始", exact: true }).click();
    await page.waitForTimeout(700);
    const ids = await page.evaluate(() => window.getV39ActiveFactionState().squads[0].unitIds);
    const rear = page.locator(`#squadMemberList [data-v39-unit-id="${ids[2]}"]`);
    await rear.click();
    await rear.click({ button: "right" });
    await page.getByRole("button", { name: "移動先頭にする", exact: true }).click();
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    const report = await page.evaluate(async ({ ids }) => {
      const check = (ok, message) => { if (!ok) throw new Error(message); };
      const rules = await import("/src/lib/v39-squad-movement-rules.js");
      const faction = window.getV39ActiveFactionState();
      check(faction.squads[0].movementLeaderId === ids[2], "menu assigns leader");
      window.updateV39ActiveFactionState({ selectedUnitId: ids[1] });
      check(rules.resolveV39SquadMovementGroup(window.getV39ActiveFactionState(), ids[1], { caveFormation: true }).leader.id === ids[2], "selection leaves leader unchanged");
      const before = window.getV39ActiveFactionState().units.map(unit => ({ id: unit.id, hp: unit.hp, ap: unit.ap }));
      window.importV39SaveJson(window.exportV39SaveJson(0));
      await new Promise(resolve => setTimeout(resolve, 700));
      check(window.getV39ActiveFactionState().squads[0].movementLeaderId === ids[2], "leader survives save/load");
      check(window.getV39ActiveFactionState().selectedUnitId === ids[1], "selection survives save/load");
      const map = window.__v39FieldRuntime.mapData;
      window.setV39GameState({ enemies: [] });
      window.updateV39ActiveFactionState({ units: window.getV39ActiveFactionState().units.map(unit => ({ ...unit, x: map.stairsDown.x, y: map.stairsDown.y })) });
      await window.descendV39Cave();
      check(window.getV39ActiveFactionState().squads[0].movementLeaderId === ids[2], "leader survives descent");
      check(window.getV39ActiveFactionState().selectedUnitId === ids[1], "descent does not select leader");
      await window.leaveV39Cave();
      check(window.getV39ActiveFactionState().squads[0].movementLeaderId === ids[2], "leader survives return");
      check(JSON.stringify(before) === JSON.stringify(window.getV39ActiveFactionState().units.map(unit => ({ id: unit.id, hp: unit.hp, ap: unit.ap }))), "leader change leaves hp/ap intact");
      return { leader: ids[2], selected: ids[1], saveLoad: true, descent: true, return: true };
    }, { ids });
    await page.locator(`#squadMemberList [data-v39-unit-id="${ids[2]}"]`).click({ button: "right" });
    assert.equal(await page.getByRole("button", { name: "移動先頭（現在）", exact: true }).isDisabled(), true);
    await page.screenshot({ path: `output/web-game/cave-movement-leader/${width}.png` });
    assert.deepEqual(errors, []);
    console.log("PASS", width, report);
    await page.close();
  }
} finally { await browser.close(); }
