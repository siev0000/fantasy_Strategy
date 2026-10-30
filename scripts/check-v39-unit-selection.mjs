import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/unit-selection',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:475,height:869}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();});
 await page.waitForFunction(()=>window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.v39Input&&!window.isV39MapInputLocked());
 const ids=await page.evaluate(()=>{window.activateV39FooterTab('squad');return window.getV39ActiveFactionState().units.slice(0,2).map(u=>u.id);});
 await page.locator(`[data-v39-unit-id="${ids[0]}"]`).click();
 const result=await page.evaluate(async ids=>{
  const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id===ids[0]);
  const before={x:scene.v39SelectedTile.x,y:scene.v39SelectedTile.y};
  scene.v39Input.selectTile({x:u.x+2,y:u.y});
  let tileEvents=0;const listener=()=>tileEvents++;window.addEventListener('v39:tile-selected',listener);
  window.getV39MapEntityMarker(ids[0]).emit('pointerdown',{},0,0,{stopPropagation(){}});
  const after={x:scene.v39SelectedTile.x,y:scene.v39SelectedTile.y};
  window.removeEventListener('v39:tile-selected',listener);
  const cast={kind:'magic',aimAfterCast:true,skillName:'火球',resolvesAtTurn:999,origin:{x:u.x,y:u.y,worldId:'surface'}};
  window.updateV39ActiveFactionState({combatRuntime:{...f.combatRuntime,pendingActionsByUnitId:{[u.id]:cast}}});
  await window.waitForV39MapRenderSettled();window.refreshV39MapEntities();
  const marker=window.getV39MapEntityMarker(ids[0]);
  scene.cameras.main.setZoom(1.2);scene.cameras.main.centerOn(marker.x,marker.y);
  return {before,after,expected:{x:u.x,y:u.y},tileEvents,owner:!!marker.getByName('v39-unit-owner-border'),ring:!!marker.getByName('v39-cast-ring'),icon:marker.getByName('v39-cast-icon')?.getData('fieldSymbol'),circleStrokes:marker.list.filter(o=>o.type==='Arc'&&o.isStroked&&o.name!=='v39-cast-badge').length};
 },ids);
 assert.deepEqual(result.before,result.expected);assert.deepEqual(result.after,result.expected);assert.equal(result.tileEvents,0);assert(result.owner);assert(!result.ring);assert.equal(result.circleStrokes,0);
 assert.equal(result.icon,'cast');
 await page.screenshot({path:'output/web-game/unit-selection/selection-475.png'});
 await page.locator(`[data-v39-unit-id="${ids[1]}"]`).click();
 assert(await page.evaluate(id=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id===id),t=window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile;return t.x===u.x&&t.y===u.y;},ids[1]));
 assert(await page.evaluate(id=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id===id);window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39Input.selectTile(u);return window.getV39ActiveFactionState().selectedUnitId===id;},ids[0]));
 const moved=await page.evaluate(id=>{
  const lock=window.beginV39MapInputLock('selection-test'),f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id===id),to={x:u.x+1,y:u.y};
  window.updateV39ActiveFactionState({units:f.units.map(row=>row.id===id?{...row,...to}:row)});
  window.dispatchEvent(new CustomEvent('v39:unit-moved',{detail:{unitId:id,to}}));
  window.endV39MapInputLock(lock,'selection-test');
  const selected=window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile;
  return selected.x===to.x&&selected.y===to.y;
 },ids[0]);assert(moved,'selection follows movement after input unlock');
 assert.deepEqual(errors,[]);console.log(JSON.stringify(result));
}finally{await browser.close();}
