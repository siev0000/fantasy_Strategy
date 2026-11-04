import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {PhaserEffectPlayer,resolveEffectPowerAxes,resolveEffectSourceTransform,resolveEffectImpactPlacement,resolveEffectImpactPercent} from '../配布用/アニメーション再生機能/phaser-effect-player.mjs';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2,powerScaleAxis:'x'}),{x:2,y:1});
assert.deepEqual(resolveEffectPowerAxes({powerScale:.5,powerScaleAxis:'y'}),{x:1,y:.5});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2}),{x:2,y:2});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2,powerScaleAxis:'x',stretchLengthPx:360,stretchAxis:'x'}),{x:1,y:1});
const bundle=await build({stdin:{contents:`
  export * from './frontend/src/lib/v39-area-effect-player.js';
  export * from './frontend/src/v39/ui/v39-effect-header-collapse.js';
  export * from './frontend/src/lib/v39-effect-sequence.js';
  export * from './frontend/src/lib/v39-effect-hit.js';
  export * from './frontend/src/lib/v39-effect-attribute-settings.js';
  export * from './frontend/src/v39/ui/v39-effect-sequence-editor.js';
  export * from './frontend/src/lib/v39-effect-settings.js';
  export * from './frontend/src/lib/v39-effect-category-settings.js';
  export * from './frontend/src/lib/v39-effect-transform.js';
  export {resolveV39CombatEffect} from './frontend/src/lib/v39-combat-effect-rules.js';
  export {resolveV39EffectPlaybackDescriptor,playV39MapEffect,getV39EffectImageSource} from './frontend/src/v39/combat/v39-effect-player.js';
  export * from './frontend/src/v39/ui/v39-effect-preview-combatants.js';
`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"','import.meta.url':'"file:///effect-test/preview.js"'},plugins:[{name:'vite-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json');
    const modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/[\\/]combat[\\/]v39-effect-player\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,JSON.stringify({'追加/落雷.webp':'/test/追加落雷.webp'})+';'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
const storage=new Map([['v39-effect-category-settings-v1',JSON.stringify({version:5,settings:{slash:{baseEffect:'斬撃',rotationDeg:20}}})]]);
globalThis.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},dispatchEvent(){}};
const originalWarn=console.warn;let m;
try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=originalWarn;}
assert.equal(m.V39_EFFECT_PREVIEW_LIMITS.defaultZoomPercent,100);
assert.ok(m.getV39EffectSettingsCatalog().includes('落雷（追記）'));
assert.equal(m.getV39EffectImageSource('落雷（追記）').src,'/test/追加落雷.webp');
assert.notEqual(m.getV39EffectImageSource('落雷').src,'/test/追加落雷.webp','original lightning preserved');
assert.equal(m.normalizeV39EffectTransform({powerScaleAxis:'invalid'}).powerScaleAxis,'both');
assert.equal(m.getV39EffectCategory('slash').rotationDeg,0,'shared transform cleared');
assert.equal(m.getV39EffectCategory('slash').sequenceSteps[0].rotationDeg,20,'legacy transform moved to step');
assert.equal(m.getV39EffectCategory('slash').powerScaleAxis,'both');
assert.equal(m.getV39EffectCategory('tornado').baseEffect,'竜巻','new builtin category appears with old saved settings');
assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').sequenceSources[0].frameStart,0);
assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').sequenceSources[0].frameEnd,69);
for(const axis of ['x','y','both']){
  m.updateV39EffectSetting('竜巻',{powerScaleAxis:axis});
  assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').powerScaleAxis,axis);
  const snapshot=m.getV39EffectSettingsSnapshot();m.importV39EffectSettings(JSON.stringify(snapshot));
  assert.equal(m.getV39EffectSetting('竜巻').powerScaleAxis,axis,'effect JSON roundtrip');
  m.updateV39EffectCategory('tornado',{powerScaleAxis:axis});
  const categories=m.getV39EffectCategorySettingsSnapshot();m.importV39EffectCategorySettings(JSON.stringify(categories));
  assert.equal(m.getV39EffectCategory('tornado').powerScaleAxis,axis,'category JSON roundtrip');
  assert.equal(m.resolveV39CombatEffect({攻撃手段:m.getV39EffectCategory('tornado').name}, {}, m.getV39EffectCategories(),[]).settings.powerScaleAxis,axis);
}
for(const areaDisplay of ['center','tiles']){
  m.updateV39EffectSetting('竜巻',{areaDisplay});
  m.importV39EffectSettings(JSON.stringify(m.getV39EffectSettingsSnapshot()));
  assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').areaDisplay,areaDisplay);
  m.updateV39EffectCategory('tornado',{areaDisplay});
  m.importV39EffectCategorySettings(JSON.stringify(m.getV39EffectCategorySettingsSnapshot()));
  assert.equal(m.resolveV39CombatEffect({攻撃手段:m.getV39EffectCategory('tornado').name}, {}, m.getV39EffectCategories(),[]).settings.areaDisplay,areaDisplay);
}
assert.equal(m.normalizeV39EffectTransform({}).areaDisplay,'center');
assert.equal(m.normalizeV39EffectTransform({}).areaTiming,'simultaneous');
assert.equal(m.normalizeV39EffectTransform({}).areaDelayMs,120);
assert.equal(m.normalizeV39EffectTransform({areaDelayMs:-10}).areaDelayMs,0);
assert.equal(m.normalizeV39EffectTransform({areaDelayMs:9999}).areaDelayMs,m.V39_AREA_EFFECT_DELAY_LIMIT_MS);
assert.equal(m.normalizeV39EffectTransform({areaDelayMs:NaN}).areaDelayMs,120);
for(const maximum of [0,37,120,500,1000])for(const count of [1,2,7,61])for(const random of [()=>0,()=>.999,Math.random]) {
  const delays=m.resolveV39AreaEffectDelays(count,{areaTiming:'random',areaDelayMs:maximum},random);
  assert.equal(delays.length,count);
  assert.equal(Math.min(...delays),0);
  assert.equal(Math.max(...delays),count>1?maximum:0,'guaranteed maximum');
  assert.ok(delays.every(value=>Number.isInteger(value)&&value>=0&&value<=maximum));
}
assert.deepEqual(m.resolveV39AreaEffectDelays(3,{areaTiming:'simultaneous',areaDelayMs:1000}),[0,0,0]);
assert.notEqual(m.resolveV39AreaEffectDelays(3,{areaTiming:'random'},()=>0)[0],0,'first cell need not start immediately');
for(const areaDelayMs of [0,37,500]) {
  m.updateV39EffectSetting('竜巻',{areaDelayMs});
  m.importV39EffectSettings(JSON.stringify(m.getV39EffectSettingsSnapshot()));
  assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').areaDelayMs,areaDelayMs);
  m.updateV39EffectCategory('tornado',{areaDelayMs});
  m.importV39EffectCategorySettings(JSON.stringify(m.getV39EffectCategorySettingsSnapshot()));
  assert.equal(m.resolveV39CombatEffect({攻撃手段:m.getV39EffectCategory('tornado').name},{},m.getV39EffectCategories(),[]).settings.areaDelayMs,areaDelayMs);
}
for(const areaTiming of ['random','simultaneous']) {
  m.updateV39EffectSetting('竜巻',{areaTiming});
  m.importV39EffectSettings(JSON.stringify(m.getV39EffectSettingsSnapshot()));
  assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').areaTiming,areaTiming);
  m.updateV39EffectCategory('tornado',{areaTiming});
  m.importV39EffectCategorySettings(JSON.stringify(m.getV39EffectCategorySettingsSnapshot()));
  assert.equal(m.resolveV39CombatEffect({攻撃手段:m.getV39EffectCategory('tornado').name},{},m.getV39EffectCategories(),[]).settings.areaTiming,areaTiming);
}
for(const rotation of [-150,0,75,180])for(const stepAngle of [-90,0,35]) {
 const legacy={baseEffect:'斬撃',rotationDeg:rotation,offsetX:13,offsetY:-9,orientToAttack:true,
  sequenceSteps:[{effectName:'斬撃',rotationDeg:stepAngle,offsetX:4,offsetY:6}],decorationEffect:'竜巻'};
 const moved=m.migrateV39EffectTransformsToSteps(legacy,m.getV39EffectSettingsCatalog());
 assert.equal(moved.rotationDeg,0);assert.equal(moved.offsetX,0);assert.equal(moved.offsetY,0);
 const step=moved.sequenceSteps[0];
 assert.equal(step.offsetX,17);assert.equal(step.offsetY,-3,'shared offsets summed without rotation');
 assert.equal(step.legacyAreaOffsetX,undefined,'position no longer depends on hidden center exception');
 assert.deepEqual(m.migrateV39EffectTransformsToSteps(moved),moved,'migration does not apply twice');
 const deco=m.resolveV39EffectSequence(moved).at(-1);
 assert.equal(deco.effectName,'竜巻');assert.equal(deco.rotationDeg,rotation===180?-180:rotation,'attribute decoration inherits legacy rotation');
}
const controls=Object.fromEntries(Object.entries({direction:'0',distance:'1',shape:'single',radius:'1',zoom:'100',power:'300'}).map(([key,value])=>[`v39-effect-preview-${key}`,{value}]));
globalThis.document={getElementById:id=>controls[id]};
const stage={clientWidth:475,clientHeight:250};
for(const shape of ['single','circle']){
  controls['v39-effect-preview-shape'].value=shape;
  const base=m.effectPreviewGeometry(stage,{powerScaleAxis:'x'});
  assert.equal(base.powerScale,2);assert.equal(base.powerScaleAxis,'x');
  controls['v39-effect-preview-power'].value='50';
  const small=m.effectPreviewGeometry(stage,{powerScaleAxis:'y'});
  assert.equal(small.powerScale,.5);
  assert.equal(base.fitDiameterPx,small.fitDiameterPx,'AOE base sizing must not apply power twice');
  controls['v39-effect-preview-power'].value='300';
}
controls['v39-effect-preview-shape'].value='circle';
const tiled=m.effectPreviewGeometry(stage,{areaDisplay:'tiles',areaDelayMs:37,scaleMultiplierPercent:150});
assert.equal(tiled.areaDelayMs,37);
assert.equal(tiled.instances.length,7);assert.equal(tiled.fitDiameterPx,undefined);
assert.equal(new Set(tiled.instances.map(p=>p.x+','+p.y)).size,7);
assert.ok(m.effectPreviewGeometry(stage,{areaDisplay:'center'}).fitDiameterPx>0);
assert.equal(m.effectPreviewGeometry(stage,{areaDisplay:'tiles',placementMode:'beam-x'}).instances,undefined);
const images=[];
const scene={textures:{get:()=>({getSourceImage:()=>({width:960,height:120})})},add:{container(x,y){return {x,y,children:[],setScale(x,y){this.scaleX=x;this.scaleY=y;},setDepth(){},add(image){this.children.push(image);image.parentContainer=this;},destroy(){this.destroyed=true;}};},image(){const image={scene,frame:{data:{}},setOrigin(){},setScale(x,y){this.scaleX=x;this.scaleY=y;},setDepth(){},setAngle(value){this.angle=value;},setAlpha(){},setBlendMode(){},setName(){},setCrop(){},setPosition(x,y){this.x=x;this.y=y;},clearTint(){},clearMask(){},destroy(){this.scene=null;}};images.push(image);return image;}}};
const player=new PhaserEffectPlayer(scene,{textureLoader:async()=> 'test'});
for(const powerScale of [.5,1,2])for(const powerScaleAxis of ['both','x','y'])for(const mode of ['normal','area','beam-x','beam-y']){
  const request={src:'test',x:0,y:0,frameIndex:3,powerScale,powerScaleAxis,scalePercent:100,renderStyle:'none',showPreviousFrameGhost:false};
  if(mode==='area')request.fitDiameterPx=240;
  if(mode.startsWith('beam')){request.stretchLengthPx=360;request.stretchAxis=mode.at(-1);}
  await player.showFrame(request);
  const axes=resolveEffectPowerAxes(request),image=images.at(-1),base=mode==='area'?2:1;
  assert.equal(image.scaleX,(mode==='beam-x'?3:base)*axes.x);
  assert.equal(image.scaleY,(mode==='beam-y'?3:base)*axes.y);
  if(mode==='beam-x')assert.equal(image.scaleX,3,'beam length stays fitted');
  if(mode==='beam-y')assert.equal(image.scaleY,3,'beam length stays fitted');
}
// World scale must follow rotation, without scaling the fixed position offset.
for(const angle of [0,30,90]){
 await player.showFrame({src:'test',x:40,y:50,frameIndex:0,renderStyle:'none',scalePercent:100,
  sequenceSources:[{src:'test',stepTransform:{rotationDeg:angle,offsetX:10,offsetY:5,scaleXPercent:200,scaleYPercent:50}}]});
 const image=images.at(-1),container=image.parentContainer;
 assert.equal(container.x,50);assert.equal(container.y,55);
 assert.equal(container.scaleX,2);assert.equal(container.scaleY,.5);assert.equal(image.angle,angle);
 const x=Math.cos(angle*Math.PI/180)*image.scaleX,y=Math.sin(angle*Math.PI/180)*image.scaleY;
 assert.ok(Math.abs(x*container.scaleX-2*x)<1e-9);
 assert.ok(Math.abs(y*container.scaleY-.5*y)<1e-9);
 const previous=container;player.stop();assert.equal(previous.destroyed,true,'scaled container cleaned up');
}
assert.equal(m.normalizeV39EffectSequence(['斬撃'])[0].scaleXPercent,100);
assert.equal(m.normalizeV39EffectSequence([{effectName:'斬撃',scaleYPercent:999}])[0].scaleYPercent,400);
player.destroy();
let loads=0;
const group=new m.V39AreaEffectPlayer(scene,{textureLoader:async()=>{loads++;return 'test';}});
const groupedRequest={src:'test',x:0,y:0,renderStyle:'none',showPreviousFrameGhost:false,
  totalDurationMs:16,frameStart:0,frameEnd:0,instances:[{x:0,y:0},{x:62,y:0},{x:31,y:56}]};
await group.showFrame(groupedRequest);
assert.equal(images.filter(i=>i.scene).length,3,'all cells coexist');
assert.equal(loads,1,'one shared texture load');
group.stop();assert.equal(images.filter(i=>i.scene).length,0);
const playing=group.play(groupedRequest);
await new Promise(r=>setTimeout(r,2));
assert.equal(images.filter(i=>i.scene).length,3,'simultaneous animation');
await playing;assert.equal(images.filter(i=>i.scene).length,0,'completed batch cleared');
const canceled=group.play({...groupedRequest,totalDurationMs:100});
await group.showFrame({...groupedRequest,instances:[{x:1,y:2}]});
await canceled;assert.equal(images.filter(i=>i.scene).length,1,'old completion preserves new frame');
const originalRandom=Math.random;
Math.random=()=>.999;
try {
  const stagger=group.play({...groupedRequest,areaTiming:'random',totalDurationMs:250});
  await new Promise(r=>setTimeout(r,5));
  assert.equal(images.filter(i=>i.scene).length,1,'first cell starts immediately');
  await new Promise(r=>setTimeout(r,m.V39_AREA_EFFECT_DEFAULT_DELAY_MS+10));
  assert.equal(images.filter(i=>i.scene).length,3,'other cells start within short delay');
  group.stop();await stagger;
  const pending=group.play({...groupedRequest,areaTiming:'random'});
  group.stop();await pending;
  await new Promise(r=>setTimeout(r,m.V39_AREA_EFFECT_DEFAULT_DELAY_MS+10));
  assert.equal(images.filter(i=>i.scene).length,0,'stopped delay cannot restart playback');
  await group.showFrame({...groupedRequest,areaTiming:'random'});
  assert.equal(images.filter(i=>i.scene).length,3,'static frames do not stagger');
} finally { Math.random=originalRandom; }
group.destroy();assert.equal(images.filter(i=>i.scene).length,0);
console.log('PASS: configurable delay range, guaranteed/randomized endpoints, single-cell fallback, delayed-start cancellation, static frames and timing persistence.');
assert.equal(await group.play(groupedRequest),false);
console.log('PASS: area mode default/persistence/combat/preview, beam precedence, simultaneous cells, shared texture, cancellation and cleanup.');
scene.events={once(){},off(){}};
window.__v39FieldRuntime={game:{scene:{getScenes:()=>[scene]}}};
window.isV39TileInCurrentVision=x=>x!==3;
m.updateV39EffectSetting('斬撃',{areaDisplay:'tiles'});
const realLoader=m.V39AreaEffectPlayer.prototype.loadTexture;
m.V39AreaEffectPlayer.prototype.loadTexture=async()=> 'test';
const realInfo=console.info;console.info=()=>{};
try {
  const mapPlay=m.playV39MapEffect({effectName:'斬撃',x:1,y:1,
    areaTiles:[{x:1,y:1},{x:2,y:1},{x:2,y:1},{x:3,y:1}],
    renderStyle:'none',showPreviousFrameGhost:false,totalDurationMs:16});
  await new Promise(r=>setTimeout(r,2));
  assert.equal(images.filter(i=>i.scene).length,2,'map deduplicates cells and hides unseen cells');
  await mapPlay;
  assert.equal(images.filter(i=>i.scene).length,0);
} finally { m.V39AreaEffectPlayer.prototype.loadTexture=realLoader;console.info=realInfo; }
console.log('PASS: actual map playback filters hidden and duplicate cells.');
assert.equal(m.getV39EffectCategory('hit').name,'ヒット');
assert.deepEqual(m.resolveV39HitTargets([{x:1,y:2,hitResults:[{hit:false}]},{x:2,y:2,hitResults:[{hit:true}]},{x:2,y:2,total:10},{x:4,y:2,total:0}]),[{x:2,y:2}]);
const realPlay=m.V39AreaEffectPlayer.prototype.play,hitCalls=[];
m.V39AreaEffectPlayer.prototype.play=async function(request){hitCalls.push(request);return true;};
try{
 for(const mode of ['none','common','specified']){
  m.updateV39EffectSetting('斬撃',{hitEffectMode:mode,hitEffectName:'竜巻'});
  m.importV39EffectSettings(JSON.stringify(m.getV39EffectSettingsSnapshot()));
  assert.equal(m.getV39EffectSetting('斬撃').hitEffectMode,mode);
  hitCalls.length=0;
  await m.playV39MapEffect({effectName:'斬撃',tileX:2,tileY:2,hitEntries:[{x:2,y:2,hitResults:[{hit:true}]},{x:3,y:2,total:10}]});
  assert.equal(hitCalls.length,mode==='none'?1:2,'secondary hit playback only when enabled');
  if(mode!=='none'){assert.equal(hitCalls[1].instances.length,1,'hits in fog excluded');assert.equal(hitCalls[1].displayName,'v39-hit-effect');}
  hitCalls.length=0;await m.playV39MapEffect({effectName:'斬撃',tileX:2,tileY:2,hitEntries:[{x:2,y:2,hitResults:[{hit:false}]}]});
  assert.equal(hitCalls.length,1,'miss does not trigger hit playback');
 }
}finally{m.V39AreaEffectPlayer.prototype.play=realPlay;m.updateV39EffectSetting('斬撃',{hitEffectMode:'none',hitEffectName:''});}
console.log('PASS: hit category, modes, save/reload, confirmed hit dispatch, fog and misses.');
const steps=[{effectName:'斬撃',scalePercent:100},{effectName:'竜巻',scalePercent:150,rotationDeg:90,offsetX:12,offsetY:3},{effectName:'斬撃',scalePercent:70}];
const normalized=m.normalizeV39EffectSequence(steps,m.getV39EffectSettingsCatalog());
assert.equal(normalized.length,3);assert.equal(normalized[1].offsetX,12);
assert.equal(m.normalizeV39EffectSequence(['missing'],m.getV39EffectSettingsCatalog()).length,0);
assert.equal(m.normalizeV39EffectSequence(Array(30).fill('斬撃')).length,16);
assert.deepEqual(m.resolveV39EffectSequence({baseEffect:'斬撃',decorationEffect:'竜巻'}).map(s=>s.effectName),['斬撃','竜巻'],'legacy decoration');
m.updateV39EffectSetting('斬撃',{sequenceSteps:steps});
m.importV39EffectSettings(JSON.stringify(m.getV39EffectSettingsSnapshot()));
assert.deepEqual(m.getV39EffectSetting('斬撃').sequenceSteps,normalized);
const descriptor=m.resolveV39EffectPlaybackDescriptor('斬撃');
assert.equal(descriptor.sequenceSources.length,3);assert.equal(descriptor.sequenceSources[1].stepTransform.scalePercent,150);
m.updateV39EffectCategory('slash',{sequenceSteps:steps});
m.importV39EffectCategorySettings(JSON.stringify(m.getV39EffectCategorySettingsSnapshot()));
assert.deepEqual(m.getV39EffectCategory('slash').sequenceSteps,normalized);
assert.deepEqual(m.resolveV39CombatEffect({攻撃手段:'斬撃'},{},m.getV39EffectCategories(),[]).settings.sequenceSteps,normalized);
const serial=new m.V39AreaEffectPlayer(scene,{textureLoader:async()=> 'test'}),frames=[];
const serialRequest={x:10,y:20,renderStyle:'none',showPreviousFrameGhost:false,scalePercent:100,totalDurationMs:16,sequenceGapMs:0,
 sequenceSources:normalized.map(step=>({src:step.effectName,frameStart:0,frameEnd:0,stepTransform:step})),onFrame:frame=>frames.push(frame)};
await serial.play(serialRequest);
assert.deepEqual(frames.map(f=>Math.round(f.width)),[120,180,84],'ordered per-step scales');
assert.equal(frames[1].x,22);assert.equal(frames[1].y,23,'position does not rotate with step');
assert.equal(images.filter(i=>i.scene).length,0);
frames.length=0;
const interrupted=serial.play({...serialRequest,totalDurationMs:100});
await new Promise(r=>setTimeout(r,5));serial.stop();await interrupted;
assert.equal(frames.length,1,'cancel prevents later animation');
frames.length=0;
const looping=serial.play({...serialRequest,sequenceSources:serialRequest.sequenceSources.slice(0,2),loop:true});
while(frames.length<4) await new Promise(r=>setTimeout(r,5));
serial.stop();await looping;
assert.deepEqual(frames.slice(0,4).map(f=>Math.round(f.width)),[120,180,120,180],'loop repeats entire sequence');
let delayCalls=0;
const waitForStart=serial.waitForAreaStart.bind(serial);
serial.waitForAreaStart=delay=>{delayCalls++;return waitForStart(delay);};
await serial.play({...serialRequest,areaTiming:'random',areaDelayMs:12,instances:[{x:0,y:0},{x:62,y:0}]});
assert.equal(delayCalls,2,'random delay applied once per cell, not per animation');
serial.destroy();
const compatibilityPlayer=new m.V39AreaEffectPlayer(scene,{textureLoader:async()=> 'test'});let compatibilityFrame;
const legacyRequest={x:10,y:20,src:'test',sequenceSources:[{src:'test',stepTransform:{offsetX:13,offsetY:0,legacyAreaOffsetX:0,legacyAreaOffsetY:0}}],fitDiameterPx:240,renderStyle:'none',onFrame:frame=>{compatibilityFrame=frame;}};
await compatibilityPlayer.showFrame({...legacyRequest,useLegacyAreaOffsets:true});assert.equal(compatibilityFrame.x,23);
await compatibilityPlayer.showFrame({...legacyRequest,useLegacyAreaOffsets:false});assert.equal(compatibilityFrame.x,23);
compatibilityPlayer.destroy();
m.updateV39EffectSetting('竜巻',{rotationDeg:35,offsetX:13,sequenceSteps:[{effectName:'竜巻',rotationDeg:15}]});
const migratedSnapshot=m.getV39EffectSettingsSnapshot();m.importV39EffectSettings(JSON.stringify(migratedSnapshot));
assert.equal(m.getV39EffectSetting('竜巻').rotationDeg,0);
assert.equal(m.getV39EffectSetting('竜巻').sequenceSteps[0].rotationDeg,50);
assert.deepEqual(m.getV39EffectSettingsSnapshot(),migratedSnapshot,'migration JSON roundtrip stable');
// Minimal DOM verifies editor operations without opening a browser.
const originalDocument=globalThis.document;
class Element {
 constructor(tag){this.tag=tag;this.children=[];this.style={};this.handlers={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}
 setAttribute(){}addEventListener(type,fn){this.handlers[type]=fn;}
}
globalThis.document={createElement:tag=>new Element(tag)};
try {
 const host=new Element('div'),tabs=new Element('nav');let changed,nextIndex,selected,liveChange;
 const render=(index=1)=>m.renderV39EffectSequenceEditor(host,{sequenceSteps:normalized},m.getV39EffectSettingsCatalog(),(value,active,options)=>{changed=value;nextIndex=active;liveChange=options?.live;},
  {tabsHost:tabs,activeIndex:index,onSelect:active=>{selected=active;}});
 render();assert.equal(host.children.length,1,'only selected step shown');assert.equal(tabs.children.length,5);
 tabs.children[0].handlers.click();assert.equal(selected,-1,'common tab');
 tabs.children[3].handlers.click();assert.equal(selected,2,'number tab');
 host.children[0].children[2].children[0].handlers.click();assert.equal(changed[0].effectName,'竜巻','move up');assert.equal(nextIndex,0,'follow moved animation');
 render(0);host.children[0].children[2].children[2].handlers.click();assert.equal(changed.length,2,'delete');assert.equal(nextIndex,0);
 render();tabs.children.at(-1).handlers.click();assert.equal(changed.length,4,'append');assert.equal(nextIndex,3,'new animation selected');
 render();const field=host.children[0].children[3].children[0].children[0];field.value='180';field.handlers.input();assert.equal(liveChange,true,'input persists before blur');assert.equal(changed[1].scalePercent,180);field.value='';liveChange=false;field.handlers.input();assert.equal(liveChange,false,'empty intermediate input ignored');field.value='180';field.handlers.change();
 render(-1);assert.equal(host.children.length,0,'common tab hides step controls');
 render(99);assert.equal(host.children.length,1,'out-of-range index clamped');
 m.renderV39EffectSequenceEditor(host,{sequenceSteps:[{effectName:'斬撃',offsetX:13,legacyAreaOffsetX:0,legacyAreaOffsetY:0}]},m.getV39EffectSettingsCatalog(),value=>{changed=value;},{tabsHost:tabs,activeIndex:0});
 const offsetField=host.children[0].children[3].children[2].children[0];offsetField.value='22';offsetField.handlers.change();
 assert.equal(changed[0].offsetX,22);assert.equal(changed[0].legacyAreaOffsetX,undefined,'legacy metadata removed on load');
 let imageChoice;
 m.renderV39EffectSequenceEditor(host,{sequenceSteps:normalized},m.getV39EffectSettingsCatalog(),value=>{changed=value;},
  {tabsHost:tabs,activeIndex:1,onPickImage:(index,name,choose)=>{imageChoice={index,name,choose};}});
 host.children[0].children[2].children[3].handlers.click();assert.equal(imageChoice.index,1);
 imageChoice.choose('斬撃');assert.equal(changed[1].effectName,'斬撃');assert.equal(changed[1].scalePercent,normalized[1].scalePercent,'image picker preserves per-step settings');
 m.renderV39EffectSequenceEditor(host,{sequenceSteps:normalized},m.getV39EffectSettingsCatalog(),value=>{changed=value;},{tabsHost:tabs,activeIndex:1});
 host.children[0].children[2].children[4].handlers.click();assert.equal(changed[1].flipX,true);
 host.children[0].children[2].children[5].handlers.click();assert.equal(changed[1].flipY,true);assert.equal(changed[1].offsetX,normalized[1].offsetX);
 let editMode;
 m.renderV39EffectSequenceEditor(host,{sequenceSteps:[{effectName:'斬撃'}]},m.getV39EffectSettingsCatalog(),()=>{},
  {tabsHost:tabs,activeIndex:0,onSetImpactPreview:value=>{editMode=value;}});
 host.children[0].children[5].children[0].handlers.click();assert.equal(editMode,true);
 host.children[0].children[5].children[1].handlers.click();assert.equal(editMode,false,'confirmation returns to actual impact placement');

}finally{globalThis.document=originalDocument;}
const isolated=m.selectV39EffectPreviewSequence(descriptor,1,true);
assert.equal(isolated.sequenceSources.length,1);assert.equal(isolated.sequenceSources[0].stepTransform.scalePercent,150);
assert.equal(descriptor.sequenceSources.length,3,'preview does not mutate saved sequence');
assert.equal(m.selectV39EffectPreviewSequence(descriptor,-1,true),descriptor);
assert.equal(m.selectV39EffectPreviewSequence(descriptor,99,true),descriptor);
assert.equal(m.selectV39EffectPreviewSequence(descriptor,1,false),descriptor);
console.log('PASS: sequence persistence/combat/playback/transforms/cancellation, numbered/common tabs, selection after move/add/delete, isolated preview and editor controls.');
const prefs=new Map(),classes=new Map(),attributes=new Map(),callbacks={};
const fakePanel={classList:{toggle:(key,value)=>classes.set(key,value)}};
const fakeToggle={setAttribute:(key,value)=>attributes.set(key,value),addEventListener:(key,value)=>callbacks[key]=value};
const preferenceStore={getItem:key=>prefs.get(key),setItem:(key,value)=>prefs.set(key,value)};
let headerChanges=0;
const collapse=m.installV39EffectHeaderCollapse({panel:fakePanel,toggle:fakeToggle,storage:preferenceStore,compact:true,onChange:()=>headerChanges++});
assert.equal(collapse.isCollapsed(),true,'mobile defaults compact');assert.equal(attributes.get('aria-expanded'),'false');
callbacks.click();assert.equal(collapse.isCollapsed(),false);assert.equal(headerChanges,1);
assert.equal(m.installV39EffectHeaderCollapse({panel:fakePanel,toggle:fakeToggle,storage:preferenceStore,compact:true}).isCollapsed(),false,'explicit preference restored');
assert.equal(m.installV39EffectHeaderCollapse({panel:fakePanel,toggle:fakeToggle,storage:{getItem:()=>null},compact:false}).isCollapsed(),false,'desktop expanded by default');
console.log('PASS: compact mobile header, toggle/ARIA, preference persistence and expanded desktop default.');
for(const [angle,x,y] of [[0,20,25],[30,20,25],[90,20,25],[180,20,25],[-90,20,25]]) {
 const transformed=resolveEffectSourceTransform({stepTransform:{rotationDeg:angle,offsetX:10,offsetY:5}},{},{x:10,y:20});
 assert.ok(Math.abs(transformed.x-x)<1e-8&&Math.abs(transformed.y-y)<1e-8,'offset axes independent of angle '+angle);
}
const facing=resolveEffectSourceTransform({stepTransform:{rotationDeg:30,offsetX:10}},{angleDeg:60},{x:0,y:0});
assert.equal(facing.angleDeg,90);assert.equal(facing.x,10);assert.equal(facing.y,0);
const zoomed=resolveEffectSourceTransform({stepTransform:{rotationDeg:90,offsetX:10}},{positionOffsetScale:.5},{x:0,y:0});
assert.equal(zoomed.x,5);assert.equal(zoomed.y,0);
const transformPlayer=new m.V39AreaEffectPlayer(scene,{textureLoader:async()=> 'test'});let actual;
await transformPlayer.showFrame({src:'test',sequenceSources:[{src:'test',stepTransform:{rotationDeg:90,offsetX:10,offsetY:5}}],x:10,y:20,renderStyle:'none',onFrame:frame=>{actual=frame;}});
assert.equal(actual.angleDeg,90);assert.equal(actual.x,20);assert.equal(actual.y,25);
for(const angle of [0,30,90,-90,180])for(const scale of [.5,1,3]){
 const step={rotationDeg:angle,scalePercent:100*scale,scaleXPercent:200,scaleYPercent:50,impactXPercent:25,impactYPercent:90};
 let frame;
 await transformPlayer.showFrame({src:'test',sequenceSources:[{src:'test',stepTransform:step}],x:40,y:50,scalePercent:100,renderStyle:'none',onFrame:f=>frame=f});
 assert.equal(frame.anchorX,40);assert.equal(frame.anchorY,50);
 const recovered=resolveEffectImpactPercent(frame,{x:40,y:50});
 assert.ok(Math.abs(recovered.impactXPercent-25)<1e-8);assert.ok(Math.abs(recovered.impactYPercent-90)<1e-8);
 const pure=resolveEffectImpactPlacement({x:40,y:50,width:frame.width,height:frame.height,angleDeg:angle,screenScaleX:2,screenScaleY:.5},step);
 assert.ok(Math.abs(pure.x-frame.x)<1e-8);assert.ok(Math.abs(pure.y-frame.y)<1e-8);
}
assert.equal(m.normalizeV39EffectSequence(['斬撃'])[0].impactXPercent,50,'legacy center preserved');
assert.equal(m.normalizeV39EffectSequence([{effectName:'斬撃',impactYPercent:120}])[0].impactYPercent,100);
transformPlayer.destroy();
const editPlayer=new PhaserEffectPlayer(scene,{textureLoader:async()=> 'test'});
for(const angle of [0,30,90]){
 const step={rotationDeg:angle,impactXPercent:20,impactYPercent:85,scaleXPercent:200,scaleYPercent:50};
 let edited;
 await editPlayer.showFrame({src:'test',sequenceSources:[{src:'test',stepTransform:step}],x:40,y:50,scalePercent:100,
  renderStyle:'none',previewImpactPoint:true,onFrame:f=>edited=f});
 assert.equal(edited.anchorX,40);assert.equal(edited.anchorY,50,'editor uses actual impact placement');
 const recovered=resolveEffectImpactPercent(edited,{x:edited.anchorX,y:edited.anchorY});
 assert.ok(Math.abs(recovered.impactXPercent-20)<1e-8);assert.ok(Math.abs(recovered.impactYPercent-85)<1e-8);
}
for(const flipX of [false,true])for(const flipY of [false,true])for(const impact of [{impactXPercent:50,impactYPercent:50},{impactXPercent:46.71180622697223,impactYPercent:10.483324971053001}]){
 const step={...impact,flipX,flipY,rotationDeg:30,offsetX:10,offsetY:-10,scalePercent:100,scaleXPercent:250,scaleYPercent:250};
 for(const zoom of [.5,1]){
  const frames=[];
  for(const editing of [true,false]){
   await editPlayer.showFrame({src:'test',sequenceSources:[{src:'test',sourceScaleMultiplier:zoom,stepTransform:step}],
    x:100,y:120,positionOffsetScale:zoom,scalePercent:100,frameIndex:3,renderStyle:'none',previewImpactPoint:editing,onFrame:f=>frames.push(f)});
  }
  const [editing,confirm]=frames;
  const point=resolveEffectImpactPercent(editing,{x:editing.anchorX,y:editing.anchorY});
  assert.ok(Math.abs(point.impactXPercent-impact.impactXPercent)<1e-8);
  assert.ok(Math.abs(point.impactYPercent-impact.impactYPercent)<1e-8);
  assert.equal(editing.frameIndex,confirm.frameIndex);assert.equal(editing.width,confirm.width);
  assert.equal(confirm.anchorX,100+10*zoom);assert.equal(confirm.anchorY,120-10*zoom);
  assert.deepEqual(editing,confirm,'switching edit/confirm must not move any frame, including noncentral anchors');
  const image=images.at(-1),container=image.parentContainer;
  const angle=30*Math.PI/180,localX=(3*120+impact.impactXPercent/100*120-960/2)*image.scaleX;
  const localY=(impact.impactYPercent/100*120-120/2)*image.scaleY;
  const actualX=container.x+container.scaleX*(image.x+localX*Math.cos(angle)-localY*Math.sin(angle));
  const actualY=container.y+container.scaleY*(image.y+localX*Math.sin(angle)+localY*Math.cos(angle));
  assert.ok(Math.abs(actualX-confirm.anchorX)<1e-7,'rendered source pixel matches impact X');
  assert.ok(Math.abs(actualY-confirm.anchorY)<1e-7,'rendered source pixel matches impact Y');
 }
}
editPlayer.destroy();
console.log('PASS: edit/confirm use identical placement for central and noncentral anchors, rotation and 250% scale.');
console.log('PASS: impact point remains fixed through rotation and per-axis scaling; pointer inverse and legacy center.');
const plus=resolveEffectSourceTransform({stepTransform:{rotationDeg:30,offsetY:10}},{},{x:40,y:50});
const minus=resolveEffectSourceTransform({stepTransform:{rotationDeg:30,offsetY:-10}},{},{x:40,y:50});
assert.equal(plus.x,minus.x);assert.equal(plus.y-minus.y,20);
console.log('PASS: fixed X/Y axes at 0/30/90/180/-90, Y+10/-10 has no horizontal drift, zoom and actual frame position.');
assert.equal(m.getV39EffectAttribute('炎').grayscaleBase,true,'attribute defaults to monochrome');
const categories=m.getV39EffectCategories();
assert.equal(m.resolveV39CombatEffect({攻撃手段:'斬撃'}, {}, categories, []).settings.grayscaleBase,false,'no attribute preserves original');
assert.equal(m.resolveV39CombatEffect({攻撃手段:'斬撃',炎:30}, {}, categories, [m.getV39EffectAttribute('炎')]).settings.grayscaleBase,true);
m.updateV39EffectAttribute('炎',{grayscaleBase:false,brightnessPercent:175});
assert.equal(m.resolveV39CombatEffect({攻撃手段:'斬撃',炎:30}, {}, categories, [m.getV39EffectAttribute('炎')]).settings.grayscaleBase,false);
m.importV39EffectAttributeSettings(JSON.stringify(m.getV39EffectAttributeSettingsSnapshot()));assert.equal(m.getV39EffectAttribute('炎').grayscaleBase,false);assert.equal(m.getV39EffectAttribute('炎').brightnessPercent,175);
assert.equal(m.resolveV39CombatEffect({攻撃手段:'斬撃',炎:30},{},categories,[m.getV39EffectAttribute('炎')]).settings.brightnessPercent,175);
assert.equal(m.resolveV39CombatEffect({攻撃手段:'斬撃'},{},categories,[]).settings.brightnessPercent,100);
m.updateV39EffectSetting('斬撃',{grayscaleBase:true});assert.equal(m.resolveV39EffectPlaybackDescriptor('斬撃').grayscaleBase,true);
m.updateV39EffectSetting('斬撃',{grayscaleBase:false});
assert.equal(m.resolveV39EffectPlaybackSettings('unknown:source').grayscaleBase,false);
const reloadCategory=m.addV39EffectCategory('斬撃');
m.renameV39EffectCategory(reloadCategory.id,'再読込確認');
const reloadSteps=m.normalizeV39EffectSequence([{effectName:'斬撃',rotationDeg:30,offsetX:5,offsetY:10,scaleXPercent:175,scaleYPercent:65,impactXPercent:25,impactYPercent:90,flipX:true,flipY:true},{effectName:'竜巻',rotationDeg:-40,offsetX:-7,offsetY:-10}]);
m.updateV39EffectCategory(reloadCategory.id,{hitEffectMode:'specified',hitEffectName:'竜巻',sequenceSteps:reloadSteps,decorationTransform:{rotationDeg:15,offsetY:3}});
const beforeReload=m.getV39EffectCategory(reloadCategory.id);
const fresh=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text+'\n// fresh page reload').toString('base64'));
const afterReload=fresh.getV39EffectCategory(reloadCategory.id);
assert.equal(afterReload.name,'再読込確認');assert.equal(afterReload.hitEffectMode,'specified');assert.equal(afterReload.hitEffectName,'竜巻');
assert.deepEqual(afterReload.sequenceSteps,reloadSteps,'fresh page restores both animations, angles and X/Y');
assert.deepEqual(afterReload.decorationTransform,beforeReload.decorationTransform,'fresh page restores decoration transforms');
assert.deepEqual(fresh.getV39EffectCategorySettingsSnapshot().categories[reloadCategory.id].sequenceSteps,reloadSteps,'restored JSON snapshot retains sequence');
assert.equal(afterReload.sequenceSteps[0].flipX,true);assert.equal(afterReload.sequenceSteps[0].flipY,true);
assert.equal(afterReload.sequenceSteps[0].scaleXPercent,175);
assert.equal(afterReload.sequenceSteps[0].scaleYPercent,65);assert.equal(afterReload.sequenceSteps[0].impactYPercent,90);
console.log('PASS: genuine fresh-module reload from localStorage preserves category name, two animations, rotation, position and JSON snapshot.');
const ui=readFileSync('frontend/src/v39/ui/v39-effect-settings.js','utf8');
assert.ok(ui.includes("if(playbackMode !== 'full-image')return showPanelFrame();"),'normal still preview shares the exact frame renderer');
assert.ok(!ui.includes('previewImpactPoint'),'mode cannot change image placement');
assert.ok(ui.includes('marker.hidden=!impactEditing ||'),'editing marker is not reused as target marker in confirmation');
assert.match(ui,/id="v39-effect-preview-controls"/);assert.match(ui,/max-height:45%/);assert.match(ui,/min-height:120px/);
const panelMarkup=ui.slice(ui.indexOf('panel.innerHTML ='));
assert.ok(panelMarkup.indexOf('id="v39-effect-sequence-tabs"')>panelMarkup.indexOf('class="v39-effect-settings-lower"'),'number tabs in lower editor');
assert.ok(panelMarkup.indexOf('id="v39-effect-preview-controls"')>panelMarkup.indexOf('class="v39-effect-settings-body"'),'condition controls below preview');
assert.ok(panelMarkup.indexOf('id="v39-effect-preview-stage"')<panelMarkup.indexOf('class="v39-effect-settings-lower"'),'preview independent of editing controls');
assert.match(ui,/#v39-effect-sequence-tabs\{[^}]*flex-direction:column/);
assert.doesNotMatch(ui,/#v39-effect-preview-stage\{[^}]*min-height:0/);
assert.match(ui,/grid-template-columns:44px minmax\(0,1fr\)/);
console.log('PASS: vertical numbered sidebar, conditions outside preview, nonzero preview min-height and isolated attribute layout.');
assert.doesNotMatch(ui,/<select[^>]+id="v39-effect-preview-direction"/);
assert.match(ui,/<input type="hidden" id="v39-effect-preview-direction"/);
assert.match(ui,/id="v39-effect-setting-power-axis"/);
assert.doesNotMatch(ui,/id="v39-effect-setting-(?:rotation|offset-x|offset-y)(?:-slider)?"/);
assert.match(ui,/type="range" id="v39-effect-setting-area-delay-slider"/);
assert.match(ui,/type="number" id="v39-effect-setting-area-delay"/);
console.log('PASS: power axes, default100, legacy settings, tornado category/frames, effect/category JSON roundtrip, combat settings, preview/AOE, real player normal/area/beam scaling (36 cases). No browser.');
