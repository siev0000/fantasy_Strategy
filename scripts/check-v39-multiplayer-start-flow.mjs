import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const port = 32900 + Math.floor(Math.random() * 80);
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
  await waitForServer();
  const page = await browser.newPage({ viewport:{ width:430, height:760 }, isMobile:true, hasTouch:true });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  // Socket.IO接続は継続するため、networkidleでは待たない。
  await page.goto(baseUrl, { waitUntil:"domcontentloaded" });
  await page.locator("#v39-play-mode-select.open").waitFor();
  await page.locator("[data-v39-play-mode=multiplayer]").click();
  await page.locator("#v39-multiplayer-lobby.open").waitFor();
  if (await page.locator("#v39-field-settings-modal.open").count()) throw new Error("マルチ選択直後にゲーム開始設定が開いています。");
  if (await page.locator("[data-v39-room-id]:visible").count()) throw new Error("ルーム作成タブに参加用ルームID入力が表示されています。");
  const tabLabels = await page.locator("[data-v39-room-tab]").allTextContents();
  if (tabLabels.join("|") !== "ルーム作成|ルーム参加") throw new Error("ルーム作成・参加の2タブが表示されていません。");
  await page.locator("[data-v39-room-tab=join]").click();
  if (!(await page.locator("[data-v39-room-id]:visible").count())) throw new Error("ルーム参加タブへ切り替えてもルームID入力が表示されません。");
  if (await page.locator("[data-v39-room-name]:visible").count()) throw new Error("ルーム参加タブにルーム名入力が残っています。");
  await page.locator("[data-v39-room-tab=create]").click();

  await page.locator("[data-v39-room-player-name]").fill("ホスト");
  await page.locator("[data-v39-room-name]").fill("通信開始テスト");
  await page.waitForFunction(() => !document.querySelector("[data-v39-room-action=create]")?.disabled, null, { timeout:5000 });
  await page.locator("[data-v39-room-action=create]").click();
  await page.locator(".v39-room-id").waitFor();
  const roomId = await page.locator(".v39-room-id").textContent();
  if (!/^\d{8}$/.test(String(roomId))) throw new Error("作成されたルームIDが8桁の数字ではありません。");
  if (await page.locator("[data-v39-room-entry]:visible").count()) throw new Error("入室後もルーム作成・参加フォームが残っています。");
  if (await page.locator("[data-v39-room-tabs]:visible").count()) throw new Error("入室後もルーム作成・参加タブが残っています。");
  if (!(await page.locator("[data-v39-room-action=start-game]:visible").count())) throw new Error("ホストのゲーム開始ボタンがロビー上部に表示されていません。");
  try {
    await page.locator("[data-v39-room-action=game-settings]").click({ timeout:5000 });
    await page.locator("#v39-field-settings-modal.open").waitFor({ timeout:5000 });
  } catch (error) {
    const modalState = await page.evaluate(() => ({
      fieldSettingsOpen:document.querySelector("#v39-field-settings-modal")?.className,
      lobbyOpen:document.querySelector("#v39-multiplayer-lobby")?.className,
      gameSettingsButton:document.querySelector("[data-v39-room-action=game-settings]")?.outerHTML,
      status:document.querySelector("[data-v39-room-status]")?.textContent
    }));
    throw new Error(`ホスト設定を開けませんでした: ${String(error)}\n${JSON.stringify(modalState)}`);
  }

  const hiddenControls = await page.evaluate(() => [
    document.getElementById("v39-field-local-player-row")?.hidden,
    document.getElementById("v39-start-participant-section")?.hidden,
    document.getElementById("v39-start-online-section")?.hidden
  ]);
  const primaryText = await page.locator("#v39-field-generate").textContent();
  if (hiddenControls.some(value => value !== true) || primaryText !== "ロビー設定を保存") {
    throw new Error("ホスト用ゲーム開始設定がロビー専用表示になっていません。");
  }
  await page.locator("#v39-field-map-size").selectOption("36x36");
  await page.locator("#v39-field-generate").click();
  await page.locator("#v39-field-settings-modal.open").waitFor({ state:"detached", timeout:1000 }).catch(async () => {
    await page.waitForFunction(() => !document.querySelector("#v39-field-settings-modal.open"));
  });
  await page.waitForFunction(() => document.querySelector(".v39-room-note")?.textContent?.includes("36x36"));
  const summary = await page.locator(".v39-room-note").filter({ hasText:"ゲーム設定" }).textContent();
  const statusAfterSettings = await page.locator("[data-v39-room-status]").textContent();
  await page.locator("[data-v39-room-action=ready]").click();
  await page.waitForFunction(() => !document.querySelector("[data-v39-room-action=start-game]")?.disabled);
  await page.locator("[data-v39-room-action=start-game]").click();
  await page.waitForFunction(() => {
    const runtime = window.__v39FieldRuntime;
    return runtime?.mapData?.w === 36 && runtime?.mapData?.h === 36;
  }, null, { timeout:10000 });
  await page.waitForFunction(() => !document.querySelector("#v39-multiplayer-lobby")?.classList.contains("open"), null, { timeout:10000 });
  const multiplayerState = await page.evaluate(() => {
    const state = window.getV39GameState?.();
    return {
      playerCount:state?.players?.length || 0,
      participantCount:state?.sessionParticipants?.length || 0,
      controllerParticipantId:state?.players?.[0]?.controllerParticipantId || "",
      participantId:state?.sessionParticipants?.[0]?.participantId || "",
      controlMode:state?.sessionParticipants?.[0]?.controlMode || "",
      mapWidth:window.__v39FieldRuntime?.mapData?.w || 0,
      mapHeight:window.__v39FieldRuntime?.mapData?.h || 0
    };
  });
  if (multiplayerState.playerCount !== 1 || multiplayerState.participantCount !== 1
    || !multiplayerState.participantId
    || multiplayerState.controllerParticipantId !== multiplayerState.participantId
    || multiplayerState.controlMode !== "remote"
    || multiplayerState.mapWidth !== 36 || multiplayerState.mapHeight !== 36) {
    throw new Error(`マルチプレイ開始状態が不正です: ${JSON.stringify(multiplayerState)}`);
  }
  await page.screenshot({ path:"output/web-game/v39-multiplayer-start-flow.png" });
  await page.close();
  console.log(JSON.stringify({ hiddenControls, primaryText, summary, statusAfterSettings, multiplayerState, errors }, null, 2));
  if (errors.length || !String(summary).includes("36x36") || statusAfterSettings !== "ゲーム開始設定を共有しました。") process.exitCode = 1;
} finally {
  await browser.close();
  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), new Promise(resolve => setTimeout(resolve, 1000))]);
}
