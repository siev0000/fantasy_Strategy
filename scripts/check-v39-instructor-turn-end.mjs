import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync('output/web-game/instructor-turn-end',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    const report=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState(),source=faction.units.find(unit=>unit.isSovereign);
      const entry={settlementId:faction.settlements[0].settlementId,className:'ファイター',tileKey:'4,3',facilityName:'兵舎',previousMovementHold:false};
      const units=[['current-teacher',4,3],['next-teacher',3,4],['manual-unit',3,5]].map(([id,x,y])=>({...source,
        id,name:id,x,y,position:[x,y],squadId:'solo',isSovereign:false,ap:100,currentAp:100,lastActionTurn:0,waitTurnNumber:0,
        movementHold:true}));
      window.updateV39ActiveFactionState({units,selectedUnitId:'current-teacher',squads:[{id:'solo',label:'単独',unitIds:units.map(unit=>unit.id)}],
        recruitInstructorByTile:{'4,3':{...entry,unitId:'current-teacher'}},
        recruitInstructorTransfers:{'4,3':{...entry,unitId:'next-teacher',lastProcessedTurn:0,status:'moving'}}});
      window.importV39SaveJson(window.exportV39SaveJson());
      const getFaction=()=>window.getV39ActiveFactionState();
      const before=window.getV39GameState().timeline.turnNumber;
      const blocked=await window.advanceV39Turn();
      const focus=getFaction().selectedUnitId;
      window.waitV39SelectedUnit();
      const advanced=await window.advanceV39Turn();
      const after=window.getV39GameState().timeline.turnNumber;
      const replacement=getFaction().recruitInstructorByTile['4,3']?.unitId;
      const nextBlocked=await window.advanceV39Turn();
      const formerFocus=getFaction().selectedUnitId;
      window.updateV39ActiveFactionState({units:getFaction().units.map(unit=>unit.id==='next-teacher'?unit:{...unit,waitTurnNumber:after}),
        recruitInstructorByTile:{},recruitInstructorTransfers:{}});
      const releasedBlocked=await window.advanceV39Turn();
      return {blocked,focus,advanced,before,after,replacement,nextBlocked,formerFocus,releasedBlocked,releasedFocus:getFaction().selectedUnitId};
    });
    assert.equal(report.blocked,false);assert.equal(report.focus,'manual-unit');
    assert.equal(report.advanced,true);assert.equal(report.after,report.before+1);assert.equal(report.replacement,'next-teacher');
    assert.equal(report.nextBlocked,false);assert.equal(report.formerFocus,'current-teacher');
    assert.equal(report.releasedBlocked,false);assert.equal(report.releasedFocus,'next-teacher');
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`output/web-game/instructor-turn-end/${width}.png`});
    console.log(`${width}: incumbent/moving instructors skipped, save restored, native arrival/swap, former/released instructors checked`);
    await page.close();
  }
} finally {await browser.close();}
