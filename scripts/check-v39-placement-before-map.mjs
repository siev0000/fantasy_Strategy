import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/placement-before-map";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    const before=await page.evaluate(()=>{
      window.startV39LocalSession(1,{playMode:"single-test"});
      window.closeV39PlayModeSelection();
      for(const race of ["只人","エルフ","只人"]) {
        const state=window.getV39GameState();
        window.setV39GameState({players:state.players.map(player=>({...player,race,
          factionState:{...player.factionState,villagePlacementMode:true}}))},{reason:"pre-map-race-selection-test"});
      }
      window.dispatchEvent(new CustomEvent("v39:operation-ui-ready"));
      return {map:window.__v39FieldRuntime?.mapData || null,
        panelVisible:!!document.getElementById("v39-placement-preview")&&!document.getElementById("v39-placement-preview").hidden};
    });
    assert.equal(before.map,null);
    assert.equal(before.panelVisible,false);
    await page.waitForTimeout(100);
    assert.deepEqual(errors,[]);
    await page.evaluate(()=>{
      const state=window.getV39GameState();
      const unit={id:"pre-map-sovereign",name:"配置確認",race:"只人",className:"ファイター",
        level:7,isSovereign:true,isNamed:true,hp:100,maxHp:100,ap:100,maxAp:100};
      window.setV39GameState({players:state.players.map(player=>({...player,
        factionState:{...player.factionState,units:[unit],selectedUnitId:unit.id}}))});
      window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"placement-lifecycle-test");
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const generated=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const tiles=scene.v39PlacementContext.allowedTiles;
      const tile=tiles.find(point=>window.canPlaceV39InitialBase(point));
      return {count:tiles.length,tile};
    });
    assert.ok(generated.count>0);
    assert.ok(generated.tile);
    await page.evaluate(tile=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:tile})),generated.tile);
    await page.screenshot({path:`${out}/${width}.png`});
    await page.locator('[data-placement-confirm]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().settlements.some(row=>row.placed));
    assert.deepEqual(errors,[]);
    console.log(`${width}: pre-map race changes, generated candidates and initial placement OK`);
    await page.close();
  }
} finally {await browser.close();}
