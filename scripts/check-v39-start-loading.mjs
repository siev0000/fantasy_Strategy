import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.evaluate(async()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.generateV39TestFieldWithSeed({w:60,h:60,patternId:"realistic"},"perf-main-60");
    await window.waitForV39MapRenderSettled();
    const faction=window.getV39ActiveFactionState();
    window.updateV39ActiveFactionState({units:faction.units.map((unit,i)=>i===0?{...unit,isSovereign:true,unitType:"統治者"}:unit),initialSettlementCount:1,initialSettlementPlans:[{name:"開始試験村"}]});
    window.beginV39InitialPlacement({force:true});
    document.querySelectorAll("#v39-play-mode-select,.vue-modal-backdrop").forEach(el=>el.style.display="none");
    await new Promise(resolve=>setTimeout(resolve,200));
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:scene.v39PlacementContext.candidates[0]}));
    window.startCompletionCount=0;
    window.addEventListener("v39:initial-placement-complete",()=>{
      window.startCompletionCount++;
      if(!document.getElementById("v39-field-update-loading"))throw new Error("loading missing during world initialization");
    });
  });
  await page.waitForFunction(()=>document.querySelector("[data-placement-confirm]")?.disabled===false);
  const before=await page.evaluate(()=>{
    const button=document.querySelector("[data-placement-confirm]");
    button.click();button.click();
    return {loading:!!document.getElementById("v39-field-update-loading"),disabled:button.disabled,notPlacedYet:window.getV39ActiveFactionState().villagePlacementMode};
  });
  assert.deepEqual(before,{loading:true,disabled:true,notPlacedYet:true});
  await page.waitForFunction(()=>!window.isV39FieldUpdating(),{timeout:60000});
  const after=await page.evaluate(()=>({completed:window.startCompletionCount,placed:window.getV39ActiveFactionState().villagePlacementMode===false,locked:window.isV39MapInputLocked(),loading:!!document.getElementById("v39-field-update-loading")}));
  assert.deepEqual(after,{completed:1,placed:true,locked:false,loading:false});
  mkdirSync("output/web-game/start-loading",{recursive:true});
  await page.screenshot({path:"output/web-game/start-loading/started.png"});
  assert.deepEqual(errors,[]);
  console.log("PASS manual base confirmation paints loader before initialization, no duplicate",after);
} finally {await browser.close();}
