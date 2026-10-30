import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(error.message);process.exit(1);});
const bundle=await build({stdin:{contents:`export * from './frontend/src/lib/v39-construction-plan-preview.js';export * from './frontend/src/lib/v39-exploration-rules.js';export * from './frontend/src/lib/v39-economy-rules.js';export * from './frontend/src/lib/v39-resource-delta-view.js';export * from './frontend/src/lib/v39-settlement-resource-flow.js';export * from './frontend/src/lib/v39-operation-phases.js';export * from './frontend/src/v39/ui/v39-turn-phase-display.js';export * from './frontend/src/v39/world/v39-operation-plan-ui.js';export * from './frontend/src/lib/v39-operation-plans.js';export * from './frontend/src/lib/v39-land-expansion-rules.js';`,resolveDir:process.cwd()},bundle:true,loader:{'.css':'empty'},write:false,format:'esm',platform:'node',plugins:[{name:'data',setup(builder){
  builder.onLoad({filter:/game-data-registry\.js$/},args=>{
    const dir=resolve('data/source/export/json'),modules=Object.fromEntries(readdirSync(dir).filter(name=>name.endsWith('.json')).map(name=>[`../../../data/source/export/json/${name}`,JSON.parse(readFileSync(`${dir}/${name}`,'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,`${JSON.stringify(modules)};`),resolveDir:dirname(args.path),loader:'js'};
  });
  builder.onLoad({filter:/(?:icon-library|facility-icon-artwork|map-entity-artwork|monster-sheet-artwork|unit-sheet-artwork)\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/g,'{};'),resolveDir:dirname(args.path),loader:'js'}));
}}]});
globalThis.document={addEventListener(){}};globalThis.window={};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);}finally{console.warn=warn;}
const map={w:10,h:10,worldWrapEnabled:false,grid:Array.from({length:10},()=>Array(10).fill('森')),heightLevelMap:Array.from({length:10},()=>Array(10).fill(0)),defenseStructures:[]};
// Initial surveying never spends actions or reveals another player's territory.
const surveyInput={activePlayerId:'p',activeWorldId:'surface',timeline:{turnNumber:1},territoryOwnerByTile:{'1,1':'p','2,1':'p','3,1':'q'},
  specialtiesByTile:{'1,1':{name:'test-visible'},'2,1':{name:'test-hidden',隠密:50}},
  players:[{id:'p',factionState:{units:[{id:'u',ap:70,experience:123}],exploration:{surveyedTileKeys:['0,0']}}},{id:'q',factionState:{exploration:{surveyedTileKeys:[]}}}]};
const surveyed=m.surveyV39InitialTerritory(surveyInput,'p',['1,1','2,1','3,1'],map);
const initialExploration=surveyed.players[0].factionState.exploration;
assert.deepEqual(initialExploration.surveyedTileKeys,['0,0','1,1','2,1']);
assert(initialExploration.discoveredSpecialtiesByTile['1,1'].discoveredByInitialTerritory);
assert(!initialExploration.discoveredSpecialtiesByTile['2,1'],'hidden sites still require detection');
assert.equal(surveyed.players[1],surveyInput.players[1]);
assert.equal(surveyed.players[0].factionState.units,surveyInput.players[0].factionState.units);
assert.deepEqual(surveyInput.players[0].factionState.exploration.surveyedTileKeys,['0,0'],'input is immutable');
assert.deepEqual(m.surveyV39InitialTerritory(surveyed,'p',['1,1'],map).players[0].factionState.exploration,initialExploration,'repeated survey adds no duplicates or rewards');
assert.equal(m.surveyV39InitialTerritory({...surveyInput,activeWorldId:'cave'},'p',['1,1'],map).players,surveyInput.players);
const previewBase={id:'ghost',settlementId:'ghost',placed:true,x:1,y:1,operationPlans:[
  {id:'a',kind:'construction',facilityName:'農場',tile:{x:1,y:1}},
  {id:'b',kind:'construction',facilityName:'市場',tile:{x:1,y:1}},
  {id:'c',kind:'expansion',tile:{x:2,y:1}},
  {id:'d',kind:'wall',facilityName:'防壁',tile:{x:1,y:1},edges:[{tileKey:'1,1',direction:0}]},
  {id:'e',kind:'development',facilityName:'都市',tile:{x:2,y:2}}]};
const previewState={activePlayerId:'p',players:[{id:'p',factionState:{settlements:[previewBase,{...previewBase,settlementId:'cave',worldId:'cave'}]}},{id:'q',factionState:{settlements:[previewBase]}}]};
const ghosts=m.getV39ConstructionPlanPreviews(previewState);
assert.deepEqual(ghosts.map(row=>row.id),['a','d','e'],'only own current-world plans, one building per tile, no expansion ghosts');
assert(ghosts.every(row=>row.planned));assert.equal(ghosts[2].settlementType,'都市');
assert.equal(m.getV39ConstructionPlanPreviews({...previewState,players:[{id:'p',factionState:{settlements:[{...previewBase,operationPlans:[]}]}}]}).length,0,'cancelled/started plans leave no ghosts');
const constructionSource=readFileSync('frontend/src/v39/world/v39-land-construction-ui.js','utf8');
assert(constructionSource.indexOf('<dt>工期</dt>')<constructionSource.indexOf('<dt>必要素材</dt>'));
assert(constructionSource.indexOf('<dt>必要素材</dt>')<constructionSource.indexOf('<dt>維持費</dt>'));
console.log('PASS: initial owned survey without AP/EXP, hidden-site guard, idempotence, scoped construction ghosts and material row placement. No browser.');
const markerSource=readFileSync('frontend/src/v39/map/v39-map-entities.js','utf8');
const renderGhostSource=markerSource.slice(markerSource.indexOf('function renderConstructionPreview(){'),markerSource.indexOf('function drawConstructionGhost('));
let previewCurrent=null,previewRenderState=previewState;const containers=[],drawn=[];
const previewScene={add:{container(){const c={scene:previewScene,children:[],setDepth(v){this.depth=v;return this;},setName(v){this.name=v;return this;},setAlpha(v){this.alpha=v;return this;},add(child){this.children.push(child);},destroy(){this.destroyed=true;}};containers.push(c);return c;}}};
const renderGhosts=new Function('activeScene','gameState','window','getV39ConstructionPlanPreviews','drawConstructionGhost',`let constructionPreviewContainer=null,constructionPreviewSignature='',markerArtworkVersion=0;const STRUCTURE_LAYER_DEPTH=3;${renderGhostSource};return renderConstructionPreview;`)(()=>previewScene,()=>previewRenderState,{getV39LandConstructionPreview:()=>previewCurrent},m.getV39ConstructionPlanPreviews,(...args)=>drawn.push(args));
renderGhosts();assert.equal(drawn.length,3);assert(containers.slice(1).every(row=>row.alpha===0.4));assert.equal(containers[0].depth,4);
previewCurrent={tileKey:'1,1',facilityName:'農場'};renderGhosts();assert.equal(drawn.length,3,'selected matching ghost is not duplicated');
previewRenderState={...previewState,players:[]};previewCurrent=null;renderGhosts();assert(containers[0].destroyed,'all preview objects removed when reservations disappear');
console.log('PASS: actual preview renderer uses 40% opacity, avoids duplicate selected ghosts, and removes cancelled preview objects. Mock scene, no browser.');
const keys=['3,3','4,3','3,4','2,3','2,2','3,2','2,4'];
const base=m.normalizeV39Village({id:'b',settlementId:'b',name:'計画拠点',race:'只人',placed:true,x:3,y:3,population:30,populationByRace:{只人:30},populationCapacity:60,cityLevels:{経済Lv:1,信仰Lv:1},materialStockByType:{木材:20},foodStockByType:{穀物:100},territoryTileKeys:keys,territoryTileModeMap:Object.fromEntries(keys.map(key=>[key,'resource']))});
let state={activePlayerId:'p',activeWorldId:'surface',gameSettings:{turnProgressionMode:'phased',maxCombatTurnsPerWorldTurn:5},timeline:{phase:'player',turnNumber:1},players:[{id:'p',race:'只人',factionState:{selectedSettlementId:'b',settlements:[base],units:[],research:{}}}],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:Object.fromEntries(keys.map(key=>[key,{settlementId:'b',hp:100,maxHp:100}])),enemies:[],enemyNests:[],neutralVillages:[],settlements:[],facilitiesByTile:{}};
assert(m.isV39TerritoryPhase(state));assert(!m.canV39UseExpeditionActions(state));
let done=m.finishV39TerritoryPlanning(state);assert(done.ok);assert.equal(done.state.timeline.turnNumber,1);assert.equal(done.state.timeline.operationPhase,'expedition');
let cycle=done.state;
for(let i=1;i<=5;i++){
 cycle={...cycle,timeline:{...cycle.timeline,...m.advanceV39OperationCycle(cycle)}};
 assert.equal(cycle.timeline.operationPhase,i===5?'territory':'expedition');
}
assert.equal(m.normalizeV39OperationTimeline(JSON.parse(JSON.stringify(cycle.timeline))).operationPhase,'territory');
const multi={...state,players:[...state.players,{id:'q',isPlayer:true,factionState:{units:[],settlements:[]}},{id:'npc',isPlayer:false,factionState:{}}]};
const first=m.finishV39TerritoryPlanning(multi);assert.equal(first.state.activePlayerId,'q');assert(m.isV39TerritoryPhase(first.state));
const second=m.finishV39TerritoryPlanning(first.state);assert.equal(second.state.activePlayerId,'p');assert(!m.isV39TerritoryPhase(second.state));
assert(!m.isV39TerritoryPhase({...state,gameSettings:{turnProgressionMode:'standard'}}));
const reserve=(s,input)=>{const r=m.queueV39OperationPlan(s,'p','b',input);assert(r.ok,r.reason);return r.state;};
state=reserve(state,{kind:'construction',facilityName:'市場',tile:{x:4,y:3}});
state=reserve(state,{kind:'construction',facilityName:'伐採場',tile:{x:3,y:4}});
assert.equal(state.players[0].factionState.settlements[0].materialStockByType.木材,20,'reserving never charges resources');
assert(!m.queueV39OperationPlan({...state,timeline:{...state.timeline,operationPhase:'expedition'}},'p','b',{kind:'expansion',tile:{x:0,y:0}}).ok);
assert(!m.queueV39OperationPlan(state,'p','b',{kind:'construction',facilityName:'市場',tile:{x:4,y:3}}).ok,'no duplicate plans');
const deps={construction:m.startV39Construction,expansion:m.startV39LandExpansion,wall:m.startV39WallConstruction};
let executed=m.advanceV39OperationPlans(state,map,deps),b=executed.players[0].factionState.settlements[0];
assert.equal(b.operationPlans.length,1,JSON.stringify(b.operationPlans));assert.equal(b.operationPlans[0].facilityName,'市場');assert(b.operationPlans[0].reason.includes('資材不足'));
assert(b.constructionQueue.some(row=>row.facilityName==='伐採場'),'later affordable plan starts despite blocked first item');assert.equal(b.materialStockByType.木材,0);
assert.equal(m.advanceV39OperationPlans(executed,map,deps),executed,'same turn is idempotent');
b={...b,materialStockByType:{...b.materialStockByType,木材:50,石材:50,鉄:50}};
executed={...executed,timeline:{...executed.timeline,turnNumber:2},players:[{...executed.players[0],factionState:{...executed.players[0].factionState,settlements:[b]}}]};
executed=m.advanceV39OperationPlans(executed,map,deps);b=executed.players[0].factionState.settlements[0];assert.equal(b.operationPlans.length,0);assert.equal(b.operationPlanHistory.length,2);assert.equal(b.materialStockByType.鉄,0);
// Real economy: income arrives before the queued facility checks its materials.
let incomeState={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[{...base,materialStockByType:{木材:19},operationPlans:[{id:'income',kind:'construction',facilityName:'伐採場',tile:{x:3,y:4},notBeforeTurn:1}]}]}}]};
const advanced=m.advanceV39EconomyTurn(incomeState,map).state.players[0].factionState.settlements[0];
assert(advanced.operationPlanHistory?.some(row=>row.id==='income'),JSON.stringify(advanced.operationPlans));
assert(advanced.constructionQueue.some(row=>row.facilityName==='伐採場'));
// Start dates and queue editing remain data, including through JSON save/load.
let delayed=reserve({...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[base]}}]},{kind:'construction',facilityName:'伐採場',tile:{x:3,y:4},notBeforeTurn:10});
const id=delayed.players[0].factionState.settlements[0].operationPlans[0].id;
assert.equal(m.advanceV39OperationPlans(delayed,map,deps).players[0].factionState.settlements[0].constructionQueue.length,0);
delayed=m.editV39OperationPlan(delayed,'p','b',id,'turn',4).state;
assert.equal(JSON.parse(JSON.stringify(delayed)).players[0].factionState.settlements[0].operationPlans[0].notBeforeTurn,4);
assert.equal(m.editV39OperationPlan(delayed,'p','b',id,'cancel').state.players[0].factionState.settlements[0].operationPlans.length,0);
let expand={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[base]}}]};
const a=m.getV39LandExpansionCandidates(expand,'p','b',map)[0];expand=reserve(expand,{kind:'expansion',tile:a});
const projected=m.projectV39OperationTerritory(expand,'p',expand.players[0].factionState.settlements[0]);
assert(!expand.territoryOwnerByTile[`${a.x},${a.y}`]);assert.equal(projected.territoryOwnerByTile[`${a.x},${a.y}`],'p');
expand=reserve(expand,{kind:'construction',facilityName:'伐採場',tile:a});
assert(m.advanceV39OperationPlans(expand,map,deps).players[0].factionState.settlements[0].operationPlans.some(plan=>plan.kind==='construction'&&plan.reason.includes('自領ではない')));
console.log('PASS: 5T phases, multiplayer readiness, reservations without charge, bypassing shortages, future dates/edit/cancel, actual post-income start, idempotence, JSON persistence and projected expansion. No browser.');
// Exercise the actual turn router with presentation/world services stubbed, not a browser.
const turnSource=readFileSync('frontend/src/v39/core/v39-turn-system.js','utf8');
const imports=[...turnSource.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"][^'"]+['"];?/g)];
const names=[...new Set(imports.flatMap(match=>match[1].split(',').map(name=>name.trim())))];
const services=Object.fromEntries(names.map(name=>[name,()=>undefined]));
Object.assign(services,m,{
 V39_TURN_PHASE:{PLAYER:'player',ENEMY:'enemy',RESOLUTION:'resolution'},
 normalizeV39PlayerTurnTimeline:(value,players,fallback)=>({playerTurnOrder:players.map(player=>player.id),activeTurnPlayerId:value.activeTurnPlayerId||fallback||players[0]?.id||'',endedPlayerIds:value.endedPlayerIds||[]}),
 withV39WorldContext:async(id,fn)=>fn(),v39TurnWorldIds:()=>['surface'],
 advanceV39RecruitInstructorMovement:state=>({state,reports:[]}),advanceV39AutomaticTransport:state=>({state,reports:[]}),advanceV39TradeLogistics:state=>({state,reports:[]}),
 advanceV39RecruitTraining:state=>({state,completedUnits:[]}),advanceV39Teleports:state=>state,advanceV39ExpeditionTools:state=>state,advanceV39ToolProduction:state=>state,
 restoreV39SquadMovementForTurn:faction=>faction,paintV39TurnLoading:async()=>{},showV39TurnLoading:()=>{},showV39SideNotice:()=>{}
});
let routed={...state,timeline:{turnNumber:1,phase:'player',operationPhase:'territory'},players:[{...state.players[0],factionState:{...state.players[0].factionState,units:[]}}]};
let stages=0,territoryOpens=0;
globalThis.document={getElementById:()=>null,querySelector:()=>null,addEventListener(){}};
globalThis.CustomEvent=class{constructor(type,options){this.type=type;this.detail=options?.detail;}};
Object.assign(window,{getV39GameState:()=>routed,getV39TimelineState:()=>routed.timeline,getV39GameSettings:()=>routed.gameSettings,openV39TerritoryManagement:()=>territoryOpens++,
 setV39GameState:patch=>{routed={...routed,...patch};},isV39TestMode:()=>true,__v39FieldRuntime:{mapData:map},
 confirmV39TerritoryPhaseEnd:async()=>true,getV39DisplaySettings:()=>({focusUnactedUnits:false}),addEventListener(){},dispatchEvent:event=>{if(event.type==='v39:turn-stage-economy')stages++;}
});
const runnable=turnSource.replace(/import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];?/g,'').replace(/export /g,'').replace(/installUi\(\);\s*$/,'');
const router=new Function(...names,`${runnable}\nreturn Object.assign(advanceTurn,{renderControls});`)(...names.map(name=>services[name]));
router.renderControls();await Promise.resolve();assert.equal(territoryOpens,1,'territory entry opens settlement overview');
window.confirmV39TerritoryPhaseEnd=async()=>false;assert.equal(await router({presentation:false}),false);assert.equal(routed.timeline.operationPhase,'territory');assert.equal(stages,0);window.confirmV39TerritoryPhaseEnd=async()=>true;
assert(await router({presentation:false}));assert.equal(routed.timeline.turnNumber,1);assert.equal(stages,0,'planning confirmation must not run the economy');
for(let i=0;i<5;i++)assert(await router({presentation:false}));
assert.equal(routed.timeline.turnNumber,6);assert.equal(routed.timeline.operationPhase,'territory');assert.equal(stages,5);
assert(await router({presentation:false}));assert.equal(routed.timeline.turnNumber,6);assert.equal(routed.timeline.operationPhase,'expedition');
console.log('PASS: actual turn-router confirmation and five-turn return with mocked world/presentation services. No browser.');
let ordered=reserve({...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[base]}}]},{kind:'construction',facilityName:'市場',tile:{x:4,y:3}});
ordered=reserve(ordered,{kind:'construction',facilityName:'伐採場',tile:{x:3,y:4}});
const later=ordered.players[0].factionState.settlements[0].operationPlans[1].id;
ordered=m.editV39OperationPlan(ordered,'p','b',later,'up').state;
assert.equal(ordered.players[0].factionState.settlements[0].operationPlans[0].id,later);
ordered=m.editV39OperationPlan(ordered,'p','b',later,'down').state;
assert.equal(ordered.players[0].factionState.settlements[0].operationPlans[1].id,later);
const developmentState=reserve({...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[base]}}]},{kind:'development',facilityName:'町',tile:{x:3,y:3},residentialTileKeys:['3,3']});
let developmentArgs;
m.advanceV39OperationPlans(developmentState,map,{...deps,development:(...args)=>{developmentArgs=args;return {ok:false,state:args[0],reason:'人口不足'};}});
assert.equal(developmentArgs[2],'b');assert.deepEqual(developmentArgs[3].residentialTileKeys,['3,3']);
assert(!m.editV39OperationPlan({...ordered,timeline:{...ordered.timeline,operationPhase:'expedition'}},'p','b',later,'cancel').ok);
const bridge=readFileSync('frontend/src/v39/core/v39-game-state-bridge.js','utf8');
assert(bridge.includes('...normalizeV39OperationTimeline(input?.timeline)'));assert(bridge.includes('...normalizeV39OperationTimeline(source)'));
console.log('PASS: reorder, development dispatch, expedition edit restrictions, and game-state timeline preservation integration.');
const planHtml=m.renderV39OperationPlans(ordered,ordered.players[0],ordered.players[0].factionState.settlements[0]);
assert(planHtml.includes('data-plans-confirm'));assert(planHtml.includes('data-plan-action="up"'));assert(planHtml.includes('data-plan-turn'));
const readOnly=m.renderV39OperationPlans({...ordered,timeline:{...ordered.timeline,operationPhase:'expedition'}},ordered.players[0],ordered.players[0].factionState.settlements[0]);
assert(!readOnly.includes('data-plan-action='));assert(!readOnly.includes('data-plans-confirm'));assert(readOnly.includes(' disabled'));
const standard={...ordered,gameSettings:{turnProgressionMode:'standard'}};
assert.equal(m.advanceV39OperationPlans(standard,map,deps),standard,'standard mode does not execute stored phased plans');
let shortCycle={...done.state,gameSettings:{turnProgressionMode:'phased',maxCombatTurnsPerWorldTurn:2}};
shortCycle={...shortCycle,timeline:{...shortCycle.timeline,...m.advanceV39OperationCycle(shortCycle)}};assert(!m.isV39TerritoryPhase(shortCycle));
shortCycle={...shortCycle,timeline:{...shortCycle.timeline,...m.advanceV39OperationCycle(shortCycle)}};assert(m.isV39TerritoryPhase(shortCycle));
console.log('PASS: editable/read-only plan markup, standard-mode isolation and configured two-turn cycle.');
assert.deepEqual(m.resolveV39TurnPhaseDisplay({turnProgressionMode:'phased',maxCombatTurnsPerWorldTurn:5},{turnNumber:1,operationPhase:'territory'}).count,0);
assert.equal(m.resolveV39TurnPhaseDisplay({turnProgressionMode:'phased',maxCombatTurnsPerWorldTurn:5},{turnNumber:3,operationPhase:'expedition',expeditionTurns:2}).count,3);
assert.equal(m.resolveV39TurnPhaseDisplay({turnProgressionMode:'phased',maxCombatTurnsPerWorldTurn:5},{turnNumber:5,operationPhase:'expedition',expeditionTurns:4}).count,5);
const elements=new Map(['v39-turn-label','v39-turn-phase-count','v39-turn-toggle','v39-turn-next','v39-operation-phase-banner'].map(id=>[id,{dataset:{},hidden:false,textContent:'',attributes:{},classList:{remove(){},add(){}},setAttribute(key,value){this.attributes[key]=value;}}]));
const oldTimeout=globalThis.setTimeout,oldClear=globalThis.clearTimeout,timers=[];
try{
 globalThis.setTimeout=fn=>{timers.push(fn);return timers.length;};globalThis.clearTimeout=()=>{};
 document.getElementById=id=>elements.get(id)||null;window.getV39GameSettings=()=>routed.gameSettings;
 routed.timeline={...routed.timeline,operationPhase:'territory',expeditionTurns:0};router.renderControls();
 assert.equal(elements.get('v39-turn-phase-count').textContent,'0');assert.equal(elements.get('v39-turn-toggle').dataset.operationPhase,'territory');
 assert(!elements.get('v39-operation-phase-banner').hidden);assert.equal(timers.length,1);
 router.renderControls();assert.equal(timers.length,1,'same phase does not replay ticker');
 timers[0]();assert(elements.get('v39-operation-phase-banner').hidden);
 routed.timeline={...routed.timeline,operationPhase:'expedition',expeditionTurns:0};router.renderControls();
 assert.equal(elements.get('v39-turn-phase-count').textContent,'1');assert.equal(timers.length,2);
 routed.timeline.expeditionTurns=1;router.renderControls();assert.equal(elements.get('v39-turn-phase-count').textContent,'2');assert.equal(timers.length,2);
 assert(elements.get('v39-turn-toggle').attributes['aria-label'].includes('戦闘・探索'));
 routed.gameSettings={turnProgressionMode:'standard'};router.renderControls();
 assert(elements.get('v39-turn-phase-count').hidden);assert(elements.get('v39-operation-phase-banner').hidden);
}finally{globalThis.setTimeout=oldTimeout;globalThis.clearTimeout=oldClear;}
console.log('PASS: compact numeric phase indicator, phase colors/labels, transition-only ticker, timeout and standard-mode hiding. No browser.');
const groupedBase={...base,operationPlans:[{id:'e1',kind:'expansion',tile:{x:0,y:0},notBeforeTurn:1},{id:'b1',kind:'construction',facilityName:'農場',tile:{x:1,y:0},notBeforeTurn:1},{id:'e2',kind:'expansion',tile:{x:2,y:0},notBeforeTurn:1},{id:'b2',kind:'construction',facilityName:'市場',tile:{x:3,y:0},notBeforeTurn:1}]};
const grouped={...state,players:[{...state.players[0],factionState:{...state.players[0].factionState,settlements:[groupedBase]}}]};
const scoped=m.editV39OperationPlan(grouped,'p','b','e2','up',undefined,'expansion').state.players[0].factionState.settlements[0].operationPlans;
assert.deepEqual(scoped.map(row=>row.id),['e2','b1','e1','b2'],'expansion reorder leaves construction slots and relative order intact');
const expandHtml=m.renderV39OperationPlans(grouped,grouped.players[0],groupedBase,{scope:'expansion',showFinish:false});
assert(expandHtml.includes('data-plan-id="e1"'));assert(!expandHtml.includes('data-plan-id="b1"'));assert(!expandHtml.includes('data-plans-confirm'));assert(!expandHtml.includes('次の領土運営まで自動進行'));
const buildHtml=m.renderV39OperationPlans(grouped,grouped.players[0],groupedBase,{scope:'construction',showFinish:false});assert(buildHtml.includes('data-plan-id="b1"'));assert(!buildHtml.includes('data-plan-id="e1"'));
const review=m.renderV39TerritoryPhaseReview(grouped);assert(review.includes('領土拡張 2件 / 建設 2件'));assert(m.renderV39TerritoryPhaseReview({...grouped,players:[{...grouped.players[0],factionState:{settlements:[base]}}]}).includes('予約がありません'));
let dialog,focused=false;
document.body={appendChild:()=>{}};
document.createElement=()=>dialog={setAttribute(){},showModal(){this.shown=true;},addEventListener(name,fn){this[name]=fn;},querySelector(){return {focus(){focused=true;}};},remove(){this.removed=true;}};
let answer=m.confirmV39TerritoryPhaseEnd(grouped);assert(dialog.shown);assert(focused);assert(dialog.innerHTML.includes('戻って見直す'));dialog.returnValue='cancel';dialog.close();assert.equal(await answer,false);assert(dialog.removed);
answer=m.confirmV39TerritoryPhaseEnd(grouped);dialog.returnValue='confirm';dialog.close();assert.equal(await answer,true);
const settlementUi=readFileSync('frontend/src/v39/world/v39-settlement-ui.js','utf8');assert(settlementUi.includes("territoryGuideStep='expansion';activePage='expansion'"));assert(settlementUi.includes('window.reviewV39TerritoryPlans'));assert(settlementUi.includes('construction-plans'));
console.log('PASS: separate expansion/construction order, overview entry, phase-end cancellation and review dialog accept/back behavior. No browser.');

for(const [step,next,label] of [['expansion','construction','1/3 領土拡張'],['construction','units','2/3 建設'],['units','review','3/3 ユニット追加']]){
 const html=m.renderV39TerritoryGuide(grouped,step);assert(html.includes(label));assert(html.includes(`data-territory-guide="${next}"`));
}
assert.equal(m.renderV39TerritoryGuide({...grouped,gameSettings:{turnProgressionMode:'standard'}},'expansion'),'');
const trainingReview=m.renderV39TerritoryPhaseReview({...grouped,players:[{...grouped.players[0],factionState:{...grouped.players[0].factionState,settlements:[base],unitTrainingQueue:[{settlementId:'b'}]}}]});
assert(trainingReview.includes('訓練中・予約 1件'));assert(!trainingReview.includes('予約がありません'));
const setterSource=settlementUi.slice(settlementUi.indexOf('window.setV39TerritoryGuideStep=step=>'),settlementUi.indexOf('window.reviewV39TerritoryPlans=async()=>'));
let guideState=grouped;const navigation=[];
Object.assign(window,{openV39TerritoryManagement:()=>navigation.push('expansion'),openV39SettlementConstructionPlans:()=>navigation.push('construction'),openV39UnitCreate:()=>navigation.push('units')});
const setter=new Function('activeContext','isV39TerritoryPhase','V39_TERRITORY_GUIDE_STEPS','guideStep','openConstructionForGuide',`let territoryGuideStep;${setterSource};return window.setV39TerritoryGuideStep;`)(()=>({state:guideState}),m.isV39TerritoryPhase,m.V39_TERRITORY_GUIDE_STEPS,()=>{},()=>navigation.push('builder'));
setter('expansion');setter('construction');setter('units');assert.deepEqual(navigation,['expansion','construction','builder','units']);
guideState={...grouped,timeline:{...grouped.timeline,operationPhase:'expedition'}};setter('expansion');assert.equal(navigation.length,4);
assert(readFileSync('frontend/src/v39/unit/v39-unit-create-ui.js','utf8').includes("renderV39TerritoryGuide(state,'units')"));
console.log('PASS: guided expansion/build/unit steps, existing screen routing, optional unit stage and training counts in final review. No browser.');
const serialBase={...base,constructionQueue:[
  {id:'first',facilityName:'農場',tileKey:'3,3',remainingTurns:1,totalTurns:1,startedTurn:1},
  {id:'second',facilityName:'伐採場',tileKey:'3,4',remainingTurns:2,totalTurns:2,startedTurn:1}
]};
const serial=m.advanceConstruction(serialBase);
assert.equal(serial.completed.length,1);assert.equal(serial.village.constructionQueue[0].remainingTurns,2,'completion does not spend the same turn on the next building');
assert.equal(m.advanceConstruction(serial.village).village.constructionQueue[0].remainingTurns,1);
assert.equal(serialBase.constructionQueue[0].remainingTurns,1,'input remains unchanged');
const mixedBase={...serialBase,wallConstructionQueue:[{id:'wall',facilityName:'防壁',remainingTurns:3,startedTurn:2}]};
assert.equal(m.resolveV39ConstructionWorkKind(mixedBase),'construction');
assert.equal(m.resolveV39ConstructionWorkKind({...mixedBase,developmentProject:{startedTurn:0}}),'development');
const mixedState={activePlayerId:'p',activeWorldId:'surface',timeline:{turnNumber:2},players:[{id:'p',race:'只人',factionState:{settlements:[mixedBase],units:[],research:{}}}],territoryOwnerByTile:Object.fromEntries(keys.map(key=>[key,'p'])),territoryStateByTile:{},facilitiesByTile:{},enemies:[],neutralVillages:[]};
const mixedTurn=m.advanceV39EconomyTurn(mixedState,map).state.players[0].factionState.settlements[0];
assert.equal(mixedTurn.constructionQueue[0].remainingTurns,2);assert.equal(mixedTurn.wallConstructionQueue[0].remainingTurns,3,'walls share the settlement work slot');
const contourSource=readFileSync('frontend/src/v39/map/v39-height-boundaries.js','utf8');
const drawContour=new Function(`${contourSource.slice(contourSource.indexOf('function drawEdge('),contourSource.indexOf('function renderHeightBoundaries('))};return drawEdge;`)();
const strokes=[],lines=[],g={lineStyle(...args){strokes.push(args);},lineBetween(...args){lines.push(args);}};
const points=[20,0,40,12,40,36,20,48,0,36,0,12];
drawContour(g,points,1,1,{x:20,y:24});
assert.equal(lines.length,2);assert.deepEqual(lines[0],lines[1]);assert.equal(lines[0][0],37,'contour is 3px inside high tile, not on ownership border');
assert.equal(strokes[0][1],0x15232a);assert.equal(strokes[1][1],0xe6ddd0);
lines.length=0;drawContour(g,points,1,2,{x:60,y:24});assert.equal(lines[0][0],43,'contour follows the higher neighbor');
assert(readFileSync('frontend/src/lib/map-entity-size-rules.js','utf8').includes('turnFontTiles: 0.18'));
console.log('PASS: one settlement construction job per turn, no next-job progress on completion, shared wall budget, inset outlined height contours and compact work badges. No browser.');
// Run the real initialization handler: site generation formerly erased the survey.
const explorationUiSource=readFileSync('frontend/src/v39/world/v39-exploration-ui.js','utf8');
const initializeSource=explorationUiSource.slice(explorationUiSource.indexOf('function initializeSites('),explorationUiSource.indexOf('function clearSitesForNewField('));
let generatedState={...surveyInput,territoryOwnerByTile:{...Object.fromEntries(keys.map(key=>[key,'p'])),'8,8':'p'},players:[{...surveyInput.players[0],factionState:{...surveyInput.players[0].factionState,settlements:[base],exploration:{surveyedTileKeys:keys}}}]};
const generatedWindow={getV39GameState:()=>generatedState,setV39GameState:patch=>{generatedState={...generatedState,...patch};},dispatchEvent(){},__v39FieldRuntime:{mapData:map}};
const initialize=new Function('window','generateV39VictoryLandmarks','generateV39ExplorationSites','generateV39Specialties','initialSettlementPositions','restoreV39InitialTerritorySurveys','CustomEvent',`${initializeSource};return initializeSites;`)(generatedWindow,()=>({}),()=>({}),()=>({'3,3':{name:'test-visible'},'8,8':{name:'test-outside'}}),()=>[],m.restoreV39InitialTerritorySurveys,class{constructor(type,detail){Object.assign(this,{type,...detail});}});
initialize({detail:{mapData:map}});
let generatedExploration=generatedState.players[0].factionState.exploration;
assert(generatedExploration.surveyedTileKeys.includes('3,3'));
assert(generatedExploration.discoveredSpecialtiesByTile['3,3'],'initial specialty discovered AFTER generation and reset');
assert(!generatedExploration.surveyedTileKeys.includes('8,8'),'later expanded territory is not migrated');
assert(!generatedExploration.discoveredSpecialtiesByTile['8,8']);
const emptySave={...generatedState,players:generatedState.players.map(p=>({...p,factionState:{...p.factionState,exploration:{surveyedTileKeys:['8,8']}}}))};
const repaired=m.restoreV39InitialTerritorySurveys(emptySave,map);
assert(repaired.players[0].factionState.exploration.discoveredSpecialtiesByTile['3,3']);
assert(repaired.players[0].factionState.exploration.surveyedTileKeys.includes('8,8'),'existing survey remains');
assert.deepEqual(m.restoreV39InitialTerritorySurveys(JSON.parse(JSON.stringify(repaired)),map).players,repaired.players,'save roundtrip is idempotent');
assert.equal(m.restoreV39InitialTerritorySurveys({...emptySave,activeWorldId:'cave'},map).players,emptySave.players);
const progressSource=markerSource.slice(markerSource.indexOf('function addConstructionProgress('),markerSource.indexOf('function addTileTextMarker('));
const badgePositions=[];
const badge={setName(){return this;},setData(){return this;},add(){}};
const progressScene={add:{container(x,y){badgePositions.push([x,y]);return badge;},rectangle(){return {};},text(){return {setOrigin(){return this;}};}}};
const addProgress=new Function('tileRelativePx','MAP_ENTITY_SIZE_RULES','addV39FieldSymbol','constructionLabelContainer',`${progressSource};return addConstructionProgress;`)(n=>n*40,{construction:{turnFontTiles:0.18,turnOffsetLeftTiles:0.22,turnOffsetUpTiles:0.32}},()=>{}, {add(){}});
addProgress(progressScene,{x:100,y:100,setData(){}},'3T');assert.deepEqual(badgePositions[0],[91.2,87.2],'work badge is left and above building center');
console.log('PASS: real initial-generation/reset discovers owned sites, old-save survey repair excludes expanded territory, JSON/cave guards, and work badge upper-left placement. No browser.');
