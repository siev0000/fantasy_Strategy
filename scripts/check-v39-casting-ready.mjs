import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/casting',{recursive:true});
const browser=await chromium.launch();
try {for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:800}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);});
 const fixture=async()=>{await page.waitForFunction(()=>!window.isV39MapInputLocked?.());return page.evaluate(()=>{
  window.startV39ExpeditionTest();const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),u=p.factionState.units[0];
  const caster={...u,id:'caster',race:'只人',className:'エレメンタラー',class:'エレメンタラー',name:'詠唱試験官',testOnly:true,testMovementMinimum:100,x:3,y:2,position:[3,2],worldId:'surface',hp:100,currentHp:100,maxHp:100,ap:100,currentAp:100,lastActionTurn:0,waitTurnNumber:0,pendingTeleport:null,techniques:[],acquiredSkillNames:[],testSkillNames:[],equipment:[{name:'剣',slot:'武器1',quality:'common'}],status:{HP:1000,魔力:100,攻撃:100,防御:100,精神:100,命中:1000,速度:100,索敵:1000,移動:100,SIZ:100}};
  window.setV39GameState({players:[{...p,factionState:{...p.factionState,units:[caster],selectedUnitId:'caster',selectedSquadId:'solo',squads:[{id:'solo',unitIds:['caster']}],combatRuntime:{}}}],enemies:[{id:'victim',name:'標的',x:7,y:2,worldId:'surface',hp:10000,currentHp:10000,maxHp:10000,ap:0,maxAp:0,techniques:[],equipment:[{name:'剣',slot:'武器1',quality:'common'}],status:{HP:10000,防御:0,精神:0,速度:0,移動:1}}],enemyNests:[],neutralVillages:[],worldEnvironment:{...s.worldEnvironment,activeDisasters:[]}});
  window.activateV39FooterTab('squad');document.querySelector('[data-squad-detail-tab="action"]')?.click();window.refreshV39SquadDerivedUI?.();
 });};
 const pending=()=>page.evaluate(()=>window.getV39ActiveFactionState().combatRuntime.pendingActionsByUnitId?.caster);
 await fixture();await page.locator('[data-v39-attack-name="火球"]').click();
 assert.equal((await pending()).target,null);assert.equal((await pending()).aimAfterCast,true);
 assert.equal(await page.evaluate(()=>window.getV39AttackSession()),null);
 assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap),20);
 await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,hp:u.hp-1,currentHp:u.hp-1}))}}))});});
 assert(await pending(),'damage alone does not cancel casting');
 await page.waitForFunction(()=>document.querySelector('.v39-cast-status')?.textContent.includes('詠唱 1T'));
 await page.waitForFunction(()=>window.getV39MapEntityMarker?.('caster')?.getByName?.('v39-cast-icon')?.getData('fieldSymbol')==='cast');
 assert.equal(await page.locator('[data-v39-unit-id="caster"] [data-v39-cast-symbol]').getAttribute('data-v39-cast-symbol'),'cast');
 assert.equal(await page.evaluate(()=>!!window.getV39MapEntityMarker('caster').getByName('v39-cast-label')),false);
 await page.evaluate(()=>{const marker=window.getV39MapEntityMarker('caster'),camera=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;camera.setZoom(1.2);camera.centerOn(marker.x,marker.y);});
 await page.screenshot({path:`output/web-game/casting/casting-${width}.png`});
 await page.evaluate(async()=>{window.waitV39SelectedUnit();await window.advanceV39TestTurns(1);});
 assert(await pending(),'waiting does not cancel');
 await page.evaluate(async()=>{window.waitV39SelectedUnit();await window.advanceV39TestTurns(2);});
 assert(await pending(),'ready spell persists across turns');
 assert.equal(await page.evaluate(()=>window.getV39GameState().enemies.find(u=>u.id==='victim')?.hp),10000,'no automatic attack');
 await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({enemies:s.enemies.map(u=>u.id==='victim'?{...u,x:4,y:2}:u)});window.importV39SaveJson(window.exportV39SaveJson(0));window.activateV39FooterTab('squad');document.querySelector('[data-squad-detail-tab="action"]')?.click();});
 assert(await pending(),'save/load retains ready spell');
 await page.waitForFunction(()=>!!document.querySelector('[data-v39-cast-release]'));
 await page.waitForFunction(()=>window.getV39MapEntityMarker?.('caster')?.getByName?.('v39-cast-icon')?.getData('fieldSymbol')==='ready');
 assert.equal(await page.locator('[data-v39-unit-id="caster"] [data-v39-cast-symbol]').getAttribute('data-v39-cast-symbol'),'ready');
 await page.screenshot({path:`output/web-game/casting/ready-${width}.png`});
 const ap=await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap);
 await page.locator('[data-v39-cast-release]').click();await page.evaluate(()=>window.executeV39AttackAt(30,30));
 assert(await pending(),'invalid target does not consume prepared spell');
 await page.evaluate(()=>{window.executeV39AttackAt(4,2);const random=Math.random;try{Math.random=()=>0;window.executeV39AttackAt(4,2);}finally{Math.random=random;}});
 assert.equal(await pending(),undefined);assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap),ap,'release does not charge AP twice');
 assert(await page.evaluate(()=>window.getV39GameState().enemies.find(u=>u.id==='victim').hp<10000),'late selected target receives damage');
 await fixture();await page.locator('[data-v39-attack-name="火球"]').click();
 await page.evaluate(async()=>{await window.advanceV39TestTurns(1);const s=window.getV39GameState();window.setV39GameState({enemies:s.enemies.map(u=>u.id==='victim'?{...u,x:4,y:2}:u)});});await page.locator('[data-v39-attack-name="剣"]').click();assert(await pending(),'selection alone does not cancel');
 await page.evaluate(()=>window.executeV39AttackAt(4,2));assert.equal(await pending(),undefined,'non-magic action cancels');
 await fixture();await page.locator('[data-v39-attack-name="火球"]').click();
 await page.evaluate(async()=>{await window.advanceV39TestTurns(1);});
 await page.locator('[data-v39-attack-name="川の鞭"]').click();
 assert.equal((await pending()).skillName,'川の鞭','another magic replaces the only prepared spell');
 await fixture();await page.locator('[data-v39-attack-name="火球"]').click();
 await page.evaluate(()=>{window.startV39SelectedUnitMove();const tile=window.getV39UnitMovePreview().reachable.find(t=>t.cost>0);const [x,y]=tile.key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));document.getElementById('moveOk').click();});
 await page.waitForFunction(()=>!window.isV39MapInputLocked());assert.equal(await pending(),undefined,'movement cancels');
 await fixture();await page.locator('[data-v39-attack-name="火球"]').click();
 await page.locator('[data-v39-cast-cancel]').click();assert.equal(await pending(),undefined);assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap),20,'cancel gives no refund');
 if(width===390){
  await fixture();
  const retarget=await page.evaluate(async()=>{
   const s=window.getV39GameState(),caster=s.players[0].factionState.units[0],row=caster.techniques.find(t=>t.name==='火球').source,turn=s.timeline.turnNumber;
   const enemy={id:'enemy-mage',name:'敵術者',x:4,y:2,worldId:'surface',hp:1000,currentHp:1000,maxHp:1000,ap:0,maxAp:0,aggressive:true,techniques:[{name:row.名前,source:row}],equipment:[],status:{HP:1000,魔力:100,精神:100,命中:1000,索敵:1000,移動:1}};
   window.setV39GameState({enemies:[enemy],enemyCombatRuntime:{pendingActionsByEnemyId:{'enemy-mage':{enemyId:enemy.id,targetUnitId:'old-missing-target',skillName:row.名前,skillRow:row,resolvesAtTurn:turn,origin:{x:4,y:2,worldId:'surface'}}},lastActionTurnByEnemyId:{},cooldownsByEnemyId:{}}});
   const hp=window.getV39ActiveFactionState().units[0].hp,random=Math.random;
   try{Math.random=()=>0;await window.runV39EnemyTurn(turn,{presentation:false});}finally{Math.random=random;}
   return {before:hp,after:window.getV39ActiveFactionState().units[0].hp,pending:!!window.getV39GameState().enemyCombatRuntime.pendingActionsByEnemyId['enemy-mage']};
  });
  assert(retarget.after<retarget.before,'enemy chooses a current target after casting');assert.equal(retarget.pending,false);
  await fixture();
  const npcEntry=await page.evaluate(async()=>{
   const s=window.getV39GameState(),player=s.players[0],row=player.factionState.units[0].techniques.find(t=>t.name==='火球').source;
   const queued=window.executeV39FactionCombatAction({playerId:player.id,attackerId:'caster',targetUnitId:'victim',skillRow:row});
   const noDamage=window.getV39GameState().enemies.find(u=>u.id==='victim').hp===10000;
   await window.advanceV39TestTurns(1);const current=window.getV39GameState();window.setV39GameState({enemies:current.enemies.map(u=>u.id==='victim'?{...u,x:4,y:2}:u)});
   const ap=window.getV39ActiveFactionState().units[0].ap,random=Math.random;
   let fired;try{Math.random=()=>0;fired=window.executeV39FactionCombatAction({playerId:player.id,attackerId:'caster',targetUnitId:'victim',skillRow:row});}finally{Math.random=random;}
   const f=window.getV39ActiveFactionState();return {queued,noDamage,fired,apPreserved:ap===f.units[0].ap,pending:!!f.combatRuntime.pendingActionsByUnitId.caster};
  });
  assert.deepEqual(npcEntry,{queued:true,noDamage:true,fired:true,apPreserved:true,pending:false});
 }
 assert.deepEqual(errors,[]);console.log(`${width}: cast before aim, waiting, ready save/load, late aim, single AP payment, physical/movement/manual cancellation passed`);
 await page.close();
}} finally {await browser.close();}
