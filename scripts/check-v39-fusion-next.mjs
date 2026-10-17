import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion-next',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      window.openV39FusionModal('expedition-test-king','facility');
    });
    await page.selectOption('[data-fusion-recipe]',{label:'テスト・バイコーン（テスト専用）'});
    const recipe=await page.locator('[data-fusion-recipe]').inputValue();
    await selectFusionMaterial(page,0,'fusion-test-horse');await selectFusionMaterial(page,1,'fusion-test-devil');
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    await page.screenshot({path:`output/web-game/fusion-next/result-${width}.png`});
    assert(await page.locator('[data-fusion-next]').isVisible());
    await page.locator('[data-fusion-next]').click();
    assert.equal(await page.locator('[data-fusion-recipe]').inputValue(),recipe);
    assert.equal(await page.locator('select[data-fusion-mode]').inputValue(),'facility');
    assert.equal(await page.locator('[data-fusion-consumed]').count(),0);
    assert.equal(await page.locator('[data-fusion-candidate="fusion-test-horse"]').count(),0);
    assert.equal(await page.locator('.fusion-slots').innerText().then(s=>s.includes('✓')),false);
    assert(await page.locator('[data-fusion-confirm]').isDisabled());
    assert(await page.evaluate(()=>window.isV39MapInputLocked()));
    const soulIds=await page.evaluate(()=>window.getV39ActiveFactionState().soulStorage.map(s=>s.id));
    await selectFusionMaterial(page,0,soulIds[0]);await selectFusionMaterial(page,1,soulIds[1]);
    assert(!await page.locator('[data-fusion-confirm]').isDisabled());
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    await page.waitForFunction(()=>!document.querySelector('.fusion-result.animating'));
    await page.locator('[data-fusion-next]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().soulStorage.length),0);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.filter(u=>u.fusionGrowth).length),2);
    await page.screenshot({path:`output/web-game/fusion-next/next-${width}.png`});
    await page.locator('[data-fusion-close]').first().click();
    assert(!await page.evaluate(()=>window.isV39MapInputLocked()));
    await page.evaluate(async()=>{window.startV39FusionTest();await window.waitForV39MapRenderSettled();window.openV39FusionModal('expedition-test-king','skill');});
    await page.selectOption('[data-fusion-recipe]',{label:'テスト・バイコーン（テスト専用）'});
    await selectFusionMaterial(page,0,'fusion-test-horse');await selectFusionMaterial(page,1,'fusion-test-devil');
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    const spent=await page.evaluate(()=>{const f=window.getV39ActiveFactionState();return JSON.stringify([f.units.find(u=>u.id==='expedition-test-king').ap,f.combatRuntime]);});
    await page.locator('[data-fusion-next]').click();
    assert.equal(await page.evaluate(()=>{const f=window.getV39ActiveFactionState();return JSON.stringify([f.units.find(u=>u.id==='expedition-test-king').ap,f.combatRuntime]);}),spent);
    const nextSouls=await page.evaluate(()=>window.getV39ActiveFactionState().soulStorage.map(s=>s.id));
    await selectFusionMaterial(page,0,nextSouls[0]);await selectFusionMaterial(page,1,nextSouls[1]);
    assert(await page.locator('[data-fusion-confirm]').isDisabled(),'skill turn-use/AP/CT restrictions remain');
    assert.deepEqual(errors,[]);console.log(`${width}: next during/after animation, repeated facility fusion, fresh candidates, lock and skill costs preserved`);
    await page.close();
  }
}finally{await browser.close();}
