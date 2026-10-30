import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-map-quality.js';export * from './frontend/src/v39/map/v39-static-graphics-cache.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'runtime-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
assert.equal(m.normalizeV39MapQuality(null),'standard');assert.equal(m.normalizeV39MapQuality('bad'),'standard');
assert.equal(m.resolveV39MapQuality('low').cacheResolution,.5);
assert.equal(m.resolveV39MapQuality('standard').cacheResolution,1);
assert.equal(m.resolveV39MapQuality('high').cacheResolution,null);
let quality='low',textureCount=0;
globalThis.window={getV39DisplaySettings:()=>({mapQuality:quality})};
const scene={children:{list:[]},game:{renderer:{gl:{MAX_TEXTURE_SIZE:123,getParameter:()=>8192}}},add:{renderTexture(x,y,width,height){
  textureCount++;
  const texture={width,height,setName(value){this.name=value;return this;},setOrigin(){return this;},setDepth(){return this;},setDisplaySize(w,h){this.display=[w,h];return this;},clear(){return this;},
    draw(graphic){this.bakedScale=graphic.scale;return this;},destroy(){scene.children.list=scene.children.list.filter(row=>row!==this);}};
  scene.children.list.push(texture);return texture;
}}};
const makeGraphics=()=>({name:'terrain',depth:0,scale:1,cleared:false,setVisible(v){this.visible=v;return this;},setScale(v){this.scale=v;return this;},clear(){this.cleared=true;return this;}});
const map={w:20,h:20};
let graphic=makeGraphics();
assert.equal(m.cacheStaticGraphicsLayer(scene,map,graphic),true);
const low=scene.children.list[0];assert.equal(low.bakedScale,.5);assert.equal(graphic.scale,1);assert.equal(graphic.visible,false);
quality='standard';graphic=makeGraphics();assert.equal(m.cacheStaticGraphicsLayer(scene,map,graphic),true);
const standard=scene.children.list[0];assert.equal(standard.width,standard.display[0]);assert.equal(standard.height,standard.display[1]);
assert.ok(Math.abs(standard.width-low.width*2)<=1);assert.equal(standard.bakedScale,1);
quality='high';graphic=makeGraphics();assert.equal(m.cacheStaticGraphicsLayer(scene,map,graphic),false);
assert.equal(graphic.visible,true);assert.equal(graphic.cleared,false);assert.equal(scene.children.list.length,0);assert.equal(textureCount,2);
quality='standard';graphic=makeGraphics();assert.equal(m.cacheStaticGraphicsLayer(scene,{w:1000,h:1000},graphic),false);
assert.equal(graphic.cleared,false);assert.equal(textureCount,2);
scene.game.renderer.gl.getParameter=()=>128;
graphic=makeGraphics();assert.equal(m.cacheStaticGraphicsLayer(scene,map,graphic),false);
assert.equal(graphic.cleared,false);assert.equal(textureCount,2);
scene.game.renderer.gl=null;assert.equal(m.cacheStaticGraphicsLayer(scene,map,makeGraphics()),false);
const ui=readFileSync('frontend/src/v39/ui/v39-display-settings.js','utf8');assert.ok(ui.includes('mapQuality:normalizeV39MapQuality(saved.mapQuality)'));
assert.ok(ui.includes('id="v39-map-quality"'));assert.ok(ui.includes('localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))'));
const field=readFileSync('frontend/src/v39/map/v39-field-runtime-final.js','utf8');
assert.ok(field.includes('display.heightOutlineOnly,display.mapQuality'));assert.ok(field.includes("['heightOutlineOnly','heightShading','mapQuality']"));
for(const file of ['v39-map-visibility.js','v39-weather-overlay.js'])assert.ok(readFileSync(`frontend/src/v39/map/${file}`,'utf8').includes('getV39DisplaySettings?.().mapQuality'));
assert.ok(!field.includes('installV39MapQuality'));
console.log('PASS: real cache at half/full resolution, high-quality direct Graphics without rasterization, cache removal, texture-size/VRAM/Canvas fallbacks, quality invalidation and saved-setting wiring. Browser not used.');
