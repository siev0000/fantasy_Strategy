import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch({headless:true}),errors=[];
const output='output/web-game/ritual-facilities';mkdirSync(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();
    const ritual=await import('/src/lib/v39-ritual-facilities.js');
    const summon=await import('/src/lib/v39-summon-rules.js');
    const {resolveV39ImmediateSoulAmount:souls}=await import('/src/lib/v39-soul-conversion.js');
    const {getGameDataRows}=await import('/src/lib/game-data-registry.js');
    const {hasV39FacilityPrerequisites:prerequisites}=await import('/src/lib/v39-facility-development-rules.js');
    const definitions=getGameDataRows('施設'),failures=[];
    const ok=(value,message)=>{if(!value)failures.push(message);};
    const sample=names=>({race:'デヴィル',factionState:{settlements:[{placed:true,buildings:names}]}});
    ok(definitions.every(row=>!('施設ID' in row)&&!('前提施設ID' in row)),'legacy facility IDs remain');
    ok(prerequisites({buildings:['汎用儀式場','墓地']},{前提施設:'汎用儀式場/墓地'}),'Japanese AND prerequisites failed');
    ok(!prerequisites({buildings:['汎用儀式場']},{前提施設:'汎用儀式場/墓地'}),'missing Japanese AND prerequisite accepted');
    ok(!prerequisites({buildings:[]},{前提施設:'存在しない施設'}),'unknown Japanese prerequisite accepted');
    ok(prerequisites({scaleLevel:3,buildings:[]},{前提施設:'町'}),'settlement scale prerequisite failed');
    ok(ritual.resolveV39RitualSummonEffects(sample([]),'フレイムエレメンタル').maximumLevel===10,'base limit');
    for(const [stage,expected] of [[1,10],[2,20],[3,25]]) {
      const player=sample([`火の儀式場${['','I','II','III'][stage]}`]);
      ok(ritual.resolveV39RitualSummonEffects(player,'フレイムエレメンタル').maximumLevel===expected,`fire stage ${stage}`);
      ok(ritual.resolveV39RitualSummonEffects(player,'アースエレメンタル').maximumLevel===10,'wrong family boost');
      ok(ritual.resolveV39RitualSummonEffects(player,'フレイムエレメンタル').bonusLevel===stage,'rank bonus without four-elements completion');
    }
    const four=sample(['火','水','風','土'].map(name=>`${name}の儀式場III`));
    ok(ritual.resolveV39RitualSummonEffects(four,'フレイムエレメンタル',null,{baseLevel:25}).bonusLevel===5,'four-element completion');
    ok(ritual.resolveV39RitualSummonEffects(four,'フロストエレメンタル',null,{baseLevel:25}).bonusLevel===5,'frost uses water family');
    for(const stage of [1,2,3])for(const level of [8,10,11,15,20,21,25,26]) {
      const owner=sample(['火','水','風','土'].map(name=>`${name}の儀式場${['','I','II','III'][stage]}`));
      const catalog={総Lv:level,クラス構成:'フレイムエレメンタル_1'};
      const expected=level<=[10,20,25][stage-1]?[1,3,5][stage-1]:0;
      const actual=ritual.resolveV39RitualSummonEffects(owner,'フレイムエレメンタル',catalog,{facilitySummon:true,baseLevel:99});
      ok(actual.completionBonus===expected&&actual.bonusLevel===expected,`completion stage ${stage} table Lv${level}`);
    }
    const mixed=sample(['火の儀式場III','水の儀式場II','風の儀式場III','土の儀式場II']);
    ok(ritual.resolveV39RitualSummonEffects(mixed,'フレイムエレメンタル',null,{baseLevel:20}).completionBonus===3,'upgrades must satisfy lower completion tiers');
    ok(ritual.resolveV39RitualSummonEffects(mixed,'フレイムエレメンタル',null,{baseLevel:25}).completionBonus===0,'incomplete III grants no completion bonus to Lv25');
    ok(ritual.resolveV39RitualSummonEffects(four,'スケルトン').bonusLevel===0,'element bonus leaked to undead');
    const devil=sample(['悪魔の祭壇','大悪魔の祭壇','地獄の祭壇']);
    ok(souls(devil,2)===3,'soul conversion strongest only');
    ok(souls(sample(['悪魔の祭壇']),1)===1.1,'fractional souls');
    ok(souls({...devil,race:'只人'},2)===0,'non-soul race converted');
    ok(souls(sample(['天界の祭壇']),2)===2,'opposite altar converted');
    ok(ritual.resolveV39RitualRaceEffects(devil,'デヴィル').reincarnationLevel===6,'altar reincarnation minimum');
    const row=definitions.find(r=>r.施設名==='火の儀式場III');
    ok(!prerequisites({buildings:['火の儀式場I']},row),'III without II');
    ok(prerequisites({buildings:['火の儀式場II']},row),'III prerequisite cannot pass');
    for(const row of definitions.filter(r=>r.召喚系統))ok(row.建築時間>0&&row.建築数===1&&row.木材>0&&row.石材>0&&row.前提施設,`bad construction: ${row.施設名}`);
    const economy=await import('/src/lib/v39-economy-rules.js');
    const {getSelectedSettlement,replaceFactionSettlement}=await import('/src/lib/settlement-state.js');
    const construction=structuredClone(window.getV39GameState()),builder=construction.players[0];
    const home=getSelectedSettlement(builder.factionState),tileKey=home.territoryTileKeys.find(key=>key!==`${home.x},${home.y}`),[x,y]=tileKey.split(',').map(Number);
    const base={...home,scaleKey:'metropolis',scaleLevel:4,buildings:['魔導塔'],tileFacilityMap:{},constructionQueue:[],
      cityLevels:{...home.cityLevels,魔法Lv:3,信仰Lv:3},territoryTileModeMap:{[tileKey]:'resource'},
      materialStockByType:Object.fromEntries(economy.MATERIAL_RESOURCE_KEYS.map(key=>[key,10000]))};
    builder.factionState=replaceFactionSettlement(builder.factionState,base,{ownerPlayerId:builder.id});
    const constructionTile={x,y};
    const first=economy.startV39Construction(construction,builder.id,'汎用儀式場',constructionTile,window.__v39FieldRuntime.mapData,{confirmResidentialReplacement:true});
    ok(first.ok,`normal construction rejected: ${first.reason}`);
    const bad=economy.startV39Construction(construction,builder.id,'火の儀式場III',constructionTile,window.__v39FieldRuntime.mapData);
    ok(!bad.ok&&bad.reason.includes('前提施設'),'normal construction bypassed prerequisites');
    if(first.ok){
      const owner=first.state.players.find(p=>p.id===builder.id);
      ok(!ritual.getV39CompletedRitualFacilities(owner).some(r=>r.施設名==='汎用儀式場'),'queued facility effect active');
      let built=getSelectedSettlement(owner.factionState);
      for(let t=0;t<first.definition.buildTurns;t++)built=economy.advanceConstruction(built).village;
      ok(built.buildings.includes('汎用儀式場'),'construction never completed');
      ok(Object.keys(first.definition.effects).length===0,'ritual numeric fields leaked into additive city stats');
    }
    const id=window.getV39GameState().activePlayerId,casterId='expedition-test-king';
    const inspect=name=>summon.inspectV39Summon(window.getV39GameState(),id,casterId,name,window.__v39FieldRuntime.mapData);
    const name='TEST_表召喚エレメンタル / アークフレイムソルジャー';
    window.setV39RitualTestStage(1);
    ok(inspect(name).available&&inspect(name).preview.level===26,'I incorrectly caps skill level or misses +1');
    window.setV39RitualTestStage(2);
    ok(inspect(name).available&&inspect(name).preview.level===27,'II incorrectly caps skill level or misses +2');
    window.setV39RitualTestStage(3);
    const check=inspect(name);
    ok(check.available,`III rejected target: ${check.reasons.join('/')}`);
    ok(check.preview?.level===30&&check.preview?.summonGrowth?.levelsByClass.フレイムエレメンタル===15,'generated levels not 25+5');
    ok(check.preview?.hp===check.preview?.maxHp,'preview HP does not match recomputed maximum');
    ok(check.preview?.derivedCharacter?.prerequisiteClassLevels?.アークフレイムエレメンタル===10,'lost class composition');
    const high=inspect('TEST_表召喚エレメンタル / グレーターフレイムエレメンタル');
    ok(!high.available&&high.reasons.some(s=>s.includes('召喚上限Lv25')),'normal cap allows Lv30 catalog');
    const state=window.getV39GameState(),made=summon.summonV39Units(state,id,casterId,name,window.__v39FieldRuntime.mapData);
    ok(made.ok,`summon failed: ${made.reason}`);
    if(made.ok){
      ok(made.created[0].level===30&&made.created[0].summon.baseLevel===25,'spawn differs from preview');
      const another=summon.inspectV39Summon(made.state,id,casterId,'TEST_表召喚エレメンタル / フレイムエレメンタル',window.__v39FieldRuntime.mapData);
      ok(!another.available&&another.reasons.some(s=>s.includes('CT')),'catalog candidates bypass source cooldown');
      window.setV39GameState(made.state,{reason:'ritual-test-created'});
      const restored=window.getV39GameState().players.find(p=>p.id===id).factionState.units.find(u=>u.id===made.created[0].id);
      ok(restored?.summonGrowth?.levelsByClass.フレイムエレメンタル===15&&restored?.level===30,'state bridge lost summon levels');
      window.importV39SaveJson(window.exportV39SaveJson(0));
      const saved=window.getV39GameState().players.find(p=>p.id===id).factionState.units.find(u=>u.id===made.created[0].id);
      ok(saved?.summonGrowth?.levelsByClass.フレイムエレメンタル===15&&saved?.level===30,'save/load lost summon levels');
    }
    return {failures,candidates:summon.getV39SummonEntries(window.getV39ActiveFactionState().units.find(u=>u.id===casterId)).length};
  });
  assert.deepEqual(result.failures,[]);
  for(const width of [390,1100]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>{
      window.closeV39SummonModal?.();window.updateV39ActiveFactionState({selectedUnitId:'expedition-test-king'});
      window.activateV39FooterTab('squad');window.refreshV39SquadDerivedUI();document.querySelector('[data-squad-detail-tab="action"]')?.click();
    });
    await page.locator('[data-v39-summon-open="expedition-test-king"]').click();
    await page.locator('[data-summon-option="TEST_表召喚エレメンタル / アークフレイムソルジャー"]').click();
    await page.screenshot({path:`${output}/catalog-${width}.png`});
    assert(await page.locator('#v39-summon-modal .summon-detail').innerText().then(text=>text.includes('施設5')));
    await page.keyboard.press('Escape');
  }
  const reincarnation=await page.evaluate(async()=>{
    await window.startV39SpecialVillageTest();window.closeV39VillageMenu();
    const rules=await import('/src/lib/v39-special-villages.js');
    window.setV39RitualTestStage(3);
    const state=window.getV39GameState(),player=state.players[0],village=state.neutralVillages[0];
    const source=rules.getV39OfferingPopulationSources(player)[0],actor=player.factionState.units[0];
    const request={settlementId:source.id,race:source.races[0].race,unitId:actor.id};
    const check=rules.inspectV39SpecialVillageReincarnation(state,player.id,village.id,request);
    const result=rules.reincarnateV39VillageNegotiator(state,player.id,village.id,request);
    return {available:check.available,reasons:check.reasons,targetLevel:check.targetLevel,
      ok:result.ok,level:result.unit?.derivedCharacter?.raceLevels};
  });
  assert.deepEqual(reincarnation,{available:true,reasons:[],targetLevel:6,ok:true,level:6});
  assert.deepEqual(errors,[]);
  console.log(`Ritual facilities OK: construction, 10/20/25 caps, families, +5 generation, composition, cooldown, state, 390/1100px; ${result.candidates} candidates.`);
} finally {await browser.close();}
