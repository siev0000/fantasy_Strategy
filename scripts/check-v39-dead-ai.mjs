import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:900, height:760 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3020", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.playV39EnemyTurnPresentation === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "dead-ai-test");
    const corpses = [
      { id:"dead-zero", hp:0, state:"死亡", x:5, y:5 },
      { id:"dead-negative", hp:-10, state:"死亡", x:6, y:5 },
      { id:"dead-status", hp:10, statusName:"死亡", x:7, y:5 }
    ].map(unit => ({ ...unit, name:unit.id, maxHp:100, ap:100, currentAp:100 }));
    window.setV39GameState({ enemies:corpses, neutralVillages:[], enemyNests:[], enemySquads:[] });
    window.isV39EntityDetected = () => true;
    window.isV39TileInCurrentVision = () => true;
    let moves = 0;
    const marker = { x:0, y:0, setPosition(x,y) { this.x=x; this.y=y; moves++; } };
    window.getV39MapEntityMarker = () => marker;
    const presented = await window.playV39EnemyTurnPresentation(corpses.map(unit => ({
      type:"move", enemyId:unit.id, combatApproach:true, visible:true,
      from:{ x:unit.x, y:unit.y }, to:{ x:unit.x+1, y:unit.y }
    })));
    await window.runV39EnemyTurn(window.getV39GameState().timeline.turnNumber);
    const after = window.getV39GameState().enemies.map(unit => ({ id:unit.id, x:unit.x, y:unit.y, hp:unit.hp, ap:unit.ap }));
    window.setV39GameState({ enemies:[{ ...corpses[0], hp:100, state:"生存" }] });
    const alivePresented = await window.playV39EnemyTurnPresentation([{
      type:"move", enemyId:"dead-zero", combatApproach:true, visible:true,
      from:{ x:5, y:5 }, to:{ x:6, y:5 }
    }]);
    return { presented, deadMoves:moves - alivePresented, alivePresented, moves, after };
  });
  assert.equal(report.presented, 0);
  assert.equal(report.deadMoves, 0);
  assert.equal(report.alivePresented, 1);
  assert.equal(report.moves, 1);
  assert.deepEqual(report.after.map(unit => [unit.x,unit.y,unit.hp,unit.ap]), [[5,5,0,100],[6,5,-10,100],[7,5,10,100]]);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.screenshot({ path:"output/web-game/v39-dead-ai.png" });
} finally { await browser.close(); }
