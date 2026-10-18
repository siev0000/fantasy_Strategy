import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/action-tabs',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();window.activateV39FooterTab('squad');});
    assert.deepEqual(await page.locator('[data-squad-detail-tab]').allTextContents(),['能力','基本','スキル']);
    await page.locator('[data-squad-detail-tab="basic"]').click();
    assert(await page.locator('#mobileBattleMove').isVisible());assert(await page.locator('#mobileBattleWait').isVisible());assert(await page.locator('#mobileBattleSurvey').isVisible());
    assert(!await page.locator('#detailTechniqueRows').isVisible());
    assert.equal(await page.locator('#detailBasicList [data-v39-attack-name]').count(),0);
    await page.screenshot({path:`output/web-game/action-tabs/basic-${width}.png`});
    await page.locator('[data-squad-detail-tab="action"]').click();
    assert(!await page.locator('#mobileBattleMove').isVisible());
    assert(await page.locator('#detailTechniqueRows [data-v39-attack-name]').first().isVisible());
    assert.equal(await page.locator('#detailTechniqueRows .system-action-card').count(),0);
    await page.locator('#detailTechniqueRows [data-v39-attack-name]:not(.unavailable)').first().click();
    assert(await page.evaluate(()=>!!window.getV39AttackSession()));
    await page.locator('[data-squad-detail-tab="basic"]').click();
    await page.locator('#mobileBattleWait').click();
    assert(!await page.evaluate(()=>window.getV39AttackSession()));
    await page.locator('#mobileBattleWaitUse').click();
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().ap),100);
    await page.locator('[data-squad-detail-tab="action"]').click();
    await page.locator('#squadMemberList [data-v39-unit-id]').last().click();
    assert(await page.locator('[data-squad-detail-panel="action"]').isVisible(),'unit switching retains tab');
    await page.screenshot({path:`output/web-game/action-tabs/skills-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: three tabs, basic/skill separation, attack cancellation, native wait and retained selection passed`);
    await page.close();
  }
}finally{await browser.close();}
