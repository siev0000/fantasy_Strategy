import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/v39/core/v39-initial-sovereign.js';export * from './frontend/src/lib/v39-unit-experience.js';export * from './frontend/src/composables/militaryUnitUtils.js';export * from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.document={addEventListener(){}};globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
let checked=0;
for(const race of m.raceData){
  const hero=m.getV39InitialSovereignClassCandidates(race.key)[0],armies=m.getV39InitialArmyClassCandidates(race.key);if(!hero||!armies.length)continue;
  const armyClass=armies.find(row=>row.名前!==hero.名前)||armies[0];
  const profile={playerId:'p',race:race.key,className:hero.名前,armyClassName:armyClass.名前,characterName:'主人公',villageName:'初期村'};
  const state={players:[{id:'p',race:race.key,isPlayer:true,factionState:{units:[],materialStockByType:{木材:123}}}]};
  const result=m.applyV39InitialSovereignProfile(state,profile);assert(result.ok,`${race.key}: ${result.reason}`);
  const units=result.state.players[0].factionState.units;assert.equal(units.length,2);assert(units[0].isSovereign);assert(!units[1].isSovereign);
  assert.equal(units[1].className,armyClass.名前);assert.equal(units[1].combatProfile.mode,'army');assert.equal(units[1].combatProfile.memberCount,m.resolveUnitCreateMode('army',1).memberCount);
  assert.equal(units[1].level,m.resolveV39UnitInitialLevel(race.key,true));assert(units[1].isMob&&!units[1].isNamed);assert(units[1].hp>0&&units[1].hp===units[1].maxHp);assert.equal(units[1].ap,100);
  assert.equal(units[1].x,null);assert.equal(units[1].y,null);assert.equal(units[1].initialSettlementSlot,0);assert.equal(units[0].initialSettlementSlot,0);
  assert.equal(result.state.players[0].factionState.unitTrainingQueue.length,0);assert.equal(result.state.players[0].factionState.materialStockByType.木材,123);assert.equal(state.players[0].factionState.units.length,0);
  assert(!m.applyV39InitialSovereignProfile(result.state,profile).ok,'setup replay cannot duplicate units');
  const invalid=m.applyV39InitialSovereignProfile(state,{...profile,armyClassName:'invalid'});assert(!invalid.ok);assert.equal(invalid.state,state,'invalid army leaves no partial hero');
  const npc=m.applyV39InitialSovereignProfile({...state,players:[{...state.players[0],isPlayer:false}]},profile);assert(npc.ok);assert.equal(npc.state.players[0].factionState.units.length,1,'NPC existing dedicated initial-army grant remains independent');
  const restored=JSON.parse(JSON.stringify(result.state));assert.equal(restored.players[0].factionState.units[1].combatProfile.mode,'army');
  checked++;
}
assert(checked>3);
const flow=readFileSync('frontend/src/v39/ui/V39InitialSovereignFlow.vue','utf8');
const confirmClassSource=flow.slice(flow.indexOf('function confirmClass('),flow.indexOf('function applyProfileToCurrentState('));
const finishSource=flow.slice(flow.indexOf('function confirmName('),flow.indexOf('function consumePendingProfile('));
const refs={selectedClass:{value:'ファイター'},selectedArmyClass:{value:''},selectedCharacterName:{value:''},selectedVillageName:{value:''},selectedRace:{value:'只人'},setupTarget:{value:{playerId:'p',beforeMap:true,playMode:'single-normal'}},visibleStep:{value:'name'}};
const events=[],win={dispatchEvent:e=>events.push(e),openFieldSettingsModal(){}};
const api=new Function('window','refs','CustomEvent',`const {selectedClass,selectedArmyClass,selectedCharacterName,selectedVillageName,selectedRace,setupTarget,visibleStep}=refs;const isV39RacePlayable=()=>true,closeAll=()=>{visibleStep.value='';};${confirmClassSource};${finishSource};return {confirmName,confirmClass};`)(win,refs,class{constructor(type,detail){Object.assign(this,{type,...detail});}});
api.confirmName({characterName:'主人公',villageName:'初期村'});assert.equal(refs.visibleStep.value,'army');assert.equal(events.length,0,'hero setup waits for army selection');
api.confirmClass({className:'ウィザード'});assert.equal(win.__v39PendingInitialSovereignProfile.className,'ファイター');assert.equal(win.__v39PendingInitialSovereignProfile.armyClassName,'ウィザード');assert.equal(events.length,1);
assert(readFileSync('frontend/src/v39/core/v39-multiplayer-lobby.js','utf8').includes('armyClassName:text(detail.armyClassName)'));
assert(readFileSync('server.js','utf8').includes('armyClassName:String(payload?.armyClassName'));
console.log(`PASS: ${checked} playable races start hero + real army, army levels/profile/HP/AP, no charge/training, invalid/replay/NPC guards, save and actual two-step profile flow. No browser.`);
