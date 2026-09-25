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

  const raceCategories = await page.locator("[data-v39-race-category] strong").allTextContents();
  if (raceCategories.map(value => value.trim()).join("/") !== "人族/亜人/魔族") {
    throw new Error(`種族分類タブがクラス種類どおりに表示されていません: ${raceCategories.join("/")}`);
  }

  const initiallyActiveRace = await page.locator(".race-item.active").getAttribute("data-v39-race-option");
  if (initiallyActiveRace !== "只人") {
    throw new Error(`未選択時に人族の先頭種族が表示されていません: ${initiallyActiveRace}`);
  }
  const initialCategoryDescription = await page.locator(".race-category-description").textContent();
  if (!initialCategoryDescription?.includes("あらゆる技能に優れる")) {
    throw new Error("選択中の人族説明がタブ直下に表示されていません。");
  }

  await page.locator('[data-v39-race-option="エルフ"]').click();
  if ((await page.locator(".race-item.active").getAttribute("data-v39-race-option")) !== "エルフ") {
    throw new Error("人族でエルフを選択できません。");
  }

  await page.locator('[data-v39-race-category="亜人"]').click();
  await page.locator('[data-v39-race-option="オーガ"]').waitFor({ timeout:3000 });
  if (await page.locator('[data-v39-race-option="只人"]').count()) {
    throw new Error("亜人タブで人族の種族が残っています。");
  }
  if ((await page.locator(".race-item.active").getAttribute("data-v39-race-option")) !== "オーガ") {
    throw new Error("初回の亜人表示で先頭種族オーガが自動表示されていません。");
  }
  const demiDescription = await page.locator(".race-category-description").textContent();
  if (!demiDescription?.includes("ステータスに優れる") || !demiDescription?.includes("技能にペナルティ")) {
    throw new Error("選択中の亜人カテゴリ説明がタブ直下に表示されていません。");
  }
  const categoryButtonTexts = await page.locator("[data-v39-race-category]").allTextContents();
  if (categoryButtonTexts.some(text => text.includes("ステータスに優れる") || text.includes("あらゆる技能に優れる") || text.includes("魔法に優れて"))) {
    throw new Error("種族分類の説明文がタブ内に残っています。");
  }

  await page.locator('[data-v39-race-option="ゴブリン"]').click();
  await page.locator('[data-v39-race-category="人族"]').click();
  await page.locator('[data-v39-race-option="エルフ"]').waitFor({ timeout:3000 });
  if ((await page.locator(".race-item.active").getAttribute("data-v39-race-option")) !== "エルフ") {
    throw new Error("人族へ戻った際に前回選択したエルフが復元されていません。");
  }
  await page.locator('[data-v39-race-category="亜人"]').click();
  if ((await page.locator(".race-item.active").getAttribute("data-v39-race-option")) !== "ゴブリン") {
    throw new Error("亜人へ戻った際に前回選択したゴブリンが復元されていません。");
  }
  await page.locator('[data-v39-race-category="人族"]').click();
  await page.locator('[data-v39-race-option="只人"]').click();

  const raceTabs = page.locator(".operation-detail-tabs button");
  if (await raceTabs.count() !== 3) throw new Error("開始種族画面が3タブ表示になっていません。");
  const raceStatusText = await page.locator(".operation-detail-content").textContent();
  if (!raceStatusText?.includes("HP") || !raceStatusText?.includes("攻撃") || !raceStatusText?.includes("防御")) {
    throw new Error("開始種族画面にステータス詳細が表示されていません。");
  }

  await raceTabs.filter({ hasText:"技能" }).click();
  const proficiencyLayout = await page.locator(".operation-proficiency-item").evaluateAll(items => {
    const first = items[0]?.getBoundingClientRect();
    const second = items[1]?.getBoundingClientRect();
    const grid = items[0]?.parentElement ? getComputedStyle(items[0].parentElement) : null;
    return {
      count:items.length,
      columns:grid?.gridTemplateColumns || "",
      firstTop:first?.top ?? null,
      secondTop:second?.top ?? null,
      firstLeft:first?.left ?? null,
      secondLeft:second?.left ?? null
    };
  });
  if (proficiencyLayout.count >= 2) {
    if (Math.abs((proficiencyLayout.firstTop ?? 0) - (proficiencyLayout.secondTop ?? 9999)) > 2) {
      throw new Error(`技能が実表示で2列になっていません: ${JSON.stringify(proficiencyLayout)}`);
    }
    if (!((proficiencyLayout.secondLeft ?? 0) > (proficiencyLayout.firstLeft ?? 0))) {
      throw new Error(`技能2列目が右側に配置されていません: ${JSON.stringify(proficiencyLayout)}`);
    }
  }

  await page.locator("[data-v39-race-confirm]").click();

  await page.locator('[data-v39-class-category="戦士系"]').waitFor({ timeout:5000 });
  await page.screenshot({ path:"output/web-game/v39-sovereign-class-select.png" });

  const classCategories = await page.locator("[data-v39-class-category] strong").allTextContents();
  if (classCategories.map(value => value.trim()).join("/") !== "戦士系/狩人系/魔法系/信仰系/その他") {
    throw new Error(`クラス系統タブが画像ID分類どおりに表示されていません: ${classCategories.join("/")}`);
  }

  if ((await page.locator(".class-item.active").getAttribute("data-v39-class-option")) !== "ファイター") {
    throw new Error("戦士系の初回表示でファイターが自動選択されていません。");
  }

  await page.locator('[data-v39-class-category="魔法系"]').click();
  await page.locator('[data-v39-class-option="ウィザード"]').waitFor({ timeout:3000 });
  if ((await page.locator(".class-item.active").getAttribute("data-v39-class-option")) !== "ウィザード") {
    throw new Error("魔法系の初回表示でウィザードが自動選択されていません。");
  }

  await page.locator('[data-v39-class-option="アルケミスト"]').click();
  await page.locator('[data-v39-class-category="狩人系"]').click();
  if ((await page.locator(".class-item.active").getAttribute("data-v39-class-option")) !== "シーフ") {
    throw new Error("狩人系の初回表示でシーフが自動選択されていません。");
  }

  await page.locator('[data-v39-class-category="魔法系"]').click();
  if ((await page.locator(".class-item.active").getAttribute("data-v39-class-option")) !== "アルケミスト") {
    throw new Error("魔法系へ戻った際に前回選択したアルケミストが復元されていません。");
  }

  await page.locator('[data-v39-class-category="戦士系"]').click();
  await page.locator('[data-v39-class-option="ファイター"]').click();

  const classTabs = page.locator(".operation-detail-tabs button");
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
