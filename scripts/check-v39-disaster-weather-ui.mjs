import assert from 'node:assert/strict';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/disaster-weather-ui';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.activateV39FooterTab('test');});
    await page.locator('[data-test-section="expedition"]').evaluate(n=>n.open=true);
    await page.locator('[data-test-action="disaster-test-start"]').click();
    await page.waitForFunction(()=>!window.isV39MapInputLocked()&&window.getV39GameState().worldEnvironment.weather);
    assert.equal(await page.locator('[data-test-tab="environment"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.v39-weather-samples button').count(),4);
    const initial=await page.evaluate(()=>({
      regions:window.getV39GameState().worldEnvironment.weather.regions,
      disasters:window.inspectV39NaturalEvents().activeDisasters.length,
      count:window.getV39ActiveFactionState().units.length
    }));
    assert.deepEqual(Object.values(initial.regions).map(r=>r.weather),['晴れ','雷雨','豪雨','吹雪']);
    assert.equal(initial.disasters,fixture.events.length+1);
    const samples=[['晴れ','0,0'],['雷雨','1,0'],['豪雨','0,1'],['吹雪','1,1']];
    for(let i=0;i<samples.length;i++){
      await page.locator(`[data-test-action="weather-sample-${i}"]`).click();
      const info=await page.locator('[data-weather-test-info]').innerText();
      assert(info.includes(`地域 ${samples[i][1]}`)&&info.includes(`天候 ${samples[i][0]}`),info);
      assert.equal(await page.locator('#v39-test-weather-type').inputValue(),samples[i][0]);
      assert.equal(await page.locator(`[data-weather-region="${samples[i][1]}"]`).getAttribute('aria-pressed'),'true');
    }
    await page.locator('[data-test-action="weather-sample-1"]').click();
    assert((await page.locator('[data-weather-conditions]').innerText()).includes('落雷嵐○'));
    await page.locator('#v39-test-weather-type').selectOption('晴れ');
    await page.locator('[data-test-action="weather-change"]').click();
    const changed=await page.evaluate(()=>window.getV39GameState().worldEnvironment.weather);
    assert.equal(changed.regions['1,0'].weather,'晴れ');
    for(const id of ['0,0','0,1','1,1'])assert.deepEqual(changed.regions[id],initial.regions[id]);
    assert((await page.locator('[data-weather-conditions]').innerText()).includes('落雷嵐×'));
    await page.locator('[data-test-action="weather-turn"]').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!window.isV39MapInputLocked());
    const after=await page.evaluate(()=>window.getV39GameState().worldEnvironment.weather);
    assert.equal(after.lastTurn,2);assert.equal(after.regions['1,0'].dryTurns,1);
    assert(after.regions['1,0'].dryness>changed.regions['1,0'].dryness);
    assert((await page.locator('[data-weather-test-info]').innerText()).includes('⌛4'));
    const retained=await page.evaluate(()=>{
      const before=window.getV39GameState().worldEnvironment.weather;
      window.importV39SaveJson(window.exportV39SaveJson());
      return {before,after:window.getV39GameState().worldEnvironment.weather,fixture:window.__v39FieldRuntime.mapData.disasterTestFixture};
    });
    assert.deepEqual(retained.after,retained.before);assert(retained.fixture);
    await page.locator('[data-test-action="weather-sample-0"]').click();
    await page.screenshot({path:`${out}/weather-${width}.png`});
    const overflow=await page.locator('.v39-weather-samples').evaluate(n=>n.scrollWidth>n.clientWidth);
    assert.equal(overflow,false);
    await page.evaluate(()=>window.startV39DisasterTest());
    assert.equal(await page.locator('.v39-weather-samples button').count(),4);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.length),initial.count);
    await page.evaluate(()=>window.startV39ExpeditionTest());
    assert.equal(await page.locator('.v39-weather-samples button').count(),0);
    assert.deepEqual(errors,[]);
    console.log(`${width}: unified entry, four live regions, selection, conditions, isolated override, real 1T, save/restart and layout passed`);
    await page.close();
  }
}finally{await browser.close();}
