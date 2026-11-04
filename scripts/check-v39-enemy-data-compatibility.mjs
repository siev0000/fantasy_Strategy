import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
const assets=Object.fromEntries(readdirSync('assets',{recursive:true}).filter(p=>/\.(png|jpe?g|webp|avif|gif)$/i.test(p)).map(p=>{p=p.replaceAll('\\','/');return [`../../../assets/${p}`,`/assets/${p}`];}));
const dataRoot=resolve('data/source/export/json');
const modules=Object.fromEntries(readdirSync(dataRoot).filter(p=>p.endsWith('.json')).map(p=>[`../../../data/source/export/json/${p}`,JSON.parse(readFileSync(resolve(dataRoot,p),'utf8'))]));
const bundle=await build({stdin:{contents:`export * from './frontend/src/v39/ai/v39-enemy-spawn.js';export * from './frontend/src/lib/v39-cave-generator.js';export * from './frontend/src/lib/v39-enemy-formation.js';export * from './frontend/src/lib/v39-enemy-climate.js';export * from './frontend/src/lib/v39-victory-guardian-candidates.js';export * from './frontend/src/lib/map-entity-artwork.js';export {classData,enemySpawnData} from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(b){b.onLoad({filter:/\.js$/},args=>{let code=readFileSync(args.path,'utf8');if(!code.includes('import.meta.glob'))return;code=code.replace(/import\.meta\.glob\([^;]+\);/g,JSON.stringify(args.path.endsWith('game-data-registry.js')?modules:assets)+';');return {contents:code,resolveDir:dirname(args.path),loader:'js'};});}}]});
let state,map;
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options.detail;}};
globalThis.window={addEventListener(){},dispatchEvent(){},isV39TestMode:()=>false,getV39GameState:()=>state,setV39GameState:patch=>{state={...state,...patch};}};
const warnings=[];const warn=console.warn;
let m;try{console.warn=(...args)=>warnings.push(String(args[0]));m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const rawClasses=modules['../../../data/source/export/json/クラス.json'];
const names=new Set(m.classData.map(row=>row.名前));
const missing=m.enemySpawnData.filter(row=>row.種族&&(!names.has(row.種族)||(row.サブクラス&&!names.has(row.サブクラス)))).map(row=>({id:row.ID,name:row.種族名,race:row.種族,className:row.サブクラス}));
const terrains=[...new Set(m.enemySpawnData.flatMap(row=>String(row.出現地形||'').split(/[\/／,、\n]/)))].filter(Boolean);
const definitions=[...new Map(terrains.flatMap(t=>m.getV39EnemySpawnDefinitions(t)).map(d=>[d.definitionId,d])).values()];
const generated=[],errors=[],imageFallback=[];
for(const definition of definitions){
  for(const level of new Set([definition.minLevel,definition.maxLevel])){
    const enemy=m.createV39EventEnemy({id:`audit-${definition.definitionId}-${level}`,race:definition.race,className:definition.className,name:definition.name,level,x:10,y:10,combatProfile:m.resolveV39EnemyCombatProfile(definition.row),metadata:{image:definition.row.画像,sourceDefinitionId:definition.definitionId}});
    if(!enemy||!Number.isFinite(enemy.hp)||enemy.hp<=0||Object.values(enemy.status||{}).some(n=>!Number.isFinite(n))){errors.push({id:definition.definitionId,level});continue;}
    assert.equal(enemy.level,level);assert.equal(enemy.ap,100);
    const art=m.resolveUnitArtwork(enemy);if(!art||art.type==='icon'||art.kind==='icon')imageFallback.push(definition.definitionId);
    generated.push(enemy);
  }
}
const wyverns=generated.filter(enemy=>enemy.race==='ワイバーン');
assert.equal(wyverns.length,6,'three definitions at their minimum and maximum level');
for(const enemy of wyverns){
  for(const variant of [enemy,JSON.parse(JSON.stringify(enemy)),{...enemy,strongEnemy:true,strongAnimalClassName:'フレイムアニマル',strongAnimalClassLevel:5}]){
    for(const art of [m.resolveUnitArtwork(variant),m.resolveEnemyArtwork(variant)]){
      assert.equal(art?.sheetFrame?.fileName,'ワイバーン_ユニット集.webp');
      assert.equal(art.sheetFrame.slotNumber,1);
    }
  }
}
assert.equal(m.resolveUnitArtwork({race:'ドレイク',className:'ドレイク',level:10})?.sheetFrame?.slotNumber,7,'drake is unchanged');
const scenarios=[];
const savedRandom=Math.random;let seed=253;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
try{
  for(const [terrain,height,strong] of [['平地',1,false],['森',2,false],['砂漠',0,false],['砂漠',2,false],['雪原',3,false],['森',2,true],['平地',7,false]]){
    map={w:32,h:32,seed:253,worldWrapEnabled:false,grid:Array.from({length:32},()=>Array(32).fill(terrain)),heightLevelMap:Array.from({length:32},()=>Array(32).fill(height)),specialMap:Array.from({length:32},()=>Array(32).fill('')),strongMonsterMap:Array.from({length:32},(_,y)=>Array.from({length:32},(_,x)=>strong&&x%10===5&&y%10===5)),riverData:{riverSet:new Set()}};
    state={activePlayerId:'p',activeWorldId:'surface',players:[{id:'p',isPlayer:true,factionState:{settlements:[{id:'home',settlementId:'home',placed:true,x:1,y:1,population:20}],units:[]}}],enemies:[],enemyNests:[],enemySquads:[],worldEnvironment:{}};
    window.__v39FieldRuntime={mapData:map,settings:{enemySpawnTileDivisor:40}};
    const enemies=window.spawnV39Enemies();

    assert(enemies.every(e=>e.derivedCharacter?.ok&&e.hp>0&&Number.isFinite(e.hp)));
    assert(!enemies.some(e=>[e.name,e.race,e.className,e.strongFusionResultName].some(name=>m.V39_GUARDIAN_ONLY_SPECIES.has(name))),'guardian species must not spawn naturally');
    scenarios.push({terrain,height,strong,count:enemies.length,armies:enemies.filter(e=>e.combatProfile?.mode==='army').length,bosses:enemies.filter(e=>e.strongEnemy).length,nests:state.enemyNests.length});
  }
  const cave=m.generateV39CaveMap({seed:'updated-classes-253',entranceCount:2});
  const caveEnemies=m.populateV39CaveMonsters(cave,m.getV39EnemySpawnDefinitions('洞窟'),m.createV39EventEnemy);
  assert(caveEnemies.length>0);assert(caveEnemies.every(e=>e.derivedCharacter?.ok&&e.hp>0));
  scenarios.push({terrain:'洞窟',count:caveEnemies.length,armies:caveEnemies.filter(e=>e.combatProfile?.mode==='army').length});
}finally{Math.random=savedRandom;}
const report={rawClassCount:rawClasses.length,spawnRows:m.enemySpawnData.length,validDefinitions:definitions.length,missingClassReferences:missing,generatedEndpoints:generated.length,generationErrors:errors,imageFallback:[...new Set(imageFallback)],scenarios};
writeFileSync('output/ui253-enemy-compatibility.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,missingClassReferences:missing.length,imageFallback:report.imageFallback.length}));
assert.equal(errors.length,0,'valid definitions must generate living enemies');
assert(scenarios.filter(row=>row.terrain==='砂漠').every(row=>row.count>0),'desert references must remain spawnable');
if(missing.length)process.exitCode=1;
