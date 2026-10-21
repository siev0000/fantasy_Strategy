import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/village-immediate-support';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [320,390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  async function start(){
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39VillageIncidentTest();});
    await page.waitForSelector('#v39-hub-tab-quests');await page.waitForFunction(()=>!window.isV39MapInputLocked?.());await page.locator('#v39-hub-tab-quests').click();
  }
  const primary=page.locator('[data-hub-primary]');
  async function snapshot(){return page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),v=s.neutralVillages.find(v=>v.incidentTest),b=p.factionState.settlements.find(b=>b.settlementId===p.factionState.selectedSettlementId);return {turn:s.timeline.turnNumber,ap:p.factionState.units.map(u=>u.ap),food:b.foodStockByType.穀物,wood:b.materialStockByType.木材,relation:v.relationsByPlayerId[s.activePlayerId]||0,quest:v.questsByPlayerId[s.activePlayerId]};});}
  await start();const before=await snapshot();
  await page.locator('[data-hub-quest="TEST_VILLAGE_SUPPLY"]').click();assert.equal(await primary.innerText(),'受注して支援');
  await primary.click();const completed=await snapshot();
  assert(completed.quest.completed);assert.equal(completed.food,before.food-20);assert.equal(completed.relation,before.relation+10);assert.equal(completed.turn,before.turn);assert.deepEqual(completed.ap,before.ap);
  assert(await primary.isDisabled());assert.equal((await snapshot()).food,completed.food);
  await page.screenshot({path:`${out}/complete-${width}.png`});
  await start();
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.settlements.forEach(b=>{b.foodStockByType.穀物=0;});window.setV39GameState({players:s.players},{reason:'support-insufficient'});});
  await page.locator('[data-hub-quest="TEST_VILLAGE_SUPPLY"]').click();assert.equal(await primary.innerText(),'この依頼を受注');
  await primary.click();assert(!(await snapshot()).quest.completed);assert.equal(await primary.innerText(),'物資を支援');
  await primary.click();assert(!(await snapshot()).quest.completed);assert.equal((await snapshot()).relation,0);
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.settlements.forEach(b=>{b.foodStockByType.穀物=20;});window.setV39GameState({players:s.players},{reason:'support-replenished'});});
  await primary.click();assert((await snapshot()).quest.completed);assert.equal((await snapshot()).food,0);
  await start();await page.locator('[data-hub-quest="TEST_VILLAGE_SUPPLY"]').click();await page.locator('[data-hub-deliver-on-accept]').uncheck();await page.locator('[data-hub-primary]').click();
  assert(!(await snapshot()).quest.completed);assert.equal(await primary.innerText(),'物資を支援');await primary.click();assert((await snapshot()).quest.completed);
  await start();const numberedBefore=await snapshot();await page.locator('[data-sheet-event="TEST_SHEET_SUPPLY"]').click();await page.locator('[data-sheet-choice="1"]').click();
  await page.locator('[data-sheet-event-list]').click();
  assert.equal(await page.locator('[data-hub-quests] [data-quest-entry]').count(),1,'pending quest uses the same list');
  assert.match(await page.locator('[data-hub-quests]').innerText(),/受注中/);
  await page.locator('[data-sheet-event="TEST_SHEET_SUPPLY"]').click();
  assert.equal(await primary.innerText(),'物資を支援');assert(await primary.isEnabled());await primary.click();
  const numbered=await snapshot();assert(numbered.quest.completed&&numbered.quest.dialogueEventId);assert.equal(numbered.wood,numberedBefore.wood-10);assert.equal(numbered.turn,numberedBefore.turn);
  assert.equal(numbered.relation,numberedBefore.relation+10);assert(await primary.isDisabled());
  await start();await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.settlements.forEach(b=>{b.materialStockByType.木材=0;});window.setV39GameState({players:s.players},{reason:'numbered-support-shortage'});});
  await page.locator('[data-sheet-event="TEST_SHEET_SUPPLY"]').click();await page.locator('[data-sheet-choice="1"]').click();
  assert.equal(await primary.innerText(),'物資を支援');assert(await primary.isDisabled(),'numbered support respects sheet stock condition');
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.settlements.forEach(b=>{b.materialStockByType.木材=10;});window.setV39GameState({players:s.players},{reason:'numbered-support-refill'});});
  assert(await primary.isEnabled());await primary.click();assert((await snapshot()).quest.completed);assert.equal((await snapshot()).wood,0);
  assert.deepEqual(errors,[]);console.log(`${width}: immediate accept/support, exact stock/reward, no turn/AP cost, shortage/replenish, accept-only and numbered support passed`);await page.close();
}}finally{await browser.close();}
