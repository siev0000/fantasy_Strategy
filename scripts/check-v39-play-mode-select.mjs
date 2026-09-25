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
  const targetSelector = playMode === "multiplayer"
    ? "#v39-multiplayer-lobby.open"
    : playMode === "single-normal"
      ? '[data-v39-race-option="只人"]'
      : "#v39-field-settings-modal.open";
  await page.locator(targetSelector).waitFor();
  const subtitle = playMode === "multiplayer"
    ? await page.locator("#v39-room-title").textContent()
    : playMode === "single-normal"
      ? await page.locator(".race-layout").textContent()
      : await page.locator("#v39-field-settings-subtitle").textContent();
  const fieldSettingsOpen = await page.locator("#v39-field-settings-modal.open").count();
  const selectedPlayMode = await page.evaluate(() => window.getV39PlayMode?.() || "");
  const testMode = await page.evaluate(() => window.isV39TestMode?.() === true);
  await page.close();
  return { playMode, selectedPlayMode, testMode, subtitle, fieldSettingsOpen, errors };
}

async function checkSingleSovereignSetup() {
  const page = await browser.newPage({ viewport:{ width:430, height:760 }, isMobile:true, hasTouch:true });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.locator("[data-v39-play-mode=single-normal]").click();
  await page.locator('[data-v39-race-option="只人"]').waitFor({ timeout:10000 });
  if (!(await page.locator(".vue-modal-backdrop.open:visible").count())) {
    throw new Error("共通Vueモーダルが表示状態になっていません。");
  }
  if (await page.locator("#v39-initial-sovereign-modal.open").count()) {
    throw new Error("旧v39初期統治者UIが開いています。");
  }
  await page.screenshot({ path:"output/web-game/v39-sovereign-race-select.png" });

  const raceCategories = await page.locator("[data-v39-race-category]").allTextContents();
  if (raceCategories.map(value => value.trim()).join("/") !== "人族/亜人/魔族") {
    throw new Error(`種族分類タブがクラス種類どおりに表示されていません: ${raceCategories.join("/")}`);
  }
  await page.locator('[data-v39-race-category="亜人"]').click();
  await page.locator('[data-v39-race-option="オーガ"]').waitFor({ timeout:3000 });
  if (await page.locator('[data-v39-race-option="只人"]').count()) {
    throw new Error("亜人タブで人族の種族が残っています。");
  }
  const demiDescription = await page.locator(".race-category-description").textContent();
  if (!demiDescription?.includes("ステータスに優れる") || !demiDescription?.includes("技能にペナルティ")) {
    throw new Error("亜人カテゴリ説明が表示されていません。");
  }
  await page.locator('[data-v39-race-category="人族"]').click();
  await page.locator('[data-v39-race-option="只人"]').waitFor({ timeout:3000 });

  await page.locator('[data-v39-race-option="只人"]').click();
  const raceTabs = page.locator(".detail-tabs button");
  if (await raceTabs.count() !== 3) throw new Error("開始種族画面が3タブ表示になっていません。");
  const raceStatusText = await page.locator(".detail-tab-panel").textContent();
  if (!raceStatusText?.includes("HP") || !raceStatusText?.includes("攻撃") || !raceStatusText?.includes("防御")) {
    throw new Error("開始種族画面にステータス詳細が表示されていません。");
  }
  await page.locator("[data-v39-race-confirm]").click();

  await page.locator(".class-item").filter({ hasText:"ファイター" }).waitFor({ timeout:5000 });
  await page.screenshot({ path:"output/web-game/v39-sovereign-class-select.png" });
  await page.locator(".class-item").filter({ hasText:"ファイター" }).click();
  const classTabs = page.locator(".detail-tabs button");
  if (await classTabs.count() !== 3) throw new Error("クラス選択画面が3タブ表示になっていません。");
  await page.locator(".class-actions button").filter({ hasText:"このクラスで決定" }).click();

  await page.locator(".name-form").waitFor({ timeout:5000 });
  const inputs = page.locator(".name-form input");
  await inputs.nth(0).fill("通常統治者");
  await inputs.nth(1).fill("通常拠点");
  await page.locator(".name-actions button").filter({ hasText:"決定" }).click();
  await page.locator("#v39-field-settings-modal.open").waitFor({ timeout:5000 });
  await page.locator("#v39-field-generate").click();
  await page.waitForFunction(() => {
    const player = window.getV39GameState?.()?.players?.[0];
    return player?.race === "只人"
      && player.factionState?.units?.some(unit => unit?.isSovereign === true)
      && player.factionState?.villagePlacementMode === true;
  }, null, { timeout:10000 });
  const state = await page.evaluate(() => {
    const player = window.getV39GameState?.()?.players?.[0];
    const sovereign = player?.factionState?.units?.find(unit => unit?.isSovereign === true);
    return { race:player?.race, name:sovereign?.name, className:sovereign?.className };
  });
  await page.close();
  return { state, errors };
}

const browser = await chromium.launch({ headless:true });
try {
  const singleNormal = await checkSelection("single-normal");
  const singleTest = await checkSelection("single-test");
  const multiplayer = await checkSelection("multiplayer");
  const singleSovereign = await checkSingleSovereignSetup();
  console.log(JSON.stringify({ singleNormal, singleTest, multiplayer, singleSovereign }, null, 2));
  if (singleNormal.errors.length || singleTest.errors.length || multiplayer.errors.length
    || singleNormal.selectedPlayMode !== "single-normal"
    || singleTest.selectedPlayMode !== "single-test"
    || multiplayer.selectedPlayMode !== "multiplayer"
    || singleNormal.testMode !== false
    || singleTest.testMode !== true
    || multiplayer.testMode !== false
    || !String(singleNormal.subtitle).includes("只人")
    || !String(singleTest.subtitle).includes("テストプレイ")
    || !String(multiplayer.subtitle).includes("通信ルーム")
    || multiplayer.fieldSettingsOpen
    || singleSovereign.errors.length
    || singleSovereign.state.race !== "只人"
    || singleSovereign.state.name !== "通常統治者"
    || singleSovereign.state.className !== "ファイター") process.exitCode = 1;
} finally {
  await browser.close();
}
