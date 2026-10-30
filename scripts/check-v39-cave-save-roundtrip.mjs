import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/cave-save-roundtrip';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 const input=process.env.V39_SAVE_FILE?readFileSync(process.env.V39_SAVE_FILE,'utf8'):null;
 const info=await page.evaluate(async input=>{
  window.closeV39PlayModeSelection();
  if(input)window.importV39SaveJson(input);
  else{await window.setV39TestMode(true);await window.startV39ExpeditionTest();}
  await window.waitForV39MapRenderSettled();
  const s=window.getV39GameState(),unit=window.getV39ActiveFactionState().units.find(u=>u.worldId?.startsWith('cave:')&&u.hp>0);
  if(!unit||!s.explorationWorlds[unit.worldId]?.map)throw Error('Fixture is missing a cave and its unit');
  const snapshot=window.getV39GameState({includeWorlds:false});
  window.setV39GameState({...snapshot,timeline:{...snapshot.timeline}},{reason:'lightweight-snapshot-regression'});
  if(!window.getV39GameState().explorationWorlds[unit.worldId]?.map)throw Error('Lightweight snapshot erased cave data');
  return {unitId:unit.id,worldId:unit.worldId,turn:s.timeline.turnNumber};
 },input);
 for(const startWorld of ['surface',info.worldId]){
  await page.evaluate(({unitId,startWorld})=>window.viewV39OwnedUnitWorld(unitId,{surface:startWorld==='surface'}),{...info,startWorld});
  await page.evaluate(()=>window.waitForV39MapRenderSettled());
  const save=await page.evaluate(()=>window.exportV39SaveJson(0));
  assert(JSON.parse(save).gameState.explorationWorlds[info.worldId]?.map);
  // A fresh page cannot accidentally recover a missing map from a cached Phaser scene.
  await page.reload({waitUntil:'networkidle'});
  await page.evaluate(async save=>{window.closeV39PlayModeSelection();window.importV39SaveJson(save);await window.waitForV39MapRenderSettled();window.activateV39FooterTab('squad');},save);
  if(!await page.locator(`[data-v39-unit-id="${info.unitId}"]`).count())await page.locator('[data-squad-select="solo"]').click();
  await page.locator(`[data-v39-unit-id="${info.unitId}"]`).click();
  await page.waitForFunction(world=>window.getV39GameState().activeWorldId===world&&window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39WorldId===world,info.worldId);
  assert(await page.evaluate(({unitId,turn})=>window.getV39ActiveFactionState().selectedUnitId===unitId&&window.getV39GameState().timeline.turnNumber===turn,info));
 }
 await page.screenshot({path:`${out}/restored-cave-${width}.png`});
 const missing=await page.evaluate(async({unitId,worldId})=>{
  window.viewV39OwnedUnitWorld(unitId,{surface:true});await window.waitForV39MapRenderSettled();
  const broken=JSON.parse(window.exportV39SaveJson(0));delete broken.gameState.explorationWorlds[worldId];
  window.importV39SaveJson(JSON.stringify(broken));await window.waitForV39MapRenderSettled();
  return {view:window.viewV39OwnedUnitWorld(unitId),exists:window.getV39ExplorationWorldIds().includes(worldId)};
 },info);
 assert.equal(missing.view,true);assert.equal(missing.exists,true);
 assert.match(await page.locator('body').innerText(),/洞窟データ欠損.*再生成/);
 assert.deepEqual(errors,[]);console.log(`${width}: lightweight snapshot preserves caves; surface/cave saves survive fresh-page reload and actual unit-card selection`);
 await page.close();
}}finally{await browser.close();}
