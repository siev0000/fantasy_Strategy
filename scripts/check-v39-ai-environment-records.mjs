import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(String(error.message));process.exit(1);});
const bundle=await build({entryPoints:['frontend/src/v39/dev/v39-ai-simulation-records.js'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'registry',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json');
    const modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={addEventListener(){}};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const unit={id:'carrier',name:'輸送兵',worldId:'surface',x:2,y:2,hp:100,ap:100,transportAssignment:{status:'delivering',reason:'',logisticsRouteId:'route'}};
const base={id:'base',placed:true,worldId:'surface',x:2,y:2,population:20,territoryTileKeys:['2,2','3,2'],buildings:['農場'],
  tileFacilityMap:{'2,2':['農場']},facilityStateByTile:{'2,2':{農場:{hp:100,maxHp:100}}},foodStockByType:{穀物:10},materialStockByType:{木材:20}};
const sample={activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'npc',isPlayer:false,factionState:{units:[unit],settlements:[base],aiState:{lastProcessedTurn:1}}}],neutralVillages:[],
  worldEnvironment:{activeDisasters:[{id:'wave',name:'津波',tileKeys:['2,2','3,2','4,2'],damagePower:200,startsAtTurn:1,expiresAtTurn:5},
    {id:'hidden',name:'遠い災害',tileKeys:['20,20'],startsAtTurn:1,expiresAtTurn:5}]}};
const untouched=JSON.stringify(sample),before=m.simulationActors(sample,{})[0];
assert.equal(JSON.stringify(sample),untouched,'diagnostics must not mutate game state');
assert.equal(before.environment.facilities.length,1);assert.equal(before.environment.disasters.length,1);
assert.equal(before.environment.disasters[0].affectedTiles,2);assert.equal(before.environment.disasters[0].tileKeys,undefined,'do not duplicate full map footprints in every actor frame');
assert.equal(before.environment.transports[0].status,'delivering');
const damaged=structuredClone(sample);damaged.timeline.turnNumber=2;
Object.assign(damaged.players[0].factionState.settlements[0].facilityStateByTile['2,2'].農場,{hp:0,lastDamageCause:'津波',lastDamageTurn:1});
Object.assign(damaged.players[0].factionState.units[0].transportAssignment,{status:'blocked',reason:'通路閉塞'});
const after=m.simulationActors(damaged,{})[0],change=m.compareSimulationActors([before],[after]);
assert.ok(change.changes.some(row=>row.category==='施設'&&/HP 100 → 0.*津波.*損壊/.test(row.message)));
assert.ok(change.changes.some(row=>row.category==='調達'&&row.message.includes('blocked')));
const history=Array.from({length:4},(_,i)=>({turn:i+1,actors:[structuredClone(after)]}));
const prolonged=m.compareSimulationActors([after],[after],history);
assert.ok(prolonged.issues.some(row=>row.message.includes('5ターン連続で損壊')));
assert.ok(prolonged.issues.some(row=>row.message.includes('5ターン連続で停止')));
const repaired=structuredClone(after);repaired.environment.facilities[0].hp=20;repaired.environment.transports[0].status='delivering';
const recovery=m.compareSimulationActors([after],[repaired],history);
assert.ok(recovery.changes.some(row=>row.message.includes('復旧')));
assert.ok(!recovery.issues.some(row=>row.message.includes('損壊')||row.message.includes('輸送が')));
assert.ok(!recovery.issues.some(row=>row.message.includes('位置・戦力')),'repair progress is not incorrectly treated as inactivity');
const corrupt=structuredClone(after);corrupt.environment.facilities[0].hp=NaN;
assert.ok(m.compareSimulationActors([after],[corrupt]).issues.some(row=>row.severity==='異常'&&row.message.includes('施設HP')));
const legacy=structuredClone(before);delete legacy.environment;
assert.doesNotThrow(()=>m.compareSimulationActors([legacy],[after]));
const oldFormat=structuredClone(sample);oldFormat.worldEnvironment.activeDisasters[0].expiresAtTurn=0;
assert.equal(m.simulationActors(oldFormat,{})[0].environment.disasters.length,0,'expired effects are not counted');
const underground=structuredClone(sample);
underground.players[0].factionState.units[0].worldId='cave:1';underground.players[0].factionState.settlements[0].worldId='cave:1';
assert.equal(m.simulationActors(underground,{})[0].environment.disasters.length,0,'matching coordinates in another world must not count as exposure');
underground.explorationWorlds={'cave:1':{spatial:{worldEnvironment:{activeDisasters:[{id:'cave-miasma',name:'瘴気',tileKeys:['2,2'],startsAtTurn:1,expiresAtTurn:3}]}}}};
assert.equal(m.simulationActors(underground,{})[0].environment.disasters[0].worldId,'cave:1');
// Exercise fifty snapshot/comparison cycles, not the actual AI turn loop.
const frames=[];
for(let turn=1;turn<=50;turn++){
  const input=structuredClone(damaged);input.timeline.turnNumber=turn;
  const actor=m.simulationActors(input,{})[0];
  assert.doesNotThrow(()=>m.compareSimulationActors(frames.at(-1)?.actors||[],[actor],frames));
  frames.push({turn,actors:[actor]});
}
assert.deepEqual(JSON.parse(JSON.stringify(frames)).at(-1).actors[0].environment,frames.at(-1).actors[0].environment);
console.log('PASS: actual AI record functions capture scoped disaster exposure, facility HP/damage/repair and transport blockage; fifty snapshot cycles and legacy logs. No AI turns or browser executed.');
