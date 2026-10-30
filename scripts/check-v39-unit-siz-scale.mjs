import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const bundle=await build({entryPoints:['frontend/src/lib/map-entity-size-rules.js'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'runtime-data',setup(builder){
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
assert.equal(scale(undefined),1);assert.equal(scale('bad'),1);
assert.equal(m.resolveV39UnitImageScale({SIZ:170}),.75);
assert.equal(m.resolveV39UnitImageScale({SIZ:500,status:{SIZ:85}}),.5);
const source=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
const body=source.match(/function addUnitArtwork\(scene, marker, unit, diameter\) \{[\s\S]*?\n\}/)[0];
const image={width:100,height:200,setOrigin(){return this;},setScale(value){this.scale=value;return this;},setTint(){return this;}};
const render=Function('resolveUnitArtwork','ensureArtworkTexture','ensureArtworkSheetFrame','MAP_ENTITY_SIZE_RULES','resolveV39UnitImageScale','getV39UnitWaitTint','window',`return (${body});`)(
  ()=>({textureKey:'test'}),()=>true,()=>null,m.MAP_ENTITY_SIZE_RULES,m.resolveV39UnitImageScale,()=>0xffffff,{});
for(const [siz,ratio] of [[85,.5],[170,.75],[500,1]]){
  render({add:{image:()=>image}},{add(){}},{status:{SIZ:siz},hp:100},62);
  assert.ok(Math.abs(image.scale-62*.95*ratio/200)<1e-10);
}
assert.ok(source.includes('resolveV39UnitImageScale(enemy)'));
assert.ok(source.includes('unit.recoveryWaitTargetPercent,resolveV39UnitImageScale(unit)'));
console.log('PASS: SIZ anchors/interpolation/limits, missing values, actual field image scaling and SIZ render invalidation. No browser.');
