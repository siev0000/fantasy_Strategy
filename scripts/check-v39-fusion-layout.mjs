import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {selectFusionMaterial,fusionCandidateIds} from './lib/v39-fusion-ui.mjs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion-layout',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const height=width===320?568:844;
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();});
    await page.locator('[data-v39-fusion-open]').first().click();
    assert.equal(await page.locator('.fusion-preview .silhouette').count(),1);
    assert.equal(await page.locator('select[data-fusion-material]').count(),0,'no legacy hidden selection UI');
    const candidates=await fusionCandidateIds(page,0);assert(candidates.length>=2);
    await page.locator('[data-fusion-detail-tab="skills"]').click();
    await page.locator(`[data-fusion-candidate="${candidates[1]}"]`).click();
    assert.equal(await page.locator('[data-fusion-detail-tab="skills"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('.fusion-preview .silhouette').count(),1,'inspection does not commit a material');
    const skill=page.locator('#v39-fusion-modal [data-v39-character-skill]').first();
    if(await skill.count()){await skill.click();assert.equal(await skill.getAttribute('aria-expanded'),'true');}
    assert.equal(await page.locator('#v39-fusion-modal [data-v39-attack-name]').count(),0,'read-only skills cannot attack');
    await selectFusionMaterial(page,0,'fusion-test-horse');await selectFusionMaterial(page,1,'fusion-test-devil');
    await page.locator('[data-fusion-source="result"]').click();
    assert.equal(await page.locator('[data-fusion-detail-tab="skills"]').getAttribute('aria-selected'),'true');
    for(const [tab,selector] of [['equipment','.v39-char-equipment-list'],['growth','.v39-char-growth-list'],['status','.squad-detail-stats']]){
      await page.locator(`[data-fusion-detail-tab="${tab}"]`).click();
      assert(await page.locator(`#v39-fusion-modal ${selector}`).count());
    }
    const comparison=await page.evaluate(async()=>{
      const {renderV39UnitAbility}=await import('/src/v39/unit/v39-unit-detail.js');
      const {inspectV39MonsterFusion,getV39FusionRecipes}=await import('/src/lib/v39-monster-fusion.js');
      const state=window.getV39GameState(),recipe=getV39FusionRecipes(state).find(r=>r.合成結果==='バイコーン');
      const check=inspectV39MonsterFusion(state,{playerId:state.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,materialIds:['fusion-test-horse','fusion-test-devil'],mode:'skill'});
      const template=document.createElement('div');template.innerHTML=renderV39UnitAbility(check.preview);
      return template.querySelector('.squad-detail-stats').innerHTML===document.querySelector('#v39-fusion-modal .squad-detail-stats').innerHTML;
    });assert(comparison,'same shared ability renderer');
    await page.locator('[data-fusion-confirm]').click();assert(await page.locator('.fusion-confirm-warning').isVisible());
    await page.locator('[data-fusion-back]').click();assert(!await page.locator('[data-fusion-confirm]').isDisabled());
    const geometry=await page.evaluate(()=>{
      const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
      return {preview:rect('.fusion-preview'),panes:rect('.fusion-panes'),footer:rect('#v39-fusion-modal footer'),portrait:rect('.fusion-preview>.fusion-portrait'),section:rect('#v39-fusion-modal>section')};
    });
    assert(geometry.preview.b<=geometry.panes.y);assert(geometry.panes.h>100);assert(geometry.footer.b<=height+1);
    assert(Math.abs(geometry.portrait.w-geometry.portrait.h)<2,'square sprite frame');
    assert(geometry.section.w<=width+1);
    await page.screenshot({path:`output/web-game/fusion-layout/selected-${width}.png`});
    await page.selectOption('[data-fusion-recipe]',{label:'相柳（候補・テスト限定）'});
    assert.equal(await page.locator('[data-fusion-slot]').count(),10);
    await page.locator('[data-fusion-candidates]').evaluate(el=>{el.scrollTop=el.scrollHeight;el.__testRetained=true;});
    const scroll=await page.locator('[data-fusion-candidates]').evaluate(el=>el.scrollTop);
    await page.evaluate(()=>window.setV39GameState({lastMoveStop:null},{reason:'fusion-background-test'}));
    const retained=await page.locator('[data-fusion-candidates]').evaluate(el=>({same:el.__testRetained,scroll:el.scrollTop}));
    assert(retained.same);assert.equal(retained.scroll,scroll);
    await page.locator('[data-fusion-slot="9"]').click();
    await page.screenshot({path:`output/web-game/fusion-layout/many-${width}.png`});
    await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});});
    assert.equal(await page.locator('#v39-fusion-modal').count(),0);assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false);
    assert.deepEqual(errors,[]);console.log(`${width}: two-pane composition, shared cards/details, tab retention, read-only skills, confirmation/back, ten slots, scroll identity and turn cancellation passed`);
    await page.close();
  }
}finally{await browser.close();}
