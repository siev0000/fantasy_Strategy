import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39VillagePlanTest();
  const {createInitialV39Village:create,collectV39TerritoryIncome,FOOD_RESOURCE_KEYS,NORMAL_FOOD_RESOURCE_KEYS,MATERIAL_RESOURCE_KEYS}=await import('/src/lib/v39-economy-rules.js');
  const {buildV39PopulationMaintenanceStock:maintenance,advanceV39PopulationEconomy}=await import('/src/lib/v39-population-economy.js');
  const {V39_INITIAL_STOCK_BALANCE:balance}=await import('/src/lib/v39-gameplay-balance.js');
  const ok=(value,message)=>{if(!value)throw Error(message);};
  const source=window.getV39GameState(),template=source.players[0],id='village-4-4',keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'];
  const map={...window.__v39FieldRuntime.mapData,grid:Array.from({length:16},()=>Array(20).fill('森')),specialMap:[],hazardZones:[]};
  const state={...source,players:[],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,template.id])),
   territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
  const roster=race=>[{id:'sovereign',race,hp:100},{id:'army-1',race,hp:100,combatProfile:{mode:'army'}},
   {id:'army-2',race,hp:100,combatProfile:{mode:'army'}},
   {id:'other-base',race,hp:100,settlementId:'another',combatProfile:{mode:'army'}},
   {id:'dead',race,hp:0,state:'死亡',combatProfile:{mode:'army'}}];
  const snapshots=[];
  for(const race of ['只人','エルフ','オーガ','悪魔','天使','ヴァンパイア']){
   const units=roster(race),initialUnits=units.slice(0,3),player={...template,race,factionState:{units,settlements:[],selectedSettlementId:''}};
   const base=create({x:4,y:4,race,state,player,mapData:map,random:()=>0});
   player.factionState.settlements=[base];player.factionState.selectedSettlementId=id;
   const expected=maintenance(base.populationByRace,initialUnits,FOOD_RESOURCE_KEYS,balance.normalFoodMaintenanceTurns,{roundUp:true});
   const income=collectV39TerritoryIncome(state,player,map);
   for(const key of FOOD_RESOURCE_KEYS){
    const produced=Math.round(income.food[key]*balance.territoryIncomeTurns*10)/10;
    const target=Math.max(produced,expected[key]||0);
    ok(Math.abs(base.foodStockByType[key]-target)<0.01,`${race} ${key}: initial food mismatch`);
   }
   for(const key of MATERIAL_RESOURCE_KEYS)ok(base.materialStockByType[key]===Math.round(income.material[key]*30)/10,'material grant changed');
   if(['悪魔','天使'].includes(race))ok(base.foodStockByType.魂>0,'soul upkeep omitted');
   if(race==='ヴァンパイア')ok(base.foodStockByType.死体>0,'corpse upkeep omitted');
   const noArmies=create({x:4,y:4,race,state,player,mapData:map,initialUnits:[],random:()=>0});
   ok(NORMAL_FOOD_RESOURCE_KEYS.some(key=>base.foodStockByType[key]>noArmies.foodStockByType[key]),'initial armies omitted');
   snapshots.push({race,population:base.populationByRace,stock:base.foodStockByType,minimum:expected});
   if(race==='只人'){
    let current=base;
    for(let turn=0;turn<10;turn++){
     const step=advanceV39PopulationEconomy({village:current,units:initialUnits,income:{},resourceKeys:FOOD_RESOURCE_KEYS,
      normalFoodKeys:NORMAL_FOOD_RESOURCE_KEYS});
     ok(step.shortageTotal===0,'food failed before ten turns without income');current={...current,...step};
    }
   }
  }
  const player={...template,race:'只人',factionState:{...template.factionState,units:[],settlements:[]}};
  const high=create({x:4,y:4,race:'只人',player,state,mapData:map,populationByRace:{只人:1},initialUnits:[]});
  ok(high.foodStockByType.野菜>=Math.round(collectV39TerritoryIncome(state,{...player,factionState:{...player.factionState,settlements:[high],selectedSettlementId:id}},map).food.野菜*30)/10,'production grant lowered');
  ok(window.getV39EconomyRules().initialFoodMaintenanceTurns===10,'runtime inspection has stale settings');
  return snapshots;
 });
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result,errors},null,2));
}finally{await browser.close();}
