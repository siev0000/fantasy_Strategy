import assert from 'node:assert/strict';
import {selectFusionMaterial,fusionCandidateIds} from './lib/v39-fusion-ui.mjs';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion-materials',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39FusionTest);
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    window.startV39ExpeditionTest();
    const baseline=window.getV39GameState(),baselineTerritory=Object.values(baseline.territoryOwnerByTile).filter(id=>id===baseline.activePlayerId).length;
    await window.waitForV39MapRenderSettled?.();
    const fixture=window.startV39FusionTest(),state=window.getV39GameState(),faction=window.getV39ActiveFactionState();
    const rules=await import('/src/lib/v39-monster-fusion.js');
    const {collectV39FusionClassLevels}=await import('/src/lib/v39-monster-fusion-growth.js');
    const units=rules.getV39FusionMaterials(faction).filter(u=>u.fusionTestMaterial),recipes=rules.getV39FusionRecipes(state);
    const stored=faction.facilityStorage;
    const storedValid=stored.length===fixture.storedMaterialCount&&stored.every(entry=>entry.facilityName==='魔獣研究所'&&!faction.units.some(u=>u.id===entry.unit.id)&&faction.squads.every(s=>!s.unitIds.includes(entry.unit.id)));
    const storageIdentity=rows=>JSON.stringify(rows.map(e=>({tileKey:e.tileKey,facilityName:e.facilityName,worldId:e.worldId,id:e.unit.id,race:e.unit.race,className:e.unit.className,level:e.unit.level,hp:e.unit.hp,equipment:e.unit.equipment})));
    const beforeStored=storageIdentity(stored);
    const checks=recipes.filter(r=>r.requirements.every(req=>units.some(u=>collectV39FusionClassLevels(u)?.[req.name]>0))).map(recipe=>{
      const selected=[];
      for(const req of recipe.requirements)for(let i=0;i<req.count;i++){
        const unit=units.find(u=>!selected.includes(u.id)&&collectV39FusionClassLevels(u)?.[req.name]>0);if(unit)selected.push(unit.id);
      }
      const check=rules.inspectV39MonsterFusion(state,{playerId:state.activePlayerId,actorId:'expedition-test-king',recipeId:recipe.id,materialIds:selected,mode:'facility'});
      return {name:recipe.合成結果,available:check.available,reasons:check.reasons,selected:selected.length};
    });
    const normal=structuredClone(state);normal.players=normal.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,fusionTestFixture:false}))}}));
    const base=faction.settlements.find(s=>s.settlementId===faction.selectedSettlementId),territory=new Set(base.territoryTileKeys);
    if(!base.buildings.includes('魔獣研究所')||!base.tileFacilityMap['3,3'].includes('魔獣研究所'))throw new Error('research facility projections missing');
    const allInTerritory=units.every(u=>state.territoryOwnerByTile[`${u.x},${u.y}`]===state.activePlayerId&&territory.has(`${u.x},${u.y}`)&&state.territoryStateByTile[`${u.x},${u.y}`]?.settlementId===base.settlementId);
    const foreignPreserved=Object.entries(baseline.territoryOwnerByTile).filter(([,owner])=>owner!==baseline.activePlayerId).every(([key,owner])=>state.territoryOwnerByTile[key]===owner);
    window.importV39SaveJson(window.exportV39SaveJson());
    const restored=window.getV39GameState();
    const storageSaved=storageIdentity(restored.players.find(p=>p.id===state.activePlayerId).factionState.facilityStorage)===beforeStored;
    const territorySaved=base.territoryTileKeys.every(key=>restored.territoryOwnerByTile[key]===state.activePlayerId&&restored.territoryStateByTile[key]?.settlementId===base.settlementId);
    return {fixture,storedValid,storageSaved,baselineTerritory,allInTerritory,foreignPreserved,territorySaved,unitCount:units.length,speciesCount:new Set(units.map(u=>u.race)).size,
      positionsUnique:new Set(faction.units.filter(u=>(u.worldId||'surface')==='surface').map(u=>`${u.x},${u.y}`)).size===faction.units.filter(u=>(u.worldId||'surface')==='surface').length,
      idsUnique:new Set(faction.units.map(u=>u.id)).size===faction.units.length,
      allEligible:units.every(u=>rules.inspectV39FusionMaterial(state,state.activePlayerId,faction.units.find(u=>u.fusionTestFixture),u).length===0),
      copies:Object.fromEntries(['ウルフ','スネーク','ホーク','ホース','デヴィル','エンジェル'].map(race=>[race,units.filter(u=>(u.fusionTestRequirementName||u.race)===race).length])),
      recipeCount:recipes.length,normalRecipes:rules.getV39FusionRecipes(normal).map(r=>r.状態),checks};
  });
  assert(result.fixture.ok);assert(result.unitCount>=60);assert(result.speciesCount>=25);
  assert(result.storedValid&&result.storageSaved,JSON.stringify({valid:result.storedValid,saved:result.storageSaved}));assert.equal(result.fixture.storedMaterialCount,result.unitCount-2);assert.equal(result.fixture.fieldMaterialCount,2);
  assert.equal(result.baselineTerritory,7,'shared expedition fixture keeps original initial territory');
  assert(result.fixture.territoryCount>80&&result.allInTerritory&&result.foreignPreserved&&result.territorySaved);
  assert(result.positionsUnique&&result.idsUnique&&result.allEligible);
  assert.equal(result.copies.ウルフ,3);assert.equal(result.copies.スネーク,9);assert.equal(result.copies.ホーク,9);
  assert(result.recipeCount>30);assert(result.normalRecipes.every(s=>s==='確定'));
  for(const check of result.checks)assert(check.available,`${check.name}: ${check.reasons.join(' / ')}`);
  await page.evaluate(()=>window.waitForV39MapRenderSettled?.());
  await page.screenshot({path:'output/web-game/fusion-materials/territory-390.png'});
  await page.locator('[data-v39-fusion-open]').first().click();
  await page.selectOption('[data-fusion-recipe]',{label:'バイコーン'});
  await selectFusionMaterial(page,0,'fusion-material-ホース-2');
  await selectFusionMaterial(page,1,'fusion-material-デヴィル-2');
  assert(!await page.locator('[data-fusion-confirm]').isDisabled(),'stored-only fusion has a deployment tile');
  await page.screenshot({path:'output/web-game/fusion-materials/stored-preview-390.png'});
  await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
  const storedAfter=await page.evaluate(()=>{const f=window.getV39ActiveFactionState();return {stored:f.facilityStorage.length,result:f.units.filter(u=>u.fusionGrowth?.recipeName==='バイコーン').length};});
  assert.equal(storedAfter.stored,result.fixture.storedMaterialCount-2);assert.equal(storedAfter.result,1);
  await page.locator('[data-fusion-done]').click();
  if(await page.locator('[data-fusion-done]').count())await page.locator('[data-fusion-done]').click();
  await page.evaluate(async()=>{window.startV39FusionTest();await window.waitForV39MapRenderSettled();});
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().facilityStorage.length),result.fixture.storedMaterialCount,'restart replaces stored samples');
  await page.locator('[data-v39-fusion-open]').first().click();
  await page.selectOption('[data-fusion-recipe]',{label:'ケルベロス（候補・テスト限定）'});
  const candidates=await fusionCandidateIds(page,0);
  assert(candidates.length>=3,'ordinary and attribute wolves can both satisfy the wolf ingredient');
  for(let i=0;i<3;i++)await selectFusionMaterial(page,i,candidates[i]);
  await selectFusionMaterial(page,3,'fusion-test-devil');
  assert(!await page.locator('[data-fusion-confirm]').isDisabled());
  await page.screenshot({path:'output/web-game/fusion-materials/cerberus-390.png'});
  await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
  const after=await page.evaluate(async()=>{const {getV39FusionMaterials}=await import('/src/lib/v39-monster-fusion.js');return getV39FusionMaterials(window.getV39ActiveFactionState());});
  assert.equal(after.filter(u=>u.fusionGrowth?.recipeName==='ケルベロス').length,1);
  assert.equal(after.filter(u=>u.fusionTestMaterial).length,result.unitCount-4);
  assert.deepEqual(errors,[]);console.log(JSON.stringify(result,null,2));
}finally{await browser.close();}
