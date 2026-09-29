import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.generateV39TestFieldWithSeed === "function" && typeof window.setV39TestMode === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelectorAll(".vue-modal-backdrop").forEach(element => element.remove());
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({ w:30, h:30, patternId:"realistic", neutralVillageCount:1 }, "neutral-village-economy-check");
    await new Promise(resolve => window.setTimeout(resolve, 120));
    const before = window.getV39GameState();
    const village = {
      id:"neutral-village-economy-check", name:"検証一般村", neutral:true, placed:true,
      x:10, y:10, race:"只人", population:50, level:1, defenseUnits:[],
      territoryTileKeys:["10,10", "11,10", "9,10", "10,9", "10,11", "11,9", "9,11"]
    };
    window.setV39GameState({
      neutralVillages:[village],
      settlements:[...(before?.settlements || []).filter(row => !row?.neutral), village]
    }, { reason:"neutral-village-economy-check" });
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x:village.x, y:village.y } }));
    window.openV39TestTools?.();
    await new Promise(resolve => window.setTimeout(resolve, 50));
    const text = document.getElementById("v39-test-tools-panel")?.textContent || "";
    for (const label of ["必要物資(1T)", "推定産出(1T)", "不足候補(1T)", "得意資源"]) {
      if (!text.includes(label)) throw new Error(`一般村診断の表示がありません: ${label} / ${text.slice(0, 500)}`);
    }
    return { village:village.name, x:village.x, y:village.y, hasDiagnostics:true };
  });
  await page.screenshot({ path:"output/web-game/v39-neutral-village-economy.png", fullPage:false });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
