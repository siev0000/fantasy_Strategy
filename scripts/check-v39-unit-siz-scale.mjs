import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
export * from './frontend/src/lib/map-entity-size-rules.js';
export * from './frontend/src/v39/map/v39-tile-geometry.js';
`},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'runtime-data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
const m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const scale=siz=>m.resolveV39UnitImageScale({status:{SIZ:siz}});
assert.equal(scale(85),.5);assert.equal(scale(170),.75);assert.equal(scale(500),1);
assert.equal(scale(127.5),.625);assert.equal(scale(335),.875);assert.equal(scale(42.5),.25);
assert.equal(scale(1000),1);assert.equal(scale(0),.1);assert.equal(scale(-20),.1);
assert.equal(scale(1049),1);assert.equal(scale(1050),1.5);assert.equal(scale(1275),1.625);
assert.equal(scale(1500),1.75);assert.equal(scale(2200),1.75);
assert.equal(scale(undefined),1);assert.equal(scale('bad'),1);
assert.equal(m.resolveV39UnitImageScale({SIZ:170}),.75);
assert.equal(m.resolveV39UnitImageScale({SIZ:500,status:{SIZ:85}}),.5);
const source=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
const body=source.match(/function addUnitArtwork\(scene, marker, unit, diameter\) \{[\s\S]*?\n\}/)[0];
const scaleArtwork=Function(`return (${source.match(/function scaleUnitArtwork\(image,target\) \{[\s\S]*?\n\}/)[0]});`)();
const image={width:100,height:200,setOrigin(){return this;},setScale(value){this.scale=value;return this;},setTint(){return this;},setAngle(){return this;}};
const render=Function('gameState','resolveV39ActiveTransformationArtwork','resolveV39NamedUnitArtwork','resolveUnitArtwork',
  'getV39UnitArtworkBrightness','ensureArtworkTexture','ensureArtworkSheetFrame','MAP_ENTITY_SIZE_RULES',
  'fieldUnitImageScale','scaleUnitArtwork','v39FieldUnitAngle','getV39UnitWaitTint','window',`return (${body});`)(
  ()=>null,()=>null,()=>null,()=>({textureKey:'test'}),()=>1,()=>true,()=>null,
  m.MAP_ENTITY_SIZE_RULES,m.resolveV39UnitImageScale,scaleArtwork,()=>0,()=>0xffffff,{});
for(const [siz,ratio] of [[85,.5],[170,.75],[500,1],[1050,1.5],[1500,1.75]]){
  render({add:{image:()=>image}},{add(){}},{status:{SIZ:siz},hp:100},62);
  assert.ok(Math.abs(image.scale-62*.95*ratio/200)<1e-10);
}
for(const y of [8,9]){
  const unit={id:'unit',x:8,y,hp:100,status:{SIZ:1050}};
  const offset=m.resolveV39UnitVisualOffset(unit);
  assert.ok(Math.abs(offset.y-m.tileMetrics().rowStep*2/3)<1e-10);
  assert.ok(Math.abs(offset.x)<1e-10);
  assert.deepEqual(m.resolveV39UnitVisualOffset({...unit,status:{SIZ:500}}),{x:0,y:0});
}
const moved={name:'unit-art',x:0,y:0,setPosition(x,y){this.x=x;this.y=y;}};
const center=Function('resolveV39UnitVisualOffset','renderState',
  `return (${source.match(/function centerUnitVisuals\(marker,unit\) \{[\s\S]*?\n\}/)[0]});`)(m.resolveV39UnitVisualOffset,null);
assert.equal(center({list:[moved]},{x:8,y:8,hp:100,status:{SIZ:1050}}),true);
assert.ok(Math.abs(moved.y-m.tileMetrics().rowStep*2/3)<1e-10);
const strokes=[],frameLayer=[];
const border={
  setName(){return this;},setData(){return this;},setPosition(x,y){this.x=x;this.y=y;return this;},
  setAlpha(){return this;},fillStyle(){return this;},fillPoints(){return this;},
  lineStyle(width,color,alpha){strokes.push(alpha);return this;},strokePoints(){return this;},
  destroy(){this.destroyed=true;}
};
const marker={...m.tileCenter(8,8),alpha:1,list:[moved],setData(key,value){this[key]=value;},
  once(event,callback){this[event]=callback;}};
const frame=Function('tileMetrics','tileCenter','getV39UnitFootprint','renderState','window',
  'V39_MAP_FRAME_ALPHA','unitFrameContainer',
  `return (${source.match(/function addUnitOwnerBorder\(scene,marker,color,unit\)\{[\s\S]*?\n\}/)[0]});`)(
  m.tileMetrics,m.tileCenter,()=>[{x:8,y:8},{x:7,y:9},{x:8,y:9}],null,{},m.V39_MAP_FRAME_ALPHA,{add:child=>frameLayer.push(child)});
frame({add:{graphics:()=>border}},marker,0xffdd72,{hp:100});
assert.deepEqual(strokes,[0.72,0.72,0.72]);
assert.deepEqual(frameLayer,[marker.ownerFrame]);
assert.deepEqual(marker.list,[moved]);
marker.destroy();
assert.ok(border.destroyed);
console.log('PASS: SIZ scale anchors, interpolation, cap, field artwork scaling and three-hex centering.');
