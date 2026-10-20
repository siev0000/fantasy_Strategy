import assert from 'node:assert/strict';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disaster-fixtures';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39DisasterTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
    await page.locator('[data-test-action="disaster-test-start"]').click();
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    await page.waitForFunction(()=>document.getElementById('v39-test-disaster-fixture'));
    const initial=await page.evaluate(()=>{
      const state=window.getV39GameState(),events=state.worldEnvironment.activeDisasters;
      const keys=new Set();let overlap=false;
      for(const event of events)for(const key of event.tileKeys){if(keys.has(key))overlap=true;keys.add(key);}
      return {ids:events.map(e=>e.disasterId),forced:events.every(e=>e.forced),overlap,
        observers:state.players[0].factionState.units.filter(u=>u.id.startsWith('disaster-observer-')).length,
        units:state.players[0].factionState.units.length};
    });
    assert.deepEqual(new Set(initial.ids),new Set([...fixture.events.map(e=>e.id),'災害:落雷嵐']));
    assert(initial.forced&&!initial.overlap);assert.equal(initial.observers,fixture.events.length-3);
    assert.equal(await page.locator('#v39-test-disaster-fixture option').count(),initial.ids.length);
    for(const sample of [...fixture.events,{id:'災害:落雷嵐',...fixture.lightning}]){
      await page.locator('#v39-test-disaster-fixture').selectOption(sample.id);
      await page.locator('[data-test-action="disaster-fixture-focus"]').click();
      assert.deepEqual(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile),{x:sample.x,y:sample.y});
    }
    await page.locator('#v39-test-disaster-fixture').selectOption('災害:瘴気');
    await page.locator('[data-test-action="disaster-fixture-focus"]').click();
    await page.waitForTimeout(400);await page.screenshot({path:`${out}/miasma-${width}.png`});
    await page.locator('#v39-test-disaster-id').selectOption('災害:聖光暴発');
    await page.locator('[data-test-action="disaster-fixture-focus"]').click();
    assert.deepEqual(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39SelectedTile),{x:fixture.events[0].x,y:fixture.events[0].y});
    const retained=await page.evaluate(async()=>{
      const before=JSON.stringify(window.getV39GameState().worldEnvironment.activeDisasters);
      window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
      return before===JSON.stringify(window.getV39GameState().worldEnvironment.activeDisasters);
    });assert(retained);
    await page.locator('[data-test-action="weather-turn"]').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!window.isV39MapInputLocked());
    assert((await page.locator('#v39-test-disaster-fixture option[value="災害:地震"]').innerText()).includes('終了'));
    await page.locator('[data-test-action="disaster-natural-start"]').click();
    assert.equal(await page.locator('#v39-test-disaster-fixture').count(),0);
    assert.equal(await page.evaluate(()=>window.getV39GameState().worldEnvironment.activeDisasters.length),0);
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    assert.equal(await page.locator('#v39-test-disaster-fixture option').count(),initial.ids.length);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.length),initial.units);
    assert.deepEqual(errors,[]);console.log(`${width}: ${initial.ids.length} distinct hazards, no overlaps, observers/focus, save/expiry and natural/fixed switch passed`);
    await page.close();
  }
}finally{await browser.close();}
