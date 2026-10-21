import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';
const out='output/web-game/village-raid';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
 await openV39TestSuite(page,'village');await page.locator('[data-test-action=negotiation-hub-start]').click();
 await page.waitForFunction(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length===4&&!window.isV39MapInputLocked?.());
 await page.evaluate(()=>{
   window.__v39SuppressCombatEffects=true;const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard'),p=s.players.find(p=>p.id===s.activePlayerId),actor=p.factionState.units[0],guard=v.defenseUnits[0];
   window.__raidFixture={playerId:p.id,villageId:v.id,actorId:actor.id,guardId:guard.id};
   window.__raidSkill={名前:'襲撃攻撃確認',行動:'A',判定:'攻撃',攻撃手段:'爪',切断:50,射程:10,AP消費:10,命中:10000,効果:'必中'};
   window.setV39GameState({enemies:[],players:s.players.map(p=>({...p,factionState:{...p.factionState,selectedUnitId:p.id===s.activePlayerId?actor.id:p.factionState.selectedUnitId,units:p.factionState.units.map((u,i)=>({...u,x:u.id===actor.id?7:2+i,y:u.id===actor.id?7:2,position:u.id===actor.id?[7,7]:[2+i,2],hp:50000,currentHp:50000,maxHp:50000,ap:100,currentAp:100,status:{...u.status,防御:0,精神:0}}))}})),neutralVillages:s.neutralVillages.map(row=>row.id!==v.id?row:{...row,relationsByPlayerId:{...row.relationsByPlayerId,[p.id]:90},defenseUnits:[{...guard,techniques:[{source:{名前:"爪",行動:"A",判定:"攻撃",攻撃手段:"爪",切断:5,射程:10,AP消費:30,効果:"必中"}}],x:7,y:6,position:[7,6],hp:5000,currentHp:5000,maxHp:5000,ap:100,currentAp:100,status:{...guard.status,防御:0,精神:0,攻撃:100,命中:10000}}]})});
   window.__raidBefore=structuredClone(window.getV39GameState());
 });
 const before=await page.evaluate(()=>{const f=window.__raidFixture,s=window.getV39GameState(),p=s.players.find(p=>p.id===f.playerId);return {blocked:window.executeV39FactionCombatAction({playerId:p.id,attackerId:f.actorId,targetUnitId:f.guardId,skillRow:window.__raidSkill}),ap:p.factionState.units[0].ap};});
 assert.equal(before.blocked,false,'peaceful guard cannot be attacked');
 await page.locator('#v39-hub-tab-talk').click();await page.locator('[data-hub-talk=raid]').click();await page.locator('[data-hub-primary]').click();
 assert(await page.locator('#v39-village-menu').isHidden(),'raid returns to field for combat');
 const raid=await page.evaluate(()=>{const s=window.getV39GameState(),f=window.__raidFixture,v=s.neutralVillages.find(v=>v.id===f.villageId),old=window.__raidBefore.neutralVillages.find(row=>row.id===f.villageId);return {hostile:v.hostilePlayerIds,relation:v.relationsByPlayerId[f.playerId],population:v.population,playerId:f.playerId,stocks:JSON.stringify(s.players.map(p=>p.factionState.settlements)),oldStocks:JSON.stringify(window.__raidBefore.players.map(p=>p.factionState.settlements)),oldPopulation:old.population};});
 assert(raid.hostile.includes(raid.playerId));assert.equal(raid.relation,-60);assert.equal(raid.stocks,raid.oldStocks,'raid declaration does not mint loot');assert.equal(raid.population,raid.oldPopulation,'no abstract population damage');
 const hit=await page.evaluate(()=>{const f=window.__raidFixture,s=window.getV39GameState(),beforeActor=s.players.find(p=>p.id===f.playerId).factionState.units.find(u=>u.id===f.actorId).hp,beforeGuard=s.neutralVillages.find(v=>v.id===f.villageId).defenseUnits[0].hp,other=s.players.filter(p=>p.id!==f.playerId).map(p=>p.factionState.units.map(u=>u.hp));let ok;const random=Math.random;try{Math.random=()=>0;ok=window.executeV39FactionCombatAction({playerId:f.playerId,attackerId:f.actorId,targetUnitId:f.guardId,skillRow:window.__raidSkill});}finally{Math.random=random;}
 const n=window.getV39GameState(),v=n.neutralVillages.find(v=>v.id===f.villageId),actor=n.players.find(p=>p.id===f.playerId).factionState.units.find(u=>u.id===f.actorId);return {ok,beforeActor,beforeGuard,guard:v.defenseUnits[0].hp,actor:actor.hp,ap:actor.ap,other,afterOther:n.players.filter(p=>p.id!==f.playerId).map(p=>p.factionState.units.map(u=>u.hp))};});
 assert(hit.ok&&hit.guard<hit.beforeGuard,'hostile guard takes actual damage');assert.equal(hit.ap,90);assert(hit.actor<hit.beforeActor,'guard counterattack damages raider');assert.deepEqual(hit.other,hit.afterOther,'unrelated player not hostile');
 const defense=await page.evaluate(()=>{const f=window.__raidFixture,s=window.getV39GameState(),actor=s.players.find(p=>p.id===f.playerId).factionState.units.find(u=>u.id===f.actorId),before=actor.hp;window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});const random=Math.random;let result;try{Math.random=()=>0;result=window.runV39NeutralVillageDefenseTurn();}finally{Math.random=random;}const next=window.getV39GameState(),v=next.neutralVillages.find(v=>v.id===f.villageId);return {result,hostile:v.hostilePlayerIds,playerId:f.playerId,before,after:next.players.find(p=>p.id===f.playerId).factionState.units.find(u=>u.id===f.actorId).hp,repeat:window.runV39NeutralVillageDefenseTurn()};});
 assert(defense.hostile.includes(defense.playerId),'hostility survives save/load');assert(defense.result.attacks>0&&defense.after<defense.before,'guard AI targets raiding player');assert.equal(defense.repeat.attacks+defense.repeat.moves,0,'no double AI action');
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 assert(await page.evaluate(()=>{const f=window.__raidFixture;return window.getV39GameState().neutralVillages.find(v=>v.id===f.villageId).hostilePlayerIds.includes(f.playerId);}),'hostility saved after real battle');
 const finish=await page.evaluate(()=>{const f=window.__raidFixture,s=window.getV39GameState(),other=s.players.find(p=>p.id!==f.playerId);const otherActor=other.factionState.units[0];
 const blocked=window.executeV39FactionCombatAction({playerId:other.id,attackerId:otherActor.id,targetUnitId:f.guardId,skillRow:{...window.__raidSkill,射程:1000}});
 window.setV39GameState({players:s.players.map(p=>p.id!==f.playerId?p:{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===f.actorId?{...u,hp:u.maxHp,currentHp:u.maxHp,ap:100,currentAp:100,state:'生存'}:u)}})});
 const random=Math.random;let killed;try{Math.random=()=>0;killed=window.executeV39FactionCombatAction({playerId:f.playerId,attackerId:f.actorId,targetUnitId:f.guardId,skillRow:{...window.__raidSkill,名前:'襲撃撃破確認',全威力:100000,切断:100000}});}finally{Math.random=random;}
 const v=window.getV39GameState().neutralVillages.find(v=>v.id===f.villageId),g=v.defenseUnits.find(u=>u.id===f.guardId);return {blocked,killed,hp:g.hp,state:g.state,expires:g.deadExpireTurn,population:v.population};});
 assert.equal(finish.blocked,false,'other player remains unable to attack village');assert(finish.killed&&finish.hp===0&&finish.state==='死亡'&&finish.expires>0,'guard death follows corpse lifecycle');assert.equal(finish.population,raid.population);
 await page.screenshot({path:out+'/raid-'+width+'.png'});assert.deepEqual(errors,[]);console.log(width+': UI raid, neutral gate, no free loot, guard damage/counter/AI, player isolation and save passed');await page.close();
}}finally{await browser.close();}
