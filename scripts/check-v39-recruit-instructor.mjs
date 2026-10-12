import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const report=await page.evaluate(async()=>{
    const {assignV39RecruitInstructor,advanceV39RecruitInstructorMovement,getV39RecruitInstructorCandidates}=await import("/src/lib/v39-recruit-instructor.js");
    const {inspectV39RecruitTraining,advanceV39RecruitTraining}=await import("/src/lib/v39-recruit-training.js");
    const map={w:7,h:4,worldWrapEnabled:false,grid:Array.from({length:4},()=>Array(7).fill("平地")),heightLevelMap:Array.from({length:4},()=>Array(7).fill(0))};
    const village={settlementId:"town",ownerPlayerId:"p1",placed:true,x:3,y:1,tileFacilityMap:{"4,1":["兵舎"]}};
    const base={className:"ファイター",race:"只人",hp:100,maxHp:100,ap:100,currentAp:100,maxAp:100,移動:30,isMob:false};
    const old={...base,id:"old",name:"現教官",x:4,y:1,level:10,movementHold:true};
    const next={...base,id:"next",name:"新教官",x:0,y:1,level:20};
    const outside={...base,id:"outside",name:"領土外",x:6,y:3,level:25};
    const unit={...base,id:"trained",level:10};
    const owners=Object.fromEntries(map.grid.flatMap((row,y)=>row.map((_,x)=>[`${x},${y}`,"p1"])));delete owners["6,3"];
    const state={territoryOwnerByTile:owners,players:[{id:"p1",factionState:{units:[old,next,outside,
      {...base,id:"wrong-class",className:"ナイト",x:1,y:2},
      {...base,id:"dead",hp:0,x:2,y:2},
      {...base,id:"army",isMob:true,x:3,y:2}],settlements:[village],
      recruitInstructorByTile:{"4,1":{unitId:"old",className:"ファイター",settlementId:"town",previousMovementHold:false}},
      unitTrainingQueue:[{id:"trained",unit,settlementId:"town",requiredExp:10000,progressExp:0,lastProcessedTurn:0}]}}]};
    const options=getV39RecruitInstructorCandidates(state,state.players[0],village,"ファイター");
    const rejected=assignV39RecruitInstructor(state,"p1","town","ファイター","outside");
    const assigned=assignV39RecruitInstructor(state,"p1","town","ファイター","next");
    const first=advanceV39RecruitInstructorMovement(assigned.state,"p1",map,1).state;
    const repeated=advanceV39RecruitInstructorMovement(first,"p1",map,1).state;
    const trained=advanceV39RecruitTraining(first,1).state;
    const during=inspectV39RecruitTraining(first.players[0].factionState,village,unit,first);
    let arrived=JSON.parse(JSON.stringify(trained));
    for(let turn=2;arrived.players[0].factionState.recruitInstructorTransfers["4,1"];turn++) {
      if(turn>10)throw new Error("teacher never arrived");
      arrived={...arrived,players:arrived.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}}))};
      arrived=advanceV39RecruitInstructorMovement(arrived,"p1",map,turn).state;
    }
    const after=inspectV39RecruitTraining(arrived.players[0].factionState,village,unit,arrived);
    const damaged={...arrived,players:arrived.players.map(p=>({...p,factionState:{...p.factionState,settlements:[{...village,facilityStateByTile:{"4,1":{兵舎:{hp:0}}}}]}}))};
    const paused=inspectV39RecruitTraining(damaged.players[0].factionState,damaged.players[0].factionState.settlements[0],unit,damaged);
    const cleared=assignV39RecruitInstructor(arrived,"p1","town","ファイター","");
    return {options,rejected,assigned:assigned.state,first,repeated,trained,during,arrived,after,paused,cleared:cleared.state};
  });
  assert.equal(report.options.candidates.find(row=>row.unit.id==="outside").available,false);
  assert.deepEqual(report.options.candidates.map(row=>row.unit.id),["old","next","outside"]);
  assert.equal(report.rejected.ok,false);assert.match(report.rejected.reason,/領土外/);
  assert.equal(report.assigned.players[0].factionState.units.find(u=>u.id==="next").x,0);
  assert.equal(report.assigned.players[0].factionState.recruitInstructorByTile["4,1"].unitId,"old");
  const moved=report.first.players[0].factionState.units.find(u=>u.id==="next");
  assert.ok(moved.x>0 && moved.x<4);assert.ok(moved.ap<100);
  assert.deepEqual(report.first,report.repeated);
  assert.equal(report.during.instructor.id,"old");
  assert.equal(report.trained.players[0].factionState.unitTrainingQueue[0].progressExp,report.during.expPerTurn);
  assert.equal(report.after.instructor.id,"next");
  const old=report.arrived.players[0].factionState.units.find(u=>u.id==="old");
  assert.notDeepEqual([old.x,old.y],[4,1]);assert.ok(old.ap<100);assert.equal(old.movementHold,false);
  assert.equal(report.paused.instructor,null);
  assert.equal(report.cleared.players[0].factionState.recruitInstructorByTile["4,1"],undefined);
  console.log("Instructor: territory validation, explicit assignment, AP path movement, incumbent until arrival, paid swap, save roundtrip, damaged facility and release passed");
} finally {await browser.close();}
