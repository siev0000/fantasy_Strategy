import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

mkdirSync('output/web-game/skill-fields',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    const result=await page.evaluate(async()=>{
      const {SKILL_LEVEL_FIELDS,TIMED_EFFECT_FIELDS,STATUS_GROWTH_FIELDS}=await import('/src/constants/unitCommon.js');
      const {buildUnitSkillLevelsFromRules}=await import('/src/composables/unitStatusUtils.js');
      const {collectV39PassiveBonuses}=await import('/src/lib/v39-passive-rules.js');
      const {applyV39DerivedCharacterData}=await import('/src/v39/unit/v39-character-derived-rules.js');
      const {classData}=await import('/src/lib/game-data-registry.js');
      const {resolveV39UnitMovementStepCost}=await import('/src/lib/v39-terrain-traversal.js');
      const params={skillLevelFields:SKILL_LEVEL_FIELDS,statusGrowthDivisor:10,raceLevels:2,classLevels:3,raceLevelBaseOffset:5};
      const growth=buildUnitSkillLevelsFromRules({...params,raceRow:{変装:20,飛行:30},classRow:{変装:40,飛行:50}});
      const defaults=buildUnitSkillLevelsFromRules(params);
      const passive=collectV39PassiveBonuses([{名前:'試験補正',変装:7,飛行:9}]);
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
      // Modify only in-memory fixture data; spreadsheet-managed JSON is never written.
      const row=classData.find(row=>row.名前==='ファイター');row.変装=30;row.飛行=20;row.APP=40;
      const state=window.getV39GameState(),f=window.getV39ActiveFactionState(),id=f.units[0].id;
      const unit=applyV39DerivedCharacterData({...f.units[0],race:'只人',className:'ファイター',level:10,classGrowthStart:undefined,facilityGrowth:undefined});
      window.setV39GameState({players:state.players.map(p=>p.id===state.activePlayerId?{...p,factionState:{...f,units:f.units.map(u=>u.id===id?unit:u)}}:p)});
      window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();
      const map={w:2,h:1,grid:[['平原','平原']],heightLevelMap:[[0,2]]};
      const flight=resolveV39UnitMovementStepCost(map,0,0,1,0,unit);
      const ground=resolveV39UnitMovementStepCost(map,0,0,1,0,{...unit,skillLevels:{...unit.skillLevels,飛行:0}});
      const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);
      const restored=window.getV39ActiveFactionState().units.find(u=>u.id===id);
      const appPassive=collectV39PassiveBonuses([{名前:'APP補正',APP:7}]);
      return {fields:SKILL_LEVEL_FIELDS,timed:TIMED_EFFECT_FIELDS,growth,defaults,passive,unit:unit.skillLevels,restored:restored.skillLevels,flight:Number.isFinite(flight),ground:Number.isFinite(ground),app:unit.status.APP,savedApp:restored.status.APP,appPassive:appPassive.status.APP,appGrowth:STATUS_GROWTH_FIELDS.includes('APP')};
    });
    for(const key of ['変装','飛行']) {
      assert.equal(result.fields.filter(k=>k===key).length,1);assert(result.timed.includes(key));
      assert.equal(result.defaults[key],0);assert.equal(result.restored[key],result.unit[key]);
    }
    assert.equal(result.growth.変装,26);assert.equal(result.growth.飛行,36);
    assert.equal(result.passive.skillLevels.変装,7);assert.equal(result.passive.skillLevels.飛行,9);
    assert.deepEqual(result.passive.unsupported,[]);assert(result.flight&&!result.ground);
    assert(result.appGrowth);assert.equal(result.app,40);assert.equal(result.savedApp,40);assert.equal(result.appPassive,7);
    assert.match(await page.locator('#detailProficiencyList').innerText(),/変装/);
    assert.doesNotMatch(await page.locator('#detailProficiencyList').innerText(),/飛行/);
    assert.deepEqual(await page.locator('#detailAbilitySections .detail-stat > span').allTextContents(),['攻撃','防御','魔力','精神','命中','速度','SIZ','APP','移動','飛行']);
    assert.equal(await page.locator('#detailApp').innerText(),'40');assert.equal(await page.locator('#detailFlight').innerText(),'20');
    await page.locator('#detailFlight').scrollIntoViewIfNeeded();
    await page.screenshot({path:`output/web-game/skill-fields/field-${width}.png`});
    await page.evaluate(()=>window.openV39CharacterModal());
    assert.match(await page.locator('#characterModal').innerText(),/変装/);
    assert.match(await page.locator('#characterModal').innerText(),/飛行/);
    assert.deepEqual(await page.locator('#characterModal .detail-stat > span').allTextContents(),['攻撃','防御','魔力','精神','命中','速度','SIZ','APP','移動','飛行']);
    assert.deepEqual(errors,[]);
    console.log(`${width}: shared fields, growth/defaults, passives, flight traversal, save and both ability views passed`);
    await page.close();
  }
} finally {await browser.close();}
