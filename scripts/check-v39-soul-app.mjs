import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-soul-app.js';export * from './frontend/src/lib/game-start-settings.js';export * from './frontend/src/lib/v39-soul-storage.js';export * from './frontend/src/lib/v39-village-sacrifice.js';export * from './frontend/src/lib/v39-quest-rewards.js';export * from './frontend/src/lib/player-state.js';export * from './frontend/src/composables/unitStatusUtils.js';`,resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const defaults={unitSoulAppDivisor:5,villageSoulAppDivisor:2,soulAppEvolutionRequirement:500};
assert.deepEqual(m.normalizeV39SoulAppSettings(),defaults);
assert.deepEqual(m.normalizeV39SoulAppSettings({unitSoulAppDivisor:0,villageSoulAppDivisor:Infinity,soulAppEvolutionRequirement:null}),{...defaults,unitSoulAppDivisor:1});
const {createRequire}=await import('node:module');
const backend=createRequire(import.meta.url)('../config/v39-soul-app-settings.cjs');
for(const value of [undefined,null,{},defaults,{unitSoulAppDivisor:'10',villageSoulAppDivisor:-1,soulAppEvolutionRequirement:NaN}]){
  assert.deepEqual(m.normalizeV39SoulAppSettings(value),backend.normalizeSoulAppSettings(value));
}
assert.equal(m.normalizeGameStartSettings({unitSoulAppDivisor:10}).unitSoulAppDivisor,10);
for(const app of [100,-100,1,-1,0])assert.equal(m.resolveV39UnitSoulApp({status:{APP:app}}),app/5);
assert.equal(m.resolveV39UnitSoulApp({status:{APP:-101}},{unitSoulAppDivisor:10}),-10.1);
assert.deepEqual(m.rowStatusVector({APP:-75,攻撃:-75},{statusGrowthFields:['APP','攻撃'],statusGrowthDivisor:5}),{APP:-15,攻撃:0});
const growth=m.buildCharacterStatusFromRules({raceRow:{APP:-75},classRow:{APP:0},level:10,raceLevels:5,classLevels:5,statusGrowthFields:['APP'],statusGrowthDivisor:5});
assert(growth.status.APP<0);
const village={id:'v',name:'契約村',x:5,y:4,neutral:true,population:20,populationByRace:{只人:20},relationsByPlayerId:{p:80},sacrificeContract:{active:true,playerId:'p'}};
assert.equal(m.resolveV39VillageSoulApp({id:'p',race:'天使'},village),40);
assert.equal(m.resolveV39VillageSoulApp({id:'p',race:'悪魔'},village),-40);
assert.equal(m.resolveV39VillageSoulApp({id:'p',race:'悪魔'},{...village,relationsByPlayerId:{p:-80}}),0);
assert.equal(m.resolveV39VillageSoulApp({id:'p',race:'只人'},village),0);
assert.deepEqual(m.addV39SoulApp({},[20,-30,5,-1]).soulAppTotals,{positive:25,negative:31});
const actor={id:'actor',name:'受取役',race:'デヴィル',x:4,y:4,worldId:'surface',squadId:'solo',hp:100,ap:100};
const bank={id:'bank',settlementId:'bank',placed:true,name:'拠点',x:2,y:2,population:10,populationByRace:{悪魔:10},foodStockByType:{魂:0}};
const player={id:'p',race:'悪魔',factionState:{units:[actor],squads:[{id:'solo',unitIds:['actor']}],settlements:[bank],selectedSettlementId:'bank'}};
const donor={id:'donor',name:'生贄',race:'只人',hp:1,state:'拘束',status:{APP:-100},equipment:[]};
const state={activeWorldId:'surface',activePlayerId:'p',timeline:{turnNumber:2,phase:'player'},gameSettings:defaults,players:[player],neutralVillages:[{...village,heldUnits:[{kind:'captive',ownerPlayerId:'other',unit:donor}]}],settlements:[village]};
const received=m.receiveV39VillageSacrifice(state,'p','v');
assert(received.ok,received.reason);
assert.deepEqual(received.state.players[0].factionState.soulAppTotals,{positive:0,negative:20});
assert.equal(received.soulAmount,1,'ordinary soul count unchanged');
assert.equal(m.receiveV39VillageSacrifice(received.state,'p','v').ok,false,'no repeated credit');
const paid=m.payV39QuestReward(state,'p','v',{kind:'population',name:'只人',amount:2});
assert(paid.ok,paid.reason);
assert.deepEqual(paid.state.players[0].factionState.soulAppTotals,{positive:0,negative:80});
const restored=m.createPlayerFactionState(JSON.parse(JSON.stringify(received.state.players[0].factionState)),'p');
assert.deepEqual(restored.soulAppTotals,{positive:0,negative:20});
const corpse={id:'dead',name:'死体',race:'只人',className:'ファイター',level:10,state:'死亡',hp:0,x:2,y:2,status:{APP:100},equipment:[]};
const collectionState={...state,enemies:[corpse],facilitiesByTile:{'2,3':['魂の保管庫']},territoryOwnerByTile:{'2,3':'p'}};
const collected=m.collectV39Soul(collectionState,'p',{x:2,y:2});
assert(collected.ok,collected.reason);
assert.equal(collected.soul.soulApp,20);
assert.deepEqual(collected.state.players[0].factionState.soulAppTotals,{positive:20,negative:0});
assert.equal(m.collectV39Soul(collected.state,'p',{x:2,y:2}).ok,false);
const changed=m.collectV39Soul({...collectionState,gameSettings:{...defaults,unitSoulAppDivisor:10}},'p',{x:2,y:2});
assert.equal(changed.soul.soulApp,10);
assert.deepEqual(collectionState.players[0].factionState,player.factionState,'input state not mutated');
console.log('Soul APP: divisors, signed growth, separate totals, population reward, unit conversion, corpse collection, duplicate guards and faction persistence passed.');
