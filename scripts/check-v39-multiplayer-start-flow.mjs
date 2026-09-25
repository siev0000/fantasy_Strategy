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
  await page.evaluate(() => document.getElementById("v39-multiplayer-lobby")?.dispatchEvent(new MouseEvent("click", { bubbles:true })));
  if (!(await page.locator("#v39-multiplayer-lobby.open").count())) throw new Error("通信ロビーが背景クリックで閉じています。");
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
    await page.evaluate(() => document.getElementById("v39-field-settings-modal")?.dispatchEvent(new MouseEvent("click", { bubbles:true })));
    if (!(await page.locator("#v39-field-settings-modal.open").count())) throw new Error("通信ルームのゲーム開始設定が背景クリックで閉じています。");
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
  await page.waitForFunction(() => [...document.querySelectorAll(".v39-room-note")]
    .some(note => note.textContent?.includes("ゲーム設定: 36x36")));
  const summary = await page.locator(".v39-room-note").filter({ hasText:"ゲーム設定" }).textContent();
  const statusAfterSettings = await page.locator("[data-v39-room-status]").textContent();
  const factionSelectButton = page.locator('[data-v39-room-action="select-faction"][data-v39-room-player-id="player-1"]');
  if (!(await factionSelectButton.count()) || await factionSelectButton.isDisabled()) {
    throw new Error("担当勢力の開始種族を選択できません。");
  }
  await factionSelectButton.click();
  await page.locator('[data-v39-race-option="只人"]').waitFor({ timeout:5000 });
  if (await page.locator("#v39-multiplayer-lobby.open").count()) {
    throw new Error("共通種族選択画面を開いている間も通信ロビーが前面に残っています。");
  }

  await page.locator('[data-v39-race-option="只人"]').click();
  const sharedRaceTabs = page.locator(".detail-tabs button");
  if (await sharedRaceTabs.count() !== 3) {
    throw new Error("共通種族選択画面がステータス・技能・スキルの3タブ表示になっていません。");
  }
  const statusBodyText = await page.locator(".detail-tab-panel").textContent();
  if (!statusBodyText?.includes("HP") || !statusBodyText?.includes("攻撃") || !statusBodyText?.includes("防御")) {
    throw new Error("共通種族選択画面のステータス詳細が表示されていません。");
  }
  await sharedRaceTabs.filter({ hasText:"技能" }).click();
  if ((await sharedRaceTabs.filter({ hasText:"技能" }).getAttribute("aria-selected")) !== "true") {
    throw new Error("共通種族選択画面の技能タブへ切り替えられません。");
  }
  await sharedRaceTabs.filter({ hasText:"スキル" }).click();
  if ((await sharedRaceTabs.filter({ hasText:"スキル" }).getAttribute("aria-selected")) !== "true") {
    throw new Error("共通種族選択画面のスキルタブへ切り替えられません。");
  }
  await page.locator("[data-v39-race-confirm]").click();
  await page.locator("#v39-multiplayer-lobby.open").waitFor({ timeout:5000 });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-v39-room-action="select-faction"][data-v39-room-player-id="player-1"]')?.closest(".v39-faction-select-card");
    return card?.textContent?.includes("開始種族: 只人");
  });

  await page.locator("[data-v39-room-action=ready]").click();
  await page.waitForFunction(() => !document.querySelector("[data-v39-room-action=start-game]")?.disabled);

  // ゲーム開始設定だけを変更しても準備完了は維持する。
  await page.locator("[data-v39-room-action=game-settings]").click();
  await page.locator("#v39-field-settings-modal.open").waitFor();
  await page.locator("#v39-field-neutral-village-count").fill("3");
  await page.locator("#v39-field-generate").click();
  await page.waitForFunction(() => document.querySelector("[data-v39-room-action=ready]")?.textContent?.includes("準備を解除"));
  await page.waitForFunction(() => !document.querySelector("[data-v39-room-action=start-game]")?.disabled);

  await page.locator("[data-v39-room-action=start-game]").click();
  await page.waitForFunction(() => {
    const runtime = window.__v39FieldRuntime;
    return runtime?.mapData?.w === 36 && runtime?.mapData?.h === 36;
  }, null, { timeout:10000 });

  // セットアップスナップショット読込でPhaserが再生成された後も、破棄済みCameraの入力が残らないことを確認する。
  await page.locator("#v39-initial-sovereign-modal.open").waitFor({ timeout:10000 });
  await page.evaluate(() => {
    const host = document.getElementById("v39-phaser-field");
    if (!(host instanceof HTMLElement)) throw new Error("Phaserフィールドが見つかりません。");
    const rect = host.getBoundingClientRect();
    const init = {
      bubbles:true,
      pointerId:91,
      pointerType:"mouse",
      button:0,
      buttons:1,
      clientX:rect.left + rect.width / 2,
      clientY:rect.top + rect.height / 2
    };
    host.dispatchEvent(new PointerEvent("pointerdown", init));
    host.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons:0 }));
  });
  await page.waitForTimeout(50);
  if (errors.some(message => message.includes("getWorldPoint") || message.includes("reading '0'"))) {
    throw new Error(`Phaser再生成後のマップ入力で例外が発生しました: ${errors.join(" | ")}`);
  }

  // ワールド生成後はplayingへ直行せず、v39統治者作成UIで統治者を作る。
  await page.locator('[data-v39-sovereign-class-card="ファイター"]').click();
  await page.locator("[data-v39-sovereign-name]").fill("テスト統治者");
  await page.locator("[data-v39-sovereign-village]").fill("テスト拠点");
  await page.locator("[data-v39-sovereign-confirm]").click();

  await page.waitForFunction(() => {
    const faction = window.getV39GameState?.()?.players?.[0]?.factionState;
    return faction?.units?.some(unit => unit?.isSovereign === true) && faction?.villagePlacementMode === true;
  }, null, { timeout:10000 });

  // 統治者確定後のsetup snapshotでもPhaserは再生成される。ここで古いCameraの入力が残っていないことを再確認する。
  const errorsBeforePlacementInput = errors.length;
  await page.evaluate(() => {
    const host = document.getElementById("v39-phaser-field");
    if (!(host instanceof HTMLElement)) throw new Error("Phaserフィールドが見つかりません。");
    const rect = host.getBoundingClientRect();
    const init = {
      bubbles:true,
      pointerId:92,
      pointerType:"mouse",
      button:0,
      buttons:1,
      clientX:rect.left - 40,
      clientY:rect.top - 40
    };
    host.dispatchEvent(new PointerEvent("pointerdown", init));
    host.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons:0 }));
  });
  await page.waitForTimeout(50);
  const placementInputErrors = errors.slice(errorsBeforePlacementInput);
  if (placementInputErrors.some(message => message.includes("getWorldPoint") || message.includes("reading '0'"))) {
    throw new Error(`統治者確定後のマップ入力で破棄済みCameraが参照されました: ${placementInputErrors.join(" | ")}`);
  }

  const placementTile = await page.evaluate(() => {
    const field = window.__v39FieldRuntime?.mapData;
    if (!field) return null;
    for (let y = 3; y < field.h - 3; y += 1) {
      for (let x = 3; x < field.w - 3; x += 1) {
        const tile = { x, y, terrain:field.grid[y][x] };
        if (window.canPlaceV39InitialBase?.(tile)) return tile;
      }
    }
    return null;
  });
  if (!placementTile) throw new Error("初期拠点を配置できる候補マスが見つかりません。");
  await page.evaluate(tile => {
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:tile }));
  }, placementTile);

  await page.waitForFunction(() => {
    const state = window.getV39GameState?.();
    const faction = state?.players?.[0]?.factionState;
    return faction?.settlements?.some(row => row?.placed === true)
      && faction?.villagePlacementMode === false
      && window.isV39MultiplayerSetup?.() === false;
  }, null, { timeout:10000 });

  const multiplayerState = await page.evaluate(() => {
    const state = window.getV39GameState?.();
    const sovereign = state?.players?.[0]?.factionState?.units?.find(unit => unit?.isSovereign === true);
    const settlement = state?.players?.[0]?.factionState?.settlements?.find(row => row?.placed === true);
    return {
      playerCount:state?.players?.length || 0,
      participantCount:state?.sessionParticipants?.length || 0,
      controllerParticipantId:state?.players?.[0]?.controllerParticipantId || "",
      participantId:state?.sessionParticipants?.[0]?.participantId || "",
      controlMode:state?.sessionParticipants?.[0]?.controlMode || "",
      race:state?.players?.[0]?.race || "",
      unitCount:state?.players?.[0]?.factionState?.units?.length || 0,
      sovereignName:sovereign?.name || "",
      sovereignClass:sovereign?.className || "",
      settlementCount:state?.players?.[0]?.factionState?.settlements?.length || 0,
      settlementName:settlement?.name || "",
      villagePlacementMode:!!state?.players?.[0]?.factionState?.villagePlacementMode,
      mapWidth:window.__v39FieldRuntime?.mapData?.w || 0,
      mapHeight:window.__v39FieldRuntime?.mapData?.h || 0
    };
  });
  if (multiplayerState.playerCount !== 1 || multiplayerState.participantCount !== 1
    || !multiplayerState.participantId
    || multiplayerState.controllerParticipantId !== multiplayerState.participantId
    || multiplayerState.controlMode !== "remote"
    || multiplayerState.race !== "只人"
    || multiplayerState.unitCount !== 1
    || multiplayerState.sovereignName !== "テスト統治者"
    || multiplayerState.sovereignClass !== "ファイター"
    || multiplayerState.settlementCount !== 1
    || multiplayerState.settlementName !== "テスト拠点"
    || multiplayerState.villagePlacementMode !== false
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
