import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
const out='output/web-game/atmosphere-fixture';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39DisasterTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();});
    assert.equal(await page.locator('#v39-test-atmosphere-sample option').count(),fixture.atmosphere.samples.length);
    await page.locator('[data-test-action="disaster-atmosphere-start"]').click();
    await page.waitForFunction(()=>document.querySelector('#v39-test-atmosphere-sample')&&window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.getByName('v39-atmosphere-fog-layer')?.getData('atmosphere')?.ready);
    assert.equal(await page.locator('#v39-test-atmosphere-sample option').count(),fixture.atmosphere.samples.length);
    const records=[];
    for(const [index,sample] of fixture.atmosphere.samples.entries()){
      await page.locator('#v39-test-atmosphere-sample').selectOption(String(index));
      await page.locator('[data-test-action="disaster-atmosphere-focus"]').click();
      await page.evaluate(()=>window.waitForV39MapRenderSettled());
      const result=await page.evaluate(({x,y})=>{
        const runtime=window.__v39FieldRuntime,map=runtime.mapData,state=window.getV39GameState(),scene=runtime.game.scene.getScenes(true)[0];
        return {selected:scene.v39SelectedTile,fog:map.fogMap[y][x],
          hazards:state.worldEnvironment.activeDisasters.filter(e=>e.tileKeys.includes(`${x},${y}`)).map(e=>e.disasterId).sort(),
          detail:document.getElementById('v39-land-environment-effects').textContent,
          meta:scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere')};
      },sample);
      assert.deepEqual(result.selected,{x:sample.x,y:sample.y});
      assert.equal(result.fog.kind,sample.fog);assert.deepEqual(result.hazards,[...sample.disasters].sort());
      assert(result.detail.includes(sample.fog==='death'?'死の霧':'霧'));assert(result.detail.includes('⌛5'));
      for(const id of sample.disasters)assert(result.detail.includes(id.replace('災害:','')));
      records.push(result);
      if([0,2,4].includes(index)){await page.waitForTimeout(250);await page.screenshot({path:`${out}/${index}-${width}.png`});}
    }
    const saved=await page.evaluate(async()=>{
      const before=JSON.stringify(window.__v39FieldRuntime.mapData.fogMap),count=window.getV39ActiveFactionState().units.length;
      window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
      return {retained:window.__v39FieldRuntime.mapData.disasterAtmosphereTestFixture&&before===JSON.stringify(window.__v39FieldRuntime.mapData.fogMap),count};
    });assert(saved.retained);
    await page.locator('[data-test-action="weather-turn"]').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!window.isV39MapInputLocked());
    await page.locator('[data-test-action="disaster-atmosphere-focus"]').click();
    assert((await page.locator('#v39-land-environment-effects').textContent()).includes('⌛4'));
    await page.locator('[data-test-action="disaster-atmosphere-start"]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.length),saved.count);
    await page.locator('[data-test-action="disaster-natural-start"]').click();
    assert.equal(await page.locator('#v39-test-atmosphere-sample').count(),0);
    assert.equal(await page.evaluate(()=>window.getV39GameState().worldEnvironment.activeDisasters.length),0);
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.fogMap?.flat().filter(Boolean).length||0),0);
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    assert.equal(await page.locator('#v39-test-atmosphere-sample').count(),0);
    assert.equal(await page.evaluate(()=>window.getV39GameState().worldEnvironment.activeDisasters.length),fixture.events.length+1);
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify(records,null,2));
    console.log(`${width}: five comparison locations, real controls/focus, expected fog/hazards/detail, save, real 1T, restart and natural/fixed isolation passed`);
    await page.close();
  }
}finally{await browser.close();}
