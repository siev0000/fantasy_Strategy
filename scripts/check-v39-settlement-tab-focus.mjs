import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.renderV39SettlementPanel==="function");
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"settlement-tab-focus");
    const player=window.getV39ActivePlayer();
    const base=player.factionState.settlements[0];
    window.updateV39ActiveFactionState({...player.factionState,villagePlacementMode:false,
      settlements:[{...base,id:"a",settlementId:"a",name:"第一拠点",placed:true,x:10,y:10},
        {...base,id:"b",settlementId:"b",name:"第二拠点",placed:true,x:24,y:23},
        {...base,id:"pending",settlementId:"pending",name:"未配置",placed:false,x:null,y:null}],
      selectedSettlementId:"a"
    });
    window.activateV39FooterTab("settlement");
  });
  await page.waitForFunction(()=>window.__v39FieldRuntime?.game?.scene?.getScenes(true)?.[0]?.cameras?.main);
  await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.setZoom(2));
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  const camera=()=>page.evaluate(()=>{
    const cam=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;
    const state=window.getV39ActiveFactionState();
    return {x:cam.scrollX+cam.width/2,y:cam.scrollY+cam.height/2,zoom:cam.zoom,
      selected:state.selectedSettlementId,unit:state.selectedUnitId};
  });
  const initial=await camera();
  for (const [id,x,y] of [["b",24,23],["a",10,10]]) {
    await page.locator(`[data-settlement-id="${id}"]`).click();
    await page.waitForTimeout(250);
    const after=await camera();
    assert.equal(after.selected,id);
    assert.equal(after.zoom,2);
    assert.equal(after.unit,initial.unit);
    assert.ok(Math.abs(after.x-(x*62+(y%2?31:0)+31))<1,JSON.stringify(after));
    assert.ok(Math.abs(after.y-(y*56+37))<1,JSON.stringify(after));
  }
  const before=await camera();
  await page.locator('[data-settlement-id="pending"]').click();
  await page.waitForTimeout(100);
  const after=await camera();
  assert.equal(after.x,before.x);
  assert.equal(after.y,before.y);
  await page.locator('[data-settlement-id="b"]').click();
  await page.waitForTimeout(200);
  await page.screenshot({path:"output/web-game/v39-settlement-tab-focus.png"});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({tabFocus:true,zoomPreserved:true,unitSelectionPreserved:true,unplacedIgnored:true,errors}));
} finally {await browser.close();}
