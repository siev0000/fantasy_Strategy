import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/character-squad-header',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    const squads=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
      const f=window.getV39ActiveFactionState();window.updateV39ActiveFactionState({squads:[...f.squads,{id:'empty-header-test',name:'空の部隊',unitIds:[]}]});
      window.openV39CharacterModal();return f.squads.map(s=>({id:s.id,ids:s.unitIds||s.memberIds||[]}));
    });
    assert.equal(await page.locator('#characterModal .modal-head h2').innerText(),'ユニット一覧');
    await page.locator('[data-v39-character-tab="squad"]').click();
    const select=page.locator('[data-v39-character-squad-select]');
    for(const squad of squads){
      await select.selectOption(squad.id);
      const shown=await page.locator('[data-v39-squad-member]').evaluateAll(nodes=>nodes.map(n=>n.dataset.v39SquadMember));
      assert.deepEqual(new Set(shown),new Set(squad.ids));
      assert.equal(await page.locator('.v39-char-group-heading').count(),0);
    }
    await select.selectOption('empty-header-test');
    assert.equal(await page.locator('[data-v39-squad-member]').count(),0);
    assert.match(await page.locator('#characterModal .squad-detail-pane').innerText(),/表示対象がありません/);
    const populated=squads.find(s=>s.ids.length>0&&s.id!=='solo');await select.selectOption(populated.id);
    await page.locator('[data-v39-character-detail-tab="skills"]').click();
    await page.locator('[data-v39-character-tab="character"]').click();
    assert(!await select.isVisible());
    await page.locator('[data-v39-character-tab="squad"]').click();
    assert.equal(await select.inputValue(),populated.id);
    assert(await page.locator('[data-v39-character-detail-tab="skills"]').evaluate(n=>n.classList.contains('active')));
    const toolbar=page.locator('.v39-char-squad-toolbar'),before=await toolbar.boundingBox();
    await page.locator('#characterModal .list-pane').evaluate(n=>n.scrollTop=9999);
    assert.deepEqual(await toolbar.boundingBox(),before,'squad header stays fixed');
    assert(before.x>=0&&before.x+before.width<=width+1);
    await page.screenshot({path:`output/web-game/character-squad-header/squad-${width}.png`});
    await page.locator(`#characterModal [data-v39-character-squad-edit="${populated.id}"]`).click();
    assert(await page.locator('#v39-squad-editor').isVisible());
    assert.deepEqual(errors,[]);console.log(`${width}: title, squad header switching, member isolation, empty squad, fixed header and editor passed`);
    await page.close();
  }
}finally{await browser.close();}
