import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3022", {waitUntil:"networkidle"});
  const result=await page.evaluate(async () => {
    const {inspectV39RecruitTraining,advanceV39RecruitTraining,inspectV39RecruitTrainingQueue}=await import("/src/lib/v39-recruit-training.js");
    const {createV39Units}=await import("/src/lib/v39-unit-creation-rules.js");
    const {createPlayerFactionState}=await import("/src/lib/player-state.js");
    const {resolveV39UnitTotalExpForLevel}=await import("/src/lib/v39-unit-experience.js");
    const village={settlementId:"town",id:"town",ownerPlayerId:"p1",placed:true,x:5,y:6,
      populationByRace:{只人:100},cityLevels:{軍事Lv:4},foodStockByType:{穀物:10000,野菜:10000,肉:10000,魚:10000},
      materialStockByType:{木材:10000,石材:10000,鉄:10000},territoryResidentialCenterMap:{"6,6":"5,6"},tileFacilityMap:{"6,6":["兵舎"]}};
    const unit={id:"trained",race:"只人",className:"ファイター",level:10};
    const instructor={id:"teacher",name:"教官",race:"只人",className:"ファイター",level:20,hp:100,maxHp:100,x:6,y:6};
    const assigned={recruitInstructorByTile:{"6,6":{unitId:"teacher",className:"ファイター",settlementId:"town"}}};
    const bare=inspectV39RecruitTraining({units:[]},village,unit);
    const taught=inspectV39RecruitTraining({...assigned,units:[instructor]},village,unit);
    const away=inspectV39RecruitTraining({...assigned,units:[{...instructor,x:9}]},village,unit);
    const dead=inspectV39RecruitTraining({...assigned,units:[{...instructor,hp:0}]},village,unit);
    const cave=inspectV39RecruitTraining({...assigned,units:[{...instructor,worldId:"cave"}]},village,unit);
    const wrong=inspectV39RecruitTraining({...assigned,units:[{...instructor,className:"ウィザード"}]},village,unit);
    const prerequisite=inspectV39RecruitTraining({...assigned,units:[instructor]},village,
      {...unit,className:"ウォーリアー",prerequisiteClassLevels:{ファイター:10}});
    const historyOnly=inspectV39RecruitTraining({...assigned,units:[{...instructor,className:"ウォーリアー",prerequisiteClassLevels:{ファイター:10}}]},village,unit);
    const queue={id:unit.id,unit,settlementId:"town",requiredExp:taught.requiredExp,progressExp:0,lastProcessedTurn:1};
    const state={players:[{id:"p1",race:"只人",factionState:{...assigned,units:[instructor],settlements:[village],unitTrainingQueue:[queue]}},
      {id:"p2",factionState:{units:[],settlements:[],unitTrainingQueue:[]}}]};
    const first=advanceV39RecruitTraining(state,2);
    const multiple=advanceV39RecruitTraining({...state,players:state.players.map(p=>p.id!=="p1"?p:{...p,
      factionState:{...p.factionState,unitTrainingQueue:[queue,{...queue,id:"other",unit:{...unit,id:"other"}}]}})},2);
    const makeState=(town,entries)=>({...state,players:state.players.map(p=>p.id!=="p1"?p:{...p,
      factionState:{...p.factionState,settlements:[town],unitTrainingQueue:entries}})});
    const second={...queue,id:"other",unit:{...unit,id:"other",className:"ナイト"}};
    const twoFacilities=advanceV39RecruitTraining(makeState({...village,tileFacilityMap:{"6,6":["兵舎"],"7,6":["兵舎"]}},[queue,second]),2);
    const baseQueue=Array.from({length:4},(_,index)=>({...queue,id:`base-${index}`,unit:{...unit,id:`base-${index}`}}));
    const basic=advanceV39RecruitTraining(makeState({...village,tileFacilityMap:{}},baseQueue),2);
    const damaged=advanceV39RecruitTraining(makeState({...village,facilityStateByTile:{"6,6":{兵舎:{hp:0}}}},[queue]),2);
    const finishAndWait=advanceV39RecruitTraining(makeState(village,[{...queue,progressExp:queue.requiredExp-1},second]),2);
    const duplicateFinish=advanceV39RecruitTraining(finishAndWait.state,2);
    const nextAfterFinish=advanceV39RecruitTraining(JSON.parse(JSON.stringify(finishAndWait.state)),3);
    const multiStatus=inspectV39RecruitTrainingQueue(multiple.state.players[0].factionState,multiple.state).map(row=>row.status);
    const completion=advanceV39RecruitTraining({...state,players:state.players.map(p=>p.id!=="p1"?p:{...p,
      factionState:{...p.factionState,unitTrainingQueue:[{...queue,progressExp:queue.requiredExp-1}]}})},2);
    const repeated=advanceV39RecruitTraining(first.state,2);
    const restored=JSON.parse(JSON.stringify(first.state));
    const resumed=advanceV39RecruitTraining(restored,3);
    const abandoned=advanceV39RecruitTraining({...state,players:state.players.map(p=>p.id!=="p1"?p:{...p,
      factionState:{...p.factionState,settlements:[{...village,ownerPlayerId:"other"}]}})},2);
    let finished=state;
    for(let turn=2;finished.players[0].factionState.unitTrainingQueue.length;turn++) {
      if(turn>100)throw new Error("never finishes");
      finished=advanceV39RecruitTraining(finished,turn).state;
    }
    const faction=createPlayerFactionState({units:[],settlements:[village],selectedSettlementId:"town"},"p1");
    const created=createV39Units({timeline:{turnNumber:7},players:[{id:"p1",race:"只人",factionState:faction}]},"p1",
      {race:"只人",className:"ファイター",mode:"army",count:1});
    return {bare,taught,away,dead,cave,wrong,first:first.state,repeated:repeated.state,resumed:resumed.state,
      abandoned:abandoned.state,finished,created,prerequisite,historyOnly,multiple:multiple.state,completion:completion.state,
      teacherBaseline:resolveV39UnitTotalExpForLevel(20,"human"),twoFacilities:twoFacilities.state,basic:basic.state,
      damaged:damaged.state,finishAndWait:finishAndWait.state,duplicateFinish:duplicateFinish.state,nextAfterFinish:nextAfterFinish.state,multiStatus};
  });
  assert.equal(result.bare.expPerTurn,200);
  assert.equal(result.taught.expPerTurn,400);
  assert.equal(result.bare.turns,20);
  assert.equal(result.taught.turns,10);
  assert.ok(result.taught.turns<result.bare.turns);
  for(const name of ["away","dead","cave","wrong","prerequisite","historyOnly"])assert.equal(result[name].expPerTurn,result.bare.expPerTurn);
  for(const name of ["first","multiple","completion"]) {
    assert.equal(result[name].players[0].factionState.units[0].totalExp,result.teacherBaseline+result.taught.instructorRewardExp);
  }
  assert.equal(result.completion.players[0].factionState.unitTrainingQueue.length,0);
  assert.deepEqual(result.multiStatus,["training","waiting"]);
  assert.equal(result.multiple.players[0].factionState.unitTrainingQueue[1].progressExp,0);
  const two=result.twoFacilities.players[0].factionState.unitTrainingQueue;
  assert.equal(two[0].progressExp,result.taught.expPerTurn);
  assert.equal(two[1].progressExp,result.bare.expPerTurn);
  assert.notEqual(two[0].trainingSlotId,two[1].trainingSlotId);
  assert.deepEqual(result.basic.players[0].factionState.unitTrainingQueue.map(row=>row.progressExp),
    [result.bare.expPerTurn,result.bare.expPerTurn,result.bare.expPerTurn,0]);
  assert.equal(result.damaged.players[0].factionState.unitTrainingQueue[0].progressExp,0);
  assert.equal(result.finishAndWait.players[0].factionState.unitTrainingQueue[0].progressExp,0);
  assert.deepEqual(result.finishAndWait,result.duplicateFinish);
  assert.ok(result.nextAfterFinish.players[0].factionState.unitTrainingQueue[0].progressExp>0);
  assert.deepEqual(result.first,result.repeated);
  assert.equal(result.first.players[0].factionState.unitTrainingQueue[0].progressExp,result.taught.expPerTurn);
  assert.equal(result.resumed.players[0].factionState.unitTrainingQueue[0].progressExp,result.taught.expPerTurn*2);
  assert.equal(result.abandoned.players[0].factionState.unitTrainingQueue[0].progressExp,0);
  assert.deepEqual(result.finished.players[1],result.first.players[1]);
  assert.equal(result.finished.players[0].factionState.units.at(-1).level,10);
  assert.equal(result.finished.players[0].factionState.units.at(-1).worldId,"surface");
  assert.equal(result.created.ok,true,result.created.reason);
  assert.equal(result.created.createdUnits.length,0);
  assert.equal(result.created.state.players[0].factionState.units.length,0);
  assert.equal(result.created.state.players[0].factionState.unitTrainingQueue[0].lastProcessedTurn,7);
  console.log("Training: instructor acceleration, absence/death/world/class exclusion, one tick, save roundtrip, ownership pause, completion and queue reservation passed");
} finally {await browser.close();}
