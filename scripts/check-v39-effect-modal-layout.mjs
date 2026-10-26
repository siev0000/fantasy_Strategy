import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/effect-modal-layout';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const [width,height] of [[320,600],[390,844],[844,390],[1100,900]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.setDefaultTimeout(7000); page.on('pageerror',e=>{errors.push(String(e.stack));console.log(String(e.stack))});
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
    await page.locator('#v39-title-effect-settings-open').click();
    await page.locator('#v39-effect-preview-stage.is-ready').waitFor();
    assert.equal(await page.locator('#v39-effect-settings-back').textContent(),'← タイトル');
    await page.locator('#v39-effect-composite-selector').selectOption({index:1}); const selected=await page.locator('#v39-effect-composite-selector').inputValue();
    await page.locator('#v39-effect-settings-back').click();
    assert(await page.locator('#v39-title-effect-settings-open').isVisible());
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      await window.startV39ExpeditionTest();window.activateV39FooterTab('manage');
    });
    await page.locator('#v39-manage-effect-settings').click();
    await page.locator('#v39-effect-preview-stage.is-ready').waitFor();
    assert.equal(await page.locator('#v39-effect-settings-back').textContent(),'← 管理');
    assert.equal(await page.locator('#v39-effect-composite-selector').inputValue(),selected);
    const bounds=await page.evaluate(()=>{
      const panel=document.querySelector('#v39-effect-settings-panel'),host=panel.parentElement;
      const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      const body=document.querySelector('.v39-effect-settings-body');
      return {host:rect(host),panel:rect(panel),stage:rect(document.querySelector('#v39-effect-preview-stage')),
        body:rect(body),status:rect(document.querySelector('#v39-effect-settings-status')),overflow:panel.scrollWidth>panel.clientWidth+1};
    });
    assert.equal(bounds.host.top,0);assert.equal(bounds.host.height,height);
    assert.equal(bounds.panel.height,height);assert(!bounds.overflow);
    assert(bounds.stage.height>=60,`preview must remain usable: ${JSON.stringify(bounds)}`);
    assert(bounds.body.height>=70);assert(bounds.status.bottom<=height+1);
    await page.screenshot({path:`${out}/manage-${width}x${height}.png`});
    await page.locator('#v39-effect-setting-preview-local').click();
    await page.waitForFunction(()=>document.getElementById('v39-effect-settings-status').textContent.includes('再生'));
    await page.keyboard.press('Escape');
    assert(await page.locator('#v39-effect-settings-host').isHidden());
    assert.equal(await page.evaluate(()=>document.activeElement.id),'v39-manage-effect-settings');
    await page.locator('#v39-manage-effect-settings').click();
    assert.equal(await page.locator('#v39-effect-preview-stage canvas:not(#v39-effect-idle-preview)').count(),1);
    await page.locator('[data-v39-effect-tab="data"]').click();
    await page.locator('#v39-effect-setting-preview').click();
    assert(await page.locator('#v39-effect-settings-host').isHidden(),'map preview must reveal field');
    assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: title/manage share fullscreen editor, preview, focus, reopen and map reveal OK`);
    await page.close();
  }
}finally{await browser.close();}
