import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-logistics-state.js';export * from './frontend/src/lib/v39-cargo-deposit.js';export * from './frontend/src/lib/v39-soul-recovery.js';export * from './frontend/src/lib/v39-soul-resource-value.js';export * from './frontend/src/lib/v39-soul-conversion.js';export * from './frontend/src/lib/v39-unit-achievements.js';export * from './frontend/src/lib/v39-combat-engine.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={addEventListener(){}};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
assert.equal(m.resolveV39SoulResourceValue(.3),30);
assert.equal(m.resolveV39SoulResourceValue(.1),10);
assert.equal(m.resolveV39SoulResourceValue(.03),3);
assert.equal(m.resolveV39SoulResourceValue(.06),6);
assert.equal(m.resolveV39SoulResourceValue(m.resolveV39PersonSoulAmount({race:'デヴィル',factionState:{}},1)),100);
assert.equal(m.v39CargoResourceDisplayAmount('木材',.3),.3);
const actor={id:'a',name:'回収者',race:'デヴィル',className:'デヴィル',squadId:'solo',worldId:'surface',x:2,y:2,hp:100,ap:100,status:{SIZ:170},techniques:[]};
const body={id:'b',name:'死体',race:'エルフ',worldId:'surface',x:2,y:3,hp:0,state:'死亡',diedAtTurn:1,deadExpireTurn:20,corpseLifetimeVersion:1};
const state={activePlayerId:'p',activeWorldId:'surface',timeline:{phase:'player',turnNumber:2},players:[{id:'p',race:'悪魔',factionState:{units:[actor],squads:[{id:'solo',unitIds:['a']}]}}],enemies:[body],neutralVillages:[]};
assert.equal(m.resolveV39CorpseSoulPoints(body),30);
assert.equal(m.resolveV39CorpseSoulPoints({...body,race:'ウルフ'}),10);
assert.equal(m.resolveV39CorpseSoulPoints({...body,race:'ビートル'}),3);
assert.equal(m.resolveV39CorpseSoulPoints({...body,combatProfile:{memberCount:4}}),120);
assert(m.inspectV39ResourceSoulRecovery(state,'p','a').available);
for(const [x,y] of [[1,2],[3,2],[1,1],[2,1],[1,3],[2,3]]){
  assert(m.inspectV39ResourceSoulRecovery({...state,enemies:[{...body,x,y}]},'p','a').available,`隣接 ${x},${y}`);
}
const far=m.inspectV39ResourceSoulRecovery({...state,enemies:[{...body,x:10,y:10}]},'p','a');
assert(!far.available);assert(far.nearest.distance>1);assert(far.reason.includes('距離'));
let result=m.recoverV39ResourceSoul(state,'p','a','b');assert(result.ok);assert.equal(result.amount,.3);
assert.equal(result.state.players[0].factionState.units[0].ap,80);
assert.equal(m.resolveV39FactionUnitCargoStatus(result.state.players[0].factionState,'a',result.state).cargo.resourcesByType.魂,.3);
assert(!m.recoverV39ResourceSoul(result.state,'p','a','b').ok);
assert.equal(result.state.enemies[0].hp,0);assert(result.state.enemies[0].soulCollected);
for(const extra of [{summon:{}},{isUndead:true},{worldId:'elsewhere'},{x:30},{deadExpireTurn:2}]){
  assert(!m.inspectV39ResourceSoulRecovery({...state,enemies:[{...body,...extra}]},'p','a').available);
}
for(const [extra,reason] of [[{summon:{}},'召喚体'],[{isUndead:true},'アンデッド'],[{soulCollected:true},'回収済み'],[{deadExpireTurn:2},'期限']]){
  const check=m.inspectV39ResourceSoulRecovery({...state,enemies:[{...body,...extra}]},'p','a');
  assert(check.reason.includes(reason));assert.equal(check.excluded.length,1);
}
const passive={名前:'魂食い',行動:'P',攻撃手段:'牙',効果:'魂回収'};
const eater={...actor,race:'ウルフ',className:'ウルフ',techniques:[{source:passive}]};
assert(!m.canV39ManuallyRecoverSoul(eater));
assert(m.hasV39SoulRecoveryPassive(eater,{攻撃手段:'牙'}));
assert(!m.hasV39SoulRecoveryPassive(eater,{攻撃手段:'爪'}));
assert(m.canV39ManuallyRecoverSoul({...eater,techniques:[{source:{...passive,攻撃手段:''}}]}));
const before={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,units:[eater]}}],enemies:[{...body,hp:80,state:'生存'}]};
const after={...before,enemies:[body]};
const entry={targetId:'b',beforeHp:80,afterHp:0,friendly:false};
assert.equal(m.recoverV39AttackSouls(before,after,eater,{攻撃手段:'爪'},[entry]),after);
result=m.recoverV39AttackSouls(before,after,eater,{攻撃手段:'牙'},[entry,entry]);
assert.equal(m.resolveV39FactionUnitCargoStatus(result.players[0].factionState,'a',result).cargo.resourcesByType.魂,.3);
assert.equal(result.players[0].factionState.units[0].ap,100);
const recorded=m.recordV39CombatAchievements(before,after,eater,[entry],{skillRow:{攻撃手段:'牙'}});
assert.equal(recorded.players[0].factionState.units[0].achievements.kills,1);
assert.equal(m.resolveV39FactionUnitCargoStatus(recorded.players[0].factionState,'a',recorded).cargo.resourcesByType.魂,.3);
assert.equal(m.recoverV39AttackSouls(before,{...after,enemies:[{...body,hp:1}]},eater,{効果:'魂回収'},[entry]).enemies[0].soulCollected,undefined);
assert.equal(m.recoverV39AttackSouls(before,after,eater,{効果:'魂回収'},[{...entry,friendly:true}]),after);
assert(!m.isV39SupportSkill({名前:'魂の牙',攻撃手段:'牙',物理:100,効果:'魂回収'},eater));
assert(m.isV39SupportSkill({名前:'魂回収',攻撃手段:'魔法',効果:'魂回収'},eater));
// Hundredth-sized souls survive cargo, save/load and deposit without rounding into free souls.
let insects={...state,enemies:[{...body,race:'ビートル'}]};
insects=m.recoverV39ResourceSoul(insects,'p','a','b').state;
let cargo=m.resolveV39FactionUnitCargoStatus(insects.players[0].factionState,'a',insects);
assert.equal(cargo.load,.03);assert.equal(cargo.remaining,99.97);
assert.equal(m.fitV39CargoToCapacity(cargo.cargo,.02).accepted.resourcesByType.魂,.02);
insects.players[0].factionState.settlements=[{id:'home',settlementId:'home',placed:true,x:2,y:2,worldId:'surface',population:1,foodStockByType:{魂:0}}];
const deposited=m.depositV39FactionCargo(JSON.parse(JSON.stringify(insects)),'p','a');
assert.equal(deposited.reports.length,1);
const home=deposited.state.players[0].factionState.settlements[0];
assert.equal(home.foodStockByType.魂,0);assert.equal(home.soulRecoveryRemainderPoints,3);
assert.equal(m.depositV39FactionCargo(deposited.state,'p','a').reports.length,0);
let repeated=deposited.state;
for(let i=0;i<3;i++){
  repeated={...repeated,enemies:[{...body,id:`insect-${i}`,race:'ビートル'}],players:repeated.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100}))}}))};
  repeated=m.recoverV39ResourceSoul(repeated,'p','a',`insect-${i}`).state;
  repeated=m.depositV39FactionCargo(repeated,'p','a').state;
}
assert.equal(repeated.players[0].factionState.settlements[0].foodStockByType.魂,.1);
assert.equal(repeated.players[0].factionState.settlements[0].soulRecoveryRemainderPoints,2);
const full={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,squads:[{id:'solo',unitIds:['a'],cargoByUnitId:{a:{resourcesByType:{木材:99.98}}}}]}}]};
result=m.recoverV39ResourceSoul(full,'p','a','b');assert(result.ok);assert.equal(result.amount,.02);
assert.equal(result.state.enemies[0].soulResourceRecoveredPoints,2);
assert(!m.recoverV39ResourceSoul(result.state,'p','a','b').ok);
const cave='cave:legacy:1';
const batchState={...state,enemies:[body,{...body,id:'same-tile'},{...body,id:'next-tile',x:3,y:2}]};
let batch=m.inspectV39SoulRecoveryTiles(batchState,'p','a',['2,3','3,2']);
assert(batch.available);assert.equal(batch.apCost,40);assert.equal(batch.amount,.9);
assert.equal(batch.tiles.find(t=>t.key==='2,3').corpses.length,2);
let collected=m.recoverV39SoulTiles(batchState,'p','a',['2,3','2,3']);
assert(collected.ok);assert.equal(collected.apCost,20);assert.equal(collected.amount,.6);assert.equal(collected.state.players[0].factionState.units[0].ap,80);
assert(!collected.state.enemies.find(u=>u.id==='next-tile').soulCollected);
collected=m.recoverV39SoulTiles(batchState,'p','a',['2,3','3,2']);
assert(collected.ok);assert.equal(collected.state.players[0].factionState.units[0].ap,60);assert.equal(collected.amount,.9);
assert(!m.recoverV39SoulTiles(collected.state,'p','a',['2,3']).ok);
for(const keys of [[],['99,99'],['2,3','99,99']]){
  const failed=m.recoverV39SoulTiles(batchState,'p','a',keys);assert(!failed.ok);assert.equal(failed.state,batchState);
}
const shortAp={...batchState,players:[{...state.players[0],factionState:{...state.players[0].factionState,units:[{...actor,ap:30}]}}]};
assert(m.recoverV39SoulTiles(shortAp,'p','a',['2,3']).ok);
assert(!m.recoverV39SoulTiles(shortAp,'p','a',['2,3','3,2']).ok);
const shortCargo={...batchState,players:full.players};
const noSpace=m.recoverV39SoulTiles(shortCargo,'p','a',['2,3']);assert(!noSpace.ok);assert.equal(noSpace.state,shortCargo);
const worldsModule=await import(`data:text/javascript;base64,${Buffer.from(readFileSync('frontend/src/lib/v39-spatial-unit-worlds.js','utf8')).toString('base64')}`);
const worlds={surface:{spatial:{enemies:[{id:'s'}]}},[cave]:{spatial:{enemies:[{id:'c',worldId:null},{id:'explicit',worldId:'elsewhere'}],neutralVillages:[{defenseUnits:[{id:'guard'}]}]}}};
const migrated=worldsModule.normalizeV39SavedWorldUnitIds(worlds);
assert.equal(migrated.surface.spatial.enemies[0].worldId,'surface');assert.equal(migrated[cave].spatial.enemies[0].worldId,cave);
assert.equal(migrated[cave].spatial.enemies[1].worldId,'elsewhere');assert.equal(migrated[cave].spatial.neutralVillages[0].defenseUnits[0].worldId,cave);
assert.equal(worlds[cave].spatial.enemies[0].worldId,null,'migration is immutable');
const caveState={...state,activeWorldId:cave,players:[{...state.players[0],factionState:{...state.players[0].factionState,units:[{...actor,worldId:cave}]}}],enemies:[{...body,worldId:undefined}]};
assert(m.inspectV39ResourceSoulRecovery(caveState,'p','a').available,'legacy cave enemies inherit their containing world, not surface');
const repaired=m.recoverV39ResourceSoul(caveState,'p','a','b');assert(repaired.ok);assert.equal(repaired.state.enemies[0].worldId,cave);
if(process.argv[2]){
  const saved=JSON.parse(readFileSync(process.argv[2],'utf8')).gameState;
  const player=saved.players.find(p=>p.id===saved.activePlayerId),id=player.factionState.selectedUnitId;
  const check=m.inspectV39ResourceSoulRecovery(saved,player.id,id);
  assert(check.available,check.reason);assert.equal(check.corpses.length,2);
  const keys=[...new Set(check.corpses.map(u=>`${u.x},${u.y}`))];
  const multi=m.recoverV39SoulTiles(saved,player.id,id,keys);
  assert(multi.ok);assert.equal(multi.apCost,40);assert.equal(multi.amount,.06);
  assert.equal(multi.state.players.find(p=>p.id===player.id).factionState.units.find(u=>u.id===id).ap,60);
  const result=m.recoverV39ResourceSoul(saved,player.id,id,check.corpses[0].id);
  assert(result.ok);assert(result.amount>0);assert.equal(result.state.players.find(p=>p.id===player.id).factionState.units.find(u=>u.id===id).ap,80);
  assert(!m.inspectV39ResourceSoulRecovery(result.state,player.id,id).corpses.some(u=>u.id===check.corpses[0].id));
  console.log(`実セーブ再現: ${saved.activeWorldId} / 隣接2マス一括・魂${multi.amount}・AP100→60 / 単体互換・魂${result.amount}・AP100→80 OK（ファイルは変更しない）`);
}
console.log('魂回収: 種族/軍隊/牙条件/撃破/重複禁止/範囲/容量/小数保存/搬入 OK');
