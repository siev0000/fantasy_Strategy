import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=await readFile(new URL('../frontend/src/lib/v39-event-dialogue-rules.js',import.meta.url),'utf8');
const engine=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const node=(number,name,extra={})=>({番号:number,名前:name,回答:`回答${number}`,選択条件:[],消費:[],報酬:[],効果:[],...extra});
const definition={ID:'EV_A',入力書式:'番号付きセルv1',発生条件:[],選択肢:[
  node('1','聞く'),
  node('1-1','納品',{親番号:'1',選択条件:[{タイプ:'資源保有',名前:'木材',数量:10}],消費:[{タイプ:'資源',名前:'木材',数量:10}],報酬:[{タイプ:'一般村友好度変更',設定:{値:10}}]}),
  node('1-2','別の話',{親番号:'1'}),node('2','終了',{効果:[{タイプ:'会話終了'}]})
]};
const fresh=()=>({activePlayerId:'a',players:[{id:'a',factionState:{wood:10,relation:0}},{id:'b',factionState:{wood:10,relation:0}}]});
const adapters={conditions:{資源保有:(condition,ctx)=>ctx.state.players.find(p=>p.id===ctx.playerId).factionState.wood>=condition.数量},supportedOperations:['消費:資源','報酬:一般村友好度変更'],applyChoice:(state,choice,ctx)=>{
  const player=state.players.find(p=>p.id===ctx.playerId);player.factionState.wood-=choice.消費[0].数量;player.factionState.relation+=choice.報酬[0].設定.値;return {ok:true,state};
}};
const open=state=>engine.openV39NumberedDialogue(state,definition,{instanceId:'village-1:EV_A:1',contextId:'village-1'});
assert(open({activePlayerId:'a',players:[{id:'a'}]}).ok,'missing faction state initializes dialogue storage');
let state=fresh(),result=open(state);assert(result.ok);state=result.state;
assert.equal(fresh().players[0].factionState.eventDialogueById,undefined);
assert.deepEqual(engine.viewV39NumberedDialogue(state,definition,'village-1:EV_A:1',adapters).choices.map(row=>row.番号),['1','2']);
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',adapters).ok,'cannot bypass parent');
result=engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1',adapters);assert(result.ok);state=result.state;
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',{}).ok,'unknown condition blocks selection');
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',{conditions:adapters.conditions}).ok,'missing transaction adapter blocks effects');
const broken={...adapters,applyChoice:working=>{working.players[0].factionState.wood=0;return {ok:false,reason:'failed'};}};
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',broken).ok);
assert.equal(state.players[0].factionState.wood,10,'failed adapter cannot partially charge original state');
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',{...adapters,applyChoice:()=>{throw Error('failed');}}).ok);
result=engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',adapters);assert(result.ok);state=result.state;
assert.equal(state.players[0].factionState.wood,0);assert.equal(state.players[0].factionState.relation,10);
state=JSON.parse(JSON.stringify(state));state=engine.backV39NumberedDialogue(state,definition,'village-1:EV_A:1').state;
result=engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1-1',adapters);assert(result.ok);state=result.state;
assert.equal(state.players[0].factionState.relation,10,'revisit after save and back cannot claim reward twice');
assert.equal(state.players[0].factionState.wood,0);
const other={...state,activePlayerId:'b'};
assert(!engine.chooseV39NumberedDialogue(other,definition,'village-1:EV_A:1','1',adapters).ok,'other player cannot use first player session');
assert(open(other).ok,'same instance name is isolated per player');
assert(!engine.openV39NumberedDialogue(state,definition,{instanceId:'village-1:EV_A:1',contextId:'village-2'}).ok,'same instance cannot be reassigned to another village');
assert.equal(open(state).state,state,'reopening keeps progress');
state=engine.backV39NumberedDialogue(state,definition,'village-1:EV_A:1').state;
state=engine.backV39NumberedDialogue(state,definition,'village-1:EV_A:1').state;
result=engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','2',adapters);assert(result.ok);state=result.state;
assert(!engine.backV39NumberedDialogue(state,definition,'village-1:EV_A:1').ok,'closed session stays closed');
assert(!engine.chooseV39NumberedDialogue(state,definition,'village-1:EV_A:1','1',adapters).ok);
assert.equal(engine.inspectV39NumberedDialogue(definition).length,0);
assert(engine.inspectV39NumberedDialogue({...definition,選択肢:[...definition.選択肢,node('1','重複')]}).length);
assert(engine.inspectV39NumberedDialogue({...definition,選択肢:[node('1-1','孤立')]}).length);
assert(!engine.viewV39NumberedDialogue(open(fresh()).state,{...definition,発生条件:[{タイプ:'未対応'}]},'village-1:EV_A:1').choices[0].available);
console.log('Numbered dialogue: parent routing, answers, condition gates, atomic effects, back/reopen/save, no double rewards, context/player isolation and close passed.');
