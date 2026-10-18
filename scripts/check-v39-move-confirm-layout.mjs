import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/move-confirm-layout";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const [width,height] of [[1100,844],[390,844],[844,390]]) {
    const page=await browser.newPage({viewport:{width,height}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const original=await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData;
      map.grid=map.grid.map(row=>row.map(()=>"洞窟"));
      map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.defenseStructures=[];
      const faction=window.getV39ActiveFactionState(),unit={...faction.units[0],x:5,y:10,ap:100,currentAp:100,
        className:"アーチャー",level:20};
      window.setV39GameState({enemies:[],neutralVillages:[]});
      window.updateV39ActiveFactionState({units:[unit],squads:[],selectedUnitId:unit.id});
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
      return {x:unit.x,y:unit.y};
    });
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="basic"]').click();
    await page.locator("#mobileBattleMove").click();
    await page.locator("#moveConfirm").waitFor({state:"visible"});
    assert.ok(await page.locator("#moveOk").isDisabled());
    const target=await page.evaluate(()=>{
      const row=window.getV39UnitMovePreview().reachable.find(p=>p.key==="6,10");
      if (!row) throw new Error("adjacent move missing");
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:6,y:10}}));
      return {x:6,y:10,cost:row.cost};
    });
    assert.ok(await page.locator("#moveOk").isEnabled());
    assert.match(await page.locator("#moveText").textContent(),/距離 1.*消費AP.*残AP/u);
    const layout=await page.evaluate(()=>{
      const panel=document.querySelector('[data-squad-detail-panel="action"]'),confirm=document.getElementById("moveConfirm");
      const before=confirm.getBoundingClientRect();panel.scrollTop=panel.scrollHeight;
      const after=confirm.getBoundingClientRect(),parent=panel.getBoundingClientRect();
      return {count:document.querySelectorAll("#moveConfirm").length,inside:panel.contains(confirm),
        delta:after.top-before.top,visible:after.top>=parent.top-1&&after.bottom<=parent.bottom+1,
        oldBanner:document.getElementById("modeBanner").classList.contains("show")};
    });
    assert.equal(layout.count,1);assert.ok(layout.inside);assert.ok(layout.visible,JSON.stringify(layout));
    assert.ok(Math.abs(layout.delta)<2);assert.equal(layout.oldBanner,false);
    await page.screenshot({path:`${out}/${width}-confirm.png`});
    await page.locator("#moveCancel").click();
    assert.equal(await page.evaluate(()=>window.getV39UnitMovePreview()),null);
    assert.ok(await page.locator("#moveConfirm").isHidden());
    assert.deepEqual(await page.evaluate(()=>{const u=window.getV39ActiveFactionState().units[0];return {x:u.x,y:u.y};}),original);
    await page.locator('[data-squad-detail-tab="status"]').click();
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    assert.ok(await page.locator('[data-squad-detail-panel="action"]').isVisible());
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:6,y:10}})));
    await page.locator("#moveOk").click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState().units[0].x===6);
    const moved=await page.evaluate(()=>{const u=window.getV39ActiveFactionState().units[0];return {x:u.x,y:u.y,ap:u.ap};});
    assert.deepEqual(moved,{x:target.x,y:target.y,ap:100-target.cost});
    assert.ok(await page.locator("#moveConfirm").isHidden());assert.deepEqual(errors,[]);
    console.log(`${width}x${height}: fixed confirmation, scroll, cancel, action tab activation and movement/AP passed`);
    await page.close();
  }
} finally {await browser.close();}
