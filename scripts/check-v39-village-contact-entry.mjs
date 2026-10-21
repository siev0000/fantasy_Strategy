import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';

const out='output/web-game/village-contact-entry';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [320,390,1100]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
 await openV39TestSuite(page,'village');await page.locator('[data-test-action=negotiation-hub-start]').click();
 await page.waitForFunction(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length===4&&!window.isV39MapInputLocked?.());
 const contact=page.locator('#v39-world-contact-actions'),root=page.locator('#v39-village-menu');
 const selectVillage=async()=>page.evaluate(()=>{window.closeV39VillageMenu();const s=window.getV39GameState(),v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');window.activateV39FooterTab('interaction');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:v.x,y:v.y}}));});
 const assertEntry=async(count)=>{
   assert.equal(await contact.locator('[data-world-action]').count(),1,'only the hub entry remains');
   assert.equal(await contact.locator('[data-world-action=village-menu]').count(),1);
   assert.equal(await contact.locator('[data-open-v39-trade]').count(),0,'trade must not inject another shortcut');
   assert.match(await contact.locator('#v39-world-contact-subdetail').innerText(),new RegExp('受注中 '+count+'件'));
 };
 await selectVillage();await assertEntry(0);
 await contact.locator('[data-world-action=village-menu]').click();
 await page.locator('#v39-hub-tab-quests').click();
 for(const id of ['TPL_VILLAGE_SUPPLY','TPL_VILLAGE_HUNT'])await root.locator('[data-hub-quest="'+id+'"]').check();
 await root.locator('[data-hub-primary]').click();
 await selectVillage();await assertEntry(2);
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
 await selectVillage();await assertEntry(2);
 await page.screenshot({path:out+'/entry-'+width+'.png'});
 await contact.locator('[data-world-action=village-menu]').click();await page.locator('#v39-hub-tab-quests').click();
 assert.equal(await root.locator('[data-hub-quest]').count(),2,'both accepted quests remain in the modal');
 await root.locator('[data-hub-quest=TPL_VILLAGE_SUPPLY]').check();await root.locator('[data-hub-primary]').click();
 await selectVillage();await assertEntry(1);
 await contact.locator('[data-world-action=village-menu]').click();
 await root.locator('#v39-hub-tab-talk').click();
 for(const action of ['village-rest','relation','vassal','raid'])assert.equal(await root.locator('[data-hub-talk="'+action+'"]').count(),1,'village action preserved in hub');
 await root.locator('#v39-hub-tab-trade').click();assert(await root.locator('#v39-trade-modal.v39-trade-embedded').isVisible());
 await root.locator('#v39-hub-tab-quests').click();await page.screenshot({path:out+'/quests-'+width+'.png'});
 await page.evaluate(()=>{window.closeV39VillageMenu();const s=window.getV39GameState();window.setV39GameState({wandererGroups:[...s.wandererGroups,{id:'contact-wanderer',race:'只人',population:10,x:0,y:0,discoveredByPlayerIds:[s.activePlayerId]}]});window.activateV39FooterTab('interaction');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:0,y:0}}));});
 assert.equal(await contact.getAttribute('data-kind'),'wanderer');assert.equal(await contact.locator('[data-world-action=recruit]').count(),1);
 await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({neutralVillages:s.neutralVillages.map(v=>v.negotiationHubTest==='standard'?{...v,abandoned:true,population:0,populationByRace:{},defenseUnits:[]}:v)});const v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:v.x,y:v.y}}));});
 assert.equal(await contact.locator('[data-world-action=village-resettle]').count(),1);assert.equal(await contact.locator('[data-world-action=village-menu]').count(),0);
 assert.deepEqual(errors,[]);console.log(width+': entry only, all quest counts/save/report, hub actions/trade, wanderer and resettlement preserved');await page.close();
}}finally{await browser.close();}
