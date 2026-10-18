import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {selectFusionMaterial,fusionCandidateIds} from './lib/v39-fusion-ui.mjs';

const out='output/web-game/added-animals';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39FusionTest);
    const report=await page.evaluate(async()=>{
      const {buildV39UnitEntity}=await import('/src/lib/v39-unit-creation-rules.js');
      const {resolveAttackRows}=await import('/src/lib/v39-combat-engine.js');
      const {resolveMonsterSheetArtwork}=await import('/src/lib/monster-sheet-artwork.js');
      const {getV39FusionMaterials}=await import('/src/lib/v39-monster-fusion.js');
      const species=['ライオン','ゴート','オウル','リザード','モンキー','フォックス','タートル','ディア'];
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      const fixture=window.startV39FusionTest();await window.waitForV39MapRenderSettled();
      const classes=window.getGameDataRows('クラス'),skills=window.getGameDataRows('スキル一覧'),skillNames=new Set(skills.map(row=>row.名前));
      const animals=species.map(race=>{
        const unit=buildV39UnitEntity({id:`animal-${race}`,race,className:race,level:10,x:2,y:2,isNamed:false});
        return {race,ok:unit.derivedCharacter?.ok,hp:unit.maxHp,attacks:resolveAttackRows(unit).map(row=>row.名前),
          missing:unit.acquiredSkillNames.filter(name=>!skillNames.has(name))};
      });
      const images=['フォックス','リザード'].map(race=>({race,...resolveMonsterSheetArtwork({race,className:race})?.sheetFrame}));
      const stock=getV39FusionMaterials(window.getV39ActiveFactionState());
      const copies=Object.fromEntries(species.map(race=>[race,stock.filter(u=>u.race===race&&u.fusionTestMaterial).length]));
      const before=stock.length;window.importV39SaveJson(window.exportV39SaveJson());
      return {fixture,animals,images,copies,saved:getV39FusionMaterials(window.getV39ActiveFactionState()).length===before,classCount:classes.length,skillCount:skills.length};
    });
    assert(report.fixture.ok&&report.saved);assert(report.animals.every(row=>row.ok&&row.hp>0));
    assert(Object.values(report.copies).every(n=>n>=2));
    assert(report.animals.find(row=>row.race==='ライオン').attacks.includes('爪'));
    assert(report.animals.find(row=>row.race==='ライオン').attacks.includes('牙'));
    assert.equal(report.images[0].fileName,'鼠・狐_ユニット集.webp');assert.equal(report.images[0].slotNumber,7);
    assert.equal(report.images[1].fileName,'蜥蜴・蛙_ユニット集.webp');assert.equal(report.images[1].slotNumber,1);
    await page.locator('[data-v39-fusion-open]').first().click();
    await page.selectOption('[data-fusion-recipe]',{label:'グリフォン（候補・テスト限定）'});
    const selected=[];
    for(let i=0;i<await page.locator('[data-fusion-slot]').count();i++) {
      const ids=await fusionCandidateIds(page,i),id=ids.find(id=>!selected.includes(id));assert(id);
      if(i===0)assert.match(id,/ライオン/);
      selected.push(id);await selectFusionMaterial(page,i,id);
    }
    await page.screenshot({path:`${out}/griffin-${width}.png`});
    assert(!await page.locator('[data-fusion-confirm]').isDisabled(),await page.locator('#v39-fusion-modal').innerText());
    await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
    const result=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),unit=f.units.find(u=>u.fusionGrowth?.recipeName==='グリフォン');
      window.importV39SaveJson(window.exportV39SaveJson());
      const restored=window.getV39ActiveFactionState().units.find(u=>u.id===unit?.id);
      return {ok:unit?.derivedCharacter?.ok,race:unit?.race,levels:unit?.fusionGrowth?.levelsByClass,saved:restored?.fusionGrowth?.levelsByClass};
    });
    assert(result.ok);assert.equal(result.race,'ライオン');assert(result.levels.幻獣>=1);assert.deepEqual(result.levels,result.saved);
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/report-${width}.json`,JSON.stringify({report,result},null,2));
    console.log(`${width}: eight animal classes, stored samples, lion body attacks, fox/lizard sprites, native griffin fusion and save passed`);
    await page.close();
  }
} finally {await browser.close();}
