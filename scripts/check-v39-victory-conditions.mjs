import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => (
    typeof window.startV39LocalSession === "function"
    && typeof window.generateV39TestFieldWithSeed === "function"
    && typeof window.evaluateV39Victory === "function"
  ));
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "victory-condition-check");
    await new Promise(resolve => window.setTimeout(resolve, 100));
    const beforePlacement = window.getV39GameState();
    const initialPlayer = beforePlacement.players.find(row => row.id === beforePlacement.activePlayerId);
    window.setV39GameState({ players:beforePlacement.players.map(row => row.id !== initialPlayer.id ? row : ({
      ...row,
      factionState:{ ...row.factionState, settlements:[{ id:"victory-condition-start", settlementId:"victory-condition-start", placed:true, x:2, y:2 }], selectedSettlementId:"victory-condition-start" }
    })) }, { reason:"victory-condition-test-initial-placement" });
    window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", { detail:{ mapData:window.__v39FieldRuntime?.mapData } }));
    await new Promise(resolve => window.setTimeout(resolve, 80));
    const before = window.getV39GameState();
    const playerId = before.activePlayerId;
    const landmarkKey = Object.keys(before.victoryLandmarksByTile || {})[0];
    if (!playerId || !landmarkKey) throw new Error("勝利判定用の勢力または対象土地がありません");
    const landmark = before.victoryLandmarksByTile[landmarkKey];
    const occupiedTileKeys = landmark?.occupiedTileKeys?.length ? landmark.occupiedTileKeys : [landmarkKey];
    const territoryOwnerByTile = { ...before.territoryOwnerByTile };
    for (const key of occupiedTileKeys) territoryOwnerByTile[key] = playerId;

    window.setV39GameState({
      territoryOwnerByTile,
      timeline:{ ...before.timeline, turnNumber:3 }
    }, { reason:"victory-condition-check" });
    window.dispatchEvent(new CustomEvent("v39:turn-stage-exploration", { detail:{ turnNumber:3 } }));
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const completed = window.getV39GameState();
    if (!completed.victory?.completed || completed.victory.winnerPlayerId !== playerId) {
      throw new Error(`勝利条件が反映されません: ${JSON.stringify(completed.victory)}`);
    }
    const banner = document.getElementById("v39-turn-banner")?.textContent || "";
    if (!banner.includes("勝利")) throw new Error(`勝利通知が表示されません: ${banner}`);
    const saved = window.createV39SaveData?.();
    if (saved?.gameState?.victory?.winnerPlayerId !== playerId) throw new Error("勝利状態がセーブへ保存されません");
    const advanced = await window.advanceV39Turn?.();
    if (advanced !== false) throw new Error("勝利後もターンを終了できます");
    document.querySelectorAll(".vue-modal-backdrop,#v39-play-mode-select").forEach(element => element.remove());
    return { winnerPlayerId:completed.victory.winnerPlayerId, achievedTurn:completed.victory.achievedTurn, reason:completed.victory.reason, banner, saved:true, turnStopped:true };
  });
  await page.screenshot({ path:"output/web-game/v39-victory-condition.png", fullPage:false });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
