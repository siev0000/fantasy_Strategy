import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/test-suites';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
  const panel=page.locator('#v39-test-tools-panel');
  async function open(suite){
    const tradeClose=page.locator('#v39-trade-modal [data-trade-action=close]');
    if(await tradeClose.isVisible())await tradeClose.click();
    await page.evaluate(()=>{window.closeV39VillageMenu?.();window.openV39TestTools();});
    await page.locator('[data-test-tab=scenarios]').click();
    const group=panel.locator(`[data-test-suite=${suite}]`);
    if(!await group.evaluate(el=>el.open))await group.locator(':scope > summary').click();
    return group;
  }
  async function start(suite,action){const group=await open(suite);await group.locator(`[data-test-action=${action}]`).click();await page.waitForFunction(()=>!window.isV39MapInputLocked?.());}
  assert.deepEqual(await panel.locator('[data-test-suite]>summary').allTextContents(),['村・交流テスト','取引・物流テスト','道具・部隊支援テスト']);
  assert.doesNotMatch(await panel.innerText(),/輸送・道具・支援テスト|村依頼・悪魔契約テスト|取引・郵送テスト/);
  assert.equal(await panel.locator('[data-test-action=call-test-start]').count(),1);
  await page.screenshot({path:`${out}/entries-${width}.png`});
  await open('village');await page.locator('[data-test-tab=turns]').click();await page.locator('[data-test-tab=scenarios]').click();
  assert(await panel.locator('[data-test-suite=village]').evaluate(el=>el.open),'suite stays open across tabs');
  await start('village','negotiation-hub-start');
  assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length),4);
  await start('village','village-plan-start');
  await page.waitForFunction(()=>window.__v39FieldRuntime.mapData.villagePlanTest===true);
  assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages.filter(v=>v.planTestKey).length),4);
  await start('village','village-incident-start');
  assert.equal(await page.evaluate(()=>window.getV39GameState().players.length),2);
  await start('logistics','trade-test-start');
  assert(await page.evaluate(()=>window.getV39GameState().players[0].factionState.units.some(u=>u.id==='trade-test-wagon')));
  await start('logistics','logistics-test-start');
  assert(await page.evaluate(()=>window.__v39FieldRuntime.mapData.logisticsTestFixture));
  await start('logistics','expedition-transport-start');
  const transport=await page.evaluate(()=>{const s=window.getV39GameState();return {profile:window.__v39FieldRuntime.mapData.expeditionTestProfile,ids:s.players[0].factionState.units.map(u=>u.id),villages:s.neutralVillages.length,cave:!!s.explorationWorlds['cave:expedition-test:1']};});
  assert.equal(transport.profile,'transport');assert.equal(transport.villages,0);assert(transport.cave);
  assert.deepEqual(transport.ids,['expedition-test-king','expedition-test-carrier','expedition-test-guard']);
  await start('support','expedition-start');
  const support=await page.evaluate(()=>{const s=window.getV39GameState(),f=s.players[0].factionState;return {profile:window.__v39FieldRuntime.mapData.expeditionTestProfile,ids:f.units.map(u=>u.id),medic:f.units.find(u=>u.id==='expedition-test-medic'),selected:f.selectedUnitId,villages:s.neutralVillages.length,worlds:Object.keys(s.explorationWorlds)};});
  assert.equal(support.profile,'support');assert.equal(support.villages,0);assert.deepEqual(support.worlds,['surface']);
  assert.deepEqual(support.ids,['expedition-test-king','expedition-test-commander','expedition-test-knight','expedition-test-medic']);
  assert.equal(support.selected,'expedition-test-medic');assert.equal(support.medic.worldId,'surface');
  assert(support.medic.hp<support.medic.maxHp);assert.equal(support.medic.toolStockByType.薬草,2);assert.equal(support.medic.toolStockByType.水薬,2);
  await page.screenshot({path:`${out}/support-${width}.png`});
  await open('support');await page.screenshot({path:`${out}/expanded-${width}.png`});
  assert(await panel.evaluate(el=>el.scrollWidth<=innerWidth),'panel fits viewport');
  assert.deepEqual(errors,[]);console.log(`${width}: 3 suites, 7 actual starts, isolated transport/support fixtures and standalone summon passed`);
  await page.close();
}}finally{await browser.close();}
