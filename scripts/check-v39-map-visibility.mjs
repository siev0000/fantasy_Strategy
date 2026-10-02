import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.renderV39Visibility === "function");
  const report = await page.evaluate(async () => {
    const pause = () => new Promise(resolve => setTimeout(resolve, 250));
    window.startV39LocalSession(2, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "visibility-check");
    await pause();
    const initial = window.getV39GameState();
    const makeUnit = (id,x,y) => ({ id, name:id, x,y, hp:100, maxHp:100, state:"生存", status:{ 索敵:0, 隠密:0 } });
    const players = initial.players.map((player,index) => ({
      ...player,
      factionState:{ ...player.factionState, village:null, settlements:[],
        units:[makeUnit(`own-${index}`, index ? 25 : 5, index ? 25 : 5)],
        visibility:{ exploredTileKeys:[], visibleTileKeys:[] },
        exploration:{ discoveredFeaturesByTile:{}, surveyedTileKeys:[], history:[] }
      }
    }));
    window.setV39GameState({ players, activePlayerId:players[0].id, settlements:[], enemyNests:[],
      enemies:[makeUnit("near",6,5), makeUnit("far",25,24)],
      neutralVillages:[{ id:"village", x:6, y:6, defenseUnits:[makeUnit("guard",5,6)] }],
      victoryLandmarksByTile:{ "25,25":{ id:"landmark", key:"25,25", kind:"victory-landmark", name:"太陽の山", x:25, y:25 } }
    });
    const map = window.__v39FieldRuntime.mapData;
    map.specialMap[4][6] = "峡谷";
    window.renderV39TerrainIcons();
    window.setV39TestMode(false);
    await pause();
    const snapshot = () => ({
      near:!!window.getV39MapEntityMarker("near"),
      far:!!window.getV39MapEntityMarker("far"),
      guard:!!window.getV39MapEntityMarker("guard"),
      foreign:!!window.getV39MapEntityMarker("own-1"),
      landmark:window.getV39VictoryLandmarkIconStatus().markerCount,
      currentVision:[...window.getV39VisibilitySnapshot().currentVisionTileKeys]
    });
    const normal = snapshot();
    const tileVisible = window.isV39TileInCurrentVision;
    const entityDetected = window.isV39EntityDetected;
    window.isV39TileInCurrentVision = undefined;
    window.isV39EntityDetected = undefined;
    window.setV39GameState({ players:players.map(player => ({ ...player,
      factionState:{ ...player.factionState, selectedUnitId:player.factionState.units[0].id }
    })) });
    await pause();
    const unready = snapshot();
    window.isV39TileInCurrentVision = tileVisible;
    window.isV39EntityDetected = entityDetected;
    window.setV39TestMode(true);
    await pause();
    const test = { ...snapshot(), farAlpha:window.getV39MapEntityMarker("far")?.alpha };
    window.setV39TestMode(false);
    await pause();
    const restored = snapshot();
    window.setV39GameState({ activePlayerId:players[1].id });
    await pause();
    const switched = snapshot();
    const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const terrain = scene.children.list.find(child => child.name === "v39-terrain-icon-overlay");
    const canyonTextures = terrain?.list.filter(child => child.getData("terrain") === "峡谷").map(child => child.texture.key);
    window.setV39GameState({ activePlayerId:players[0].id });
    await pause();
    const canyon = terrain?.list.find(child => child.getData("terrain") === "峡谷");
    if (canyon) { scene.cameras.main.setZoom(1.5); scene.cameras.main.centerOn(canyon.x,canyon.y); }
    return { normal,unready,test,restored,switched,canyonTextures };
  });
  assert.equal(report.normal.near,true);
  assert.equal(report.normal.far,false);
  assert.equal(report.normal.guard,true);
  assert.equal(report.normal.foreign,false);
  assert.equal(report.normal.landmark,0);
  assert.equal(report.unready.near,false);
  assert.equal(report.unready.far,false);
  assert.equal(report.test.far,true);
  assert.equal(report.test.foreign,true);
  assert.equal(report.test.landmark,1);
  assert.equal(report.test.farAlpha,0.4);
  assert.equal(report.restored.far,false);
  assert.equal(report.restored.landmark,0);
  assert.equal(report.switched.near,false);
  assert.equal(report.switched.far,true);
  assert.ok(report.canyonTextures.includes("v39-terrain-icon:special-image:峡谷"));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(report,null,2));
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.screenshot({ path:"output/web-game/v39-map-visibility.png" });
} finally { await browser.close(); }
