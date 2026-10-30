import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {EventEmitter} from 'node:events';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/v39/map/v39-tornado-layer.js';export * from './frontend/src/lib/v39-tornado-display.js';export {resolveV39EffectPlaybackDescriptor} from './frontend/src/v39/combat/v39-effect-player.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"'},plugins:[{name:'vite-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};});
  builder.onLoad({filter:/[\\/]combat[\\/]v39-effect-player\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
const timers=new Map();let serial=0,loads=0,invalidates=0;
const originalSet=globalThis.setInterval,originalClear=globalThis.clearInterval,originalImage=globalThis.Image;
globalThis.setInterval=(fn)=>{const id=++serial;timers.set(id,fn);return id;};globalThis.clearInterval=id=>timers.delete(id);
globalThis.Image=class{width=768;height=64;set src(value){this.url=value;loads++;queueMicrotask(()=>this.onload());}};
globalThis.window={localStorage:{getItem:()=>null,setItem(){},removeItem(){}},addEventListener(){},dispatchEvent(){}};
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
try{
  const warn=console.warn;console.warn=()=>{};
  const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);console.warn=warn;
  assert.ok(window.getV39EffectCatalog().includes('竜巻'));
  const descriptor=m.resolveV39EffectPlaybackDescriptor('竜巻');assert.equal(descriptor.sequenceSources[0].frameStart,0);assert.equal(descriptor.sequenceSources[0].frameEnd,11);assert.ok(decodeURIComponent(descriptor.sequenceSources[0].src).includes('竜巻.webp'));
  const textures=new Map(),images=[];
  const manager={game:{renderer:{}},exists:key=>textures.has(key),get:key=>textures.get(key),addImage(key,image){textures.set(key,{getSourceImage:()=>image});}};
  const game={textures:manager,v39InvalidateRender(){invalidates++;}},scene={game,sys:{game},textures:manager,events:new EventEmitter(),cameras:{main:{worldView:{x:0,y:0,width:1000,height:1000}}},make:{graphics:()=>({fillStyle(){},fillPoints(){},createGeometryMask:()=>({destroy(){}}),destroy(){}})},add:{image(){const image={scene,frame:{data:{}},setOrigin(){},setScale(){},setDepth(){},setAngle(){},setAlpha(){},setBlendMode(){},setName(){},clearTint(){},setCrop(x){this.cropX=x;},setPosition(){},setMask(mask){this.mask=mask;},clearMask(){this.mask=null;},destroy(){this.scene=null;}};images.push(image);return image;}}};
  const event={id:'tornado',disasterId:'災害:竜巻',x:3,y:3,radius:1,tileKeys:['3,3','4,3'],startsAtTurn:1,expiresAtTurn:4};
  const state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[event]}};
  assert.equal(m.collectV39TornadoFields({isUnderground:true},state,null,true).length,0);
  assert.equal(m.collectV39TornadoFields({},state,new Set()).length,0);
  const fields=m.collectV39TornadoFields({},state,new Set(['3,3']));assert.equal(fields[0].tileKeys.length,1);
  m.drawV39TornadoLayer(scene,[fields[0],{...fields[0],id:'second',x:6}]);await flush();
  assert.equal(loads,1,'all tornadoes share one texture');assert.equal(timers.size,2);assert.equal(images[0].cropX,0);assert.ok(images[0].mask);
  for(let frame=1;frame<12;frame++){for(const fn of [...timers.values()])fn();assert.equal(images[0].cropX,frame*64);}
  for(const fn of [...timers.values()])fn();assert.equal(images[0].cropX,0);
  m.drawV39TornadoLayer(scene,[{...fields[0],x:4}]);await flush();assert.equal(loads,1);assert.equal(timers.size,1);assert.equal(images[0].scene,null);
  m.drawV39TornadoLayer(scene,[]);await flush();assert.equal(timers.size,0);assert.equal(scene.events.listenerCount('sleep'),0);assert.equal(scene.events.listenerCount('shutdown'),0);
  m.drawV39TornadoLayer(scene,fields);await flush();scene.events.emit('sleep');await flush();assert.equal(timers.size,0);
  assert.equal(m.collectV39TornadoFields({}, {...state,timeline:{turnNumber:5}},null,true).length,0);
  assert.ok(invalidates>0);
  console.log('PASS: dedicated tornado catalog/descriptor, twelve 64px frames looping, shared texture, visibility, mask, movement, expiration, sleep and cleanup. No browser.');
}finally{globalThis.setInterval=originalSet;globalThis.clearInterval=originalClear;globalThis.Image=originalImage;}
