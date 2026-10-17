import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/character-storage',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    const expected=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      const {recoverV39CorpseToFacility}=await import('/src/lib/v39-corpse-storage.js');
      const {getV39StorageFacilities}=await import('/src/lib/v39-facility-storage.js');
      const s=window.getV39GameState(),f=s.players.find(p=>p.id===s.activePlayerId).factionState;
      const result=recoverV39CorpseToFacility(s,s.activePlayerId,getV39StorageFacilities(s,s.activePlayerId).find(f=>f.type==='corpse'),'mausoleum-test-corpse');
      if(!result.ok)throw Error(result.reason);
      window.setV39GameState({players:result.state.players,enemies:result.state.enemies});window.openV39CharacterModal();
      return {field:f.units.filter(u=>u.hp>0&&u.state!=='死亡').length,stored:f.facilityStorage.length,id:f.facilityStorage[0].unit.id};
    });
    const filter=page.locator('[data-v39-character-location]');
    assert.equal(await page.locator('#characterModal [data-v39-character-row]').count(),expected.field+expected.stored+4);
    await filter.selectOption('facility');
    assert.equal(await page.locator('#characterModal [data-v39-character-row]').count(),expected.stored);
    await page.locator(`#characterModal [data-v39-character-row="${expected.id}"]`).click();
    assert.match(await page.locator('#characterModal .v39-char-storage-location').innerText(),/魔獣研究所.*3,3/);
    assert.equal(await page.locator('#characterModal [data-v39-squad-mode]').count(),0);
    for(const tab of ['skills','equipment','growth','status']){
      await page.locator(`[data-v39-character-detail-tab="${tab}"]`).click();
      assert(await page.locator('#characterModal .v39-char-detail-panel').isVisible());
      if(tab==='equipment')assert.equal(await page.locator('#characterModal [data-v39-character-equip-open],#characterModal [data-v39-tool-settings-save]').count(),0);
      if(tab==='growth')assert.equal(await page.locator('#characterModal [data-v39-class-acquire]').count(),0);
    }
    await page.screenshot({path:`output/web-game/character-storage/facility-${width}.png`});
    await filter.selectOption('mausoleum');
    assert.equal(await page.locator('#characterModal [data-v39-character-row]').count(),4);
    assert.match(await page.locator('#characterModal .v39-char-storage-location').innerText(),/霊廟.*5,5.*消滅停止/);
    assert.match(await page.locator('#characterModal .squad-card .v39-card-vital.hp').first().innerText(),/0\/90/);
    await page.screenshot({path:`output/web-game/character-storage/mausoleum-${width}.png`});
    await filter.selectOption('field');
    assert.equal(await page.locator('#characterModal [data-v39-character-row]').count(),expected.field);
    await page.locator('[data-v39-character-tab="dead"]').click();
    assert.equal(await page.locator('#characterModal [data-v39-character-row="mausoleum-test-corpse"]').count(),1);
    await page.locator('[data-v39-character-tab="character"]').click();
    assert.equal(await filter.inputValue(),'field','location filter persists across tabs');
    const rect=await page.locator('#characterModal .squad-detail-pane').boundingBox();assert(rect.x>=0&&rect.x+rect.width<=width+1);
    assert.deepEqual(errors,[]);console.log(`${width}: facility/mausoleum roster, counts, locations, detail tabs and read-only guards passed`);
    await page.close();
  }
}finally{await browser.close();}
