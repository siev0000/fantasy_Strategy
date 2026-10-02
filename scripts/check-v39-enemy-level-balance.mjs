import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage();
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.spawnV39VictoryLandmarkGuards === "function");
  const report = await page.evaluate(() => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "level-balance");
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({ ...player, factionState:{ ...player.factionState,
      villagePlacementMode:false, initialSettlementCount:1,
      settlements:[{ id:"start", settlementId:"start", placed:true, x:0, y:0 }],
      units:player.factionState.units.map((unit, index) => index ? unit : { ...unit, isSovereign:true, unitType:"統治者" })
    } })) });
    const data = window.__v39FieldRuntime.mapData;
    data.worldWrapEnabled = false;
    window.__v39FieldRuntime.settings.islandCustomSettings = { worldWrapEnabled:false };
    data.riverData = { riverSet:new Set() };
    const scenario = (terrain, height, strong) => {
      for (let y=0;y<data.h;y++) for (let x=0;x<data.w;x++) {
        data.grid[y][x]=terrain; data.heightLevelMap[y][x]=height; data.specialMap[y][x]="";
        if (data.reliefMap?.[y]) data.reliefMap[y][x]="";
        if (data.lavaMap?.[y]) data.lavaMap[y][x]=false;
        if (data.strongMonsterMap?.[y]) data.strongMonsterMap[y][x]=strong;
        if (data.strongMonsterInfoMap?.[y]) data.strongMonsterInfoMap[y][x]=null;
      }
      window.setV39GameState({ enemies:[], enemyNests:[], enemySquads:[], victoryLandmarksByTile:{} });
      return window.spawnV39Enemies().map(enemy => ({ race:enemy.race, level:enemy.level, band:enemy.spawnLevelBand, boss:enemy.strongEnemy }));
    };
    const normal=scenario("森", 3, false);
    const bosses=scenario("森", 2, true);
    const high=scenario("森", 7, false);
    const low=scenario("海", -7, false);
    const additions={ plains:scenario("平地",0,false), wasteland:scenario("荒野",0,false), forest:scenario("森",1,false), cave:scenario("洞窟",2,false) };
    window.setV39GameState({ enemies:[], enemyNests:[], enemySquads:[], victoryLandmarksByTile:{
      "18,18":{ id:"test-landmark", key:"18,18", name:"黄昏の樹", terrain:"森", x:18, y:18 }
    } });
    const guardResult=window.spawnV39VictoryLandmarkGuards();
    const guards=window.getV39GameState().enemies.filter(enemy => enemy.victoryLandmarkKey === "18,18")
      .map(enemy => ({ level:enemy.level, boss:enemy.strongEnemy }));
    return { normal, bosses, high, low, additions, guards, guardReports:guardResult.reports, guardEnemyCount:guardResult.state.enemies.length };
  });
  assert.ok(report.normal.some(enemy => enemy.band === "normal"));
  assert.ok(report.normal.every(enemy => enemy.level <= 15));
  assert.ok(report.bosses.some(enemy => enemy.boss));
  assert.ok(report.bosses.filter(enemy => enemy.boss).every(enemy => enemy.level >= 20 && enemy.level <= 25));
  assert.ok(report.high.some(enemy => enemy.band === "extreme"));
  assert.ok(report.high.filter(enemy => enemy.band === "extreme").every(enemy => enemy.level === 30));
  assert.ok(report.low.some(enemy => enemy.band === "extreme"));
  assert.ok(report.low.filter(enemy => enemy.band === "extreme").every(enemy => enemy.level === 30));
  assert.equal(report.guards.find(enemy => enemy.boss)?.level, 40, JSON.stringify({ guards:report.guards, reports:report.guardReports, count:report.guardEnemyCount }));
  assert.equal(report.guards.find(enemy => !enemy.boss)?.level, 38);
  for (const terrain of ["plains","wasteland"]) {
    assert.ok(report.additions[terrain].some(enemy => enemy.race === "ホース"));
    assert.ok(report.additions[terrain].some(enemy => enemy.race === "ボア"));
  }
  assert.ok(report.additions.forest.some(enemy => enemy.race === "ボア"));
  assert.ok(report.additions.cave.some(enemy => enemy.race === "ドレイク"));
  for (const terrain of ["plains","wasteland","forest"]) assert.ok(report.additions[terrain].every(enemy => enemy.race !== "ドレイク"));
  await page.screenshot({ path:"artifacts/enemy-level-balance.png" });
  assert.deepEqual(errors, []);
  const summary = rows => ({ count:rows.length, min:Math.min(...rows.map(row => row.level)), max:Math.max(...rows.map(row => row.level)) });
  console.log(JSON.stringify({ normal:summary(report.normal), bosses:summary(report.bosses.filter(row => row.boss)),
    high:summary(report.high.filter(row => row.band === "extreme")), low:summary(report.low.filter(row => row.band === "extreme")),
    additions:Object.fromEntries(Object.entries(report.additions).map(([terrain,rows]) => [terrain,[...new Set(rows.map(row => row.race))]])),
    guards:report.guards, errors }, null, 2));
} finally {
  await browser.close();
}
