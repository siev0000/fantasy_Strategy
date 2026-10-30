import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-unit-achievements.js';export * from './frontend/src/lib/v39-disaster-damage.js';export * from './frontend/src/lib/v39-exploration-rules.js';export * from './frontend/src/lib/player-state.js';export * from './frontend/src/v39/unit/v39-character-derived-rules.js';export * from './frontend/src/v39/unit/v39-unit-detail.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const unit={id:'a',name:'攻撃役',race:'只人',className:'ファイター',level:10,x:2,y:2,hp:100,maxHp:100};
const enemy={id:'e',level:10,hp:40},ally={id:'b',hp:40,maxHp:100};
const state={activeWorldId:'surface',players:[{id:'p',factionState:{units:[unit,ally]}}],enemies:[enemy],neutralVillages:[],settlements:[]};
const guardOptions={support:true,skillRow:{名前:'任意の名前',効果:'守護'},supportTargetIds:['a','b','b','e','missing']};
const guarded=m.recordV39CombatAchievements(state,state,unit,[],guardOptions);
assert.equal(guarded.players[0].factionState.units[0].achievements.protections,1,'count only actual other allied targets, once each');
for(const options of [
  {...guardOptions,supportTargetIds:['a']},
  {...guardOptions,supportTargetIds:[]},
  {...guardOptions,skillRow:{名前:'守護',効果:'盾'}},
  {...guardOptions,skillRow:{効果:'守護精神'}},
  {...guardOptions,support:false}
])assert.equal(m.recordV39CombatAchievements(state,state,unit,[],options).players[0].factionState.units[0].achievements.protections,undefined);
const secondAlly={id:'c',hp:100};
const groupGuardState={...state,players:[{...state.players[0],factionState:{units:[unit,ally,secondAlly]}}]};
assert.equal(m.recordV39CombatAchievements(groupGuardState,groupGuardState,unit,[],{...guardOptions,supportTargetIds:['a','b','c']}).players[0].factionState.units[0].achievements.protections,2);
const deadAllyState={...state,players:[{...state.players[0],factionState:{units:[unit,{...ally,hp:0}]}}]};
assert.equal(m.recordV39CombatAchievements(deadAllyState,deadAllyState,unit,[],guardOptions).players[0].factionState.units[0].achievements.protections,undefined);
const entry={targetId:'e',beforeHp:40,afterHp:0,friendly:false};
const assassination=m.recordV39CombatAchievements(state,state,unit,[],{skillRow:{名前:'技名には依存しない',系統:'暗殺'}});
assert.equal(assassination.players[0].factionState.units[0].achievements.assassinations,1,'count usage even on miss/no kill');
const fakeName=m.recordV39CombatAchievements(state,state,unit,[],{skillRow:{名前:'暗殺',系統:'剣'}});
assert.equal(fakeName.players[0].factionState.units[0].achievements.assassinations,undefined);
const criticalEntry={...entry,afterHp:20,hitResults:[{hit:true,critical:true},{hit:false,critical:true},{hit:true,critical:false}]};
const critRecord=m.recordV39CombatAchievements(state,state,unit,[criticalEntry]);
assert.equal(critRecord.players[0].factionState.units[0].achievements.criticals,1);
const after={...state,enemies:[{...enemy,hp:0}]};
const attack=m.recordV39CombatAchievements(state,after,unit,[entry,entry,{targetId:'wall',structureKind:'壁',beforeHp:10,afterHp:0}],{terrainReports:[{kind:'ground-broken',x:0,y:0}]});
const stats=attack.players[0].factionState.units[0].achievements;
assert.equal(stats.attacks,1);assert.equal(stats.kills,1);assert.equal(stats.strongKills,1);
assert.equal(stats.destructions,2);assert.equal(stats.walls,1);assert.equal(stats.terrain,1);
assert.equal(unit.achievements,undefined,'do not mutate input');
const missed=m.recordV39CombatAchievements(state,state,unit,[]);
assert.equal(missed.players[0].factionState.units[0].achievements.attacks,1);
assert.equal(missed.players[0].factionState.units[0].achievements.kills,undefined);
const healed={...state,players:[{...state.players[0],factionState:{units:[{...unit,hp:110},{...ally,hp:60}]}}]};
const recovery=m.recordV39CombatAchievements(state,healed,unit,[],{support:true});
assert.equal(recovery.players[0].factionState.units[0].achievements.heals,1,'exclude self recovery');
assert.equal(recovery.players[0].factionState.units[0].achievements.attacks,undefined,'support not attack');
const full=m.recordV39CombatAchievements(state,state,unit,[],{support:true});
assert.equal(full.players[0].factionState.units[0].achievements.heals,undefined);
const friendly=m.recordV39CombatAchievements(state,after,unit,[{...entry,friendly:true}]);
assert.equal(friendly.players[0].factionState.units[0].achievements.kills,undefined);
const collision=m.recordV39CombatAchievements(state,state,unit,[{targetId:'b',beforeHp:40,afterHp:0,friendly:false}]);
assert.equal(collision.players[0].factionState.units[0].achievements.kills,undefined,'own-unit collision is not a kill achievement');
const walk=m.applyV39DisasterMovementDamage(unit,[{x:2,y:2},{x:3,y:2},{x:4,y:2}],state);
assert.equal(walk.unit.achievements.distance,2);assert.equal(walk.path.length,2);
assert.equal(m.applyV39DisasterMovementDamage({...unit,hp:0},[{x:3,y:2}],state).unit.achievements,undefined);
const restored=m.createPlayerFactionState(JSON.parse(JSON.stringify(attack.players[0].factionState)),'p');
assert.deepEqual(restored.units[0].achievements,stats);
assert.deepEqual(m.applyV39DerivedCharacterData({...unit,achievements:stats}).achievements,stats);
const html=m.renderV39UnitAchievements(restored.units[0]);
assert(html.includes('撃破数')&&html.includes('移動距離')&&html.includes('未接続'));
const taskUnit={...unit,ap:100,surveyTask:{x:2,y:2,key:'2,2',tileKeys:['2,2'],progressAp:100,worldId:'surface'}};
const surveyState={...state,enemies:[],timeline:{turnNumber:2},players:[{id:'p',race:'只人',factionState:{units:[taskUnit],exploration:{surveyedTileKeys:[],lastProcessedTurn:0},activityLog:[]}}]};
const surveyed=m.advanceV39ExplorationTurn(surveyState,2);
assert.equal(surveyed.state.players[0].factionState.units[0].achievements.surveys,1);
const rerun=m.advanceV39ExplorationTurn(surveyed.state,2);
assert.equal(rerun.state.players[0].factionState.units[0].achievements.surveys,1);
const canceled=m.advanceV39ExplorationTurn({...surveyState,players:[{...surveyState.players[0],factionState:{...surveyState.players[0].factionState,units:[{...taskUnit,x:5}]}}]},2);
assert.equal(canceled.state.players[0].factionState.units[0].achievements,undefined);
console.log('PASS: actual combat records, range deduplication, support/self/full-HP rules, walk, survey completion/cancel/replay, persistence, shared renderer. No browser.');
