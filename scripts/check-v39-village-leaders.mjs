import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const fixture=JSON.parse(readFileSync('config/v39-negotiation-hub-test.json','utf8'));
const out='output/web-game/village-leaders';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.locator('[data-v39-test-tools]').click();
  const start=page.locator('[data-test-action=negotiation-hub-start]');
  await page.locator('[data-test-suite=village] > summary').click();
  assert.equal(await start.count(),1,'one start entry, also after loading a test');
  assert.equal(await start.evaluate(node=>node.closest('[data-test-section]').dataset.testSection),'expedition','start belongs to the existing test list');
  await start.scrollIntoViewIfNeeded();assert(await start.isVisible());
  await page.screenshot({path:`${out}/entry-${width}.png`});await start.click();
  await page.waitForFunction(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length===4&&document.querySelector('#v39-village-menu:not([hidden]) .v39-conversation-stage'));
  await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const root=page.locator('#v39-village-menu');
  async function tools(){if(await root.isVisible())await root.locator('[data-close-village-menu]').last().click();await page.evaluate(()=>window.openV39TestTools());}
  async function focus(key){await tools();await page.locator('#v39-test-negotiation-village').selectOption(key);await page.locator('[data-test-action=negotiation-hub-focus]').click();}
  const leaders=await page.evaluate(()=>{const s=window.getV39GameState();return s.neutralVillages.map(v=>({id:v.leader.id,name:v.leader.name,race:v.leader.race,title:v.leader.title,personality:v.leader.conversationPersonality,combatant:v.defenseUnits.some(u=>u.id===v.leader.id)||s.enemies.some(u=>u.id===v.leader.id)||s.players.some(p=>p.factionState.units.some(u=>u.id===v.leader.id))}));});
  assert.equal(new Set(leaders.map(l=>l.id)).size,4);assert(leaders.every(l=>l.personality&&!l.combatant));
  assert.equal(leaders[2].race,'ゴブリン');assert.equal(leaders[2].title,'族長');
  for(const sample of fixture.villages){
    await focus(sample.key);assert.equal(await root.locator('.v39-conversation-row.peer figcaption').innerText(),leaders[fixture.villages.indexOf(sample)].name);
    assert.match(await root.locator('.v39-conversation-row.peer .v39-conversation-person').getAttribute('style'),/background-image/);
    for(const tab of ['talk','quests','trade','info']){await root.locator(`[data-hub-tab=${tab}]`).click();assert(await root.locator(`#v39-hub-${tab}`).isVisible());}
    assert((await root.locator('[data-hub-leader]').innerText()).includes(sample.key==='tribe'?'族長':'村長'));
  }
  await focus('standard');await root.locator('#v39-hub-tab-info').click();await root.locator('.v39-conversation-preparation>summary').click();
  assert.equal(await root.locator('[data-conversation-skill]').count(),2,'test actor has real negotiation and intimidation skills');
  await root.locator('[data-conversation-skill="0"]').click();
  assert.equal(await page.evaluate(()=>window.getV39ActivePlayer().factionState.units.find(u=>u.id==='negotiator-standard').ap),90);
  await root.locator('#v39-hub-tab-quests').click();await root.locator('[data-hub-quest=TEST_VILLAGE_SUPPLY]').click();await root.locator('[data-hub-primary]').click();
  assert(await page.evaluate(()=>{const s=window.getV39GameState();return s.neutralVillages.find(v=>v.negotiationHubTest==='standard').questsByPlayerId[s.activePlayerId].completed;}));
  await root.locator('#v39-hub-tab-trade').click();await root.locator('[data-trade-add-side="0"]').click();await page.locator('[data-trade-resource-filter=specialties]').click();
  assert((await page.locator('[data-trade-resource-add]').count())>=3,JSON.stringify(await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players[0];return {settlements:p.factionState.settlements.map(b=>[b.settlementId,b.territoryTileKeys]),sites:p.factionState.exploration.discoveredSpecialtiesByTile,holdings:window.getV39TradeRules().getV39SpecialtyAccess(s,p.id)};})));await page.locator('[data-trade-picker-close]').last().click();
  for(const column of (width===390?fixture.previewColumns:['交渉開始','拒否','終了'])){
    await tools();assert.equal(await page.locator('#v39-test-negotiation-personality option').count(),18);
    await page.locator('#v39-test-negotiation-village').selectOption('quiet');await page.locator('#v39-test-negotiation-personality').selectOption('古風');await page.locator('#v39-test-negotiation-column').selectOption(column);await page.locator('[data-test-action=negotiation-hub-preview]').click();
    const speech=await root.locator('.v39-conversation-row.peer p span').innerText();
    assert(await page.evaluate(({column,speech})=>window.getV39NegotiationRules().getV39ConversationProfile({conversationPersonality:'古風'})[column].split('\n').includes(speech),{column,speech}));
  }
  await page.screenshot({path:`${out}/leader-${width}.png`});
  await focus('friendly');await root.locator('[data-hub-talk=vassal]').click();await root.locator('[data-hub-primary]').click();
  assert(await page.evaluate(()=>{const s=window.getV39GameState();return s.neutralVillages.find(v=>v.negotiationHubTest==='friendly').vassalPlayerId===s.activePlayerId;}),'friendly village permits actual vassalization');
  await root.locator('[data-hub-talk=village-rest]').click();await root.locator('[data-hub-primary]').click();
  assert.equal(await page.evaluate(()=>window.getV39ActivePlayer().factionState.units.find(u=>u.id==='negotiator-friendly').ap),70,'rest remains usable in test village');
  const stable=await page.evaluate(()=>{
    const identity=unit=>JSON.stringify(Object.fromEntries(['id','name','race','className','level','title','conversationPersonality','hp','ap'].map(key=>[key,unit[key]])));
    const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='quiet'),before=identity(v.leader);v.defenseUnits=[];
    window.setV39GameState({neutralVillages:s.neutralVillages},{reason:'leader-guard-replacement'});window.importV39SaveJson(window.exportV39SaveJson(0));
    return {before,after:identity(window.getV39GameState().neutralVillages.find(row=>row.id===v.id).leader)};
  });assert.equal(stable.after,stable.before,'guard removal and native save/load preserve leader');
  const migration=await page.evaluate(()=>{const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='quiet');delete v.leader;window.setV39GameState({neutralVillages:s.neutralVillages},{reason:'leader-legacy-migration'});const after=window.getV39GameState().neutralVillages.find(row=>row.id===v.id);return {id:after.leader?.id,personality:after.leader?.conversationPersonality,guards:after.defenseUnits.length};});
  assert.deepEqual(migration,{id:'negotiation-quiet-leader',personality:'古風',guards:0});
  assert.deepEqual(errors,[]);console.log(`${width}: test entry, 4 leaders, guardless portrait, all tabs, actual skill/delivery, specialty stock, personality previews and save/load passed`);await page.close();
}}finally{await browser.close();}
