import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{for(const width of [390,1100]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
  window.activateV39FooterTab('squad');
  window.__hiddenMutations={};
  for(const id of ['footTile','footSettlement','v39-test-tools-panel']){
   const el=document.getElementById(id==='footTile'?'v39-land-environment-effects':id);window.__hiddenMutations[id]=0;
   new MutationObserver(changes=>window.__hiddenMutations[id]+=changes.length).observe(el,{childList:true,characterData:true,subtree:true});
  }
 });
 await page.locator('[data-squad-detail-tab="basic"]').click();
 await page.locator('#mobileBattleMove').click();
 const target=await page.evaluate(()=>window.getV39UnitMovePreview().reachable.filter(t=>t.cost>0).sort((a,b)=>a.cost-b.cost)[0]);
 await page.evaluate(key=>{const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));},target.key);
 await page.locator('#moveOk').click();await page.waitForFunction(()=>!window.isV39MapInputLocked());
 await page.evaluate(()=>window.waitForV39MapRenderSettled());
 assert.deepEqual(await page.evaluate(()=>window.__hiddenMutations),{footTile:0,footSettlement:0,'v39-test-tools-panel':0});
 const activity=await page.evaluate(()=>{const f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.id===f.selectedUnitId);return {x:u.x,y:u.y,ap:u.ap,moved:u.lastMovedTurn,turn:window.getV39TimelineState().turnNumber};});
 assert.equal(`${activity.x},${activity.y}`,target.key);assert.equal(activity.moved,activity.turn);assert.equal(activity.ap,100-target.cost);
 await page.locator('[data-foot="tile"]').click();
 assert.equal(await page.evaluate(()=>document.getElementById('footTile').hidden),false);
 assert.match(await page.locator('#v39-land-terrain').innerText(),new RegExp(`${activity.x}.*${activity.y}`));
 await page.locator('[data-foot="settlement"]').click();assert.match(await page.locator('#footSettlement').innerText(),/検証拠点/);
 await page.locator('[data-foot="test"]').click();assert(await page.locator('[data-test-tab]').count()>0);
 assert.deepEqual(errors,[]);console.log(`${width}: hidden panels unchanged while moving; opening shows latest land, settlement and test data; AP/activity preserved`);
 await page.close();
}}finally{await browser.close();}
