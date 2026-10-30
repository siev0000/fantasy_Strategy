import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-population-economy.js';export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
assert.equal(m.isV39MaintenanceFoodResource('魂'),false);
assert.equal(m.isV39MaintenanceFoodResource('死体'),true);
assert(m.FOOD_RESOURCE_KEYS.includes('魂'),'keep the existing stock ledger for compatibility');
assert.equal(m.resolveV39PopulationResourceUnitValue('魂'),100,'growth resource value unchanged');
for(const race of ['悪魔','天使']){
  const units=[{id:'hero',race,hp:100},{id:'army',race,hp:100,combatProfile:{mode:'army',memberCount:3}}];
  const demand=m.buildV39PopulationMaintenanceStock({[race]:20},units,m.FOOD_RESOURCE_KEYS,10,{roundUp:true});
  assert.equal(demand.魂,0,`${race} population and army have no soul upkeep`);
  assert(!m.resolveV39ConsumableFoodKeys(race,m.FOOD_RESOURCE_KEYS,m.NORMAL_FOOD_RESOURCE_KEYS).includes('魂'),'AI food choice excludes souls');
  for(const initialSouls of [0,8]){
    let village={population:20,populationByRace:{[race]:20},foodStockByType:{魂:initialSouls,穀物:10000,野菜:10000,肉:10000,魚:10000},populationGrowthByRace:{}};
    for(let turn=0;turn<10;turn++){
      const result=m.advanceV39PopulationEconomy({village,units,income:{},resourceKeys:m.FOOD_RESOURCE_KEYS,normalFoodKeys:m.NORMAL_FOOD_RESOURCE_KEYS,populationCapacity:20});
      assert.equal(result.consumedByType.魂,0);assert.equal(result.shortageTotal,0);assert.equal(result.foodStockByType.魂,initialSouls);
      village=JSON.parse(JSON.stringify({...village,...result}));
    }
  }
  const growth=m.advanceV39PopulationEconomy({village:{population:20,populationByRace:{[race]:20},foodStockByType:{魂:8,穀物:10000,野菜:10000,肉:10000,魚:10000}},units,
    resourceKeys:m.FOOD_RESOURCE_KEYS,normalFoodKeys:m.NORMAL_FOOD_RESOURCE_KEYS,populationCapacity:100});
  assert.equal(growth.consumedByType.魂,0);assert(growth.foodStockByType.魂<8,'soul growth consumption is intentionally preserved');
  assert(growth.populationGrowthByRace[race].gauge>0||growth.population>20);
}
assert(m.buildV39PopulationMaintenanceStock({只人:20},[],m.FOOD_RESOURCE_KEYS).穀物>0,'human food upkeep remains');
assert(m.buildV39PopulationMaintenanceStock({ヴァンパイア:20},[],m.FOOD_RESOURCE_KEYS).死体>0,'corpse upkeep remains');
const mixed=m.buildV39PopulationMaintenanceStock({天使:20,只人:20},[],m.FOOD_RESOURCE_KEYS);
assert.equal(mixed.魂,0);assert(mixed.穀物>0);
console.log('PASS: no soul population/army upkeep or starvation, AI food exclusion, ten turns and save restoration, existing soul stock preserved at cap, growth still spends souls, ordinary food/corpses unchanged. No browser.');
