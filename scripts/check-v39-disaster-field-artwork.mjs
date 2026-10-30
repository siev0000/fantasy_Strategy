import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-disaster-field-display.js';export * from './frontend/src/lib/v39-atmosphere-display.js';import './frontend/src/v39/map/v39-disaster-icons.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',loader:{'.webp':'dataurl'},plugins:[{name:'registry',setup(builder){builder.onLoad({filter:/game-data-registry\.js$/},args=>{
  const directory=resolve('data/source/export/json');
  const modules=Object.fromEntries(readdirSync(directory).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${directory}/${name}`,'utf8'))]));
  return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
});}}]});
const root=[],textures=new Map();let circles=0;
const node=kind=>({kind,list:[],data:{},setDepth(v){this.depth=v;return this;},setName(v){this.name=v;return this;},setOrigin(...v){this.origin=v;return this;},setDisplaySize(w,h){this.width=w;this.height=h;return this;},setAlpha(v){this.alpha=v;return this;},setMask(mask){this.mask=mask;return this;},setData(k,v){this.data[k]=v;return this;},add(v){for(const child of Array.isArray(v)?v:[v]){this.list.push(child);const i=root.indexOf(child);if(i>=0)root.splice(i,1);}return this;},destroy(){const i=root.indexOf(this);if(i>=0)root.splice(i,1);this.destroyed=true;}});
const add=n=>{root.push(n);return n;};
const scene={sys:{isActive:()=>true},children:{list:root},add:{container:()=>add(node('container')),image:(x,y,key,frame)=>add({...node('image'),x,y,key,frame}),circle:()=>{circles++;throw Error('fire/cold must not use circular badges');}},textures:{exists:key=>textures.has(key),get:key=>textures.get(key),addImage(key,image){const frames=new Map(),texture={has:key=>frames.has(key),add:(key,...value)=>frames.set(key,value),getSourceImage:()=>image};textures.set(key,texture);return texture;}}};
globalThis.Image=class {complete=true;naturalWidth=512;naturalHeight=384;width=512;height=384;};
const fire={id:'fire',disasterId:'災害:山火事',name:'山火事',tileKeys:['1,1','2,1'],startsAtTurn:1,expiresAtTurn:3};
const cold={id:'cold',disasterId:'災害:大寒波',name:'大寒波',x:1,y:1,anchorKey:'1,1',tileKeys:['1,1','2,1'],startsAtTurn:1,expiresAtTurn:3};
let state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[fire,cold]}},opacity=75,testMode=false;
globalThis.window={__v39FieldRuntime:{mapData:{},game:{scene:{getScenes:()=>[scene]}}},getV39GameState:()=>state,isV39TileInCurrentVision:(x)=>x===1,isV39TestMode:()=>testMode,getV39DisplaySettings:()=>({atmosphereOpacityByKind:{cold:opacity}}),addEventListener(){}};
const warn=console.warn;console.warn=()=>{};
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);console.warn=warn;
const field=()=>root.find(n=>n.name==='v39-disaster-field-artwork');
assert.equal(field().list.length,1);assert.equal(circles,0);assert.ok(field().depth<12);
assert.deepEqual(field().list.map(n=>n.data.disasterImageSlot),[1]);
for(const n of field().list){assert.deepEqual(n.origin,[.5,1]);assert.equal(n.width,n.height);}
assert.equal(m.isV39AtmosphereMarkerHidden('災害:大寒波'),true);
assert.equal(m.isV39AtmosphereMarkerHidden('災害:瘴気'),true);
const map={w:4,h:4,grid:Array.from({length:4},()=>Array(4).fill('平地'))};
assert.deepEqual(m.collectV39AtmosphereTiles(map,state).filter(tile=>tile.kinds.includes('cold')).map(tile=>tile.key),['1,1','2,1'],'blue fog still covers the affected area');
const allVisible=m.collectV39DisasterFieldImages(state,{isVisible:()=>true});
assert.equal(allVisible.filter(marker=>marker.event.disasterId==='災害:大寒波').length,0,'cold is fog only, not an ice/freeze marker');
assert.equal(allVisible.filter(marker=>marker.event.disasterId==='災害:山火事').length,2,'fire still covers each affected tile');
const hiddenCenter=m.collectV39DisasterFieldImages(state,{isVisible:x=>x===2});
assert.equal(hiddenCenter.some(marker=>marker.event.disasterId==='災害:大寒波'),false,'do not move hidden center icon to the visible edge');
const dedup=m.collectV39DisasterFieldImages({...state,worldEnvironment:{activeDisasters:[fire,{...fire,id:'duplicate'},cold]}},{isVisible:()=>true});
assert.equal(dedup.length,2,'same effect/tile is drawn once');
opacity=0;window.renderV39DisasterIcons();assert.equal(field().list.length,1);
testMode=true;window.renderV39DisasterIcons();assert.equal(field().list.length,2);assert.ok(field().list.some(n=>n.alpha===.6));
state={...state,timeline:{turnNumber:4}};window.renderV39DisasterIcons();assert.equal(field().list.length,0);
state={...state,timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[{...fire,startsAtTurn:5,expiresAtTurn:8}]}};window.renderV39DisasterIcons();assert.equal(field().list.length,0,'not started');
console.log('PASS: real fire renderer, cold is blue fog only (no ice or fallback badges), visible/test/expired/future filtering, deduplication, aspect ratio and unit-safe depth. No browser.');
scene.make={graphics:()=>({paths:[],fillStyle(){},fillPoints(points){this.paths.push(points);},createGeometryMask(){return {paths:this.paths,destroy(){this.destroyed=true;}};},destroy(){this.destroyed=true;}})};
const wave={id:'wave',disasterId:'災害:津波',name:'津波',x:1,y:1,radius:1,tileKeys:['1,1','2,1','3,1'],startsAtTurn:1,expiresAtTurn:3};
testMode=false;state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[wave]}};
window.renderV39DisasterIcons();
assert.equal(field().list.length,1,'a tsunami is one image, not per-tile icons');
const firstWave=field().list[0];assert.ok(firstWave.width>100);assert.deepEqual(firstWave.origin,[.5,.5]);
assert.equal(firstWave.mask.paths.length,1,'art is clipped to visible affected hexes');
assert.equal(circles,0);
window.isV39TileInCurrentVision=x=>x===2;
window.renderV39DisasterIcons();
assert.equal(field().list.length,1);assert.equal(field().list[0].x,firstWave.x,'hidden center stays fixed, not moved to visible edge');
assert.ok(firstWave.mask.destroyed,'changing visibility disposes the previous mask');
assert.notDeepEqual(field().list[0].mask.paths,firstWave.mask.paths);
state.worldEnvironment.activeDisasters=[{...wave,radius:3}];
window.renderV39DisasterIcons();assert.equal(field().list.length,1);assert.ok(field().list[0].width>firstWave.width,'actual radius scales the single image');
window.isV39TileInCurrentVision=()=>false;window.renderV39DisasterIcons();assert.equal(field().list.length,0,'hidden wave is not leaked');
testMode=true;window.renderV39DisasterIcons();assert.equal(field().list.length,1);assert.equal(field().list[0].mask.paths.length,3);
const lastMask=field().list[0].mask;state.timeline.turnNumber=4;window.renderV39DisasterIcons();assert.equal(field().list.length,0);assert.ok(lastMask.destroyed);
console.log('PASS: actual tsunami renderer uses one radius-scaled image with shared hex masks, no small badges, visibility updates and expiry cleanup. No browser.');
const fixture=JSON.parse(readFileSync('config/v39-disaster-test.json','utf8'));
assert.ok(fixture.events.some(event=>event.id==='災害:洪水'),'standard disaster fixture contains flood, not only tsunami');
const flooded={...wave,id:'flood',disasterId:'災害:洪水',name:'洪水',radius:1,tileKeys:['1,1','2,1','0,1','1,0','2,0','1,2','2,2']};
state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[flooded]}};
testMode=true;window.renderV39DisasterIcons();
assert.equal(field().list.length,1,'the same wave artwork used by flood must also be a single image');
assert.equal(field().list[0].mask.paths.length,7);assert.equal(window.getV39DisasterIconStatus().markerCount,0);
state.worldEnvironment.activeDisasters=[flooded,wave];window.renderV39DisasterIcons();
assert.equal(field().list.length,2,'flood and tsunami remain separate events, each drawn once');assert.equal(circles,0);
console.log('PASS: standard fixture flood and tsunami share single-image wave presentation; seven affected tiles never create seven wave badges. No browser.');
for(const disasterId of ['災害:土砂崩れ','災害:雪崩']){
  state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[{...wave,id:disasterId,disasterId,name:disasterId,tileKeys:['1,1','2,1']}]}};
  testMode=true;window.renderV39DisasterIcons();
  assert.equal(field().list.length,2,'rock artwork is placed directly on each affected tile');
  assert.equal(window.getV39DisasterIconStatus().markerCount,0,'old circular badges are removed');
  for(const image of field().list){
    assert.equal(image.data.disasterImageSlot,10);assert.deepEqual(image.origin,[.5,1]);
    assert.equal(image.width,62*.9);assert.equal(image.mask,undefined);
  }
  testMode=false;window.isV39TileInCurrentVision=x=>x===1;window.renderV39DisasterIcons();assert.equal(field().list.length,1);
  state.timeline.turnNumber=4;window.renderV39DisasterIcons();assert.equal(field().list.length,0);
}
assert.equal(circles,0);
console.log('PASS: landslide and avalanche render tile-sized rocks directly, without circular badges, and respect visibility/expiry. No browser.');
for(const [disasterId,slot] of [['災害:干ばつ',3],['災害:暴風',4]]){
  state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[{...wave,id:disasterId,disasterId,tileKeys:['1,1','2,1']}]}};
  testMode=false;window.isV39TileInCurrentVision=x=>x===1;window.renderV39DisasterIcons();
  assert.equal(field().list.length,1);assert.equal(field().list[0].data.disasterImageSlot,slot);
  assert.equal(field().list[0].alpha,.7,'existing artwork is overlaid at 70 percent opacity');
  assert.equal(field().list[0].width,62*.9);assert.equal(window.getV39DisasterIconStatus().markerCount,0);
  assert.equal(root.some(node=>node.name==='v39-disaster-pattern-layer'),false,'no invented vector artwork or animation layer');
  testMode=true;window.renderV39DisasterIcons();assert.equal(field().list.length,2);
  assert.ok(Math.abs(field().list[1].alpha-.42)<1e-9,'test-only hidden tiles retain dimming');
  state.timeline.turnNumber=4;window.renderV39DisasterIcons();assert.equal(field().list.length,0);
}
for(const disasterId of ['災害:熱波','災害:瘴気','災害:砂嵐','危険地帯:酸の沼','危険地帯:毒沼','危険地帯:噴気地帯','危険地帯:極寒地帯','危険地帯:瘴気地帯']){
  assert.equal(m.isV39AtmosphereMarkerHidden(disasterId),true);
}
console.log('PASS: existing drought/wind artwork at 70 percent opacity, shared per-tile rendering, visibility/test/expiry and no custom vector layer. No browser.');
for(const [disasterId,slot,centerOnly] of [['災害:地震',5,false],['災害:火山噴火',9,true],['災害:疫病',12,false]]){
  const event={...wave,id:disasterId,disasterId,name:disasterId,x:1,y:1,tileKeys:['1,1','2,1']};
  state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[event]}};
  testMode=true;window.isV39TileInCurrentVision=()=>true;window.renderV39DisasterIcons();
  assert.equal(field().list.length,centerOnly?1:2);
  for(const image of field().list){assert.equal(image.data.disasterImageSlot,slot);assert.equal(image.alpha,.7);assert.equal(image.width,62*.9);}
  assert.equal(window.getV39DisasterIconStatus().markerCount,0);
  testMode=false;window.isV39TileInCurrentVision=x=>x===2;window.renderV39DisasterIcons();
  assert.equal(field().list.length,centerOnly?0:1,'an unseen crater must not move to the visible edge');
  state.timeline.turnNumber=4;window.renderV39DisasterIcons();assert.equal(field().list.length,0);
  state={timeline:{turnNumber:1},worldEnvironment:{activeDisasters:[{...event,startsAtTurn:2}]}};
  window.renderV39DisasterIcons();assert.equal(field().list.length,0,'future disasters stay hidden');
}
assert.equal(circles,0);
console.log('PASS: original earthquake/eruption/disease artwork at 70 percent opacity, crater-only eruption, visibility/expiry and no badges. No browser.');
