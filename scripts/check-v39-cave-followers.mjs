import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const directory = "output/web-game/cave-followers";
mkdirSync(directory, { recursive:true });
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1100, height:850 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
  await page.getByRole("button", { name:"探索開始", exact:true }).click();
  await page.waitForTimeout(1000);
  const report = await page.evaluate(async () => {
    const rules = await import("/src/lib/v39-squad-movement-rules.js");
    const map = structuredClone(window.__v39FieldRuntime.mapData);
    const trail = [{x:3,y:5},{x:4,y:5},{x:5,y:5},{x:6,y:5},{x:6,y:6},{x:7,y:6}];
    map.grid = Array.from({ length:map.h }, () => Array(map.w).fill("岩壁"));
    for (const tile of trail) map.grid[tile.y][tile.x] = "洞窟";
    const faction = window.getV39ActiveFactionState();
    const units = faction.units.map((unit,index) => ({ ...unit, ...trail[2-index], ap:100, currentAp:100 }));
    const squad = { ...faction.squads[0], unitIds:units.map(unit => unit.id) };
    const fixture = { ...faction, units, squads:[squad], selectedUnitId:units[1].id };
    const group = rules.resolveV39SquadMovementGroup(fixture, units[0].id, { caveFormation:true });
    const first = rules.advanceV39CaveFormation(map, group.positions, trail[3], group);
    const second = rules.advanceV39CaveFormation(map, first, trail[4], group);
    const separated = [{ ...group.positions[0], ...trail[3] },
      { ...group.positions[1], ...trail[1] }, { ...group.positions[2], ...trail[0] }];
    const rejoining = rules.advanceV39CaveFormation(map, separated, trail[4], group);
    const blocked = rules.advanceV39CaveFormation(map, first, trail[4], group, new Set([`${trail[4].x},${trail[4].y}`]));
    const deadGroup = rules.resolveV39SquadMovementGroup({ ...fixture, units:units.map((unit,index) => index===2 ? {...unit,hp:0,state:"死亡"}:unit) }, units[0].id, { caveFormation:true });
    const changedLeader = rules.resolveV39SquadMovementGroup(fixture, units[1].id, { caveFormation:true });
    const explicitLeader = rules.resolveV39SquadMovementGroup({ ...fixture, squads:[{...squad,movementLeaderId:units[2].id}] }, units[1].id, { caveFormation:true });
    const groundGroup = rules.resolveV39SquadMovementGroup(fixture, units[1].id);
    window.loadV39FieldSnapshot(map, window.__v39FieldRuntime.settings, { layerChange:true });
    window.setV39GameState({ enemies:[], neutralVillages:[] });
    window.updateV39ActiveFactionState(fixture);
    await window.waitForV39MapRenderSettled();
    window.startV39SelectedUnitMove();
    const preview = window.getV39UnitMovePreview();
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:trail[3] }));
    document.getElementById("moveOk").click();
    await new Promise(resolve => setTimeout(resolve, 700));
    window.startV39SelectedUnitMove();
    window.dispatchEvent(new CustomEvent("v39:tile-selected", { detail:trail[4] }));
    let moved = null;
    window.addEventListener("v39:unit-moved", event => moved=event.detail, { once:true });
    document.getElementById("moveOk").click();
    await new Promise(resolve => setTimeout(resolve, 1600));
    const actual = window.getV39ActiveFactionState().units.map(unit => ({ id:unit.id,x:unit.x,y:unit.y,ap:unit.ap }));
    return { first, second, rejoining, blocked, deadCount:deadGroup.participants.length,
      changedLeader:changedLeader.leader.id, explicitLeader:explicitLeader.leader.id, groundLeader:groundGroup.leader.id,
      ids:units.map(unit=>unit.id), actual, moved, preview, unlocked:!window.isV39MapInputLocked() };
  });
  const coords = positions => positions.map(({x,y}) => ({x,y}));
  assert.deepEqual(coords(report.first), [{x:6,y:5},{x:5,y:5},{x:4,y:5}]);
  assert.deepEqual(coords(report.second), [{x:6,y:6},{x:6,y:5},{x:5,y:5}]);
  assert.deepEqual(coords(report.rejoining), [{x:6,y:6},{x:5,y:5},{x:4,y:5}]);
  assert.equal(report.blocked, null);
  assert.equal(report.deadCount, 2);
  assert.equal(report.changedLeader, report.ids[0]);
  assert.equal(report.explicitLeader, report.ids[2]);
  assert.equal(report.groundLeader, report.ids[0]);
  assert.deepEqual(coords(report.actual), coords(report.second), JSON.stringify(report));
  assert.equal(report.moved.unitId, report.ids[1]);
  assert.ok(report.actual.every(unit=>unit.ap<100));
  assert.ok(report.unlocked);
  assert.deepEqual(errors, []);
  await page.screenshot({ path:`${directory}/screen.png` });
  console.log(JSON.stringify({ ...report, errors },null,2));
} finally { await browser.close(); }
