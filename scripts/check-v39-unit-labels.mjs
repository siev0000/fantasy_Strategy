import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch(),errors=[];
mkdirSync("output/web-game/unit-labels",{recursive:true});
try {
  for(const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    const original=await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState();
      const selected=window.getV39SelectedSquadUnit().id;
      window.updateV39ActiveFactionState({units:faction.units.map((unit,i)=>i===0?{...unit,name:"名前が長いユニットでも最後まで読めることを確認する探索者"}:unit)});
      return {selected,order:[...faction.squads[0].unitIds]};
    });
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-squad-detail-tab="status"]').innerText(),"能力");
    const cards=await page.locator(".squad-card[data-v39-unit-id] .squad-pos").allTextContents();
    assert.equal(cards.length,3);
    for(const label of cards)assert.match(label,/^\(\d+,\d+\)$/);
    const levels=await page.locator(".squad-exp-ring .squad-level-number").allTextContents();
    assert.equal(levels.length,3);
    levels.forEach(level=>assert.match(level,/^\d+$/));
    assert.equal(await page.locator(".squad-level-number").first().evaluate(el=>{
      const label=el.getBoundingClientRect(),icon=el.parentElement.getBoundingClientRect();
      return Math.abs(label.x+label.width/2-icon.x-icon.width/2)<1&&Math.abs(label.y+label.height/2-icon.y-icon.height/2)<1;
    }),true);
    assert.equal(await page.locator(".squad-name").first().evaluate(el=>{
      const style=getComputedStyle(el);return style.whiteSpace==="normal"&&style.textOverflow!=="ellipsis"&&el.scrollHeight<=el.clientHeight+1;
    }),true);
    assert.equal(await page.locator("#v39-cave-party-order").count(),0);
    const second=page.locator(`.squad-card[data-v39-unit-id="${original.order[1]}"]`);
    const box=await second.boundingBox();
    await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();
    assert.equal(await page.locator("#v39-cave-party-menu").isVisible(),true);
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),original.selected);
    await page.getByRole("button",{name:"隊列を前へ",exact:true}).click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().squads[0].unitIds[0]),original.order[1]);
    await page.locator(`.squad-card[data-v39-unit-id="${original.order[1]}"]`).click({button:"right"});
    assert.equal(await page.getByRole("button",{name:"隊列を前へ",exact:true}).isDisabled(),true);
    await page.screenshot({path:`output/web-game/unit-labels/menu-${width}.png`});
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#v39-cave-party-menu").isVisible(),false);
    await page.screenshot({path:`output/web-game/unit-labels/${width}.png`});
    await page.locator(".squad-card[data-v39-unit-id]").nth(1).click();
    assert.equal(await page.locator('[data-squad-detail-tab="status"]').innerText(),"能力");
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log("PASS ability, centered level, full names, long press/right click/reorder without selection change, desktop/mobile");
} finally {await browser.close();}
