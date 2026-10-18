import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/character-squad-layout";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390,320]) {
    const page=await browser.newPage({viewport:{width,height:844}}), errors=[];
    page.on("pageerror",e=>errors.push(e.stack));
    await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    const original=page.locator("#squadMemberList .squad-card").first();
    await original.click();
    const id=await original.getAttribute("data-v39-unit-id");
    const hp=await original.locator(".v39-card-vital.hp .v39-card-vital-value").innerText();
    const fieldFont=await original.locator(".v39-card-vital-value").first().evaluate(node=>getComputedStyle(node).fontSize);
    const abilityMarkup=await page.locator("#detailAbilitySections").evaluate(node=>node.innerHTML.replace(/ id="[^"]*"/g,""));
    const abilityStyle=await page.locator("#detailAbilitySections .detail-stat").first().evaluate(node=>{
      const style=getComputedStyle(node), value=getComputedStyle(node.querySelector("b"));
      return {padding:style.padding,minHeight:style.minHeight,font:value.fontSize,background:style.backgroundColor};
    });
    assert.equal(abilityStyle.minHeight,'28px');assert.equal(abilityStyle.padding,'2px 6px');
    const skillStyle=await page.locator('#detailAbilitySections .proficiency-item').first().evaluate(node=>{
      const style=getComputedStyle(node);return {minHeight:style.minHeight,padding:style.padding};
    });
    assert.deepEqual(skillStyle,{minHeight:'28px',padding:'2px 6px'});
    await page.evaluate(()=>window.openV39CharacterModal());
    const card=page.locator(`[data-v39-character-row="${id}"]`);
    await card.click();
    assert.equal(await card.locator(".v39-card-vital.hp .v39-card-vital-value").innerText(),hp);
    assert.equal(await card.locator(".v39-card-vital-value").first().evaluate(node=>getComputedStyle(node).fontSize),fieldFont);
    assert.ok(await card.locator(".squad-level-number").count());
    assert.equal(await card.evaluate(node=>node.classList.contains("selected")),true);
    assert.equal(await page.locator("#characterModal .v39-char-detail-scroll").innerHTML(),abilityMarkup);
    assert.deepEqual(await page.locator("#characterModal .detail-stat").first().evaluate(node=>{
      const style=getComputedStyle(node), value=getComputedStyle(node.querySelector("b"));
      return {padding:style.padding,minHeight:style.minHeight,font:value.fontSize,background:style.backgroundColor};
    }),abilityStyle);
    assert.equal(await page.locator('[id="detailAtk"]').count(),1);
    await page.locator("#characterModal .squad-detail-section summary").first().click();
    assert.equal(await page.locator("#characterModal .squad-detail-section").first().evaluate(node=>node.open),false);
    assert.equal(await page.locator("#characterModal .character-layout").evaluate(node=>node.scrollWidth<=node.clientWidth+1),true);
    for (const tab of ["skills","equipment","growth","status"]) {
      await page.locator(`[data-v39-character-detail-tab="${tab}"]`).click();
      assert.equal(await page.locator(`[data-v39-character-detail-tab="${tab}"]`).evaluate(node=>node.classList.contains("active")),true);
    }
    await page.screenshot({path:`${out}/${width}-status.png`});
    await page.locator("[data-v39-character-row]").nth(1).click();
    assert.equal(await page.locator("#characterModal .squad-card.selected").count(),1);
    assert.deepEqual(errors,[]);
    console.log(`${width}: shared ability markup/styles, folding, unique IDs, HP/AP fonts, selection, four tabs and no horizontal overflow passed`);
    await page.close();
  }
} finally {await browser.close();}
