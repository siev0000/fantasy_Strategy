import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
try {
  const page=await browser.newPage();
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const cases=await page.evaluate(async()=>{
    const {inspectV39UnitCreation,createV39Units}=await import("/src/lib/v39-unit-creation-rules.js");
    const {createPlayerFactionState}=await import("/src/lib/player-state.js");
    const {inspectV39RecruitTraining}=await import("/src/lib/v39-recruit-training.js");
    return ["只人","ビーストマン","デヴィル"].map(race=>{
      const village={settlementId:"town",id:"town",ownerPlayerId:"p1",placed:true,x:5,y:6,
        populationByRace:{[race]:100},cityLevels:{軍事Lv:4},foodStockByType:{穀物:10000,野菜:10000,肉:10000,魚:10000},
        materialStockByType:{木材:10000,石材:10000,鉄:10000},tileFacilityMap:{"6,6":["兵舎"]}};
      const player={id:"p1",race,factionState:createPlayerFactionState({units:[],settlements:[village],selectedSettlementId:"town"},"p1")};
      const state={timeline:{turnNumber:1},players:[player]};
      const results=["ファイター","ウォーリアー"].map(className=>{
        const request={race,className,mode:"army",count:1};
        const baseline=inspectV39UnitCreation(state,player,request);
        const high=inspectV39UnitCreation(state,player,{...request,trainingLevel:baseline.levelLimits.max});
        const result=createV39Units(state,player.id,{...request,trainingLevel:high.initialLevel});
        if(!result.ok) throw new Error(result.reason);
        const queue=result.state.players[0].factionState.unitTrainingQueue[0];
        const training=inspectV39RecruitTraining(player.factionState,village,queue.unit);
        const restored=JSON.parse(JSON.stringify(queue));
        return {className,limits:baseline.levelLimits,defaultLevel:baseline.initialLevel,
          unitLevel:queue.unit.level,classLevel:queue.unit.derivedCharacter.classLevels,raceLevel:queue.unit.derivedCharacter.raceLevels,
          prior:queue.unit.prerequisiteClassLevels,requiredExp:queue.requiredExp,expectedExp:training.requiredExp,
          restoredLevel:restored.unit.level,costUnchanged:JSON.stringify(high.cost)===JSON.stringify(baseline.cost),
          rejected:[baseline.levelLimits.min-1,baseline.levelLimits.max+1,3.5].map(trainingLevel=>
            !createV39Units(state,player.id,{...request,trainingLevel}).ok)};
      });
      return {race,results};
    });
  });
  for(const [index,item] of cases.entries()) {
    const [base,upper]=item.results;
    assert.deepEqual(base.limits,{min:3,max:index===0?10:20});
    assert.equal(base.unitLevel,base.limits.max);
    assert.equal(base.classLevel,10);assert.equal(base.raceLevel,index===0?0:10);
    assert.deepEqual(upper.limits,{min:[11,14,16][index],max:index===0?20:22});
    assert.equal(upper.classLevel,[10,7,5][index]);assert.equal(upper.raceLevel,[0,5,7][index]);
    assert.deepEqual(upper.prior,{ファイター:10});
    for(const row of item.results) {
      assert.equal(row.restoredLevel,row.unitLevel);
      assert.equal(row.requiredExp,row.expectedExp);
      assert.equal(row.costUnchanged,true);
      assert.deepEqual(row.rejected,[true,true,true]);
    }
  }
  console.log("Training levels: total-level limits, race/class split, upper prerequisites and caps, generated units, training EXP, save and invalid-request rejection passed");
} finally {await browser.close();}
