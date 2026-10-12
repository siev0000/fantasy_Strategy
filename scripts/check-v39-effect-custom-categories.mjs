import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { resolveEffectSheetLayout } from "../配布用/アニメーション再生機能/phaser-effect-player.mjs";

const output = "output/web-game/effect-custom-categories";
mkdirSync(output, { recursive:true });
const names = readdirSync("assets/effect/アニメーション追記").filter(name => name.endsWith(".webp")).map(name => name.slice(0, -5));
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    page.setDefaultTimeout(20000);
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    const count = await page.locator("#v39-effect-composite-selector option").count();
    await page.locator("#v39-effect-category-add").click();
    const id = await page.locator("#v39-effect-composite-selector").inputValue();
    assert.ok(id.startsWith("custom_"));
    assert.equal(await page.locator("#v39-effect-composite-selector option").count(), count + 1);
    await page.locator("#v39-effect-category-name").fill("追記テスト");
    await page.locator("#v39-effect-category-name").dispatchEvent("change");
    for (const name of names) {
      await page.locator("#v39-effect-setting-base").selectOption(name);
      await page.locator("#v39-effect-setting-preview-local").click();
      await page.waitForTimeout(1600);
      assert.ok(!(await page.locator("#v39-effect-settings-status").textContent()).includes("失敗"));
    }
    await page.locator('[data-effect-picker-mode="images"]').click();
    const choice = page.locator(`[data-effect-image="${names[0]}"]`);
    await choice.click();
    await page.waitForFunction(name => document.querySelector(`[data-effect-image="${name}"]`)?.dataset.thumbnail === "ready", names[0]);
    await page.screenshot({ path:`${output}/gallery-${width}.png` });
    await page.locator('[data-effect-picker-mode="list"]').click();
    await page.locator("#v39-effect-composite-selector").selectOption("slash");
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), "斬撃");
    await page.locator("#v39-effect-composite-selector").selectOption(id);
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), names[0]);
    await page.reload({ waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator("#v39-effect-composite-selector").selectOption(id);
    assert.equal(await page.locator("#v39-effect-category-name").inputValue(), "追記テスト");
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), names[0]);
    await page.locator("#v39-effect-category-add").click();
    const id2 = await page.locator("#v39-effect-composite-selector").inputValue();
    assert.notEqual(id, id2);
    await page.locator('[data-v39-effect-tab="data"]').click();
    const pending = page.waitForEvent("download");
    await page.locator("#v39-effect-settings-export").click();
    const download = await pending;
    const path = `${output}/settings-${width}.json`;
    await download.saveAs(path);
    const saved = JSON.parse(readFileSync(path, "utf8"));
    assert.equal(saved.categories[id].custom, true);
    assert.equal(saved.categories[id].name, "追記テスト");
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator("#v39-effect-settings-file").setInputFiles(path);
    await page.waitForTimeout(300);
    await page.locator("#v39-effect-composite-selector").selectOption(id);
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), names[0]);
    if (width === 1100) {
      const sizes = await page.evaluate(async names => Promise.all(names.map(async name => {
        const image = new Image();
        image.src = `/assets/effect/${encodeURIComponent("アニメーション追記")}/${encodeURIComponent(name)}.webp`;
        await image.decode();
        return { name, width:image.width, height:image.height };
      })), names);
      console.log(sizes.map(image => ({ ...image, layout:resolveEffectSheetLayout(image.width, image.height) })));
    }
    assert.deepEqual(errors, []);
    console.log(`effect extra images/custom categories ${width}: playback, gallery, isolation, reload, unique IDs, JSON OK`);
    await page.close();
  }
} finally { await browser.close(); }
