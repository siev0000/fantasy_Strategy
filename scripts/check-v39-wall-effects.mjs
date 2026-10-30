import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-wall-effects.js';export * from './frontend/src/lib/v39-terrain-traversal.js';export * from './frontend/src/lib/v39-civic-rules.js';export * from './frontend/src/lib/hex-grid.js';export * from './frontend/src/lib/v39-wall-edges.js';export {getGameDataRows} from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const center={x:3,y:3},map={w:8,h:8,grid:Array.from({length:8},()=>Array(8).fill('平地')),heightLevelMap:Array.from({length:8},()=>Array(8).fill(0)),defenseStructures:[]};
const tiles=[center,...m.getHexOffsetNeighbors(center.x,center.y)],residential=new Set(tiles.map(p=>`${p.x},${p.y}`));
const edges=new Map();
for(const from of tiles)for(const to of m.getHexOffsetNeighbors(from.x,from.y))if(residential.has(`${to.x},${to.y}`))edges.set(m.v39WallEdgeKey({from,to}),{from,to});
const wall=(edge,id)=>({id,kind:'壁',wallFacilityName:'城壁',ownerId:'p1',settlementId:'base',edge,tiles:[edge.from],hp:400,height:2});
map.defenseStructures=[...edges.values()].map((edge,i)=>wall(edge,`wall-${i}`));
assert.equal(map.defenseStructures.length,12);
const penalty=m.resolveV39InternalWallHappiness(map,'base','p1',residential);
assert.deepEqual(penalty,{edgeCount:12,rawPenalty:12,penalty:10,limit:10});
const edge=map.defenseStructures[0].edge,unit={id:'u1',ownerPlayerId:'p1',status:{移動:100,飛行:0}};
const step=(field,actor=unit)=>m.resolveV39UnitMovementStepCost(field,edge.from.x,edge.from.y,edge.to.x,edge.to.y,actor);
const openCost=step({...map,defenseStructures:[]});assert.equal(openCost,10);assert.equal(step(map),13);
assert.equal(step(map,{...unit,ownerPlayerId:'enemy'}),Infinity);
assert.equal(m.resolveV39FriendlyWallMovePercent(map,edge.from,edge.to,{ownerId:'ally',isFriendlyOwner:id=>id==='p1'}),25);
const outer={...map,defenseStructures:m.collectV39WallOuterEdges(tiles,map).map((e,i)=>wall(e,`outer-${i}`))};
assert.equal(m.resolveV39InternalWallHappiness(outer,'base','p1',residential).penalty,0);
assert.equal(m.resolveV39InternalWallHappiness(map,'base','someone-else',residential).penalty,0);
const destroyed={...map,defenseStructures:map.defenseStructures.map(w=>({...w,hp:0}))};
assert.equal(step(destroyed),openCost);assert.equal(m.resolveV39InternalWallHappiness(destroyed,'base','p1',residential).penalty,0);
assert.equal(m.resolveV39InternalWallHappiness({...map,defenseStructures:[]},'base','p1',residential).penalty,0);
const duplicate={...map,defenseStructures:[map.defenseStructures[0],{...map.defenseStructures[0],id:'duplicate'}]};
assert.equal(step(duplicate),13);assert.equal(m.resolveV39InternalWallHappiness(duplicate,'base','p1',residential).edgeCount,1);
const village={population:50,populationByRace:{只人:50}};
const normal=m.resolveV39CivicTurn(village,1),restricted=m.resolveV39CivicTurn(village,1,[],{names:[],bonus:0},{},{},{},penalty);
assert.equal(restricted.happinessTargetByRace.只人,normal.happinessTargetByRace.只人-10);
assert.equal(restricted.modifiers.innerWalls,-10);assert.equal(restricted.happinessModifiersByRace.只人.innerWalls,-10);
const row=m.getGameDataRows('施設').find(r=>r.施設名==='城壁'),saved={...row};
try{
  row.味方通行AP増加率=50;row.内壁幸福度低下=2;row.内壁幸福度低下上限=7;
  assert.equal(step(map),15);assert.equal(m.resolveV39InternalWallHappiness(map,'base','p1',residential).penalty,7);
}finally{Object.assign(row,saved);}
console.log('PASS: sheet-driven friendly/ally wall AP, enemy blocking, destroyed/unfinished/outer exclusions, inner-wall counting/dedup/cap, civic targets/breakdown and changed sheet values. No browser.');
