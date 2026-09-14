import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { writeFile } from "node:fs/promises";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1280, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
await page.goto("http://localhost:3000", { waitUntil:"networkidle" });
await page.waitForFunction(() => typeof window.generateV39TestFieldWithSeed === "function");
const report = await page.evaluate(async () => {
  const data = window.generateV39TestFieldWithSeed({ w:60, h:60, patternId:"realistic" }, "render-benchmark-60");
  window.closeFieldSettingsModal?.();
  window.beginV39InitialPlacement({ force:true });
  let tile = null;
  for (let y = 5; y < 55 && !tile; y += 1) for (let x = 5; x < 55; x += 1) {
    const candidate = { x, y, terrain:data.grid[y][x] };
    if (window.canPlaceV39InitialBase(candidate)) { tile = candidate; break; }
  }
  window.placeV39InitialBase(tile);
  const state = window.getV39GameState();
  const enemyTemplate = state.enemies?.[0] || {
    id:"render-benchmark-enemy", name:"計測用敵", race:"ワイバーン", className:"ワイバーン",
    hp:100, currentHp:100, maxHp:100, state:"生存", status:{ HP:100, 攻撃:80, 防御:70, 魔力:50, 精神:50, 速度:70, 命中:70 }
  };
  window.setV39GameState({
    enemies:[{ ...enemyTemplate, id:"render-benchmark-enemy", x:tile.x + 1, y:tile.y, hp:100, currentHp:100, maxHp:100, state:"生存" }]
  }, { reason:"render-benchmark-enemy" });
  await new Promise(resolve => setTimeout(resolve, 500));
  const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
  const rootObjects = () => [...scene.children.list];
  const entityRoot = () => rootObjects().find(object => object.name === "v39-entity-layer");
  const entityChildren = () => [...(entityRoot()?.list || [])];
  const layerDefinitions = {
    地形:{ root:["v39-terrain-layer", "v39-river-layer", "v39-special-terrain-item", "v39-lava-layer"] },
    Fog:{ root:["v39-unexplored-fog-layer"] },
    陣地:{ root:["v39-own-territory-boundary-layer"] },
    索敵:{ root:["v39-scout-boundary-layer"] },
    キャラ:{ entity:["v39-player-unit-marker", "v39-foreign-unit-marker", "v39-settlement-marker", "v39-wanderer-marker"] },
    敵:{ entity:["v39-enemy-marker"] },
    エフェクト:{ root:["v39-effect-image"] }
  };
  const allNamedRoots = new Set(Object.values(layerDefinitions).flatMap(value => value.root || []));
  const allNamedEntities = new Set(Object.values(layerDefinitions).flatMap(value => value.entity || []));
  const setOnlyLayerVisible = definition => {
    const rootNames = new Set(definition?.root || []);
    const entityNames = new Set(definition?.entity || []);
    for (const object of rootObjects()) if (allNamedRoots.has(object.name)) object.setVisible(rootNames.has(object.name));
    const showEntities = entityNames.size > 0;
    entityRoot()?.setVisible(showEntities);
    for (const object of entityChildren()) if (allNamedEntities.has(object.name)) object.setVisible(entityNames.has(object.name));
  };
  const frameSample = frames => new Promise(resolve => {
    const values = [];
    let previous = performance.now();
    const tick = now => {
      values.push(now - previous);
      previous = now;
      if (values.length >= frames) resolve(values.slice(2));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const measurements = {};
  for (const [name, definition] of Object.entries(layerDefinitions)) {
    if (name === "エフェクト") void window.playV39MapEffect({ effectName:"斬撃", tileX:tile.x, tileY:tile.y, totalDurationMs:1000, allowInFog:true });
    setOnlyLayerVisible(definition);
    const values = await frameSample(24);
    const objectCount = (definition.root || []).reduce((sum, layerName) => sum + rootObjects().filter(object => object.name === layerName).length, 0)
      + (definition.entity || []).reduce((sum, layerName) => sum + entityChildren().filter(object => object.name === layerName).length, 0);
    const averageFrameMs = values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    measurements[name] = {
      objectCount,
      averageFrameMs:Number(averageFrameMs.toFixed(2)),
      estimatedFps:Number((1000 / Math.max(0.01, averageFrameMs)).toFixed(1))
    };
  }
  for (const object of rootObjects()) object.setVisible(true);
  for (const object of entityChildren()) object.setVisible(true);
  return {
    map:{ width:data.w, height:data.h, tileCount:data.w * data.h },
    renderer:scene.game.renderer.type === 2 ? "WebGL" : "Canvas",
    textureCount:Object.keys(scene.textures.list || {}).length,
    heapMb:performance.memory ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1)) : null,
    measurements
  };
});
const result = { generatedAt:new Date().toISOString(), report, errors };
await writeFile("artifacts/v39-render-layer-benchmark.json", `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (errors.length || report.map.tileCount !== 3600 || Object.keys(report.measurements).length !== 7 || report.measurements.敵.objectCount < 1) process.exitCode = 1;
await browser.close();
