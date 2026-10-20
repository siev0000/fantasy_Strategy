import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
import {selectFusionMaterial} from './lib/v39-fusion-ui.mjs';

const out='output/web-game/fusion-material-artwork';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39FusionTest);
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39FusionTest();
    await window.waitForV39MapRenderSettled();
    const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
    const {resolveUnitArtwork}=await import('/src/lib/map-entity-artwork.js');
    const {resolveAnimalArtworkReference}=await import('/src/lib/animal-artwork-config.js');
    const {collectV39FusionClassLevels:levels}=await import('/src/lib/v39-monster-fusion-growth.js');
    const {getV39FusionMaterials}=await import('/src/lib/v39-monster-fusion.js');
    const units=getV39FusionMaterials(window.getV39ActiveFactionState()).filter(u=>u.fusionTestMaterial);
    const attributes=units.filter(u=>u.fusionTestRequirementName?.endsWith('アニマル')).map(u=>({
      id:u.id,race:u.race,className:u.className,attribute:u.strongAnimalClassName,level:u.level,
      levels:levels(u),slot:art(u)?.sheetFrame?.slotNumber,expected:resolveAnimalArtworkReference(u)?.slotNumber,
      file:art(u)?.sheetFrame?.fileName,hp:u.hp,maxHp:u.maxHp
    }));
    const species=['ディア','ライオン','タートル','ライノセラス'];
    const frames=species.flatMap(race=>['', 'ゾンビ','スケルトン'].map(className=>({race,className,frame:art({race,className})?.sheetFrame,field:resolveUnitArtwork({race,className:className||race})?.sheetFrame})));
    const flame=[1,15,30,45].map(level=>art({name:'改名した精霊',race:'フレイムエレメンタル',level})?.sheetFrame);
    window.importV39SaveJson(window.exportV39SaveJson());
    const saved=getV39FusionMaterials(window.getV39ActiveFactionState()).filter(u=>u.fusionTestRequirementName?.endsWith('アニマル'));
    return {attributes,frames,flame,saved:saved.map(u=>({id:u.id,race:u.race,attribute:u.strongAnimalClassName,levels:levels(u)})),
      materials:units.filter(u=>['ディア','ライオン','タートル','フレイムエレメンタル'].includes(u.fusionTestRequirementName)).map(u=>({id:u.id,frame:art(u)?.sheetFrame,src:art(u)?.src}))};
  });
  assert(report.attributes.length>=10);
  for(const u of report.attributes){
    assert(!u.race.endsWith('アニマル')&&!u.className.endsWith('アニマル'));
    assert.equal(u.attribute,u.id.replace(/^fusion-material-/,'').replace(/-\d+$/,''));
    assert.equal(u.levels[u.attribute],3);assert.equal(Object.values(u.levels).reduce((sum,n)=>sum+n,0),u.level);
    assert.equal(u.slot,u.expected);assert(u.file);assert.equal(u.hp,u.maxHp);
    const restored=report.saved.find(saved=>saved.id===u.id);assert(restored);assert.equal(restored.race,u.race);assert.equal(restored.attribute,u.attribute);assert.deepEqual(restored.levels,u.levels);
  }
  for(const [i,frame] of report.flame.entries()){assert.equal(frame?.fileName,'エレメンタル_ユニット集1.webp');assert.equal(frame.slotNumber,i+1);}
  for(const entry of report.frames){
    assert(entry.frame,`${entry.race} ${entry.className}`);
    assert.deepEqual(entry.field,entry.frame,'ordinary field units share the same artwork');
    const start=['タートル','ライノセラス'].includes(entry.race)?7:1;
    assert.equal(entry.frame.slotNumber,start+(entry.className==='ゾンビ'?5:entry.className==='スケルトン'?4:0));
  }
  for(const unit of report.materials){assert(unit.frame&&unit.src,unit.id);assert.equal((await page.request.get(new URL(unit.src,page.url()).href)).ok(),true);}
  await page.evaluate(()=>window.openV39CharacterModal());
  await page.locator('[data-v39-character-tab="character"]').click();
  for(const unit of report.materials.filter(u=>u.id.endsWith('-1'))){
    const card=page.locator(`#characterModal [data-v39-character-row="${unit.id}"]`);
    const image=card.locator('.v39-card-portrait-image');
    assert.equal(await image.getAttribute('data-v39-portrait-file'),unit.frame.fileName);
    assert.equal(await image.getAttribute('data-v39-portrait-slot'),String(unit.frame.slotNumber));
    await card.scrollIntoViewIfNeeded();await card.click();
    await page.screenshot({path:`${out}/${unit.id}.png`});
  }
  await page.locator('#characterModal [data-close]').click();
  await page.locator('[data-v39-fusion-open]').first().click();
  await page.selectOption('[data-fusion-recipe]',{label:'イエティ（候補・テスト限定）'});
  await selectFusionMaterial(page,0,'fusion-material-ベア-1');
  await selectFusionMaterial(page,1,'fusion-material-フロストアニマル-1');
  assert(!await page.locator('[data-fusion-confirm]').isDisabled(),'real wolf + frost class satisfies the ingredient');
  await page.screenshot({path:`${out}/attribute-preview-390.png`});
  await page.setViewportSize({width:1100,height:844});
  await page.screenshot({path:`${out}/attribute-preview-1100.png`});
  await page.locator('[data-fusion-confirm]').click();await page.locator('[data-fusion-commit]').click();
  assert(await page.evaluate(()=>window.getV39ActiveFactionState().units.some(u=>u.fusionGrowth?.recipeName==='イエティ')));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
