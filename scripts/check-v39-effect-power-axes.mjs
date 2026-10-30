import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {PhaserEffectPlayer,resolveEffectPowerAxes} from '../配布用/アニメーション再生機能/phaser-effect-player.mjs';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2,powerScaleAxis:'x'}),{x:2,y:1});
assert.deepEqual(resolveEffectPowerAxes({powerScale:.5,powerScaleAxis:'y'}),{x:1,y:.5});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2}),{x:2,y:2});
assert.deepEqual(resolveEffectPowerAxes({powerScale:2,powerScaleAxis:'x',stretchLengthPx:360,stretchAxis:'x'}),{x:1,y:1});
const bundle=await build({stdin:{contents:`
  export * from './frontend/src/lib/v39-effect-settings.js';
  export * from './frontend/src/lib/v39-effect-category-settings.js';
  export * from './frontend/src/lib/v39-effect-transform.js';
  export {resolveV39CombatEffect} from './frontend/src/lib/v39-combat-effect-rules.js';
  export {resolveV39EffectPlaybackDescriptor} from './frontend/src/v39/combat/v39-effect-player.js';
  export * from './frontend/src/v39/ui/v39-effect-preview-combatants.js';
`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env.BASE_URL':'"/"','import.meta.url':'"file:///effect-test/preview.js"'},plugins:[{name:'vite-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json');
    const modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/[\\/]combat[\\/]v39-effect-player\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
const storage=new Map([['v39-effect-category-settings-v1',JSON.stringify({version:5,settings:{slash:{baseEffect:'斬撃',rotationDeg:20}}})]]);
globalThis.window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},dispatchEvent(){}};
const originalWarn=console.warn;let m;
try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=originalWarn;}
assert.equal(m.V39_EFFECT_PREVIEW_LIMITS.defaultZoomPercent,100);
assert.equal(m.normalizeV39EffectTransform({powerScaleAxis:'invalid'}).powerScaleAxis,'both');
assert.equal(m.getV39EffectCategory('slash').rotationDeg,20,'legacy customizations survive');
assert.equal(m.getV39EffectCategory('slash').powerScaleAxis,'both');
assert.equal(m.getV39EffectCategory('tornado').baseEffect,'竜巻','new builtin category appears with old saved settings');
assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').sequenceSources[0].frameStart,0);
assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').sequenceSources[0].frameEnd,11);
for(const axis of ['x','y','both']){
  m.updateV39EffectSetting('竜巻',{powerScaleAxis:axis});
  assert.equal(m.resolveV39EffectPlaybackDescriptor('竜巻').powerScaleAxis,axis);
  const snapshot=m.getV39EffectSettingsSnapshot();m.importV39EffectSettings(JSON.stringify(snapshot));
  assert.equal(m.getV39EffectSetting('竜巻').powerScaleAxis,axis,'effect JSON roundtrip');
  m.updateV39EffectCategory('tornado',{powerScaleAxis:axis});
  const categories=m.getV39EffectCategorySettingsSnapshot();m.importV39EffectCategorySettings(JSON.stringify(categories));
  assert.equal(m.getV39EffectCategory('tornado').powerScaleAxis,axis,'category JSON roundtrip');
  assert.equal(m.resolveV39CombatEffect({攻撃手段:'竜巻'}, {}, m.getV39EffectCategories(),[]).settings.powerScaleAxis,axis);
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
const images=[];
const scene={textures:{get:()=>({getSourceImage:()=>({width:960,height:120})})},add:{image(){const image={scene,frame:{data:{}},setOrigin(){},setScale(x,y){this.scaleX=x;this.scaleY=y;},setDepth(){},setAngle(){},setAlpha(){},setBlendMode(){},setName(){},setCrop(){},setPosition(){},clearTint(){},clearMask(){},destroy(){this.scene=null;}};images.push(image);return image;}}};
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
player.destroy();
const ui=readFileSync('frontend/src/v39/ui/v39-effect-settings.js','utf8');
assert.doesNotMatch(ui,/<select[^>]+id="v39-effect-preview-direction"/);
assert.match(ui,/<input type="hidden" id="v39-effect-preview-direction"/);
assert.match(ui,/id="v39-effect-setting-power-axis"/);
console.log('PASS: power axes, default100, legacy settings, tornado category/frames, effect/category JSON roundtrip, combat settings, preview/AOE, real player normal/area/beam scaling (36 cases). No browser.');
