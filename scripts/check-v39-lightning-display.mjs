import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {EventEmitter} from 'node:events';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-lightning-display.js';export * from './frontend/src/v39/map/v39-lightning-layer.js';import './frontend/src/v39/map/v39-disaster-icons.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',loader:{'.webp':'dataurl'},plugins:[{name:'registry',setup(builder){builder.onLoad({filter:/game-data-registry\.js$/},args=>{
  const dir=resolve('data/source/export/json');
  const modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
  return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
});}}]});
const root=[],listeners=new Map();let invalidates=0;
function node(kind){return {kind,list:[],data:{},paths:[],setDepth(v){this.depth=v;return this;},setName(v){this.name=v;return this;},setData(k,v){this.data[k]=v;return this;},clear(){this.paths=[];return this;},lineStyle(){return this;},beginPath(){this.path=[];return this;},moveTo(x,y){this.path.push({x,y});return this;},lineTo(x,y){this.path.push({x,y});return this;},strokePath(){this.paths.push(this.path);return this;},add(value){this.list.push(value);return this;},destroy(){this.destroyed=true;const index=root.indexOf(this);if(index>=0)root.splice(index,1);}};}
function add(kind){const n=node(kind);root.push(n);return n;}
const scene={sys:{isActive:()=>true},events:new EventEmitter(),children:{list:root},time:{now:0},cameras:{main:{worldView:{x:0,y:0,width:900,height:900},zoom:1}},game:{v39InvalidateRender(){invalidates++;}},add:{container:()=>add('container'),graphics:()=>add('graphics'),circle(){throw Error('Lightning must not use small circular badges');},text(){throw Error('Lightning must not use glyph badges');},image(){throw Error('Lightning must not use icon artwork');}}};
const disaster={id:'storm',disasterId:'災害:落雷嵐',name:'落雷嵐',startsAtTurn:1,expiresAtTurn:3,tileKeys:['1,1','2,1','3,1'],damageTickTurn:1,lastTickTurn:1,damageTileKeys:['2,1']};
let state={activeWorldId:'surface',timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[disaster]}},visible=new Set(disaster.tileKeys),testMode=false;
const map={w:10,h:10},runtime={mapData:map,game:{scene:{getScenes:()=>[scene]}}};
globalThis.window={__v39FieldRuntime:runtime,getV39GameState:()=>state,isV39TestMode:()=>testMode,isV39TileInCurrentVision:(x,y)=>visible.has(`${x},${y}`),getV39DisplaySettings:()=>({}),addEventListener(name,fn){listeners.set(name,fn);}};
const warn=console.warn;let m;
try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const preview=()=>root.find(n=>n.name==='v39-lightning-preview'),impact=()=>root.find(n=>n.name==='v39-lightning-impact');
const hex={width:62,height:74,rowStep:56,oddRowOffsetX:31};
const arcs=m.v39LightningPaths({x:2,y:1},0,hex),neighbor=m.v39LightningPaths({x:3,y:1},0,hex);
assert.deepEqual(arcs[1][0],arcs[0][3],'preview is a branching arc, not a second parallel stripe');
const direction=path=>Math.atan2(path.at(-1).y-path[0].y,path.at(-1).x-path[0].x);
assert.notEqual(direction(arcs[0]),direction(neighbor[0]),'neighboring previews are not uniform parallel bands');
const bolt=m.v39LightningPaths({x:2,y:1},0,hex,true);
assert.ok(bolt[0].at(-1).y-bolt[0][0].y>hex.height*2,'impact descends from multiple tile heights');
assert.equal(preview().data.lightning.tileCount,3);
assert.equal(preview().paths.length,12,'two electric arcs per hex, with outer and core strokes');
assert.ok(preview().depth<12,'persistent arcs do not cover unit artwork');
assert.equal(impact().paths.length,0,'loading state does not replay historical damage');
assert.equal(window.getV39DisasterIconStatus().markerCount,0);
const originalPaths=JSON.stringify(preview().paths);
scene.time.now=360;scene.events.emit('update',360);assert.notEqual(JSON.stringify(preview().paths),originalPaths,'arcs animate');
const strikes=m.collectV39LightningStrikes(state,{worldEnvironment:{activeDisasters:[]}});
assert.deepEqual(strikes.map(s=>s.key),['2,1']);
assert.equal(m.collectV39LightningStrikes(state,state).length,0,'same damage tick is not repeated');
listeners.get('v39:natural-events-resolved')({detail:{worldId:'surface',lightningStrikes:strikes}});
assert.equal(impact().data.strikeCount,1);assert.equal(impact().paths.length,6,'main bolt plus two branches, outer and core strokes');
assert.ok(impact().paths[0][0].y<impact().paths[0].at(-1).y,'actual strike descends toward target');
window.renderV39DisasterIcons();assert.equal(impact().data.strikeCount,1,'redraw must not replay impact');
listeners.get('v39:natural-events-resolved')({detail:{worldId:'surface',lightningStrikes:strikes}});assert.equal(impact().data.strikeCount,1,'duplicate signal does not add another strike');
scene.time.now=5000;scene.events.emit('update',5000);assert.equal(impact().data.strikeCount,1,'blocking turn cannot expire a bolt before its first visible frame');
for(let i=0;i<6;i++){scene.time.now+=120;scene.events.emit('update',scene.time.now);}
assert.equal(impact().data.strikeCount,1,'impact remains readable after several visible frames');
for(let i=0;i<9;i++){scene.time.now+=120;scene.events.emit('update',scene.time.now);}
assert.equal(impact().data.strikeCount,0,'impact fades then clears after visible animation time');
assert.ok(preview().paths.length>0,'danger preview persists between damage ticks');
visible=new Set(['1,1']);window.renderV39DisasterIcons();assert.equal(preview().data.lightning.tileCount,1);
listeners.get('v39:natural-events-resolved')({detail:{worldId:'surface',lightningStrikes:[{...strikes[0],id:'hidden'}]}});assert.equal(impact().data.strikeCount,0);
listeners.get('v39:natural-events-resolved')({detail:{worldId:'cave:1',lightningStrikes:[{...strikes[0],key:'1,1',x:1,id:'wrong-world'}]}});assert.equal(impact().data.strikeCount,0);
testMode=true;window.renderV39DisasterIcons();assert.equal(preview().data.lightning.tileCount,3);
scene.cameras.main.worldView={x:10000,y:10000,width:10,height:10};scene.time.now+=120;scene.events.emit('update',scene.time.now);assert.equal(preview().paths.length,0,'off-camera drawing is culled');
scene.cameras.main.worldView={x:0,y:0,width:900,height:900};
map.isUnderground=true;window.renderV39DisasterIcons();assert.equal(preview(),undefined);assert.equal(scene.events.listenerCount('update'),0);
map.isUnderground=false;window.renderV39DisasterIcons();assert.ok(preview());scene.events.emit('sleep');assert.equal(preview(),undefined);assert.equal(scene.events.listenerCount('update'),0);
window.renderV39DisasterIcons();assert.ok(preview());state={...state,timeline:{turnNumber:4}};window.renderV39DisasterIcons();assert.equal(preview(),undefined,'expired storm clears');
assert.equal(m.collectV39LightningTiles({},state,()=>true).length,0);
assert.ok(invalidates>0);
console.log('PASS: actual disaster renderer without icons, animated tile arcs, damage-selected strike only, no load/redraw replay, dedup, fade, vision/test/world filtering, camera culling, expiration/sleep cleanup. No browser.');
