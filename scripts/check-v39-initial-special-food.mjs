import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-population-economy.js';export * from './frontend/src/lib/v39-gameplay-balance.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'],id='village-4-4';
const map={w:12,h:10,grid:Array.from({length:10},()=>Array(12).fill('森')),specialMap:[],hazardZones:[]};
for(const race of ['只人','エルフ','オーガ','悪魔','天使','ヴァンパイア'])for(const isPlayer of [true,false]){
  const units=[{id:'hero',race,hp:100},{id:'army',race,hp:100,combatProfile:{mode:'army',memberCount:3}}];
  const player={id:'p',race,isPlayer,factionState:{units,settlements:[],research:{},selectedSettlementId:''}};
  const state={activeWorldId:'surface',players:[player],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
  const base=m.createInitialV39Village({x:4,y:4,race,state,player,mapData:map,random:()=>0});
  const demand=m.buildV39PopulationMaintenanceStock(base.populationByRace,units,m.FOOD_RESOURCE_KEYS,m.V39_INITIAL_STOCK_BALANCE.normalFoodMaintenanceTurns,{roundUp:true});
  for(const key of m.FOOD_RESOURCE_KEYS)assert(base.foodStockByType[key]>=demand[key],`${race}: missing initial ${key}`);
  if(['悪魔','天使'].includes(race))assert.equal(demand.魂,0,`${race} no longer needs souls for upkeep`);
  if(race==='ヴァンパイア')assert(base.foodStockByType.死体>0,'vampire requires initial corpses');
  if(race==='只人')assert.equal(base.foodStockByType.魂,0,'do not award souls to unrelated races');
  let current=JSON.parse(JSON.stringify(base));
  for(let turn=0;turn<10;turn++){
    const result=m.advanceV39PopulationEconomy({village:current,units,income:{},resourceKeys:m.FOOD_RESOURCE_KEYS,normalFoodKeys:m.NORMAL_FOOD_RESOURCE_KEYS});
    assert.equal(result.shortageTotal,0,`${race}: shortage at turn ${turn+1}`);
    current={...current,...result};
  }
  assert.equal(current.initialFoodReserveTurnsRemaining,0);
  const without=m.createInitialV39Village({x:4,y:4,race,state,player,mapData:map,initialUnits:[],random:()=>0});
  for(const key of m.FOOD_RESOURCE_KEYS)assert(base.foodStockByType[key]>=without.foodStockByType[key]);
}
const old={populationByRace:{悪魔:5},foodStockByType:{魂:0},populationGrowthByRace:{}};
const result=m.advanceV39PopulationEconomy({village:old,resourceKeys:m.FOOD_RESOURCE_KEYS,normalFoodKeys:m.NORMAL_FOOD_RESOURCE_KEYS});
assert.equal(result.initialFoodReserveTurnsRemaining,undefined,'no backfill/automatic grant in old saves');
assert.equal(result.foodStockByType.魂,0);
console.log('PASS: player/NPC initial food for six races, soul/corpse demand, units, ten income-free turns, reserve/growth separation, save persistence and no legacy backfill. No browser.');
