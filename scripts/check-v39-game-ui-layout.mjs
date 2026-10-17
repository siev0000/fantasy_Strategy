import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/game-ui-layout';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();});
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.evaluate(()=>window.openV39CharacterModal());
    const bounds=async selector=>{
      const r=await page.locator(selector).boundingBox();
      assert(r&&r.x>=-1&&r.x+r.width<=width+1,`${selector} fits ${width}px: ${JSON.stringify(r)}`);
    };
    await page.locator('[data-v39-character-tab="squad"]').click();
    assert(await page.locator('[data-v39-squad-member]').count()>0);
    await page.locator('[data-v39-squad-member]').last().click();
    const name=await page.locator('[data-v39-squad-member].selected').innerText();
    assert(name.trim());
    assert(await page.locator('#characterModal .squad-detail-pane').isVisible());
    for(const tab of ['status','skills','equipment','growth']) {
      await page.locator(`[data-v39-character-detail-tab="${tab}"]`).click();
      assert(await page.locator('#characterModal .v39-char-detail-panel').isVisible());
    }
    await page.screenshot({path:`${out}/squad-${width}.png`});
    await bounds('#characterModal .modal');
    await bounds('#characterModal .squad-detail-pane');
    await page.locator('[data-v39-squad-member]').first().click();
    const memberName=await page.locator('[data-v39-squad-member].selected .squad-name').innerText();
    await page.locator('[data-v39-character-detail-tab="equipment"]').click();
    await page.locator('[data-v39-character-equip-open]:not(:disabled)').first().click();
    assert.equal(await page.locator('#v39-equipment-picker header p').innerText(),memberName,'squad equipment edits selected member, not squad ID');
    await page.locator('#v39-equipment-picker [data-equipment-picker-close]').last().click();
    await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState(),base=faction.units[0];
      const corpse={...base,id:'layout-corpse',name:'倒れた仲間',hp:0,currentHp:0,state:'死亡'};
      window.updateV39ActiveFactionState({units:[...faction.units,corpse],deadUnitReserve:[...(faction.deadUnitReserve||[]),{unit:{...corpse,id:'layout-reserve'},storedAtMs:Date.now()}]},{reason:'layout-dead-fixture'});
    });
    for(const tab of ['corpse','dead']) {
      await page.locator(`[data-v39-character-tab="${tab}"]`).click();
      assert(await page.locator('#characterModal .list-pane .squad-card').count()>0,'dead tabs reuse unit cards');
      assert(await page.locator('#characterModal .squad-detail-pane').isVisible());
      await page.locator('[data-v39-character-detail-tab="skills"]').click();
      assert(await page.locator('#characterModal .v39-char-detail-panel').isVisible());
    }
    await page.evaluate(()=>document.getElementById('characterModal').classList.remove('open'));
    await page.evaluate(()=>window.openV39Research('魔法Lv'));
    await page.locator('#researchModal.open').waitFor();
    await bounds('#researchModal .modal');
    await bounds('.v39-research-board');
    await page.screenshot({path:`${out}/research-list-${width}.png`});
    await page.locator('[data-research-item]').first().click();
    assert(await page.locator('.v39-research-detail').isVisible());
    assert(await page.locator('[data-select-research]').isVisible());
    await page.locator('[data-select-research]').click();
    assert.equal(await page.locator('[data-select-research]').innerText(),'研究中');
    assert(await page.locator('.v39-research-item.picked').count()>0,'chosen research appears as active in list');
    if(width<=760)await page.locator('[data-research-back]').click();
    await page.locator('[data-research-view]').selectOption('flow');
    await page.screenshot({path:`${out}/research-flow-${width}.png`});
    await page.evaluate(()=>{document.getElementById('researchModal').classList.remove('open');window.activateV39FooterTab('settlement');});
    for(const tab of ['overview','production','operation']) {
      await page.locator(`[data-settlement-page-select="${tab}"]`).click();
      assert(await page.locator(`[data-settlement-page="${tab}"]`).first().isVisible());
      assert.equal(await page.locator('[data-settlement-page]:not([hidden])').evaluateAll(nodes=>nodes.every(node=>node.dataset.settlementPage===document.querySelector('[data-settlement-page-select][aria-pressed=true]').dataset.settlementPageSelect)),true);
    }
    await page.screenshot({path:`${out}/settlement-${width}.png`});
    await page.evaluate(()=>{
      window.activateV39FooterTab('tile');
      const base=window.getV39ActiveFactionState().settlements[0];
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:base.x,y:base.y}}));
    });
    assert.notEqual(await page.locator('#v39-land-terrain').innerText(),'マスを選択');
    await page.screenshot({path:`${out}/land-${width}.png`});
    await page.evaluate(()=>window.startV39VillageIncidentTest());
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.evaluate(()=>{
      window.closeV39VillageMenu();
      const village=window.getV39GameState().neutralVillages[0];
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:village.x,y:village.y}}));
      window.activateV39FooterTab('interaction');
    });
    assert(await page.locator('#footInteraction #v39-world-contact-actions').isVisible());
    await page.screenshot({path:`${out}/interaction-${width}.png`});
    await page.evaluate(()=>window.openV39VillageMenu(window.getV39GameState().neutralVillages[0].id));
    assert.equal(await page.locator('.v39-conversation-preparation').getAttribute('open'),null);
    const speechTop=await page.locator('.v39-conversation-stage').evaluate(node=>node.getBoundingClientRect().top);
    await page.locator('.v39-village-choice-area').evaluate(node=>node.scrollTop=node.scrollHeight);
    assert.equal(await page.locator('.v39-conversation-stage').evaluate(node=>node.getBoundingClientRect().top),speechTop,'choices scroll without moving speech');
    await page.locator('.v39-village-choice-area').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:`${out}/conversation-${width}.png`});
    await page.locator('#v39-village-menu [data-open-v39-trade]').click();
    await page.locator('[data-trade-add-side="0"]').click();
    await page.locator('[data-trade-resource-add="木材"]').click();
    await page.locator('[data-trade-picker-close]').last().click();
    await page.locator('[data-trade-add-side="1"]').click();
    await page.locator('[data-trade-resource-add="穀物"]').click();
    await page.locator('[data-trade-picker-close]').last().click();
    await page.screenshot({path:`${out}/trade-${width}.png`});
    const baskets=await page.locator('.v39-trade-basket').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));
    assert.equal(baskets[0].y,baskets[1].y,'offer and request stay side by side');
    assert(baskets[1].right<=width+1);
    assert.deepEqual(errors,[]);
    console.log(`${width}: shared character details, research list/flow/back, settlement pages, land, interaction, conversation and two-sided trade passed`);
    await page.close();
  }
} finally {await browser.close();}
