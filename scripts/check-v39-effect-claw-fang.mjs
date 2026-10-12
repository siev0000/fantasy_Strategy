import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    async function open() { await page.locator("#v39-title-effect-settings-open").click(); }
    async function select(id, expected) {
      await page.locator("#v39-effect-composite-selector").selectOption(id);
      assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), expected);
    }
    await open();
    assert.equal(await page.locator('#v39-effect-composite-selector option[value="claw_fang"]').count(), 0);
    await select("claw", "爪");
    await select("fang", "牙");
    await page.evaluate(() => localStorage.setItem("v39-effect-category-settings-v1", JSON.stringify({ version:3, settings:{ claw_fang:{ baseEffect:"火炎", scaleMultiplierPercent:150, rotationDeg:45 } } })));
    await page.reload({ waitUntil:"networkidle" });
    await open();
    await select("claw", "火炎");
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "45");
    await select("fang", "火炎");
    await page.locator("#v39-effect-setting-base").selectOption("牙");
    await select("claw", "火炎");
    await page.reload({ waitUntil:"networkidle" });
    await open();
    await select("fang", "牙");
    await select("claw", "火炎");
    await page.locator("#v39-effect-settings-file").setInputFiles({ name:"old.json", mimeType:"application/json", buffer:Buffer.from(JSON.stringify({ schema:"v39-effect-category-settings", categories:{ claw_fang:{ baseEffect:"爪", scaleMultiplierPercent:125 }, fang:{ baseEffect:"牙", scaleMultiplierPercent:100 } } })) });
    await page.waitForTimeout(300);
    await select("claw", "爪");
    assert.equal(await page.locator("#v39-effect-setting-scale").inputValue(), "125");
    await select("fang", "牙");
    assert.equal(await page.locator("#v39-effect-setting-scale").inputValue(), "100");
    assert.deepEqual(errors, []);
    console.log(`claw/fang ${width}: defaults, legacy storage, independent edit, reload, legacy JSON/explicit priority OK`);
    await page.close();
  }
} finally { await browser.close(); }
