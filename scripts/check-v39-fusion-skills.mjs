import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';

const out='output/web-game/fusion-skills';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:width===320?568:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      window.startV39FusionTest();await window.waitForV39MapRenderSettled();
    });
    const validation=await page.evaluate(async()=>{
      const fusion=await import('/src/lib/v39-monster-fusion.js');
      const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
      const {grantV39UnitExperience:grow}=await import('/src/lib/v39-unit-experience.js');
      const {resolveActionSkillRows:actions,computeAttackDamage:damage}=await import('/src/lib/v39-combat-engine.js');
      const {validateGameDataRegistry}=await import('/src/lib/game-data-registry.js');
      const state=window.getV39GameState(),original=JSON.stringify(state);
      const recipe=fusion.getV39FusionRecipes(state).find(r=>r.合成結果==='バイコーン');
      const request={playerId:state.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,
        materialIds:['fusion-test-horse','fusion-test-devil'],mode:'facility'};
      const check=fusion.inspectV39MonsterFusion(state,request),made=fusion.executeV39MonsterFusion(state,request);
      const pending=made.created?.techniques.find(r=>r.name==='呪角');
      const officialRow=window.getGameDataRows('モンスター合成').find(r=>r.合成結果==='バイコーン'),backup={...officialRow};
      let duplicates,empty,inheritance;
      try {
        officialRow.獲得スキル='精度、精度\n強打,強打';
        const duplicateMade=fusion.executeV39MonsterFusion(state,request).created;
        const noReward=derive({...duplicateMade,fusionGrowth:{...duplicateMade.fusionGrowth,acquiredSkillNames:[]}});
        const repeat=derive(duplicateMade);
        duplicates={names:duplicateMade.fusionGrowth.acquiredSkillNames,delta:duplicateMade.status.命中-noReward.status.命中,
          repeated:repeat.status.命中===duplicateMade.status.命中,count:repeat.techniques.filter(r=>r.name==='精度').length};
        const source=structuredClone(state),f=source.players.find(p=>p.id===state.activePlayerId).factionState;
        f.units=f.units.map(u=>u.id==='fusion-test-horse'?derive({...u,fusionGrowth:{
          levelsByClass:{ホース:u.level},acquiredSkillNames:['精度','精度']}}):u);
        officialRow.獲得スキル='強打';
        const next=fusion.executeV39MonsterFusion(source,request);
        inheritance=next.ok&&next.created.fusionGrowth.acquiredSkillNames.includes('精度');
        officialRow.獲得スキル='なし,0,-';
        const without=fusion.executeV39MonsterFusion(state,request);
        empty=without.ok&&without.created.fusionGrowth.acquiredSkillNames.length===0;
      } finally {Object.assign(officialRow,backup);}
      const testRecipe=fusion.getV39FusionRecipes(state).find(r=>r.状態==='テスト専用');
      const activeUnit=fusion.executeV39MonsterFusion(state,{...request,recipeId:testRecipe.id}).created;
      const inherent=derive({race:'只人',className:'アーチャー',level:10});
      const overlap=derive({...inherent,fusionGrowth:{levelsByClass:{只人:0,アーチャー:10},acquiredSkillNames:['精度']}});
      const skill=actions(activeUnit).find(r=>r.名前==='強打');
      const hit=damage({attacker:activeUnit,target:{id:'target',level:1,status:{防御:0,速度:0},resistances:{}},skillRow:skill,random:()=>0});
      const grown=grow(activeUnit,1000000).unit;
      const legacy=structuredClone(activeUnit);delete legacy.fusionGrowth.acquiredSkillNames;
      return {available:check.available,warnings:check.warnings,pending:!!pending&&!pending.source&&/効果はありません/.test(pending.detail),
        pendingNotAction:!actions(made.created).some(r=>r.名前==='呪角'),duplicates,empty,inheritance,
        classDedup:overlap.status.命中===inherent.status.命中&&overlap.techniques.filter(r=>r.name==='精度').length===1,
        active:!!skill,hit,grown:grown.level>activeUnit.level&&grown.acquiredSkillNames.includes('精度')&&actions(grown).some(r=>r.名前==='強打'),
        legacy:derive(legacy).derivedCharacter.ok,immutable:original===JSON.stringify(state),
        audited:validateGameDataRegistry().issues.some(r=>r.table==='モンスター合成'&&r.value==='呪角')};
    });
    for(const key of ['available','pending','pendingNotAction','empty','inheritance','classDedup','active','grown','legacy','immutable','audited'])assert(validation[key],key);
    assert(validation.warnings.some(s=>s.includes('呪角')));
    assert.deepEqual(validation.duplicates.names,['精度','強打']);assert.equal(validation.duplicates.delta,10);
    assert(validation.duplicates.repeated);assert.equal(validation.duplicates.count,1);
    assert(validation.hit.total>0,JSON.stringify(validation.hit));

    await page.locator('[data-v39-fusion-open]').first().click();
    await page.selectOption('[data-fusion-recipe]',{label:'テスト・バイコーン（テスト専用）'});
    await selectFusionMaterial(page,0,'fusion-test-horse');await selectFusionMaterial(page,1,'fusion-test-devil');
    await page.locator('[data-fusion-source="result"]').click();
    assert.match(await page.locator('[data-fusion-acquired-skills]').innerText(),/強打、精度/);
    await page.locator('[data-fusion-detail-tab="skills"]').click();
    assert.equal(await page.locator('[data-v39-character-skill="強打"]').count(),1);
    assert.equal(await page.locator('[data-v39-character-skill="精度"]').count(),1);
    await page.screenshot({path:`${out}/preview-${width}.png`});
    const bounds=await page.locator('[data-fusion-confirm]').boundingBox();assert(bounds.y+bounds.height<=(width===320?568:844));
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    const saved=await page.evaluate(()=>{
      const unit=window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth?.recipeName==='テスト・バイコーン');
      const before={names:unit.fusionGrowth.acquiredSkillNames,hit:unit.status.命中,skills:unit.acquiredSkillNames};
      window.importV39SaveJson(window.exportV39SaveJson());
      const restored=window.getV39ActiveFactionState().units.find(u=>u.id===unit.id);
      return {before,after:{names:restored.fusionGrowth.acquiredSkillNames,hit:restored.status.命中,skills:restored.acquiredSkillNames}};
    });
    assert.deepEqual(saved.before,saved.after);
    await page.keyboard.press('Escape');
    const native=await page.evaluate(async()=>{
      const {resolveActionSkillRows}=await import('/src/lib/v39-combat-engine.js');
      const state=window.getV39GameState(),f=window.getV39ActiveFactionState();
      const actor={...f.units.find(u=>u.fusionGrowth?.recipeName==='テスト・バイコーン'),x:8,y:10,position:[8,10],ap:100,currentAp:100};
      const map=window.__v39FieldRuntime.mapData;
      for(const x of [8,9]){map.grid[10][x]='平原';map.heightLevelMap[10][x]=0;}
      const target={id:'fusion-skill-target',name:'合体技の確認相手',x:9,y:10,worldId:'surface',level:1,
        hp:5000,currentHp:5000,maxHp:5000,status:{防御:0,速度:1},techniques:[]};
      window.setV39GameState({players:state.players.map(p=>p.id===state.activePlayerId?{...p,factionState:{...f,
        units:f.units.map(u=>u.id===actor.id?actor:u),selectedUnitId:actor.id,combatRuntime:{}}}:p),enemies:[target],neutralVillages:[]});
      window.__v39SuppressCombatEffects=true;
      const skill=resolveActionSkillRows(actor).find(r=>r.名前==='強打'),random=Math.random;
      let cast;
      try {Math.random=()=>0;cast=window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:actor.id,target:{x:9,y:10},skillRow:skill});}
      finally {Math.random=random;}
      const after=window.getV39GameState(),af=window.getV39ActiveFactionState();
      return {cast,hp:after.enemies.find(u=>u.id===target.id)?.hp,ap:af.units.find(u=>u.id===actor.id)?.ap};
    });
    assert(native.cast);assert(native.hp<5000);assert(native.ap<100);assert.deepEqual(errors,[]);
    writeFileSync(`${out}/report-${width}.json`,JSON.stringify({validation,saved,native},null,2));
    console.log(`${width}: direct active/passive rewards, damage, dedup, inheritance, unresolved warning, growth, legacy/save and native UI passed`);
    await page.close();
  }
} finally {await browser.close();}
