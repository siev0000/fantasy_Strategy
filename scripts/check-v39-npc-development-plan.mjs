import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1100,height:850}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
try {
  await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    window.startV39VillageIncidentTest();window.closeV39VillageMenu();
    const s=window.getV39GameState(),original=s.players[1],map=window.__v39FieldRuntime.mapData;
    const base=original.factionState.settlements[0];
    const unit={...original.factionState.units[0],ap:0,currentAp:0,surveyTask:null};
    const npc={...original,isPlayer:false,factionState:{...original.factionState,units:[unit],unitTrainingQueue:[],
      settlements:[{...base,placed:true,population:100,populationByRace:{只人:100},foodStockByType:{},materialStockByType:{},buildings:[],constructionQueue:[]}],
      aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'}}};
    const keys=[`${base.x},${base.y}`,`${base.x+1},${base.y}`,`${base.x},${base.y+1}`];
    const state={...s,players:[s.players[0],npc],neutralVillages:[],settlements:[],enemies:[],enemyNests:[],
      territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,npc.id])),territoryStateByTile:{},facilitiesByTile:{},victoryLandmarksByTile:{},groundLootByTile:{}};
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const first=window.runV39FactionAiTurn(state,3,map),plan=first.state.players[1].factionState.aiState.developmentPlan;
    ok(plan?.construction&&plan?.reinforcement,'計画が保存されない');
    ok(plan.reinforcement.living===1&&plan.reinforcement.target===6&&plan.reinforcement.remaining===5,'戦力目標数が不正');
    ok(plan.resourceGoals.length>0,'資材ゼロでも不足が表示されない');
    ok(plan.resourceGoals.every(row=>row.missing>0&&row.required>row.stock),'不足量が不正');
    const filled=structuredClone(state);
    for(const village of filled.players[1].factionState.settlements){
      for(const row of plan.resourceGoals){village.foodStockByType[row.name]=10000;village.materialStockByType[row.name]=10000;}
    }
    const next=window.runV39FactionAiTurn(filled,4,map),nextPlan=next.state.players[1].factionState.aiState.developmentPlan;
    if(plan.reinforcement.reasons.every(reason=>plan.reinforcement.shortages.some(row=>reason===`${row.name}不足`))){
      ok(next.state.players[1].factionState.unitTrainingQueue.length===1,'資材補充後も訓練が始まらない');
      ok(nextPlan.reinforcement.queued===1,'訓練中の数が反映されない');
    }
    if(plan.construction.name&&plan.construction.reasons.every(reason=>reason.startsWith('資材不足:'))){
      ok(next.reports[0].commands.some(command=>command.startsWith(`建設:${plan.construction.name}@`)),'表示した建設候補と実行が不一致');
      ok(nextPlan.construction.status==='building','建設中に切り替わらない');
    }
    const full=structuredClone(state);full.players[1].factionState.units=Array.from({length:6},(_,i)=>({...unit,id:`full-${i}`}));
    const fullPlan=window.runV39FactionAiTurn(full,5,map).state.players[1].factionState.aiState.developmentPlan;
    ok(fullPlan.reinforcement.status==='satisfied'&&fullPlan.reinforcement.remaining===0,'目標達成後も増強を要求');
    full.players[1].factionState.units.pop();
    full.players[1].factionState.unitTrainingQueue=[{id:'pending',unit:{...unit,id:'pending-unit'}}];
    const pendingPlan=window.runV39FactionAiTurn(full,6,map).state.players[1].factionState.aiState.developmentPlan;
    ok(pendingPlan.reinforcement.status==='satisfied'&&pendingPlan.reinforcement.queued===1,'訓練予約を目標数へ数えない');
    window.setV39GameState(first.state,{reason:'npc-development-plan-test'});
    window.importV39SaveJson(window.exportV39SaveJson(0));
    const saved=window.getV39GameState().players[1].factionState.aiState.developmentPlan;
    ok(JSON.stringify(saved)===JSON.stringify(plan),'保存読込で計画が変わる');
    window.openV39TestTools();
    return {plan,nextPlan,commands:next.reports[0].commands};
  });
  await page.locator('[data-test-tab=diagnostics]').click();
  const diagnostic=page.locator('[data-test-section=npc-ai]');
  if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
  const before=await page.evaluate(()=>JSON.stringify(window.getV39GameState().players[1].factionState.aiState));
  for(const selector of ['[data-npc-resource-goals]','[data-npc-construction-goal]','[data-npc-reinforcement-goal]'])assert.equal(await diagnostic.locator(selector).count(),1);
  assert.match(await diagnostic.locator('[data-npc-resource-goals]').innerText(),/不足/);
  assert.match(await diagnostic.locator('[data-npc-reinforcement-goal]').innerText(),/目標6駒/);
  await mkdir('output/web-game/npc-development-plan',{recursive:true});
  for(const width of [1100,390]){
    await page.setViewportSize({width,height:850});
    await diagnostic.locator('[data-npc-construction-goal]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/web-game/npc-development-plan/goals-${width}.png`});
    await diagnostic.locator('[data-npc-resource-goals]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/web-game/npc-development-plan/resources-${width}.png`});
  }
  assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState().players[1].factionState.aiState)),before);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
