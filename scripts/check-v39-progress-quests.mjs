import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';

const out='output/web-game/progress-quests';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
  await openV39TestSuite(page,'village');await page.locator('[data-test-action=negotiation-hub-start]').click();
  await page.waitForFunction(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length===4&&!window.isV39MapInputLocked?.());
  await page.locator('#v39-hub-tab-quests').click();
  const generated=await page.evaluate(()=>{
    const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');window.__progressQuestInitial=structuredClone(s);
    return window.getV39WorldPopulationRules().listV39NeutralVillageQuests(s,s.activePlayerId,v.id,window.__v39FieldRuntime.mapData);
  });
  assert.deepEqual(generated.map(q=>q.eventId).sort(),['TPL_VILLAGE_HUNT','TPL_VILLAGE_SUPPLY']);
  assert.equal(generated.filter(q=>q.type==='hunt').length,1);
  assert(generated.every(q=>q.planDefinitionId&&q.eventDefinition.生成設定.方式==='村計画'));
  assert.equal(await page.locator('[data-quest-entry]').count(),2);
  assert.equal(await page.locator('[data-sheet-choice],[data-sheet-event]').count(),0);
  assert.equal(await page.locator('[data-quest-entry] h3').filter({hasText:'討伐'}).count(),1);
  // The same village has no offers when the real shortage and threat disappear.
  await page.evaluate(()=>{const s=window.getV39GameState();for(const v of s.neutralVillages)for(const key of Object.keys(v.foodStockByType))v.foodStockByType[key]=1000000;window.setV39GameState({neutralVillages:s.neutralVillages,enemies:[]});});
  assert.equal(await page.locator('[data-quest-entry]').count(),0,'no fixed sheet or test quests remain');
  await page.evaluate(()=>window.setV39GameState(window.__progressQuestInitial));
  await page.locator('#v39-hub-tab-quests').click();
  for(const q of generated)await page.locator(`[data-hub-quest="${q.eventId}"]`).check();
  await page.screenshot({path:`${out}/real-needs-${width}.png`});
  await page.locator('[data-hub-primary]').click();
  let records=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');return Object.values(v.questLogByPlayerId[s.activePlayerId]);});
  assert.equal(records.filter(q=>q.accepted&&!q.completed).length,2);
  await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
  const rollback=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);return p.factionState.settlements[0].foodStockByType.穀物;});
  for(const q of generated)await page.locator(`[data-hub-quest="${q.eventId}"]`).check();
  await page.locator('[data-hub-primary]').click();
  assert(await page.evaluate(before=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard'),p=s.players.find(p=>p.id===s.activePlayerId);return Object.values(v.questLogByPlayerId[p.id]).every(q=>!q.completed)&&p.factionState.settlements[0].foodStockByType.穀物===before;},rollback),'unmet hunt rolls back the earlier supply report');
  for(const q of generated)await page.locator(`[data-hub-quest="${q.eventId}"]`).uncheck();
  await page.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await page.locator('[data-hub-primary]').click();
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({enemies:s.enemies.map(u=>({...u,hp:0,currentHp:0,state:'死亡'}))});});
  await page.locator('[data-hub-quest=TPL_VILLAGE_HUNT]').check();await page.locator('[data-hub-primary]').click();
  records=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');return Object.values(v.questLogByPlayerId[s.activePlayerId]);});
  assert.equal(records.filter(q=>q.completed).length,2);
  assert.deepEqual(errors,[]);console.log(`${width}: actual shortage/threat plans only, one hunt, no offers after problems resolved, checkbox batch/save/report passed`);await page.close();
}}finally{await browser.close();}
