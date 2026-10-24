import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/city-specialization';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',error=>errors.push(String(error.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
  const rules=await import('/src/lib/v39-city-specialization-rules.js');
  const {cityData}=await import('/src/lib/game-data-registry.js');
  const {getFactionSettlements}=await import('/src/lib/settlement-state.js');
  const {resolveV39CivicTurn}=await import('/src/lib/v39-civic-rules.js');
  const {advanceV39EconomyTurn}=await import('/src/lib/v39-economy-rules.js');
  const save=await import('/src/v39/core/v39-save-system.js');
  const {executeV39EnemyTerritoryRaid}=await import('/src/v39/ai/v39-enemy-raiding.js');
  const state=window.getV39GameState(),owner=state.players.find(p=>p.id===state.activePlayerId),base=getFactionSettlements(owner.factionState)[0],id=base.settlementId;
  const failures=[],ok=(value,message)=>{if(!value)failures.push(message);};
  const map=window.__v39FieldRuntime.mapData;
  const rich={...base,type:'都市',scaleKey:'city',scaleLevel:3,worldId:'cave:test:1',population:100,populationByRace:{ゾンビ:100},
   cityLevels:{魔法Lv:4,信仰Lv:4,軍事Lv:4,経済Lv:4,鍛冶Lv:4},cityTraits:['浮遊'],citySpecializationId:'',
   tileFacilityMap:{'3,3':['農場'],'4,3':['農場'],'5,3':['農場']}};
  const player={...owner,factionState:{...owner.factionState,settlements:[rich],selectedSettlementId:id}};
  const full={...state,players:[player],timeline:{...state.timeline,turnNumber:10},territoryOwnerByTile:{'3,3':owner.id,'4,3':owner.id,'5,3':owner.id},
   territoryStateByTile:{'3,3':{settlementId:id,hp:100,maxHp:100},'4,3':{settlementId:id},'5,3':{settlementId:id}}};
  const fakeMap={...map,grid:map.grid.map(row=>row.slice())};fakeMap.grid[rich.y][rich.x]='海';
  const inspect=(s=full,p=player,b=rich)=>rules.inspectV39CitySpecializations(s,p,b,fakeMap);
  const choices=inspect();ok(choices.length===14,'normal specialization count');
  ok(choices.every(choice=>choice.available),`valid conditions rejected: ${choices.filter(c=>!c.available).map(c=>c.name+':'+c.reason)}`);
  ok(!inspect(full,player,{...rich,scaleLevel:2}).some(c=>c.available),'town accepts city specialization');
  const poor={...rich,cityLevels:{},population:50,populationByRace:{只人:50},tileFacilityMap:{},worldId:'surface',cityTraits:[]};
  ok(!inspect(full,player,poor).find(c=>c.name==='魔法都市').available,'research threshold bypassed');
  ok(!inspect(full,player,poor).find(c=>c.name==='農業都市').available,'unbuilt farms counted');
  ok(!inspect(full,player,{...rich,worldId:'surface'}).find(c=>c.name==='地下都市').available,'surface accepted as cave');
  ok(!inspect(full,player,poor).find(c=>c.name==='死者の都').available,'living residents accepted as undead');
  const otherBase={...rich,tileFacilityMap:{'3,3':['農場'],'4,3':['農場'],'5,3':['農場']}};
  const otherLand={...full,territoryStateByTile:{'3,3':{settlementId:'other'},'4,3':{settlementId:'other'},'5,3':{settlementId:'other'}}};
  ok(!inspect(otherLand,player,otherBase).find(c=>c.name==='農業都市').available,'other settlement farms counted');
  const choose=rules.selectV39CitySpecialization(full,owner.id,id,'交易都市');ok(choose.ok,'selection failed');
  const selected=choose.state.players[0].factionState.settlements[0];
  ok(!rules.selectV39CitySpecialization(choose.state,owner.id,id,'魔法都市').ok,'cooldown bypassed');
  ok(rules.selectV39CitySpecialization(choose.state,owner.id,id,'交易都市').state===choose.state,'reselect resets cooldown');
  const later={...choose.state,timeline:{...full.timeline,turnNumber:15}};
  ok(rules.selectV39CitySpecialization(later,owner.id,id,'魔法都市').ok,'cooldown boundary');
  const modifiers=rules.resolveV39CitySpecializationModifiers({...selected,cityTraits:['古代遺跡都市']});
  ok(Math.abs(modifiers.foodMultiplier-1.15*1.05)<1e-8,'rare trait stacking');
  const unknown=rules.resolveV39CitySpecializationModifiers({...rich,cityTraits:['unknown'],citySpecializationId:'unknown'});
  ok(unknown.foodMultiplier===1&&unknown.materialMultiplier===1,'unknown name grants fallback bonus');
  const row=cityData.find(row=>row.項目名==='交易都市'),original={...row};
  try{
   row.食料産出補正=37;row.資材産出補正=0;row.必要拠点Lv=2;
   ok(Math.abs(rules.resolveV39CitySpecializationModifiers({...rich,citySpecializationId:'交易都市'}).foodMultiplier-1.37)<1e-8,'sheet value not used');
   ok(inspect(full,player,{...rich,scaleLevel:2}).find(c=>c.name==='交易都市').available,'sheet minimum scale ignored');
   row.条件='未対応:3以上';ok(!inspect().find(c=>c.name==='交易都市').available,'unknown condition allowed');
  }finally{Object.assign(row,original);}
  const religious={...rich,populationByRace:{只人:100},civicState:{lastProcessedTurn:0},citySpecializationId:'信仰都市',cityTraits:['unknown']};
  const civicBase=resolveV39CivicTurn(religious,1),civic=resolveV39CivicTurn(religious,1,[],{names:[],bonus:0},{},{},rules.resolveV39CitySpecializationModifiers(religious));
  ok(civic.happinessTargetByRace.只人===Math.min(100,civicBase.happinessTargetByRace.只人+10),'specialization happiness');
  ok(civic.modifiers.specializationSecurity===5,'specialization security');
  const defended={...full,players:[{...player,factionState:{...player.factionState,settlements:[{...rich,worldId:'surface',citySpecializationId:'城塞都市'}]}}]};
  ok(rules.resolveV39CityTerritoryDamage(defended,'3,3',100)===80,'territory defense damage');
  ok(rules.resolveV39CityTerritoryDamage(defended,'8,8',100)===100,'defense leaks to unowned territory');
  const enemy={id:'test-raider',x:3,y:3,hp:100,maxHp:100,ap:100,currentAp:100,level:1,stats:{攻撃:100}};
  const raid={...defended,enemies:[enemy]};window.setV39GameState(raid);
  const attacked=executeV39EnemyTerritoryRaid({enemyId:enemy.id,tileKey:'3,3',skillRow:{名前:'試験',威力:100,AP消費:1},turnNumber:10});
  const {resolveAttackPower}=await import('/src/lib/v39-combat-engine.js');
  ok(attacked.ok&&attacked.damage===rules.resolveV39CityTerritoryDamage(raid,'3,3',resolveAttackPower({名前:'試験',威力:100,AP消費:1},enemy)),'actual enemy raid damage reduction');
  const economicBase={...religious,lastEconomyDelta:{turn:0},civicState:{lastProcessedTurn:0},worldId:'surface'};
  const economy=advanceV39EconomyTurn({...full,players:[{...player,factionState:{...player.factionState,settlements:[economicBase]}}],timeline:{...full.timeline,turnNumber:11}},fakeMap).state;
  const economicCity=getFactionSettlements(economy.players[0].factionState)[0];
  ok(economicCity.civicState.modifiers.specializationHappiness===10,'economy missing specialization civic');
  window.setV39GameState({...state,timeline:{...state.timeline,turnNumber:10},players:state.players.map(p=>p.id===owner.id?{...p,factionState:{...p.factionState,settlements:[{...base,scaleKey:'city',scaleLevel:3,type:'都市',cityLevels:rich.cityLevels,citySpecializationId:'交易都市',citySpecializationSelectedTurn:10}]}}:p)});
  const saved=save.exportV39SaveJson();save.importV39SaveJson(saved);
  const restored=getFactionSettlements(window.getV39GameState().players.find(p=>p.id===owner.id).factionState)[0];
  ok(restored.citySpecializationId==='交易都市'&&restored.citySpecializationSelectedTurn===10,'selection save/load');
  return {failures,conditions:choices.map(c=>({name:c.name,condition:c.condition,effects:c.effects})),multiplier:modifiers.foodMultiplier};
 });
 assert.deepEqual(result.failures,[]);
 await page.locator('.footer-tab').filter({hasText:'拠点'}).click();
 await page.locator('[data-settlement-page-select="operation"]').click();
 await page.locator('[data-settlement-fold="specialization"] > summary').click();
 const visibleCount=await page.evaluate(async()=>{const rules=await import('/src/lib/v39-city-specialization-rules.js');const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),base=player.factionState.settlements.find(row=>row.settlementId===player.factionState.selectedSettlementId);return rules.inspectV39CitySpecializationNotice(state,player,base).options.filter(row=>row.unlocked||row.id===base.citySpecializationId).length;});
 assert.equal(await page.locator('[data-city-specialization]').count(),visibleCount);
 assert.match(await page.locator('[data-city-specialization="交易都市"]').innerText(),/食料 \+15%/);
 await page.screenshot({path:`${out}/loaded-${width}.png`});
 assert.deepEqual(errors,[]);console.log(`${width}: 14 conditions, scope, row values, multipliers, civic, territory raid, cooldown, save/load passed`);await page.close();
}}finally{await browser.close();}
