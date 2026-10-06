import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
mkdirSync("output/web-game/cave-random",{recursive:true});
const browser=await chromium.launch(),errors=[];
const randomRuns=[],fixedRuns=[];
try{
  for(let index=0;index<6;index++){
    const page=await browser.newPage();page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    const seedInput=page.getByPlaceholder("空欄で毎回ランダム");assert.equal(await seedInput.inputValue(),"");
    if(index>=4)await seedInput.fill("repeat-cave-test");
    await page.getByRole("button",{name:"探索開始",exact:true}).click();await page.waitForTimeout(600);
    const run=await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData;
      return {seed:map.caveSeed,mode:map.caveTemplateMode,grid:JSON.stringify(map.grid),enemies:JSON.stringify(window.getV39GameState().enemies.map(row=>({race:row.race,level:row.level,x:row.x,y:row.y})))};
    });
    assert.equal(run.mode,"random");(index<4?randomRuns:fixedRuns).push(run);
    if(index===0){
      await page.evaluate(async()=>{
        const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
        const first=window.__v39FieldRuntime.mapData,firstGrid=JSON.stringify(first.grid);
        const actor=window.getV39SelectedSquadUnit(),faction=window.getV39ActiveFactionState();
        window.updateV39ActiveFactionState({units:faction.units.map(row=>row.id===actor.id?{...row,x:first.stairsDown.x,y:first.stairsDown.y}:row)});
        window.descendV39Cave();
        const next=window.__v39FieldRuntime.mapData;
        const {generateCaveFloor}=await import("/src/lib/v39-cave-adventure.js");
        const expected=generateCaveFloor({seed:first.caveSeed,templateId:"random",floor:2,caveTest:true});
        check(next.caveTemplateMode==="random","random mode retained on descent");
        check(JSON.stringify(next.grid)===JSON.stringify(expected.map.grid),"next floor independently drawn from random templates");
        const {enterV39Cave}=await import("/src/v39/core/v39-cave-world.js");
        enterV39Cave({seed:first.caveSeed,templateId:"random",floor:1,caveTest:true});
        check(JSON.stringify(window.__v39FieldRuntime.mapData.grid)===firstGrid,"revisit preserves floor");
        window.importV39SaveJson(window.exportV39SaveJson(0));
        await new Promise(resolve=>setTimeout(resolve,500));
        check(JSON.stringify(window.__v39FieldRuntime.mapData.grid)===firstGrid,"load preserves floor");
        check(window.__v39FieldRuntime.mapData.caveTemplateMode==="random","random mode saved");
      });
      await page.screenshot({path:"output/web-game/cave-random/result.png"});
    }
    await page.close();
  }
  assert.equal(new Set(randomRuns.map(row=>row.seed)).size,4);
  assert.ok(new Set(randomRuns.map(row=>row.grid)).size>1,"different random maps");
  assert.ok(new Set(randomRuns.map(row=>row.enemies)).size>1,"different random enemies");
  assert.deepEqual(fixedRuns[0],fixedRuns[1],"manual seed remains reproducible");
  assert.deepEqual(errors,[]);
  console.log("PASS random starts/maps/enemies, per-floor random mode, manual reproducibility, revisit/save/load");
}finally{await browser.close();}
