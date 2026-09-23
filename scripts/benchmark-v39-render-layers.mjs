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
  while (window.getV39ActiveFactionState?.()?.villagePlacementMode === true) {
    let nextTile = null;
    for (let y = 5; y < 55 && !nextTile; y += 1) for (let x = 5; x < 55; x += 1) {
      const candidate = { x, y, terrain:data.grid[y][x] };
      if (window.canPlaceV39InitialBase(candidate)) { nextTile = candidate; break; }
    }
    if (!nextTile || !window.placeV39InitialBase(nextTile)) throw new Error("初期拠点を配置できません");
    tile ||= nextTile;
  }
  const state = window.getV39GameState();
  const playerRaces = new Set(state.players.map(player => player.race === "人間" ? "只人" : String(player.race || "")));
  const initialVillages = Array.isArray(state.neutralVillages) ? state.neutralVillages : [];
  const noVillageResult = window.generateV39WorldPopulation(state, data, { neutralVillageCount:0 });
  const threeVillageResult = window.generateV39WorldPopulation(state, data, { neutralVillageCount:3 });
  const neutralVillageGeneration = {
    count:initialVillages.length,
    avoidsPlayerRaces:initialVillages.every(village => !playerRaces.has(String(village?.race || ""))),
    zeroSettingCount:Array.isArray(noVillageResult?.neutralVillages) ? noVillageResult.neutralVillages.length : -1,
    threeSettingCount:Array.isArray(threeVillageResult?.neutralVillages) ? threeVillageResult.neutralVillages.length : -1,
    threeSettingAvoidsPlayerRaces:(threeVillageResult?.neutralVillages || []).every(village => !playerRaces.has(String(village?.race || "")))
  };
  window.openFieldSettingsModal?.();
  const neutralVillageSettingValue = document.getElementById("v39-field-neutral-village-count")?.value ?? null;
  window.closeFieldSettingsModal?.();
  const passableTiles = [];
  for (let y = 1; y < data.h - 1; y += 1) for (let x = 1; x < data.w - 1; x += 1) {
    if (!["海", "湖", "火山"].includes(data.grid[y][x])) passableTiles.push({ x, y });
  }
  const unitTemplate = state.players[0]?.factionState?.units?.[0] || {
    id:"render-benchmark-unit", name:"計測用味方", hp:100, currentHp:100, maxHp:100,
    state:"生存", status:{ HP:100, 攻撃:80, 防御:70, 魔力:50, 精神:50, 速度:70, 命中:70 }
  };
  const enemyTemplate = state.enemies?.[0] || {
    id:"render-benchmark-enemy", name:"計測用敵", race:"ワイバーン", className:"ワイバーン",
    hp:100, currentHp:100, maxHp:100, state:"生存", status:{ HP:100, 攻撃:80, 防御:70, 魔力:50, 精神:50, 速度:70, 命中:70 }
  };
  const units = passableTiles.slice(0, 40).map((position, index) => ({
    ...unitTemplate,
    id:`render-benchmark-unit-${index}`,
    name:`計測用味方${index + 1}`,
    x:position.x,
    y:position.y,
    scoutRange:index === 0 ? 1500 : 0,
    hp:100,
    currentHp:100,
    maxHp:100,
    state:"生存"
  }));
  const enemies = passableTiles.slice(40, 80).map((position, index) => ({
    ...enemyTemplate,
    id:`render-benchmark-enemy-${index}`,
    name:`計測用敵${index + 1}`,
    x:position.x,
    y:position.y,
    hp:100,
    currentHp:100,
    maxHp:100,
    state:"生存"
  }));
  window.setV39GameState({
    players:state.players.map((player, index) => index ? player : ({
      ...player,
      factionState:{ ...player.factionState, units, selectedUnitId:units[0]?.id || "" }
    })),
    enemies
  }, { reason:"render-benchmark-population" });
  window.updateV39TimelineState?.({ paused:true }, { silent:true, reason:"render-benchmark-pause" });
  const lavaTiles = passableTiles.slice(80, 200);
  const lavaMap = Array.from({ length:data.h }, () => Array(data.w).fill(false));
  for (const position of lavaTiles) lavaMap[position.y][position.x] = true;
  window.updateV39FieldData({
    ...data,
    lavaMap,
    lavaFlowData:{
      ...(data.lavaFlowData || {}),
      nodeKeys:lavaTiles.map(position => `${position.x},${position.y}`)
    }
  }, { reason:"render-benchmark-lava" });
  await new Promise(resolve => setTimeout(resolve, 2500));
  const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
  const rootObjects = () => [...scene.children.list];
  const entityRoots = () => rootObjects().filter(object => ["v39-structure-layer", "v39-unit-layer"].includes(object.name));
  const entityChildren = () => entityRoots().flatMap(root => [...(root?.list || [])]);
  const originalTestModeResolver = window.isV39TestMode;
  window.isV39TestMode = () => true;
  window.dispatchEvent(new CustomEvent("v39:display-settings-changed", { detail:{ testMode:true } }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const neutralVillageMarkersInTestMode = entityChildren().filter(marker => marker.name === "v39-neutral-village-marker").length;
  window.isV39TestMode = originalTestModeResolver;
  window.dispatchEvent(new CustomEvent("v39:display-settings-changed", { detail:{ testMode:false } }));
  await new Promise(resolve => setTimeout(resolve, 100));
  const terrainIconOverlay = () => rootObjects().find(object => object.name === "v39-terrain-icon-overlay") || null;
  const terrainIconOverlayBeforeFieldUpdate = terrainIconOverlay();
  window.updateV39FieldData({ ...window.__v39FieldRuntime.mapData }, { reason:"render-benchmark-same-terrain" });
  await new Promise(resolve => setTimeout(resolve, 80));
  const terrainIconsReusedForUnchangedField = terrainIconOverlay() === terrainIconOverlayBeforeFieldUpdate;
  const fogCache = () => rootObjects().find(object => object.name === "v39-unexplored-fog-layer-cache") || null;
  const visibilityVersion = () => Number(window.__v39VisibilityRenderVersion || 0);
  const visibilityVersionBeforeUnrelatedUpdate = visibilityVersion();
  const fogCacheBeforeUnrelatedUpdate = fogCache();
  const unitLayerBeforeUnrelatedUpdate = entityRoots().find(root => root.name === "v39-unit-layer") || null;
  window.dispatchEvent(new CustomEvent("v39:game-state-changed", { detail:{ reason:"render-benchmark-unrelated-update" } }));
  await new Promise(resolve => setTimeout(resolve, 80));
  const unrelatedUpdateSkipped = visibilityVersion() === visibilityVersionBeforeUnrelatedUpdate
    && fogCache() === fogCacheBeforeUnrelatedUpdate;
  const entityMarkersReusedForUnrelatedUpdate = entityRoots().find(root => root.name === "v39-unit-layer") === unitLayerBeforeUnrelatedUpdate;
  const unitLayerBeforeSelection = entityRoots().find(root => root.name === "v39-unit-layer") || null;
  const selectedUnitId = units[1]?.id || units[0]?.id || "";
  window.updateV39ActiveFactionState({ selectedUnitId }, { reason:"render-benchmark-selection" });
  await new Promise(resolve => setTimeout(resolve, 80));
  const selectionRenderUpdated = entityRoots().find(root => root.name === "v39-unit-layer") !== unitLayerBeforeSelection;

  const stateBeforeScoutChange = window.getV39GameState();
  const activePlayerIndex = stateBeforeScoutChange.players.findIndex(player => player.id === stateBeforeScoutChange.activePlayerId);
  const playerIndex = activePlayerIndex >= 0 ? activePlayerIndex : 0;
  const updatedPlayers = stateBeforeScoutChange.players.map((player, index) => {
    if (index !== playerIndex) return player;
    const faction = player.factionState || {};
    const updatedUnits = (faction.units || []).map((unit, unitIndex) => unitIndex === 0 ? { ...unit, scoutRange:0 } : unit);
    return { ...player, factionState:{ ...faction, units:updatedUnits } };
  });
  const fogCacheBeforeScoutChange = fogCache();
  const visibilityVersionBeforeScoutChange = visibilityVersion();
  window.setV39GameState({ players:updatedPlayers }, { reason:"render-benchmark-scout-change" });
  await new Promise(resolve => setTimeout(resolve, 80));
  const scoutChangeRendered = visibilityVersion() > visibilityVersionBeforeScoutChange;
  // Explored tiles remain explored after the unit's range changes, so the static Fog image is reused.
  const fogCacheReusedForScoutChange = fogCache() === fogCacheBeforeScoutChange;
  // 描画レイヤー計測は敵も十分に視界へ入る高索敵状態へ戻して行う。
  window.setV39GameState({ players:stateBeforeScoutChange.players }, { reason:"render-benchmark-scout-restore" });
  await new Promise(resolve => setTimeout(resolve, 80));
  const layerDefinitions = {
    地形:{ root:["v39-terrain-layer", "v39-terrain-layer-cache", "v39-height-boundary-layer", "v39-height-boundary-layer-cache", "v39-river-layer", "v39-special-terrain-item", "v39-lava-layer"] },
    Fog:{ root:["v39-unexplored-fog-layer", "v39-unexplored-fog-layer-cache"] },
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
    for (const root of entityRoots()) root.setVisible(showEntities);
    for (const object of entityChildren()) if (allNamedEntities.has(object.name)) object.setVisible(entityNames.has(object.name));
  };
  const frameSample = frames => new Promise((resolve, reject) => {
    const values = [];
    let previous = performance.now();
    let settled = false;
    const timeoutId = setTimeout(() => {
      settled = true;
      reject(new Error(`フレーム計測がタイムアウトしました: ${frames}フレーム`));
    }, 5000);
    const tick = now => {
      if (settled) return;
      values.push(now - previous);
      previous = now;
      if (values.length >= frames) {
        settled = true;
        clearTimeout(timeoutId);
        resolve(values.slice(2));
      }
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
  for (const root of entityRoots()) root.setVisible(true);
  for (const object of entityChildren()) object.setVisible(true);
  for (let index = 0; index < 6; index += 1) {
    const position = passableTiles[index * 3];
    void window.playV39MapEffect({
      effectName:"斬撃",
      tileX:position.x,
      tileY:position.y,
      totalDurationMs:4000,
      allowInFog:true
    });
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  const combinedValues = await frameSample(60);
  const combinedAverage = combinedValues.reduce((sum, value) => sum + value, 0) / Math.max(1, combinedValues.length);
  measurements.全体 = {
    objectCount:rootObjects().length + entityChildren().length,
    averageFrameMs:Number(combinedAverage.toFixed(2)),
    estimatedFps:Number((1000 / Math.max(0.01, combinedAverage)).toFixed(1))
  };
  return {
    map:{ width:data.w, height:data.h, tileCount:data.w * data.h },
    workload:{ friendlyUnits:units.length, enemies:enemies.length, lavaTiles:lavaTiles.length, simultaneousEffects:6 },
    neutralVillageGeneration:{ ...neutralVillageGeneration, neutralVillageSettingValue, neutralVillageMarkersInTestMode },
    renderer:scene.game.renderer.type === 2 ? "WebGL" : "Canvas",
    textureCount:Object.keys(scene.textures.list || {}).length,
    heapMb:performance.memory ? Number((performance.memory.usedJSHeapSize / 1048576).toFixed(1)) : null,
    visibilityCache:{ unrelatedUpdateSkipped, scoutChangeRendered, fogCacheReusedForScoutChange },
    entityMarkers:{ entityMarkersReusedForUnrelatedUpdate, selectionRenderUpdated },
    terrainIcons:{ terrainIconsReusedForUnchangedField },
    measurements
  };
});
const result = { generatedAt:new Date().toISOString(), report, errors };
await writeFile("artifacts/v39-render-layer-benchmark.json", `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
if (errors.length
  || report.map.tileCount !== 3600
  || report.neutralVillageGeneration.count !== 2
  || report.neutralVillageGeneration.avoidsPlayerRaces !== true
  || report.neutralVillageGeneration.zeroSettingCount !== 0
  || report.neutralVillageGeneration.threeSettingCount !== 3
  || report.neutralVillageGeneration.threeSettingAvoidsPlayerRaces !== true
  || report.neutralVillageGeneration.neutralVillageSettingValue !== "2"
  || report.neutralVillageGeneration.neutralVillageMarkersInTestMode !== 2
  || Object.keys(report.measurements).length !== 8
  || report.visibilityCache.unrelatedUpdateSkipped !== true
  || report.visibilityCache.scoutChangeRendered !== true
  || report.visibilityCache.fogCacheReusedForScoutChange !== true
  || report.entityMarkers.entityMarkersReusedForUnrelatedUpdate !== true
  || report.entityMarkers.selectionRenderUpdated !== true
  || report.terrainIcons.terrainIconsReusedForUnchangedField !== true
  || report.measurements.キャラ.objectCount < 40
  // 通常表示では未発見の敵を除外するため、40体投入時でも全員は描画されない。
  || report.measurements.敵.objectCount < 20
  || report.measurements.全体.estimatedFps < 30) process.exitCode = 1;
await browser.close();
