import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/v39/map/v39-land-production.js';export * from './frontend/src/v39/ui/v39-land-tabs.js';export * from './frontend/src/lib/v39-economy-rules.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
assert.deepEqual(m.V39_LAND_TABS.map(tab=>tab.label),['概要','生産','環境','建築・設備']);
for(const [label,tab] of Object.entries({'地形':'overview','施設':'overview','天候':'environment','浄化':'environment','特産資源':'production','結界 / 壁':'facilities','開拓難易度':'facilities'}))assert.equal(m.getV39LandFieldTab(label),tab);
const buttons=m.V39_LAND_TABS.map(tab=>({dataset:{landTab:tab.id},attributes:{},setAttribute(k,v){this.attributes[k]=v;}}));
const sections=m.V39_LAND_TABS.map(tab=>({dataset:{landPage:tab.id},hidden:false}));
const scroll={scrollTop:200};
const panel={dataset:{},querySelectorAll:s=>s==='[data-land-tab]'?buttons:sections,querySelector:()=>scroll};
for(const tab of m.V39_LAND_TABS){m.selectV39LandTab(panel,tab.id);assert.equal(panel.dataset.landTab,tab.id);assert.equal(sections.filter(s=>!s.hidden).length,1);assert.equal(sections.find(s=>!s.hidden).dataset.landPage,tab.id);assert.equal(buttons.filter(b=>b.attributes['aria-selected']==='true').length,1);assert.equal(scroll.scrollTop,0);}
assert.equal(m.selectV39LandTab(panel,'unknown'),'overview');
const keys=['4,4','3,4','5,4','3,3','4,3','3,5','4,5'],id='village-4-4';
const map={w:12,h:10,grid:Array.from({length:10},()=>Array(12).fill('平地')),specialMap:[],hazardZones:[]};
const player={id:'p',race:'只人',factionState:{units:[],settlements:[],research:{},selectedSettlementId:id,exploration:{discoveredSpecialtiesByTile:{'3,4':{name:'キノコ',x:3,y:4}}}}};
const state={activePlayerId:'p',activeWorldId:'surface',timeline:{turnNumber:1,phase:'player'},players:[player],settlements:[],enemies:[],neutralVillages:[],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:id,hp:100,maxHp:100}])),facilitiesByTile:{}};
const base=m.createInitialV39Village({x:4,y:4,race:'只人',state,player,mapData:map,populationByRace:{只人:30},random:()=>0});
player.factionState.settlements=[base];
const tile={x:3,y:4,key:'3,4',terrain:'平地'};
const before=JSON.stringify(state),model=m.inspectV39LandProduction(state,map,tile);
assert(model.base.穀物>0);assert(model.normal.穀物>0);assert.equal(model.fixed.穀物,5);assert.equal(JSON.stringify(state),before,'display does not mutate state');
const html=m.renderV39LandProduction(model);assert(html.includes('通常産出見込み'));assert(html.includes('特産品の固定収入'));assert(!html.includes('undefined'));
assert(!m.inspectV39LandProduction({...state,territoryOwnerByTile:{}},map,tile).normal,'do not show foreign production');
const cave=m.inspectV39LandProduction({...state,activeWorldId:'cave-1'},map,tile);assert.deepEqual(cave.base,{});assert(cave.note.includes('手持ち'));
assert(!m.renderV39LandProduction({base:{},note:'<script>'}).includes('<script>'));
const ui=readFileSync('frontend/src/v39/ui/v39-operation-ui.js','utf8'),css=readFileSync('frontend/src/v39/ui/v39-operation-layout.css','utf8');
assert(ui.indexOf('v39-land-head')<ui.indexOf('id="v39-land-scroll"'));
assert(ui.indexOf('class="v39-land-tabs"')<ui.indexOf('id="v39-land-scroll"'));
assert(css.includes('#v39-land-scroll{min-width:0;min-height:0;overflow:auto;'));
assert(css.includes('grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr);'));
assert(!readFileSync('frontend/index.html','utf8').includes('#footTile.land-panel{'),'legacy important three-column rule must not override land layout');
assert(css.includes('#footTile .land-item[hidden]{display:none!important}'));
assert(readFileSync('frontend/src/v39/world/v39-land-construction-ui.css','utf8').includes(':not(#v39-land-construction)'));
console.log('PASS: four tabs, field grouping, visibility/ARIA, fixed-header scroll structure, pure production estimates, fixed specialty income, foreign/cave guards and construction overlay. No browser.');
