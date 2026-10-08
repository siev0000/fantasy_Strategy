import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
  await page.getByRole("button", { name:"探索開始", exact:true }).click();
  const modulePath = `/@fs/${process.cwd().replaceAll("\\", "/")}/配布用/アニメーション再生機能/phaser-effect-player.mjs`;
  const result = await page.evaluate(async path => {
    const { PhaserEffectPlayer } = await import(path);
    const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const player = new PhaserEffectPlayer(scene);
    const source = document.createElement("canvas");
    source.width = source.height = 100;
    source.getContext("2d").fillStyle = "white";
    source.getContext("2d").fillRect(5, 0, 95, 100);
    source.getContext("2d").fillStyle = "rgba(40, 80, 120, 0.5)";
    source.getContext("2d").fillRect(1, 0, 3, 100);
    const request = { src:source.toDataURL(), x:100, y:100, gradientEnabled:true,
      gradientColorA:"#FF0000", gradientColorB:"#0000FF", gradientDirection:"up",
      gradientSpeedPercentPerSecond:0, gradientStartPercent:30, gradientEndPercent:70, renderStyle:"none" };
    const sample = () => {
      const canvas = player.effectImage.texture.getSourceImage();
      return [5, 20, 50, 80, 95].map(y => Array.from(canvas.getContext("2d").getImageData(50, y, 1, 1).data));
    };
    await player.showFrame(request);
    const range = sample();
    const canvas = player.effectImage.texture.getSourceImage();
    const alpha = canvas.getContext("2d").getImageData(0, 50, 1, 1).data[3];
    await player.showFrame({ ...request, colorStrengthPercent:0 });
    const original = sample();
    const untouched = Array.from(player.effectImage.texture.getSourceImage().getContext("2d").getImageData(2, 50, 1, 1).data);
    const sourcePixel = Array.from(source.getContext("2d").getImageData(2, 50, 1, 1).data);
    await player.showFrame({ ...request, gradientStartPercent:50, gradientEndPercent:50 });
    const hard = sample();
    await player.showFrame({ ...request, colorStrengthPercent:50 });
    const half = sample();
    const keys = [...player.gradientTextureKeys];
    player.destroy();
    return { range, alpha, original, untouched, sourcePixel, hard, half, cleaned:keys.every(key => !scene.textures.exists(key)) };
  }, modulePath);
  assert.deepEqual(result.range[0], [255, 0, 0, 255]);
  assert.deepEqual(result.range[1], [255, 0, 0, 255]);
  assert.deepEqual(result.range[3], [0, 0, 255, 255]);
  assert.ok(result.range[2][0] > 110 && result.range[2][2] > 110);
  assert.ok(result.original.every(pixel => pixel.every(channel => channel === 255)));
  assert.equal(result.alpha, 0);
  assert.deepEqual(result.untouched, result.sourcePixel);
  assert.deepEqual(result.hard[1], [255, 0, 0, 255]);
  assert.deepEqual(result.hard[2], [0, 0, 255, 255]);
  assert.ok(result.half[0][1] >= 127);
  assert.equal(result.cleaned, true);
  console.log("gradient pixels: range, hard edge, 0/50/100% strength, alpha, cleanup OK");
} finally {
  await browser.close();
}
