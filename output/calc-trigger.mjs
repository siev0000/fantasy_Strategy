import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync,readdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[bundle]').slice(0,1400));process.exit(1);});
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
export * from './frontend/src/lib/v39-bleeding.js';
export {applyV39DerivedCharacterData} from './frontend/src/v39/unit/v39-character-derived-rules.js';
export {resolveAttackPower} from './frontend/src/lib/v39-combat-engine.js';
export * from './frontend/src/lib/v39-skill-triggers.js';
export * from './frontend/src/v39/dev/v39-skill-trigger-test.js';
export * from './frontend/src/lib/v39-passive-rules.js';
export {computeAttackDamage,resolveSkillHealing} from './frontend/src/lib/v39-combat-engine.js';
export {canV39FactionAttack} from './frontend/src/lib/v39-diplomacy-rules.js';
export {getV39UnitTestTechniques} from './frontend/src/lib/v39-test-skill-rules.js';
`},bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.url':'"file:///test/skill-trigger.js"'},plugins:[{name:'registry',setup(b){
 b.onLoad({filter:/game-data-registry\.js$/},args=>{
  const root=resolve('data/source/export/json'),data=Object.fromEntries(readdirSync(root).filter(n=>n.endsWith('.json')).map(n=>[`../../../data/source/export/json/${n}`,JSON.parse(readFileSync(`${root}/${n}`,'utf8'))]));
  return {contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([^;]+\);/,JSON.stringify(data)+';'),resolveDir:dirname(args.path),loader:'js'};
 });
}}]});
globalThis.window={addEventListener(){},dispatchEvent(){},getV39GameState:()=>null};
const warn=console.warn;let m;
try{console.warn=()=>{};m=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));}finally{console.warn=warn;}
let unit=m.addV39Bleeding({hp:1000},100,1),sum=0;
assert.equal(m.tickV39Bleeding(unit,1).damage,0,'no extra tick in application turn');
for(let turn=2;turn<=11;turn++){
 const result=m.tickV39Bleeding(unit,turn);sum+=result.damage;unit=result.unit;
 assert.equal(m.tickV39Bleeding(unit,turn).damage,0,'same turn is idempotent');
}
assert.equal(unit.bleeding,null);assert.equal(sum,55,'100 bleeding causes 10,9,...,1 damage');
unit=m.addV39Bleeding({hp:1000},100,1);unit=m.tickV39Bleeding(unit,2).unit;
unit=m.addV39Bleeding(unit,10,2);assert.equal(unit.bleeding.initialValue,100);assert.equal(unit.bleeding.remainingTurns,10);
assert.equal(m.tickV39Bleeding(unit,3).unit.bleeding.value,90,'additional bleeding resets baseline and ten turns');
assert.equal(m.reduceV39Bleeding(unit,25).bleeding.value,75);assert.equal(m.reduceV39Bleeding(unit,100).bleeding,null);
const fixture=JSON.parse(readFileSync('config/v39-skill-trigger-test.json','utf8')),random=()=>.5;
function createState(){return {activeWorldId:'surface',activePlayerId:'trigger-test',timeline:{turnNumber:1},enemies:[],neutralVillages:[],players:[{id:'trigger-test',factionState:{units:fixture.units.map((unit,index)=>({...unit,worldId:'surface',hp:fixture.hp,currentHp:fixture.hp,maxHp:fixture.hp,ap:100,status:{...fixture.status,HP:fixture.hp},techniques:index?[{source:fixture.passives[0]}]:[]}))}}]};}
function act(state,index,row,{random}){
 const units=state.players[0].factionState.units,actor=units[index],target=Number(row.回復)>0?actor:units[1-index];
 const after=structuredClone(state),next=after.players[0].factionState.units,entries=[];
 if(Number(row.回復)>0){next[index].hp=Math.min(actor.maxHp,actor.hp+m.resolveSkillHealing(row,actor));next[index].currentHp=next[index].hp;}
 else {const damage=m.computeAttackDamage({attacker:actor,target,skillRow:row,random});next[1-index].hp=Math.max(0,target.hp-damage.total);next[1-index].currentHp=next[1-index].hp;entries.push({...damage,targetId:target.id,beforeHp:target.hp,afterHp:next[1-index].hp});}
 return m.applyV39SkillTriggerCombat(state,after,actor,row,entries,{random});
}
const eventTargets={ownerId:'受けた人',sourceId:'原因の相手',attackerId:'攻撃した人',cause:'攻撃'};
assert.equal(m.resolveV39SkillTriggerTarget('自身',eventTargets),'受けた人');
assert.equal(m.resolveV39SkillTriggerTarget('発動元',eventTargets),'原因の相手');
assert.equal(m.resolveV39SkillTriggerTarget('攻撃者',eventTargets),'攻撃した人');
assert.equal(m.resolveV39SkillTriggerTarget('攻撃者',{...eventTargets,cause:'回復'}),null);
assert.equal(m.resolveV39SkillTriggerTarget('攻撃者',{ownerId:'a',sourceId:'b',cause:'攻撃'}),null);
assert.equal(m.resolveV39SkillTriggerTarget('未知',eventTargets),null);
assert.equal(m.resolveV39SkillTriggerTarget('',eventTargets),null);
const bloodAction=m.resolveV39TriggeredAttack(fixture.passives[0],{name:'被出血付与',amount:100});
assert.equal(bloodAction.切断,100);assert.equal(bloodAction.全威力,undefined);assert.equal(bloodAction.判定,'HP');
const arbitrary={名前:'任意の反撃',行動:'P',効果:'反撃_被ダメージ_打撃',判定:'攻撃'};
assert.equal(m.resolveV39TriggeredAttack(arbitrary,{name:'被ダメージ',amount:37}).打撃,37,'same grammar supports other names, references and attributes');
assert.equal(m.resolveV39TriggeredAttack(arbitrary,{name:'被出血付与',amount:37}),null);
assert.equal(m.resolveV39TriggeredAttack({...arbitrary,効果:'反撃_未知_打撃'},{name:'被ダメージ',amount:37}),null);
assert.equal(m.resolveV39TriggeredAttack({...arbitrary,効果:'反撃_被ダメージ_未知'},{name:'被ダメージ',amount:37}),null);
const actor={...createState().players[0].factionState.units[1],status:{...fixture.status,HP:100}},target=createState().players[0].factionState.units[0];
const low=m.computeAttackDamage({attacker:actor,target,skillRow:bloodAction,random}).total;
const high=m.computeAttackDamage({attacker:{...actor,status:{...actor.status,HP:300}},target,skillRow:bloodAction,random}).total;
assert.ok(high>low,'HP judgment scales converted base power through normal damage calculation');
let state=createState();
const bleed=act(state,0,fixture.actions[1],{random});state=bleed.state;
assert.equal(state.players[0].factionState.units[1].bleeding.value,100);
assert.equal(bleed.logs.filter(log=>log.kind==='trigger').length,1);
assert.equal(bleed.logs.find(log=>log.kind==='trigger').event,'被出血付与');
assert.ok(state.players[0].factionState.units[0].hp<fixture.hp,'reaction attacks actual source');
const normal=act(state,0,fixture.actions[0],{random});
assert.equal(normal.logs.filter(log=>log.kind==='trigger').length,0,'being already bleeding does not trigger blood blade');
const turn=m.advanceV39SkillTriggerTurn(state,2,{random});state=turn.state;
assert.equal(turn.logs.filter(log=>log.kind==='trigger').length,0,'bleed tick does not trigger on-application reaction');
assert.equal(state.players[0].factionState.units[1].bleeding.value,90);
const again=m.advanceV39SkillTriggerTurn(state,2,{random});
assert.deepEqual(again.state.players,state.players,'repeat same turn does not damage twice');assert.equal(again.changed,false);
const before=state.players[0].factionState.units[1];
const healing=act(state,1,fixture.actions[2],{random});
const after=healing.state.players[0].factionState.units[1];
assert.equal(after.bleeding?.value||0,Math.max(0,before.bleeding.value-(after.hp-before.hp)),'actual HP recovery reduces bleeding');
const miss=act(createState(),0,fixture.actions[1],{random:()=>1});
assert.equal(miss.state.players[0].factionState.units[1].bleeding,undefined);assert.equal(miss.logs.filter(log=>log.kind==='trigger').length,0);
const passive={...fixture.passives[1],攻撃:999};
assert.equal(m.isV39ConditionalPassive(passive),true);
assert.equal(m.matchV39PassiveCondition(passive,{},{}).matches,false,'reactive passive is never always-on');
assert.equal(m.collectV39PassiveBonuses([passive]).status.攻撃,undefined);
state=createState();state.players[0].factionState.units[0].techniques=[{source:fixture.passives[1]}];
const noLoop=act(state,0,fixture.actions[1],{random});
assert.equal(noLoop.logs.filter(log=>log.kind==='trigger').length,1,'reaction does not start recursive reactions');
const unknown=m.dispatchV39SkillTriggerEvents(state,[{name:'未知',ownerId:'trigger-test-a',sourceId:'trigger-test-b'}],{random});
assert.equal(unknown.logs.length,0);
const sides=bleed.events.filter(event=>event.name.includes('出血付与'));
assert.equal(sides.find(event=>event.name==='被出血付与').ownerId,'trigger-test-b');
assert.equal(sides.find(event=>event.name==='出血付与').ownerId,'trigger-test-a');
assert.ok(!healing.events.some(event=>event.name==='攻撃'),'healing does not emit attack');
state=createState();state.players[0].factionState.units[1].hp=1;
state.players[0].factionState.units[1]=m.addV39Bleeding(state.players[0].factionState.units[1],100,1);
const death=m.advanceV39SkillTriggerTurn(state,2,{random});
assert.equal(death.state.players[0].factionState.units[1].state,'死亡');
assert.equal(death.state.players[0].factionState.units[1].deathCause,'出血');

window.isV39TestMode=()=>true;
const field=m.createV39SkillTriggerFieldFixture({id:'p',controllerParticipantId:'local',factionState:{}});
assert.equal(field.players.length,2);
assert.ok(field.players.every(p=>p.isPlayer&&p.controllerParticipantId==='local'));
assert.ok(m.canV39FactionAttack(field,'p','trigger-test-opponent'));
assert.ok(m.canV39FactionAttack(field,'trigger-test-opponent','p'));
for(const player of field.players)assert.ok(m.getV39UnitTestTechniques(player.factionState.units[0]).some(row=>row.name==='検証・出血攻撃'));
assert.equal(m.getV39TriggeredSkills(field.players[1].factionState.units[0])[0].発動,'被出血付与');
let current={...field,activePlayerId:'p',timeline:{turnNumber:1}},loaded=false,tab='';
window.__v39FieldRuntime={mapData:field.map,settings:{}};
window.getV39GameState=()=>current;
window.setV39GameState=patch=>{current={...current,...patch};};
window.startV39ExpeditionTest=()=>({ok:true});
window.loadV39FieldSnapshot=map=>{loaded=true;window.__v39FieldRuntime.mapData=map;};
window.activateV39FooterTab=value=>{tab=value;};
assert.equal(await m.startV39SkillTriggerTest(),true);
assert.equal(loaded,true);assert.equal(tab,'squad');
assert.equal(m.selectV39SkillTriggerTestSide(1),true);
assert.equal(current.activePlayerId,'trigger-test-opponent');
assert.equal(current.timeline.activeTurnPlayerId,current.activePlayerId);
assert.equal(m.selectV39SkillTriggerTestSide(0),true);assert.equal(current.activePlayerId,'p');
console.log('PASS: bleeding, reactions, passive isolation, real field fixture, normal test skills and A/B control. No browser.');

const f=m.createV39SkillTriggerFieldFixture({id:'p',factionState:{}});const a=m.applyV39DerivedCharacterData(f.players[1].factionState.units[0]);console.log(JSON.stringify({HP:a.status.HP,反撃威力:m.resolveAttackPower(m.resolveV39TriggeredAttack(fixture.passives[0],{name:'被出血付与',amount:100}),a)}));
