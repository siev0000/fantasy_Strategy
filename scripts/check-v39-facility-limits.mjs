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
let base=m.createInitialV39Village({x:4,y:4,race:'只人',state,player,mapData:map,populationByRace:{只人:30},random:()=>0});
base={...base,cityLevels:{鍛冶Lv:10,魔法Lv:10,信仰Lv:10,軍事Lv:10,経済Lv:10},materialStockByType:Object.fromEntries(m.MATERIAL_RESOURCE_KEYS.map(key=>[key,10000])),
  tileFacilityMap:{'3,4':['農場'],'3,3':['農場'],'4,3':['倉庫'],'3,5':['市場']},buildings:['農場','倉庫','市場']};
player.factionState.settlements=[base];
const definitions=m.facilityDefinitions(),farm=definitions.find(row=>row.name==='農場'),temple=definitions.find(row=>row.name==='神殿');
assert.equal(farm.buildLimit,0);assert.equal(temple.buildLimit,1);assert.equal(definitions.find(row=>row.name==='修道院').buildLimit,1);
let check=m.inspectV39Construction(state,player,farm,{x:5,y:4},map);
assert(check.available,check.reasons.join('/'));assert.equal(check.capacity,null);assert(check.used>3);assert.equal(check.sameCount,2);
const started=m.startV39Construction(state,'p','農場',{x:5,y:4},map);assert(started.ok,started.reason);
const completed=m.advanceConstruction({...base,constructionQueue:[{facilityName:'農場',tileKey:'5,4',remainingTurns:1}]}).village;
assert.equal(m.countV39FacilityInstances(completed,'農場'),3);
check=m.inspectV39Construction(state,player,farm,{x:3,y:4},map);assert(check.reasons.some(reason=>reason.includes('既に施設')),'one facility per tile still enforced');
player.factionState.settlements=[{...base,tileFacilityMap:{...base.tileFacilityMap,'3,5':['神殿']}}];
check=m.inspectV39Construction(state,player,temple,{x:5,y:4},map);assert(check.reasons.some(reason=>reason.includes('同施設の建設上限 1/1')));
player.factionState.settlements=[{...base,constructionQueue:[{id:'queued-temple',facilityName:'神殿',tileKey:'4,5',remainingTurns:1}]}];
check=m.inspectV39Construction(state,player,temple,{x:5,y:4},map);assert(check.reasons.some(reason=>reason.includes('同施設の建設上限 1/1')),'limited facilities count queued work');
const ui=readFileSync('frontend/src/v39/world/v39-land-construction-ui.js','utf8');assert(!ui.includes('<dt>施設枠</dt>'));assert(ui.includes('同施設の上限'));
console.log('PASS: unlimited normal facilities, no settlement slots, preserved explicit special limits including queued work, real third farm construction and one-facility-per-tile/UI rules. No browser.');
