import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {openV39TestSuite} from './lib/v39-test-suite.mjs';

const out='output/web-game/village-contacts';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
  await openV39TestSuite(page,'village');await page.locator('[data-test-action=negotiation-hub-start]').click();
  await page.waitForFunction(()=>window.getV39GameState().neutralVillages.filter(v=>v.negotiationHubTest).length===4&&!window.isV39MapInputLocked?.()).catch(async error=>{console.error(errors);console.error(await page.evaluate(()=>({villages:window.getV39GameState()?.neutralVillages?.length,lock:window.isV39MapInputLocked?.(),text:document.body.innerText.slice(-2200)})));await page.screenshot({path:out+'/failure.png'});throw error;});
  // Remove fixture relations to check that merely discovering/selecting a village is not contact.
  await page.evaluate(()=>{const s=window.getV39GameState();window.closeV39VillageMenu();window.setV39GameState({neutralVillages:s.neutralVillages.map(v=>({...v,relationsByPlayerId:{},questLogByPlayerId:{},questsByPlayerId:{},eventCompletedTurnByPlayerId:{},contactedByPlayerIds:[]}))});window.activateV39FooterTab('interaction');const v=s.neutralVillages.find(v=>v.negotiationHubTest==='standard');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:v.x,y:v.y}}));});
  const list=page.locator('#v39-village-contacts');assert.equal(await list.locator('button').count(),0);
  await page.locator('[data-world-action=village-menu]').click();
  await page.evaluate(()=>window.closeV39VillageMenu());
  assert.equal(await list.locator('button').count(),1);
  const id=await list.locator('button').getAttribute('data-village-focus');
  const zoom=await page.evaluate(()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];scene.cameras.main.setZoom(scene.v39FitZoom*4).centerOn(0,0);scene.v39RequestedZoom=scene.cameras.main.zoom;return scene.cameras.main.zoom;});
  await list.locator('button').click();
  const focus=await page.evaluate(id=>{const s=window.getV39GameState(),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],v=s.neutralVillages.find(v=>v.id===id);return {selected:scene.v39SelectedTile,village:{x:v.x,y:v.y},recorded:v.contactedByPlayerIds,player:s.activePlayerId,menu:document.getElementById('v39-village-menu').hidden};},id);
  assert.equal(focus.selected.x,focus.village.x);assert.equal(focus.selected.y,focus.village.y);assert(focus.recorded.includes(focus.player));assert(focus.menu);
  const camera=await page.evaluate(()=>{const c=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;c.preRender();return {zoom:c.zoom,x:c.midPoint.x,y:c.midPoint.y};});
  assert.equal(camera.zoom,zoom,'navigation preserves zoom');
  assert(Math.abs(camera.x-(focus.village.x*62+(focus.village.y%2?31:0)+31))<1,'centers on village x');
  assert(Math.abs(camera.y-(focus.village.y*56+37))<1,'centers on village y');
  await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
  await page.evaluate(()=>window.activateV39FooterTab('interaction'));
  assert.equal(await list.locator('button').count(),1,'contact survives native save');
  await page.screenshot({path:out+'/contacts-'+width+'.png'});
  const first=await page.evaluate(()=>{const s=window.getV39GameState();const other=s.players.find(p=>p.id!==s.activePlayerId);if(!other)return null;window.setV39GameState({activePlayerId:other.id});return s.activePlayerId;});
  if(first){assert.equal(await list.locator('button').count(),0,'another player cannot see contact history');await page.evaluate(id=>window.setV39GameState({activePlayerId:id}),first);}
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({neutralVillages:s.neutralVillages.map(v=>v.negotiationHubTest==='friendly'?{...v,relationsByPlayerId:{[s.activePlayerId]:25}}:v)});});
  assert.equal(await list.locator('button').count(),2,'old relation records appear without a new visit');
  await page.evaluate(()=>window.activateV39FooterTab('squad'));
  const card=page.locator('#squadMemberList [data-v39-unit-id]').first();
  if(await card.count()){
    const center=await page.evaluate(()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];scene.cameras.main.centerOn(0,0);return scene.cameras.main.scrollX;});
    await card.click();
    assert.notEqual(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.scrollX),center,'unit card also navigates');
  }
  assert.deepEqual(errors,[]);console.log(width+': real contact, navigation, no auto-open, save and player isolation passed');
  await page.close();
}}finally{await browser.close();}
