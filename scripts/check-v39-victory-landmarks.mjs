import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.generateV39TestFieldWithSeed === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const playModeModal = document.querySelector("#v39-play-mode-select");
    if (playModeModal instanceof HTMLElement) playModeModal.style.display = "none";
    const vueBackdrop = document.querySelector(".vue-modal-backdrop");
    if (vueBackdrop instanceof HTMLElement) vueBackdrop.style.display = "none";
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "victory-landmark-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const generated = window.getV39GameState();
    const landmarks = Object.values(generated.victoryLandmarksByTile || {});
    if (landmarks.length !== 1) throw new Error(`勝利対象土地が1地点配置されません: ${landmarks.length}`);
    const target = landmarks[0];
    if (target.name !== "太陽の山") throw new Error(`リアル島の勝利対象が不正です: ${target.name}`);
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
    return {
      markerCount:window.getV39VictoryLandmarkIconStatus?.()?.markerCount || 0,
      alpha:overlay?.alpha,
      childTypes:(overlay?.list || []).map(child => child?.type),
      hasImage:(overlay?.list || []).some(child => child?.type === "Image")
    };
  });
  if (displayReport.markerCount !== 1 || displayReport.alpha !== 0.4 || !displayReport.hasImage) {
    throw new Error(`未発見勝利対象のTEST表示が不正です: ${JSON.stringify(displayReport)}`);
  }
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.evaluate(() => {
    document.querySelector("#v39-play-mode-select")?.remove();
    window.renderV39VictoryLandmarkIcons?.();
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path:"output/web-game/v39-victory-landmarks-field.png", fullPage:true });
  console.log(JSON.stringify({ report, displayReport, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
