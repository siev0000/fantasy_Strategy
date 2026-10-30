import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-population-economy.js';export * from './frontend/src/lib/v39-population-trend.js';export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const run=(village,income={},populationCapacity=100)=>m.advanceV39PopulationEconomy({village,income,populationCapacity,resourceKeys:m.FOOD_RESOURCE_KEYS,normalFoodKeys:m.NORMAL_FOOD_RESOURCE_KEYS});
const initial={population:20,populationByRace:{只人:20},foodStockByType:{},populationGrowthByRace:{}};
const maintenance=m.buildV39PopulationMaintenanceStock(initial.populationByRace,[],m.FOOD_RESOURCE_KEYS);
const stable=run(initial,maintenance),required=stable.populationGrowthByRace.只人.lastRequiredGauge;
assert.equal(stable.populationGrowthByRace.只人.lastGaugeChange,0);
const birth=run({...initial,foodStockByType:Object.fromEntries(Object.entries(maintenance).map(([key,value])=>[key,value*10])),populationGrowthByRace:{只人:{gauge:required-0.1,lastRequiredGauge:required,lastPopulation:20}}},{...maintenance,穀物:maintenance.穀物+1});
assert(birth.populationChanges.只人>0);assert.equal(birth.populationGrowthByRace.只人.lastGaugeChange,1);
assert(birth.populationGrowthByRace.只人.gauge<required-0.1,'birth consumes gauge but trend remains positive');
let html=m.renderV39PopulationTrend({...birth,lastEconomyDelta:{turn:12,populationByRace:birth.populationChanges}},'只人');
assert(html.includes('前回 T12'));assert(html.includes('成長 ＋1（成長中）'));assert(html.includes('人口 ＋'));
const hungry=run({...initial,populationGrowthByRace:{只人:{gauge:5,lastRequiredGauge:required,lastPopulation:20}}});
assert(hungry.populationGrowthByRace.只人.lastGaugeChange<0);
assert(m.renderV39PopulationTrend(hungry,'只人').includes('減少中'));
const decline=run(initial);assert(decline.populationChanges.只人<0);assert.equal(decline.populationGrowthByRace.只人.lastPopulationDelta,decline.populationChanges.只人);
assert(m.renderV39PopulationTrend(decline,'只人').includes('人口 −'));
const full=run(initial,maintenance,20);assert(m.renderV39PopulationTrend(full,'只人').includes('停滞'));
assert(m.renderV39PopulationTrend({},'只人').includes('未記録'));
const old={populationGrowthByRace:{只人:{gauge:3}},lastEconomyDelta:{populationByRace:{只人:2},turn:1}};
assert.equal(m.inspectV39PopulationTrend(old,'只人').population,2);assert.equal(m.inspectV39PopulationTrend(old,'只人').gauge,null);
assert.equal(m.renderV39PopulationTrend(JSON.parse(JSON.stringify(birth)),'只人'),m.renderV39PopulationTrend(birth,'只人'));
console.log('PASS: real birth/positive growth, hunger/negative growth, population decrease and capacity stagnation, gauge reset not mistaken for decline, last-turn labels, legacy unknowns and save persistence. No browser.');
