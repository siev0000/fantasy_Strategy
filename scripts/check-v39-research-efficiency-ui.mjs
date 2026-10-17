import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out = "output/web-game/research-efficiency";
mkdirSync(out, {recursive:true});
const browser = await chromium.launch();
try {
  for (const width of [320,390,1100]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    const errors = [];
    page.on("pageerror", error => errors.push(error.stack));
    await page.goto(process.env.V39_TEST_URL||"http://127.0.0.1:3022", {waitUntil:"networkidle"});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async () => {
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction = window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({
        units:faction.units.map(unit=>({...unit,level:1,Lv:1,skillLevels:{}})),
        research:{}
      },{reason:"research-efficiency-fixture"});
      window.openV39Research("調査Lv");
    });
    const inspect=async id=>{if(width<=760&&await page.locator('[data-research-back]').isVisible())await page.locator('[data-research-back]').click();await page.locator(`[data-research-item="${id}"]`).click();};
    await inspect('地質調査Lv:1:地質調査Ⅰ');
    const select = page.locator("[data-select-research]");
    assert.equal(await select.isEnabled(),true);
    await page.locator('.v39-research-efficiency > summary').click();
    assert.match(await page.locator(".v39-research-efficiency").innerText(),/推奨ユニットLv 5.*解禁条件ではありません/s);
    const preview=Number((await page.locator('.v39-research-assignee small').innerText()).match(/\+([\d.]+)/)[1]);
    assert(preview>=1&&preview<10,'low-Lv researcher proceeds at reduced speed');
    await inspect('地質調査Lv:2:地質調査Ⅱ');
    assert(await select.isDisabled(),'unmet prerequisites prevent starting, not inspecting');
    await inspect('地質調査Lv:1:地質調査Ⅰ');
    await select.click();
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:turn-stage-research")));
    const progress = await page.evaluate(() => {
      const faction=window.getV39ActiveFactionState(), research=faction.research;
      const id=research.selection.調査Lv;
      const exp=research.progress.targetExpMap[id];
      window.importV39SaveJson(window.exportV39SaveJson());
      if(window.getV39ActiveFactionState().research.progress.targetExpMap[id]!==exp)throw new Error("save lost research EXP");
      return exp;
    });
    assert.equal(progress,preview,'preview equals actual research turn');
    await page.evaluate(()=>window.openV39Research("調査Lv"));
    await page.screenshot({path:`${out}/${width}-research.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}px: low-Lv selection, locked prerequisites, preview=turn gain, save passed`);
    await page.close();
  }
} finally { await browser.close(); }
