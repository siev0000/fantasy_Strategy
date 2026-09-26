import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const port = 33000 + Math.floor(Math.random() * 80);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["server.js"], {
  cwd:process.cwd(),
  env:{ ...process.env, PORT:String(port), HOST:"127.0.0.1", NODE_ENV:"production", SOCKET_CORS_ORIGINS:baseUrl },
  stdio:["ignore", "pipe", "pipe"]
});

async function waitForServer() {
  let output = "";
  server.stdout.on("data", chunk => { output += String(chunk); });
  server.stderr.on("data", chunk => { output += String(chunk); });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (output.includes("Fantasy Strategy server listening")) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`検証サーバーを起動できませんでした: ${output}`);
}

const browser = await chromium.launch({ headless:true });
try {
  console.log("[character-modal] server start");
  await waitForServer();
  console.log("[character-modal] server ready");
  const page = await browser.newPage({ viewport:{ width:430, height:760 }, isMobile:true, hasTouch:true });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // Socket.IO 接続が継続するため networkidle を待たない。
  await page.goto(baseUrl, { waitUntil:"domcontentloaded" });
  console.log("[character-modal] document ready");
  await page.locator("#v39-play-mode-select.open").waitFor();
  await page.locator("#v39-bootstrap-loading").waitFor({ state:"detached", timeout:10000 });
  await page.evaluate(() => window.closeV39PlayModeSelection?.());
  console.log("[character-modal] bootstrap ready");

  await page.evaluate(() => {
    if (!window.openV39CharacterModal?.()) throw new Error("キャラクター画面を開けません。");
  });
  await page.locator("#characterModal.open").waitFor();
  console.log("[character-modal] empty modal open");
  const emptyText = await page.locator("#characterModal .modal-body").textContent();
  if (!String(emptyText).includes("ゲーム開始後")) throw new Error("初期化前のキャラクター画面に案内が表示されません。");
  await page.locator("#characterModal [data-close]").click();

  await page.evaluate(() => {
    window.startV39LocalSession?.(1, { playMode:"single-test" });
    if (!window.openV39CharacterModal?.()) throw new Error("キャラクター画面を開けません。");
  });
  await page.locator("#characterModal.open").waitFor();
  console.log("[character-modal] data modal open");
  const tabButtons = page.locator("[data-v39-character-detail-tab]");
  if (await tabButtons.count() !== 4) throw new Error("キャラクター詳細の4タブが表示されていません。");

  const detailPanelSelectorByTab = {
    status:".v39-char-status-grid",
    skills:".v39-char-technique-list, .v39-char-empty",
    equipment:".v39-char-equipment-list",
    growth:".v39-char-growth-list"
  };
  for (const [key, title] of [["status", "ステータス技能"], ["skills", "スキル"], ["equipment", "装備"], ["growth", "成長"]]) {
    await page.locator(`[data-v39-character-detail-tab="${key}"]`).click();
    const active = page.locator(`[data-v39-character-detail-tab="${key}"].active`);
    if (!(await active.count())) throw new Error(`${title} タブへ切り替えられません。`);
    if (!(await page.locator(`#characterModal ${detailPanelSelectorByTab[key]}`).count())) {
      throw new Error(`${title} タブの内容が表示されません。`);
    }
  }
  await page.screenshot({ path:"output/web-game/v39-character-modal-tabs.png" });
  console.log("[character-modal] screenshot captured");
  const bodyText = await page.locator("#characterModal .modal-body").textContent();
  if (!String(bodyText).includes("成長") || !String(bodyText).includes("総合Lv")) {
    throw new Error("成長タブの内容が表示されません。");
  }
  await page.close();
  console.log(JSON.stringify({ emptyText, bodyText, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
