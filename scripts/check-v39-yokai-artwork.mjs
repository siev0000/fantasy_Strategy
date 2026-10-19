import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';
const out='output/web-game/yokai-artwork';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
    const report=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();
      await window.waitForV39MapRenderSettled();
      const {YOKAI_ARTWORK_ENTRIES:entries}=await import('/src/lib/yokai-artwork-config.js');
      const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
      const rows=entries.map(row=>{
        const shapes=[{race:row.name},{className:row.name},{race:'ホーク',name:'名前変更済み',fusionGrowth:{recipeName:row.name}},{race:'タイガー',strongFusionResultName:row.name}];
        return {...row,frames:shapes.map(unit=>art(unit)?.sheetFrame),src:art(shapes[0])?.src};
      });
      const {getV39FusionMaterials,getV39FusionRecipes}=await import('/src/lib/v39-monster-fusion.js');
      const s=window.getV39GameState(),materials=getV39FusionMaterials(window.getV39ActiveFactionState());
      const recipe=getV39FusionRecipes(s).find(r=>r.合成結果==='天狗');
      const {openV39FusionModal}=await import('/src/v39/unit/v39-fusion-modal.js');
      openV39FusionModal('expedition-test-king','facility');
      return {rows,recipeId:recipe.id,goblin:materials.find(u=>u.race==='ゴブリン'&&!u.soulStored)?.id,
        hawk:materials.find(u=>u.race==='ホーク'&&!u.soulStored)?.id,
        recipes:window.getGameDataRows('モンスター合成').filter(r=>entries.some(e=>e.name===r.合成結果)).map(r=>{
          const names=r.素材.split(',').map(value=>value.replace(/_\d+$/u,''));
          const levels=Object.fromEntries(names.map(name=>[name,1]));
          return {name:r.合成結果,expected:entries.find(e=>e.name===r.合成結果).slotNumber,
            slot:art({race:names[0],className:names[0],prerequisiteClassLevels:levels,fusionGrowth:{recipeName:r.合成結果,levelsByClass:levels}})?.sheetFrame.slotNumber};
        }),
        direct:art({race:'天狗',imageFile:'妖怪_ユニット集2.webp',imageIndex:12})?.sheetFrame,
        undead:art({race:'ホーク',className:'ゾンビ',undeadOrigin:{race:'ホーク'},fusionGrowth:{recipeName:'天狗'}})?.sheetFrame};
    });
    assert.equal(report.rows.length,24);assert.equal(report.recipes.length,22);
    for(const recipe of report.recipes)assert.equal(recipe.slot,recipe.expected,`${recipe.name}: inherited undead ingredients must not replace the fusion image`);
    for(const row of report.rows){
      for(const frame of row.frames){assert.equal(frame.fileName,row.fileName);assert.equal(frame.slotNumber,row.slotNumber);assert.equal(frame.column,(row.slotNumber-1)%4);assert.equal(frame.row,Math.floor((row.slotNumber-1)/4));}
      assert.equal((await page.request.get(new URL(row.src,page.url()).href)).status(),200);
    }
    assert.equal(report.direct.slotNumber,12);assert.equal(report.direct.fileName,'妖怪_ユニット集2.webp');
    assert.equal(report.undead.slotNumber,6);assert.equal(report.undead.fileName,'ホーク・スネーク_ユニット集.webp');
    await page.selectOption('[data-fusion-recipe]',report.recipeId);
    await selectFusionMaterial(page,0,report.goblin);await selectFusionMaterial(page,1,report.hawk);
    await page.locator('[data-fusion-confirm]').click();
    assert(await page.locator('.fusion-portrait').evaluateAll(nodes=>nodes.some(n=>decodeURI(n.style.backgroundImage).includes('妖怪_ユニット集1'))));
    await page.screenshot({path:`${out}/fusion-${width}.png`});
    await page.locator('[data-fusion-commit]').click();await page.waitForSelector('[data-fusion-next]');
    await page.waitForFunction(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const visit=node=>String(node.frame?.name||'').includes('妖怪')||(node.list||[]).some(visit);
      return scene.children.list.some(visit);
    });
    const saved=await page.evaluate(async()=>{
      const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
      const unit=window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth?.recipeName==='天狗');
      window.importV39SaveJson(window.exportV39SaveJson());
      const loaded=window.getV39ActiveFactionState().units.find(u=>u.id===unit.id);
      document.querySelector('[data-fusion-close]')?.click();window.openV39CharacterModal();
      return {id:unit.id,frame:art(loaded)?.sheetFrame};
    });
    assert.equal(saved.frame.fileName,'妖怪_ユニット集1.webp');assert.equal(saved.frame.slotNumber,1);
    const card=page.locator(`#characterModal [data-v39-character-row="${saved.id}"]`);
    assert.equal(await card.locator('.v39-card-portrait-image').getAttribute('data-v39-portrait-slot'),'1');
    await card.click();await page.screenshot({path:`${out}/unit-${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}: 24 slots/identities, 22 recipes, precedence, native Tengu fusion/portrait and save passed`);
    await page.close();
  }
}finally {await browser.close();}
