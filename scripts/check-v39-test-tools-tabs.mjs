import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/test-tools-tabs',{recursive:true});
const groups={scenarios:['expedition','undead-natural'],turns:['turns','faction'],settlement:['base-info','settlement-resources','city-research','territory'],unit:['character','test-skills'],environment:['field'],diagnostics:['enemy-ai']};
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:800}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text());});
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();
    await page.evaluate(()=>window.startV39ExpeditionTest());
    const visible=()=>page.locator('[data-test-section]:visible').evaluateAll(rows=>rows.map(row=>row.dataset.testSection));
    for(const [id,sections] of Object.entries(groups)) {
      await page.locator(`[data-test-tab="${id}"]`).click();
      assert.deepEqual((await visible()).sort(),[...sections].sort());
      assert.equal(await page.locator('.v39-test-tools-tabs [role="tab"][aria-selected="true"]').count(),1);
    }
    await page.locator('[data-test-tab="unit"]').click();
    await page.locator('[data-test-action="hp-minus"]').click();
    await page.evaluate(()=>{const scroll=document.querySelector('.v39-test-tools-scroll');scroll.scrollTop=80;});
    const before=await page.locator('.v39-test-tools-scroll').evaluate(row=>row.scrollTop);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:game-state-changed')));
    await page.waitForTimeout(80);
    assert.equal(await page.locator('.v39-test-tools-scroll').evaluate(row=>row.scrollTop),before);
    await page.locator('[data-test-section="test-skills"] summary').click();
    await page.locator('[data-test-tab="turns"]').click();
    const head=await page.locator('.v39-test-tools-tabs').boundingBox();
    await page.locator('[data-test-action="faction-player"]').click();
    await page.evaluate(()=>window.openV39TestTools());
    assert.deepEqual((await visible()).sort(),['faction','turns']);
    await page.screenshot({path:`output/web-game/test-tools-tabs/turns-${width}.png`});
    await page.locator('[data-test-tab="unit"]').click();
    assert.equal(await page.locator('[data-test-section="test-skills"]').getAttribute('open'),null);
    await page.locator('[data-test-tab="settlement"]').click();
    await page.locator('.v39-test-tools-scroll').evaluate(row=>{row.scrollTop=80;});
    const settlementScroll=await page.locator('.v39-test-tools-scroll').evaluate(row=>row.scrollTop);assert(settlementScroll>0);
    await page.locator('[data-test-tab="environment"]').click();
    assert.equal(await page.locator('.v39-test-tools-scroll').evaluate(row=>row.scrollTop),0);
    await page.locator('[data-test-tab="settlement"]').click();
    assert.equal(await page.locator('.v39-test-tools-scroll').evaluate(row=>row.scrollTop),settlementScroll);
    // Each tab starts/restores its own scroll offset; a tab switch never carries the previous tab's offset.
    await page.locator('[data-test-tab="environment"]').click();
    await page.locator('[data-test-tab="environment"]').press('ArrowRight');
    assert.equal(await page.locator('.v39-test-tools-tabs [role="tab"][aria-selected="true"]').getAttribute('data-test-tab'),'diagnostics');
    await page.locator('[data-test-tab="diagnostics"]').press('Home');
    assert.equal(await page.locator('.v39-test-tools-tabs [role="tab"][aria-selected="true"]').getAttribute('data-test-tab'),'scenarios');
    assert.equal(await page.locator('[data-test-section]').count(),12,'no tool sections removed');
    const rect=await page.locator('.v39-test-tools-tabs').boundingBox();assert(Math.abs(rect.y-head.y)<1,'tab bar remains fixed');
    await page.screenshot({path:`output/web-game/test-tools-tabs/scenarios-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: six categories, native actions, state retention, keyboard and fixed tab bar passed`);await page.close();
  }
} finally {await browser.close();}
