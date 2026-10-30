import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-npc-food-priority.js';export * from './frontend/src/lib/v39-trade-resource-availability.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';export * from './frontend/src/v39/map/v39-land-production.js';export * from './frontend/src/v39/world/v39-settlement-resource-flow-ui.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'],id='village-4-4';
const map={w:12,h:10,grid:Array.from({length:10},()=>Array(12).fill('平地')),specialMap:[],hazardZones:[]};
const player={id:'p',race:'只人',factionState:{units:[],settlements:[],research:{},selectedSettlementId:id,exploration:{discoveredSpecialtiesByTile:{'3,4':{name:'キノコ'}}}}};
const state={activePlayerId:'p',activeWorldId:'surface',timeline:{turnNumber:1,phase:'resolution'},players:[player],settlements:[],enemies:[],neutralVillages:[],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
const base=m.createInitialV39Village({x:4,y:4,race:'只人',state,player,mapData:map,populationByRace:{只人:30},random:()=>0});
player.factionState.settlements=[base];
const queue={...base,constructionQueue:[{facilityName:'農場',tileKey:'3,4',remainingTurns:1,totalTurns:1}]};
assert.deepEqual(m.resolveV39FacilityFixedIncome(queue,keys),{},'queued facility has no fixed income');
const built=m.advanceConstruction(queue).village;
assert.equal(m.resolveV39FacilityYieldMultiplier(built,'3,4','穀物'),2,'keep +100% multiplier');
assert.deepEqual(m.resolveV39FacilityFixedIncome(built,keys),{穀物:2.5,野菜:2.5});
assert.deepEqual(m.resolveV39FacilityFixedIncome(built,['3,4','3,4']),{穀物:2.5,野菜:2.5});
assert.deepEqual(m.resolveV39FacilityFixedIncome(built,keys,{divisor:10}),{穀物:5,野菜:5});
assert.deepEqual(m.resolveV39FacilityFixedIncome(built,keys,{divisor:40}),{穀物:1.3,野菜:1.2});
assert.deepEqual(m.resolveV39FacilityFixedIncome(built,keys,{divisor:0}),{});
const two={...built,tileFacilityMap:{...built.tileFacilityMap,'5,4':['農場']}};
assert.deepEqual(m.resolveV39FacilityFixedIncome(two,keys),{穀物:5,野菜:5});
const broken={...built,facilityStateByTile:{'3,4':{'農場':{hp:0,maxHp:100}}}};
assert.deepEqual(m.resolveV39FacilityFixedIncome(broken,keys),{});
for(const population of [0,1,30,300]){
  const village={...built,population,populationByRace:{只人:population}};
  const forecast=m.inspectV39SettlementResourceFlow(state,player,village,map);
  assert.deepEqual(forecast.facilityFixedIncome,{穀物:2.5,野菜:2.5},'independent of labor/skill');
  assert.deepEqual(forecast.specialtyFoodFixedIncome,{穀物:5},'specialty remains separate');
}
player.factionState.settlements=[built];
const rawIncome=m.collectV39TerritoryIncome(state,player,map);
const npc=m.inspectV39NpcFoodBalance(state,player,map)[0];
assert.equal(npc.income.穀物,rawIncome.food.穀物+2.5);
assert.equal(npc.income.野菜,rawIncome.food.野菜+2.5);
const availability=m.getV39TradeResourceAvailability(state,{kind:'player',partyId:'p',settlementId:id},map);
assert.equal(availability.穀物.income,rawIncome.food.穀物+2.5);
const before=JSON.stringify(state),forecast=m.inspectV39SettlementResourceFlow(state,player,built,map);
assert.equal(JSON.stringify(state),before,'preview must not mutate state');
const actual=m.advanceV39EconomyTurn(state,map).state.players[0].factionState.settlements[0].lastEconomyDelta;
assert.deepEqual(actual.productionByType,forecast.productionByType);
assert.deepEqual(actual.facilityFixedIncome,{穀物:2.5,野菜:2.5});
const tile=m.inspectV39LandProduction(state,map,{x:3,y:4,key:'3,4',terrain:'平地'});
assert.deepEqual(tile.facilityFixedIncome,{穀物:2.5,野菜:2.5});
assert(m.renderV39LandProduction(tile).includes('施設の固定収入'));
assert(m.renderV39SettlementResourceFlow(built,forecast).includes('施設の固定収入: 穀物 +2.5'));
for(const patch of [{raided:true},{status:'襲撃中'},{hp:0}]){
  const blocked={...state,territoryStateByTile:{...state.territoryStateByTile,'3,4':{settlementId:id,hp:100,...patch}}};
  assert.deepEqual(m.inspectV39SettlementResourceFlow(blocked,player,built,map).facilityFixedIncome,{});
}
const foreign={...state,territoryOwnerByTile:{...state.territoryOwnerByTile,'3,4':'q'}};
assert.deepEqual(m.inspectV39SettlementResourceFlow(foreign,player,built,map).facilityFixedIncome,{});
const village={...built,id:'v',settlementId:'v',ownerPlayerId:'v',race:'只人',territoryTileKeys:keys};
const neutralState={timeline:state.timeline,players:[],neutralVillages:[village],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'v'])),territoryStateByTile:{}};
assert.deepEqual(m.inspectV39NeutralVillageEconomy(village,map,neutralState).facilityFixedIncome,{穀物:2.5,野菜:2.5});
const saved=JSON.parse(JSON.stringify(state));
assert.deepEqual(m.inspectV39SettlementResourceFlow(saved,saved.players[0],saved.players[0].factionState.settlements[0],map).facilityFixedIncome,{穀物:2.5,野菜:2.5});
for(const [facility,resource] of [['伐採場','木材'],['採石場','石材'],['鉱山','鉄'],['港','魚']]){
  const village={...base,tileFacilityMap:{'3,4':[facility]}};
  const s={...state,players:[{...player,factionState:{...player.factionState,settlements:[village]}}]};
  assert.deepEqual(m.resolveV39FacilityFixedIncome(village,keys),{[resource]:5},facility);
  const preview=m.inspectV39SettlementResourceFlow(s,s.players[0],village,map);
  assert.deepEqual(preview.facilityFixedIncome,{[resource]:5});
  const result=m.advanceV39EconomyTurn(s,map).state.players[0].factionState.settlements[0].lastEconomyDelta;
  assert.deepEqual(result.productionByType,preview.productionByType,`${facility} food/material routing parity`);
}
console.log('PASS: four production skills retain multipliers plus split fixed income, configurable divisor, completed/owned/active facilities, labor independence, stacking, preview/actual parity, specialty separation, neutral villages, UI and save restoration. No browser.');
