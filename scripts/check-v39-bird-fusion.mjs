import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {selectFusionMaterial,fusionCandidateIds} from './lib/v39-fusion-ui.mjs';
const out='output/web-game/bird-fusion';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    const report=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      const fusion=await import('/src/lib/v39-monster-fusion.js'),{getV39BossFusionCandidates}=await import('/src/lib/v39-boss-fusion-rules.js');
      const {V39_FUSION_MATERIAL_GROUPS}=await import('/src/lib/v39-fusion-material-types.js');
      const state=window.getV39GameState(),f=state.players.find(p=>p.id===state.activePlayerId).factionState,units=fusion.getV39FusionMaterials(f);
      const recipe=fusion.getV39FusionRecipes(state).find(r=>r.合成結果==='アウルベア');
      const pick=race=>units.find(u=>u.race===race&&!u.soulStored&&!u.equipment.length);
      const bear=pick('ベア'),hawk=pick('ホーク'),owl=pick('オウル'),wolf=pick('ウルフ');
      const request=bird=>({playerId:state.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,mode:'facility',materialIds:[bear.id,bird.id]});
      const before=JSON.stringify(state),hawkResult=fusion.executeV39MonsterFusion(state,request(hawk)),owlResult=fusion.executeV39MonsterFusion(state,request(owl));
      const check=result=>({ok:result.ok,reason:result.reason,levels:result.created?.fusionGrowth?.levelsByClass,name:result.created?.name});
      const names=new Set(window.getGameDataRows('クラス').map(r=>r.名前)),boss=getV39BossFusionCandidates('ベア','ベア',[recipe],names,V39_FUSION_MATERIAL_GROUPS);
      const {openV39FusionModal}=await import('/src/v39/unit/v39-fusion-modal.js');openV39FusionModal('expedition-test-king','facility');
      return {recipeId:recipe.id,material:recipe.素材,bear:bear.id,hawk:hawk.id,owl:owl.id,wolf:wolf.id,hawkResult:check(hawkResult),owlResult:check(owlResult),denied:!fusion.executeV39MonsterFusion(state,request(wolf)).ok,immutable:before===JSON.stringify(state),boss:boss.map(b=>b.className)};
    });
    assert.equal(report.material,'ベア_1,鳥系_1');assert(report.hawkResult.ok,report.hawkResult.reason);assert(report.owlResult.ok,report.owlResult.reason);
    assert(report.hawkResult.levels.ホーク>=1);assert(report.owlResult.levels.オウル>=1);assert(!('鳥系' in report.hawkResult.levels));assert(report.denied&&report.immutable);assert.deepEqual(report.boss.sort(),['オウル','ホーク']);
    await page.selectOption('[data-fusion-recipe]',report.recipeId);
    await selectFusionMaterial(page,0,report.bear);
    const ids=await fusionCandidateIds(page,1);assert(ids.includes(report.hawk)&&ids.includes(report.owl));assert(!ids.includes(report.wolf));
    await page.screenshot({path:`${out}/birds-${width}.png`});
    await selectFusionMaterial(page,1,report.hawk);
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    await page.waitForSelector('[data-fusion-next]');
    const result=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),unit=f.units.find(u=>u.fusionGrowth?.recipeName==='アウルベア');
      const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);
      return {name:unit.name,levels:unit.fusionGrowth.levelsByClass,loaded:window.getV39ActiveFactionState().units.find(u=>u.id===unit.id)?.fusionGrowth.levelsByClass};
    });
    assert.equal(result.name,'アウルベア');assert.deepEqual(result.loaded,result.levels);assert.deepEqual(errors,[]);
    console.log(`${width}: bird picker, hawk/owl execution, inheritance, non-bird rejection, boss mapping and save passed`);await page.close();
  }
}finally{await browser.close();}
