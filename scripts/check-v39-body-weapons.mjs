import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.applyV39DerivedCharacterData === "function");
  const report = await page.evaluate(async () => {
    const body = await import("/src/lib/v39-body-weapon-rules.js");
    const combat = await import("/src/lib/v39-combat-engine.js");
    const max = body.deriveV39BodyWeaponLevels([{ 爪:100, 牙:80 }, { 爪:155, 牙:20 }]);
    const unit = window.applyV39DerivedCharacterData({ race:"ウルフ", className:"ウルフ", level:15 });
    const rows = combat.resolveAttackRows(unit);
    const claw = rows.find(row => row.名前 === "爪");
    const grown = body.resolveV39BodyWeaponAttackRows({ bodyWeaponLevels:{ 爪:50 } })[0];
    const counter = combat.resolveCounterAttackRow({ ...unit, lastUsedAttack:"爪" });
    const strong = window.applyV39DerivedCharacterData({ race:"ウルフ", className:"ウルフ", level:25,
      strongAnimalClassName:"エヴォリューション・クロー", strongAnimalClassLevel:10 });
    const extraRow = window.getGameDataRows("クラス").find(row => row.名前 === "エヴォリューション・クロー");
    return {
      max, multipliers:[1,10,10.1,35,40,50,60].map(level => body.resolveV39BodyWeaponMultiplier(level)),
      rows:rows.filter(row => row.身体武器), clawCount:rows.filter(row => row.名前 === "爪").length,
      ap:combat.resolveAttackApCost(claw, unit), hits:claw.攻撃回数, grownPower:grown.物理,
      counter:counter.身体武器, strongClaw:strong.bodyWeaponLevels.爪,
      expectedStrongClaw:Math.max(50, Number(extraRow.爪)) / 10,
      empty:body.resolveV39BodyWeaponAttackRows({ bodyWeaponLevels:{ 爪:0, 装甲:50 } }).length
    };
  });
  assert.equal(report.max.爪, 15.5);
  assert.equal(report.max.牙, 8);
  assert.equal(report.multipliers[0], 1);
  assert.ok(report.multipliers[2] > report.multipliers[1]);
  assert.deepEqual(report.multipliers.slice(3), [2,2.5,3.5,3.5]);
  assert.equal(report.clawCount, 1);
  assert.equal(report.ap, 40);
  assert.equal(report.hits, 2);
  assert.equal(report.grownPower, 52.5);
  assert.equal(report.counter, true);
  assert.equal(report.strongClaw, report.expectedStrongClaw);
  assert.equal(report.empty, 0);
  await page.evaluate(() => {
    window.startV39LocalSession(1, { playMode:"single-test" });
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({ w:36, h:36, patternId:"realistic" }, "body-weapons");
    const state = window.getV39GameState();
    const player = state.players[0];
    const unit = window.applyV39DerivedCharacterData({ ...player.factionState.units[0],
      race:"ウルフ", className:"ウルフ", name:"身体武器テスト", level:15, squadId:"solo" });
    window.setV39GameState({ players:[{ ...player, factionState:{ ...player.factionState,
      villagePlacementMode:false, units:[unit], squads:[], selectedUnitId:unit.id } }] });
    window.activateV39FooterTab("squad");
    window.refreshV39SquadDerivedUI();
  });
  await page.addStyleTag({ content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}" });
  await page.locator('[data-squad-detail-tab="action"]').click();
  const card = page.locator('#detailTechniqueRows [data-v39-attack-name="爪"]');
  assert.equal(await card.count(), 1);
  await card.click();
  assert.ok((await card.innerText()).includes("身体武器Lv5"));
  assert.ok((await card.innerText()).includes("AP 40"));
  await page.waitForTimeout(200);
  assert.deepEqual(errors, []);
  await page.screenshot({ path:"output/web-game/v39-body-weapons.png" });
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
