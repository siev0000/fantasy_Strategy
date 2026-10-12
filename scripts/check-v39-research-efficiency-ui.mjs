import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out = "output/web-game/research-efficiency";
mkdirSync(out, {recursive:true});
const browser = await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack));
    await page.goto("http://127.0.0.1:3000", {waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.evaluate(() => {
      const faction = window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({
        units:faction.units.map(unit=>({...unit,level:1,Lv:1,skillLevels:{}})),
        research:{}
      },{reason:"research-efficiency-fixture"});
      window.openV39Research("地質調査Lv");
    });
    const select = page.locator("[data-select-research]");
    assert.equal(await select.isEnabled(),true);
    assert.match(await page.locator(".v39-research-requirement").innerText(),/推奨ユニットLv 5.*解禁条件ではありません/s);
    assert.match(await page.locator(".v39-research-assignee small").innerText(),/研究EXP \+2\/T/);
    const locked = page.locator('.v39-research-level.locked [data-research-item]').first();
    assert.equal(await locked.isDisabled(),true);
    await select.click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:turn-stage-research")));
    const progress = await page.evaluate(() => {
      const faction=window.getV39ActiveFactionState(), research=faction.research;
      const id=research.selection.地質調査Lv;
      const exp=research.progress.targetExpMap[id];
      window.importV39SaveJson(window.exportV39SaveJson());
      if(window.getV39ActiveFactionState().research.progress.targetExpMap[id]!==exp)throw new Error("save lost research EXP");
      return exp;
    });
    assert.equal(progress,2);
    await page.evaluate(()=>window.openV39Research("地質調査Lv"));
    await page.screenshot({path:`${out}/${width}-research.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}px: low-Lv selection, locked prerequisites, preview=turn gain, save passed`);
    await page.close();
  }
} finally { await browser.close(); }
