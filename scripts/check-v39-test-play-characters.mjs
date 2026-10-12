import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/test-play-characters";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.evaluate(()=>window.setV39TestMode(true));
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const report=await page.evaluate(async()=>{
      const testers=()=>window.getV39GameState().players.flatMap(p=>p.factionState.units).filter(u=>u.testOnly);
      const caveOn=testers().length;
      await window.setV39TestMode(false);
      await window.setV39TestMode(true);
      window.dispatchEvent(new CustomEvent("v39:cave-world-ready"));
      const caveToggled=testers().length;
      window.startV39LocalSession(1,{playMode:"single-normal"});
      window.dispatchEvent(new CustomEvent("v39:field-generated"));
      const normalOn=testers().length;
      await window.setV39TestMode(false);
      window.startV39LocalSession(1,{playMode:"single-test"});
      const testOff=testers().map(u=>({id:u.id,hp:u.hp,skills:u.techniques.map(t=>t.name)}));
      const tester=testers().find(u=>u.className==="戦闘試験官");
      window.updateV39ActiveFactionState({selectedUnitId:tester.id});
      await window.setV39TestMode(true);
      await window.setV39TestMode(false);
      const toggled=testers().map(u=>u.id);
      const save=JSON.parse(window.exportV39SaveJson());
      window.setV39GameState(save.gameState,{reason:"save-loaded"});
      const restored=testers().map(u=>u.id);
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:faction.units.filter(u=>u.id!==tester.id)});
      window.dispatchEvent(new CustomEvent("v39:cave-world-ready"));
      await window.setV39TestMode(true);
      const respawned=testers().some(u=>u.id===tester.id);
      return {caveOn,caveToggled,normalOn,testOff,toggled,restored,respawned};
    });
    assert.equal(report.caveOn,0);assert.equal(report.caveToggled,0);assert.equal(report.normalOn,0);
    assert.equal(report.testOff.length,2);
    assert.equal(report.testOff.find(u=>u.id.endsWith("combat-tester")).skills.length,10);
    assert.deepEqual(report.toggled,report.testOff.map(u=>u.id));
    assert.deepEqual(report.restored,report.toggled);assert.equal(report.respawned,false);
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/${width}.json`,JSON.stringify(report,null,2));
    await page.screenshot({path:`${out}/${width}.png`});
    console.log(`${width}: cave/normal do not spawn testers; test play retains testers with test mode OFF, toggle and save restore; no auto-respawn`);
    await page.close();
  }
} finally {await browser.close();}
