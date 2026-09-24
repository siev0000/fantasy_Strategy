import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:524, height:420 }, isMobile:true, hasTouch:true });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
await page.waitForFunction(() => typeof window.openFieldSettingsModal === "function");
await page.evaluate(() => window.openFieldSettingsModal());

const body = page.locator(".v39-field-settings-body");
await body.waitFor();
const before = await body.evaluate(element => ({
  scrollTop:element.scrollTop,
  scrollHeight:element.scrollHeight,
  clientHeight:element.clientHeight,
  overflowY:getComputedStyle(element).overflowY,
  touchAction:getComputedStyle(element).touchAction
}));
const box = await body.boundingBox();
if (!box) throw new Error("設定本文の表示領域がありません");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.wheel(0, 480);
await page.waitForTimeout(100);
const after = await body.evaluate(element => ({
  scrollTop:element.scrollTop,
  scrollHeight:element.scrollHeight,
  clientHeight:element.clientHeight
}));
const actions = await page.locator(".v39-field-settings-actions").evaluate(element => {
  const rect = element.getBoundingClientRect();
  return { top:rect.top, bottom:rect.bottom, viewportHeight:window.innerHeight };
});

await browser.close();
console.log(JSON.stringify({ before, after, actions, errors }, null, 2));

if (errors.length
  || before.overflowY !== "auto"
  || before.touchAction !== "pan-y"
  || before.scrollHeight <= before.clientHeight
  || after.scrollTop <= before.scrollTop
  || actions.bottom > actions.viewportHeight + 1) process.exitCode = 1;
