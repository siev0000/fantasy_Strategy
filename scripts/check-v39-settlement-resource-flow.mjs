import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-resource-delta-view.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';export * from './frontend/src/v39/world/v39-settlement-resource-flow-ui.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const ledger=m.buildV39ResourceFlowRecord({production:{穀物:10,木材:5},before:{穀物:20,木材:3},after:{穀物:25,木材:6},maintenance:{穀物:3},reserved:{穀物:1,木材:2}});
assert.equal(ledger.consumptionByType.穀物,5);assert.equal(ledger.growthConsumptionByType.穀物,1);
assert.equal(ledger.deltaByType.穀物,5);assert.equal(ledger.consumptionByType.木材,2);
const keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'];
const map={w:12,h:10,grid:Array.from({length:10},()=>Array(12).fill('森')),specialMap:[],hazardZones:[]};
for(const race of ['只人','悪魔','ヴァンパイア']){
  const player={id:'p',race,factionState:{units:[{id:'u',race,level:10,hp:100}],settlements:[],research:{},selectedSettlementId:''}};
  let state={activeWorldId:'surface',activePlayerId:'p',timeline:{turnNumber:1,phase:'resolution'},players:[player],settlements:[],enemies:[],neutralVillages:[],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:'village-4-4',hp:100,maxHp:100}])),facilitiesByTile:{}};
  const base=m.createInitialV39Village({x:4,y:4,race,state,player,mapData:map,random:()=>0});
  player.factionState.settlements=[base];player.factionState.selectedSettlementId=base.settlementId||base.id;
  const snapshot=JSON.stringify(state);
  const forecast=m.inspectV39SettlementResourceFlow(state,player,base,map);
  assert.equal(JSON.stringify(state),snapshot,'viewing is pure: no population/trade/harvest progress changes');
  const repeat=m.inspectV39SettlementResourceFlow(state,player,base,map);assert.deepEqual(repeat,forecast);
  player.factionState.units.push({id:'other-base-unit',race,hp:100,settlementId:'other-base',combatProfile:{mode:'elite_army'}});
  assert.deepEqual(m.inspectV39SettlementResourceFlow(state,player,base,map),forecast,'exclude units maintained by another base');
  for(const key of [...m.FOOD_RESOURCE_KEYS,...m.MATERIAL_RESOURCE_KEYS])
    assert(Math.abs((forecast.productionByType[key]||0)-(forecast.consumptionByType[key]||0)-(forecast.deltaByType[key]||0))<.11);
  const headerBefore=JSON.stringify(state);
  const header=m.buildV39HeaderResourceSnapshot(state,player,base,map);
  const headerItems=Object.values(header).flatMap(group=>group.items);
  assert(headerItems.some(item=>item.delta!==0),'initial header must not zero every resource');
  for(const item of headerItems){
    assert.equal(item.delta,forecast.deltaByType[item.name]||0,`${race}: initial header uses production forecast`);
    assert.equal(item.value,base.foodStockByType[item.name]??base.materialStockByType[item.name]??0,'stock remains current, not projected');
  }
  assert.equal(JSON.stringify(state),headerBefore,'header forecast must not consume resources or advance time');
  const actual=m.advanceV39EconomyTurn(state,map).state.players[0].factionState.settlements[0].lastEconomyDelta;
  assert(actual?.productionByType,'actual economy records production, not only stock delta');
  assert.deepEqual(m.buildV39HeaderResourceSnapshot(state,player,{...base,lastEconomyDelta:actual},map),m.buildV39ResourceSnapshot({...base,lastEconomyDelta:actual}),'recorded header remains unchanged');
  assert(Object.values(m.buildV39HeaderResourceSnapshot(state,player,{...base,placed:false},map)).flatMap(group=>group.items).every(item=>item.delta===0),'unplaced base must not produce a forecast');
  assert.deepEqual(actual.productionByType,forecast.productionByType,`${race}: forecast production matches stable economy`);
  assert.deepEqual(actual.deltaByType,forecast.deltaByType,`${race}: forecast net matches stable economy`);
  const html=m.renderV39SettlementResourceFlow(base,forecast);
  for(const label of ['在庫','生産','消費','差引','現在の予測','前回実績'])assert(html.includes(label));
  assert(html.includes('data-resource-flow-refresh'));
  assert(m.renderV39SettlementResourceFlow(base,null,'recorded').includes('未記録'));
}
console.log('PASS: conservation, maintenance/growth/trade breakdown, pure forecast, actual economy parity for human/demon/vampire and shared renderer. No browser.');
