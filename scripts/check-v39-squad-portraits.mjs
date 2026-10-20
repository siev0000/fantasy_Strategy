import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/squad-portraits';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const f=window.getV39ActiveFactionState();
      const units=f.units.map((unit,i)=>i>1?unit:window.applyV39DerivedCharacterData({...unit,race:'アリ',className:i?'ゾンビ':'ヴァンパイア',level:20}));
      window.updateV39ActiveFactionState({units});window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();
      await window.waitForV39MapRenderSettled();
    });
    const cards=page.locator('#squadMemberList [data-v39-unit-id]');
    assert(await cards.count()>=3);
    const inspect=nodes=>nodes.map(card=>{
      const image=card.querySelector('.v39-card-portrait-image'),rect=card.getBoundingClientRect(),box=image?.getBoundingClientRect();
      return {id:card.dataset.v39UnitId,file:image?.dataset.v39PortraitFile,slot:image?.dataset.v39PortraitSlot,
        background:image?.style.backgroundImage,position:image?.style.backgroundPosition,size:image?.style.backgroundSize,
        width:box?.width,height:box?.height,cardHeight:rect.height,level:card.querySelector('.v39-card-portrait-level')?.textContent,
        gauges:card.querySelectorAll('.v39-card-vital').length,overflow:card.scrollWidth>card.clientWidth+1};
    });
    const entries=await cards.evaluateAll(inspect);
    assert.equal(entries[0].slot,'5');assert.equal(entries[1].slot,'6');
    for(const entry of entries){
      assert(entry.file&&entry.level);assert(entry.width>=30&&entry.height>=30);assert(entry.cardHeight<=110);assert.equal(entry.gauges,2);assert(!entry.overflow);
      const src=entry.background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];assert(src);assert.equal((await page.request.get(new URL(src,page.url()).href)).status(),200);
    }
    for(const tab of ['status','basic','action']){
      await page.locator(`[data-squad-detail-tab="${tab}"]`).click();
      await cards.nth(1).locator('.v39-card-portrait-image').click();
      assert.equal(await cards.nth(1).getAttribute('class').then(value=>value.includes('selected')),true);
      assert.equal(await page.locator('[data-squad-detail-tab].active').getAttribute('data-squad-detail-tab'),tab);
      await cards.nth(0).locator('.v39-card-portrait-image').click();
    }
    await page.screenshot({path:`${out}/field-${width}.png`});
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="character"]').click();
    for(const entry of entries){
      const image=page.locator(`#characterModal [data-v39-character-row="${entry.id}"] .v39-card-portrait-image`);
      assert.equal(await image.getAttribute('data-v39-portrait-file'),entry.file);
      assert.equal(await image.getAttribute('data-v39-portrait-slot'),entry.slot);
      assert.equal(await image.evaluate(n=>n.style.backgroundPosition),entry.position);
      assert.equal(await image.evaluate(n=>n.style.backgroundSize),entry.size);
    }
    await page.locator('#characterModal [data-close]').click();
    await page.locator('#squadSelector [data-squad-select="solo"]').click();
    assert(await cards.count()>0);assert.equal(await cards.locator('.v39-card-portrait-image').count(),await cards.count());
    await page.screenshot({path:`${out}/solo-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: shared field/modal artwork and frames, Lv/HP/AP, image loading, portrait click/tab retention, squad/solo layout passed`);
    await page.close();
  }
}finally{await browser.close();}
