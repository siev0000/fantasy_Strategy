import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{width:1000,height:800} });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021", {waitUntil:"networkidle"});
  await page.waitForFunction(() => typeof window.generateV39TestFieldWithSeed === "function");
  const report = await page.evaluate(async () => {
    const config = await import("http://127.0.0.1:3022/src/lib/animal-artwork-config.js");
    const {resolveMonsterSheetArtwork} = await import("http://127.0.0.1:3022/src/lib/monster-sheet-artwork.js");
    const {classData} = await import("http://127.0.0.1:3022/src/lib/game-data-registry.js");
    const specs = [
      ["ボア","フレイムアニマル",10,"ベア・ボア_ユニット集.webp"],
      ["ベア","フロストアニマル",3,"ベア・ボア_ユニット集.webp"],
      ["ホーク","ウィンドアニマル",3,"ホーク・スネーク_ユニット集.webp"],
      ["タイガー","スパークアニマル",8,"クロコダイル・タイガー_ユニット集.webp"],
      ["スネーク","ポイズンアニマル",8,"ホーク・スネーク_ユニット集.webp"],
      ["クロコダイル","シーアニマル",2,"クロコダイル・タイガー_ユニット集.webp"],
      ["ボア","ストーンアニマル",8,"ベア・ボア_ユニット集.webp"],
      ["ウルフ","フレイムアニマル",7,"魔獣_ユニット集1.webp"],
      ["ベア","ウィンドアニマル",1,"ベア・ボア_ユニット集.webp"],
      ["ホース","シーアニマル",7,"狼・馬_ユニット集.webp"]
    ];
    const restored = Object.keys(config.動物属性クラス対応).every(name => classData.some(row => row.名前 === name));
    const cases = specs.map(([race,className,slot,file]) => ({race,className,slot,file,
      artwork:resolveMonsterSheetArtwork({race,className,sourceDefinitionId:"出現敵:平地:ボア:3:8",level:45})}));
    const matrix = ["ホーク","スネーク","ウルフ","クロコダイル","タイガー","ベア","ボア","ホース","ドレイク"]
      .flatMap(race => Object.keys(config.動物属性クラス対応).map(className => ({race,className,
        low:resolveMonsterSheetArtwork({race,className,level:1}),high:resolveMonsterSheetArtwork({race,className,level:50})})));
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"animal-attributes");
    const data = window.__v39FieldRuntime.mapData;
    for(let y=0;y<data.h;y++) for(let x=0;x<data.w;x++) {
      data.grid[y][x]="平地"; data.heightLevelMap[y][x]=0; data.specialMap[y][x]="";
      if(data.reliefMap?.[y]) data.reliefMap[y][x]="";
    }
    const state = window.getV39GameState();
    window.setV39GameState({players:state.players.map(player=>({...player,factionState:{...player.factionState,villagePlacementMode:false}})),
      enemies:cases.slice(0,8).map((item,index)=>({id:`attribute-${index}`,name:item.race,race:item.race,className:item.className,
        level:5,hp:100,maxHp:100,x:12+(index%4)*2,y:12+Math.floor(index/4)*2}))});
    return {restored,cases,matrix};
  });
  assert.equal(report.restored,true);
  for(const item of report.cases) {
    assert.equal(item.artwork.sheetFrame.slotNumber,item.slot);
    assert.equal(item.artwork.sheetFrame.fileName,item.file);
  }
  for(const item of report.matrix) {
    assert.ok(item.low,`${item.race}/${item.className}`);
    assert.deepEqual(item.low.sheetFrame,item.high.sheetFrame);
  }
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop,#v39-initial-sovereign-modal{display:none!important}"});
  await page.waitForFunction(()=>typeof window.getV39MapEntityMarker === "function" && [0,1,2,3,4,5,6,7]
    .every(index=>window.getV39MapEntityMarker(`attribute-${index}`)?.list.some(child=>child.type==="Image")));
  const frames = await page.evaluate(()=>[0,1,2,3,4,5,6,7].map(index=>window.getV39MapEntityMarker(`attribute-${index}`).list.find(child=>child.type==="Image").frame.name));
  report.cases.slice(0,8).forEach((item,index)=>assert.ok(frames[index].endsWith(`-${item.slot}`)));
  await page.evaluate(()=>{
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    scene.cameras.main.setZoom(1.6).centerOn(15*62+31,13*56+37);
  });
  await page.waitForTimeout(150);
  await page.screenshot({path:"output/web-game/v39-animal-attributes.png"});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({restored:report.restored,matrixCount:report.matrix.length,frames,errors},null,2));
} finally { await browser.close(); }
