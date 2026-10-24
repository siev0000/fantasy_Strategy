import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const output='output/web-game/facility-panel';
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39RitualTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39RitualTest(1);});
    await page.keyboard.press('Escape');
    const facilityTab=page.locator('#footSettlement [data-settlement-page-select="facility"]');
    assert.equal(await facilityTab.getAttribute('aria-pressed'),'true');
    const rows=page.locator('#footSettlement [data-settlement-facility]');
    assert(await rows.count()>=8);
    const fire=rows.filter({hasText:'火の儀式場'}),water=rows.filter({hasText:'水の儀式場'});
    await water.click();
    const selectedId=await water.getAttribute('data-settlement-facility');
    assert.equal(await water.getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#footSettlement [data-facility-detail]').count(),1);
    const summon=page.locator('#footSettlement [data-facility-summon-open]');
    const slotId=await summon.getAttribute('data-facility-summon-open');
    await summon.click();
    assert.equal(await page.locator('[data-facility-slot]').inputValue(),slotId);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>window.renderV39SettlementPanel());
    assert.equal(await page.locator('#footSettlement [aria-expanded="true"][data-settlement-facility]').getAttribute('data-settlement-facility'),selectedId);
    await page.screenshot({path:`${output}/settlement-${width}.png`});
    await fire.click();
    const tileKey=JSON.parse(await fire.getAttribute('data-settlement-facility'))[1];
    const fireSlot=await page.locator('#footSettlement [data-facility-summon-open]').getAttribute('data-facility-summon-open');
    await page.evaluate(key=>{
      const [x,y]=key.split(',').map(Number);
      window.activateV39FooterTab('tile');
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));
    },tileKey);
    const land=page.locator('#v39-land-facility-actions');
    assert(await land.isVisible(),'owned tile exposes facility operations');
    assert.equal(await land.locator('[data-facility-summon-open]').getAttribute('data-facility-summon-open'),fireSlot);
    await land.locator('[data-facility-summon-open]').click();
    assert.equal(await page.locator('[data-facility-slot]').inputValue(),fireSlot);
    await page.keyboard.press('Escape');
    await page.screenshot({path:`${output}/land-${width}.png`});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
    await page.evaluate(key=>{
      const state=window.getV39GameState();
      window.setV39GameState({territoryOwnerByTile:{...state.territoryOwnerByTile,[key]:'foreign-owner'}},{reason:'facility-panel-test'});
    },tileKey);
    assert.equal(await land.isVisible(),false,'foreign facility cannot be used');
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:field-generated')));
    assert.equal(await land.isVisible(),false,'reset clears facility actions');
    await page.evaluate(async()=>{
      window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      window.activateV39FooterTab('tile');
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:3,y:3}}));
    });
    await land.locator('[data-storage-open="3,3"][data-storage-name="魔獣研究所"]').click();
    assert.match(await page.locator('#v39-facility-storage header').innerText(),/魔獣研究所/);
    await page.locator('[data-storage-close]').click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:0,y:0}})));
    assert.equal(await land.isVisible(),false,'empty tile clears actions');
    assert.deepEqual(errors,[]);
    console.log(`${width}: vertical selection, retained selection, exact summon slot, land summon/storage and foreign/empty/reset guards passed`);
    await page.close();
  }
}finally{await browser.close();}
