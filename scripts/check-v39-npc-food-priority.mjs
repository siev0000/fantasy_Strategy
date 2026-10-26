import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39VillagePlanTest==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
    const food=await import('/src/lib/v39-npc-food-priority.js');
    const plans=await import('/src/lib/v39-npc-development-plan.js');
    const {inspectV39NormalFoodSupply}=await import('/src/lib/v39-population-economy.js');
    const {inspectV39NpcResourceExpansion}=await import('/src/lib/v39-npc-resource-expansion.js');
    const {inspectV39NpcResourceWorkforce}=await import('/src/lib/v39-npc-resource-teams.js');
    const {normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const original=window.getV39GameState(),human=original.players[0],template=original.neutralVillages[0].defenseUnits[0];
    const map={...window.__v39FieldRuntime.mapData,grid:window.__v39FieldRuntime.mapData.grid.map(row=>row.map(()=> '平地')),lavaMap:[],hazardZones:[],worldWrapEnabled:false};
    const base=normalizeV39Village({...human.factionState.settlements[0],id:'food-home',settlementId:'food-home',ownerPlayerId:'food-npc',name:'食料検証拠点',placed:true,x:4,y:4,
      population:100,populationByRace:{只人:100},foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),
      materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,10000])),buildings:['墓地'],constructionQueue:[],tileFacilityMap:{},landExpansionProjects:[],
      territoryTileModeMap:{'4,5':'resource'},cityLevels:{軍事Lv:3,信仰Lv:3,経済Lv:3,鍛冶Lv:3,魔法Lv:3}},'只人');
    const units=Array.from({length:3},(_,i)=>({...template,id:`food-unit-${i}`,hp:100,currentHp:100,worldId:'surface',x:3+i,y:4,settlementId:base.id,summon:null}));
    const npc={...human,id:'food-npc',race:'只人',isPlayer:false,factionState:{...human.factionState,settlements:[base],selectedSettlementId:base.id,units,unitTrainingQueue:[],
      aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'},visibility:{exploredTileKeys:Array.from({length:map.w*map.h},(_,i)=>`${i%map.w},${Math.floor(i/map.w)}`)}}};
    const state={...original,players:[human,npc],neutralVillages:[],settlements:[],enemies:[],enemyNests:[],activeWorldId:'surface',facilitiesByTile:{},groundLootByTile:{},victoryLandmarksByTile:{},
      territoryOwnerByTile:{'4,4':npc.id,'4,5':npc.id},territoryStateByTile:{'4,4':{settlementId:base.id,hp:100},'4,5':{settlementId:base.id,hp:100}}};
    const snapshot=JSON.stringify(state),balance=food.inspectV39NpcFoodBalance(state,npc,map),plan=plans.inspectV39NpcDevelopmentPlan(state,npc,map);
    ok(balance[0].active&&balance[0].deficitTotal>0&&balance[0].reserveDeficitTotal===0,'full stocks hid structural deficit');
    ok(plan.reinforcement.foodPaused,'nonessential recruitment continued');
    ok(plan.construction.foodPriority&&plan.construction.foodGain>0&&plan.construction.name==='農場','food-positive facility not preferred: '+JSON.stringify(plan.construction));
    ok(!plan.resourceGoals.some(row=>['穀物','野菜','肉','魚'].includes(row.name)),'full stock generated endless fetch jobs');
    ok(inspectV39NpcResourceExpansion(state,npc,map,[],undefined,{foodBalances:balance}).some(row=>row.foodGain>0),'full stocks prevented food expansion');
    ok(JSON.stringify(state)===snapshot,'inspection mutated live game');
    const fresh={...npc,factionState:{...npc.factionState,settlements:[{...base,buildings:[]}]}};
    const firstBuild=plans.inspectV39NpcConstructionPlan({...state,players:[human,fresh]},fresh,map);
    ok(firstBuild.name==='墓地'&&firstBuild.status==='ready'&&firstBuild.foodSupportFor.includes('農場'),'food prerequisite deadlock: '+JSON.stringify(firstBuild));
    const freshTurn=window.runV39FactionAiTurn({...state,players:[human,fresh]},10,map);
    ok(freshTurn.reports[0].commands.some(command=>command.startsWith('建設:墓地@')),'fresh NPC did not start prerequisite');
    const stock={穀物:120},demand={魚:100};
    ok(inspectV39NormalFoodSupply(stock,demand,['穀物','野菜','肉','魚']).shortageTotal===0&&stock.穀物===120,'substitute consumption not shared or mutated stock');
    const queued={...npc,factionState:{...npc.factionState,unitTrainingQueue:[{unit:{...units[0],id:'queued'}}]}};
    const pending=food.inspectV39NpcFoodBalance(state,queued,map)[0];
    ok(pending.queuedUnits===1&&pending.maintenance.穀物>balance[0].maintenance.穀物,'future army upkeep ignored');
    const emergency={...npc,factionState:{...npc.factionState,units:units.slice(0,1)}};
    ok(!plans.inspectV39NpcReinforcementPlan(state,emergency,{mapData:map}).foodPaused,'minimum defense was blocked');
    const waiting={...npc,factionState:{...npc.factionState,settlements:[{...base,constructionQueue:[{facilityName:'学校',tileKey:'4,5',remainingTurns:3}]}]}};
    ok(plans.inspectV39NpcConstructionPlan(state,waiting,map).status==='building','running construction canceled');
    const stable={...npc,factionState:{...npc.factionState,units:[],settlements:[{...base,population:0,populationByRace:{只人:0}}]}};
    const stableBalance=food.inspectV39NpcFoodBalance(state,stable,map)[0];
    ok(!stableBalance.active&&!plans.inspectV39NpcReinforcementPlan(state,stable,{mapData:map}).foodPaused,'stable economy never resumed');
    const lowStock={...npc,factionState:{...npc.factionState,settlements:[{...base,foodStockByType:{}}]}};
    ok(food.inspectV39NpcFoodBalance(state,lowStock,map)[0].reserveDeficitTotal>0,'reserve deficit not exposed');
    const needs=inspectV39NpcResourceWorkforce([{name:'木材',missing:1000,settlementId:base.id},{name:'穀物',missing:2,priority:2,settlementId:base.id}],npc);
    ok(needs.jobs[0].resource==='穀物','large material deficit outranked survival');
    const second={...base,id:'second',settlementId:'second',name:'不足拠点',population:10000,populationByRace:{只人:10000},x:10,y:4};
    const multiple={...npc,factionState:{...npc.factionState,units:[{...units[0],settlementId:undefined}],settlements:[base,second]}};
    const focused=food.focusV39NpcFoodSettlement({...state,players:[human,multiple]},npc.id,map).players[1];
    ok(focused.factionState.selectedSettlementId==='second'&&focused.factionState.units[0].settlementId===base.id,'focus moved legacy home upkeep');
    ok(food.focusV39NpcFoodSettlement(state,human.id,map)===state,'human was automated');
    const live=window.runV39FactionAiTurn(state,10,map);
    ok(live.reports[0].commands.some(command=>command.startsWith('食料優先:')),'live AI omitted policy');
    window.setV39GameState(live.state);window.importV39SaveJson(window.exportV39SaveJson(0));
    ok(window.getV39GameState().players[1].factionState.aiState.developmentPlan.foodBalances[0].active,'food policy lost on save');
    window.openV39TestTools();
    return {balance,pending,construction:plan.construction,commands:live.reports[0].commands};
  });
  await page.locator('[data-test-tab=diagnostics]').click();
  const section=page.locator('[data-test-section=npc-ai]');
  if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
  await mkdir('output/web-game/npc-food-priority',{recursive:true});
  for(const view of ['resources','actions']){
    await section.locator(`[data-npc-diagnostic-view=${view}]`).click();
    assert.match(await section.locator('[data-npc-food-priority]').innerText(),/食料確保を優先/);
    for(const width of [1100,390]){
      await page.setViewportSize({width,height:850});
      await section.locator('[data-npc-food-priority]').scrollIntoViewIfNeeded();
      await page.screenshot({path:`output/web-game/npc-food-priority/${view}-${width}.png`});
    }
  }
  if(process.env.V39_PRODUCTION_TEST_URL){
    const save=await page.evaluate(()=>window.exportV39SaveJson(0));
    const production=await browser.newPage({viewport:{width:390,height:850}});
    production.on('pageerror',error=>errors.push(String(error)));
    await production.goto(process.env.V39_PRODUCTION_TEST_URL,{waitUntil:'networkidle'});
    await production.waitForFunction(()=>typeof window.runV39FactionAiTurn==='function');
    result.production=await production.evaluate(async json=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.importV39SaveJson(json);
      await window.waitForV39MapRenderSettled();
      const state=window.getV39GameState(),turn=Math.max(state.timeline?.turnNumber||1,state.players[1].factionState.aiState.lastProcessedTurn||0)+1;
      const next=window.runV39FactionAiTurn(state,turn,window.__v39FieldRuntime.mapData);
      const plan=next.state.players[1].factionState.aiState.developmentPlan;
      if(!plan.foodBalances?.[0]?.active||!plan.reinforcement.foodPaused)throw new Error('production food policy not connected');
      window.setV39GameState(next.state);window.openV39TestTools();
      return {food:plan.foodBalances,commands:next.reports[0].commands};
    },save);
    await production.locator('[data-test-tab=diagnostics]').click();
    const diagnostic=production.locator('[data-test-section=npc-ai]');
    if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
    await diagnostic.locator('[data-npc-diagnostic-view=actions]').click();
    await diagnostic.locator('[data-npc-food-priority]').scrollIntoViewIfNeeded();
    assert.match(await diagnostic.locator('[data-npc-food-priority]').innerText(),/食料確保を優先/);
    await production.screenshot({path:'output/web-game/npc-food-priority/production-390.png'});
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
