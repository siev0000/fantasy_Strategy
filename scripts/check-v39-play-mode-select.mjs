import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

async function checkSelection(playMode) {
  const page = await browser.newPage({ viewport:{ width:430, height:760 }, isMobile:true, hasTouch:true });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.locator("#v39-play-mode-select.open").waitFor();
  if (await page.locator("#v39-field-settings-modal.open").count()) throw new Error("形式選択より先にゲーム開始設定が開いています。");
  await page.locator(`[data-v39-play-mode=${playMode}]`).click();
  const targetSelector = playMode === "multiplayer" ? "#v39-multiplayer-lobby.open" : "#v39-field-settings-modal.open";
  await page.locator(targetSelector).waitFor();
  const subtitle = playMode === "single"
    ? await page.locator("#v39-field-settings-subtitle").textContent()
    : await page.locator("#v39-room-title").textContent();
  const fieldSettingsOpen = await page.locator("#v39-field-settings-modal.open").count();
  await page.close();
  return { playMode, subtitle, fieldSettingsOpen, errors };
}

const browser = await chromium.launch({ headless:true });
try {
  const single = await checkSelection("single");
  const multiplayer = await checkSelection("multiplayer");
  console.log(JSON.stringify({ single, multiplayer }, null, 2));
  if (single.errors.length || multiplayer.errors.length
    || !String(single.subtitle).includes("シングルプレイ")
    || !String(multiplayer.subtitle).includes("通信ルーム")
    || multiplayer.fieldSettingsOpen) process.exitCode = 1;
} finally {
  await browser.close();
}
