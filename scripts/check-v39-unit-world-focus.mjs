import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/unit-world-focus';mkdirSync(out,{recursive:true});
const hexSource=readFileSync('frontend/src/lib/phaser-map-panel-config.js','utf8').match(/export const HEX_TILE_CONFIG = Object.freeze\(\{([\s\S]*?)\}\)/)[1];
const hex=Object.fromEntries([...hexSource.matchAll(/(\w+):\s*(\d+)/g)].map(([,key,value])=>[key,Number(value)]));
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const original=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    await window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    window.activateV39FooterTab('squad');
    const s=window.getV39GameState(),worlds=structuredClone(s.explorationWorlds);
    worlds['cave:expedition-test:1'].camera={zoom:3,scrollX:600,scrollY:600};
    window.setV39GameState({explorationWorlds:worlds});
    return window.getV39ActiveFactionState().units.map(u=>[u.id,u.worldId,u.x,u.y,u.hp,u.ap]);
  });
  const verify=async(id,world)=>{
    await page.evaluate(()=>window.waitForV39MapRenderSettled());
    await page.waitForFunction(({id,world})=>{
      const s=window.getV39GameState(),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      return s.activeWorldId===world&&window.getV39ActiveFactionState().selectedUnitId===id&&scene?.v39WorldId===world;
    },{id,world});
    assert(await page.evaluate(({id,h})=>{
      const u=window.getV39ActiveFactionState().units.find(u=>u.id===id);
      const camera=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;
      camera.preRender();
      return camera.worldView.contains(u.x*h.width+(u.y%2?h.oddRowOffsetX:0)+h.width/2,u.y*h.rowStep+h.height/2);
    },{id,h:hex}),'selected unit is outside the camera');
  };
  await page.locator('[data-squad-select="solo"]').click();
  await verify('expedition-test-medic','cave:expedition-test:1');
  await page.screenshot({path:`${out}/cave-${width}.png`});
  for(let i=0;i<3;i++){
    await page.locator('[data-v39-unit-id="expedition-test-carrier"]').click();
    await verify('expedition-test-carrier','surface');
    await page.locator('[data-v39-unit-id="expedition-test-medic"]').click();
    await verify('expedition-test-medic','cave:expedition-test:1');
  }
  assert.deepEqual(await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>[u.id,u.worldId,u.x,u.y,u.hp,u.ap])),original);
  assert.deepEqual(errors,[]);
  console.log(`${width}: actual squad selector/list clicks switch worlds and focus; AP, HP and positions unchanged`);
  await page.close();
 }
}finally{await browser.close();}
