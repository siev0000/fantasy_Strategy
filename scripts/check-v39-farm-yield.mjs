import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
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
const player={id:'p',race:'只人',factionState:{units:[],settlements:[],research:{},selectedSettlementId:id}};
const state={activeWorldId:'surface',timeline:{turnNumber:1},players:[player],neutralVillages:[],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
const base=m.createInitialV39Village({x:4,y:4,race:'只人',state,player,mapData:map,populationByRace:{只人:30},random:()=>0});
player.factionState.settlements=[base];
const before=m.inspectV39SettlementResourceFlow(state,player,base,map);
const built=m.advanceConstruction({...base,constructionQueue:[{facilityName:'農場',tileKey:'3,4',remainingTurns:1,totalTurns:1}]}).village;
const after=m.inspectV39SettlementResourceFlow(state,player,built,map);
console.log(JSON.stringify({before:before.productionByType.穀物,after:after.productionByType.穀物,multiplier:m.resolveV39FacilityYieldMultiplier(built,'3,4','穀物'),mode:built.territoryTileModeMap?.['3,4'],buildings:built.tileFacilityMap}));
assert(after.productionByType.穀物>before.productionByType.穀物,'completed farm must increase grain production');
