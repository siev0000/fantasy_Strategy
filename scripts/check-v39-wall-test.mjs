import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(String(error.message));process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/v39/dev/v39-wall-test.js';export * from './frontend/src/lib/v39-defense-rules.js';export * from './frontend/src/lib/v39-terrain-traversal.js';export * from './frontend/src/lib/v39-combat-ray.js';export * from './frontend/src/lib/v39-wall-edges.js';export * from './frontend/src/lib/map-entity-size-rules.js';export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/v39/map/v39-land-status.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'headless-fixture',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/v39-map-focus\.js$/},()=>({contents:'export function focusV39MapTile(tile){window.__focused={x:tile.x,y:tile.y};return true;}',loader:'js'}));
}}]});
let testMode=true,locked=false,placed=false;
let state={activePlayerId:'p1',activeWorldId:'surface',timeline:{turnNumber:3},players:[{id:'p1',factionState:{units:[]}}]};
globalThis.window={isV39TestMode:()=>testMode,isV39MapInputLocked:()=>locked,addEventListener(){},startV39ExpeditionTest:()=>({ok:true}),
  waitForV39MapRenderSettled:async()=>{},getV39GameState:()=>state,setV39GameState:patch=>{state={...state,...patch};},
  __v39FieldRuntime:{mapData:{w:24,h:24},settings:{}},loadV39FieldSnapshot:map=>{window.__v39FieldRuntime.mapData=map;placed=true;},activateV39FooterTab(){},showV39TurnBanner(){}};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const fixture=m.buildV39WallTestFixture('p1',3),walls=fixture.map.defenseStructures;
{
const landState={activeWorldId:'surface',players:[{id:'p1',factionState:{settlements:fixture.settlements}}]};
for(const base of fixture.settlements)for(const key of Object.keys(base.territoryResidentialCenterMap)){
  const [x,y]=key.split(',').map(Number);
  assert.equal(m.findV39LandSettlement(landState,{x,y})?.settlementId,base.settlementId,'every occupied city tile resolves the same settlement');
  assert.equal(base.territoryResidentialLevelMap[key],base.scaleKey);
  assert.equal(base.territoryTileModeMap[key],'settlement');
}
assert.equal(m.findV39LandSettlement({...landState,activeWorldId:'cave-test'},{x:5,y:4}),null);
const tile={x:1,y:1},wall={id:'w',name:'防壁',hp:80,maxHp:100,edge:{from:tile,to:{x:2,y:1}}};
const ward={id:'f',name:'結界',kind:'結界',hp:150,maxHp:200,tiles:[tile,{x:1,y:2}],expiresAtTurn:8};
assert.equal(m.summarizeV39LandDefenses([wall,ward],tile,3),'防壁 1辺 HP 80/100 / 結界 HP 150/200');
assert.equal(m.summarizeV39LandDefenses([wall],{x:2,y:1},3),'防壁 1辺 HP 80/100','both sides of a wall show durability');
assert.equal(m.summarizeV39LandDefenses([ward],tile,8),'');
assert.equal(m.summarizeV39LandDefenses([{...wall,hp:0}],tile,3),'');
assert.equal(m.summarizeV39LandDefenses([wall],tile,3,{visible:false}),'結界 / 壁 未確認');
assert(!readFileSync('frontend/src/v39/ui/v39-operation-ui.js','utf8').includes('>交流へ</button>'));
}
const outlineMetrics={width:62,height:74,rowStep:56},outlineCenter=(x,y)=>({x:x*62+(y&1)*31,y:y*56});
for(const [row,count] of [[{範囲:'単体'},6],[{範囲:'三角形'},9],[{範囲:'周囲',炸裂:10},12],[{範囲:'周囲',炸裂:20},18]]){
  const field=m.createV39DefenseStructure(fixture.map,{x:7,y:5},{名前:'結界',効果:'結界',ガード:300,効果時間:5,...row},{id:'caster',ownerPlayerId:'p1'},3);
  const snapshot=JSON.stringify(field);
  const outline=m.resolveV39SmoothedFootprintOutline(field.tiles,outlineCenter,outlineMetrics);
  assert.equal(outline.length,count);
  const vertices=new Map();
  for(const edge of outline)for(const p of edge){const key=`${p.x},${p.y}`;vertices.set(key,(vertices.get(key)||0)+1);}
  assert.ok([...vertices.values()].every(degree=>degree===2),'smoothed outline remains closed');
  assert.equal(JSON.stringify(field),snapshot,'display smoothing must not change tiles, shared HP or duration');
}
const boundaryOutline=m.resolveV39SmoothedFootprintOutline([{x:0,y:0}],outlineCenter,outlineMetrics);
assert.equal(boundaryOutline.length,6,'map-edge outline remains closed');
const disjoint=m.resolveV39SmoothedFootprintOutline([{x:0,y:0},{x:4,y:4}],outlineCenter,outlineMetrics);
assert.equal(disjoint.length,12,'disconnected components are not bridged');
const entitySource=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
assert.ok(entitySource.includes("if(defense.kind==='結界')edges=resolveV39SmoothedFootprintOutline"));
assert.ok(readFileSync('frontend/src/v39/combat/v39-combat.js','utf8').includes('if(!fieldOutline)areaGraphics.lineStyle'));
assert.equal(m.resolveV39SettlementImageScale({footprintTiles:1}),1);
assert.equal(m.resolveV39SettlementImageScale({footprintTiles:2}),1);
assert.equal(m.resolveV39SettlementImageScale({footprintTiles:3}),.85);
assert.equal(m.resolveV39SettlementImageScale({footprintTiles:7}),.85);
assert.ok(m.MAP_ENTITY_SIZE_RULES.wall.pillarRadiusPx*2>m.MAP_ENTITY_SIZE_RULES.wall.lineWidthPx);
const drawing=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
assert.ok(drawing.includes('v39-wall-pillars')&&drawing.includes('pillars.set(')&&drawing.includes('.strokeCircle('));
assert.equal(walls.length,34);assert.equal(fixture.units.length,2);assert.equal(fixture.map.wallTestSamples.length,6);
assert.equal(walls.filter(w=>w.name==='防壁').length,12);
assert.equal(walls.filter(w=>w.name==='城壁').length,18);
assert.ok(walls.filter(w=>w.wallFacilityName).every(w=>w.edge&&!w.facilityName));
assert.equal(walls.find(w=>w.name==='結界').tiles.length,7);
assert.equal(walls.find(w=>w.name==='魔法壁').expiresAtTurn,8);
const castle=walls.find(w=>w.name==='城壁'),{from,to}=castle.edge;
const walker={id:'outsider',ownerPlayerId:'enemy',status:{移動:100,飛行:0}},flyer={...walker,status:{移動:100,飛行:200}};
assert.equal(m.resolveV39UnitMovementStepCost(fixture.map,from.x,from.y,to.x,to.y,walker),Infinity);
assert.ok(Number.isFinite(m.resolveV39UnitMovementStepCost(fixture.map,from.x,from.y,to.x,to.y,flyer)));
assert.ok(Number.isFinite(m.resolveV39UnitMovementStepCost(fixture.map,from.x,from.y,to.x,to.y,{...walker,ownerPlayerId:'p1'})));
assert.equal(m.hasV39WallLineOfSight(fixture.map,from,to),false);
const saved=JSON.parse(JSON.stringify(fixture.map));assert.deepEqual(saved.defenseStructures,fixture.map.defenseStructures);
const pairedMap=JSON.parse(JSON.stringify(fixture.map));
const pairs=m.collectV39JoinedWallPairs(pairedMap.defenseStructures);
assert.equal(pairs.filter(pair=>pair[0].name==='城壁').length,6);
assert.equal(pairs.filter(pair=>pair[0].name==='防壁').length,3);
const pair=pairs.find(p=>p[0].name==='城壁');
const originalArea=new Map();originalArea.structureScales=new Map([[pair[0].id,1]]);
const combatSource=readFileSync('frontend/src/v39/combat/v39-combat.js','utf8');
const damageFunction=combatSource.match(/function damagePlacedWalls\(map, area, attacker, row, log\) \{[\s\S]*?\n\}/)[0];
let calculations=0;
const applyWallDamage=Function('resolveV39JoinedWallDamageScales','collectV39JoinedWallPairs','computeAttackDamage','terrainAdjusted','resolveAttackPower',`return (${damageFunction});`)(
  m.resolveV39JoinedWallDamageScales,m.collectV39JoinedWallPairs,()=>{calculations++;return {total:25,hitResults:[{hit:true}]};},u=>u,()=>25);
const wallLog=[];applyWallDamage(pairedMap,originalArea,{}, {},wallLog);
assert.equal(calculations,1);assert.equal(wallLog.length,2);
assert.equal(pair[0].hp,375);assert.equal(pair[1].hp,375);
pair[0].hp=0;
pairedMap.defenseStructures=m.pruneV39DefenseStructures(pairedMap.defenseStructures,5);
assert.ok(pairedMap.defenseStructures.includes(pair[0]),'retain the broken half while the other half survives');
assert.equal(m.v39WallStepHeight(pairedMap,pair[0].edge.from,pair[0].edge.to),2);
assert.ok(m.v39RayStructureAtStep(pairedMap,pair[0].edge.from,pair[0].edge.to));
const reloaded=JSON.parse(JSON.stringify(pairedMap));
assert.equal(m.v39WallStepHeight(reloaded,pair[0].edge.from,pair[0].edge.to),2);
pair[1].hp=0;
assert.equal(m.v39WallStepHeight(pairedMap,pair[0].edge.from,pair[0].edge.to),0);
assert.equal(m.v39RayStructureAtStep(pairedMap,pair[0].edge.from,pair[0].edge.to),null);
assert.ok(!m.pruneV39DefenseStructures(pairedMap.defenseStructures,6).some(w=>pair.includes(w)));
const center=(x,y)=>({x:x*62+(y%2?31:0),y:y*56});
const segment=m.resolveV39JoinedWallSegment(pair,center,{width:62,height:74,rowStep:56});
assert.equal(segment.length,2);assert.ok(segment.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
const tile={x:5,y:4},neighbor=m.v39DefenseNeighbors(tile)[0];
assert.equal(m.collectV39WallOuterEdges([tile],fixture.map).length,6);
assert.equal(m.v39WallEdgeKey({from:tile,to:neighbor}),m.v39WallEdgeKey({from:neighbor,to:tile}));
const map={...fixture.map,defenseStructures:[]};
let game={activePlayerId:'p1',timeline:{turnNumber:3},players:[{id:'p1',race:'只人',factionState:{settlements:fixture.settlements,selectedSettlementId:fixture.settlement.settlementId,units:fixture.units}}],territoryOwnerByTile:fixture.territoryOwnerByTile,territoryStateByTile:fixture.territoryStateByTile};
const edges=m.collectV39WallOuterEdges(m.currentDevelopmentOccupiedTiles(fixture.settlement).map(key=>{const [x,y]=key.split(',').map(Number);return {x,y};}),map);
assert.equal(edges.length,12);
const definition=m.facilityDefinitions().find(d=>d.name==='防壁');
const check=m.inspectV39WallConstruction(game,game.players[0],definition,edges,map);
assert.equal(check.available,true,check.reasons.join('/'));
let result=m.startV39WallConstruction(game,'p1','防壁',[...edges,edges[0]],map);
assert.equal(result.ok,true,result.reason);assert.equal(result.queueItems.length,12);
let village=result.state.players[0].factionState.settlements.find(v=>v.settlementId===fixture.settlement.settlementId);
assert.equal(village.wallConstructionQueue.length,12);
assert.equal(village.materialStockByType.木材,fixture.settlement.materialStockByType.木材-definition.cost.木材*12);
assert.equal(village.buildings.length,0);
assert.equal(m.startV39WallConstruction(result.state,'p1','防壁',[edges[0]],map).ok,false);
const restored=m.normalizeV39Village(JSON.parse(JSON.stringify(village)),'只人');assert.equal(restored.wallConstructionQueue.length,12);
const ordered=m.orderV39WallConstructionEdges([...edges].reverse(),m.v39WallEdgeKey(edges[5]));
assert.equal(m.v39WallEdgeKey(ordered[0]),m.v39WallEdgeKey(edges[5]));
assert.equal(new Set(ordered.map(m.v39WallEdgeKey)).size,12);
const centerForOrder=(x,y)=>({x:x*2+(y&1),y:y*3}),metricsForOrder={width:2,height:4,rowStep:3};
for(let i=1;i<ordered.length;i++){
  const a=m.resolveV39WallEdgeSegment(ordered[i-1],centerForOrder,metricsForOrder),b=m.resolveV39WallEdgeSegment(ordered[i],centerForOrder,metricsForOrder);
  assert.ok(a.some(p=>b.some(q=>p.x===q.x&&p.y===q.y)),'build order follows connected perimeter edges');
}
const tick=m.advanceV39WallConstruction(village,{...map,defenseStructures:[]},'p1',4);
assert.deepEqual(tick.village.wallConstructionQueue.at(-1),village.wallConstructionQueue.at(-1),'waiting edges do not progress');
for(let turn=4;turn<4+definition.buildTurns*12;turn++){
  const progress=m.advanceV39WallConstruction(village,map,'p1',turn);
  assert.ok(progress.completed.length<=1);
  village=progress.village;
  if(turn===4+definition.buildTurns)village=m.normalizeV39Village(JSON.parse(JSON.stringify(village)),'只人');
  assert.equal(map.defenseStructures.length,Math.floor((turn-3)/definition.buildTurns));
}
assert.equal(village.wallConstructionQueue.length,0);assert.equal(map.defenseStructures.length,12);
assert.ok(map.defenseStructures.every(w=>w.hp===200&&w.edge&&w.expiresAtTurn===0));
map.defenseStructures[0].hp=0;assert.equal(map.defenseStructures[1].hp,200);
const invalid={from:tile,to:{x:100,y:100}};
assert.equal(m.startV39WallConstruction(game,'p1','防壁',[invalid],map).ok,false);
assert.equal(m.startV39WallConstruction(game,'p1','防壁',[],map).ok,false);
testMode=false;assert.equal(await m.startV39WallTest(),false);assert.equal(placed,false);
testMode=true;locked=true;assert.equal(await m.startV39WallTest(),false);assert.equal(placed,false);
locked=false;assert.equal(await m.startV39WallTest(),true);assert.equal(placed,true);
assert.equal(state.players[0].factionState.settlements.length,3);
assert.deepEqual(window.__focused,{x:8,y:6});
assert.equal(window.focusV39WallTestSample('castle'),true);assert.deepEqual(window.__focused,{x:9,y:4});
assert.equal(window.focusV39WallTestSample('missing'),false);
let opened;
window.openV39LandConstruction=(tile,options)=>{opened={tile,options};return true;};
assert.equal(window.openV39WallBuildTest(),true);
assert.deepEqual(opened.tile,fixture.map.wallBuildTestTile);assert.equal(opened.options.facilityName,'防壁');
const buildBase=fixture.settlements.find(v=>v.settlementId==='wall-build-test-base');
assert.ok(buildBase);assert.equal(Object.keys(buildBase.territoryResidentialCenterMap).length,7);
assert.ok(!fixture.map.defenseStructures.some(w=>w.settlementId===buildBase.settlementId));
const buildEdges=m.collectV39WallOuterEdges(Object.keys(buildBase.territoryResidentialCenterMap).map(key=>{const [x,y]=key.split(',').map(Number);return {x,y};}),fixture.map);
assert.equal(buildEdges.length,18);
assert.equal(m.inspectV39WallConstruction(game,game.players[0],definition,buildEdges,fixture.map).available,true);
const controls=readFileSync('frontend/src/v39/dev/v39-test-tools.js','utf8');
assert.ok(controls.includes('data-test-action="wall-test-start"'));assert.ok(controls.includes("action==='wall-test-start'"));
assert.match(controls,/id:'scenarios'[^\n]+sections:\[[^\]]*'walls'/u,'the comparison section must be visible in the dedicated tab');
const constructionUI=readFileSync('frontend/src/v39/world/v39-land-construction-ui.js','utf8');
assert.ok(constructionUI.includes('data-wall-mode='));assert.ok(constructionUI.includes("session.wallMode==='tiles'"));
assert.ok(constructionUI.includes('startEdgeKey:orderedEdges[0]'));
const tileListener=constructionUI.match(/window.addEventListener\('v39:tile-selected',event=>\{[\s\S]*?\n\}\);/)[0];
let listener,renderCount=0;
const session={tile:{x:1,y:1},playerId:'p1'};
Function('session','render','window',tileListener)(session,()=>renderCount++,{addEventListener:(_name,fn)=>{listener=fn;}});
listener({detail:{x:2,y:3}});assert.deepEqual(session.tile,{x:2,y:3});assert.equal(renderCount,1);
assert.ok(constructionUI.includes("ownTile&&check?.available?'':' disabled'"));
console.log('PASS: 3/7-tile perimeters (12/18 edges), independent HP, construction costs/queue/completion/save, friendly passage, enemy/flight/ray, magic wall/barrier, combined test start. No browser.');
