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
    await page.waitForSelector('.settlement-detail-pane');
    const layout=await page.evaluate(()=>{
      const rect=sel=>{const r=document.querySelector(sel).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom,right:r.right};};
      return {tabs:rect('.settlement-tabs'),detail:rect('.settlement-detail-pane'),develop:rect('[data-settlement-development]')};
    });
    assert(layout.tabs.right<=layout.detail.x,'settlement list is left of details');
    assert(layout.detail.right<=width&&layout.develop.right<=width);
    await page.locator('[data-settlement-page-select="production"]').click();
    await page.locator('[data-settlement-fold="facility"]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-settlement-development]').isVisible(),false);
    const last=page.locator('.settlement-tab').last();await last.click();
    await page.waitForSelector('.settlement-tab.active');
    const scroll=await page.evaluate(()=>{
      const nav=document.querySelector('.settlement-tabs'),before=nav.scrollTop;
      window.renderV39SettlementPanel();
      return {before,after:document.querySelector('.settlement-tabs').scrollTop,
        selected:document.querySelector('.settlement-tab.active').textContent};
    });assert.equal(scroll.before,scroll.after);assert.match(scroll.selected,/東の交易町/);
    assert.equal(await page.locator('[data-settlement-page-select="production"]').getAttribute('aria-pressed'),'true');
    const headerY=await page.locator('.settlement-pages').evaluate(el=>el.getBoundingClientRect().y);
    await page.locator('.settlement-fold-list').evaluate(el=>el.scrollTop=1000);
    assert.equal(await page.locator('.settlement-pages').evaluate(el=>el.getBoundingClientRect().y),headerY);
    await page.screenshot({path:`${out}/header-${width}.png`});
    await page.locator('[data-settlement-page-select="operation"]').click();
    await page.locator('#footSettlement [data-open-v39-trade]').click();
    await page.waitForSelector('#v39-trade-modal:not([hidden])');
    await page.locator('[data-trade-action="close"]').click();
    await page.locator('[data-settlement-page-select="overview"]').click();
    await page.screenshot({path:`${out}/overview-${width}.png`});
    await page.locator('[data-settlement-development]').click();
    await page.waitForSelector('#buildModal.open');
    assert.deepEqual(errors,[]);console.log(`${width}: split panes, tab retention, independent scroll, contextual trade/development passed`);
    await page.close();
  }
} finally {await browser.close();}
