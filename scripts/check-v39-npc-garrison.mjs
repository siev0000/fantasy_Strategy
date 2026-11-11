import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {build} from 'esbuild';
process.on('uncaughtException',error=>{console.error(String(error.stack).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[bundle]').slice(0,1600));process.exit(1);});
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
  export * from './frontend/src/lib/v39-npc-garrison.js';
  export {moveAiExplorer,findNpcScoutStep,planAiCombat} from './frontend/src/v39/ai/v39-faction-ai.js';
  export {assignV39NpcResourceTeams} from './frontend/src/lib/v39-npc-resource-teams.js';
  export {moveV39ResourceTeam} from './frontend/src/lib/v39-resource-team-movement.js';
`},bundle:true,write:false,format:'esm',platform:'node',loader:{'.css':'empty'},define:{'import.meta.url':'"file:///test/garrison.js"'},plugins:[{name:'test-data',setup(b){
  b.onLoad({filter:/v39-faction-ai\.js$/},args=>({contents:readFileSync(args.path,'utf8')+'\nexport {moveAiExplorer,findNpcScoutStep,planAiCombat};',resolveDir:dirname(args.path),loader:'js'}));
  b.onLoad({filter:/icon-library\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([\s\S]*?\);/,'{};'),resolveDir:dirname(args.path),loader:'js'}));
  b.onLoad({filter:/game-data-registry\.js$/},args=>{
    const root=resolve('data/source/export/json'),data=Object.fromEntries(readdirSync(root).filter(name=>name.endsWith('.json')).map(name=>['../../../data/source/export/json/'+name,JSON.parse(readFileSync(resolve(root,name),'utf8'))]));
    return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,JSON.stringify(data)+';'),resolveDir:dirname(args.path),loader:'js'};
  });
}}]});
globalThis.window={addEventListener(){},getV39GameState:()=>null};
const warn=console.warn;let m;try{console.warn=()=>{};m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));}finally{console.warn=warn;}
const base={id:'home',settlementId:'home',name:'home',placed:true,x:5,y:5};
const unit=(id,x=5,y=5)=>({id,name:id,x,y,worldId:'surface',hp:100,maxHp:100,ap:100,currentAp:100,status:{HP:100,移動:50},combatProfile:{mode:'army'},techniques:[]});
const map={w:14,h:14,worldWrapEnabled:false,grid:Array.from({length:14},()=>Array(14).fill('平地')),heightLevelMap:[],specialMap:[]};
function stateOf(units){return {activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'npc',isPlayer:false,race:'只人',factionState:{units,settlements:[base],squads:[{id:'solo',unitIds:units.map(u=>u.id)}],aiState:{},exploration:{},visibility:{exploredTileKeys:[]},combatRuntime:{}}}],enemies:[],neutralVillages:[],territoryOwnerByTile:{}};}
let state=stateOf([unit('guard')]),player=state.players[0];
assert.deepEqual([...m.getV39NpcGarrisonIds(player)],['guard']);
assert.equal(m.moveAiExplorer(state,player,map,{type:'explore',x:null,y:null}),null,'last unit cannot explore');
assert.equal(m.findNpcScoutStep(state,player,map),null,'scouting cannot take the last defender');
assert.equal(m.moveV39ResourceTeam(state,'npc','guard',{type:'resource-team-search'},map),null,'resource/growth movement cannot take defender');
assert.equal(m.assignV39NpcResourceTeams(state,'npc',[{name:'木材',missing:100,settlementId:'home'}],map).teams.some(team=>team.unitIds.includes('guard')),false);
state=stateOf([unit('guard'),unit('scout',6,5)]);player=state.players[0];
const step=m.findNpcScoutStep(state,player,map);assert.ok(step,'spare unit can still explore');
assert.ok(!step.group.participants.some(unit=>unit.id==='guard'));
state=m.prepareV39NpcGarrisons(state,'npc');
assert.equal(state.players[0].factionState.aiState.garrisons[0].unitId,'guard');
state.players[0].factionState.units[0]={...unit('guard',9,5)};player=state.players[0];
assert.deepEqual([...m.getV39NpcGarrisonIds(player)],['guard'],'assignment stays stable while returning');
const home=m.getV39NpcGarrisons(player)[0];
const returned=m.moveAiExplorer(state,player,map,{...home,type:'garrison-return',actorId:'guard'});
assert.ok(returned);assert.ok(returned.state.players[0].factionState.units[0].x<9,'displaced guard heads home');
const dead={...unit('guard'),hp:0};
assert.equal(m.selectV39BaseGarrisons([dead,unit('replacement',6,5)],[base],state.players[0].factionState.aiState.garrisons)[0].unitId,'replacement');
assert.equal(m.selectV39BaseGarrisons([dead],[base]).length,0,'does not create guards from nothing');
assert.equal(m.selectV39BaseGarrisons([unit('a'),unit('b',10,10)],[base,{...base,id:'second',settlementId:'second',x:10,y:10}]).length,2,'one per base');
assert.equal(m.selectV39BaseGarrisons([{...unit('cave'),worldId:'cave'},dead],[base]).length,0,'off-world/dead units cannot garrison');
state=stateOf([{...unit('guard'),status:{HP:100,命中:100},techniques:[{source:{名前:'guard hit',行動:'A',対象:'相手',物理:10,射程:60,AP消費:10}}]}]);
state.enemies=[{...unit('raider',7,5),aggressive:true}];window.__v39FieldRuntime={mapData:map};
assert.equal(m.planAiCombat(state,state.players[0],{type:'explore'})?.targetUnitId,'raider','stationed defender can attack a hostile approaching home');
console.log('PASS: minimum garrison, spare exploration, resource exclusion, return, replacement, multiple bases and defensive combat. No browser.');
