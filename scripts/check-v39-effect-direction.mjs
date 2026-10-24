import assert from "node:assert/strict";
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const output = "output/web-game/effect-direction";
const transformSource = readFileSync(new URL("../frontend/src/lib/v39-effect-transform.js", import.meta.url), "utf8");
const { normalizeV39EffectTransform, resolveV39EffectTransform } = await import(`data:text/javascript;base64,${Buffer.from(transformSource).toString("base64")}`);
assert.deepEqual(normalizeV39EffectTransform(), { rotationDeg:0, offsetX:0, offsetY:0, placementMode:'target' });
assert.deepEqual(normalizeV39EffectTransform({ rotationDeg:999, offsetX:-999, offsetY:"bad" }), { rotationDeg:180, offsetX:-300, offsetY:0, placementMode:'target' });
assert.deepEqual(resolveV39EffectTransform({ rotationDeg:90, offsetX:12, offsetY:-8 }, { x:100, y:100 }, 180), { x:108, y:112, angleDeg:90 });
for (const [angle, x, y] of [[0, 112, 92], [90, 108, 112], [180, 88, 108], [270, 92, 88]]) {
  const result = resolveV39EffectTransform({ orientToAttack:true, offsetX:12, offsetY:-8 }, { x:100, y:100 }, angle);
  assert.ok(Math.abs(result.x - x) < 1e-8 && Math.abs(result.y - y) < 1e-8);
}
assert.deepEqual(resolveV39EffectTransform({ rotationDeg:90, offsetX:12, offsetY:-8 }, { x:100, y:100 }, 0, 0), { x:112, y:92, angleDeg:0 });
mkdirSync(output, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100, 390]) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    page.setDefaultTimeout(20000);
    const errors = [], angles = [], plays = [];
    page.on("pageerror", error => errors.push(String(error)));
    page.on("console", async message => {
      if (message.text().startsWith("[エフェクト再生]")) {
        const playback = await message.args()[1].jsonValue();
        angles.push(playback.角度);
        plays.push(playback);
      }
    });
    await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator('[data-effect-picker-mode="images"]').click();
    const galleryChoice = page.locator('[data-effect-image="斬撃"]');
    await galleryChoice.click();
    await page.waitForFunction(() => document.querySelector('[data-effect-image="斬撃"]')?.dataset.thumbnail === "ready");
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), "斬撃");
    assert.equal(await galleryChoice.getAttribute("aria-pressed"), "true");
    assert.equal(await galleryChoice.locator("canvas").evaluate(canvas => canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value > 0)), true);
    assert.equal(await page.locator("[data-effect-image]").count(), await page.locator("#v39-effect-setting-base option").count());
    await page.screenshot({ path:`${output}/gallery-${width}.png` });
    await page.locator('[data-effect-picker-mode="list"]').click();
    assert.equal(await page.locator("#v39-effect-image-gallery").isVisible(), false);
    assert.equal(await page.locator("#v39-effect-setting-base").inputValue(), "斬撃");
    await page.locator("#v39-effect-setting-base").selectOption("火炎");
    await page.waitForTimeout(300);
    assert.equal(await page.locator("[data-preview-attacker] img").evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await page.locator("[data-preview-target] img").evaluate(img => img.complete && img.naturalWidth > 0), true);
    assert.equal(await page.locator("[data-preview-cell]").count(), 19);
    const attackerBefore = await page.locator("[data-preview-attacker]").boundingBox();
    assert.deepEqual(await page.locator("[data-preview-attacker] img").boundingBox(), attackerBefore);
    for (const id of ["60", "120", "180", "240", "300", "0", "self"]) {
      await page.locator(`[data-preview-cell="${id}"]`).click();
      assert.equal(await page.locator("#v39-effect-preview-direction").inputValue(), id);
      assert.deepEqual(await page.locator("[data-preview-attacker]").boundingBox(), attackerBefore);
      assert.equal(await page.locator("[data-preview-target]").isVisible(), id !== "self");
      if (id !== "self") {
        const target = await page.locator("[data-preview-target]").boundingBox();
        assert.deepEqual(await page.locator("[data-preview-target] img").boundingBox(), target);
        const tile = await page.locator(`[data-preview-cell="${id}"]`).boundingBox();
        assert.ok(Math.abs(target.x + target.width / 2 - tile.x - tile.width / 2) < 1);
        assert.ok(Math.abs(target.y + target.height / 2 - tile.y - tile.height / 2) < 1);
        assert.ok(Math.abs(target.width / tile.width - .95) < .01);
      }
    }
    await page.screenshot({ path:`${output}/self-${width}.png` });
    await page.locator('[data-preview-cell="0"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path:`${output}/hex-${width}.png` });
    await page.locator("#v39-effect-preview-direction").selectOption("180");
    const positions = await page.evaluate(() => {
      const a = document.querySelector("[data-preview-attacker]").getBoundingClientRect();
      const b = document.querySelector("[data-preview-target]").getBoundingClientRect();
      return { attacker:a.x, target:b.x };
    });
    assert.ok(positions.attacker > positions.target);
    const fixed = await page.locator("#v39-effect-idle-preview").evaluate(canvas => canvas.toDataURL());
    await page.locator("#v39-effect-setting-orientation").selectOption("attack");
    await page.waitForTimeout(300);
    const rotated = await page.locator("#v39-effect-idle-preview").evaluate(canvas => canvas.toDataURL());
    assert.notEqual(fixed, rotated);
    for (const [id, value] of [["rotation", "90"], ["offset-x", "12"], ["offset-y", "-8"]]) {
      await page.locator(`#v39-effect-setting-${id}`).fill(value);
      await page.locator(`#v39-effect-setting-${id}`).dispatchEvent("input");
      assert.equal(await page.locator(`#v39-effect-setting-${id}-slider`).inputValue(), value);
    }
    await page.waitForTimeout(300);
    assert.notEqual(rotated, await page.locator("#v39-effect-idle-preview").evaluate(canvas => canvas.toDataURL()));
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(400);
    assert.equal(await page.locator("#v39-effect-idle-preview").evaluate(canvas => getComputedStyle(canvas).display), "none");
    await page.screenshot({ path:`${output}/playing-${width}.png` });
    await page.locator("#v39-effect-playback-mode").selectOption("frame");
    await page.waitForTimeout(300);
    await page.locator("#v39-effect-frame-next").click();
    await page.waitForTimeout(200);
    await page.screenshot({ path:`${output}/frame-${width}.png` });
    await page.reload({ waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.locator("#v39-effect-setting-base").selectOption("火炎");
    assert.equal(await page.locator("#v39-effect-setting-orientation").inputValue(), "attack");
    for (const [id, value] of [["rotation", "90"], ["offset-x", "12"], ["offset-y", "-8"]]) {
      assert.equal(await page.locator(`#v39-effect-setting-${id}`).inputValue(), value);
    }
    await page.locator('[data-v39-effect-tab="data"]').click();
    const downloaded = page.waitForEvent("download");
    await page.locator("#v39-effect-settings-export").click();
    const download = await downloaded;
    const savedPath = `${output}/transform-${width}.json`;
    await download.saveAs(savedPath);
    const saved = JSON.parse(readFileSync(savedPath, "utf8"));
    assert.ok(Object.values(saved.categories).some(category => category.rotationDeg === 90 && category.offsetX === 12 && category.offsetY === -8));
    await page.locator('[data-v39-effect-tab="basic"]').click();
    await page.locator("#v39-effect-setting-reset").click();
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "0");
    await page.locator("#v39-effect-settings-file").setInputFiles(savedPath);
    await page.waitForTimeout(300);
    assert.equal(await page.locator("#v39-effect-setting-rotation").inputValue(), "90");
    await page.locator("#v39-effect-settings-back").click();
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
    await page.getByRole("button", { name:"探索開始", exact:true }).click();
    await page.waitForTimeout(600);
    await page.evaluate(() => { void window.playV39MapEffect({ effectName:document.getElementById("v39-effect-setting-source").value, tileX:10, tileY:10, attackerTile:{ x:11,y:10 }, allowInFog:true }); });
    await page.waitForTimeout(300);
    assert.equal(angles.at(-1), 270);
    for (const [angle, x, y] of [[0, 112, 92], [90, 108, 112], [180, 88, 108], [270, 92, 88]]) {
      await page.evaluate(angle => window.playV39MapEffect({ effectName:document.getElementById("v39-effect-setting-source").value,
        tileX:10, tileY:10, worldX:100, worldY:100, angleDeg:angle, allowInFog:true, totalDurationMs:50 }), angle);
      await page.waitForTimeout(100);
      const playback = plays.at(-1);
      assert.equal(playback.角度, angle);
      assert.ok(Math.abs(playback.表示位置.x - x) < 1e-8 && Math.abs(playback.表示位置.y - y) < 1e-8);
    }
    assert.deepEqual(errors, []);
    console.log(`effect direction ${width}: portraits, direction, idle rotation, playback, frame, persistence, map angle OK`);
    await page.close();
  }
} finally { await browser.close(); }
