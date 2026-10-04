import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });

try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function" && typeof window.generateV39TestFieldWithSeed === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    document.querySelector("#v39-play-mode-select")?.remove();
    document.querySelector("#v39-initial-sovereign-vue-root")?.remove();
    document.querySelector("#v39-initial-sovereign-modal")?.remove();
    const backdrop = document.querySelector(".vue-modal-backdrop");
    if (backdrop instanceof HTMLElement) backdrop.style.display = "none";
    const mapData = window.generateV39TestFieldWithSeed({ w:100, h:100, patternId:"archipelago" }, "archipelago-size-100");
    await new Promise(resolve => window.setTimeout(resolve, 150));
    const info = mapData.islandGenerationInfo || {};
    const expectedBaseSeedCount = Math.floor((100 * 100) / 140) + 3;
    if (info.patternSeedCount !== expectedBaseSeedCount) {
      throw new Error(`100×100多島海の島シード数が不正です: ${JSON.stringify(info)}`);
    }
    if (Math.abs(Number(info.islandAreaScale) - 1.2) > 0.0001) {
      throw new Error(`100×100多島海の島面積倍率が不正です: ${JSON.stringify(info)}`);
    }
    const targetLandRatio = Number(info.targetLandTiles) / 10000;
    const effectiveAreaScale = Number(info.targetLandTiles) / Number(info.baseTargetLandTiles);
    if (targetLandRatio < 0.336 || targetLandRatio > 0.48 || Math.abs(effectiveAreaScale - 1.2) > 0.001) {
      throw new Error(`多島海の島面積拡大率が不正です: ${JSON.stringify({ info, targetLandRatio, effectiveAreaScale })}`);
    }

    const visited = new Set();
    const componentSizes = [];
    const neighbors = (x, y) => {
      const left = y % 2 === 1 ? x : x - 1;
      return [[x - 1, y], [x + 1, y], [left, y - 1], [left + 1, y - 1], [left, y + 1], [left + 1, y + 1]]
        .filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < 100 && ny < 100);
    };
    for (let y = 0; y < 100; y += 1) for (let x = 0; x < 100; x += 1) {
      const key = `${x},${y}`;
      if (visited.has(key) || mapData.grid?.[y]?.[x] === "海") continue;
      const queue = [[x, y]];
      visited.add(key);
      let size = 0;
      while (queue.length) {
        const [cx, cy] = queue.shift();
        size += 1;
        for (const [nx, ny] of neighbors(cx, cy)) {
          const nextKey = `${nx},${ny}`;
          if (visited.has(nextKey) || mapData.grid?.[ny]?.[nx] === "海") continue;
          visited.add(nextKey);
          queue.push([nx, ny]);
        }
      }
      componentSizes.push(size);
    }
    componentSizes.sort((a, b) => b - a);
    return {
      seedCount:info.patternSeedCount,
      configuredAreaScale:info.islandAreaScale,
      effectiveAreaScale:Number(effectiveAreaScale.toFixed(3)),
      targetLandRatio:Number(targetLandRatio.toFixed(3)),
      actualIslandCount:componentSizes.length,
      averageIslandTiles:Number((componentSizes.reduce((sum, value) => sum + value, 0) / Math.max(1, componentSizes.length)).toFixed(1)),
      largestIslandTiles:componentSizes[0] || 0
    };
  });
  await page.addStyleTag({ content:".vue-modal-backdrop,#v39-initial-sovereign-modal,#v39-play-mode-select{display:none!important}" });
  await page.waitForTimeout(100);
  await page.screenshot({ path:"output/web-game/v39-archipelago-100-size.png", fullPage:true });
  const control = await page.evaluate(() => [30,36,60,83].map(size => {
    const mapData = window.generateV39TestFieldWithSeed({ w:size, h:size, patternId:"archipelago" }, `archipelago-size-${size}-control`);
    const info = mapData.islandGenerationInfo || {};
    return { size, islandAreaScale:Number(info.islandAreaScale),seedCount:info.patternSeedCount,
      effectiveAreaScale:Number(info.targetLandTiles)/Number(info.baseTargetLandTiles),
      targetLandRatio:Number(info.targetLandTiles)/(size*size) };
  }));
  for (const info of control) {
    if (info.islandAreaScale !== 1.2 || Math.abs(info.effectiveAreaScale-1.2)>0.005
      || info.seedCount !== Math.max(2,Math.floor(info.size*info.size/140))+3
      || info.targetLandRatio < 0.334 || info.targetLandRatio > 0.482) {
      throw new Error(`多島海のサイズ共通補正が不正です: ${JSON.stringify(info)}`);
    }
  }
  console.log(JSON.stringify({ report, control, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
