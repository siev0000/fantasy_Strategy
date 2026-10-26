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
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();await window.waitForV39MapRenderSettled();
  const rules=await import('/src/lib/v39-npc-resource-expansion.js');
  const {advanceV39VillageResourceTeams}=await import('/src/lib/v39-village-resource-teams.js');
  const {inspectV39NeutralVillageEconomy,normalizeV39Village,FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
  const {advanceV39VillagePlans}=await import('/src/lib/v39-village-plans.js');
  const land=await import('/src/lib/v39-land-expansion-rules.js');
  const {getHexNeighborCoords}=await import('/src/lib/hex-grid.js');
  const cfg=(await import('/@fs/C:/Users/skkt3/ドキュメント/Github/fantasy_Strategy/config/v39-npc-faction-ai.json')).default;
  const ok=(value,message)=>{if(!value)throw new Error(message);};
  const initial=window.getV39GameState(),human={...initial.players[0],factionState:{...initial.players[0].factionState,units:[]}},source=initial.neutralVillages[0];
  const map={...window.__v39FieldRuntime.mapData,worldWrapEnabled:false,grid:window.__v39FieldRuntime.mapData.grid.map(row=>row.map(()=> '平地')),lavaMap:[],hazardZones:[]};
  const keys=['4,4',...getHexNeighborCoords(map.w,map.h,4,4,false).map(tile=>tile.key)];
  const known=Array.from({length:map.w*map.h},(_,i)=>`${i%map.w},${Math.floor(i/map.w)}`);
  const target={x:6,y:4,key:'6,4'};map.grid[4][6]='森';
  const base=normalizeV39Village({...human.factionState.settlements[0],settlementId:'resource-base',id:'resource-base',ownerPlayerId:'npc-expansion',placed:true,name:'資源開拓拠点',x:4,y:4,
   population:100,populationByRace:{只人:100},foodStockByType:Object.fromEntries(FOOD_RESOURCE_KEYS.map(key=>[key,100000])),
   materialStockByType:Object.fromEntries(MATERIAL_RESOURCE_KEYS.map(key=>[key,1000])),
   buildings:['墓地'],landExpansionProjects:[],territoryTileKeys:keys,territoryTileModeMap:Object.fromEntries(keys.map(key=>[key,'resource'])),
   constructionQueue:[],tileFacilityMap:{},cityLevels:{軍事Lv:3,信仰Lv:3,経済Lv:3,鍛冶Lv:3,魔法Lv:3}},'只人');
  const npc={...human,id:'npc-expansion',isPlayer:false,race:'只人',factionState:{...human.factionState,settlements:[base],selectedSettlementId:base.settlementId,
   units:[],unitTrainingQueue:[],squads:[{id:'solo',unitIds:[]}],visibility:{exploredTileKeys:known},aiState:{lastProcessedTurn:0,behaviorPatternId:'standard'}}};
  const state={...initial,players:[human,npc],neutralVillages:[],settlements:[],enemies:[],enemyNests:[],groundLootByTile:{},facilitiesByTile:{},victoryLandmarksByTile:{},
   activeWorldId:'surface',timeline:{...initial.timeline,turnNumber:10},territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,npc.id])),
   territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:base.settlementId,status:'領土',hp:100}]))};
  const goals=[{name:'木材',missing:50,settlementId:base.settlementId}],before=JSON.stringify(state);
  const choice=rules.inspectV39NpcResourceExpansion(state,npc,map,goals)[0];
  ok(choice.status==='ready'&&choice.tileKey===target.key&&choice.gains.木材>0,'forest not preferred: '+JSON.stringify(choice));
  ok(JSON.stringify(state)===before,'inspection mutated state');
  const mineralMap={...map,grid:map.grid.map(row=>[...row])};mineralMap.grid[4][6]='山岳';
  const critical=rules.inspectV39NpcResourceExpansion(state,npc,mineralMap,[{name:'鉄',missing:50,priority:1,settlementId:base.id}],undefined,
   {foodBalances:[{settlementId:base.id,active:true,deficit:{穀物:1000},maintenance:{穀物:1000}}]})[0];
  ok(critical.status==='ready'&&critical.foodConstruction&&critical.gains.鉄>0,'food prerequisite mineral land starved by raw food expansion: '+JSON.stringify(critical));
  ok(rules.startV39NpcResourceExpansion(state,human.id,map,goals).state===state,'human automated');
  const hidden={...npc,factionState:{...npc.factionState,visibility:{exploredTileKeys:keys}}};
  ok(rules.inspectV39NpcResourceExpansion({...state,players:[human,hidden]},hidden,map,goals)[0].status==='blocked','unexplored selected');
  const protectedLand={...state,territoryOwnerByTile:{...state.territoryOwnerByTile,[target.key]:human.id}};
  ok(rules.inspectV39NpcResourceExpansion(protectedLand,npc,map,goals)[0].tileKey!==target.key,'foreign territory selected');
  const held={...state,victoryLandmarksByTile:{[target.key]:{x:target.x,y:target.y,name:'覇権地'}}};
  ok(rules.inspectV39NpcResourceExpansion(held,npc,map,goals)[0].tileKey!==target.key,'victory land selected');
  const competing={...state,neutralVillages:[{id:'other-village',x:15,y:15,territoryTileKeys:[],landExpansionProjects:[{tileKey:target.key}]}]};
  ok(!land.inspectV39LandExpansion(competing,npc.id,base.settlementId,target,map).ok,'other village reservation ignored');
  const sea={...map,grid:map.grid.map(row=>row.map(()=> '海'))};for(const key of keys){const [x,y]=key.split(',').map(Number);sea.grid[y][x]='平地';}
  ok(rules.inspectV39NpcResourceExpansion(state,npc,sea,goals)[0].status==='blocked','water without port selected');
  const low={...npc,factionState:{...npc.factionState,settlements:[{...base,population:0,populationByRace:{只人:0}}]}};
  ok(rules.inspectV39NpcResourceExpansion({...state,players:[human,low]},low,map,goals)[0].status==='blocked','population rule bypass');
  ok(rules.inspectV39NpcResourceExpansion(state,npc,map,[{name:'魂',missing:1,settlementId:base.settlementId}])[0].status==='blocked','non-producing land fabricated soul income');
  ok(rules.inspectV39NpcResourceExpansion(state,npc,map,goals,{...cfg.resourceExpansion,enabled:false})[0].status==='disabled','disable ignored');
  const started=rules.startV39NpcResourceExpansion(state,npc.id,map,goals);
  ok(started.commands.length===1&&started.state.players[1].factionState.settlements[0].landExpansionProjects.length===1,'did not start project');
  ok(!started.state.territoryOwnerByTile[target.key],'instant ownership');
  const pending=rules.startV39NpcResourceExpansion(started.state,npc.id,map,goals);
  ok(!pending.commands.length&&pending.plans[0].status==='building','duplicate project');
  const small={...base,population:50,populationByRace:{只人:50}},smallPlayer={...npc,factionState:{...npc.factionState,settlements:[small]}};
  const smallState={...state,players:[human,smallPlayer]},smallStarted=rules.startV39NpcResourceExpansion(smallState,npc.id,map,goals);
  const labor=inspectV39NeutralVillageEconomy({...smallStarted.state.players[1].factionState.settlements[0],id:npc.id,race:'只人'},map,smallStarted.state);
  const free=inspectV39NeutralVillageEconomy({...small,id:npc.id,race:'只人'},map,smallState);
  ok(labor.expansionWorkers>0&&labor.employmentRate<free.employmentRate,'workers double-counted');
  const v={...source,id:'village-expansion',name:'開拓する一般村',x:4,y:4,race:'只人',abandoned:false,incidentTest:false,
   defenseUnits:source.defenseUnits.slice(0,2).map((unit,i)=>({...unit,id:`vguard-${i}`,x:i?4:5,y:i?5:4,worldId:'surface'})),defenseRosterInitialized:true,
   population:100,populationByRace:{只人:100},foodStockByType:base.foodStockByType,materialStockByType:{...base.materialStockByType,木材:0},buildings:['墓地'],
   territoryTileKeys:keys,territoryTileModeMap:base.territoryTileModeMap,constructionQueue:[],tileFacilityMap:{},researchLevels:base.cityLevels,landExpansionProjects:[],resourceOperations:undefined};
  const vs={...state,players:[human],neutralVillages:[v],settlements:[v],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,v.id])),
   territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:v.id,status:'領土',hp:100}]))};
  const vBefore=JSON.stringify(vs),first=advanceV39VillageResourceTeams(vs,v,map,10);
  ok(first.village.landExpansionProjects[0]?.tileKey===target.key,'village did not start forest expansion: '+JSON.stringify({projects:first.village.landExpansionProjects,operations:first.village.resourceOperations?.resourceExpansion,reports:first.reports}));
  ok(JSON.stringify(vs)===vBefore,'village mutated caller state');
  const remaining=first.village.landExpansionProjects[0].remainingTurns;
  ok(advanceV39VillageResourceTeams(first.state,first.village,map,10).village.landExpansionProjects[0].remainingTurns===remaining,'same-turn advanced twice');
  const contested={...first.state,enemies:[{id:'blocker',x:target.x,y:target.y,hp:100,currentHp:100}]};
  const paused=advanceV39VillageResourceTeams(contested,first.village,map,11);
  ok(paused.village.landExpansionProjects[0].paused&&paused.village.landExpansionProjects[0].remainingTurns===remaining,'enemy did not pause project');
  let current=paused;
  for(let turn=12;turn<20&&!current.state.territoryOwnerByTile[target.key];turn++){
   const village={...current.village,materialStockByType:current.village.landExpansionProjects[0]?.remainingTurns===1?{...current.village.materialStockByType,木材:1000}:current.village.materialStockByType};
   current=advanceV39VillageResourceTeams({...current.state,enemies:[],neutralVillages:[village],settlements:[village]},village,map,turn);
  }
  ok(current.state.territoryOwnerByTile[target.key]===v.id&&current.village.territoryTileKeys.includes(target.key),'village ownership/income area missing');
  ok(current.state.territoryStateByTile[target.key]?.settlementId===v.id,'wrong owning settlement');
  ok(current.state.players.length===1&&current.state.players[0]===human,'village became faction or modified player');
  const grown=inspectV39NeutralVillageEconomy(current.village,map,current.state),old=inspectV39NeutralVillageEconomy(v,map,vs);
  ok(grown.income.material.木材>old.income.material.木材,'claimed forest gives no real income');
  const incomeVillage={...current.village,materialStockByType:{木材:0,石材:0,鉄:0},landExpansionProjects:[]};
  const paid=advanceV39VillagePlans(current.state,incomeVillage,map,21);
  ok(paid.village.materialStockByType.木材===inspectV39NeutralVillageEconomy(incomeVillage,map,current.state).income.material.木材,'income not added to stock');
  const cancelled=land.cancelV39LandExpansion(started.state,npc.id,base.settlementId,target.key);ok(cancelled.ok&&!cancelled.state.players[1].factionState.settlements[0].landExpansionProjects.length,'cancel broken');
  const live=window.runV39FactionAiTurn({...state,players:[human,{...npc,factionState:{...npc.factionState,settlements:[{...base,materialStockByType:{...base.materialStockByType,木材:0}}]}}]},10,map);
  ok(live.reports[0].commands.some(command=>command.startsWith('資源地開拓:')),'live faction AI not connected');
  window.setV39GameState({...live.state,neutralVillages:[{...first.village,planTestKey:'cemetery'}],settlements:[]});
  window.importV39SaveJson(window.exportV39SaveJson(0));
  ok(window.getV39GameState().neutralVillages[0].landExpansionProjects.length===1,'project lost on save');window.openV39TestTools();
  return {choice,remaining,paused:paused.village.landExpansionProjects[0],completed:current.village.territoryTileKeys,woodIncome:grown.income.material.木材,oldWoodIncome:old.income.material.木材,commands:live.reports[0].commands};
 });
 await page.locator('[data-test-tab=diagnostics]').click();const section=page.locator('[data-test-section=npc-ai]');
 if(!await section.evaluate(el=>el.open))await section.locator(':scope > summary').click();
 await section.locator('[data-npc-diagnostic-view=construction]').click();
 assert.match(await section.locator('[data-npc-resource-expansion]').innerText(),/開拓中/);
 await mkdir('output/web-game/resource-expansion',{recursive:true});
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await section.locator('[data-npc-resource-expansion]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/resource-expansion/diagnostic-${width}.png`});}
 await page.evaluate(async()=>{
  window.closeV39TestTools();const s=window.getV39GameState(),v=s.neutralVillages[0];
  window.setV39GameState({players:s.players.map(player=>player.isPlayer===false?player:{...player,factionState:{...player.factionState,
   units:[{id:'plan-visitor-cemetery',name:'開拓確認者',race:'ヒューマン',className:'ファイター',level:10,hp:100,maxHp:100,ap:100,currentAp:100,worldId:'surface',x:v.x,y:v.y+1,squadId:'solo'}]}})});
  window.focusV39VillagePlanTest('cemetery');await window.waitForV39MapRenderSettled();
 });
 await page.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-info').click();
 assert.match(await page.locator('[data-village-resource-expansion]').innerText(),/開拓中/);
 for(const width of [1100,390]){await page.setViewportSize({width,height:850});await page.locator('[data-village-resource-expansion]').scrollIntoViewIfNeeded();await page.screenshot({path:`output/web-game/resource-expansion/village-${width}.png`});}
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
