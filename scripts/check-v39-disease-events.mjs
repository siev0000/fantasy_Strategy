import assert from 'node:assert/strict';
import {createServer} from 'vite';

const server=await createServer({configFile:false,root:'frontend',server:{middlewareMode:true},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
const originalWarn=console.warn;console.warn=()=>{};
try{
  globalThis.window={addEventListener(){}};
  const {advanceV39DiseaseConditions,applyV39DiseasePopulation}=await server.ssrLoadModule('/src/lib/v39-disease-events.js');
  const {computeAttackDamage}=await server.ssrLoadModule('/src/lib/v39-combat-engine.js');
  const {advanceV39Rebellions}=await server.ssrLoadModule('/src/lib/v39-rebellion-rules.js');
  const {applyNaturalEvents}=await server.ssrLoadModule('/src/v39/world/v39-natural-events.js');
  const {disasterData}=await server.ssrLoadModule('/src/lib/game-data-registry.js');
  const base={id:'city',settlementId:'city',name:'街',x:2,y:2,placed:true,worldId:'surface',
    territoryTileKeys:['2,2'],population:100,populationByRace:{只人:100},
    populationGrowthByRace:{只人:{starvationStage:1}},overcrowdingHappinessPenalty:-5};
  const state={activeWorldId:'surface',players:[{id:'p1',factionState:{settlements:[base]}}],neutralVillages:[],
    groundLootByTile:{},worldEnvironment:{lastDisasterEvents:[]}};
  const map={w:5,h:5,grid:Array.from({length:5},()=>Array(5).fill('平地'))};
  const first=advanceV39DiseaseConditions(state,map,[],1,{},()=>0);
  assert.equal(first.events.length,0);
  assert.equal(first.exposure['player:p1:city'].streak,1);
  const second=advanceV39DiseaseConditions(state,map,[],2,first.exposure,()=>0);
  assert.equal(second.events.length,1);
  assert.deepEqual(second.events[0].tileKeys,['2,2']);
  assert.equal(advanceV39DiseaseConditions(state,map,second.events,2,second.exposure,()=>0).events.length,0);
  const damage=applyV39DiseasePopulation(state,second.events,2);
  assert.equal(damage.players[0].factionState.settlements[0].population,99);
  assert.equal(damage.entries[0].damage,1);
  assert.equal(applyV39DiseasePopulation(state,[{...second.events[0],lastTickTurn:2}],2).entries.length,0);
  const recovered={...base,overcrowdingHappinessPenalty:0};
  const quiet={...state,players:[{...state.players[0],factionState:{settlements:[recovered]}}]};
  assert.equal(advanceV39DiseaseConditions(quiet,map,[],3,second.exposure,()=>0).exposure['player:p1:city'].streak,0);
  const corpseState={...quiet,groundLootByTile:{'2,3':{cargo:{resourcesByType:{死体:100}}}}};
  assert.equal(advanceV39DiseaseConditions(corpseState,map,[],1,{},()=>0).exposure['player:p1:city'].conditionCount,2);
  const miasma={disasterId:'瘴気',tileKeys:['2,2']};
  assert.equal(advanceV39DiseaseConditions(quiet,map,[miasma],1,{},()=>0).exposure['player:p1:city'].conditionCount,2);
  const attacker={id:'a',x:2,y:2,worldId:'surface',level:1,status:{攻撃:100,命中:100,Cr率:0,Cr威力:100},techniques:[]};
  const target={id:'b',x:3,y:2,worldId:'surface',level:1,hp:1000,maxHp:1000,status:{防御:0,速度:100}};
  const skillRow={名前:'攻撃',攻撃手段:'肉体',物理:100,全威力:100,判定:'攻撃'};
  globalThis.window={getV39GameState:()=>({...state,worldEnvironment:{activeDisasters:[]}})};
  const normal=computeAttackDamage({attacker,target,skillRow,random:()=>0}).detail;
  window.getV39GameState=()=>({...state,worldEnvironment:{activeDisasters:second.events}});
  const sick=computeAttackDamage({attacker,target,skillRow,random:()=>0}).detail;
  assert.equal(sick.power,normal.power*0.9);
  assert.equal(sick.accuracy,normal.accuracy*0.9);
  const defending=computeAttackDamage({attacker:{...attacker,x:3,y:2},target:{...target,x:2,y:2,status:{防御:100,速度:100}},skillRow,random:()=>0}).detail;
  assert.equal(defending.defense,90);
  assert.equal(defending.evasion,90);
  window.getV39GameState=undefined;
  const revoltBase={...base,civicState:{happiness:25,security:25,lastRebellionTurn:0}};
  const revoltState={...state,players:[{id:'p1',factionState:{units:[],settlements:[revoltBase]}}],enemies:[],enemySquads:[]};
  assert.equal(advanceV39Rebellions({...revoltState,players:[{...revoltState.players[0],
    factionState:{...revoltState.players[0].factionState,settlements:[{...revoltBase,civicState:{happiness:26,security:25}}]}}]},4).reports.length,0);
  assert.equal(advanceV39Rebellions({...revoltState,players:[{...revoltState.players[0],
    factionState:{...revoltState.players[0].factionState,settlements:[{...revoltBase,civicState:{happiness:25,security:26}}]}}]},4).reports.length,0);
  assert.equal(advanceV39Rebellions(revoltState,4).reports[0].population,10);
  const worldState={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,units:[]}}],
    enemies:[],enemySquads:[],settlements:[base],
    worldEnvironment:{activeDisasters:second.events,diseaseExposureBySettlementId:second.exposure,lastDisasterEvents:second.events}};
  const worldMap={...map,specialMap:[],heightLevelMap:Array.from({length:5},()=>Array(5).fill(0)),terrainDamage:{}};
  const worldTurn=applyNaturalEvents({state:worldState,mapData:worldMap,turn:2,skipNaturalDisasters:true});
  assert.equal(worldTurn.players[0].factionState.settlements[0].population,99);
  assert.equal(worldTurn.worldEnvironment.activeDisasters[0].lastTickTurn,2);
  const repeated=applyNaturalEvents({state:{...worldState,...worldTurn},mapData:worldMap,turn:2,skipNaturalDisasters:true});
  assert.equal(repeated.players[0].factionState.settlements[0].population,99);
  const epidemic=disasterData.find(row=>row.ID==='疫病');
  const rebelRule=disasterData.find(row=>row.ID==='反乱');
  const epidemicDetails=epidemic.災害詳細設定;
  const rebelDetails=rebelRule.災害詳細設定;
  try{
    epidemic.災害詳細設定={conditionEvent:{conditions:[{type:'foodShortage'}],minimumMatches:1,
      effects:[{type:'populationLoss',rate:0.02},{type:'combatMultiplier',multiplier:0.8}]}};
    const changed=advanceV39DiseaseConditions(state,map,[],1,{},()=>0);
    assert.equal(changed.exposure['player:p1:city'].conditionCount,1);
    disasterData.push({...epidemic,ID:'災害:追加条件テスト',表示名:'追加条件テスト',基本発生率:1,必要継続ターン:1,
      災害詳細設定:{conditionEvent:{conditions:[{type:'foodShortage'}],minimumMatches:1,
        effects:[{type:'combatMultiplier',multiplier:0.95}]}}});
    try{assert.equal(advanceV39DiseaseConditions(state,map,[],1,{},()=>0).events.some(event=>event.disasterId==='災害:追加条件テスト'),true);}
    finally{disasterData.pop();}
    const changedDamage=applyV39DiseasePopulation(state,second.events,2);
    assert.equal(changedDamage.entries[0].damage,2);
    window.getV39GameState=()=>({...state,worldEnvironment:{activeDisasters:second.events}});
    const changedCombat=computeAttackDamage({attacker,target,skillRow,random:()=>0}).detail;
    assert.equal(changedCombat.power,normal.power*0.8);
    rebelRule.災害詳細設定={conditionEvent:{conditions:[{type:'happinessAtMost',value:20}],minimumMatches:1,
      effects:[{type:'spawnRebels',populationRate:0.2}]}};
    assert.equal(advanceV39Rebellions(revoltState,4).reports.length,0);
    const lower={...revoltBase,civicState:{...revoltBase.civicState,happiness:20}};
    const lowerState={...revoltState,players:[{...revoltState.players[0],factionState:{...revoltState.players[0].factionState,settlements:[lower]}}]};
    assert.equal(advanceV39Rebellions(lowerState,4).reports[0].population,20);
  }finally{epidemic.災害詳細設定=epidemicDetails;rebelRule.災害詳細設定=rebelDetails;window.getV39GameState=undefined;}
  console.log('PASS: disease conditions, saved streak, one tick population loss, recovery');
}finally{console.warn=originalWarn;await server.close();}
