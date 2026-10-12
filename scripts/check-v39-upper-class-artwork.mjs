import assert from "node:assert/strict";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3022", {waitUntil:"networkidle"});
  const cases = await page.evaluate(async () => {
    const {resolveFactionUnitSheetFrame, resolveUnitBaseArtworkClass} = await import("/src/lib/unit-sheet-artwork.js");
    return ["只人", "ビーストマン", "デヴィル"].map(race => {
      const base = resolveFactionUnitSheetFrame({race, className:"ファイター"});
      const upper = resolveFactionUnitSheetFrame({race, className:"ウォーリアー"});
      const explicit = resolveFactionUnitSheetFrame({race, className:"ウォーリアー", 画像番号:9});
      return {race, base, upper, explicit, name:resolveUnitBaseArtworkClass({className:"ウォーリアー"})};
    });
  });
  for (const item of cases) {
    assert.equal(item.name, "ファイター");
    assert.ok(item.base, item.race);
    assert.equal(item.upper.src, item.base.src);
    assert.equal(item.upper.sheetIndex, item.base.sheetIndex);
    assert.equal(item.explicit.sheetIndex, 8);
  }
  console.log("Upper class artwork matches base class for human/demi/demon; explicit image slot preserved");
} finally {
  await browser.close();
}
