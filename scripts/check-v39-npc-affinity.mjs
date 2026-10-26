import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    window.startV39VillageIncidentTest();window.closeV39VillageMenu();
    const rules=await import('/src/lib/v39-npc-city-specialization.js');
    const {inspectV39NpcReinforcementPlan}=await import('/src/lib/v39-npc-development-plan.js');
    const {getV39RaceRecommendations}=await import('/src/lib/v39-race-definitions.js');
    const {collectV39FactionVision}=await import('/src/lib/v39-faction-intelligence-rules.js');
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const s=window.getV39GameState(),original=s.players[1],map=window.__v39FieldRuntime.mapData;
    const base=original.factionState.settlements[0],id=base.settlementId||base.id;
    const city={...base,placed:true,type:'都市',scaleKey:'city',scaleLevel:3,worldId:'surface',
      population:100,populationByRace:{エルフ:75,只人:25},citySpecializationId:'',
      cityLevels:{魔法Lv:4,信仰Lv:4,軍事Lv:4,経済Lv:4,鍛冶Lv:4},
      foodStockByType:{穀物:100000,野菜:100000,肉:100000,魚:100000},
      materialStockByType:{木材:100000,石材:100000,鉄:100000,金:100000},buildings:[],constructionQueue:[]};
    const npc={...original,race:'エルフ',isPlayer:false,factionState:{...original.factionState,settlements:[city],selectedSettlementId:id,
      unitTrainingQueue:[],units:[{...original.factionState.units[0],ap:0,currentAp:0}],aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'}}};
    const state={...s,players:[s.players[0],npc],activeWorldId:'surface',enemies:[],neutralVillages:[],enemyNests:[],settlements:[],
      timeline:{...s.timeline,turnNumber:10},territoryOwnerByTile:{[`${base.x},${base.y}`]:npc.id},territoryStateByTile:{},facilitiesByTile:{}};
    const before=JSON.stringify(state);
    ok(rules.getV39CityRaceAffinity(city,'魔法都市','只人')===0.75,'population weighting');
    ok(rules.getV39CityRaceAffinity(city,'交易都市','只人')===0.25,'minority weighting');
    ok(rules.inspectV39NpcCitySpecializations(state,{...npc,isPlayer:true},map).length===0,'human auto-selection');
    const plans=rules.inspectV39NpcCitySpecializations(state,npc,map);
    ok(plans[0].status==='ready'&&plans[0].targetId,'no unlocked choice');
    const best=plans[0].candidates.find(row=>row.available);
    ok(plans[0].targetId===best.id,'score ordering');
    const applied=rules.applyV39NpcCitySpecializations(state,npc.id,map,plans);
    ok(applied.commands.length===1,'selection not applied');
    ok(applied.state.players[1].factionState.settlements[0].citySpecializationId===best.id,'wrong city selected');
    ok(applied.state.players[0]===state.players[0],'human faction modified');
    ok(JSON.stringify(state)===before,'planner mutated input');
    const waiting=rules.inspectV39NpcCitySpecializations(applied.state,applied.state.players[1],map,{reinforcementNeeded:true});
    ok(waiting[0].status==='waiting'&&waiting[0].targetId===best.id,'cooldown bypass');
    const low={...npc,factionState:{...npc.factionState,settlements:[{...city,scaleLevel:2}]}};
    ok(rules.inspectV39NpcCitySpecializations({...state,players:[state.players[0],low]},low,map)[0].status==='blocked','scale bypass');
    const farms=['3,3','4,3','5,3'];
    const farmingCity={...city,tileFacilityMap:Object.fromEntries(farms.map(key=>[key,['農場']]))};
    const farmingNpc={...npc,factionState:{...npc.factionState,settlements:[farmingCity]}};
    const farmingState={...state,players:[state.players[0],farmingNpc],
      territoryOwnerByTile:Object.fromEntries(farms.map(key=>[key,npc.id])),
      territoryStateByTile:Object.fromEntries(farms.map(key=>[key,{settlementId:id}]))};
    const foodPlan=rules.inspectV39NpcCitySpecializations(farmingState,farmingNpc,map)[0];
    ok(foodPlan.targetId==='農業都市'&&foodPlan.reasons.includes('食料不足'),'shortage should override affinity');
    const materialPlan=rules.inspectV39NpcCitySpecializations(state,npc,map,{materialShortage:true,materialSettlementId:'other'})[0];
    ok(JSON.stringify(materialPlan)===JSON.stringify(plans[0]),'other-city shortage leaked');
    const stableCity={...city,citySpecializationId:best.id,citySpecializationSelectedTurn:0};
    const stableNpc={...npc,factionState:{...npc.factionState,settlements:[stableCity]}};
    ok(rules.inspectV39NpcCitySpecializations({...state,players:[state.players[0],stableNpc]},stableNpc,map)[0].status==='maintain','unchanged priorities caused switching');
    const vision=collectV39FactionVision(state,npc.id,map);
    const hidden=map.grid.flatMap((row,y)=>row.map((_,x)=>({x,y}))).find(tile=>!vision.visible.has(`${tile.x},${tile.y}`));
    if(hidden){
      const unseen={id:'unseen',...hidden,worldId:'surface',hp:100,aggressive:true};
      const withEnemy=rules.inspectV39NpcCitySpecializations({...state,enemies:[unseen]},npc,map);
      ok(JSON.stringify(withEnemy)===JSON.stringify(plans),'hidden threat changed score');
    }
    const recruit=inspectV39NpcReinforcementPlan(state,npc);
    ok(recruit.status==='ready','rich faction cannot recruit: '+recruit.reasons.join('/'));
    ok(recruit.preference&&getV39RaceRecommendations(recruit.race).classes.includes(recruit.className),'recruit preference missing');
    ok(recruit.request.mode==='army','army priority lost');
    const next=window.runV39FactionAiTurn(state,10,map);
    ok(next.reports[0].commands.some(command=>command.startsWith('都市特化:')),'live AI not connected');
    const plan=next.state.players[1].factionState.aiState.developmentPlan;
    ok(plan.citySpecializations.length===1,'diagnostic plan missing');
    const repeat=window.runV39FactionAiTurn(next.state,10,map);
    ok(JSON.stringify(repeat.state)===JSON.stringify(next.state),'same-turn repeated action');
    window.setV39GameState(next.state,{reason:'npc-affinity-test'});
    window.importV39SaveJson(window.exportV39SaveJson(0));
    ok(window.getV39GameState().players[1].factionState.settlements[0].citySpecializationId===best.id,'save selection lost');
    window.openV39TestTools();
    return {plans,waiting,recruit,commands:next.reports[0].commands};
  });
  await page.locator('[data-test-tab=diagnostics]').click();
  const section=page.locator('[data-test-section=npc-ai]');
  if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
 await section.locator('[data-npc-diagnostic-view=construction]').click();
  assert.equal(await section.locator('[data-npc-city-specialization-goal]').count(),1);
  await mkdir('output/web-game/npc-affinity',{recursive:true});
  for(const width of [1100,390]){
    await page.setViewportSize({width,height:850});
    await section.locator('[data-npc-city-specialization-goal]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/web-game/npc-affinity/diagnostics-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
