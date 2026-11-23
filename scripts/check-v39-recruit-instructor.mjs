import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const result=await page.evaluate(async()=>{
    const {clearV39LegacyRecruitInstructors}=await import("/src/lib/v39-recruit-instructor.js");
    const {inspectV39RecruitTraining}=await import("/src/lib/v39-recruit-training.js");
    const village={settlementId:"town",ownerPlayerId:"p1",placed:true,x:3,y:1};
    const fighter={className:"ファイター",race:"只人",hp:100,ap:100,waitTurnNumber:4,productionWaitTurn:4};
    const old={...fighter,id:"old",x:3,y:1,level:10,movementHold:true};
    const next={...fighter,id:"next",x:4,y:1,level:20,movementHold:true};
    const faction={units:[old,next,{...fighter,id:"outside",x:5,y:1,level:40},
      {...fighter,id:"other-base",x:6,y:1,level:50},
      {...fighter,id:"other-class",className:"ナイト",x:3,y:1,level:50},
      {...fighter,id:"army",isMob:true,x:3,y:1,level:50},
      {...fighter,id:"fought",lastCombatActionTurn:4,x:3,y:1,level:50},
      {...fighter,id:"not-waiting",productionWaitTurn:0,x:3,y:1,level:50}],settlements:[village],
      recruitInstructorByTile:{"3,1":{unitId:"old",previousMovementHold:false}},
      recruitInstructorTransfers:{"4,1":{unitId:"next",previousMovementHold:true}}};
    const state={timeline:{turnNumber:4},activeWorldId:"surface",territoryOwnerByTile:{"3,1":"p1","4,1":"p1","6,1":"p1"},
      territoryStateByTile:{"3,1":{settlementId:"town"},"4,1":{settlementId:"town"},"6,1":{settlementId:"other"}}};
    const restored=clearV39LegacyRecruitInstructors(faction);
    const withSupport=inspectV39RecruitTraining(restored,village,fighter,state);
    const withoutSupport=inspectV39RecruitTraining(restored,village,fighter,{...state,timeline:{turnNumber:5}});
    return {restored,withSupport,withoutSupport};
  });
  assert.deepEqual(result.restored.recruitInstructorByTile,{});
  assert.deepEqual(result.restored.recruitInstructorTransfers,{});
  assert.deepEqual(result.restored.units.slice(0,2).map(unit=>[unit.x,unit.y,unit.ap,unit.movementHold]),[[3,1,100,false],[4,1,100,true]]);
  assert.equal(result.withSupport.instructor.id,"next");
  assert.equal(result.withSupport.instructorBonus,200);
  assert.equal(result.withoutSupport.instructor,null);
  console.log("Training support: highest waiting unit in the same settlement, base speed and legacy hold restoration passed");
} finally {await browser.close();}
