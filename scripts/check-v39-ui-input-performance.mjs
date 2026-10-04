import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const browser = await chromium.launch(), errors = [];
const page = await browser.newPage({ viewport:{ width:390, height:844 } });
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
  await page.getByRole("button", { name:"探索開始", exact:true }).click();
  await page.waitForTimeout(1300);
  const report = await page.evaluate(async () => {
    const check = (value, message) => { if (!value) throw new Error(message); };
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    const game = window.__v39FieldRuntime.game, scene = game.scene.getScenes(true)[0];
    const before = { ...game.v39RenderStats };
    let timer = false;
    scene.time.delayedCall(100, () => { timer = true; });
    await delay(500);
    const idle = { drawn:game.v39RenderStats.drawn-before.drawn, skipped:game.v39RenderStats.skipped-before.skipped };
    check(timer, "scene timers still run while static render is skipped");
    check(idle.drawn <= 3 && idle.skipped > 10, "idle map is not redrawn every frame");
    const marker = scene.add.rectangle(100,100,10,10,0xffffff);
    const start = game.v39RenderStats.drawn;
    scene.tweens.add({ targets:marker, x:180, duration:300 });
    await delay(400);
    check(Math.abs(marker.x-180)<1 && game.v39RenderStats.drawn-start>5, "tween remains smooth and completes");
    marker.destroy();
    const camera = scene.cameras.main, prior = game.v39RenderStats.drawn;
    camera.scrollX += 10;
    await delay(70);
    check(game.v39RenderStats.drawn>prior, "camera changes repaint immediately");
    const state = window.getV39GameState, reads = [];
    window.getV39GameState = (...args) => { reads.push(args); return state(...args); };
    try {
      window.activateV39FooterTab("settlement");
      window.activateV39FooterTab("squad");
      window.activateV39FooterTab("settlement");
      check(reads.length===0, "opening prepared settlement panel does not copy whole state");
    } finally { window.getV39GameState = state; }
    window.activateV39FooterTab("squad");
    document.querySelector('[data-squad-detail-tab="action"]').click();
    return { idle, animatedFrames:game.v39RenderStats.drawn-start };
  });
  const zoomBefore = await page.evaluate(() => window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.zoom);
  const canvas = await page.locator('#v39-phaser-field canvas').boundingBox();
  await page.mouse.move(canvas.x+canvas.width/2, canvas.y+canvas.height/2);
  await page.mouse.wheel(0,-150);
  await page.waitForTimeout(200);
  assert.ok(await page.evaluate(() => window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.zoom)>zoomBefore, "map input still zooms while idle render is enabled");
  const pane = page.locator('[data-squad-detail-panel="action"]');
  // 長い行動一覧のスクロールをテスト用の末尾行で保証する。
  await pane.evaluate(el => { const row=document.createElement("div"); row.dataset.scrollFixture="true"; row.style.height="1000px"; el.appendChild(row); });
  const rect = await pane.boundingBox();
  await page.mouse.move(rect.x+rect.width/2, rect.y+40);
  await page.mouse.wheel(0,250);
  await page.waitForTimeout(300);
  assert.ok(await pane.evaluate(el => el.scrollTop)>0, "native UI scroll moves");
  await pane.evaluate(el => el.querySelector('[data-scroll-fixture]').remove());
  const effect = await page.evaluate(async () => {
    const game=window.__v39FieldRuntime.game, unit=window.getV39ActiveFactionState().units[0];
    const before=game.v39RenderStats.drawn;
    await window.playV39MapEffect({ x:unit.x, y:unit.y, allowInFog:true, totalDurationMs:400 });
    return game.v39RenderStats.drawn-before;
  });
  assert.ok(effect>5, "effect continues to draw frames");
  assert.deepEqual(errors, []);
  mkdirSync("output/web-game/ui-input-performance", { recursive:true });
  await page.screenshot({ path:"output/web-game/ui-input-performance/mobile.png" });
  console.log("PASS UI input / idle render", { ...report, effectFrames:effect, errors });
} finally { await browser.close(); }
