import assert from 'node:assert/strict';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:width===320?568:844}}),errors=[];
    page.on('pageerror',e=>errors.push(e.stack));
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();window.activateV39FooterTab('test');});
    await page.evaluate(()=>window.waitForV39MapRenderSettled?.());
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.locator('[data-test-action="fusion-test-start"]').click();
    const before=await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>({id:u.id,ap:u.ap})));
    const open=async()=>{await page.locator('[data-v39-fusion-open]').first().click();};
    const select=async()=>{
      await page.selectOption('[data-fusion-recipe]',{label:'テスト・バイコーン（テスト専用）'});
      await selectFusionMaterial(page,0,'fusion-test-horse');
      await selectFusionMaterial(page,1,'fusion-test-devil');
    };
    await open();
    assert.match(await page.locator('#v39-fusion-modal').innerText(),/未登録のため付与しません: 幻獣/);
    assert(await page.locator('[data-fusion-confirm]').isDisabled());
    await selectFusionMaterial(page,0,'fusion-test-horse');
    await selectFusionMaterial(page,1,'fusion-test-devil');
    assert(!await page.locator('[data-fusion-confirm]').isDisabled(),'official recipe is usable without creating missing bonus classes');
    await page.screenshot({path:`output/web-game/fusion/official-${width}.png`});
    await select();assert(!await page.locator('[data-fusion-confirm]').isDisabled());
    await page.screenshot({path:`output/web-game/fusion/preview-${width}.png`});
    const bounds=await page.locator('#v39-fusion-modal>section').boundingBox();
    const button=await page.locator('[data-fusion-confirm]').boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=width+1);
    assert(button.y+button.height<= (width===320?568:844),'fixed confirmation footer fits viewport');
    const portraits=await page.locator('.fusion-preview>.fusion-portrait').evaluateAll(rows=>rows.map(r=>({image:r.style.backgroundImage,size:r.style.backgroundSize})));
    assert(portraits[0].image.includes('%E7%8B%BC')||portraits[0].image.includes('狼'),'horse sheet artwork');
    assert(portraits.every(p=>p.image&&p.size==='400% 300%'),'portraits are individual 4x3 frames');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#v39-fusion-modal').count(),0);
    assert.deepEqual(await page.evaluate(()=>window.getV39ActiveFactionState().units.map(u=>({id:u.id,ap:u.ap}))),before);
    assert.equal(await page.evaluate(()=>window.isV39MapInputLocked()),false);
    const validations=await page.evaluate(async()=>{
      const rules=await import('/src/lib/v39-monster-fusion.js'),exp=await import('/src/lib/v39-unit-experience.js');
      const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId),f=player.factionState;
      const recipe=rules.getV39FusionRecipes(state).find(r=>r.状態==='テスト専用');
      const request={playerId:player.id,actorId:'expedition-test-king',recipeId:recipe.id,materialIds:['fusion-test-horse','fusion-test-devil'],mode:'skill'};
      const original=JSON.stringify(state),good=rules.inspectV39MonsterFusion(state,request);
      const rejected=modify=>{const clone=structuredClone(state);modify(clone,clone.players.find(p=>p.id===player.id).factionState);return !rules.executeV39MonsterFusion(clone,request).ok;};
      const flags={immutable:original===JSON.stringify(state),good:good.available,
        duplicate:!rules.executeV39MonsterFusion(state,{...request,materialIds:['fusion-test-horse','fusion-test-horse']}).ok,
        world:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').worldId='elsewhere'),
        distant:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').x=20),
        dead:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').hp=0),
        named:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').isNamed=true),
        equipment:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').equipment=[{name:'剣'}]),
        cargo:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').cargo={resourcesByType:{木材:3}}),
        duty:rejected((s,f)=>f.units.find(u=>u.id==='fusion-test-horse').tradeAssignment={automatic:true}),
        teacher:rejected((s,f)=>f.recruitInstructorByTile={'4,4':{unitId:'fusion-test-horse'}}),
        ap:rejected((s,f)=>{const u=f.units.find(u=>u.id===request.actorId);u.ap=0;u.currentAp=0;}),
        turn:rejected(s=>s.timeline.phase='enemy'),
        ownership:rejected((s,f)=>f.units=f.units.filter(u=>u.id!=='fusion-test-devil')),
        source:original===JSON.stringify(state)};
      const actor=f.units.find(u=>u.id===request.actorId),horse=f.units.find(u=>u.id==='fusion-test-horse');
      const wide=structuredClone(state),wideFaction=wide.players.find(p=>p.id===player.id).factionState;
      const remote=wideFaction.units.find(u=>u.id===horse.id);remote.x=20;remote.y=20;
      wide.territoryOwnerByTile['20,20']=player.id;
      flags.territoryWide=rules.inspectV39FusionMaterial(wide,player.id,actor,remote).length===0;
      const remoteMade=rules.executeV39MonsterFusion(wide,request);
      flags.territoryExecute=remoteMade.ok&&remoteMade.created.x===20&&remoteMade.created.y===20;
      flags.territoryOff=rules.inspectV39FusionMaterial(wide,player.id,actor,remote,{territoryWideMaterials:false}).length>0;
      const nearbyOutside=structuredClone(horse);
      const nearState=structuredClone(state);delete nearState.territoryOwnerByTile[`${horse.x},${horse.y}`];
      flags.nearbyOutside=rules.inspectV39FusionMaterial(nearState,player.id,actor,nearbyOutside).length>0;
      wide.territoryOwnerByTile['20,20']='foreign';
      flags.foreignTerritory=rules.inspectV39FusionMaterial(wide,player.id,actor,remote).length>0;
      delete wide.territoryOwnerByTile[`${actor.x},${actor.y}`];
      flags.outsideActorUsesRadius=rules.inspectV39FusionMaterial(wide,player.id,actor,remote).length>0;
      const made=rules.executeV39MonsterFusion(state,request),growthAmount=made.created.fusionGrowth.baseNeed*2;
      const grown=exp.grantV39UnitExperience(made.created,growthAmount);
      const officialRecipe=rules.getV39FusionRecipes(state).find(r=>r.合成結果==='バイコーン');
      const official=rules.executeV39MonsterFusion(state,{...request,recipeId:officialRecipe.id});
      flags.missingBonusSkipped=official.ok&&official.created.name==='バイコーン'&&!('幻獣' in official.created.fusionGrowth.levelsByClass)&&official.created.fusionGrowth.skippedClasses.includes('幻獣');
      flags.bonusBudget=official.ok&&JSON.stringify(official.created.fusionGrowth.levelsByClass)===JSON.stringify(made.created.fusionGrowth.levelsByClass);
      flags.growth=grown.toLevel>made.created.level&&Object.values(grown.unit.fusionGrowth.levelsByClass).reduce((s,v)=>s+v,0)===grown.toLevel;
      flags.noLostFractions=grown.unit.fusionGrowth.classExp['エヴォリューション・ホーン']>=0;
      flags.baseFractionUsed=Math.abs(grown.unit.fusionGrowth.baseExp-(made.created.fusionGrowth.baseExp+growthAmount/2-made.created.fusionGrowth.baseNeed))<1e-8;
      flags.baseThreshold=grown.unit.fusionGrowth.baseNeed===exp.resolveV39UnitExpNeed(made.created.fusionGrowth.baseLevel+1,exp.resolveV39UnitRaceCategory(made.created));
      flags.materialReuse=!rules.executeV39MonsterFusion(made.state,request).ok;
      const facility=rules.executeV39MonsterFusion(state,{...request,mode:'facility'});
      flags.facility=facility.ok&&facility.state.players.find(p=>p.id===player.id).factionState.units.find(u=>u.id===request.actorId).ap===100;
      const noFacility=structuredClone(state);delete noFacility.territoryOwnerByTile['4,4'];delete noFacility.territoryOwnerByTile['3,4'];
      flags.noFacility=!rules.executeV39MonsterFusion(noFacility,{...request,mode:'facility'}).ok;
      const normal=f.units.find(u=>u.id==='expedition-test-king'),normalGrow=exp.grantV39UnitExperience(normal,100);
      flags.normal=normalGrow.amount===100&&!normalGrow.unit.fusionGrowth;
      const fractional=structuredClone(state),ff=fractional.players.find(p=>p.id===player.id).factionState;
      const {applyV39DerivedCharacterData}=await import('/src/v39/unit/v39-character-derived-rules.js');
      ff.units=ff.units.map(u=>u.id==='fusion-test-horse'?applyV39DerivedCharacterData({...u,level:6}):u);
      const fractionalMade=rules.executeV39MonsterFusion(fractional,request);
      flags.fractional=fractionalMade.ok&&fractionalMade.created.level===7&&Math.abs(fractionalMade.created.fusionGrowth.baseExp-fractionalMade.created.fusionGrowth.baseNeed*.2)<1e-8;
      const fractionalGrown=exp.grantV39UnitExperience(fractionalMade.created,fractionalMade.created.fusionGrowth.baseNeed*2);
      flags.fractionalUsed=fractionalGrown.toLevel>7&&Math.abs(fractionalGrown.unit.fusionGrowth.baseExp-fractionalMade.created.fusionGrowth.baseExp)<1e-8;
      return {flags,levels:good.growth.levelsByClass,baseExp:good.growth.baseProgress.exp};
    });
    for(const [name,ok] of Object.entries(validations.flags))assert.equal(ok,true,name);
    assert.deepEqual(validations.levels,{ホース:3,デヴィル:3,'エヴォリューション・ホーン':1});
    assert.equal(validations.baseExp,0);
    await open();await select();await page.locator('[data-fusion-confirm]').click();
    await page.locator('[data-fusion-back]').click();assert.equal((await page.evaluate(()=>window.getV39ActiveFactionState().units.length)),before.length);
    await page.locator('[data-fusion-confirm]').click();
    await page.locator('[data-fusion-commit]').evaluate(button=>{button.click();button.click();});
    const result=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState();return {units:f.units.map(u=>({id:u.id,ap:u.ap,growth:u.fusionGrowth,level:u.level})),squads:f.squads};
    });
    assert.equal(result.units.length,before.length-1);assert.equal(result.units.filter(u=>u.growth).length,1);
    assert.equal(result.units.find(u=>u.id==='expedition-test-king').ap,80);
    assert(!result.squads.some(s=>s.unitIds.some(id=>['fusion-test-horse','fusion-test-devil'].includes(id))));
    await page.waitForFunction(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==='Image'&&child.texture.key.includes('狼馬ユニット集')&&String(child.frame.name).endsWith('-9')),result.units.find(u=>u.growth).id);
    await page.locator('[data-fusion-done]').click();
    if(await page.locator('#v39-fusion-modal').count())await page.locator('[data-fusion-done]').click();
    const saved=await page.evaluate(async()=>{
      const f=window.getV39ActiveFactionState(),u=f.units.find(u=>u.fusionGrowth),before=JSON.stringify(u.fusionGrowth);
      const copy=window.getV39GameState();copy.players.find(p=>p.id===copy.activePlayerId).factionState.units.find(u=>u.fusionGrowth).fusionGrowth.levelsByClass.ホース=999;
      const isolated=window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth).fusionGrowth.levelsByClass.ホース!==999;
      window.importV39SaveJson(window.exportV39SaveJson());const next=window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth);
      const {grantV39UnitExperience}=await import('/src/lib/v39-unit-experience.js');
      const grown=grantV39UnitExperience(next,1000).unit;
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(u=>u.id===grown.id?grown:u)});
      window.importV39SaveJson(window.exportV39SaveJson());
      const loaded=window.getV39ActiveFactionState().units.find(u=>u.id===grown.id);
      return {same:before===JSON.stringify(next.fusionGrowth),isolated,levels:next.derivedCharacter,level:next.level,
        growthSaved:JSON.stringify(loaded.fusionGrowth)===JSON.stringify(grown.fusionGrowth)&&loaded.level===grown.level&&loaded.derivedCharacter.classLevels===grown.derivedCharacter.classLevels};
    });
    assert(saved.same&&saved.isolated&&saved.growthSaved);assert.equal(saved.levels.raceLevels,3);assert.equal(saved.levels.classLevels,1);assert.equal(saved.level,7);
    await page.screenshot({path:`output/web-game/fusion/field-${width}.png`});
    if(width===390){
      await page.evaluate(()=>window.startV39FusionTest());await open();await select();
      await page.selectOption('[data-fusion-recipe]',{label:'バイコーン'});
      await selectFusionMaterial(page,0,'fusion-test-horse');
      await selectFusionMaterial(page,1,'fusion-test-devil');
      await page.selectOption('select[data-fusion-mode]','facility');assert(!await page.locator('[data-fusion-confirm]').isDisabled());
      await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
      const ap=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.id==='expedition-test-king').ap);
      assert.equal(ap,100,'real facility UI does not charge skill AP');
      assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth).name),'バイコーン');
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors,[]);console.log(`${width}: preview, rejection guards, cancellation, double click, atomic fusion, class EXP, facility, save/load passed`);
    await page.close();
  }
}finally{await browser.close();}
