import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const readJson = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const categories = readJson("config/v39-effect-categories.json");
const rows = readJson("data/source/export/json/スキル一覧.json");
const means = new Set(rows.flatMap(row => [row.攻撃手段, ...[...String(row.詳細 || "").matchAll(/攻撃手段[:：]\s*([^\s]+)/g)].map(match => match[1])]).filter(Boolean));
for (const name of means) assert.ok(categories.some(category => category.name === name), `missing attack means: ${name}`);
assert.ok(categories.some(category => category.name === "針"));
const catalog = new Set([...readJson("assets/effect/320×240/effect_list.json"), ...readJson("assets/effect/アニメーション1/effect_list.json")]);
for (const category of categories) assert.ok(catalog.has(category.defaultEffect), `missing default image: ${category.name}`);
const output = "output/web-game/effect-attack-means";
mkdirSync(output, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    for (const category of categories.filter(category => category.independent)) {
      await page.locator("#v39-effect-composite-selector").selectOption(category.id);
      assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), category.defaultEffect);
      assert.equal(await page.locator("#v39-effect-category-name-row").isVisible(), false);
    }
    for (const id of ["tail", "wing"]) {
      await page.locator("#v39-effect-composite-selector").selectOption(id);
      await page.locator("#v39-effect-setting-preview-local").click();
      await page.waitForTimeout(400);
      await page.screenshot({ path:`${output}/${id}-${width}.png` });
      assert.ok(!(await page.locator("#v39-effect-settings-status").textContent()).includes("失敗"));
    }
    await page.locator("#v39-effect-composite-selector").selectOption("horn");
    await page.locator("#v39-effect-setting-rotation").fill("45");
    await page.locator("#v39-effect-setting-rotation").dispatchEvent("input");
    for (const id of ["needle", "spear", "thrust"]) {
      await page.locator("#v39-effect-composite-selector").selectOption(id);
      assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "0");
    }
    await page.reload({ waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator("#v39-effect-composite-selector").selectOption("horn");
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "45");
    assert.deepEqual(errors, []);
    console.log(`attack means ${width}: ${means.size} means + needle covered; defaults, tail/wing playback, isolation, reload OK`);
    await page.close();
  }
} finally { await browser.close(); }
