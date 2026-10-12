import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync('output/web-game/auto-turn-end',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    const report=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      window.viewV39ExpeditionTestWorld('cave:expedition-test:1');
      const assigned=window.assignV39MineDuty('expedition-test-guard','guard');
      if(!assigned.ok)throw new Error(assigned.reason);
      window.viewV39ExpeditionTestWorld('surface');
      const getFaction=()=>window.getV39ActiveFactionState();
      const automatic=['expedition-test-carrier','expedition-test-guard'];
      window.updateV39ActiveFactionState({units:[...getFaction().units].sort((a,b)=>Number(automatic.includes(b.id))-Number(automatic.includes(a.id)))});
      const turn=window.getV39GameState().timeline.turnNumber;
      const blocked=await window.advanceV39Turn();
      const focused=getFaction().selectedUnitId;
      window.updateV39ActiveFactionState({units:getFaction().units.map(unit=>automatic.includes(unit.id)?unit:{...unit,waitTurnNumber:turn})});
      const completed=await window.advanceV39Turn();
      const next=window.getV39GameState().timeline.turnNumber;
      const stillAssigned=getFaction().units.filter(unit=>automatic.includes(unit.id)).every(unit=>!!unit.caveDuty);
      const carrier=getFaction().units.find(unit=>unit.id===automatic[0]);
      const units=getFaction().units.map(unit=>unit.id===carrier.id
        ? {...unit,caveDuty:null,transportAssignment:{enabled:false,status:'paused'},ap:100,currentAp:100,lastActionTurn:0,waitTurnNumber:0}
        : {...unit,waitTurnNumber:next});
      window.updateV39ActiveFactionState({units});
      const pausedBlocked=await window.advanceV39Turn();
      return {blocked,focused,completed,turn,next,stillAssigned,pausedBlocked,pausedFocus:getFaction().selectedUnitId};
    });
    assert.equal(report.blocked,false);assert.equal(report.focused,'expedition-test-king');
    assert.equal(report.completed,true);assert.equal(report.next,report.turn+1);assert.equal(report.stillAssigned,true);
    assert.equal(report.pausedBlocked,false);assert.equal(report.pausedFocus,'expedition-test-carrier');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`output/web-game/auto-turn-end/${width}.png`});
    console.log(`${width}: automatic transport/guard excluded, normal units checked, native turn advanced, paused unit checked again`);
    await page.close();
  }
} finally {await browser.close();}
