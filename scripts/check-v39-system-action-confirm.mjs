import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch(),errors=[];
mkdirSync("output/web-game/system-action-confirm",{recursive:true});
try {
  for(const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    await page.locator('[data-squad-detail-tab="action"]').click();
    const snapshot=()=>page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState(),unit=window.getV39SelectedSquadUnit();
      return {ap:unit.ap,wait:unit.waitTurnNumber||null,survey:unit.surveyTask||null,cargo:faction.squads[0].cargo||null};
    });
    const before=await snapshot();
    for(const name of ["Wait","Survey"]) {
      await page.locator(`#mobileBattle${name}`).click({force:true});
      assert.equal(await page.locator(`#mobileBattle${name}`).getAttribute("aria-expanded"),"true");
      assert.deepEqual(await snapshot(),before);
      assert.equal(await page.locator(`#mobileBattle${name}Use`).isVisible(),true);
    }
    if(await page.locator("#mobileBattleSurvey").getAttribute("aria-expanded")!=="true") await page.locator("#mobileBattleSurvey").click();
    await page.screenshot({path:`output/web-game/system-action-confirm/${width}.png`});
    await page.locator("#mobileBattleSurveyUse").click();
    assert.equal((await snapshot()).ap,0);
    assert.ok((await snapshot()).survey);
    await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit();
      const map=window.__v39FieldRuntime.mapData; const {x,y}=actor; const site={id:"confirm-ore",key:`${x+1},${y}`,x:x+1,y,name:"鉱石",icon:"⛏️",wall:true,discovered:true,remaining:3}; map.caveSites.push(site); window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:site.x,y:site.y}}));
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id===actor.id?{...unit,ap:100,currentAp:100,surveyTask:undefined}:unit)});
    });
    await page.waitForTimeout(100);
    if(await page.locator("#mobileBattleGather").getAttribute("aria-expanded")!=="true") await page.locator("#mobileBattleGather").click();
    assert.equal((await snapshot()).ap,100);
    await page.locator("#mobileBattleGatherUse").click();
    assert.ok((await snapshot()).ap<100);
    assert.ok((await snapshot()).cargo);
    const preWait=await snapshot();
    await page.locator("#mobileBattleWait").click();
    assert.deepEqual(await snapshot(),preWait);
    await page.locator("#mobileBattleWaitUse").click();
    assert.equal((await snapshot()).ap,preWait.ap);
    assert.ok((await snapshot()).wait);
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log("PASS wait/survey/gather previews unchanged, use commits AP/action/cargo, desktop/mobile");
} finally {await browser.close();}
