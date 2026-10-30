import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-cast-symbol.js';export * from './frontend/src/v39/map/v39-field-symbols.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.document={addEventListener(){}};globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const bubble=m.getV39CastSymbolShape('cast'),magic=m.getV39CastSymbolShape('ready');
assert.equal(bubble.circles.filter(c=>c.fill).length,3,'speaking bubble has three speech dots');assert(bubble.background);
assert.equal(magic.circles.length,2);assert.equal(magic.lines.length,2,'magic circle has rings and interlocking triangles');
assert(m.renderV39CastSymbol(false).includes('data-v39-cast-symbol="cast"'));assert(m.renderV39CastSymbol(false).includes('fill="#10242b"'));
assert(m.renderV39CastSymbol(true).includes('<circle'));assert(!m.renderV39CastSymbol(true).includes('<polygon'));
const calls=[],g={setPosition(){return this;},setScale(){return this;},setName(){return this;},setData(){return this;},lineStyle(){return this;},fillStyle(){return this;},fillPoints(){return this;},strokePoints(){return this;},fillCircle(...args){calls.push(['dot',...args]);return this;},strokeCircle(...args){calls.push(['ring',...args]);return this;}};
const scene={add:{graphics:()=>g}},parent={add(){}};
m.addV39FieldSymbol(scene,parent,'cast',0,0,24);assert.equal(calls.filter(c=>c[0]==='dot').length,3);
calls.length=0;m.addV39FieldSymbol(scene,parent,'ready',0,0,24);assert.equal(calls.filter(c=>c[0]==='ring').length,2);
const source=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
const castSource=source.slice(source.indexOf('function addCastVisual('),source.indexOf('function drawUnitGroup('));
let ready=false;const items=[],marker={list:[{name:'unit-art'}],sendToBack(item){this.list.splice(this.list.indexOf(item),1);this.list.unshift(item);}};
const draw=new Function('window','describeV39Cast','getV39UnitCast','addV39FieldSymbol',`${castSource};return addCastVisual;`)({getV39TimelineState:()=>({turnNumber:1})},()=>({ready,label:ready?'発動可能':'詠唱中'}),()=>({}),(_scene,owner,kind,x,y,size,opts)=>{const item={kind,x,y,size,opts,setAlpha(v){this.alpha=v;return this;}};items.push(item);owner.list.push(item);return item;});
draw({},marker,{id:'u'},20);assert.equal(items[0].kind,'cast');assert(items[0].x>0&&items[0].y<0,'speech bubble stays above the character');
ready=true;draw({},marker,{id:'u'},20);assert.equal(marker.list[0].kind,'ready');assert.equal(marker.list[0].size,40);assert.equal(marker.list[0].x,0);assert.equal(marker.list[0].y,0);assert.equal(marker.list[0].alpha,0.8,'magic is centered behind the portrait');
assert(readFileSync('frontend/src/v39/unit/v39-unit-card.js','utf8').includes('renderV39CastSymbol(cast.ready)'));
console.log('PASS: shared speech-bubble/magic-circle geometry in DOM and Phaser, visible speech dots, ready circle behind unit, and no casting-rule changes. No browser.');
