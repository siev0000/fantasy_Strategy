import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/settlement-toolbar';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
    await page.waitForSelector('.settlement-actions [data-open-v39-trade]');
    const layout=await page.evaluate(()=>{
      const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom,right:r.right};};
      return {toolbar:rect('.settlement-toolbar'),tabs:rect('.settlement-tabs'),actions:rect('.settlement-actions'),
        trade:rect('.settlement-actions [data-open-v39-trade]'),develop:rect('[data-settlement-development]')};
    });
    assert(layout.tabs.width>=layout.toolbar.width-2,'tabs occupy the full header width');
    assert(layout.actions.y>=layout.tabs.bottom-1,'buttons never squeeze the scrolling tab row');
    assert(layout.trade.right<=width&&layout.develop.right<=width);
    const last=page.locator('.settlement-tab').last();await last.click();
    await page.waitForSelector('.settlement-actions [data-open-v39-trade]');
    const scroll=await page.evaluate(()=>{
      const nav=document.querySelector('.settlement-tabs'),before=nav.scrollLeft;
      window.renderV39SettlementPanel();
      return {before,after:document.querySelector('.settlement-tabs').scrollLeft,
        selected:document.querySelector('.settlement-tab.active').textContent};
    });assert.equal(scroll.before,scroll.after);assert.match(scroll.selected,/東の交易町/);
    const headerY=await page.locator('.settlement-toolbar').evaluate(el=>el.getBoundingClientRect().y);
    await page.locator('.settlement-fold-list').evaluate(el=>el.scrollTop=1000);
    assert.equal(await page.locator('.settlement-toolbar').evaluate(el=>el.getBoundingClientRect().y),headerY);
    await page.screenshot({path:`${out}/header-${width}.png`});
    await page.locator('.settlement-actions [data-open-v39-trade]').click();
    await page.waitForSelector('#v39-trade-modal:not([hidden])');
    await page.locator('[data-trade-action="close"]').click();
    await page.locator('[data-settlement-development]').click();
    await page.waitForSelector('#buildModal.open');
    assert.deepEqual(errors,[]);console.log(`${width}: full-width base tabs, separate action row, fixed header, scroll retention and common trade modal passed`);
    await page.close();
  }
} finally {await browser.close();}
