import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-automatic-quest-rewards.js';export * from './frontend/src/lib/v39-quest-rewards.js';export * from './frontend/src/lib/v39-neutral-village-rules.js';export * from './frontend/src/lib/v39-village-quest-log.js';export * from './frontend/src/lib/game-data-registry.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.window={addEventListener(){}};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const village={id:'v',name:'支援村',race:'只人',x:3,y:3,placed:true,population:10,populationByRace:{只人:10},territoryTileKeys:['3,3'],
  foodStockByType:{穀物:1000,野菜:1000,肉:1000,魚:1000},materialStockByType:{木材:1000,石材:1000,鉄:1000,金:1000},
  buildings:[],questsByPlayerId:{},questLogByPlayerId:{},relationsByPlayerId:{p:0}};
const quest={id:'q',eventId:'auto-test',type:'delivery',resourceKey:'野菜',stockKind:'food',required:12,progress:0,accepted:true,completed:false};
const rewards=m.resolveV39AutomaticQuestRewards(village,quest);
assert(rewards.some(row=>row.name==='金'));
assert(rewards.some(row=>row.name!=='金'));
assert(!rewards.some(row=>row.name==='野菜'),'never pay requested delivery resources back as rewards');
assert(rewards.reduce((sum,row)=>sum+row.amount,0)<=60);
assert(rewards.every(row=>Number.isSafeInteger(row.amount)&&row.amount>0));
const poor={...village,foodStockByType:{},materialStockByType:{}};
assert.deepEqual(m.resolveV39AutomaticQuestRewards(poor,quest),[],'no minted resources for poor villages');
const building={...village,foodStockByType:{},materialStockByType:{木材:35,金:10},planSchedule:{active:{facilityName:'農場'}}};
const limited=m.resolveV39AutomaticQuestRewards(building,{...quest,type:'construction',resourceKey:''});
assert(limited.every(row=>row.name==='木材'&&row.amount<=5),'protect next construction and gold reserve');
const bank={id:'home',settlementId:'home',placed:true,x:1,y:1,population:10,populationByRace:{只人:10},foodStockByType:{野菜:100},materialStockByType:{金:0},equipmentInventory:[]};
const player={id:'p',race:'只人',factionState:{settlements:[bank],selectedSettlementId:'home',units:[],research:{}}};
let state={activePlayerId:'p',activeWorldId:'surface',timeline:{turnNumber:1,phase:'player'},players:[player],neutralVillages:[village],settlements:[village],enemies:[],territoryOwnerByTile:{'3,3':'v'},territoryStateByTile:{}};
const offered=m.attachV39AutomaticQuestReward(village,quest),snapshot=JSON.stringify(village);
assert.deepEqual(m.getV39QuestRewardItems(offered),rewards);
const frozen=m.freezeV39QuestReward(state,village,'p',offered);
assert.equal(JSON.stringify(village),snapshot,'reserve uses immutable village copies');
assert.equal(frozen.quest.rewardEscrow.status,'held');
for(const item of rewards){const field=m.FOOD_RESOURCE_KEYS?.includes(item.name)?'foodStockByType':(Object.hasOwn(village.foodStockByType,item.name)?'foodStockByType':'materialStockByType');assert.equal(frozen.village[field][item.name],village[field][item.name]-item.amount);}
const accepted=m.syncV39VillageQuestLog({...frozen.village,questsByPlayerId:{p:frozen.quest}});
state={...state,neutralVillages:[accepted],settlements:[accepted]};
const saved=JSON.parse(JSON.stringify(state));
const completed=m.completeV39NeutralVillageQuest(saved,'p','v',{eventId:quest.eventId});
assert(completed.ok,completed.reason);
assert.equal(m.findV39VillageQuest(completed.village,'p',quest.eventId).rewardEscrow.status,'paid');
const received=completed.state.players[0].factionState.settlements[0];
for(const item of rewards){const field=Object.hasOwn(village.foodStockByType,item.name)?'foodStockByType':'materialStockByType';assert.equal(received[field][item.name]||0,(bank[field]?.[item.name]||0)+item.amount);}
assert.equal(received.foodStockByType.野菜,88);
assert(!m.completeV39NeutralVillageQuest(completed.state,'p','v',{eventId:quest.eventId}).ok,'cannot report twice');
const returned=m.releaseV39QuestReward(accepted,frozen.quest);
assert.equal(returned.quest.rewardEscrow.status,'returned');
for(const item of rewards){const field=Object.hasOwn(village.foodStockByType,item.name)?'foodStockByType':'materialStockByType';assert.equal(returned.village[field][item.name],village[field][item.name]);}
assert.equal(m.releaseV39QuestReward(returned.village,returned.quest).village,returned.village,'cannot return twice');
const emptyAfterAccept={...accepted,foodStockByType:{},materialStockByType:{}};
const heldState={...state,neutralVillages:[emptyAfterAccept],settlements:[emptyAfterAccept]};
const paid=m.payV39QuestReward(heldState,'p','v',frozen.quest.rewardTerms,{quest:frozen.quest});
assert(paid.ok,paid.reason);
assert(!m.payV39QuestReward(paid.state,'p','v',frozen.quest.rewardTerms,{quest:frozen.quest}).ok,'escrow can only be paid once');
const map={w:9,h:9,grid:Array.from({length:9},()=>Array(9).fill('平地')),specialMap:[],hazardZones:[]};
const live={...state,neutralVillages:[village],settlements:[village]};
const candidates=m.listV39NeutralVillageQuests(live,'p','v',map);
assert(candidates.length>0,'real automatic templates must be available');
assert(candidates.every(row=>Array.isArray(row.automaticRewardItems)));
const candidate=candidates.find(row=>row.automaticRewardItems.length>0);assert(candidate);
const acceptedLive=m.acceptV39NeutralVillageQuest(live,'p','v',map,candidate.eventId);
assert(acceptedLive.ok,acceptedLive.reason);assert.equal(acceptedLive.quest.rewardEscrow.status,'held');
const expiring={...acceptedLive.quest,deadlineTurn:2};
const expiredVillage=m.syncV39VillageQuestLog({...acceptedLive.village,questsByPlayerId:{p:expiring},lastProcessedTurn:0});
const expired=m.advanceV39NeutralVillages({...acceptedLive.state,neutralVillages:[expiredVillage]},null,2);
const record=m.findV39VillageQuest(expired.state.neutralVillages[0],'p',expiring.eventId);
assert(record.completed&&record.failed);assert.equal(record.rewardEscrow.status,'returned');
const relationEvent={完了効果:[{タイプ:'一般村友好度変更',設定:{値:10}}]};
const delivery={...quest,required:12,eventDefinition:relationEvent,automaticRewardItems:[]};
const contract={...delivery,id:'contract-q',eventId:'contract-relation',type:'contract',amountPerPeriod:12,required:3,progress:0,nextDueTurn:1,period:1,grace:0};
assert.equal(m.getV39QuestRelationReward(delivery),10);
assert.equal(m.getV39QuestRelationReward(contract),30,'three same-size deliveries earn three times relation');
assert.equal(m.getV39QuestRelationReward({...delivery,required:60}),30);
assert.equal(m.getV39QuestRelationReward({...delivery,type:'hunt',required:3}),30);
assert.equal(m.getV39QuestRelationReward({...delivery,type:'watch',required:6}),20);
assert.equal(m.getV39QuestRelationReward({...delivery,type:'composite',supportGoals:[{type:'watch',required:3},{type:'construction',required:1}]}),20);
assert.equal(m.getV39QuestRelationReward({...delivery,required:99999}),100);
assert.equal(m.getV39QuestRelationReward({...contract,automaticRewardItems:undefined}),10,'legacy scripted rewards unchanged');
const frozenRelation=m.freezeV39QuestReward(live,village,'p',contract).quest;
assert.equal(frozenRelation.relationReward,30);
assert.equal(m.getV39QuestRelationReward({...frozenRelation,amountPerPeriod:999}),30,'accepted relation reward is fixed');
const contractVillage=m.syncV39VillageQuestLog({...village,questsByPlayerId:{p:frozenRelation}});
let contractState={...live,neutralVillages:[contractVillage],settlements:[contractVillage]};
for(let turn=1;turn<=3;turn++){
  contractState={...contractState,timeline:{...contractState.timeline,turnNumber:turn}};
  const result=m.completeV39NeutralVillageQuest(contractState,'p','v',{eventId:contract.eventId});
  assert(result.ok,result.reason);contractState=result.state;
  assert.equal(m.getV39NeutralVillageRelation(contractState.neutralVillages[0],'p'),turn<3?0:30,'only pay relationship at full completion');
}
assert(!m.completeV39NeutralVillageQuest(contractState,'p','v',{eventId:contract.eventId}).ok);
console.log('PASS: affordable gold/material auto rewards, reserves/request exclusions, no minting, preview/freeze, escrow/stock conservation, save/restore, report once, refund once and payout after village spending. No browser.');
