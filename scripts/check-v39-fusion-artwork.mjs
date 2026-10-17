import assert from 'node:assert/strict';
import {selectFusionMaterial,fusionCandidateIds} from './lib/v39-fusion-ui.mjs';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/fusion-artwork',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1100,height:844}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39FusionTest);
  const report=await page.evaluate(async()=>{
    const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
    const {resolveUnitArtwork,resolveEnemyArtwork}=await import('/src/lib/map-entity-artwork.js');
    const {enemySpawnData}=await import('/src/lib/game-data-registry.js');
    const names=['マンティコア','キメラ','グリフォン','アウルベア','スフィンクス','ディスプレイサービースト','バシリスク','ハイドラ'];
    const checks=names.map(name=>{
      const definition=enemySpawnData.find(row=>row.種族名===name&&row.種族&&row.サブクラス);
      const unit={name,race:definition?.種族||'タイガー',className:definition?.サブクラス||'ホーク',level:45,fusionGrowth:{recipeName:name}};
      return {name,sheet:art(unit)?.sheetFrame,unit:resolveUnitArtwork(unit)?.sheetFrame,
        enemy:resolveEnemyArtwork(unit)?.sheetFrame,renamed:art({...unit,name:'改名した仲間'})?.sheetFrame};
    });
    return {checks,manual:art({name:'マンティコア',race:'タイガー',imageFile:'狼・馬_ユニット集.webp',imageIndex:9})?.sheetFrame,
      wolf:art({name:'ウルフ',race:'ウルフ',strongAnimalClassName:'ムーンアニマル'})?.sheetFrame,
      horse:art({name:'バイコーン',race:'ホース',strongAnimalClassName:'デヴィル'})?.sheetFrame,
      undead:art({name:'マンティコア',race:'タイガー',className:'ゾンビ'})?.sheetFrame,
      realGhost:art({name:'ディスプレイサービースト',race:'ウルフ',className:'ゴースト',undeadOrigin:{unitId:'dead'}})?.sheetFrame};
  });
  for(let i=0;i<report.checks.length;i++)for(const field of ['sheet','unit','enemy','renamed']){
    assert.equal(report.checks[i][field]?.fileName,'魔獣_ユニット集2.webp');
    assert.equal(report.checks[i][field]?.slotNumber,i+1,`${report.checks[i].name} ${field}`);
  }
  assert.equal(report.manual.slotNumber,9);assert.equal(report.manual.fileName,'狼・馬_ユニット集.webp');
  assert.equal(report.wolf.slotNumber,2);assert.equal(report.horse.slotNumber,9);
  assert.equal(report.undead.slotNumber,12);assert.equal(report.undead.fileName,'クロコダイル・タイガー_ユニット集.webp');
  assert.notEqual(report.realGhost.fileName,'魔獣_ユニット集2.webp');
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();await window.waitForV39MapRenderSettled();});
  await page.locator('[data-v39-fusion-open]').first().click();
  await page.selectOption('[data-fusion-recipe]',{label:'マンティコア（候補・テスト限定）'});
  const slots=await page.locator('[data-fusion-slot]').count(),selected=[];
  for(let i=0;i<slots;i++){
    const options=await fusionCandidateIds(page,i);
    const id=options.find(id=>!selected.includes(id));assert(id);selected.push(id);
    await selectFusionMaterial(page,i,id);
  }
  assert(!await page.locator('[data-fusion-confirm]').isDisabled());
  const style=await page.locator('.fusion-result .fusion-portrait').getAttribute('style');
  const background=await page.locator('.fusion-result .fusion-portrait').evaluate(el=>el.style.backgroundImage);
  assert.match(decodeURIComponent(background),/魔獣_ユニット集2/);assert.match(style,/background-position:0% 0%/);
  await page.screenshot({path:'output/web-game/fusion-artwork/preview-1100.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'output/web-game/fusion-artwork/preview-390.png'});
  await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
  const created=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.fusionGrowth));
  assert.equal(created.name,'マンティコア');
  await page.keyboard.press('Escape');
  await page.waitForFunction(id=>window.getV39MapEntityMarker(id)?.list.some(child=>child.type==='Image'&&child.texture.key.includes('魔獣ユニット集2')&&String(child.frame.name).endsWith('-1')),created.id);
  const saved=await page.evaluate(async id=>{
    window.importV39SaveJson(window.exportV39SaveJson());
    const {resolveUnitArtwork}=await import('/src/lib/map-entity-artwork.js');
    return resolveUnitArtwork(window.getV39ActiveFactionState().units.find(u=>u.id===id))?.sheetFrame;
  },created.id);
  assert.equal(saved.slotNumber,1);assert.equal(saved.fileName,'魔獣_ユニット集2.webp');
  assert.deepEqual(errors,[]);console.log('8 named sheet slots, unit/enemy/renamed fusion, explicit override, animal/undead priority, native manticore fusion and save/load passed');
}finally{await browser.close();}
