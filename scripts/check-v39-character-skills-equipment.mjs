import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/character-skills-equipment",{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}), errors=[];
    page.on("pageerror",e=>errors.push(e.stack));
    await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.locator("#squadMemberList .squad-card").first().click();
    const field=await page.locator("#detailTechniqueRows .technique-summary").allTextContents();
    const fieldStyle=await page.locator("#detailTechniqueRows .technique-card").first().evaluate(node=>{
      const s=getComputedStyle(node);return {padding:s.padding,background:s.backgroundImage,font:getComputedStyle(node.querySelector("b")).fontSize};
    });
    const before=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),u=f.units[0];
      return {id:u.id,ap:u.ap,equipment:u.equipment,status:u.status,others:f.units.slice(1).map(u=>u.equipment)};
    });
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator(`[data-v39-character-row="${before.id}"]`).click();
    await page.locator('[data-v39-character-detail-tab="skills"]').click();
    assert.deepEqual(await page.locator("#characterModal .technique-summary").allTextContents(),field);
    const card=page.locator("#characterModal .technique-card").first();
    assert.deepEqual(await card.evaluate(node=>{
      const s=getComputedStyle(node);return {padding:s.padding,background:s.backgroundImage,font:getComputedStyle(node.querySelector("b")).fontSize};
    }),fieldStyle);
    await card.click();assert.equal(await card.getAttribute("aria-expanded"),"true");
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].ap),before.ap);
    assert.equal(await page.locator("#characterModal [data-v39-attack-name]").count(),0);
    await page.screenshot({path:`output/web-game/character-skills-equipment/${width}-skills.png`});
    await page.locator('[data-v39-character-detail-tab="equipment"]').click();
    const item=before.equipment.find(row=>row.slot==="武器1");assert.ok(item);
    const untouched=await page.evaluate(()=>JSON.stringify(window.getV39ActivePlayer()));
    await page.locator('[data-v39-character-equip-open="武器1"]').click();
    assert.equal(await page.locator('#v39-equipment-picker table').count(),1);
    const powerRow=page.locator('#v39-equipment-picker tbody tr').filter({has:page.getByRole('rowheader',{name:'威力',exact:true})});
    assert.equal(await powerRow.locator('td').first().innerText(),String(item.power));
    assert.equal(await powerRow.locator('td').last().innerText(),'—');
    assert.equal(await page.locator('[data-equipment-picker-confirm]').isDisabled(),true);
    await page.screenshot({path:`output/web-game/character-skills-equipment/${width}-current.png`});
    await page.locator('[data-equipment-picker-key="remove"]').click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39ActivePlayer())),untouched);
    await page.locator('#v39-equipment-picker [data-equipment-picker-close]').last().click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39ActivePlayer())),untouched);
    await page.locator('[data-v39-character-equip-open="武器1"]').click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#v39-equipment-picker").evaluate(n=>n.open),false);
    assert.equal(await page.locator("#characterModal").evaluate(n=>n.classList.contains("open")),true);
    await page.locator('[data-v39-character-equip-open="武器1"]').click();
    await page.locator('[data-equipment-picker-key="remove"]').click();
    await page.locator('[data-equipment-picker-confirm]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].equipment.some(i=>i.slot==="武器1")),false);
    await page.locator('[data-v39-character-equip-open="武器1"]').click();
    const candidate=page.locator('#v39-equipment-picker [data-equipment-picker-key]').filter({hasText:item.name}).first();
    const unequipped=await page.evaluate(()=>JSON.stringify(window.getV39ActivePlayer()));
    await candidate.click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39ActivePlayer())),unequipped);
    assert.ok(await page.locator('#v39-equipment-picker table').count());
    assert.equal(await page.locator('#v39-equipment-picker').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    await page.screenshot({path:`output/web-game/character-skills-equipment/${width}-comparison.png`});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:game-state-changed")));
    assert.equal(await page.locator('[data-equipment-picker-confirm]').isDisabled(),true);
    await candidate.click();
    await page.locator('[data-equipment-picker-confirm]').click();
    const after=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),u=f.units[0];return {name:u.equipment.find(i=>i.slot==="武器1")?.name,status:u.status,others:f.units.slice(1).map(u=>u.equipment)};
    });
    assert.equal(after.name,item.name);assert.deepEqual(after.status,before.status);assert.deepEqual(after.others,before.others);
    assert.equal(await page.locator("#characterModal .v39-char-detail-scroll").evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);
    await page.screenshot({path:`output/web-game/character-skills-equipment/${width}-equipment.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: shared skills/style, safe inspection, cave remove/re-equip, stats and other units preserved`);
    await page.close();
  }
  const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
  page.on("pageerror",e=>errors.push(e.stack));
  await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.startV39LocalSession==="function");
  const initial=await page.evaluate(()=>{
    window.closeV39PlayModeSelection?.();
    window.startV39LocalSession(2,{playMode:"single-test"});
    const state=window.getV39GameState(), player=window.getV39ActivePlayer();
    const base=player.factionState.settlements[0] || player.factionState.village || {};
    const settlement={...base,id:"equipment-test-base",settlementId:"equipment-test-base",x:0,y:0,placed:true};
    const {village,...faction}=player.factionState;
    window.setV39GameState({players:state.players.map(row=>row.id===player.id?{...row,factionState:{...faction,settlements:[settlement],selectedSettlementId:settlement.id}}:row)},{reason:"equipment-test"});
    const u=window.getV39ActiveFactionState().units[0];
    return {id:u.id,item:u.equipment.find(i=>i.slot==="武器1"),otherPlayer:JSON.stringify(state.players[1])};
  });
  await page.evaluate(()=>window.openV39CharacterModal());
  await page.locator(`[data-v39-character-row="${initial.id}"]`).click();
  await page.locator('[data-v39-character-detail-tab="equipment"]').click();
  await page.locator('[data-v39-character-equip-open="武器1"]').click();
  await page.locator('[data-equipment-picker-key="remove"]').click();
  await page.locator('[data-equipment-picker-confirm]').click();
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].equipment.some(i=>i.slot==="武器1")),false,await page.locator("#characterModal output").innerText());
  await page.locator('[data-v39-character-equip-open="武器1"]').click();
  await page.locator('#v39-equipment-picker [data-equipment-picker-key]').filter({hasText:initial.item.name}).first().click();
  await page.locator('[data-equipment-picker-confirm]').click();
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].equipment.find(i=>i.slot==="武器1")?.name),initial.item.name);
  assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState().players[1])),initial.otherPlayer);
  const mobId=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.kind==="軍隊" || u.isMob || u.id.endsWith("soldier-a"))?.id);
  if (mobId) {
    await page.locator(`[data-v39-character-row="${mobId}"]`).click();
    await page.locator('[data-v39-character-detail-tab="equipment"]').click();
    assert.equal(await page.locator("#characterModal [data-v39-character-equip-open]:enabled").count(),0);
  }
  assert.deepEqual(errors,[]);console.log("surface: settlement inventory remove/re-equip, other player preserved");
  await page.close();
} finally {await browser.close();}
