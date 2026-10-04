import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='output/web-game/cave-native';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
try{
 await page.goto('http://127.0.0.1:3022',{waitUntil:'networkidle'});
 await page.evaluate(()=>{window.originalFooter=document.querySelector('.footer');window.originalList=document.getElementById('squadMemberList');});
 await page.locator('[data-v39-cave-test]').click();await page.getByRole('button',{name:'探索ゲーム',exact:true}).click();await page.getByRole('button',{name:'探索開始',exact:true}).click();await page.waitForTimeout(1200);
 assert.equal(await page.locator('.cave-game-map,.cave-footer-body').count(),0);
 assert.equal(await page.evaluate(()=>document.querySelector('.footer')===window.originalFooter&&document.getElementById('squadMemberList')===window.originalList),true);
 assert.equal(await page.locator('#squadMemberList [data-v39-unit-id]').count(),3);
 assert.ok(await page.locator('#v39-phaser-field canvas').count());
 await page.locator('[data-squad-detail-tab="action"]').click();
 const attack=page.locator('[data-v39-attack-name]').first();await attack.waitFor();
 const fixture=await page.evaluate(async()=>{
  const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
  const {getHexNeighborCoords}=await import('/src/lib/hex-grid.js');
  const enemy=state.enemies[0],tile=getHexNeighborCoords(map.w,map.h,enemy.x,enemy.y).find(t=>map.grid[t.y][t.x]==='洞窟');
  const faction=window.getV39ActiveFactionState(),unit=faction.units[0];
  window.updateV39ActiveFactionState({units:faction.units.map(u=>u.id===unit.id?{...u,x:tile.x,y:tile.y}:u)});
  return {enemy:enemy.id,x:enemy.x,y:enemy.y,unit:unit.id};
 });
 await attack.click();assert.ok(await page.evaluate(()=>window.getV39AttackSession()));
 await page.evaluate(({x,y})=>window.executeV39AttackAt(x,y),fixture);await page.waitForTimeout(1800);
 assert.ok(await page.evaluate(id=>window.getV39ActiveFactionState().units.find(u=>u.id===id).ap<100,fixture.unit),'normal combat consumes actual unit AP');
 await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});});
 assert.ok(await page.evaluate(()=>window.getV39GameState().timeline.turnNumber>=2),'normal game turn');
 const saved=await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>({id:u.id,hp:u.hp,ap:u.ap,equipment:u.equipment})));
 // Add a surface snapshot fixture, then verify only locations change on exit/reentry.
 await page.evaluate(()=>{
  const s=window.getV39GameState(),c=structuredClone(window.__v39FieldRuntime.mapData);delete c.isUnderground;
  s.explorationWorlds.surface={map:c,spatial:{...s.explorationWorlds[s.activeWorldId].spatial,enemies:[]},visibility:{}};
  s.players=s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,locationsByWorld:{...u.locationsByWorld,surface:{x:5,y:8}}}))}}));
  window.setV39GameState({players:s.players,explorationWorlds:s.explorationWorlds});window.leaveV39Cave();
 });
 assert.deepEqual(await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>({id:u.id,hp:u.hp,ap:u.ap,equipment:u.equipment}))),saved);
 await page.evaluate(()=>window.enterV39Cave({seed:'expedition-1'}));await page.waitForTimeout(700);
 assert.deepEqual(await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>({id:u.id,hp:u.hp,ap:u.ap,equipment:u.equipment}))),saved);
 await page.screenshot({path:`${dir}/desktop.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${dir}/mobile.png`});
 assert.deepEqual(errors,[]);writeFileSync(`${dir}/report.json`,JSON.stringify({sameDOM:true,nativeCombat:true,nativeTurn:true,roundTripKeepsUnitState:true,errors},null,2));console.log('Native cave UI, combat, turn, unit identity and round-trip passed');
}finally{await browser.close();}
