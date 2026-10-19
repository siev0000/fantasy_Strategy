import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/character-portraits';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();
      const f=window.getV39ActiveFactionState();
      const units=f.units.map((unit,i)=>i>1?unit:window.applyV39DerivedCharacterData({...unit,
        race:'アリ',className:i?'ゾンビ':'ヴァンパイア',level:20,strongAnimalClassName:'フレイムアニマル'}));
      window.updateV39ActiveFactionState({units});await window.waitForV39MapRenderSettled();
      window.openV39CharacterModal();
    });
    const cards=page.locator('#characterModal [data-v39-character-row]');
    const images=cards.locator('.v39-card-portrait-image');
    assert(await images.count()>2);
    assert.equal(await cards.nth(0).locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-slot'),'5');
    assert.equal(await cards.nth(1).locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-slot'),'6');
    const sources=await images.evaluateAll(nodes=>nodes.map(n=>({
      background:n.style.backgroundImage,size:n.style.backgroundSize,
      width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,
      position:n.style.backgroundPosition
    })));
    for(const image of sources){
      assert(image.width>=30&&image.height>=30);assert(image.background!=='none');
      const src=image.background.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
      assert(src);assert.equal((await page.request.get(new URL(src,page.url()).href)).status(),200);
    }
    await cards.first().click();
    await page.locator('[data-v39-character-detail-tab="skills"]').click();
    await cards.nth(1).click();
    assert(await page.locator('[data-v39-character-detail-tab="skills"]').evaluate(n=>n.classList.contains('active')||n.classList.contains('selected')||n.getAttribute('aria-selected')==='true'));
    await page.screenshot({path:`${out}/units-${width}.png`});
    await page.locator('[data-v39-character-location]').selectOption('facility');
    assert(await cards.count()>0);assert(await cards.locator('.v39-card-portrait-image').count()>0);
    await page.screenshot({path:`${out}/storage-${width}.png`});
    await page.locator('[data-v39-character-tab="squad"]').click();
    const members=page.locator('#characterModal [data-v39-squad-member]');
    assert(await members.count()>0);assert(await members.locator('.v39-card-portrait-image').count()>0);
    const overflow=await page.locator('#characterModal .character-layout').evaluate(n=>n.scrollWidth>n.clientWidth+1);
    assert(!overflow,`${width}: layout overflows`);
    assert.deepEqual(errors,[]);
    console.log(`${width}: unit/vampire/zombie/storage/squad portraits, image requests, selection and tab retention passed`);
    await page.close();
  }
}finally{await browser.close();}
