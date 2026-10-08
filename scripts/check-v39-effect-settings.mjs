import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const url = process.env.V39_TEST_URL || "http://127.0.0.1:3022";
const output = "output/web-game/effect-settings";
mkdirSync(output, { recursive:true });
const browser = await chromium.launch();
function sameStage(left, right) {
  const data = png => {
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
      offset += length + 12;
    }
    return inflateSync(Buffer.concat(chunks));
  };
  const a = data(left), b = data(right);
  if (a.length !== b.length) return false;
  let different = 0;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) different++;
  // Fractional mobile canvas edges can vary slightly after WebGL rendering.
  return different / a.length < 0.001;
}
try {
  for (const width of (process.env.V39_TEST_WIDTH ? [Number(process.env.V39_TEST_WIDTH)] : [1100, 390])) {
    const page = await browser.newPage({ viewport:{ width, height:844 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.goto(url, { waitUntil:"networkidle" });
    await page.locator("#v39-title-effect-settings-open").click();
    await page.waitForSelector("#v39-effect-preview-stage.is-ready canvas");
    await page.locator("#v39-effect-setting-source").selectOption("火炎");
    await page.waitForTimeout(200);
    const blank = await page.locator("#v39-effect-preview-stage").screenshot();
    await page.locator("#v39-effect-preview-stage").screenshot({ path:`${output}/blank-${width}.png` });
    await page.waitForTimeout(600);
    assert.ok(sameStage(blank, await page.locator("#v39-effect-preview-stage").screenshot()), "opening/selecting does not autoplay");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(300);
    const firstFrame = await page.locator("#v39-effect-preview-stage").screenshot();
    await page.waitForTimeout(200);
    const nextFrame = await page.locator("#v39-effect-preview-stage").screenshot();
    assert.equal(firstFrame.equals(nextFrame), false, "preview animates");
    for (let attempt = 0; attempt < 30; attempt++) {
      await page.waitForTimeout(200);
      if (sameStage(blank, await page.locator("#v39-effect-preview-stage").screenshot())) break;
    }
    await page.waitForTimeout(600);
    const ended = await page.locator("#v39-effect-preview-stage").screenshot({ path:`${output}/ended-${width}.png` });
    assert.ok(sameStage(blank, ended), "one-shot finishes without replay");
    await page.locator("#v39-effect-playback-mode").selectOption("loop");
    assert.ok(sameStage(blank, await page.locator("#v39-effect-preview-stage").screenshot()), "loop mode waits for play");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(2400);
    assert.equal(blank.equals(await page.locator("#v39-effect-preview-stage").screenshot()), false, "loop repeats after completion");
    await page.locator("#v39-effect-playback-mode").selectOption("once");
    const decorationLoaded = page.waitForResponse(response => decodeURIComponent(response.url()).includes("魔法陣.webp") && response.ok());
    await page.locator("#v39-effect-setting-decoration").selectOption("魔法陣");
    await page.locator("#v39-effect-setting-preview-local").click();
    await decorationLoaded;
    await page.waitForTimeout(500);
    await page.screenshot({ path:`${output}/decoration-${width}.png` });
    await page.locator("#v39-effect-playback-mode").selectOption("frame");
    await page.waitForFunction(() => Number(document.getElementById("v39-effect-frame-slider").max) > 1);
    const maxFrame = await page.locator("#v39-effect-frame-slider").getAttribute("max");
    const middle = Math.floor(Number(maxFrame) / 2);
    await page.locator("#v39-effect-frame-slider").fill(String(middle));
    await page.waitForTimeout(100);
    const frozen = await page.locator("#v39-effect-preview-stage").screenshot();
    await page.waitForTimeout(600);
    assert.ok(sameStage(frozen, await page.locator("#v39-effect-preview-stage").screenshot()), "manual frame remains frozen");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForTimeout(350);
    const playingFrame = await page.locator("#v39-effect-preview-stage").screenshot();
    await page.waitForTimeout(250);
    assert.equal(playingFrame.equals(await page.locator("#v39-effect-preview-stage").screenshot()), false, "play button animates in frame mode too");
    await page.waitForFunction(() => document.getElementById("v39-effect-settings-status").textContent.includes("再生完了"));
    await page.waitForTimeout(100);
    assert.ok(sameStage(frozen, await page.locator("#v39-effect-preview-stage").screenshot()), "play returns to selected frame");
    await page.locator("#v39-effect-frame-next").click();
    await page.waitForFunction(index => document.getElementById("v39-effect-frame-slider").value === String(index), middle + 1);
    await page.locator("#v39-effect-frame-prev").click();
    await page.waitForFunction(index => document.getElementById("v39-effect-frame-slider").value === String(index), middle);
    await page.locator("#v39-effect-frame-slider").fill(maxFrame);
    await page.waitForTimeout(100);
    assert.equal(await page.locator("#v39-effect-frame-next").isDisabled(), true);
    await page.screenshot({ path:`${output}/frames-${width}.png` });
    await page.locator("#v39-effect-playback-mode").selectOption("once");
    await page.locator('[data-v39-effect-tab="color"]').click();
    const mode = page.locator("#v39-effect-setting-color-mode");
    assert.equal(await mode.inputValue(), "none");
    assert.equal(await page.locator("#v39-effect-color-single").isVisible(), false);
    assert.equal(await page.locator("#v39-effect-color-gradient").isVisible(), false);
    await mode.selectOption("tint");
    await page.locator("#v39-effect-setting-tint-preset").selectOption("#2196F3");
    assert.equal((await page.locator("#v39-effect-setting-tint").inputValue()).toUpperCase(), "#2196F3");
    assert.equal(await page.locator("#v39-effect-color-single").isVisible(), true);
    await mode.selectOption("none");
    assert.equal(await page.locator("#v39-effect-color-strength").isVisible(), false);
    assert.equal(await page.locator("#v39-effect-gradient-guides").isVisible(), false);
    await mode.selectOption("gradient");
    assert.equal(await page.locator("#v39-effect-color-single").isVisible(), false);
    await page.locator("#v39-effect-setting-gradient-a-preset").selectOption("#FF3B1F");
    await page.locator("#v39-effect-setting-gradient-b-preset").selectOption("#FFD54A");
    await page.locator("#v39-effect-setting-gradient-a").evaluate(input => {
      input.value = "#ab1234";
      input.dispatchEvent(new Event("input", { bubbles:true }));
    });
    assert.equal(await page.locator("#v39-effect-setting-gradient-a-preset").inputValue(), "");
    await page.locator("#v39-effect-setting-gradient-a-preset").selectOption("#FF3B1F");
    const colorBoxes = await page.locator(".v39-effect-colors .v39-effect-color-card").evaluateAll(cards => cards.map(card => ({ x:card.getBoundingClientRect().x, y:card.getBoundingClientRect().y })));
    assert.equal(colorBoxes[0].y, colorBoxes[1].y, "gradient colors share a row on desktop and mobile");
    assert.ok(colorBoxes[1].x > colorBoxes[0].x);
    await page.screenshot({ path:`${output}/compact-colors-${width}.png` });
    assert.equal(await page.locator("#v39-effect-setting-gradient-start").inputValue(), "0");
    assert.equal(await page.locator("#v39-effect-setting-gradient-end").inputValue(), "100");
    await page.locator("#v39-effect-playback-mode").selectOption("frame");
    await page.waitForTimeout(200);
    const centeredGradient = await page.locator("#v39-effect-preview-stage").screenshot();
    await page.locator("#v39-effect-setting-gradient-start-slider").fill("30");
    await page.locator("#v39-effect-setting-gradient-end").fill("70");
    await page.locator("#v39-effect-setting-strength-slider").fill("80");
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#v39-effect-setting-gradient-start").inputValue(), "30");
    assert.equal(await page.locator("#v39-effect-setting-gradient-end-slider").inputValue(), "70");
    assert.equal(await page.locator("#v39-effect-setting-strength").inputValue(), "80");
    assert.equal(await page.locator("#v39-effect-gradient-guides").isVisible(), true);
    const vertical = await page.locator("#v39-effect-gradient-guides").evaluate(svg => {
      const rect = svg.querySelector("rect");
      return { top:Number(rect.getAttribute("y")), height:Number(rect.getAttribute("height")),
        start:Number(svg.querySelector('[data-guide="start"] line').getAttribute("y1")),
        end:Number(svg.querySelector('[data-guide="end"] line').getAttribute("y1")), text:svg.textContent };
    });
    assert.ok(Math.abs(vertical.start - (vertical.top + vertical.height * 0.3)) < 0.01);
    assert.ok(Math.abs(vertical.end - (vertical.top + vertical.height * 0.7)) < 0.01);
    assert.ok(vertical.text.includes("上0%"));
    assert.equal(centeredGradient.equals(await page.locator("#v39-effect-preview-stage").screenshot()), false, "range and strength change the static gradient rendering");
    await page.screenshot({ path:`${output}/gradient-range-${width}.png` });
    await page.locator("#v39-effect-playback-mode").selectOption("once");
    await page.locator('[data-v39-effect-tab="motion"]').click();
    await page.locator("#v39-effect-setting-gradient-direction").selectOption("right");
    const horizontal = await page.locator("#v39-effect-gradient-guides").evaluate(svg => {
      const rect = svg.querySelector("rect");
      return { left:Number(rect.getAttribute("x")), width:Number(rect.getAttribute("width")),
        start:Number(svg.querySelector('[data-guide="start"] line').getAttribute("x1")), text:svg.textContent };
    });
    assert.ok(Math.abs(horizontal.start - (horizontal.left + horizontal.width * 0.3)) < 0.01);
    assert.ok(horizontal.text.includes("左0%"));
    await page.screenshot({ path:`${output}/horizontal-guides-${width}.png` });
    assert.equal(await page.locator("#v39-effect-setting-gradient-start").isDisabled(), false);
    await page.locator("#v39-effect-setting-gradient-speed").fill("120");
    await page.locator("#v39-effect-setting-gradient-speed").press("Tab");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("v39-effect-settings-v1")).effects["火炎"]);
    assert.equal(saved.gradientEnabled, true);
    assert.equal(saved.gradientDirection, "right");
    assert.equal(saved.gradientSpeedPercentPerSecond, 120);
    assert.equal(saved.gradientStartPercent, 30);
    assert.equal(saved.gradientEndPercent, 70);
    assert.equal(saved.colorStrengthPercent, 80);
    await page.locator('[data-v39-effect-tab="data"]').click();
    assert.equal(await page.locator("#v39-effect-gradient-guides").isVisible(), false);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#v39-effect-settings-export").click();
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.json$/);
    await page.locator("#v39-effect-settings-file").setInputFiles({
      name:"settings.json", mimeType:"application/json",
      buffer:Buffer.from(JSON.stringify({ schema:"v39-effect-settings", version:2, effects:{ "火炎":{ baseEffect:"火炎", scaleMultiplierPercent:150, gradientEnabled:true, gradientHeightPercent:30 } } }))
    });
    await page.locator('[data-v39-effect-tab="basic"]').click();
    await page.waitForFunction(() => document.getElementById("v39-effect-setting-scale").value === "150");
    assert.equal(await page.locator("#v39-effect-setting-gradient-start").inputValue(), "0");
    assert.equal(await page.locator("#v39-effect-setting-gradient-end").inputValue(), "80");
    assert.equal(await page.locator("#v39-effect-setting-strength").inputValue(), "100");
    await page.screenshot({ path:`${output}/title-${width}.png` });
    await page.locator("#v39-effect-settings-back").click();
    assert.equal(await page.locator("#v39-title-effect-settings-host").count(), 0);
    await page.locator("#v39-title-effect-settings-open").click();
    assert.equal(await page.locator("#v39-effect-preview-stage canvas").count(), 1);
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.locator("#v39-effect-settings-back").click();

    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
    await page.getByRole("button", { name:"探索開始", exact:true }).click();
    await page.locator('[data-foot="manage"]').click();
    await page.locator("#v39-manage-effect-settings").click();
    const bounds = await page.evaluate(() => {
      const panel = document.getElementById("v39-effect-settings-panel").getBoundingClientRect();
      const status = document.getElementById("v39-effect-settings-status").getBoundingClientRect();
      const body = document.querySelector(".v39-effect-settings-body").getBoundingClientRect();
      return { bottom:panel.bottom, statusBottom:status.bottom, bodyHeight:body.height };
    });
    assert.ok(bounds.statusBottom <= bounds.bottom + 1, "status stays in management panel");
    assert.ok(bounds.bodyHeight >= 70, "settings have usable scrolling space");
    const mapPixels = [];
    for (const height of [30, 80]) {
      await page.evaluate(value => {
        const unit = window.getV39ActiveFactionState().units[0];
        void window.playV39MapEffect({ effectName:"火炎", x:unit.x, y:unit.y, allowInFog:true,
          gradientStartPercent:value, gradientEndPercent:100, gradientSpeedPercentPerSecond:0, totalDurationMs:3000 });
      }, height);
      await page.waitForFunction(() => window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(child => child.name === "v39-effect-image"));
      mapPixels.push(await page.evaluate(() => {
        const image = window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(child => child.name === "v39-effect-image");
        const canvas = image.texture.getSourceImage();
        const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
        return pixels.reduce((sum, value, index) => sum + (index % 4 === 3 ? 0 : value), 0);
      }));
    }
    assert.notEqual(mapPixels[0], mapPixels[1], "map playback uses gradient range too");
    await page.locator('[data-v39-effect-tab="color"]').click();
    await page.locator("#v39-effect-setting-color-mode").selectOption("gradient");
    await page.locator('[data-v39-effect-tab="basic"]').click();
    await page.locator("#v39-effect-setting-reset").click();
    await page.screenshot({ path:`${output}/manage-${width}.png` });
    await page.locator("#v39-effect-settings-back").click();
    await page.locator("#v39-manage-effect-settings").click();
    assert.equal(await page.locator("#v39-effect-preview-stage canvas").count(), 1);
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForFunction(() => document.getElementById("v39-effect-settings-status").textContent.includes("再生中"));
    await page.waitForTimeout(500);
    await page.screenshot({ path:`${output}/manage-playing-${width}.png` });
    await page.waitForFunction(() => document.getElementById("v39-effect-settings-status").textContent.includes("再生完了"));
    await page.route("**/assets/effect/**/pipo-btleffect155_image-splitter.webp", route => route.abort());
    await page.locator("#v39-effect-setting-source").selectOption("pipo-btleffect155_image-splitter");
    await page.locator("#v39-effect-setting-preview-local").click();
    await page.waitForFunction(() => document.getElementById("v39-effect-settings-status").classList.contains("is-error"));
    assert.deepEqual(errors, []);
    console.log(`effect settings ${width}: animation, controls, save/import/export, reopen, management bounds OK`);
    await page.close();
  }
} finally {
  await browser.close();
}
