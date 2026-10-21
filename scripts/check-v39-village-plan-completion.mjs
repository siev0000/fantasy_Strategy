import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';
const out='output/web-game/village-plan-completion';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.closeV39PlayModeSelection==='function');
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
 await openV39TestSuite(page,'village');await page.locator('[data-test-action=village-plan-start]').click();
 await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData?.villagePlanTest&&!window.isV39MapInputLocked?.());
 await page.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-quests').click();
 await page.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await page.locator('[data-hub-primary]').click();
 await page.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await page.locator('[data-hub-primary]').click();await page.evaluate(()=>{window.closeV39VillageMenu();window.__completionLogs=[];const append=window.appendV39ActivityLog;window.appendV39ActivityLog=(...args)=>{if(args[3]?.type==='village-construction-completed'&&args[3]?.villageId===window.getV39GameState().neutralVillages.find(v=>v.planTestKey==='cemetery').id)window.__completionLogs.push(args);return append?.(...args);};});
 const inspect=()=>page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.planTestKey==='cemetery'),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];return {turn:s.timeline.turnNumber,queue:v.constructionQueue,plan:v.planSchedule,buildings:v.buildings,tileFacilityMap:v.tileFacilityMap,facilities:s.facilitiesByTile,markers:scene.children.list.find(c=>c.name==='v39-structure-layer')?.list.filter(c=>c.getData?.('facilityName')==='墓地'&&v.territoryTileKeys.includes(c.getData('tileKey'))).map(c=>({name:c.name,tile:c.getData('tileKey')}))||[]};});
 for(let i=0;i<3;i++){
   await page.evaluate(async()=>window.advanceV39Turn({skipUnactedFocus:true}));
   await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
   if(i===0){await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(c=>c.name==='v39-structure-layer')?.list.some(c=>c.name==='v39-facility-construction-marker'&&c.getData('facilityName')==='墓地'));await page.screenshot({path:out+'/building-'+width+'.png'});}
 }
 await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(c=>c.name==='v39-structure-layer')?.list.some(c=>c.name==='v39-facility-marker'&&c.getData('facilityName')==='墓地'));
 const complete=await inspect();assert(complete.buildings.includes('墓地'),'construction state completes');
 assert(complete.markers.some(m=>m.name==='v39-facility-marker'),'completed NPC facility is visible on field');
 assert.equal(complete.markers.filter(m=>m.name==='v39-facility-construction-marker').length,0,'construction ghost removed');
 assert.equal(await page.evaluate(()=>window.__completionLogs.length),1,'completion announced once');
 assert.equal(complete.plan.lastCompleted.facilities[0].facilityName,'墓地');
 await page.evaluate(()=>window.focusV39VillagePlanTest('cemetery'));
 assert.match(await page.locator('[data-village-plan-status]').innerText(),/墓地 完成/);
 await page.screenshot({path:out+'/complete-'+width+'.png'});
 await page.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-info').click();
 assert.match(await page.locator('[data-hub-facilities]').innerText(),/墓地/);
 assert.equal(await page.locator('[data-village-development] [data-development-status=completed]').count(),4,'development milestones complete through real construction');
 await page.screenshot({path:out+'/development-'+width+'.png'});
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 assert(await page.evaluate(()=>window.getV39GameState().neutralVillages.find(v=>v.planTestKey==='cemetery').planSchedule.lastCompleted.facilities[0].facilityName==='墓地'));
 assert(await page.evaluate(()=>!!window.getV39GameState().neutralVillages.find(v=>v.planTestKey==='cemetery').planSchedule.development.completedById.cemetery),'development survives save');
 await page.evaluate(()=>{window.closeV39VillageMenu();window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:window.getV39GameState().timeline.turnNumber}}));});
 assert.equal(await page.evaluate(()=>window.__completionLogs.length),1,'reload or same turn does not announce again');
 await page.evaluate(()=>{window.activateV39FooterTab('test');window.openV39TestTools();});
 await openV39TestSuite(page,'village');
 assert.match(await page.locator('[data-test-section=village-plans]').innerText(),/墓地 完成/);
 await page.evaluate(async()=>{window.__completionVision=window.isV39TileInCurrentVision;window.isV39TileInCurrentVision=()=>false;await window.setV39TestMode(false);window.refreshV39MapEntities();});
 await page.waitForFunction(()=>!window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(c=>c.name==='v39-structure-layer')?.list.some(c=>c.getData?.('facilityName')==='墓地'));
 assert.deepEqual(errors,[]);console.log(width+': building/complete markers, completion log/history/info/test tools and save passed');await page.close();
}}finally{await browser.close();}
