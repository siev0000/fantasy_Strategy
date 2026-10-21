import {openV39TestSuite} from './lib/v39-test-suite.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const url=process.env.V39_TEST_URL||'http://127.0.0.1:3024';
mkdirSync('output/web-game/village-plan-playable',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',error=>errors.push(String(error)));
  if(width===390){const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:4});}
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(url,{waitUntil:'networkidle'});
  await page.locator('[data-v39-test-tools]').click();
  await page.locator('[data-test-tab="scenarios"]').click();
  await page.evaluate(()=>{
   window.__villagePlanTestLoads=0;window.__villagePlanTestGenerations=0;
   const load=window.loadV39FieldSnapshot,generate=window.generateV39TestFieldWithSeed;
   window.loadV39FieldSnapshot=(...args)=>{window.__villagePlanTestLoads++;return load(...args);};
   window.generateV39TestFieldWithSeed=(...args)=>{window.__villagePlanTestGenerations++;return generate(...args);};
  });
  const section=page.locator('[data-test-section="expedition"]');
  if(await section.evaluate(element=>!element.open))await section.locator('summary').click();
  await openV39TestSuite(page,'village');await page.locator('[data-test-action="village-plan-start"]').click();
  await page.waitForFunction(()=>window.__v39FieldRuntime?.mapData?.villagePlanTest&&!window.isV39MapInputLocked?.());
  await page.waitForSelector('[data-world-action="village-menu"]');
  await page.waitForFunction(()=>!!window.getV39MapEntityMarker?.('plan-visitor-cemetery'));
  const rendered=await page.evaluate(()=>({canvases:document.querySelectorAll('#v39-phaser-field canvas').length,
   connected:window.__v39FieldRuntime.game.canvas.isConnected,loads:window.__villagePlanTestLoads,generations:window.__villagePlanTestGenerations,
   units:window.getV39GameState().players[0].factionState.units.length,scene:!!window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39Input}));
  assert.deepEqual(rendered,{canvases:1,connected:true,loads:1,generations:0,units:4,scene:true});
  await page.screenshot({path:`output/web-game/village-plan-playable/start-${width}.png`});
  const initial=await page.evaluate(()=>{const state=window.getV39GameState();return state.neutralVillages.map(village=>({key:village.planTestKey,plan:village.planSchedule?.active?.definitionId,training:village.defenseTraining}));});
  console.log(width,initial);
  assert.equal(initial.length,4);assert.equal(initial.find(row=>row.key==='cemetery').plan,'PLAN_VILLAGE_CEMETERY');
  assert.equal(initial.find(row=>row.key==='food').plan,'PLAN_VILLAGE_FOOD');assert.equal(initial.find(row=>row.key==='threat').plan,'PLAN_VILLAGE_THREAT');assert(initial.find(row=>row.key==='guard').training);
  const accept=async()=>{await page.locator('[data-world-action="village-menu"]').click();await page.locator('#v39-hub-tab-quests').click();await page.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await page.locator('[data-hub-primary]').click();};
  const report=async()=>{await page.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await page.locator('[data-hub-primary]').click();};
  await accept();await report();
  const donated=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(row=>row.planTestKey==='cemetery');return v.questsByPlayerId[s.activePlayerId]?.completed&&v.relationsByPlayerId[s.activePlayerId]===10;});
  assert(donated);await page.screenshot({path:`output/web-game/village-plan-playable/donated-${width}.png`});
  const focus=async key=>{
   await page.evaluate(()=>{window.closeV39VillageMenu();window.activateV39FooterTab('test');});await page.locator('[data-test-tab="scenarios"]').click();
   await page.locator(`[data-test-action="village-plan-${key}"]`).click();
  };
  await focus('food');await page.waitForSelector('[data-world-action="village-menu"]');
  await accept();await report();
  await focus('threat');await page.locator('[data-world-action="village-menu"]').click();await page.locator('#v39-hub-tab-quests').click();await page.locator('[data-hub-quest=TPL_VILLAGE_HUNT]').check();await page.locator('[data-hub-primary]').click();
  assert(await page.evaluate(()=>{const s=window.getV39GameState();return s.neutralVillages.find(row=>row.planTestKey==='threat').questsByPlayerId[s.activePlayerId]?.targetEnemyIds.includes('village-plan-wolf');}));
  await page.screenshot({path:`output/web-game/village-plan-playable/threat-${width}.png`});
  await page.evaluate(()=>window.closeV39VillageMenu());
  for(let i=0;i<3;i++)await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});});
  const complete=await page.evaluate(()=>{const s=window.getV39GameState();return {cemetery:s.neutralVillages.find(row=>row.planTestKey==='cemetery').buildings?.includes('墓地'),guards:s.neutralVillages.find(row=>row.planTestKey==='guard').defenseUnits.filter(unit=>unit.hp>0&&unit.state!=='死亡').length};});
  console.log(width,complete);assert(complete.cemetery);assert.equal(complete.guards,1);
  await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();});
  await focus('guard');await page.screenshot({path:`output/web-game/village-plan-playable/guard-${width}.png`});
  await page.evaluate(()=>window.openV39TestTools());await page.locator('[data-test-tab="scenarios"]').click();
  const restartSection=page.locator('[data-test-section="expedition"]');
  if(await restartSection.evaluate(element=>!element.open))await restartSection.locator('summary').click();
  await page.evaluate(()=>{window.__originalMapLock=window.isV39MapInputLocked;window.isV39MapInputLocked=()=>true;});
  await openV39TestSuite(page,'village');await page.locator('[data-test-action="village-plan-start"]').click();
  await page.waitForFunction(()=>document.getElementById('v39-test-tools-status')?.textContent.includes('現在の処理が終わってから'));
  assert.equal(await page.locator('[data-test-tab="scenarios"]').isVisible(),true,'failed start must keep test controls visible');
  await page.evaluate(()=>{window.isV39MapInputLocked=window.__originalMapLock;window.__villagePlanTestLoads=0;window.__villagePlanTestGenerations=0;});
  await openV39TestSuite(page,'village');await page.locator('[data-test-action="village-plan-start"]').click();
  await page.waitForSelector('[data-world-action="village-menu"]');
  await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===1&&!!window.getV39MapEntityMarker?.('plan-visitor-cemetery'));
  const restarted=await page.evaluate(()=>({loads:window.__villagePlanTestLoads,generations:window.__villagePlanTestGenerations,
    connected:window.__v39FieldRuntime.game.canvas.isConnected,units:window.getV39GameState().players[0].factionState.units.length}));
  assert.deepEqual(restarted,{loads:1,generations:0,connected:true,units:4});
  await page.screenshot({path:`output/web-game/village-plan-playable/restart-${width}.png`});
  assert.deepEqual(errors,[]);await page.close();
 }
}finally{await browser.close();}
