import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/land-environment';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39HazardTest);
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39HazardTest();await window.waitForV39MapRenderSettled();
    window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:18,y:15}}));
  });
  const field=page.locator('#v39-land-environment-effects');
  assert.match(await field.innerText(),/瘴気地帯（常設）/);
  const visible=await field.evaluate(el=>{const r=el.getBoundingClientRect(),p=document.getElementById('footTile').getBoundingClientRect();return r.top>=p.top&&r.bottom<=p.bottom&&r.bottom<=innerHeight;});
  assert(visible,'environment must be readable without scrolling');
  await page.screenshot({path:`${out}/miasma-${width}.png`});
  await page.evaluate(()=>{
    const map=window.__v39FieldRuntime.mapData,t=window.getV39GameState().timeline.turnNumber;
    map.fogMap[5]||=[];map.fogMap[5][4]={expiresAtTurn:t+3};
    window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:4,y:5}}));
  });
  assert.match(await field.innerText(),/霧 ⌛3/);
  const suppressed=await page.evaluate(()=>{
    const map=window.__v39FieldRuntime.mapData,t=window.getV39GameState().timeline.turnNumber;
    const zone=map.hazardZones.find(z=>z.name==='瘴気地帯');zone.suppressedUntilByTile['18,15']=t+2;
    window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:18,y:15}}));
    return document.getElementById('v39-land-environment-effects').textContent;
  });
  assert.match(suppressed,/瘴気地帯 抑制⌛2/);
  await page.evaluate(()=>{
    window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:18,y:5}}));
    window.activateV39FooterTab('squad');window.activateV39FooterTab('tile');
  });
  assert.match(await field.innerText(),/常霧の谷（常設）/);
  const hidden=await page.evaluate(async()=>{
    const restore=window.isV39TileInCurrentVision;window.isV39TileInCurrentVision=()=>false;
    await window.setV39TestMode(false);window.refreshV39LandDetail();
    const value=document.getElementById('v39-land-environment-effects').textContent;
    window.isV39TileInCurrentVision=restore;return value;
  });
  assert.equal(hidden,'未確認');assert.deepEqual(errors,[]);
  console.log(`${width}: top-of-land environment, permanent miasma/fog, duration, suppression, tab retention and visibility passed`);
  await page.close();
 }
 if(!process.env.V39_PRODUCTION_CHECK){
  const page=await browser.newPage();await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39HazardTest);
  const report=await page.evaluate(async()=>{
    const {enemySpawnData}=await import('/src/lib/game-data-registry.js');
    const {parseV39SpawnTerrains}=await import('/src/lib/v39-spawn-terrain-list.js');
    const row=enemySpawnData.find(row=>row.種族==='スネーク'&&row.Lv_Min>0),original=row.出現地形;
    row.出現地形='森/平地/森';
    try{
      const {getV39EnemySpawnDefinitions:defs}=await import('/src/v39/ai/v39-enemy-spawn.js?multi-terrain-test=1');
      return {parsed:parseV39SpawnTerrains('森/平地／洞窟、森'),forest:defs('森').filter(d=>d.definitionId===row.ID).length,
        plain:defs('平地').filter(d=>d.definitionId===row.ID).length,
        whole:defs('森/平地/森').filter(d=>d.definitionId===row.ID).length};
    }finally{row.出現地形=original;}
  });
  assert.deepEqual(report.parsed,['森','平地','洞窟']);assert.equal(report.forest,1);assert.equal(report.plain,1);assert.equal(report.whole,0);
  console.log('Combined terrain notation registers one definition for each terrain');await page.close();
 }
}finally{await browser.close();}
