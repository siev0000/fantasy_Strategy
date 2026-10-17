import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/research-flow";mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390,320]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack));
    const inspect = async id => {
      if (await page.locator('[data-research-back]').isVisible()) await page.locator('[data-research-back]').click();
      await page.locator('.v39-research-board').waitFor({state:'visible'});
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      // モーダルの再配置中でも、指定した項目の選択ハンドラを確実に検証する。
      await page.locator(`[data-research-item="${id}"]`).evaluate(button=>button.click());
      await page.waitForFunction(name=>document.querySelector('.v39-research-detail-head b')?.textContent===name,id.split(':').at(-1));
    };
    await page.goto(process.env.V39_TEST_URL || "http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.evaluate(()=>{window.updateV39ActiveFactionState({research:{}},{reason:"flow-fixture"});window.openV39Research("鍛冶Lv");});
    assert.equal(await page.locator("[data-research-category]").count(),6);
    assert.equal(await page.locator(".v39-research-level").count(),4);
    assert.equal(await page.locator(".v39-research-flow").count(),0);
    await page.screenshot({path:`${out}/${width}-legacy.png`});
    await page.locator("[data-research-view]").selectOption("flow");
    assert.equal(await page.locator(".v39-research-node").first().evaluate(node=>getComputedStyle(node).position),"absolute");
    await inspect("鍛冶Lv:2:製作効率Ⅰ");
    const scrollBefore=await page.locator(".v39-research-board").evaluate(board=>board.scrollLeft);
    await inspect("鍛冶Lv:2:製作効率Ⅰ");
    assert.equal(await page.locator(".v39-research-board").evaluate(board=>board.scrollLeft),scrollBefore);
    await page.screenshot({path:`${out}/${width}-compact-locked.png`});
    assert.equal(await page.locator("[data-select-research]").isDisabled(),true,await page.locator(".v39-research-detail-head").innerText());
    assert.match(await page.locator(".v39-research-requirement").innerText(),/武器製造効率Ⅰ.*未完了/);
    await inspect("鍛冶Lv:1:武器製造効率Ⅰ");
    await page.locator("[data-select-research]").click();
    await page.evaluate(()=>window.addV39ResearchExperience("鍛冶Lv",100));
    await inspect("鍛冶Lv:2:製作効率Ⅰ");
    assert.equal(await page.locator("[data-select-research]").isEnabled(),true);
    await page.locator("[data-select-research]").click();
    await page.locator('.v39-research-efficiency > summary').click();
    const retained=await page.evaluate(()=>{
      const select=document.querySelector('[data-research-assignee]'),board=document.querySelector('.v39-research-board'),item=document.querySelector('[data-research-item="鍛冶Lv:2:製作効率Ⅰ"]');select.focus();
      for(let i=0;i<10;i++)window.dispatchEvent(new CustomEvent('v39:game-state-changed'));
      const unchanged=select===document.querySelector('[data-research-assignee]')&&board===document.querySelector('.v39-research-board')&&item===document.querySelector('[data-research-item="鍛冶Lv:2:製作効率Ⅰ"]')&&document.activeElement===select;
      window.addV39ResearchExperience('鍛冶Lv',7);
      return {unchanged,changed:select===document.querySelector('[data-research-assignee]')&&document.activeElement===select,expanded:document.querySelector('.v39-research-efficiency').open,
        exp:window.getV39ResearchState().progress.targetExpMap['鍛冶Lv:2:製作効率Ⅰ']};
    });
    assert(retained.unchanged&&retained.changed&&retained.expanded,'updates retain research inputs, board, cards and open explanation');assert.equal(retained.exp,7);
    await page.evaluate(()=>{window.addV39ResearchExperience("鍛冶Lv",30);window.importV39SaveJson(window.exportV39SaveJson());window.openV39Research("鍛冶Lv");});
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().research.progress.targetExpMap["鍛冶Lv:2:製作効率Ⅰ"]),37);
    await page.locator("[data-research-view]").selectOption("list");
    assert.equal(await page.locator(".v39-research-level").count(),4);
    assert.match(await page.locator('[data-research-item="鍛冶Lv:2:製作効率Ⅰ"]').innerText(),/研究中.*37\/200/);
    await page.screenshot({path:`${out}/${width}-legacy-progress.png`});
    await page.locator("[data-research-view]").selectOption("flow");
    if (await page.locator('[data-research-back]').isVisible()) await page.locator('[data-research-back]').click();
    assert.equal(await page.locator('.v39-research-board').evaluate(board => board.scrollWidth <= board.clientWidth + 1),true);
    await page.screenshot({path:`${out}/${width}-forge.png`});
    await page.locator('[data-research-category="魔法Lv"]').evaluate(button=>button.click());
    await page.screenshot({path:`${out}/${width}-magic.png`});
    await inspect('魔法Lv:2:建築補助魔術Ⅰ');
    assert.equal(await page.locator('[data-select-research]').isDisabled(),true);
    const actionRect=await page.locator('[data-select-research]').boundingBox();
    assert.ok(actionRect.y+actionRect.height <= 844);
    await page.screenshot({path:`${out}/${width}-magic-detail.png`});
    if (await page.locator('[data-research-back]').isVisible()) await page.locator('[data-research-back]').click();
    await page.locator('[data-research-category="調査Lv"]').evaluate(button=>button.click());
    await page.waitForFunction(()=>document.querySelector('[data-research-category="調査Lv"]')?.getAttribute('aria-pressed')==='true');
    assert.equal(await page.locator("[data-research-item]").count(),7);
    assert.equal(await page.locator("[data-research-edge]").count(),4);
    const diagramWidth = await page.locator('.v39-research-flow').evaluate(flow=>flow.clientWidth);
    await page.locator('#researchModal [data-close]').click();
    await page.evaluate(()=>window.openV39Research('調査Lv'));
    assert.equal(await page.locator('.v39-research-flow').evaluate(flow=>flow.clientWidth),diagramWidth);
    await page.screenshot({path:`${out}/${width}-survey.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}px: six categories, locked details, single-branch unlock, progress save and chart edges passed`);
    await page.close();
  }
} finally {await browser.close();}
