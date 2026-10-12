import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const expected = JSON.parse(readFileSync("config/v39-effect-composite-defaults.json", "utf8"));
const output = "output/web-game/effect-defaults";
mkdirSync(output, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator('[data-v39-effect-tab="data"]').click();
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#v39-effect-settings-export").click();
    const download = await downloadPromise;
    const snapshot = JSON.parse(readFileSync(await download.path(), "utf8"));
    assert.deepEqual(snapshot.categories, expected.categories);
    for (const [name, setting] of Object.entries(expected.attributes)) {
      assert.deepEqual(snapshot.attributes[name], setting, name);
    }
    assert.equal(await page.locator("#v39-effect-composite-selector option").count(), 34);
    await page.locator('[data-v39-effect-tab="basic"]').click();
    await page.locator("#v39-effect-composite-selector").selectOption("strike");
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), "pipo-btleffect003");
    assert.equal(await page.locator("#v39-effect-setting-offset-x").inputValue(), "-5");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(500);
    await page.screenshot({ path:`${output}/strike-${width}.png` });
    assert.ok(!(await page.locator("#v39-effect-settings-status").textContent()).includes("失敗"));
    await page.locator("#v39-effect-setting-rotation").fill("45");
    await page.locator("#v39-effect-setting-rotation").dispatchEvent("input");
    await page.reload({ waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator("#v39-effect-composite-selector").selectOption("strike");
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "45");
    await page.locator("#v39-effect-setting-reset").click();
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "0");
    assert.equal(await page.locator("#v39-effect-setting-offset-x").inputValue(), "-5");
    assert.equal(await page.locator("#v39-effect-setting-scale").inputValue(), "60");
    await page.locator("#v39-effect-composite-selector").selectOption("heal");
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), "tor_回復1_sorted_result");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(500);
    assert.ok(!(await page.locator("#v39-effect-settings-status").textContent()).includes("失敗"));
    assert.deepEqual(errors, []);
    await page.evaluate(()=>localStorage.setItem("v39-effect-attribute-settings-v1",JSON.stringify({
      version:1,settings:{"保存済み旧属性":{tint:"#123456"}}
    })));
    await page.reload({waitUntil:"networkidle"});
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator('#v39-effect-composite-mode [data-mode="attribute"]').click();
    await page.locator("#v39-effect-composite-selector").selectOption("保存済み旧属性");
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem("v39-effect-attribute-settings-v1")).settings["保存済み旧属性"].tint),"#123456");
    assert.ok(await page.locator('#v39-effect-composite-selector option[value="治癒"]').count());
    assert.deepEqual(errors, []);
    console.log(`${width}: all category/attribute defaults, playback, saved override, reset OK`);
    await page.close();
  }
} finally { await browser.close(); }
