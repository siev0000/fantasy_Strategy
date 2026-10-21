import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/world-exits',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:850}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const result=await page.evaluate(async()=>{
  const {advanceV39WorldExits}=await import('/src/lib/v39-world-exit-rules.js');
  const {createV39EventEnemy}=await import('/src/v39/ai/v39-enemy-spawn.js');
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39HegemonyAreaTest();
  const setLeader=point=>{const state=window.getV39GameState();window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:point.x,y:point.y}:u)}}))});};
  const portal=window.__v39FieldRuntime.mapData.hegemonyEntrances[0];setLeader(portal);window.enterV39Cave();await window.waitForV39MapRenderSettled();
  await new Promise(resolve=>setTimeout(resolve,200));
  const map=window.__v39FieldRuntime.mapData,exit=map.entrances[0];setLeader(exit);
  const enemy=createV39EventEnemy({id:'exit-attacker',name:'退出検証敵',race:'只人',className:'ファイター',level:30,x:6,y:10,
    metadata:{aggressive:true},equipment:[{slot:'武器1',name:'剣'}]});
  if(!enemy)throw Error('Cannot create attack fixture');
  window.setV39GameState({enemies:[{...enemy,worldId:window.getV39GameState().activeWorldId,aggressive:true}]});
  window.leaveV39Cave();
  const pending=window.getV39GameState(),units=pending.players[0].factionState.units,leader=window.getV39SelectedSquadUnit();
  const marker=window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39CaveSites?.list.some(child=>child.name==='v39-world-exit-marker');
  const worlds=window.captureV39ExplorationWorlds();
  const early=advanceV39WorldExits(pending,worlds,pending.timeline.turnNumber);
  const dead=structuredClone(pending);dead.players[0].factionState.units.find(u=>u.id===leader.id).hp=0;
  const cancelledDead=advanceV39WorldExits(dead,worlds,pending.timeline.turnNumber+1);
  const moved=structuredClone(pending);moved.players[0].factionState.units.find(u=>u.id===leader.id).x--;
  const cancelledMove=advanceV39WorldExits(moved,worlds,pending.timeline.turnNumber+1);
  const background=advanceV39WorldExits({...pending,activeWorldId:'surface'},worlds,pending.timeline.turnNumber+1);
  // Save/load must keep the wait instead of completing or resetting it.
  window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
  const restored=window.getV39SelectedSquadUnit().pendingWorldExit;
  let seenEnemyPhase=false,attackedBeforeExit=false,enemyHpBefore;
  const original=window.runV39EnemyTurn;
  window.runV39EnemyTurn=async(...args)=>{
    const before=window.getV39GameState(),unit=before.players[0].factionState.units.find(u=>u.id===leader.id);
    if(before.activeWorldId===pending.activeWorldId){seenEnemyPhase=unit?.worldId===pending.activeWorldId;enemyHpBefore=unit?.hp;}
    const report=await original(...args);
    if(before.activeWorldId===pending.activeWorldId){const after=window.getV39GameState().players[0].factionState.units.find(u=>u.id===leader.id);attackedBeforeExit=after?.hp<enemyHpBefore;}
    return report;
  };
  try{await window.advanceV39Turn({skipUnactedFocus:true});}finally{window.runV39EnemyTurn=original;}
  const final=window.getV39GameState();
  return {marker,worldBefore:pending.activeWorldId,allApZero:units.every(u=>u.ap===0),earlyWorld:early.players[0].factionState.units[0].worldId,
    deadCancelled:cancelledDead.notices[0]?.message.includes('中止')&&cancelledDead.players[0].factionState.units.every(u=>!u.pendingWorldExit),
    moveCancelled:cancelledMove.notices[0]?.message.includes('中止'),backgroundView:background.viewWorldId,
    backgroundMoved:background.players[0].factionState.units.every(u=>u.worldId==='surface'),
    restored:restored?.readyTurn===pending.timeline.turnNumber+1,seenEnemyPhase,attackedBeforeExit,worldAfter:final.activeWorldId,
    cleared:final.players[0].factionState.units.every(u=>!u.pendingWorldExit),positions:final.players[0].factionState.units.map(u=>`${u.x},${u.y}`)};
 });
 assert(result.marker);assert(result.allApZero);assert.equal(result.earlyWorld,result.worldBefore);
 assert(result.deadCancelled&&result.moveCancelled);assert.equal(result.backgroundView,null);assert(result.backgroundMoved);
 assert(result.restored&&result.seenEnemyPhase);assert(result.attackedBeforeExit,'enemy must hit while the party is still inside');
 assert.equal(result.worldAfter,'surface');assert(result.cleared);assert.equal(new Set(result.positions).size,2);
 await page.screenshot({path:'output/web-game/world-exits/after-exit.png'});
 await page.evaluate(async()=>{
  const state=window.getV39GameState(),portal=window.__v39FieldRuntime.mapData.hegemonyEntrances[0];
  window.setV39GameState({players:state.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id===p.factionState.selectedUnitId?{...u,x:portal.x,y:portal.y}:u)}}))});
  window.enterV39Cave();await window.waitForV39MapRenderSettled();
 });
 await page.waitForTimeout(250);await page.screenshot({path:'output/web-game/world-exits/exit-marker.png'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
