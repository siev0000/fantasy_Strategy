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
    const plans=await import('/src/lib/v39-village-plans.js');
    const {getGameDataRows}=await import('/src/lib/game-data-registry.js');
    const {getV39PopulationRaceRecommendations}=await import('/src/lib/v39-race-definitions.js');
    const {facilityDefinitions,MATERIAL_RESOURCE_KEYS,FOOD_RESOURCE_KEYS,inspectV39NeutralVillageEconomy}=await import('/src/lib/v39-economy-rules.js');
    const {advanceV39NeutralVillages}=await import('/src/lib/v39-neutral-village-rules.js');
    const ok=(value,message)=>{if(!value)throw new Error(message);};
    const initial=window.getV39GameState(),source=initial.neutralVillages.find(row=>row.planTestKey==='cemetery');
    const map=window.__v39FieldRuntime.mapData,keys=source.territoryTileKeys;
    const village={...source,race:'エルフ',population:50,populationByRace:{エルフ:50},type:'大都市',scaleKey:'metropolis',scaleLevel:4,
      foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),
      materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,100000])),
      buildings:['墓地','農場','鍛冶場','魔術工房','港','伐採場','採石場','鉱山'],tileFacilityMap:{[keys[1]]:['墓地'],[keys[2]]:['農場']},constructionQueue:[],planSchedule:{},
      cityLevels:{軍事Lv:3,経済Lv:3,魔法Lv:3,信仰Lv:3,鍛冶Lv:3},
      researchLevels:{軍事Lv:3,経済Lv:3,魔法Lv:3,信仰Lv:3,鍛冶Lv:3},lastProcessedTurn:0};
    const state={...initial,enemies:[],groundLootByTile:{},neutralVillages:[village],settlements:[village],
      facilitiesByTile:{},territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,village.id])),
      territoryStateByTile:{},timeline:{...initial.timeline,turnNumber:10}};
    const original=JSON.stringify(state),definitions=facilityDefinitions(),tower=definitions.find(row=>row.name==='魔導塔');
    const army=definitions.find(row=>row.name==='兵舎');
    const affinity=(race,definition=tower)=>plans.inspectV39VillageFacilityAffinity({race},definition);
    ok(affinity('エルフ').bonus>0&&affinity('オーガ').bonus===0,'race preference mismatch');
    ok(affinity('オーガ',army).bonus>0,'military preference missing');
    ok(affinity('unknown').bonus===0&&affinity('ドワーフ').bonus===0,'blank/unknown preference granted');
    const mixed=plans.inspectV39VillageFacilityAffinity({race:'オーガ',populationByRace:{エルフ:75,オーガ:25}},tower);
    ok(mixed.share===75&&mixed.bonus===affinity('エルフ').bonus*0.75,'mixed population not weighted');
    const alias=getV39PopulationRaceRecommendations({populationByRace:{人間:10}},'エルフ')[0];
    ok(alias.cities.includes('交易都市'),'old race alias not resolved');
    const school=definitions.find(row=>row.name==='学校'),cityRows=getGameDataRows('都市');
    const magic=cityRows.find(row=>row.項目名==='魔法都市'),oldEffect=magic.魔術;
    try{
      magic.魔術=0;
      const noResearch={施設名:'テスト',魔術:10};
      const onlyMagic=[{race:'エルフ',share:1,cities:['魔法都市']}];
      ok(plans.inspectV39VillageFacilityAffinity(village,noResearch,onlyMagic).bonus===0,'stale hardcoded effect');
      magic.魔術=15;
      ok(plans.inspectV39VillageFacilityAffinity(village,noResearch,onlyMagic).bonus>0,'sheet effect not used');
    }finally{magic.魔術=oldEffect;}
    const facilityPlan=(s,v)=>plans.inspectV39VillagePlans(s,v,map,10).find(item=>item.plan?.facilityName);
    const elf=facilityPlan(state,village);
    const ogreVillage={...village,race:'オーガ',populationByRace:{オーガ:50}};
    const ogre=facilityPlan({...state,neutralVillages:[ogreVillage]},ogreVillage);
    ok(elf&&ogre,'no building candidates');
    ok(elf.plan.tile&&ogre.plan.tile,'selected unavailable building');
    ok(elf.plan.facilityName!==ogre.plan.facilityName,`no race difference: ${elf.plan.facilityName}/${ogre.plan.facilityName}`);
    ok(elf.plan.affinity.bonus>0&&ogre.plan.affinity.bonus>0,'selected candidate missing affinity');
    const noCemetery={...village,buildings:[],tileFacilityMap:{}};
    ok(facilityPlan(state,noCemetery)?.plan.facilityName==='墓地','cemetery no longer first');
    const noFood={...village,buildings:['墓地'],tileFacilityMap:{[keys[1]]:['墓地']}};
    const food=facilityPlan(state,noFood);
    ok(food?.plan.facilityName==='農場'&&food.plan.affinity.bonus===0,'food foundation lost priority');
    const withoutResearch={...village,cityLevels:{},researchLevels:{}};
    const locked=facilityPlan(state,withoutResearch);
    ok(!locked||locked.plan.facilityName!==school.name,'affinity bypassed research');
    const shortageVillage={...village,buildings:['墓地','農場'],planSchedule:{active:{facilityName:'魔導塔'}},materialStockByType:{...village.materialStockByType,木材:0}};
    const materialMap={...map,grid:map.grid.map(row=>row.slice())},[fx,fy]=keys[3].split(',').map(Number);
    materialMap.grid[fy][fx]='森';
    const material=plans.inspectV39VillagePlans(state,shortageVillage,materialMap,10).find(item=>item.plan?.facilityName);
    ok(material?.plan.tile,'no feasible shortage response');
    const productionBefore=inspectV39NeutralVillageEconomy(shortageVillage,materialMap,state);
    const productionAfter=inspectV39NeutralVillageEconomy({...shortageVillage,buildings:[...shortageVillage.buildings,material.plan.facilityName],
      tileFacilityMap:{...shortageVillage.tileFacilityMap,[material.plan.tile.key]:[material.plan.facilityName]}},materialMap,state);
    ok(productionAfter.income.material.木材>productionBefore.income.material.木材
      ||FOOD_RESOURCE_KEYS.some(key=>productionAfter.income.food[key]>productionBefore.income.food[key]),'affinity displaced productive shortage response');
    const after=plans.advanceV39VillagePlans(state,village,map,10);
    const mixedVillage={...village,population:100,populationByRace:{エルフ:75,オーガ:25}};
    const mixedAdvanced=plans.advanceV39VillagePlans(state,mixedVillage,map,10).village;
    ok(mixedAdvanced.populationByRace.エルフ===75&&mixedAdvanced.populationByRace.オーガ===25,'construction overwrote population composition');
    ok(after.village.constructionQueue.length===1,'live construction not started');
    ok(after.village.constructionQueue[0].facilityName===elf.plan.facilityName,'execution differs from candidate');
    const queued=facilityPlan(after.state,{...after.village,race:'オーガ',populationByRace:{オーガ:50}});
    ok(queued.plan.facilityName===elf.plan.facilityName,'race change replaced construction');
    ok(JSON.stringify(state)===original,'inspection mutated input');
    window.setV39GameState({...after.state,neutralVillages:[after.village],settlements:[after.village]});
    window.importV39SaveJson(window.exportV39SaveJson(0));await window.waitForV39MapRenderSettled();
    const saved=window.getV39GameState().neutralVillages[0];
    ok(saved.planSchedule.active.affinity.bonus===after.village.planSchedule.active.affinity.bonus,'affinity not saved');
    const advanced=advanceV39NeutralVillages({...after.state,neutralVillages:[{...after.village,lastProcessedTurn:0}]},map,11);
    ok(advanced.state.neutralVillages[0].constructionQueue[0]?.remainingTurns<after.village.constructionQueue[0].remainingTurns||advanced.state.neutralVillages[0].buildings.includes(elf.plan.facilityName),'world stage not advancing');
    window.focusV39VillagePlanTest('cemetery');
    return {elf:elf.plan,ogre:ogre.plan,mixed,material:material.plan,description:plans.describeV39VillagePlan(saved)};
  });
  await page.locator('[data-world-action=village-menu]').click();
  await page.locator('#v39-hub-tab-info').click();
  assert.match(await page.locator('[data-hub-info]').innerText(),/種族適性/);
  await mkdir('output/web-game/village-affinity',{recursive:true});
  for(const width of [1100,390]){
    await page.setViewportSize({width,height:850});
    await page.screenshot({path:`output/web-game/village-affinity/info-${width}.png`});
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
