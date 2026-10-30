import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/cave-regeneration';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 const input=process.env.V39_SAVE_FILE?readFileSync(process.env.V39_SAVE_FILE,'utf8'):null;
 const result=await page.evaluate(async input=>{
  window.closeV39PlayModeSelection();
  if(input)window.importV39SaveJson(input);else{await window.setV39TestMode(true);await window.startV39ExpeditionTest();}
  await window.waitForV39MapRenderSettled();
  const cave=window.getV39ActiveFactionState().units.find(u=>u.worldId?.startsWith('cave:')&&u.hp>0),id=cave.worldId;
  const original=window.exportV39SaveJson(0);
  // Load a surface save with a missing cave. Keep two units to check non-overlapping placement.
  window.viewV39OwnedUnitWorld(cave.id,{surface:true});await window.waitForV39MapRenderSettled();
  const save=JSON.parse(window.exportV39SaveJson(0)),p=save.gameState.players.find(p=>p.id===save.gameState.activePlayerId);
  const baseUnits=structuredClone(window.getV39ActiveFactionState().units);
  p.factionState.units.push({...structuredClone(cave),id:'regeneration-second-unit',name:'復旧配置テスト'});
  const surfaceContent=w=>JSON.stringify([w.map.grid,w.map.heightLevelMap,w.map.specialMap,w.spatial.enemies.map(u=>[u.id,u.x,u.y,u.hp]),w.spatial.facilitiesByTile]);
  const surfaceBefore=surfaceContent(save.gameState.explorationWorlds.surface);
  delete save.gameState.explorationWorlds[id];
  window.importV39SaveJson(JSON.stringify(save));await window.waitForV39MapRenderSettled();
  const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),world=s.explorationWorlds[id];
  const units=f.units.filter(u=>u.worldId===id&&u.hp>0),logs=f.activityLog.filter(l=>l.category==='洞窟復旧'&&l.detail.worldId===id);
  if(!world?.map?.entrances?.length||!world.spatial.enemies?.length)throw Error('Normal generation did not create cave/enemies');
  if(logs.length!==1)throw Error('Missing or duplicate recovery log');
  if(new Set(units.map(u=>`${u.x},${u.y}`)).size!==units.length)throw Error('Recovered units overlap');
  const first=units.find(u=>u.id===cave.id),entry=world.map.entrances[0];
  if(first.x!==entry.x||first.y!==entry.y)throw Error('First recovered unit not at entrance');
  for(const unit of units){
    if(unit.hp!==cave.hp||unit.ap!==cave.ap||JSON.stringify(unit.equipment)!==JSON.stringify(cave.equipment))throw Error('Unit resources changed');
    if(world.map.grid[unit.y]?.[unit.x]!=='洞窟'||world.spatial.enemies.some(e=>e.x===unit.x&&e.y===unit.y))throw Error('Unsafe placement');
  }
  if(surfaceContent(s.explorationWorlds.surface)!==surfaceBefore)throw Error('Unrelated surface changed');
  const fields=u=>[u.id,u.worldId,u.x,u.y,u.hp,u.ap,u.equipment];
  for(const unit of baseUnits.filter(u=>u.worldId!==id))if(JSON.stringify(fields(f.units.find(u=>u.id===unit.id)))!==JSON.stringify(fields(unit)))throw Error('Unrelated unit changed');
  window.viewV39OwnedUnitWorld(cave.id);await window.waitForV39MapRenderSettled();
  window.activateV39FooterTab('squad');
  const worldContent=w=>JSON.stringify([w.map.grid,w.map.caveSeed,w.map.caveSites,w.spatial.enemies.map(u=>[u.id,u.x,u.y,u.hp])]);
  const valid=window.exportV39SaveJson(0),validWorld=worldContent(JSON.parse(valid).gameState.explorationWorlds[id]);
  window.importV39SaveJson(valid);await window.waitForV39MapRenderSettled();
  if(window.getV39ActiveFactionState().activityLog.filter(l=>l.category==='洞窟復旧'&&l.detail.worldId===id).length!==1)throw Error('Valid reload regenerated again');
  if(worldContent(JSON.parse(window.exportV39SaveJson(0)).gameState.explorationWorlds[id])!==validWorld)throw Error('Valid cave changed on reload');
  window.viewV39OwnedUnitWorld(cave.id,{surface:true});await window.waitForV39MapRenderSettled();
  const transient=window.getV39GameState();delete transient.explorationWorlds[id];
  window.setV39GameState({explorationWorlds:transient.explorationWorlds});
  if(!window.viewV39OwnedUnitWorld(cave.id))throw Error('Selection did not recover missing cave');
  await window.waitForV39MapRenderSettled();
  if(window.getV39ActiveFactionState().activityLog.filter(l=>l.category==='洞窟復旧'&&l.detail.worldId===id).length!==2)throw Error('Selection recovery not logged exactly once');
  return {id,entry,units:units.map(u=>[u.id,u.x,u.y]),log:logs[0].message,originalSize:original.length};
 },input);
 await page.screenshot({path:`${out}/regenerated-${width}.png`});
 const exit=await page.evaluate(async()=>{window.leaveV39Cave();await window.waitForV39MapRenderSettled();return window.getV39GameState().activeWorldId;});
 assert.equal(exit,'surface','regenerated cave must retain a usable surface exit');
 assert.deepEqual(errors,[]);console.log(`${width}: missing cave regenerated, units at safe entrance, HP/AP/equipment preserved, surface unchanged, one persistent log`,result);
 await page.close();
}}finally{await browser.close();}
