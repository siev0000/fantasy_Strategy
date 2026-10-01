import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const baseUrl = process.env.V39_BASE_URL || "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(baseUrl, { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.generateV39TestFieldWithSeed === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const playModeModal = document.querySelector("#v39-play-mode-select");
    if (playModeModal instanceof HTMLElement) playModeModal.style.display = "none";
    const vueBackdrop = document.querySelector(".vue-modal-backdrop");
    if (vueBackdrop instanceof HTMLElement) vueBackdrop.style.display = "none";
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "victory-landmark-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const generatedBeforePlacement = window.getV39GameState();
    const playerBeforePlacement = generatedBeforePlacement.players.find(row => row.id === generatedBeforePlacement.activePlayerId);
    window.setV39GameState({ players:generatedBeforePlacement.players.map(row => row.id !== playerBeforePlacement.id ? row : ({
      ...row,
      factionState:{
        ...row.factionState,
        settlements:[{ id:"victory-test-start", settlementId:"victory-test-start", placed:true, x:2, y:2 }],
        selectedSettlementId:"victory-test-start"
      }
    })) }, { reason:"victory-landmark-check-initial-placement" });
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", { detail:{ mapData:window.__v39FieldRuntime?.mapData } }));
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const generated = window.getV39GameState();
    const landmarks = Object.values(generated.victoryLandmarksByTile || {});
    if (landmarks.length !== 2) throw new Error(`60x60の勝利対象候補が2地点配置されません: ${landmarks.length}`);
    const target = landmarks[0];
    if (target.name !== "太陽の山") throw new Error(`リアル島の勝利対象が不正です: ${target.name}`);
    if (!Number.isFinite(target?.placement?.regionSize) || target.placement.regionSize < 14 || target.placement.heightLevel < 2 || target.placement.startDistance < 17) {
      throw new Error(`勝利対象が広い高地・開始地点からの距離条件を満たしません: ${JSON.stringify(target.placement)}`);
    }
    const player = generated.players.find(row => row.id === generated.activePlayerId);
    const unit = player?.factionState?.units?.[0];
    if (!unit) throw new Error("調査用ユニットがありません");
    const players = generated.players.map(row => row.id !== player.id ? row : ({
      ...row,
      factionState:{
        ...row.factionState,
        selectedUnitId:unit.id,
        units:row.factionState.units.map(member => member.id === unit.id ? { ...member, x:target.x, y:target.y } : member)
      }
    }));
    window.setV39GameState({ players }, { reason:"victory-landmark-check-position" });
    const started = window.startV39Survey({ x:target.x, y:target.y });
    if (!started?.ok) throw new Error(`勝利対象土地の調査を開始できません: ${started?.reason || "不明"}`);
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:2 } }));
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const resolved = window.getV39GameState();
    const discovered = resolved.players.find(row => row.id === resolved.activePlayerId)?.factionState?.exploration?.discoveredFeaturesByTile?.[target.key];
    if (discovered?.kind !== "victory-landmark") throw new Error("調査後の勝利対象土地が勢力別発見情報へ保存されません");
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x:target.x, y:target.y } }));
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const detail = document.getElementById("v39-land-victory-landmark")?.textContent || "";
    if (!detail.includes(target.name)) throw new Error(`土地詳細に勝利対象名が表示されません: ${detail}`);
    const save = window.createV39SaveData?.();
    if (!save?.gameState?.victoryLandmarksByTile?.[target.key] || !save?.gameState?.players?.[0]?.factionState?.exploration?.discoveredFeaturesByTile?.[target.key]) {
      throw new Error("勝利対象土地の配置または発見状態がセーブへ保存されません");
    }
    return { landmarkCount:landmarks.length, discoveredName:discovered.name, detail, saved:true };
  });
  const displayReport = await page.evaluate(async () => {
    const state = window.getV39GameState();
    const player = state.players.find(row => row.id === state.activePlayerId);
    const target = Object.values(state.victoryLandmarksByTile || {})[0];
    const players = state.players.map(row => row.id !== player.id ? row : ({
      ...row,
      factionState:{
        ...row.factionState,
        exploration:{
          ...row.factionState.exploration,
          discoveredFeaturesByTile:{ ...row.factionState.exploration.discoveredFeaturesByTile, [target.key]:undefined }
        }
      }
    }));
    window.setV39GameState({ players }, { reason:"victory-landmark-test-hidden" });
    window.setV39TestMode?.(true);
    window.renderV39VictoryLandmarkIcons?.();
    await new Promise(resolve => window.setTimeout(resolve, 1000));
    const scene = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0];
    const overlay = scene?.children?.list?.find(child => child?.name === "v39-victory-landmark-overlay");
    const images = (overlay?.list || []).filter(child => child?.name === "v39-victory-landmark-image");
    const hiddenTargetImage = images.find(child => child?.getData?.("victoryLandmarkName") === target.name);
    return {
      markerCount:window.getV39VictoryLandmarkIconStatus?.()?.markerCount || 0,
      alpha:overlay?.alpha,
      childTypes:(overlay?.list || []).map(child => child?.type),
      hasImage:images.length > 0,
      hiddenTargetImageAlpha:hiddenTargetImage?.alpha,
      hiddenTargetImageWidth:hiddenTargetImage?.displayWidth,
      hiddenTargetImageHeight:hiddenTargetImage?.displayHeight,
      hiddenTargetTexture:hiddenTargetImage?.texture?.key || "",
      hasTestHighlight:(overlay?.list || []).some(child => child?.name === "v39-victory-landmark-test-highlight")
    };
  });
  if (
    displayReport.markerCount !== 2
    || displayReport.alpha !== 1
    || !displayReport.hasImage
    || displayReport.hiddenTargetImageAlpha !== 0.6
    || displayReport.hiddenTargetImageWidth < 180
    || displayReport.hiddenTargetImageHeight < 180
    || displayReport.hiddenTargetTexture !== `v39-victory-landmark:${report.discoveredName}`
    || !displayReport.hasTestHighlight
  ) {
    throw new Error(`未発見勝利対象のTEST表示が不正です: ${JSON.stringify(displayReport)}`);
  }
  const normalHiddenMarkerCount = await page.evaluate(async () => {
    window.setV39TestMode?.(false);
    window.renderV39VictoryLandmarkIcons?.();
    await new Promise(resolve => window.setTimeout(resolve, 100));
    return window.getV39VictoryLandmarkIconStatus?.()?.markerCount || 0;
  });
  if (normalHiddenMarkerCount !== 0) throw new Error(`通常プレイで未発見の勝利対象が表示されています: ${normalHiddenMarkerCount}`);
  await page.evaluate(async () => {
    window.setV39TestMode?.(true);
    window.renderV39VictoryLandmarkIcons?.();
    await new Promise(resolve => window.setTimeout(resolve, 100));
  });
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.evaluate(() => {
    document.querySelector("#v39-play-mode-select")?.remove();
    window.renderV39VictoryLandmarkIcons?.();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path:"output/web-game/v39-victory-landmarks-field.png", fullPage:true });
  for (const targetName of ["太陽の山", "黄昏の樹"]) {
    const focused = await page.evaluate(name => {
      const target = Object.values(window.getV39GameState()?.victoryLandmarksByTile || {}).find(row => row?.name === name);
      const scene = window.__v39FieldRuntime?.game?.scene?.getScenes?.(true)?.[0];
      const camera = scene?.cameras?.main;
      if (!target || !camera) return false;
      camera.setZoom(1.1);
      camera.centerOn((target.x * 62) + (target.y % 2 === 1 ? 31 : 0) + 31, (target.y * 56) + 37);
      return true;
    }, targetName);
    if (!focused) continue;
    await page.waitForTimeout(100);
    const suffix = targetName === "太陽の山" ? "sun" : "twilight";
    await page.screenshot({ path:`output/web-game/v39-victory-landmarks-${suffix}.png`, fullPage:true });
  }
  console.log(JSON.stringify({ report, displayReport, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
