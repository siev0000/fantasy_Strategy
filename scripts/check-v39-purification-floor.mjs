import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/purification-floor';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.startV39DisasterTest);
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({natural:true});await window.waitForV39MapRenderSettled();
    const runtime=window.__v39FieldRuntime;
    window.updateV39FieldData({...runtime.mapData,purificationByTile:{'4,4':-80,'5,4':-19,'6,4':30}},{silent:true});
    await window.waitForV39MapRenderSettled();
    const updated={...window.__v39FieldRuntime.mapData.purificationByTile};
    // Simulate a legacy save without relying on the new map-update clamp.
    window.__v39FieldRuntime.mapData.purificationByTile['4,4']=-80;
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    const saved={...window.__v39FieldRuntime.mapData.purificationByTile};
    const event=window.forceV39Disaster('災害:干ばつ',{x:4,y:4});
    return {updated,saved,eventOk:event.ok};
  });
  assert.deepEqual(result.updated,{'4,4':-20,'5,4':-19,'6,4':30});assert.deepEqual(result.saved,result.updated);assert(result.eventOk);
  await page.screenshot({path:`${out}/field-390.png`});assert.deepEqual(errors,[]);console.log('Map updates, legacy save/load and subsequent world processing preserve purification floor -20');
}finally{await browser.close();}
