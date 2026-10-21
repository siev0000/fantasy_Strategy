import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const rows=await page.evaluate(async()=>{
  const {BEAST_ARTWORK_ENTRIES:entries}=await import('/src/lib/beast-artwork-config.js');
  const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
  const {resolveUnitArtwork:unitArt}=await import('/src/lib/map-entity-artwork.js');
  return entries.map(entry=>{
   const unit={race:entry.name,className:entry.name,level:45};
   return {entry,normal:art(unit),field:unitArt(unit),
    saved:art({...unit,画像ファイル:'魔獣_ユニット集2.webp',画像番号:1}),
    fusion:art({race:'ホース',className:'幻獣',fusionGrowth:{recipeName:entry.name}})};
  });
 });
 assert.equal(rows.length,24);
 for(const row of rows){
  for(const key of ['normal','field','saved','fusion']){
   assert.equal(row[key]?.sheetFrame?.fileName,row.entry.fileName,`${row.entry.name} ${key}`);
   assert.equal(row[key].sheetFrame.slotNumber,row.entry.slotNumber);
  }
  assert((await page.request.get(new URL(row.normal.src,page.url()).href)).ok());
 }
 const ghosts=await page.evaluate(async()=>{
  const {resolveMonsterSheetArtwork:art}=await import('/src/lib/monster-sheet-artwork.js');
  const {resolveUnitArtwork:field}=await import('/src/lib/map-entity-artwork.js');
  const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
  const boss=derive({race:'ウルフ',className:'ウルフ',level:25,strongAnimalClassName:'ゴースト',strongAnimalClassLevel:10,
   strongFusionResultName:'ディスプレイサービースト',name:'ディスプレイサービースト'});
  const variants=[boss,{race:'ウルフ',className:'ゴースト',name:'ディスプレイサービースト'},
   {race:'ウルフ',className:'ウルフ',fusionGrowth:{recipeName:'ディスプレイサービースト',levelsByClass:{ウルフ:10,ゴースト:5}}}];
  return {variants:variants.map(u=>({art:art(u)?.sheetFrame,field:field(u)?.sheetFrame})),
   resurrected:art({...boss,undeadOrigin:{race:'ウルフ'}})?.sheetFrame,
   zombie:art({...boss,className:'ゾンビ'})?.sheetFrame,
   ghost:art({race:'ゴースト',className:'ゴースト'})?.sheetFrame};
 });
 for(const row of ghosts.variants){
  assert.equal(row.art?.fileName,'魔獣_ユニット集.webp');assert.equal(row.art.slotNumber,6);
  assert.deepEqual(row.field,row.art);
 }
 for(const row of [ghosts.resurrected,ghosts.ghost]){assert.equal(row.fileName,'アンデッド・霊体系_ユニット集.webp');assert.equal(row.slotNumber,6);}
 assert.equal(ghosts.zombie.fileName,'狼・馬_ユニット集.webp');assert.equal(ghosts.zombie.slotNumber,6);
 const restored=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
  await window.waitForV39MapRenderSettled();
  const {createV39EventEnemy:create}=await import('/src/v39/ai/v39-enemy-spawn.js');
  const {applyV39DerivedCharacterData:derive}=await import('/src/v39/unit/v39-character-derived-rules.js');
  const unit=derive({...create({id:'ghost-beast-regression',name:'ディスプレイサービースト',race:'ウルフ',className:'ウルフ',level:25,x:8,y:5}),
   strongEnemy:true,strongFusionResultName:'ディスプレイサービースト',strongAnimalClassName:'ゴースト',strongAnimalClassLevel:10});
  window.setV39GameState({enemies:[unit]},{reason:'ghost-beast-image-regression'});
  window.importV39SaveJson(window.exportV39SaveJson());
  const saved=window.getV39GameState().enemies.find(u=>u.id===unit.id);
  const {resolveEnemyArtwork:art}=await import('/src/lib/map-entity-artwork.js');
  const {HEX_TILE_CONFIG:hex}=await import('/src/lib/phaser-map-panel-config.js');
  const camera=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;
  camera.setZoom(1.3);camera.centerOn(8.5*hex.width,5*hex.rowStep);
  await window.waitForV39MapRenderSettled();
  return art(saved)?.sheetFrame;
 });
 assert.equal(restored.fileName,'魔獣_ユニット集.webp');assert.equal(restored.slotNumber,6);
 mkdirSync('output/web-game/beast-artwork',{recursive:true});
 await page.screenshot({path:'output/web-game/beast-artwork/ghost-boss.png'});
 assert.deepEqual(errors,[]);
 console.log('24 beasts and ghost boss/fusion identity: normal/field/saved/fusion frames, real undead priority and bundled assets passed');
}finally{await browser.close();}
