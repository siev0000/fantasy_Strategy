import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try{
 await mkdir('output/web-game/initial-subjects',{recursive:true});
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();
  const economy=await import('/src/lib/v39-economy-rules.js');
  const {seedV39InitialSubjects}=await import('/src/lib/v39-initial-subjects.js');
  const {convertV39SubjectPopulation:convert,advanceV39NpcSubjectConversion:advance}=await import('/src/lib/v39-subject-conversion.js');
  const {resolveV39ImmediateSoulAmount}=await import('/src/lib/v39-soul-conversion.js');
  const ok=(test,message)=>{if(!test)throw Error(message);};
  const source=window.getV39GameState(),template=source.players[0],center={x:4,y:4},id='village-4-4';
  const keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'];
  const map={...window.__v39FieldRuntime.mapData,grid:Array.from({length:16},()=>Array(20).fill('森')),specialMap:[],hazardZones:[],heightLevelMap:Array.from({length:16},()=>Array(20).fill(0))};
  const state={...source,enemies:[],neutralVillages:[],settlements:[],activeWorldId:'surface',timeline:{...source.timeline,turnNumber:10,phase:'player'},
   territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,template.id])),
   territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
  const player={...template,race:'ヴァンパイア',factionState:{...template.factionState,units:[],settlements:[],selectedSettlementId:'',village:undefined}};
  state.players=[player];state.activePlayerId=player.id;
  const create=(race='ヴァンパイア',terrain='森',random=()=>0)=>economy.createInitialV39Village({...center,race,state,player:{...player,race},
   mapData:{...map,grid:map.grid.map(row=>row.map(()=>terrain))},random});
  const expected={'丘陵':'ドワーフ','山岳':'ドワーフ','荒野':'ドワーフ','砂漠':'ドワーフ','森':'エルフ','湖':'エルフ','沼地':'エルフ','湿地':'エルフ','平地':'只人'};
  for(const [terrain,race] of Object.entries(expected)){
   const base=create('ヴァンパイア',terrain);ok(base.initialSubjects?.race===race&&base.subjectPopulationByRace[race]===10,terrain+' mapping failed');
  }
  for(const race of ['悪魔','天使','ヴァンパイア'])ok(create(race).subjectPopulationByRace.エルフ===10,race+' excluded');
  ok(!create('只人').initialSubjects,'human ruler received extra population');
  ok(create('悪魔','森',()=>0.999).initialSubjects.count===15,'upper population bound');
  const base=create(),mixedMap={...map,grid:map.grid.map(row=>row.slice())};
  keys.forEach((key,index)=>{const [x,y]=key.split(',').map(Number);mixedMap.grid[y][x]=index<4?'山岳':'森';});
  const native={...base,populationByRace:{ヴァンパイア:10},initialSubjects:undefined,subjectPopulationByRace:{}};
  ok(seedV39InitialSubjects(native,{race:player.race,playerId:player.id,state,mapData:mixedMap,random:()=>0.56}).initialSubjects.race==='ドワーフ','weighted lower branch');
  ok(seedV39InitialSubjects(native,{race:player.race,playerId:player.id,state,mapData:mixedMap,random:()=>0.58}).initialSubjects.race==='エルフ','weighted upper branch');
  ok(seedV39InitialSubjects(base,{race:player.race,playerId:player.id,state,mapData:map})===base,'repeated grant');
  base.ownerPlayerId=player.id;base.populationGrowthByRace={エルフ:{gauge:20,lastRequiredGauge:40}};
  player.factionState={...player.factionState,settlements:[base],selectedSettlementId:id};state.settlements=[base];
  const income=economy.collectV39TerritoryIncome(state,player,map);
  const {buildV39PopulationMaintenanceStock}=await import('/src/lib/v39-population-economy.js');
  const maintenance=buildV39PopulationMaintenanceStock(base.populationByRace,[],economy.NORMAL_FOOD_RESOURCE_KEYS,10);
  for(const [key,amount] of Object.entries({...income.food,...income.material})){
   const stock=base.foodStockByType[key]??base.materialStockByType[key];ok(Math.abs(stock-Math.max(Math.round(amount*30)/10,maintenance[key]||0))<0.01,'initial stock excludes added workers: '+key);
  }
  const original=JSON.stringify(state);
  for(const options of [{count:0},{count:-1},{count:0.5},{count:11},{race:'ヴァンパイア',count:1},{count:1,resource:'木材'}])
   ok(!convert(state,player.id,id,{race:'エルフ',count:1,resource:'魂',...options}).ok,'invalid conversion accepted');
  ok(JSON.stringify(state)===original,'failed request changed state');
  ok(!convert({...state,activePlayerId:'other'},player.id,id,{race:'エルフ',count:1,resource:'魂'}).ok,'wrong owner turn');
  ok(!convert({...state,activeWorldId:'cave:other'},player.id,id,{race:'エルフ',count:1,resource:'魂'}).ok,'remote conversion');
  const soul=convert(state,player.id,id,{race:'エルフ',count:2,resource:'魂'});ok(soul.ok&&soul.amount===2,'soul conversion failed');
  const after=soul.state.players[0].factionState.settlements[0];
  ok(after.populationByRace.ヴァンパイア===10&&after.populationByRace.エルフ===8&&after.subjectPopulationByRace.エルフ===8,'wrong population removed');
  ok(Math.abs(after.populationGrowthByRace.エルフ.gauge/after.populationGrowthByRace.エルフ.lastRequiredGauge-0.5)<0.01,'growth progress changed');
  ok(economy.collectV39TerritoryIncome(soul.state,soul.state.players[0],map).material.木材<income.material.木材,'production did not fall');
  const corpse=convert(soul.state,player.id,id,{race:'エルフ',count:1,resource:'死体'});ok(corpse.ok&&corpse.amount===1,'corpse conversion failed');
  ok(resolveV39ImmediateSoulAmount(player,1)===0,'vampire automatic reward conversion changed');
  const npc={...player,isPlayer:false},npcState={...state,players:[npc]};
  const converted=advance(npcState,npc.id);ok(converted?.ok&&converted.message.includes('死体'),'NPC did not cover corpse demand');
  ok(!advance(converted.state,npc.id),'NPC repeated same-turn conversion');
  const floor={...npcState,players:[{...npc,factionState:{...npc.factionState,settlements:[{...base,subjectPopulationByRace:{エルフ:5}}]}}]};
  ok(!advance(floor,npc.id),'NPC consumed workforce reserve');
  const fed={...npcState,players:[{...npc,factionState:{...npc.factionState,settlements:[{...base,foodStockByType:{...base.foodStockByType,死体:100}}]}}]};
  ok(!advance(fed,npc.id),'NPC converted without need');
  const fixture={...state,players:[{...player,factionState:{...player.factionState,
   units:template.factionState.units.slice(0,1).map(u=>({...u,x:4,y:4})),visibility:template.factionState.visibility}}],
   explorationWorlds:{surface:{map,settings:window.__v39FieldRuntime.settings,spatial:{...state,players:undefined},visibility:{}}}};
  window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
  window.setV39GameState(fixture,{reason:'initial-subjects-test'});await window.waitForV39MapRenderSettled();
  window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();
  return {income,save:window.exportV39SaveJson(0)};
 });
 for(const width of [1100,390]){
  await page.setViewportSize({width,height:850});await page.evaluate(save=>window.importV39SaveJson(save),result.save);
  await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
  const controls=page.locator('[data-subject-population]');await controls.scrollIntoViewIfNeeded();
  await controls.locator('[data-subject-count]').fill('2');
  page.once('dialog',dialog=>dialog.dismiss());await controls.locator('[data-subject-convert=魂]').click();
  assert.equal(await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements[0].subjectPopulationByRace.エルフ),10);
  page.once('dialog',dialog=>dialog.accept());await controls.locator('[data-subject-convert=魂]').click();
  assert.equal(await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements[0].foodStockByType.魂),2);
  page.once('dialog',dialog=>dialog.accept());await controls.locator('[data-subject-convert=死体]').click();
  const saved=await page.evaluate(()=>window.exportV39SaveJson(0));await page.evaluate(save=>window.importV39SaveJson(save),saved);
  assert.equal(await page.evaluate(()=>window.getV39GameState().players[0].factionState.settlements[0].subjectPopulationByRace.エルフ),7);
  await page.locator('[data-subject-population]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/initial-subjects/controls-${width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('terrain weights, populations, mixed production/initial stock, conversion, NPC reserve, save and 390/1100 UI passed');
 await page.close();
}finally{await browser.close();}
