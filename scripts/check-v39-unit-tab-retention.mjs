import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/unit-tab-retention';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.stack));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState(),members=new Set(['expedition-test-carrier','expedition-test-guard']);
      window.updateV39ActiveFactionState({
        units:faction.units.map(unit=>members.has(unit.id)?{...unit,squadId:'retention-second-squad'}:unit),
        squads:[...faction.squads.map(squad=>({...squad,unitIds:squad.unitIds.filter(id=>!members.has(id))})),
          {id:'retention-second-squad',label:'切替検証部隊',unitIds:[...members]}]
      });
      window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();
    });
    for(const tab of ['status','action']){
      await page.locator(`[data-squad-detail-tab="${tab}"]`).click();
      const cards=page.locator('#squadMemberList [data-v39-unit-id]');assert(await cards.count()>1);
      await cards.nth(1).click();
      assert.equal(await page.locator('[data-squad-detail-tab].active').getAttribute('data-squad-detail-tab'),tab);
      await cards.nth(0).click();
      assert.equal(await page.locator('[data-squad-detail-tab].active').getAttribute('data-squad-detail-tab'),tab);
      await page.evaluate(()=>{
        const unit=window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-knight');
        window.getV39MapEntityMarker(unit.id).emit('pointerdown');
      });
      assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().selectedUnitId),'expedition-test-knight');
      assert.equal(await page.locator('[data-squad-detail-tab].active').getAttribute('data-squad-detail-tab'),tab);
    }
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="character"]').click();
    for(const tab of ['status','skills','equipment','growth']){
      await page.locator(`[data-v39-character-detail-tab="${tab}"]`).click();
      const rows=page.locator('#characterModal [data-v39-character-row]');
      await rows.nth(1).click();
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
      await rows.nth(0).click();
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
      await page.locator('[data-v39-character-tab="squad"]').click();
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
      const members=page.locator('#characterModal [data-v39-squad-member]');
      assert(await members.count()>1);
      await members.nth(1).click();
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
      await page.locator('#characterModal [data-v39-character-squad-select]').selectOption('retention-second-squad');
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
      await page.locator('[data-v39-character-tab="character"]').click();
      assert.equal(await page.locator('#characterModal [data-v39-character-detail-tab].active').getAttribute('data-v39-character-detail-tab'),tab);
    }
    await page.locator('[data-v39-character-detail-tab="skills"]').click();
    await page.locator('#characterModal [data-v39-character-row]').nth(1).click();
    await page.screenshot({path:`${out}/${width}.png`});assert.deepEqual(errors,[]);
    console.log(`${width}: field status/action, map selection and modal ability/skills/equipment/growth retained across units, squads and members`);
    await page.close();
  }
}finally{await browser.close();}
