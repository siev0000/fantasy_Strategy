import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.advanceV39Turn === "function");
  const movement = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "turn-movement");
    await new Promise(resolve => setTimeout(resolve, 300));
    const state = window.getV39GameState(), player = state.players[0];
    const map = window.__v39FieldRuntime.mapData;
    const traversal = await import("/src/lib/v39-terrain-traversal.js");
    let tile;
    for (let y = 1; y < map.h - 1 && !tile; y += 1) for (let x = 1; x < map.w - 1 && !tile; x += 1) {
      if (["平地", "平原", "草原"].includes(traversal.resolveV39TileTerrainName(map, x, y))) tile = { x,y };
    }
    const source = player.factionState.units[0];
    const unit = window.applyV39DerivedCharacterData({ ...source, x:tile.x, y:tile.y, squadId:"solo", ap:100, currentAp:100 });
    window.setV39GameState({ enemies:[], players:[{ ...player, factionState:{ ...player.factionState,
      villagePlacementMode:false, units:[unit], squads:[], selectedUnitId:unit.id } }] });
    await window.waitForV39MapRenderSettled();
    const marker = window.getV39MapEntityMarker(unit.id);
    const before = { x:marker.x, y:marker.y };
    window.startV39SelectedUnitMove();
    const preview = window.getV39UnitMovePreview();
    const target = preview.reachable.filter(row => row.cost > 0).sort((a,b) => b.cost-a.cost)[0];
    const [x,y] = target.key.split(",").map(Number);
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:{ x,y } }));
    document.getElementById("moveOk").click();
    const locked = window.isV39MapInputLocked();
    const blockedTurn = await window.advanceV39Turn({ skipUnactedFocus:true });
    await new Promise(resolve => setTimeout(resolve, 220));
    const currentMarker = window.getV39MapEntityMarker(unit.id);
    const middle = { x:currentMarker.x, y:currentMarker.y };
    await new Promise(resolve => setTimeout(resolve, 1600));
    const after = window.getV39GameState().players[0].factionState.units[0];
    return { before, middle, markerAlive:Boolean(currentMarker.scene), locked, blockedTurn, slid:middle.x !== before.x || middle.y !== before.y,
      x,y, finalX:after.x, finalY:after.y, ap:after.ap,
      unlocked:!window.isV39MapInputLocked(), unbatched:!window.isV39MapRenderBatchActive() };
  });
  assert.ok(movement.locked && movement.slid && movement.unlocked && movement.unbatched, JSON.stringify(movement));
  assert.equal(movement.blockedTurn, false);
  assert.equal(movement.finalX, movement.x);
  assert.equal(movement.finalY, movement.y);
  assert.ok(movement.ap < 100);
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.evaluate(() => {
    window.__turnPerformance = null;
    window.addEventListener("v39:turn-performance", event => window.__turnPerformance = event.detail, { once:true });
    window.__turnResult = window.advanceV39Turn({ skipUnactedFocus:true });
  });
  await page.waitForFunction(() => document.getElementById("v39-turn-loading")?.hidden === false);
  await page.screenshot({ path:"output/web-game/v39-turn-loading.png" });
  const turn = await page.evaluate(async () => ({ ok:await window.__turnResult,
    profile:window.__turnPerformance, hidden:document.getElementById("v39-turn-loading").hidden,
    unlocked:!window.isV39MapInputLocked(), unbatched:!window.isV39MapRenderBatchActive() }));
  assert.ok(turn.ok && turn.hidden && turn.unlocked && turn.unbatched);
  assert.equal(turn.profile.turnNumber, 2);
  assert.ok(turn.profile.renderMs >= 0);
  const ai = await page.evaluate(async () => {
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({ ...player, factionState:{ ...player.factionState,
      initialSettlementCount:1, settlements:[{ id:"start", settlementId:"start", placed:true, x:0, y:0 }] } })) });
    window.spawnV39Enemies();
    const profile = await window.runV39EnemyTurn(3);
    return { ...profile, loaderHidden:document.getElementById("v39-turn-loading").hidden };
  });
  assert.ok(ai.aliveEnemies > 0 && ai.renderApplyMs >= 0 && ai.presentationMs >= 0 && ai.loaderHidden, JSON.stringify(ai));
  await page.evaluate(() => {
    window.__originalEnemyTurn = window.runV39EnemyTurn;
    window.runV39EnemyTurn = async () => { throw new Error("injected failure"); };
  });
  const recovery = await page.evaluate(async () => {
    try { await window.advanceV39Turn({ skipUnactedFocus:true }); } catch {}
    window.runV39EnemyTurn = window.__originalEnemyTurn;
    return { hidden:document.getElementById("v39-turn-loading").hidden,
      unlocked:!window.isV39MapInputLocked(), unbatched:!window.isV39MapRenderBatchActive() };
  });
  assert.ok(recovery.hidden && recovery.unlocked && recovery.unbatched);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ movement, turn, ai, recovery, errors }, null, 2));
} finally { await browser.close(); }
