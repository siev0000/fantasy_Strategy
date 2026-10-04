import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.beginV39InitialPlacement === "function");
  const report = await page.evaluate(async () => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({ ...player, race:"只人", factionState:{ ...player.factionState,
      initialSettlementCount:1, initialSettlementPlans:[{ name:"候補検証村" }],
      units:player.factionState.units.map((unit,index) => index ? unit : { ...unit,isSovereign:true,unitType:"統治者" })
    } })) });
    window.generateV39TestFieldWithSeed({ w:36,h:36,patternId:"realistic" }, "terrain-preference");
    const data = window.__v39FieldRuntime.mapData;
    data.worldWrapEnabled = false;
    window.__v39FieldRuntime.settings.islandCustomSettings = { worldWrapEnabled:false };
    for(let y=0;y<data.h;y++) for(let x=0;x<data.w;x++) {
      data.grid[y][x] = x>=23 && y>=23 ? "森" : "平地";
      data.heightLevelMap[y][x] = 1;
      data.specialMap[y][x] = "";
      if(data.reliefMap?.[y]) data.reliefMap[y][x] = "";
      if(data.lavaMap?.[y]) data.lavaMap[y][x] = false;
    }
    data.heightLevelMap[16][16] = 0;
    data.riverData = { riverSet:new Set(["8,8"]), riverTouchSet:new Set(["8,9"]) };
    window.beginV39InitialPlacement({ force:true });
    while (!window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39PlacementContext) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    const scene = window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const human = { ...scene.v39PlacementContext.candidates[0] };
    const current = window.getV39GameState();
    window.setV39GameState({ players:current.players.map(player => ({ ...player,race:"エルフ" })) });
    window.beginV39InitialPlacement({ force:true });
    const elf = { ...scene.v39PlacementContext.candidates[0] };
    const { getHexDistance } = await import("http://127.0.0.1:3022/src/lib/hex-grid.js");
    const extraLowland = scene.v39PlacementContext.allowedTiles.filter(tile => tile.terrain === "森"
      && scene.v39PlacementContext.candidates.every(candidate => getHexDistance(candidate,tile)>2));
    const lowlandSelectable = extraLowland.length>0 && window.canPlaceV39InitialBase(extraLowland[0]);
    const { resolveMonsterSheetArtwork } = await import("http://127.0.0.1:3022/src/lib/monster-sheet-artwork.js");
    const animals = ["ホース","ボア","ドレイク"].map(name => ({ name, artwork:resolveMonsterSheetArtwork({ race:name,level:15 }) }));
    return { human,elf,animals,extraLowlandCount:extraLowland.length,lowlandSelectable };
  });
  assert.equal(report.human.preference[0],-2);
  assert.ok(report.human.x<12 && report.human.y<12, "川沿いの平地が中央の低地より優先される");
  assert.equal(report.elf.terrain,"森");
  assert.ok(report.elf.x>=25 && report.elf.y>=25, "広い森林の内部が優先される");
  assert.ok(report.extraLowlandCount>0);
  assert.equal(report.lowlandSelectable,true,"最大20候補の周囲から外れた適正低地も選択できる");
  const files = ["狼・馬_ユニット集.webp","ベア・ボア_ユニット集.webp","ワイバーン・ドレイク_ユニット集.webp"];
  for(const [index,animal] of report.animals.entries()) {
    assert.equal(animal.artwork.sheetFrame.fileName,files[index]);
    assert.equal(animal.artwork.sheetFrame.slotNumber,7);
    assert.equal(animal.artwork.sheetFrame.column,2);
    assert.equal(animal.artwork.sheetFrame.row,1);
    assert.equal((await page.request.get(new URL(animal.artwork.src,"http://127.0.0.1:3022").href)).status(),200);
  }
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.screenshot({ path:"output/web-game/v39-elf-placement-preference.png" });
  await page.evaluate(() => {
    window.setV39TestMode(true);
    const state = window.getV39GameState();
    window.setV39GameState({ players:state.players.map(player => ({ ...player,factionState:{ ...player.factionState,villagePlacementMode:false } })),
      enemies:["ホース","ボア","ドレイク"].map((name,index) => ({ id:`artwork-${index}`,name,race:name,level:5,hp:100,maxHp:100,x:12+index*2,y:12 })) });
    window.refreshV39MapEntities();
    window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.setZoom(2).centerOn(14*62+31,12*56+37);
  });
  await page.waitForFunction(() => [0,1,2].every(index => window.getV39MapEntityMarker(`artwork-${index}`)?.list.some(child => child.type === "Image")));
  const frames = await page.evaluate(() => [0,1,2].map(index => {
    const image = window.getV39MapEntityMarker(`artwork-${index}`).list.find(child => child.type === "Image");
    return { texture:image.texture.key, frame:image.frame.name };
  }));
  assert.ok(frames.every(image => image.frame.endsWith("-7")));
  await page.screenshot({ path:"output/web-game/v39-animal-artwork.png" });
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ report,frames,errors },null,2));
} finally { await browser.close(); }
