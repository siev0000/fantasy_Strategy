import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/npc-start',{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(()=>{window.closeV39PlayModeSelection();window.openFieldSettingsModal();});
 await page.locator('#v39-field-npc-count').fill('2');
 await page.screenshot({path:`output/web-game/npc-start/settings-${width}.png`});
 await page.evaluate(()=>{window.__v39PendingInitialSovereignProfile={playerId:'player-1',race:'只人',className:'ファイター',characterName:'検証統治者',villageName:'検証拠点'};});
 await page.locator('#v39-field-generate').click();
 await page.waitForFunction(()=>window.getV39GameState().players.filter(p=>p.isPlayer===false).length===2);
 assert.equal(await page.evaluate(()=>window.getV39GameState().gameSettings.npcFactionCount),2);
 const placed=await page.evaluate(()=>{
   const random=Math.random;Math.random=()=>0;
   try{window.startV39LocalSession(1,{playMode:'single-test',gameSettings:{npcFactionCount:2}});}finally{Math.random=random;}
   const setup=window.getV39GameState();window.setV39GameState({players:setup.players.map(p=>p.isPlayer===false?p:{...p,race:p.race||'只人',factionState:{...p.factionState,units:p.factionState.units.map((u,i)=>i?u:{...u,isSovereign:true,unitType:'統治者'})}})});
   window.generateV39TestFieldWithSeed({w:60,h:60,patternId:'realistic'},'npc-start-test');
   return window.autoPlaceV39InitialBases('player-1');
 });
 assert(placed.ok,placed.reason);
 await page.waitForFunction(()=>window.getV39GameState().players.every(p=>p.factionState.settlements.some(v=>v.placed)));
 const snapshot=await page.evaluate(()=>{const s=window.getV39GameState();return {players:s.players.map(p=>({id:p.id,isPlayer:p.isPlayer,controller:p.controllerParticipantId,units:p.factionState.units.map(u=>({id:u.id,x:u.x,y:u.y,isSovereign:u.isSovereign,isMob:u.isMob,equipment:u.equipment,hp:u.hp,maxHp:u.maxHp,level:u.level,unitType:u.unitType,combatProfile:u.combatProfile})),villages:p.factionState.settlements.filter(v=>v.placed)})),order:s.timeline.playerTurnOrder,participants:s.sessionParticipants};});
 assert.equal(snapshot.players.length,3);assert.deepEqual(snapshot.order,['player-1']);
 assert(snapshot.players.filter(p=>!p.isPlayer).every(p=>p.controller===''&&p.units.length>0));
 const npcs=snapshot.players.filter(p=>!p.isPlayer);
 assert.deepEqual(npcs.map(p=>p.units.length).sort(),[3,3],'initial roster: one hero and two armies');
 for(const npc of npcs){
   assert.equal(npc.units.filter(u=>u.isSovereign).length,1);
   assert(npc.units.filter(u=>!u.isSovereign).every(u=>u.isMob&&u.equipment.length>0&&u.hp>0));
   for(const army of npc.units.filter(u=>!u.isSovereign)){
     assert.equal(army.combatProfile?.mode,'army');assert.match(army.unitType,/軍隊/);
     assert(army.combatProfile.hpMultiplier>1&&army.combatProfile.attackCount>1);
     assert((army.combatProfile.memberCount??army.combatProfile.populationCost)>1);
     assert(army.level>=3&&army.hp===army.maxHp);
   }
   assert.equal(new Set(npc.units.map(u=>`${u.x},${u.y}`)).size,npc.units.length,'initial units do not overlap');
 }
 assert.deepEqual(snapshot.participants[0].assignedPlayerIds,['player-1']);
 const unitIds=snapshot.players.flatMap(p=>p.units.map(u=>u.id));assert.equal(new Set(unitIds).size,unitIds.length);
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 assert.equal(await page.evaluate(()=>window.getV39GameState().players.filter(p=>p.isPlayer===false).length),2);
 assert(await page.evaluate(()=>window.getV39GameState().players.filter(p=>p.isPlayer===false).every(p=>p.factionState.units.filter(u=>u.combatProfile?.mode==='army').length===2)),'army profiles survive save/load');
 await page.evaluate(()=>window.openFieldSettingsModal());
 assert.equal(await page.locator('#v39-field-local-player-count').inputValue(),'1','reopening must not count NPCs as human factions');
 assert.equal(await page.locator('#v39-field-npc-count').inputValue(),'2');
 await page.evaluate(()=>window.closeFieldSettingsModal());
 const round=await page.evaluate(async()=>{
   const enemy=window.runV39EnemyTurn;window.runV39EnemyTurn=async()=>{};
   try{await window.advanceV39Turn({skipUnactedFocus:true});}finally{window.runV39EnemyTurn=enemy;}
   const s=window.getV39GameState();return {active:s.activePlayerId,npcs:s.players.filter(p=>p.isPlayer===false).map(p=>p.factionState.aiState)};
 });
 assert.equal(round.active,'player-1');assert(round.npcs.every(ai=>ai.lastProcessedTurn>0),'NPC AI runs during a real round');
 const ai=await page.evaluate(()=>{
   const state=window.getV39GameState(),npc=state.players.find(p=>p.isPlayer===false),map=window.__v39FieldRuntime.mapData;
   const at=npc.factionState.units[0];
   const key='10,10',players=state.players.map(p=>p.id!==npc.id?p:{...p,factionState:{...p.factionState,aiState:{lastProcessedTurn:0},exploration:{...p.factionState.exploration,
     discoveredFeaturesByTile:{[key]:{kind:'victory-landmark',key,x:10,y:10,name:'既知の覇権地'}},discoveredFactionsByPlayerId:{}}}});
   const result=window.runV39FactionAiTurn({...state,players},state.timeline.turnNumber+1,map);
   return result.reports.find(r=>r.playerId===npc.id);
 });
 assert.equal(ai.objective.type,'victory-landmark');assert.equal(ai.objective.targetTileKey,'10,10');
 await page.evaluate(async()=>{await window.setV39TestMode(true);window.openV39TestTools();});
 await page.locator('[data-test-tab=diagnostics]').click();
 const diagnostic=page.locator('[data-test-section=npc-ai]');
 if(!await diagnostic.evaluate(el=>el.open))await diagnostic.locator(':scope > summary').click();
 assert.equal(await diagnostic.locator('[data-npc-diagnostic-select] option').count(),2);
 await diagnostic.locator('[data-npc-diagnostic-view=actions]').click();
 assert.equal(await diagnostic.locator('[data-npc-diagnostic]').count(),1);
 for(const npc of npcs){
   await diagnostic.locator('[data-npc-diagnostic-select]').selectOption(npc.id);
   assert.equal(await diagnostic.locator('[data-npc-diagnostic]').getAttribute('data-npc-diagnostic'),npc.id);
   for(const unit of npc.units)assert.equal(await diagnostic.locator(`[data-npc-unit="${unit.id}"]`).count(),1);
   assert.match(await diagnostic.locator('[data-npc-current-objective]').innerText(),/現在の目標/);
   assert(!/前回処理/.test(await diagnostic.innerText()));
 }
 await diagnostic.locator('[data-npc-diagnostic-view][aria-selected=true]').press('Home');
 assert.equal(await diagnostic.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),'resources');
 await diagnostic.locator('[data-npc-diagnostic-view][aria-selected=true]').press('End');
 assert.equal(await diagnostic.locator('[data-npc-diagnostic-content]').getAttribute('data-npc-diagnostic-content'),'actions');
 await page.evaluate(selectedId=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.map(p=>p.isPlayer!==false?p:{...p,factionState:{...p.factionState,aiState:{...p.factionState.aiState,objective:p.id===selectedId?{type:'resource-search',resource:'死体',targetName:'死体の供給元を探索'}:{type:'victory-landmark',hold:true,targetName:'防衛する覇権地',targetTileKey:'10,10'}}}})});},npcs[1].id);
 assert.equal(await diagnostic.locator('[data-npc-diagnostic]').getAttribute('data-npc-diagnostic'),npcs[1].id,'selection survives state refresh');
 assert.match(await diagnostic.locator('[data-npc-current-objective]').innerText(),/死体/);
 await diagnostic.locator('[data-npc-diagnostic-select]').selectOption(npcs[0].id);
 assert.match(await diagnostic.locator('[data-npc-current-objective]').innerText(),/防衛する覇権地/);
 await diagnostic.locator('[data-npc-diagnostic-select]').selectOption(npcs[1].id);
 assert.match(await diagnostic.locator('[data-npc-current-objective]').innerText(),/死体/);
 await page.screenshot({path:`output/web-game/npc-start/diagnostics-${width}.png`});
 await page.evaluate(id=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.filter(p=>p.id!==id)});},npcs[1].id);
 assert.equal(await diagnostic.locator('[data-npc-diagnostic]').getAttribute('data-npc-diagnostic'),npcs[0].id,'removed selection falls back to remaining faction');
 const maximum=await page.evaluate(()=>{const random=Math.random;Math.random=()=>0.999;
   try{const npc=window.startV39LocalSession(1,{playMode:'single-test',gameSettings:{npcFactionCount:1}}).players.find(p=>p.isPlayer===false);return {count:npc.factionState.units.length,armies:npc.factionState.units.filter(u=>u.combatProfile?.mode==='army').length};}finally{Math.random=random;}});
 assert.equal(maximum.count,3);assert.equal(maximum.armies,2,'another race also receives two actual armies');
 const zero=await page.evaluate(()=>window.startV39LocalSession(1,{playMode:'single-test',gameSettings:{npcFactionCount:0}}));
 assert.equal(zero.players.length,1);assert.deepEqual(errors,[]);
 assert.match(await diagnostic.innerText(),/NPC勢力は登録されていません/);
 console.log(width+': settings → NPC creation/placement, human-only turns, unique units, save, known victory objective and zero count passed');
 await page.close();
}}finally{await browser.close();}
