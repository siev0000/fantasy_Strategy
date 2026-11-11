import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { readFileSync,readdirSync } from 'node:fs';
import { dirname,resolve } from 'node:path';
process.on('uncaughtException',error=>{console.error(String(error.stack||error).replace(/data:text\/javascript;base64,[A-Za-z0-9+/=]+/g,'[bundle]').slice(0,1400));process.exit(1);});
const bundle=await build({stdin:{resolveDir:process.cwd(),contents:`
export * from './frontend/src/lib/v39-bleeding.js';
export * from './frontend/src/lib/v39-reduction-keys.js';
export {inspectV39StatusResistance} from './frontend/src/lib/v39-status-resistance.js';
export * from './frontend/src/lib/v39-resistance-math.js';
export {parseV39CityEffectSettings} from './frontend/src/lib/v39-city-effect-schema.js';
export * from './frontend/src/lib/v39-hit-trigger-rules.js';
export * from './frontend/src/lib/v39-restraint.js';
export {resolveScaleStatValue,computeSkillScaledTriplet,formatV39SkillCombatValues} from './frontend/src/lib/skill-power.js';
export {resolveV39UnitMovementStepCost} from './frontend/src/lib/v39-terrain-traversal.js';
export * from './frontend/src/lib/v39-periodic-status.js';
export {resolveV39CurrentUnitAbilities,resolveV39UnitAbilityDisplay} from './frontend/src/lib/v39-current-unit-abilities.js';
export {captureV39PointerTap} from './frontend/src/lib/v39-pointer-tap-selection.js';
export {focusV39MapTile} from './frontend/src/v39/map/v39-map-focus.js';
export {isV39PaidCastRelease,isV39CastingMagic,isV39CastAttackLocked,settleV39CastingActions} from './frontend/src/lib/v39-casting-rules.js';
export * from './frontend/src/lib/v39-combat-popup-rules.js';
export {createV39DefenseStructure,v39WallStepHeight} from './frontend/src/lib/v39-defense-rules.js';
export {v39RayStructureAtStep} from './frontend/src/lib/v39-combat-ray.js';
export * from './frontend/src/lib/v39-unit-guarding.js';
export {getHexDistance} from './frontend/src/lib/hex-grid.js';
export {resolveV39CombatEffect} from './frontend/src/lib/v39-combat-effect-rules.js';
export {playV39TriggerEffect} from './frontend/src/v39/combat/v39-trigger-presentation.js';
export * from './frontend/src/lib/v39-ability-damage.js';
export {applyV39ActiveCombatEffects} from './frontend/src/lib/v39-combat-engine.js';
export {applyV39DerivedCharacterData} from './frontend/src/v39/unit/v39-character-derived-rules.js';
export {renderV39UnitConditions,renderV39UnitAbility} from './frontend/src/v39/unit/v39-unit-detail.js';
export {resolveV39StateInfliction,resolveV39HarmfulEffectDefense,resolveV39HarmfulEffectPower,resolveV39StaggerDamage} from './frontend/src/lib/v39-combat-engine.js';
export {getV39ActionBlock,standUpV39Unit,resolveV39MaxAp,applyV39ControlTurnAp} from './frontend/src/lib/v39-control-status.js';
export {resolveDetectionScoutValue} from './frontend/src/lib/v39-detection-rules.js';
export {resolveV39ChainDepth,runV39ChainAttacks} from './frontend/src/lib/v39-chain-attacks.js';
export {reduceV39BlockedHealing} from './frontend/src/lib/v39-ability-damage.js';
export * from './frontend/src/lib/v39-skill-triggers.js';
export * from './frontend/src/v39/dev/v39-skill-trigger-test.js';
export * from './frontend/src/lib/v39-passive-rules.js';
export {resolveV39TransformationSpec,replaceV39TransformationEffect,resolveV39ActiveTransformationAppearance,resolveV39TransformedSiz,resolveV39TransformationMaxHp,scaleV39TransformationHp} from './frontend/src/lib/v39-transformation.js';
export {applyV39GuardToDamage,computeAttackDamage,resolveAttackPower,resolveSkillHealing} from './frontend/src/lib/v39-combat-engine.js';
export {canV39FactionAttack} from './frontend/src/lib/v39-diplomacy-rules.js';
export {getV39UnitTestTechniques,describeV39TestSkillData} from './frontend/src/lib/v39-test-skill-rules.js';
`},bundle:true,write:false,loader:{'.css':'empty'},format:'esm',platform:'node',define:{'import.meta.url':'"file:///test/skill-trigger.js"'},plugins:[{name:'registry',setup(b){
 b.onLoad({filter:/icon-library\.js$/},args=>({contents:readFileSync(args.path,'utf8').replace(/import\.meta\.glob\([\s\S]*?\);/,'{};'),resolveDir:dirname(args.path),loader:'js'}));
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
const dragonForm=m.resolveV39TransformationSpec(fixture.actions.find(row=>row.名前==='検証・竜変身'));
const turtleForm=m.resolveV39TransformationSpec(fixture.actions.find(row=>row.名前==='検証・玄武変身'));
assert.equal(fixture.actions.find(row=>row.名前==='検証・竜変身').系統,'竜化');
assert.equal(fixture.actions.find(row=>row.名前==='検証・玄武変身').系統,'変身');
assert.equal(dragonForm.appearance?.slotNumber,1);
assert.equal(turtleForm.appearance?.slotNumber,8);
assert.equal(m.resolveV39TransformedSiz(150,dragonForm.sizeSpec),300);
assert.equal(m.resolveV39TransformedSiz(150,turtleForm.sizeSpec),300);
const dragonMax=m.resolveV39TransformationMaxHp(100,100,dragonForm.sizeSpec);
assert.ok(dragonMax>100,'larger SIZ raises maximum HP');
const sizedHp=m.scaleV39TransformationHp({hp:50,maxHp:100},dragonMax);
assert.equal(sizedHp.hp,Math.round(dragonMax/2),'current HP keeps its percentage');
assert.equal(m.scaleV39TransformationHp(sizedHp,100).hp,50,'ending the form restores base maximum HP and half health');
const sizedAbilities=m.applyV39ActiveCombatEffects({status:{SIZ:100,HP:100,攻撃:100,速度:100,命中:100},skillLevels:{隠密:100},resistances:{}},[{stackGroup:'transformation',sizeSpec:dragonForm.sizeSpec,modifiers:{炎耐性:30}}]);
assert.equal(sizedAbilities.status.SIZ,300);
assert.equal(sizedAbilities.resistances.炎耐性,30);
assert.ok(sizedAbilities.status.攻撃>100&&sizedAbilities.status.速度<100&&sizedAbilities.skillLevels.隠密<100,'SIZ changes derived combat and stealth values');
const sizeAndBuff=m.applyV39ActiveCombatEffects({status:{SIZ:100,攻撃:100},resistances:{}},[{stackGroup:'transformation',sizeSpec:dragonForm.sizeSpec,modifiers:{攻撃:20}}]);
assert.equal(sizeAndBuff.status.攻撃,sizedAbilities.status.攻撃+20,'direct transformation buff is added after SIZ scaling');
const transformed=m.replaceV39TransformationEffect([{skillName:'竜',stackGroup:'transformation',expiresAtTurn:4,appearance:dragonForm.appearance,modifiers:{攻撃:20}}],{skillName:'玄武',stackGroup:'transformation',expiresAtTurn:5,appearance:turtleForm.appearance,modifiers:{防御:20}});
assert.equal(transformed.length,1,'later transformation replaces the previous form and modifiers');
const transformationState={timeline:{turnNumber:2},players:[{factionState:{units:[{id:'transformation-test'}],combatRuntime:{activeEffectsByUnitId:{'transformation-test':transformed}}}}]};
assert.equal(m.resolveV39ActiveTransformationAppearance({id:'transformation-test'},transformationState)?.form,'玄武');
transformationState.timeline.turnNumber=5;
assert.equal(m.resolveV39ActiveTransformationAppearance({id:'transformation-test'},transformationState),null,'expired transformation restores base appearance');
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
assert.equal(state.players[0].factionState.units[1].bleeding.value,66);
assert.equal(bleed.logs.filter(log=>log.kind==='trigger').length,1);
assert.equal(bleed.logs.find(log=>log.kind==='trigger').event,'被出血付与');
assert.ok(state.players[0].factionState.units[0].hp<fixture.hp,'reaction attacks actual source');
const normal=act(state,0,fixture.actions[0],{random});
assert.equal(normal.logs.filter(log=>log.kind==='trigger').length,0,'being already bleeding does not trigger blood blade');
const turn=m.advanceV39SkillTriggerTurn(state,2,{random});state=turn.state;
assert.equal(turn.logs.filter(log=>log.kind==='trigger').length,0,'bleed tick does not trigger on-application reaction');
assert.equal(state.players[0].factionState.units[1].bleeding.value,59.4);
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
const formUnit=current.players[0].factionState.units[0];
const formBase=m.resolveV39CurrentUnitAbilities(formUnit,{state:current,mapData:null});
const formRuntime=current.players[0].factionState.combatRuntime;
formRuntime.activeEffectsByUnitId={[formUnit.id]:[{skillName:'検証・竜変身',stackGroup:'transformation',system:'竜化',expiresAtTurn:4,modifiers:{}}]};
const dragonPassive=m.resolveV39CurrentUnitAbilities(formUnit,{state:current,mapData:null});
assert.equal(dragonPassive.status.攻撃,formBase.status.攻撃+15,'竜化中パッシブが常時起動');
assert.equal(dragonPassive.status.防御,formBase.status.防御,'変身系統パッシブは竜化で起動しない');
formRuntime.activeEffectsByUnitId[formUnit.id]=[{skillName:'検証・玄武変身',stackGroup:'transformation',system:'変身',expiresAtTurn:4,modifiers:{}}];
const turtlePassive=m.resolveV39CurrentUnitAbilities(formUnit,{state:current,mapData:null});
assert.equal(turtlePassive.status.攻撃,formBase.status.攻撃,'上書きで竜化パッシブを解除');
assert.equal(turtlePassive.status.防御,formBase.status.防御+15,'変身系統パッシブに切り替え');
current.timeline.turnNumber=4;
const expiredPassive=m.resolveV39CurrentUnitAbilities(formUnit,{state:current,mapData:null});
assert.equal(expiredPassive.status.防御,formBase.status.防御,'期限切れで変身パッシブを解除');
current.timeline.turnNumber=1;
formRuntime.activeEffectsByUnitId={};
console.log('PASS: bleeding, reactions, passive isolation, real field fixture, normal test skills and A/B control. No browser.');

const inflictor={status:{攻撃:0}},defender={level:1,status:{防御:50}};
assert.equal(m.resolveV39StateInfliction(inflictor,defender,{出血:100},'出血'),66);
assert.ok(m.resolveV39StateInfliction(inflictor,{...defender,status:{防御:200}},{出血:100},'出血')<66);
assert.equal(m.resolveV39StateInfliction(inflictor,{...defender,resistances:{物理耐性:100}},{出血:100},'出血'),60);
assert.equal(m.describeV39Bleeding({bleeding:{value:66,remainingTurns:10}}).damage,6);
assert.match(m.renderV39UnitConditions({bleeding:{value:66,remainingTurns:10}}),/次回 6ダメージ/);
assert.match(m.renderV39UnitConditions({}),/なし/);

const reaction=bleed.logs.find(row=>row.kind==='trigger');
assert.equal(reaction.power,reaction.entry.detail.power);
assert.match(m.formatV39SkillTriggerLog(reaction),new RegExp('反撃威力'+reaction.power));
assert.match(m.formatV39SkillTriggerLog(reaction),new RegExp(reaction.damage+'ダメージ'));

assert.equal(m.abilityDamageTarget({効果:'速度ダメージ'}),'速度');
assert.equal(m.abilityDamageTarget({効果:'架空ダメージ'}),null);
let damaged=m.addAbilityDamage({status:{速度:20,APP:-10},skillLevels:{隠密:40}},'速度',15);
damaged=m.addAbilityDamage(damaged,'速度',10);
damaged=m.addAbilityDamage(damaged,'APP',5,{curse:true});
assert.equal(m.applyAbilityDamage(damaged).status.速度,0);
assert.equal(m.applyAbilityDamage(damaged).status.APP,-15);
assert.equal(m.recoverAbilityDamage(damaged,10).abilityDamage.速度,15);
assert.equal(m.recoverAbilityDamage(damaged,100).abilityCurses.APP,5);
assert.deepEqual(m.recoverAbilityDamage(damaged,5,{curse:true}).abilityCurses,{});
assert.equal(m.applyV39ActiveCombatEffects({status:{攻撃:100}},[{modifiers:{攻撃:20}},{modifiers:{攻撃:30}},{modifiers:{攻撃:5},stackGroup:'oneTurn'},{modifiers:{攻撃:10},stackGroup:'transformation'}]).status.攻撃,145);
let abilityState=createState();
let applied=act(abilityState,0,{名前:'能力試験',行動:'A',効果:'速度ダメージ',全威力:100,射程:5,AP消費:0},{random});
assert.equal(applied.state.players[0].factionState.units[1].abilityDamage.速度,66);
assert.equal(applied.state.players[0].factionState.units[1].hp,fixture.hp,'ability damage does not also reduce HP');
abilityState=applied.state;
const cured=m.applyV39SkillTriggerCombat(abilityState,abilityState,abilityState.players[0].factionState.units[0],{名前:'回復試験',回復:10},[],{random,supportTargetIds:['trigger-test-b']});
assert.equal(cured.state.players[0].factionState.units[1].abilityDamage.速度,56,'full HP recovery still restores ability damage');
const curseApplied=act(createState(),0,{名前:'呪い試験',行動:'A',効果:'速度ダメージ',呪い:50,射程:5,AP消費:0},{random});
assert.equal(curseApplied.state.players[0].factionState.units[1].abilityCurses.速度,33);
const curseCured=m.applyV39SkillTriggerCombat(curseApplied.state,curseApplied.state,curseApplied.state.players[0].factionState.units[0],{名前:'解呪',効果:'呪い回復',回復:10},[],{random,supportTargetIds:['trigger-test-b']});
assert.equal(curseCured.state.players[0].factionState.units[1].abilityCurses.速度,23);
let derived=m.applyV39DerivedCharacterData(m.addAbilityDamage(field.players[0].factionState.units[0],'速度',10));
const speed=derived.status.速度;
assert.equal(m.applyV39DerivedCharacterData(derived).status.速度,speed,'derived recalculation does not double subtract');
console.log('PASS: ability damage/curse, floors, full-HP recovery, curse recovery, persistent max/stacking and derived idempotence.');

for(const player of field.players){
 for(const unit of player.factionState.units){
  const names=m.getV39UnitTestTechniques(unit).map(row=>row.name);
  for(const name of unit.testSkillNames)assert.ok(names.includes(name),'fixture skill resolves: '+name);
  for(const row of fixture.actions)assert.ok(names.includes(row.名前),unit.id+' has '+row.名前);
  const olderUnit={...unit,testSkillNames:unit.testSkillNames.filter(name=>!['検証・竜変身','検証・玄武変身','竜化中攻撃（検証）','変身中防御（検証）'].includes(name))};
  const refreshed=m.getV39UnitTestTechniques(olderUnit).map(row=>row.name);
  assert.ok(refreshed.includes('検証・竜変身')&&refreshed.includes('検証・玄武変身'),'existing skill-test units receive added actions');
  if(unit.id==='trigger-test-a')assert.ok(refreshed.includes('竜化中攻撃（検証）')&&refreshed.includes('変身中防御（検証）'),'existing skill-test leader receives added passives');
  assert.equal(new Set(names).size,names.length,'no duplicated fixture skills');
 }
}
assert.ok(fixture.actions.some(row=>row.効果==='速度ダメージ'&&row.呪い===50));
assert.ok(fixture.actions.some(row=>row.効果==='呪い回復'));
console.log('PASS: complete test skill catalog resolves on all six field units.');

const requests=[];window.playV39MapEffect=request=>requests.push(request);
const reactionLog=bleed.logs.find(log=>log.entry);
assert.equal(m.playV39TriggerEffect(reactionLog),true);
assert.equal(requests[0].skillRow, reactionLog.skillRow,'normal effect resolver receives the actual reaction skill');
assert.equal(requests[0].attackerTile.x,reactionLog.attacker.x);
assert.equal(requests[0].tileX,reactionLog.entry.x);
assert.deepEqual(requests[0].hitEntries,[reactionLog.entry]);
const explicit={...reactionLog,skillRow:{...reactionLog.skillRow,アニメ:'落雷'}};
assert.equal(m.playV39TriggerEffect(explicit),true);assert.equal(requests[1].skillRow.アニメ,'落雷');
window.__v39SuppressCombatEffects=true;assert.equal(m.playV39TriggerEffect(explicit),false);
window.__v39SuppressCombatEffects=false;
assert.equal(m.playV39TriggerEffect({...explicit,attacker:{...explicit.attacker,worldId:'cave:test'}}),false);
assert.equal(requests.length,2);
console.log('PASS: automatic reactions use normal map effects, explicit animation, hit data and suppression/world filtering.');

const savedEffects=JSON.parse(readFileSync('config/local/v39-effect-settings.json','utf8'));
const effectCategories=Object.entries(savedEffects.categories).map(([id,row])=>({id,...row}));
for(const skill of [...fixture.actions,...fixture.passives]){
 const resolved=m.resolveV39CombatEffect(skill,{},effectCategories,[]);
 assert.equal(resolved.categoryId,skill.アニメ,'fixture uses saved category: '+skill.名前);
 assert.equal(resolved.effectName,effectCategories.find(row=>row.id===skill.アニメ).baseEffect);
 assert.ok(resolved.settings.sequenceSteps.length>0);
}
assert.deepEqual(m.resolveV39CombatEffect({アニメ:'任意の画像'}, {},effectCategories,[]),{effectName:'任意の画像',reason:'スキル指定'});
assert.deepEqual(m.resolveV39CombatEffect({アニメ:'斬撃'}, {},effectCategories,[]),{effectName:'斬撃',reason:'スキル指定'},'existing image-name override stays unchanged');
console.log('PASS: test skills use saved effect categories/sequences and existing explicit image names are preserved.');

assert.equal(field.players.length,2);
assert.ok(field.players.every(player=>player.factionState.units.length===3));
const positions=field.players.flatMap(player=>player.factionState.units.map(unit=>unit.x+','+unit.y));
assert.equal(new Set(positions).size,6,'six units occupy distinct tiles');
for(const player of field.players){
 assert.equal(player.factionState.squads[0].unitIds.length,3);
 for(const unit of player.factionState.units){
  const names=m.getV39UnitTestTechniques(unit).map(row=>row.name);
  assert.ok(names.includes('TEST_貫通'));assert.ok(names.includes('検証・守護'));
 }
}
const [teamA,teamB]=field.players.map(player=>player.factionState.units);
assert.equal(m.getHexDistance(teamA[0],teamB[0]),1,'central opponents are adjacent');
for(const team of [teamA,teamB])for(const companion of team.slice(1))assert.equal(m.getHexDistance(team[0],companion),1,'companions adjacent to own center');
assert.ok(teamA[1].y<teamA[0].y);assert.ok(teamA[2].x<teamA[0].x);
assert.ok(teamB[1].y>teamB[0].y);assert.ok(teamB[2].x>teamB[0].x);
console.log('PASS: 3v3 fixture, adjacent centers, upper/lower/rear placement and piercing/protection skills on all six units.');

assert.equal(m.describeV39TestSkillData({攻撃手段:'素手',物理:15,怯み:25,判定:'攻撃'}),'攻撃手段:素手 物理+15 怯み+25 判定:攻撃');
const described=m.getV39UnitTestTechniques(field.players[0].factionState.units[0]).find(row=>row.name==='検証・出血攻撃');
assert.match(described.source.詳細,/切断\+30/);assert.match(described.source.詳細,/出血\+100/);
assert.match(described.source.詳細,/AP消費:10/);
assert.equal(described.source.出血,100,'description never changes effective values');
console.log('PASS: test skill descriptions show actual source data in template notation.');

assert.equal(m.isV39SelfTargetSkill({}),true);
assert.equal(m.isV39SelfTargetSkill({対象:'自身'}),true);
assert.equal(m.isV39SelfTargetSkill({対象:'味方'}),false);
assert.equal(m.isV39SelfTargetSkill({対象:'相手'}),false);
const guardedState=m.applyV39SkillTriggerCombat(field,field,field.players[0].factionState.units[1],fixture.actions.find(row=>row.効果==='守護'),[],{supportTargetIds:['trigger-test-a']});
assert.equal(guardedState.state.players[0].factionState.units[0].guardedBy.guardianId,'trigger-test-a2');
console.log('PASS: self-target defaults and guarding application.');

const normalBarrier=m.createV39DefenseStructure(field.map,{x:4,y:4},{名前:'双方向遮断結界',効果:'結界/外向攻撃不可',ガード:100,範囲:'単体'}, {id:'caster',ownerPlayerId:'p'},1);
const outwardBarrier=m.createV39DefenseStructure(field.map,{x:4,y:4},{名前:'外向結界',効果:'結界/外向攻撃可',ガード:100,範囲:'単体'}, {id:'caster',ownerPlayerId:'p'},1);
const boundaryMap={...field.map,defenseStructures:[normalBarrier]},inside={x:4,y:4},outside={x:5,y:4};
assert.equal(m.v39RayStructureAtStep(boundaryMap,inside,outside)?.id,normalBarrier.id);
assert.equal(m.v39RayStructureAtStep(boundaryMap,outside,inside)?.id,normalBarrier.id);
boundaryMap.defenseStructures=[outwardBarrier];
assert.equal(m.v39RayStructureAtStep(boundaryMap,inside,outside),null);
assert.equal(m.v39RayStructureAtStep(boundaryMap,outside,inside)?.id,outwardBarrier.id);
assert.equal(m.v39WallStepHeight(boundaryMap,inside,outside,{ownerId:'p'}),0);
assert.equal(m.v39WallStepHeight(boundaryMap,inside,outside,{ownerId:'ally',isFriendlyOwner:id=>id==='p'}),0);
assert.equal(m.v39WallStepHeight(boundaryMap,outside,inside,{ownerId:'enemy'}),Infinity);
assert.equal(m.v39WallStepHeight(boundaryMap,inside,outside,{ownerId:'enemy'}),Infinity);
outwardBarrier.hp=0;assert.equal(m.v39WallStepHeight(boundaryMap,inside,outside,{ownerId:'enemy'}),0);
assert.deepEqual(new Set(field.players[0].factionState.units.map(unit=>unit.race)),new Set(['只人']));
assert.deepEqual(new Set(field.players[1].factionState.units.map(unit=>unit.race)),new Set(['天使']));
assert.equal(new Set(field.players.flatMap(player=>player.factionState.units.map(unit=>unit.className))).size,6);
for(const unit of field.players[1].factionState.units)assert.ok(m.applyV39DerivedCharacterData(unit).skillLevels.飛行>=100);
console.log('PASS: barrier direction, friendly/enemy movement, destruction and distinct human/flying-angel teams.');

const defaultBarrier=m.createV39DefenseStructure(field.map,{x:4,y:4},{名前:'標準結界',効果:'結界',ガード:100,範囲:'単体'},{id:'caster',ownerPlayerId:'p'},1);
assert.equal(defaultBarrier.allowOutgoingAttacks,true);
boundaryMap.defenseStructures=[defaultBarrier];
assert.equal(m.v39RayStructureAtStep(boundaryMap,inside,outside),null);
assert.equal(m.v39RayStructureAtStep(boundaryMap,outside,inside)?.id,defaultBarrier.id);
delete defaultBarrier.allowOutgoingAttacks;
assert.equal(m.v39RayStructureAtStep(boundaryMap,inside,outside),null,'missing property uses new default');
assert.equal(normalBarrier.allowOutgoingAttacks,false,'explicit prohibition takes precedence');
console.log('PASS: barriers allow outgoing attacks by default; explicit prohibition blocks both directions.');

assert.equal(m.resolveV39CombatPopup('abilityDamage',12,'速度').text,'速度 −12');
assert.equal(m.resolveV39CombatPopup('critical',48).text,'48!');
assert.equal(m.resolveV39CombatPopup('curseHeal',10,'速度').text,'速度 呪回復10');
assert.equal(new Set(Object.values(m.V39_COMBAT_POPUPS.types).map(rule=>rule.color)).size,11);
const popupBefore={activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'p',factionState:{units:[{id:'u',x:1,y:1,hp:80,maxHp:100,abilityDamage:{攻撃:20,速度:20},abilityCurses:{速度:20}}],combatRuntime:{}}}]};
const popupAfter=structuredClone(popupBefore),pu=popupAfter.players[0].factionState.units[0];
pu.hp=90;pu.abilityDamage={攻撃:10,速度:10};pu.abilityCurses={速度:10};pu.bleeding={value:15};
popupAfter.players[0].factionState.combatRuntime={activeEffectsByUnitId:{u:[{modifiers:{攻撃:20},expiresAtTurn:4},{modifiers:{攻撃:30},expiresAtTurn:4}]}};
const popups=m.collectV39CombatPopupChanges(popupBefore,popupAfter);
assert.equal(popups.filter(row=>row.popupType==='abilityHeal').length,2);
assert.equal(popups.find(row=>row.popupType==='hpHeal').amount,10);
assert.equal(popups.find(row=>row.popupType==='curseHeal').amount,10);
assert.equal(popups.find(row=>row.popupType==='state').amount,15);
assert.equal(popups.find(row=>row.popupType==='buff').amount,30,'maximum buff is shown, not sum');
assert.deepEqual(m.collectV39CombatPopupChanges(popupAfter,popupAfter),[]);
assert.deepEqual(m.collectV39CombatPopupChanges(popupBefore,{...popupAfter,activeWorldId:'cave:test'}),[]);
const hurt=structuredClone(popupBefore);hurt.players[0].factionState.units[0].abilityDamage.速度=32;hurt.players[0].factionState.units[0].abilityCurses.速度=27;
assert.equal(m.collectV39CombatPopupChanges(popupBefore,hurt).find(row=>row.popupType==='abilityDamage').amount,12);
assert.equal(m.collectV39CombatPopupChanges(popupBefore,hurt).find(row=>row.popupType==='curse').amount,7);
console.log('PASS: configurable popup colors/formats, actual ability/curse/heal/state/buff changes, idempotence and world filtering.');

let cameraScroll=0,preRenders=0;
const tapCamera={preRender(){preRenders++;},getWorldPoint(x,y){return {x:x+cameraScroll,y};}};
const tap=m.captureV39PointerTap(tapCamera,(x,y)=>({x,y}),(_,x,y)=>({x:Math.floor(x/10),y:Math.floor(y/10)}),{},25,35);
cameraScroll=100;
assert.deepEqual(tap.tile,{x:2,y:3});assert.deepEqual(tap.world,{x:25,y:35});assert.equal(preRenders,1);
assert.notDeepEqual(tapCamera.getWorldPoint(25,35),tap.world,'camera movement must not change the tap tile');
const inputSource=readFileSync('frontend/src/v39/map/v39-field-runtime-final.js','utf8');
assert.ok(inputSource.includes('capture:true,signal:inputSignal'));
assert.ok(inputSource.includes('if(select)selectAt(e.clientX,e.clientY,snapshot)'));
assert.ok(inputSource.includes('snapshot?snapshot.tile:resolveTileAtWorld'));
const paidCast={unitId:'u',skillName:'魔法',aimAfterCast:true,apPaid:true,resolvesAtTurn:2};
assert.equal(m.isV39PaidCastRelease(paidCast,'u','魔法',1),false);
assert.equal(m.isV39PaidCastRelease(paidCast,'u','魔法',2),true);
assert.equal(m.isV39PaidCastRelease(paidCast,'u','別の魔法',2),false);
assert.equal(m.isV39PaidCastRelease({...paidCast,apPaid:false},'u','魔法',2),false);
let chosen,focusRenders=0;
window.__v39FieldRuntime={mapData:{w:20,h:20,grid:Array.from({length:20},()=>Array(20).fill('平地'))},game:{scene:{getScenes:()=>[{v39Input:{selectTile(tile){chosen={x:tile.x,y:tile.y};return chosen;}},cameras:{main:{width:100,height:100,zoom:1,centerOn(){},preRender(){focusRenders++;}}}}]}}};
window.getV39GameState=()=>({activeWorldId:'surface'});
assert.equal(m.focusV39MapTile({x:2,y:3},{select:true}),true);
assert.deepEqual(chosen,{x:2,y:3});assert.equal(focusRenders,1);
console.log('PASS: captured pointer tile stays stable after camera movement, focus matrix refresh and paid-cast validation.');

const buffUnit={id:'buff-view',x:2,y:3,hp:100,guard:20,guardExpiresAtTurn:12,
 shield:{skillName:'防護盾',remaining:0,maximum:50,expiresAtTurn:13},barrier:{skillName:'障壁試験',remaining:30,maximum:40,expiresAtTurn:12},
 abilityDamage:{速度:10},abilityCurses:{攻撃:7},bleeding:{value:20,remainingTurns:3}};
window.getV39GameState=()=>({activeWorldId:'surface',timeline:{turnNumber:10},players:[{id:'p',factionState:{units:[buffUnit],combatRuntime:{activeEffectsByUnitId:{'buff-view':[
 {skillName:'弱い強化',modifiers:{攻撃:20},expiresAtTurn:14},
 {skillName:'強い強化',modifiers:{攻撃:30},expiresAtTurn:12},
 {skillName:'短期強化',modifiers:{攻撃:10},expiresAtTurn:11,stackGroup:'oneTurn'},
 {skillName:'変身試験',modifiers:{防御:10},expiresAtTurn:13,stackGroup:'transformation'},
 {skillName:'弱体試験',modifiers:{精神:-10},expiresAtTurn:13},
 {skillName:'期限切れ強化',modifiers:{攻撃:100},expiresAtTurn:9}
]}}}}]});
const buffMarkup=m.renderV39UnitConditions(buffUnit),parts=buffMarkup.split('data-v39-detail-section="状態異常・弱体"');
assert.ok(parts[0].includes('強化・保護'));assert.ok(parts[0].includes('攻撃+20（待機中）'));assert.ok(parts[0].includes('攻撃+30（適用中）'));
assert.ok(parts[0].includes('残り2T'));assert.ok(parts[0].includes('1ターン強化'));assert.ok(parts[0].includes('変身・別枠'));
assert.ok(parts[0].includes('防護盾'));assert.ok(parts[0].includes('盾 0/50'));assert.ok(parts[0].includes('障壁 30/40'));
assert.ok(!buffMarkup.includes('期限切れ強化'));assert.ok(!parts[0].includes('能力ダメージ：速度'));
assert.ok(parts[1].includes('能力ダメージ：速度'));assert.ok(parts[1].includes('呪い：攻撃'));assert.ok(parts[1].includes('出血'));
assert.ok(parts[1].includes('弱体試験'));
console.log('PASS: separate buff/debuff sections, max/waiting status, stacking, shield/barrier values and expiration.');

{
const currentUnit={id:'current-value',x:1,y:1,hp:100,maxHp:100,movement:30,status:{攻撃:100,防御:50,移動:30},skillLevels:{隠密:10},resistances:{炎耐性:5}};
const currentState={activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'p',factionState:{units:[currentUnit],combatRuntime:{activeEffectsByUnitId:{'current-value':[
 {modifiers:{攻撃:20},expiresAtTurn:4},{modifiers:{攻撃:30,隠密:5,炎耐性:20,移動:10},expiresAtTurn:2},
 {modifiers:{攻撃:10},expiresAtTurn:2,stackGroup:'oneTurn'}
]}}}}]};
window.getV39GameState=()=>currentState;
const current=m.resolveV39CurrentUnitAbilities(currentUnit,{state:currentState,mapData:null});
assert.equal(current.status.攻撃,140);assert.equal(current.skillLevels.隠密,15);assert.equal(current.resistances.炎耐性,25);assert.equal(current.status.移動,40);
const currentMarkup=m.renderV39UnitAbility(currentUnit,{mapData:null,fieldIds:true});
assert.match(currentMarkup,/id="detailAtk">140</);assert.match(currentMarkup,/id="detailMov">40</);
assert.match(currentMarkup,/<span>隠密<\/span><span class="v39-ability-value"><b>15<\/b>/);
assert.ok(currentMarkup.includes('炎耐性 +25'));
assert.equal(currentUnit.status.攻撃,100);assert.equal(currentUnit.skillLevels.隠密,10);
currentState.timeline.turnNumber=2;
assert.equal(m.resolveV39CurrentUnitAbilities(currentUnit,{state:currentState,mapData:null}).status.攻撃,120,'expired strongest buff yields to remaining weak buff');
console.log('PASS: ability/skill/resistance/movement displays use the same current values as combat without mutating base values.');

}

{
 const viewUnit={id:'delta-test',x:1,y:1,hp:100,maxHp:100,status:{攻撃:100,速度:30},skillLevels:{隠密:10},resistances:{炎耐性:5},abilityDamage:{速度:20},abilityDamageAppliedDeltas:{status:{速度:-20},skillLevels:{}}};
 const viewState={activeWorldId:'surface',timeline:{turnNumber:1},players:[{id:'p',factionState:{units:[viewUnit],combatRuntime:{activeEffectsByUnitId:{'delta-test':[{modifiers:{攻撃:30,隠密:5,炎耐性:10},expiresAtTurn:3}]}}}}]};
 window.getV39GameState=()=>viewState;
 const display=m.resolveV39UnitAbilityDisplay(viewUnit,{state:viewState,mapData:null});
 assert.equal(display.deltas.status.攻撃,30);assert.equal(display.deltas.status.速度,-20);
 assert.equal(display.deltas.skillLevels.隠密,5);assert.equal(display.deltas.resistances.炎耐性,10);
 const markup=m.renderV39UnitAbility(viewUnit,{mapData:null,fieldIds:true});
 assert.match(markup,/id="detailAtk">130<\/b><small class="v39-ability-delta is-up"[^>]*>\(\+30\)/);
 assert.match(markup,/id="detailSpd">30<\/b><small class="v39-ability-delta is-down"[^>]*>\(-20\)/);
 const permanent={...viewUnit,id:'constant',status:{攻撃:150},skillLevels:{},abilityDamage:{},abilityDamageAppliedDeltas:{status:{},skillLevels:{}}};
 assert.ok(!m.renderV39UnitAbility(permanent,{mapData:null}).includes('class="v39-ability-delta '),'constant base/passive values have no temporary annotation');
 const floored=m.applyAbilityDamage({id:'floor',status:{速度:15,APP:-5},skillLevels:{},abilityDamage:{速度:30,APP:10}});
 const floorDisplay=m.resolveV39UnitAbilityDisplay(floored,{state:{players:[]},mapData:null});
 assert.equal(floorDisplay.deltas.status.速度,-15);assert.equal(floorDisplay.deltas.status.APP,-10);
 const canceled={...viewUnit,status:{攻撃:80},abilityDamage:{攻撃:20},abilityDamageAppliedDeltas:{status:{攻撃:-20},skillLevels:{}}};
 const cancelState={...viewState,players:[{id:'p',factionState:{units:[canceled],combatRuntime:{activeEffectsByUnitId:{'delta-test':[{modifiers:{攻撃:20},expiresAtTurn:3}]}}}}]};
 assert.equal(m.resolveV39UnitAbilityDisplay(canceled,{state:cancelState,mapData:null}).deltas.status.攻撃,0);
 console.log('PASS: green/red sub-values, constant passive baseline, zero-floor accuracy, APP negatives and net-zero cancellation.');
}

{
 assert.equal(m.resolveV39DrainRate({効果:'ドレイン'}),1);assert.equal(m.resolveV39DrainRate({効果:'ドレイン_10'}),.1);
 assert.equal(m.resolveV39DrainRate({効果:'ドレイン_不明'}),0);
 let initial=createState();initial.players[0].factionState.units[0].hp=100;initial.players[0].factionState.units[0].currentHp=100;
 let drained=act(initial,0,{名前:'ドレイン試験',行動:'A',物理:100,効果:'ドレイン_10'},{random});
 const lost=fixture.hp-drained.state.players[0].factionState.units[1].hp;
 assert.equal(drained.state.players[0].factionState.units[0].hp,100+Math.floor(lost*.1));
 initial.players[0].factionState.units[1].hp=1;initial.players[0].factionState.units[1].currentHp=1;
 drained=act(initial,0,{名前:'過剰ドレイン試験',行動:'A',物理:100,効果:'ドレイン'},{random});
 assert.equal(drained.state.players[0].factionState.units[0].hp,101,'overkill does not generate extra healing');
 const poison=act(createState(),0,{名前:'毒低下',行動:'A',効果:'速度ダメージ',毒:50},{random});
 const poisoned=poison.state.players[0].factionState.units[1];assert.equal(poisoned.abilityPoison.速度,33);assert.equal(poisoned.hp,fixture.hp);
 assert.equal(m.recoverAbilityDamage(poisoned,100).abilityPoison.速度,33,'normal healing does not remove poison ability damage');
 const detox=m.applyV39SkillTriggerCombat(poison.state,poison.state,poison.state.players[0].factionState.units[0],{名前:'毒回復',効果:'毒回復',回復:20},[],{random,supportTargetIds:['trigger-test-b']});
 assert.equal(detox.state.players[0].factionState.units[1].abilityPoison.速度,13);
 assert.equal(m.applyAbilityDamage({status:{速度:50},abilityDamage:{速度:5},abilityCurses:{速度:10},abilityPoison:{速度:15}}).status.速度,20);
 console.log('PASS: percentage drain, actual-HP/overkill cap, independent poison damage, normal-heal exclusion and detox recovery.');
}

{
 const source=createState();source.players[0].factionState.units[0].hp=100;source.players[0].factionState.units[0].currentHp=100;
 source.players[0].factionState.units[1].techniques=[];
 const absorbed=act(source,0,{名前:'吸血試験',行動:'A',出血:50,効果:'吸血'},{random});
 const gained=absorbed.state.players[0].factionState.units[1].bleeding.value;
 assert.equal(absorbed.state.players[0].factionState.units[0].hp,100+gained,'blood absorption heals added bleed value, not HP damage');
 assert.equal(absorbed.logs.find(log=>log.event==='吸血').healing,gained);
 let poisoned=act(createState(),0,{名前:'持続毒試験',行動:'A',毒:30,効果時間:3},{random}).state;
 assert.equal(poisoned.players[0].factionState.units[1].hp,fixture.hp,'poison does not also deal direct HP damage');
 assert.equal(poisoned.players[0].factionState.units[1].periodicDamage[0].value,20);
 for(let t=2;t<=4;t++){
   const result=m.advanceV39SkillTriggerTurn(poisoned,t,{random});poisoned=result.state;
   assert.equal(result.logs.find(log=>log.kind==='periodic-damage').damage,20);
   assert.equal(poisoned.players[0].factionState.units[1].hp,fixture.hp-20*(t-1));
   assert.equal(m.advanceV39SkillTriggerTurn(poisoned,t,{random}).changed,false,'same turn is idempotent');
 }
 assert.equal(poisoned.players[0].factionState.units[1].periodicDamage.length,0);
 const burning=act(createState(),0,{名前:'燃焼試験',行動:'A',燃焼:30,効果:'燃焼',効果時間:2},{random}).state;
 assert.equal(burning.players[0].factionState.units[1].periodicDamage[0].kind,'燃焼');
 assert.equal(m.advanceV39SkillTriggerTurn(burning,2,{random}).logs.find(log=>log.kind==='periodic-damage').damage,20);
 let stacked=m.addV39PeriodicStatus({hp:100},'毒',10,1,1);stacked=m.addV39PeriodicStatus(stacked,'毒',20,3,1);
 let step=m.tickV39PeriodicStatus(stacked,2);assert.equal(step.entries.reduce((sum,e)=>sum+e.damage,0),30);
 step=m.tickV39PeriodicStatus(step.unit,3);assert.equal(step.entries.reduce((sum,e)=>sum+e.damage,0),20,'each dose expires independently');
 assert.equal(m.recoverV39PeriodicPoison(step.unit,20).periodicDamage.length,0);
 console.log('PASS: blood-value absorption, poison/burn full-value ticks, duration, idempotence, independent doses and detox.');
}

{
 const actor={id:'holder',level:10,hp:1000,x:5,y:4,status:{HP:1000,攻撃:90,防御:170,命中:100,速度:100}},victim={...actor,id:'held',x:6,level:20,status:{...actor.status,攻撃:70,防御:110}};
 const state={players:[{id:'p',factionState:{units:[actor]}}],enemies:[victim],neutralVillages:[],timeline:{turnNumber:1}};
 assert.equal(m.resolveScaleStatValue('最大_攻撃_防御',actor.status),170);
 for(const [value,stage,penalty]of [[39,0,0],[40,1,.1],[80,2,.25],[140,3,.5]]){
   const bound={...victim,restraint:{value}};
   assert.equal(m.inspectV39Restraint(bound).stage,stage);assert.equal(m.inspectV39Restraint(bound).penalty,penalty);
 }
 let bound=m.addV39Restraint(victim,500,1,actor.id);assert.equal(bound.restraint.value,200);
 let held={...state,enemies:[bound]};
 assert.equal(m.getV39RestraintPenalty(actor,held),.25);assert.equal(m.getV39RestraintPenalty(bound,held),.5);
 assert.equal(m.resolveV39UnitMovementStepCost(null,6,4,7,4,bound,held),Infinity);
 const penalized=m.applyV39RestraintPenalties(bound,held);
 assert.equal(penalized.status.命中,50);assert.equal(penalized.status.速度,50);
 assert.equal(m.applyV39RestraintPenalties(penalized,held).status.命中,50,'no duplicate penalty');
 assert.equal(m.resolveV39CurrentUnitAbilities(bound,{state:held,mapData:null}).status.命中,50);
 const physical=m.computeAttackDamage({attacker:bound,target:actor,skillRow:{物理:10},random:()=>0});
 globalThis.window.getV39GameState=()=>held;
 const magic=m.computeAttackDamage({attacker:{...bound,status:{...bound.status,精神:100}},target:actor,skillRow:{魔法:10,攻撃手段:'魔法'},random:()=>0});
 assert.equal(physical.detail.accuracy,50);assert.equal(magic.detail.accuracy,50);
 assert.equal(m.tickV39Restraint(bound,1).restraint.value,200);
 bound=m.tickV39Restraint(bound,2);assert.equal(bound.restraint.value,189);
 assert.equal(m.tickV39Restraint(bound,2).restraint.value,189);
 assert.equal(m.tickV39Restraint({...victim,restraint:{value:20}},2,{攻撃:15,防御:0}).restraint.value,18.5);
 assert.equal(m.resolveV39RestraintRecovery({攻撃:0,防御:0}),1);
 let after=m.advanceV39SkillTriggerTurn(held,2).state;
 assert.equal(after.enemies[0].restraint.value,189);
 assert.equal(m.advanceV39SkillTriggerTurn(after,2).state.enemies[0].restraint.value,189);
 const mixed=m.addV39Restraint(m.addV39Restraint(victim,50,1),100,1,actor.id);
 const moving={...held,players:[{...state.players[0],factionState:{units:[{...actor,y:3}]}}],enemies:[mixed]};
 m.reconcileV39RestraintLinks(held,moving);assert.equal(moving.enemies[0].restraint.value,50);assert.equal(moving.enemies[0].restraint.grapplerId,undefined);
 assert.equal(mixed.restraint.value,150,'no source mutation');
 for(const change of [{hp:0},{worldId:'cave'},{x:9}]){
   const next={...held,players:[{...state.players[0],factionState:{units:[{...actor,...change}]}}]};
   m.reconcileV39RestraintLinks(held,next);assert.equal(next.enemies[0].restraint,null);
 }
 const nearlyFree={...held,enemies:[{...held.enemies[0],restraint:{value:45,grappleValue:45,grapplerId:actor.id,lastResistanceTurn:1}}]};
 assert.equal(m.advanceV39SkillTriggerTurn(nearlyFree,2).state.enemies[0].restraint,null);
 const row={名前:'binding',拘束:100,判定:'最大_攻撃_防御',対象:'相手',行動:'A',効果:'組み付き'};
 const entry={targetId:victim.id,beforeHp:1000,afterHp:1000,total:0,hitCount:1};
 const result=m.applyV39SkillTriggerCombat(state,state,actor,row,[entry],{random:()=>0});
 assert.ok(result.state.enemies[0].restraint.value>0);
 assert.ok(result.state.enemies[0].restraint.value<270,'target higher defense reduces infliction');
 assert.ok(result.events.some(e=>e.name==='被拘束'));
 assert.ok(m.collectV39CombatPopupChanges(state,result.state).some(e=>e.popupLabel==='拘束'));
 assert.match(m.renderV39UnitConditions(result.state.enemies[0]),/拘束/);
 const missed=m.applyV39SkillTriggerCombat(state,state,actor,row,[{...entry,hitCount:0}],{random:()=>0});assert.equal(missed.state.enemies[0].restraint,undefined);
 console.log('PASS: restraint level cap/stages, max-stat defense, fractional decay, accuracy/evasion, grapple movement/link release, popup and trigger integration.');
}

{
 const base=createState();base.players[0].factionState.units.forEach(unit=>unit.techniques=[]);
 const defender=base.players[0].factionState.units[1];
 const blood={名前:'multi blood counter',行動:'P',発動:'被出血付与',対象:'発動元',効果:'反撃_出血値_切断',AP消費:5,射程:60};
 defender.techniques=[{source:blood}];
 const row={名前:'three bleed hits',行動:'A',対象:'相手',攻撃手段:'テスト',切断:10,出血:100,攻撃回数:3,効果:'必中'};
 const result=act(base,0,row,{random:()=>0}),target=result.state.players[0].factionState.units[1];
 const bleeding=result.logs.filter(log=>log.kind==='bleeding'),counters=result.logs.filter(log=>log.kind==='trigger');
 assert.equal(bleeding.length,3,'state infliction per successful hit');
 assert.equal(target.bleeding.value,bleeding.reduce((sum,log)=>sum+log.amount,0));
 assert.equal(result.events.filter(event=>event.name==='被弾').length,3);
 assert.equal(counters.length,1,'one counter for the full action');
 assert.equal(counters[0].amount,target.bleeding.value,'counter uses sum of actual post-defense bleed values');
 assert.equal(counters[0].power,target.bleeding.value);
 assert.equal(target.ap,95,'counter AP cost paid only once');
 const next=act(result.state,0,row,{random:()=>0});assert.equal(next.logs.filter(log=>log.kind==='trigger').length,1,'new action can counter again');
 const source=base.players[0].factionState.units[0];
 const damageCounter={...blood,名前:'damage counter',発動:'被ダメージ',効果:'反撃_被ダメージ_打撃'};
 const prior=structuredClone(base);prior.players[0].factionState.units[1].techniques=[{source:damageCounter}];
 const after=structuredClone(prior);after.players[0].factionState.units[1].hp=1450;
 const mixed=m.applyV39SkillTriggerCombat(prior,after,source,{...row,効果:'',出血:0},[{targetId:defender.id,beforeHp:1500,afterHp:1450,hitCount:2,hits:[20,0,30],hitResults:[{hit:true,damage:20},{hit:false,damage:0},{hit:true,damage:30}]}],{random:()=>0});
 assert.equal(mixed.events.filter(event=>event.name==='被弾').length,2);assert.equal(mixed.events.filter(event=>event.name==='回避成功').length,1);
 assert.equal(mixed.logs.filter(log=>log.kind==='trigger').length,1);assert.equal(mixed.logs.find(log=>log.kind==='trigger').amount,50,'actual HP damage sum, not raw power');
 const normalHeal={名前:'per-hit heal',行動:'P',発動:'被弾',対象:'自身',効果:'回復',回復:1,射程:60};
 prior.players[0].factionState.units[1].techniques=[{source:normalHeal}];after.players[0].factionState.units[1].techniques=[{source:normalHeal}];
 const healed=m.applyV39SkillTriggerCombat(prior,after,source,row,[{targetId:defender.id,beforeHp:1500,afterHp:1450,hitResults:[{hit:true,damage:20},{hit:false,damage:0},{hit:true,damage:30}]}],{random:()=>0});
 assert.equal(healed.logs.filter(log=>log.skill==='per-hit heal').length,2,'non-counter reactions remain per-hit');
 const dying=structuredClone(base);dying.players[0].factionState.units[1].hp=10;
 const dead=structuredClone(dying);dead.players[0].factionState.units[1]={...dead.players[0].factionState.units[1],hp:0,currentHp:0,state:'死亡'};
 const killed=m.applyV39SkillTriggerCombat(dying,dead,source,row,[{targetId:defender.id,beforeHp:10,afterHp:0,hitResults:[{hit:true,damage:4},{hit:true,damage:20},{hit:true,damage:10}]}],{random:()=>0});
 assert.equal(killed.logs.filter(log=>log.kind==='bleeding').length,1,'living earlier hits apply states but lethal/later hits do not');
 assert.equal(killed.logs.filter(log=>log.kind==='trigger').length,0,'dead unit cannot counter at action end');
 assert.equal(killed.state.players[0].factionState.units[1].hp,0);assert.equal(killed.state.players[0].factionState.units[1].state,'死亡','hit replay never resurrects');
 const capped=m.expandV39SkillHitEntries([{targetId:'low',beforeHp:10,afterHp:0,hitResults:[{hit:true,damage:6},{hit:true,damage:99},{hit:true,damage:99}]}]);
 assert.deepEqual(capped.map(hit=>hit.total),[6,4],'overkill and hits after death are excluded');
 const events=[{name:'被怯み',ownerId:'a',sourceId:'b',cause:'攻撃',amount:20},{name:'被怯み',ownerId:'a',sourceId:'b',cause:'攻撃',amount:15}];
 assert.equal(m.aggregateV39CounterEvents(events)[0].amount,35);
 console.log('PASS: per-hit states/events, misses, one action-end counter, actual-value sums, AP once, new-action reset, ordinary per-hit reactions and lethal/overkill handling.');
}

{
 window.isV39TestMode=()=>true;
 for(const [name,defendingSide,member,counterName] of [
   ['検証・3連撃',0,0,'被弾反撃（検証）'],
   ['検証・3連撃',1,1,'被ダメージ反撃（検証）'],
   ['検証・3連出血',1,0,'流血の刃（検証）']
 ]){
   const fixtureState=m.createV39SkillTriggerFieldFixture({id:'test-fixture',factionState:{}});
   const state={...fixtureState,activeWorldId:'surface',timeline:{turnNumber:1}},actor=state.players[1-defendingSide].factionState.units[0],victim=state.players[defendingSide].factionState.units[member];
   window.getV39GameState=()=>state;
   assert.ok(m.getV39UnitTestTechniques(actor).some(skill=>skill.name===name));
   assert.ok(m.getV39TriggeredSkills(victim).some(skill=>skill.名前===counterName));
   const row=fixture.actions.find(row=>row.名前===name),damage=m.computeAttackDamage({attacker:actor,target:victim,skillRow:row,random:()=>0});
   const after=structuredClone(state),target=after.players[defendingSide].factionState.units[member];
   target.hp=Math.max(0,victim.hp-damage.total);target.currentHp=target.hp;
   const result=m.applyV39SkillTriggerCombat(state,after,actor,row,[{...damage,targetId:victim.id,beforeHp:victim.hp,afterHp:target.hp}],{random:()=>0});
   const reactions=result.logs.filter(log=>log.kind==='trigger'&&log.skill===counterName);
   assert.equal(reactions.length,1,name+' fixture target '+victim.name+' '+JSON.stringify({damage:damage.total,detail:damage.detail,resistances:victim.resistances}));
   if(name==='検証・3連出血')assert.equal(reactions[0].amount,result.logs.filter(log=>log.kind==='bleeding').reduce((sum,log)=>sum+log.amount,0));
   if(counterName==='被ダメージ反撃（検証）'){
     assert.equal(reactions[0].amount,victim.hp-target.hp);
     assert.equal(result.state.players[defendingSide].factionState.units[member].ap,95);
   }
 }
 console.log('PASS: actual skill-test fixture exposes 3-hit actions and ordinary/blood/damage-sum counters on the intended units.');
}

{
 const source={status:{攻撃:0,魔力:0}},target={level:10,status:{防御:100,精神:300},resistances:{物理耐性:20,魔法耐性:60,出血耐性:100,幻覚耐性:100,毒耐性:100,炎耐性:100}};
 for(const [row,expected] of [[{出血:100},40],[{出血:100,判定:'魔力'},20],[{出血:100,判定:'攻撃',攻撃手段:'魔法'},20],[{出血:100,判定:'魔力',攻撃手段:'魔法'},20],[{出血:100,判定:'魔術'},40]]){
   assert.equal(m.resolveV39StateInfliction(source,target,row,'出血'),expected,JSON.stringify(row));
 }
 assert.equal(m.resolveV39StateInfliction(source,target,{幻覚:100},'幻覚'),20,'mental effects use spirit even for physical resistance');
 assert.equal(m.resolveV39StateInfliction(source,target,{幻覚:100,攻撃手段:'魔法'},'幻覚'),10);
 assert.equal(m.resolveV39StateInfliction(source,target,{精神攻撃:100},'精神攻撃'),20);
 assert.equal(m.resolveV39StateInfliction(source,target,{精神攻撃:100},'精神'),20,'existing mental field alias');
 assert.equal(m.resolveV39HarmfulEffectPower(source,target,{},100,'毒'),40,'individual poison resistance is not stacked');
 assert.equal(m.resolveV39HarmfulEffectPower(source,target,{},100,'燃焼'),40,'individual flame resistance is not stacked for state infliction');
 assert.equal(m.resolveV39StateInfliction({...source,status:{魔力:0,攻撃:0}},target,{拘束:100,判定:'魔力'},'拘束',{judgement:'最大_攻撃_防御'}),20,'restraint scaling override preserves original magic classification');
 const penetrator={status:{耐性貫通:20}};
 assert.equal(m.resolveV39StateInfliction(penetrator,target,{出血:100},'出血'),50,'resistance penetration uses selected physical resistance');
 assert.equal(m.resolveV39StateInfliction(source,{...target,level:20},{出血:100},'出血'),30,'selected resistance keeps level-fixed reduction');
 console.log('PASS: effect-based defense, mental/spirit exceptions, magic judgment OR magic method, individual resistance exclusion, restraint classification, level reduction and penetration.');
}

{
 for(const key of ['物理軽減','魔法軽減','遠隔軽減','物理耐性','魔法耐性','射撃耐性','遠隔耐性']){
   const reduced=m.resolveV39ResistanceReduction(500,10,100,0,key);
   assert.equal(reduced.resistanceRate,0,key);assert.equal(reduced.reducedPower,400,key);
 }
 assert.equal(m.resolveV39ResistanceReduction(500,10,100,0,'炎耐性').resistanceRate,1);
 assert.equal(m.resolveV39ResistanceReduction(500,10,100,20,'物理軽減').reducedPower,420);
 assert.equal(m.resolveV39ResistanceReduction(500,20,100,0,'遠隔軽減').reducedPower,300);
 assert.deepEqual(m.normalizeV39ReductionFields({物理耐性:20,魔法耐性:30,射撃耐性:40}),{物理軽減:20,魔法軽減:30,遠隔軽減:40});
 assert.deepEqual(m.normalizeV39ReductionFields({物理軽減:30,物理耐性:20}),{物理軽減:30},'no duplicate old/new value stacking');
 const oldUnit={status:{},resistances:{物理耐性:100,魔法耐性:100,射撃耐性:100,炎耐性:100}};
 assert.equal(m.readV39UnitResistance(oldUnit,'遠隔軽減'),100);
 const active=m.applyV39ActiveCombatEffects(oldUnit,[{modifiers:{物理耐性:20,魔法軽減:30,射撃耐性:10}}]);
 assert.equal(active.resistances.物理軽減,120);assert.equal(active.resistances.魔法軽減,130);assert.equal(active.resistances.遠隔軽減,110);
 assert.equal(active.resistances.物理耐性,undefined);
 const passive=m.collectV39PassiveBonuses([{名前:'old saved passive',行動:'P',物理耐性:15,射撃耐性:10}]);
 assert.equal(passive.resistances.物理軽減,15);assert.equal(passive.resistances.遠隔軽減,10);
 const city=m.parseV39CityEffectSettings({耐性:'物理軽減20/魔法耐性30/射撃40/炎20'});
 assert.deepEqual(city.resistances,{物理軽減:20,魔法軽減:30,遠隔軽減:40,炎耐性:20});
 assert.equal(city.diagnostics.length,0);
 const actor={hp:1000,status:{命中:100,攻撃:0}},victim={...oldUnit,hp:1000,level:10,status:{防御:0,速度:1}};
 for(const type of ['物理','魔法','射撃']){
   const hit=m.computeAttackDamage({attacker:actor,target:victim,skillRow:{[type]:500,効果:'必中'},random:()=>0});
   assert.ok(hit.total>0,type+' must not become immune at reduction 100');assert.equal(hit.detail.resistanceRate,0);
 }
 const flame=m.computeAttackDamage({attacker:actor,target:victim,skillRow:{炎:500,効果:'必中'},random:()=>0});assert.equal(flame.total,0,'attribute resistance keeps percentage immunity');
 console.log('PASS: flat physical/magic/ranged reductions, level scaling/penetration, attribute resistance unchanged, saved-key migration, active/passive buffs and city settings.');
}

{
 const row={魔法:100,判定:'魔力'},attacker={status:{魔力:0}},target={level:1,status:{精神:0},resistances:{魔法軽減:100}};
 const partial=m.inspectV39StatusResistance({attacker,target,skillRow:row});
 assert.equal(partial.resistanceRate,0);assert.equal(partial.effectivePower,90);assert.ok(partial.chance>0,'reduction 100 no longer gives automatic status immunity');
 assert.equal(m.inspectV39StatusResistance({attacker,target:{...target,resistances:{魔法軽減:10000}},skillRow:row}).chance,0);
 console.log('PASS: forced-status magic reduction is fixed only; full rejection requires sufficient fixed value.');
}

{
 const actor={id:'stagger-source',hp:100,status:{}};
 const target={id:'stagger-target',hp:100,ap:40,level:10,status:{防御:20}};
 const row={怯み:40};
 assert.equal(m.resolveV39StaggerDamage(actor,{...target,hp:80},row,()=>1),20);
 assert.equal(m.resolveV39StaggerDamage(actor,{...target,hp:80,resistances:{怯み耐性:20}},row,()=>1),8);
 assert.equal(m.resolveV39StaggerDamage({...actor,status:{耐性貫通:20}},{...target,hp:80,resistances:{怯み耐性:20}},row,()=>1),20);
 const before={enemies:[actor,target],timeline:{turnNumber:1}};
 const after={...before,enemies:[actor,{...target,hp:40}]};
 const entries=[{targetId:target.id,beforeHp:100,afterHp:40,hitResults:[
  {hit:true,damage:20},{hit:false,damage:0},{hit:true,damage:40}
 ]}];
 const result=m.applyV39SkillTriggerCombat(before,after,actor,row,entries,{random:()=>1});
 assert.equal(result.state.enemies[1].hp,40);
 assert.equal(result.state.enemies[1].ap,0);
 assert.deepEqual(result.events.filter(event=>event.name==='怯ませ').map(event=>event.amount),[20,20]);
 const lowAp={...after,enemies:[actor,{...after.enemies[1],ap:10}]};
 const capped=m.applyV39SkillTriggerCombat(before,lowAp,actor,row,entries,{random:()=>1});
 assert.equal(capped.state.enemies[1].ap,0);
 assert.equal(capped.events.some(event=>['怯ませ','被怯み'].includes(event.name)),false);
 console.log('PASS: stagger uses post-hit HP, applies resistance and penetration, and checks the actual AP loss per hit.');
}

{
 const actor={id:'control-source',hp:100,status:{}};
 const target={id:'control-target',hp:100,ap:50,guard:12,shield:{remaining:10},barrier:{remaining:8},status:{}};
 const before={enemies:[actor,target],timeline:{turnNumber:4}};
 const entries=[{targetId:target.id,beforeHp:100,afterHp:100,hitResults:[{hit:true,damage:0},{hit:true,damage:0}]}];
 const result=m.applyV39SkillTriggerCombat(before,before,actor,{精神攻撃:60,魔法:100,体幹:35,効果:'睡眠/沈黙/転倒'},entries,{random:()=>1});
 const afflicted=result.state.enemies[1];
 assert.deepEqual(afflicted.controlStatuses,{
  睡眠:{value:0,expiresAtTurn:5},沈黙:{value:0,expiresAtTurn:6}
 });
 assert.equal(afflicted.ap,30,'two hits of 60 produce one turn and subtract 20 AP');
 m.attachV39HitStatusPopups(entries,result.logs);
 assert.deepEqual(entries[0].statusPopups.filter(popup=>popup.popupLabel==='睡眠'),[
  {popupType:'state',popupLabel:'睡眠',amount:60,hitIndex:0},
  {popupType:'state',popupLabel:'睡眠',amount:60,hitIndex:1},
  {popupType:'apDamage',popupLabel:'睡眠',amount:20,hitIndex:1}
 ]);
 assert.equal(m.resolveV39CombatPopup('apDamage',20,'睡眠').text,'睡眠 AP−20');
 assert.notEqual(m.resolveV39CombatPopup('apDamage',20,'睡眠').color,m.resolveV39CombatPopup('hpDamage',20).color);
 assert.equal(afflicted.guard,0);
 assert.equal(afflicted.shield,target.shield);
 assert.equal(afflicted.barrier,target.barrier);
 assert.equal(m.getV39ActionBlock(afflicted,5,'move'),'転倒');
 const low={...afflicted,ap:19};
 assert.equal(m.standUpV39Unit(low,5),low);
 assert.equal(m.standUpV39Unit(afflicted,4),afflicted);
 const standing=m.standUpV39Unit(afflicted,5);
 assert.equal(standing.ap,10);
 assert.equal(m.getV39ActionBlock(standing,4,'move'),'睡眠');
 assert.equal(m.getV39ActionBlock(standing,5,'move'),'');
 assert.equal(m.getV39ActionBlock(standing,5,'skill',{攻撃手段:'魔法'}),'沈黙');
 assert.equal(m.getV39ActionBlock(standing,6,'skill',{攻撃手段:'魔法'}),'');
 console.log('PASS: cumulative control statuses, turn expiry, knockdown protection and stand-up AP.');
}

{
 const actor={id:'element-source',hp:100,ap:100,status:{}};
 const target={id:'element-target',hp:100,ap:250,status:{}};
 const before={enemies:[actor,target],timeline:{turnNumber:4}};
 const entries=[{targetId:target.id,beforeHp:100,afterHp:100,hitResults:[{hit:true,damage:0}]}];
 const apply=(state,row,hits=entries,supportTargetIds=[])=>m.applyV39SkillTriggerCombat(state,state,actor,row,hits,{supportTargetIds}).state;
 const shockSkill={雷:220,効果:'感電'};
 const shock=m.applyV39SkillTriggerCombat(before,before,actor,shockSkill,entries);
 const shocked=shock.state;
 assert.equal(shocked.enemies[1].ap,130);
 const popupEntries=structuredClone(entries);
 m.attachV39HitStatusPopups(popupEntries,shock.logs);
 assert.deepEqual(popupEntries[0].statusPopups.map(({popupType,popupLabel,amount})=>[popupType,popupLabel,amount]),[['apDamage','感電',120]]);
 assert.equal(apply(before,{雷:220}).enemies[1].controlStatuses,undefined);
 assert.equal(apply(before,{感電:220,効果:'感電'}).enemies[1].controlStatuses,undefined);
 const resistant={...before,enemies:[actor,{...target,level:10,resistances:{雷耐性:50}}]};
 assert.equal(apply(resistant,shockSkill).enemies[1].controlStatuses.感電.value,85);
 const shockedNext=m.advanceV39SkillTriggerTurn(shocked,5).state;
 assert.equal(shockedNext.enemies[1].ap,30);
 assert.equal(m.advanceV39SkillTriggerTurn(shockedNext,6).state.enemies[1].ap,30);
 const frozen=apply(before,{氷:35,効果:'凍結'});
 assert.equal(frozen.enemies[1].ap,215);
 const immune={...before,enemies:[actor,{...target,resistances:{氷耐性:100}}]};
 assert.equal(apply(immune,{氷:35,効果:'凍結'}).enemies[1].controlStatuses,undefined);
 const next=m.advanceV39SkillTriggerTurn(frozen,5).state;
 assert.equal(next.enemies[1].controlStatuses.凍結.value,25);
 assert.equal(next.enemies[1].ap,190);
 assert.equal(m.advanceV39SkillTriggerTurn(next,5).changed,false);
 assert.equal(apply(frozen,{炎:10}).enemies[1].controlStatuses.凍結,undefined);
 assert.equal(apply(frozen,{炎:10},[{...entries[0],hitResults:[{hit:false,damage:0}]}]).enemies[1].controlStatuses.凍結.value,35);
 assert.equal(apply(frozen,{効果:'浄化'},[],[target.id]).enemies[1].controlStatuses.凍結,undefined);
 const frozenCaster={...frozen,enemies:[{...actor,controlStatuses:{凍結:{value:35}}},target]};
 assert.equal(apply(frozenCaster,{炎:10},[]).enemies[0].controlStatuses.凍結,undefined);
 console.log('PASS: shock AP per turn, freeze AP and natural thaw, fire hit/use and purification.');
}

{
 const actor={id:'curse-source',hp:100,status:{}};
 const target={id:'curse-target',hp:80,status:{防御:100}};
 const state={enemies:[actor,target],timeline:{turnNumber:1}};
 const hits=[{targetId:target.id,beforeHp:80,afterHp:80,hitCount:1}];
 const afflicted=m.applyV39SkillTriggerCombat(state,state,actor,{効果:'回復阻害',呪い:80},hits).state;
 assert.equal(afflicted.enemies[1].abilityCurses.回復阻害,40);
 assert.equal(m.reduceV39BlockedHealing(afflicted.enemies[1],60),20);
 assert.equal(m.reduceV39BlockedHealing(afflicted.enemies[1],20),0);
 const healed=m.applyV39SkillTriggerCombat(afflicted,afflicted,actor,{回復:20,効果:'呪い回復'},[],{supportTargetIds:[target.id]}).state;
 assert.equal(healed.enemies[1].abilityCurses.回復阻害,20);
 console.log('PASS: healing block uses resisted curse power and curse recovery lowers it.');
}

{
 const skill={名前:'聖域',効果:'詠唱中攻撃不可',効果時間:'詠唱'};
 const cast={unitId:'caster',skillName:skill.名前,skillRow:skill,aimAfterCast:true,apPaid:true,resolvesAtTurn:6};
 const state={players:[{factionState:{combatRuntime:{pendingActionsByUnitId:{caster:cast}}}}]};
 assert.equal(m.isV39CastingMagic(skill),true);
 assert.equal(m.isV39CastAttackLocked(state,'caster',5),true);
 assert.equal(m.isV39CastAttackLocked(state,'other',5),false);
 assert.equal(m.isV39CastAttackLocked(state,'caster',6),false);
 assert.equal(m.isV39PaidCastRelease(cast,'caster',skill.名前,6),true);
 const faction={...state.players[0].factionState,units:[{id:'caster',hp:100,ap:40},{id:'other',hp:100,ap:100}]};
 const marked=m.settleV39CastingActions(faction,5);
 assert.equal(marked.units[0].lastActionTurn,5);
 assert.equal(marked.combatRuntime.pendingActionsByUnitId.caster,undefined,'40 AP cannot maintain the cast');
 assert.equal(marked.units[1],faction.units[1]);
 assert.equal(m.settleV39CastingActions(marked,5),marked);
 assert.equal(m.settleV39CastingActions(marked,6),marked);
 const unpaid={...faction,combatRuntime:{pendingActionsByUnitId:{caster:{...cast,apCost:60,apPaid:false}}}};
 assert.equal(m.settleV39CastingActions(unpaid,5).combatRuntime.pendingActionsByUnitId.caster,undefined);
 const paid=m.settleV39CastingActions({...faction,units:[{...faction.units[0],ap:80}]},5);
 assert.equal(paid.units[0].ap,20);
 assert.equal(paid.combatRuntime.pendingActionsByUnitId.caster.apPaid,true);
 assert.equal(m.settleV39CastingActions(paid,5),paid);
 assert.equal(m.settleV39CastingActions(paid,6),paid,'ready casts have no maintenance fee');
 const cancelled={...faction,combatRuntime:{pendingActionsByUnitId:{}}};
 assert.equal(m.settleV39CastingActions(cancelled,5),cancelled,'manual cancellation avoids the maintenance fee');
 const longer={...paid,units:[{...paid.units[0],ap:100}],combatRuntime:{pendingActionsByUnitId:{caster:{...paid.combatRuntime.pendingActionsByUnitId.caster,resolvesAtTurn:7}}}};
 assert.equal(m.settleV39CastingActions(longer,6).units[0].ap,40,'each active turn charges its own maintenance fee');
 assert.equal(m.isV39CastAttackLocked({players:[]},'caster',5),false);
 cast.skillRow={...skill,効果:'攻撃不能'};
 assert.equal(m.isV39CastAttackLocked(state,'caster',5),true);
 cast.skillRow.効果時間='2t';
 assert.equal(m.isV39CastAttackLocked(state,'caster',5),false);
 console.log('PASS: sanctuary attack lock is limited to its caster and casting phase, with legacy compatibility.');
}

{
 const actor={id:'numeric-source',hp:100,status:{}};
 const target={id:'numeric-target',hp:100,ap:100,maxAp:100,status:{反応:100,精神:25,命中:100},skillLevels:{索敵:100,看破:75}};
 const state={enemies:[actor,target],timeline:{turnNumber:3}};
 const entries=[{targetId:target.id,beforeHp:100,afterHp:100,hitCount:1}];
 const fatigued=m.applyV39SkillTriggerCombat(state,state,actor,{盲目:40,幻覚:60,呪い:100,効果:'疲労'},entries).state;
 const afflicted=m.applyV39SkillTriggerCombat(fatigued,fatigued,actor,{毒:30,効果:'麻痺'},entries).state;
 const victim=afflicted.enemies[1];
 assert.deepEqual(victim.numericStatuses,{盲目:20,幻覚:30,疲労:100,麻痺:30});
 assert.equal(m.resolveDetectionScoutValue(victim),50);
 assert.equal(m.resolveV39MaxAp(victim),80);
 assert.equal(victim.ap,50);
 assert.equal(victim.periodicDamage,undefined);
 const apply=row=>m.applyV39SkillTriggerCombat(state,state,actor,row,entries).state.enemies[1];
 assert.equal(apply({毒:50}).periodicDamage[0].value,50);
 assert.equal(apply({毒:50,効果:'麻痺/毒'}).periodicDamage[0].value,50);
 assert.equal(apply({毒:50,効果:'麻痺/毒'}).numericStatuses.麻痺,50);
 const combined=apply({毒:50,呪い:80,効果:'麻痺'});
 assert.equal(combined.numericStatuses.麻痺,130);
 assert.equal(combined.periodicDamage,undefined);
 assert.equal(apply({疲労:100,麻痺:30,効果:'疲労/麻痺'}).numericStatuses,undefined);
 assert.equal(m.applyV39ControlTurnAp({...victim,ap:80},4,{restored:true}).ap,50);
 const healed=m.applyV39SkillTriggerCombat(afflicted,afflicted,actor,{回復:15,効果:'麻痺回復/盲目回復'},[],{supportTargetIds:[target.id]}).state.enemies[1];
 assert.equal(healed.numericStatuses.麻痺,15);
 assert.equal(healed.numericStatuses.盲目,5);
 assert.equal(healed.ap,50);
 const buffed={...state,enemies:[actor,{...target,shield:{remaining:10,expiresAtTurn:5}}],
  enemyCombatRuntime:{activeEffectsByEnemyId:{[target.id]:[{expiresAtTurn:7,modifiers:{攻撃:20}}]}}};
 const dispel=before=>m.applyV39SkillTriggerCombat(before,before,actor,{魔法:75,効果:'強化解除'},entries).state;
 const first=dispel(buffed),second=dispel(first);
 assert.equal(first.enemyCombatRuntime.activeEffectsByEnemyId[target.id][0].expiresAtTurn,7);
 assert.equal(second.enemyCombatRuntime.activeEffectsByEnemyId[target.id][0].expiresAtTurn,6);
 assert.equal(second.enemies[1].shield.expiresAtTurn,4);
 assert.equal(second.enemies[1].dispelRemainder,50);
 const mage={...actor,status:{魔力:40,精神:50}};
 const scaled=m.applyV39SkillTriggerCombat(buffed,buffed,mage,{魔法:75,効果:'強化解除'},entries).state;
 assert.equal(scaled.enemies[1].dispelRemainder,5);
 assert.equal(scaled.enemyCombatRuntime.activeEffectsByEnemyId[target.id][0].expiresAtTurn,6);
 const explicit=m.applyV39SkillTriggerCombat(buffed,buffed,mage,{魔法:80,判定:'精神',効果:'強化解除'},entries).state;
 assert.equal(explicit.enemies[1].dispelRemainder,20);
 console.log('PASS: numeric status resistance, detection, AP cap/loss, named recovery and timed dispel.');
}

{
 assert.equal(m.resolveV39ChainDepth({効果:'連鎖'}),1);
 assert.equal(m.resolveV39ChainDepth({効果:'必中/連鎖_3'}),3);
 assert.equal(m.resolveV39ChainDepth({効果:'連鎖_5'}),0);
 const entries=[{targetId:'a',x:0,hitCount:1},{targetId:'b',x:2,hitCount:1},{targetId:'miss',x:8,hitCount:0}];
 const targets=[{id:'shared',x:1},{id:'stops',x:3},{id:'after',x:4},{id:'unreached',x:9}];
 const strikes=[];
 m.runV39ChainAttacks({depth:4,entries,targets,canSpread:(origin,target)=>Math.abs(origin.x-target.x)===1,
  strike(id,scale,stage,followUp){strikes.push([id,scale,stage,followUp]);return id!=='stops';}});
 assert.deepEqual(strikes,[['a',0.5,1,true],['b',0.5,1,true],['shared',0.5,1,false],['stops',0.5,1,false]]);
 console.log('PASS: chain origins must hit, overlapping spreads hit once and a missed spread does not propagate.');
}

{
 const scaled=m.computeSkillScaledTriplet({雷:40,効果:'感電',盲目:10,ガード:20,判定:'魔力'},{魔力:100});
 assert.equal(m.formatV39SkillCombatValues(scaled),'威80 守40 状100');
 const paralysis={毒:60,効果:'麻痺'};
 assert.equal(m.formatV39SkillCombatValues({...m.computeSkillScaledTriplet(paralysis),power:m.resolveAttackPower(paralysis,{})}),'状60');
 assert.equal(m.formatV39SkillCombatValues({power:0,guard:0,state:0,healing:50}),'回50');
 assert.equal(m.formatV39SkillCombatValues({power:0,guard:0,state:0,healing:0}),'');
 assert.equal(m.computeSkillScaledTriplet({効果:'速度ダメージ',全威力:50}).state,50);
 console.log('PASS: skill summary displays power, guard and scaled numeric/legacy status power.');
}

{
 const actor={status:{命中:100}};
 const target={level:1,status:{防御:0},barrier:{remaining:30},shield:{remaining:35},guard:20};
 const attack=m.computeAttackDamage({attacker:actor,target,skillRow:{物理:100,効果:'必中'},random:()=>0});
 assert.equal(attack.barrierAbsorbed,30);
 const damage=m.applyV39GuardToDamage(target,attack);
 assert.equal(damage.shieldAbsorbed,35);
 assert.equal(damage.guardAbsorbed,attack.total-35);
 assert.equal(damage.guardRemaining,55-attack.total);
 assert.equal(damage.total,0);
 const multi=m.applyV39GuardToDamage(target,{hits:[20,0,40],hitResults:[{hit:true},{hit:false},{hit:true}]});
 assert.deepEqual(multi.hits,[0,0,5]);
 assert.equal(multi.shieldRemaining,0);
 assert.equal(multi.guardRemaining,0);
 console.log('PASS: barrier, shield, guard absorption order and remaining pools across hits.');
}

{
 const actor={status:{攻撃:2,命中:100}};
 const target={level:1,status:{防御:0},shield:{remaining:0.1}};
 const params={attacker:actor,target,skillRow:{物理:9,判定:'攻撃',効果:'必中'},random:()=>0};
 assert.equal(m.computeAttackDamage(params).hits[0],6,'fractional scaled power survives until HP damage');
 const pending=m.computeAttackDamage({...params,deferRounding:true});
 assert.ok(Math.abs(pending.hits[0]-5.508)<1e-8);
 assert.equal(m.applyV39GuardToDamage(target,pending).hits[0],5,'shield is applied before rounding');
 const critical=m.computeAttackDamage({...params,skillRow:{物理:6,Cr率:100,Cr威力:25,効果:'必中',攻撃回数:2}});
 assert.deepEqual(critical.hits,[5,5]);
 assert.equal(critical.total,10,'two hits of 4.5 round separately');
 console.log('PASS: HP damage rounds once per hit after growth, critical and shield.');
}
