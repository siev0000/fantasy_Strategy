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
    const cases = [
      { w:36, h:36, expected:1, minimumRegion:8 },
      { w:60, h:60, expected:2, minimumRegion:14 },
      { w:72, h:72, expected:3, minimumRegion:20 },
      { w:83, h:83, expected:4, minimumRegion:28 },
      { w:100, h:100, expected:4, minimumRegion:28 }
    ];
    const results = [];
    for (const testCase of cases) {
      window.startV39LocalSession(1, { playMode:"single-test" });
      window.generateV39TestFieldWithSeed({ w:testCase.w, h:testCase.h, patternId:"realistic" }, `victory-placement-${testCase.w}`);
      await new Promise(resolve => window.setTimeout(resolve, 80));
      const mapData = window.__v39FieldRuntime?.mapData;
      const plan = mapData?.victoryLandmarkPlan;
      const support = mapData?.victoryTerrainSupport;
      if (!plan || plan.landmarks?.length !== testCase.expected) {
        throw new Error(`${testCase.w}x${testCase.h}の事前計画数が不正です: ${JSON.stringify(plan)}`);
      }
      if (plan.terrainCandidates?.length !== 4 || support?.regions?.length !== 4) {
        throw new Error(`全勝利対象の偽装地形が生成されていません: ${JSON.stringify({ plan:plan.terrainCandidates, support:support?.regions })}`);
      }
      const supportById = new Map(support.regions.map(row => [row.landmarkId, row]));
      const sunSupport = supportById.get("勝利対象:太陽の山");
      const twilightSupport = supportById.get("勝利対象:黄昏の樹");
      const starSupport = supportById.get("勝利対象:星の火口");
      const cosmicSupport = supportById.get("勝利対象:宇宙の海");
      const expectedForestRadius = testCase.w <= 47 ? 4 : testCase.w <= 60 ? 5 : testCase.w <= 72 ? 6 : 7;
      const expectedForestSize = 1 + (3 * expectedForestRadius * (expectedForestRadius + 1));
      for (const region of [sunSupport, twilightSupport, starSupport, cosmicSupport]) {
        if (!region?.generated) throw new Error(`勝利対象用地形が生成されていません: ${JSON.stringify(region)}`);
      }
      if (sunSupport.size < 37 || sunSupport.radius !== 3 || sunSupport.extentRadius <= 3 || sunSupport.shape !== "irregular") {
        throw new Error(`太陽の山岳帯が不正です: ${JSON.stringify(sunSupport)}`);
      }
      if (starSupport.size < 37 || starSupport.radius !== 3 || starSupport.extentRadius <= 3 || starSupport.shape !== "irregular" || starSupport.volcanoTileKeys?.length !== 4) {
        throw new Error(`星の火口帯が不正です: ${JSON.stringify(starSupport)}`);
      }
      if (twilightSupport.size !== expectedForestSize || twilightSupport.radius !== expectedForestRadius || twilightSupport.extentRadius <= expectedForestRadius || twilightSupport.shape !== "irregular") {
        throw new Error(`黄昏の森林規模が不正です: ${JSON.stringify(twilightSupport)}`);
      }
      const sunAnchor = sunSupport.anchor;
      const sunLevel = Number(mapData.heightLevelMap?.[sunAnchor.y]?.[sunAnchor.x]);
      const otherMaximum = Math.max(...mapData.heightLevelMap.flatMap((row, y) => row.map((level, x) => (
        x === sunAnchor.x && y === sunAnchor.y ? Number.NEGATIVE_INFINITY : Number(level)
      )).filter(Number.isFinite)));
      if (sunLevel !== otherMaximum + 1) throw new Error(`太陽の山が最高高度+1ではありません: ${JSON.stringify({ sunLevel, otherMaximum })}`);
      const twilightAnchor = twilightSupport.anchor;
      if (mapData.grid?.[twilightAnchor.y]?.[twilightAnchor.x] !== "森") throw new Error("黄昏の樹の中心が森林ではありません");
      const starAnchor = starSupport.anchor;
      const oddrToCube = ({ x, y }) => {
        const q = x - ((y - (y & 1)) / 2);
        return { x:q, y:-q-y, z:y };
      };
      const hexDistance = (left, right) => {
        const a = oddrToCube(left);
        const b = oddrToCube(right);
        return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
      };
      const adjacentVolcanoCount = starSupport.volcanoTileKeys
        .map(key => {
          const [x, y] = key.split(",").map(Number);
          return { x, y };
        })
        .filter(tile => hexDistance(tile, starAnchor) === 1).length;
      if (mapData.grid?.[starAnchor.y]?.[starAnchor.x] !== "火山" || adjacentVolcanoCount !== 3) {
        throw new Error(`星の火口の隣接火山数が不正です: ${JSON.stringify({ starAnchor, adjacentVolcanoCount })}`);
      }
      const supportTerrainById = {
        "勝利対象:太陽の山":new Set(["山岳"]),
        "勝利対象:星の火口":new Set(["山岳", "火山"]),
        "勝利対象:黄昏の樹":new Set(["森"])
      };
      for (const region of [sunSupport, twilightSupport, starSupport]) {
        const allowed = supportTerrainById[region.landmarkId];
        const coreTiles = [];
        for (let y = 0; y < mapData.h; y += 1) for (let x = 0; x < mapData.w; x += 1) {
          if (hexDistance({ x, y }, region.anchor) <= 3) coreTiles.push({ x, y, terrain:mapData.grid?.[y]?.[x] });
        }
        if (coreTiles.length !== 37 || coreTiles.some(tile => !allowed.has(tile.terrain))) {
          throw new Error(`勝利対象中心の必要地形37マスが不足しています: ${JSON.stringify({ region, coreTiles })}`);
        }

        const queue = [{ ...region.anchor }];
        const visited = new Set([`${region.anchor.x},${region.anchor.y}`]);
        let reachedOutside = false;
        while (queue.length) {
          const current = queue.shift();
          if (hexDistance(current, region.anchor) > Number(region.extentRadius)) reachedOutside = true;
          const currentLevel = Number(mapData.heightLevelMap?.[current.y]?.[current.x]);
          const diagonalLeft = current.y % 2 === 1 ? current.x : current.x - 1;
          const neighbors = [
            [current.x - 1, current.y], [current.x + 1, current.y],
            [diagonalLeft, current.y - 1], [diagonalLeft + 1, current.y - 1],
            [diagonalLeft, current.y + 1], [diagonalLeft + 1, current.y + 1]
          ];
          for (const [x, y] of neighbors) {
            const key = `${x},${y}`;
            const terrain = mapData.grid?.[y]?.[x];
            const nextLevel = Number(mapData.heightLevelMap?.[y]?.[x]);
            if (visited.has(key) || !Number.isFinite(nextLevel) || ["海", "湖"].includes(terrain)) continue;
            if (Math.abs(nextLevel - currentLevel) > 1) continue;
            visited.add(key);
            queue.push({ x, y });
          }
        }
        if (!reachedOutside) throw new Error(`勝利対象へ高度差1以内で進入できません: ${JSON.stringify(region)}`);
      }
      const before = window.getV39GameState();
      const player = before.players.find(row => row.id === before.activePlayerId);
      window.setV39GameState({ players:before.players.map(row => row.id !== player.id ? row : ({
        ...row,
        factionState:{
          ...row.factionState,
          settlements:[{ id:`victory-placement-start-${testCase.w}`, settlementId:`victory-placement-start-${testCase.w}`, placed:true, x:2, y:2 }],
          selectedSettlementId:`victory-placement-start-${testCase.w}`
        }
      })) }, { reason:"victory-placement-test-start" });
      window.dispatchEvent(new CustomEvent("v39:initial-placement-complete", { detail:{ mapData:window.__v39FieldRuntime?.mapData } }));
      await new Promise(resolve => window.setTimeout(resolve, 80));
      const landmarks = Object.values(window.getV39GameState().victoryLandmarksByTile || {});
      if (landmarks.length !== testCase.expected) throw new Error(`${testCase.w}x${testCase.h}の候補数が不正です: ${landmarks.length}`);
      if (new Set(landmarks.map(row => row.landmarkId)).size !== landmarks.length) throw new Error("同じ勝利対象が重複して配置されています");
      if (landmarks.some(row => row.scaleName !== "大都市" || row.scaleLevel !== 4 || row.occupiedTileKeys?.length !== 7)) {
        throw new Error(`勝利対象が大都市相当の7マスではありません: ${JSON.stringify(landmarks)}`);
      }
      const plannedIds = plan.landmarks.map(row => row.landmarkId).sort();
      const placedIds = landmarks.map(row => row.landmarkId).sort();
      if (JSON.stringify(plannedIds) !== JSON.stringify(placedIds)) {
        throw new Error(`事前計画と配置結果が一致しません: ${JSON.stringify({ plannedIds, placedIds })}`);
      }
      for (const landmark of landmarks) {
        const placement = landmark.placement || {};
        const requiredRegionSize = Number(supportById.get(landmark.landmarkId)?.size) || testCase.minimumRegion;
        const requiredArea = [];
        for (let y = 0; y < mapData.h; y += 1) for (let x = 0; x < mapData.w; x += 1) {
          if (hexDistance({ x, y }, landmark) <= 3) requiredArea.push(mapData.grid?.[y]?.[x]);
        }
        const allowedTerrainByLandmark = {
          "勝利対象:太陽の山":new Set(["山岳"]),
          "勝利対象:星の火口":new Set(["山岳", "火山"]),
          "勝利対象:黄昏の樹":new Set(["森"]),
          "勝利対象:宇宙の海":new Set(["海"])
        };
        const allowedTerrain = allowedTerrainByLandmark[landmark.landmarkId];
        if (requiredArea.length !== 37 || requiredArea.some(terrain => !allowedTerrain?.has(terrain))) {
          throw new Error(`占有7マスと外周2リングの必要地形が不足しています: ${JSON.stringify({ landmark, requiredArea })}`);
        }
        if (Number(placement.regionSize) < requiredRegionSize) throw new Error(`連結地域が小さすぎます: ${JSON.stringify(landmark)}`);
        if (Number(placement.startDistance) < Math.ceil(testCase.w * 0.28)) throw new Error(`開始地点に近すぎます: ${JSON.stringify(landmark)}`);
        if (landmark.landmarkId === "勝利対象:黄昏の樹" && landmark.terrain !== "森") throw new Error(`黄昏の樹が森林外に配置されています: ${JSON.stringify(landmark)}`);
        if (["勝利対象:太陽の山", "勝利対象:黄昏の樹", "勝利対象:星の火口"].includes(landmark.landmarkId) && Number(placement.heightLevel) < 3) throw new Error(`高地対象が低すぎます: ${JSON.stringify(landmark)}`);
        if (landmark.landmarkId === "勝利対象:宇宙の海" && Number(placement.heightLevel) > -1) throw new Error(`低地対象が高すぎます: ${JSON.stringify(landmark)}`);
      }
      results.push({
        size:`${testCase.w}x${testCase.h}`,
        plannedIds,
        supportRegions:support?.regions?.map(row => ({ landmarkId:row.landmarkId, generation:row.generation, generated:row.generated, size:row.size })) || [],
        landmarks:landmarks.map(row => ({ name:row.name, placement:row.placement }))
      });
    }
    return results;
  });
  console.log(JSON.stringify({ report, errors }, null, 2));
  if (errors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
