import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const source=readFileSync(new URL('../frontend/src/lib/v39-construction-categories.js',import.meta.url),'utf8');
const {getV39ConstructionCategories:categories,V39_CONSTRUCTION_CATEGORIES:labels}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
assert.deepEqual(categories({'1マス収容人数':20}),['すべて','住居']);
assert.deepEqual(categories({'1マス収容人数':10,信仰Lv:1,魔法Lv:2}),['すべて','住居','魔法','信仰']);
assert.deepEqual(categories({row:{'1マス収容人数':0,軍事Lv:2,鍛冶Lv:1}}),['すべて','鍛冶','軍事']);
assert.deepEqual(categories({'1マス収容人数':-1,信仰Lv:0,経済Lv:''}),['すべて']);
const out='output/web-game/construction-categories';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 for(const [width,height] of [[320,900],[390,600],[1100,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  const fixture=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    // In-memory fixture only: no spreadsheet or generated JSON is edited.
    const church=window.getV39FacilityDefinitions().find(row=>row.name==='教会').row;
    church['1マス収容人数']=10;church.魔法Lv=1;
    const s=window.getV39GameState(),p=s.players.find(row=>row.id===s.activePlayerId),f=p.factionState,first=f.settlements[0];
    const base={...structuredClone(first),id:'category-base',settlementId:'category-base',name:'住居分類拠点',placed:true,x:7,y:6,
      scaleKey:'village',scaleLevel:1,type:'村',population:200,populationByRace:{只人:200},buildings:['墓地','倉庫','市場'],tileFacilityMap:{},constructionQueue:[],
      residentialTileKeys:['7,6','6,6'],territoryTileKeys:['7,6','6,6'],territoryTileModeMap:{'7,6':'settlement','6,6':'settlement'},
      territoryResidentialCenterMap:{'7,6':'7,6','6,6':'7,6'},territoryResidentialLevelMap:{'7,6':'village','6,6':'village'},
      cityLevels:{鍛冶Lv:10,魔法Lv:10,信仰Lv:10,軍事Lv:10,経済Lv:10},
      materialStockByType:Object.fromEntries(Object.keys(first.materialStockByType).map(key=>[key,10000]))};
    const map=window.__v39FieldRuntime.mapData;map.grid[6][6]='平地';if(map.specialMap?.[6])map.specialMap[6][6]='';
    window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...p,factionState:{...f,settlements:[first,base],selectedSettlementId:first.settlementId}}),
      territoryOwnerByTile:{...s.territoryOwnerByTile,'6,6':p.id,'7,6':p.id},
      territoryStateByTile:{...s.territoryStateByTile,'6,6':{settlementId:base.settlementId,hp:100,maxHp:100},'7,6':{settlementId:base.settlementId,hp:100,maxHp:100}},facilitiesByTile:{...s.facilitiesByTile,'6,6':[]}});
    window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:6,y:6}}));
    return {first:first.settlementId,rows:window.getV39FacilityDefinitions({includeSettlementScales:true}).map(row=>({name:row.name,row:row.row})),before:JSON.stringify(window.getV39GameState().players)};
  });
  await page.locator('[data-land-construction-open]').click();
  const selector=page.locator('[data-land-build-category]'),list=page.locator('[data-land-build-facility]');
  assert.deepEqual(await selector.locator('option').allTextContents(),labels);
  const universe=await list.evaluateAll(nodes=>nodes.map(node=>node.dataset.landBuildFacility));
  for(const name of ['都市','大都市','火の儀式場I','火の儀式場II','火の儀式場III','神殿','修道院']){
    assert.equal(universe.includes(name),false,`${name}: unmet prerequisites or later upgrade must stay hidden`);
  }
  for(const category of labels){
    await selector.selectOption(category);
    const expected=universe.filter(name=>categories(fixture.rows.find(row=>row.name===name)).includes(category));
    assert.deepEqual(await list.evaluateAll(nodes=>nodes.map(node=>node.dataset.landBuildFacility)),expected,category);
  }
  await selector.selectOption('信仰');await page.locator('[data-land-build-facility="教会"]').click();
  await selector.selectOption('住居');
  assert.equal(await page.locator('[data-land-build-facility="教会"]').getAttribute('aria-pressed'),'true','shared-category selection stays selected');
  assert.match(await page.locator('.v39-land-build-detail').innerText(),/1マス収容人数\s*10人/);
  assert.deepEqual(await list.evaluateAll(nodes=>nodes.map(node=>node.dataset.landBuildFacility)),['村','町','教会']);
  await page.screenshot({path:`${out}/housing-${width}.png`});
  assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState().players)),fixture.before,'filtering does not change game state');
  await page.locator('[data-land-build-facility="町"]').click();
  assert.equal(await page.locator('[data-land-construction-start]').isEnabled(),true,await page.locator('.v39-land-build-detail').innerText());
  assert.equal(await page.evaluate(()=>window.getV39LandConstructionPreview().settlementType),'町');
  await page.locator('[data-land-construction-start]').click();
  assert.match(await page.locator('#v39-build-summary').innerText(),/住居分類拠点/);
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().selectedSettlementId),fixture.first,'development entry must target tile owner without changing selection');
  await page.locator('#v39-development-start').click();
  assert.equal(await page.evaluate(()=>window.getV39SettlementDevelopmentSelection().settlementId),'category-base');
  await page.locator('[data-development-selection-action="cancel"]').click();
  assert.match(await page.locator('#v39-build-summary').innerText(),/住居分類拠点/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    const s=window.getV39GameState(),p=s.players.find(row=>row.id===s.activePlayerId);
    window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...row,factionState:{...row.factionState,
      settlements:row.factionState.settlements.map(base=>base.settlementId!=='category-base'?base:{...base,buildings:[],
        constructionQueue:[{facilityName:'墓地',remainingTurns:1,tileKey:'7,6'}]})}})});
    window.openV39LandConstruction({x:6,y:6});
  });
  await selector.selectOption('住居');
  assert.equal(await page.locator('[data-land-build-facility="町"]').count(),0,'missing prerequisite facilities hide next scale');
  assert.equal(await page.locator('[data-land-build-facility="教会"]').count(),0,'queued prerequisite does not unlock candidate');
  await page.evaluate(()=>{
    const s=window.getV39GameState(),p=s.players.find(row=>row.id===s.activePlayerId);
    window.setV39GameState({players:s.players.map(row=>row.id!==p.id?row:{...row,factionState:{...row.factionState,
      settlements:row.factionState.settlements.map(base=>base.settlementId!=='category-base'?base:{...base,buildings:['墓地'],
        constructionQueue:[],cityLevels:{},materialStockByType:{}})}})});
  });
  const unlocked=page.locator('[data-land-build-facility="教会"]');
  assert.equal(await unlocked.count(),1,'completed prerequisite reveals candidate');
  assert.match(await unlocked.getAttribute('class'),/unavailable/,'unlocked but unaffordable candidate stays gray');
  await unlocked.click();assert.equal(await page.locator('[data-land-construction-start]').isDisabled(),true);
  await page.screenshot({path:`${out}/unlocked-gray-${width}.png`});
  await page.evaluate(async()=>{
    window.startV39CallTest();window.setV39RitualTestStage(1);await window.waitForV39MapRenderSettled();
    const f=window.getV39ActiveFactionState(),base=f.settlements.find(row=>row.placed),[key]=Object.entries(base.tileFacilityMap).find(([,names])=>names.includes('火の儀式場I'));
    const [x,y]=key.split(',').map(Number);window.activateV39FooterTab('tile');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));
  });
  await page.locator('[data-land-construction-open]').click();await selector.selectOption('鍛冶');
  assert.equal(await list.count(),0);assert.equal(await page.evaluate(()=>window.getV39LandConstructionPreview()),null);
  assert.equal(await page.locator('[data-land-construction-start]').isDisabled(),true);
  await selector.selectOption('魔法');assert.equal(await page.locator('[data-land-build-facility="火の儀式場II"]').count(),1);
  assert.equal(await page.locator('[data-land-build-facility="火の儀式場III"]').count(),0,'only direct upgrade is revealed');
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: data-driven categories, multi-membership, housing scales, retained selection, correct development context and empty-category cleanup passed`);
  await page.close();
 }
}finally{await browser.close();}
