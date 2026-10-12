import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/range-display";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    const weaponName=await page.evaluate(async()=>{
      await window.setV39TestMode(true);
      const state=window.getV39GameState(),player=state.players[0];
      const skills=[...[0,15,100].map(range=>({名前:`射程確認${range}`,行動:"A",攻撃手段:"魔法",射程:range,物理:10,AP消費:1,テスト専用:true})),
        {名前:"武器射程継承",行動:"A",攻撃手段:"武器",物理:10,AP消費:1,テスト専用:true}];
      window.getGameDataTable("テストスキル").push(...skills);
      const weapon=player.factionState.units[0].equipment.find(item=>item.slot==="武器1");
      window.getGameDataRows("装備").find(row=>row.装備名===weapon.name).射程=25;
      const unit={...player.factionState.units[0],testSkillNames:skills.map(row=>row.名前),
        equipment:[weapon]};
      window.setV39GameState({players:[{...player,factionState:{...player.factionState,units:[unit],squads:[],selectedUnitId:unit.id}}]});
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
      return weapon.name;
    });
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    for (const underground of [true,false]) {
      await page.evaluate(value=>{
        window.__v39FieldRuntime.mapData.isUnderground=value;
        window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:window.getV39ActiveFactionState().selectedUnitId}}));
      },underground);
      for (const [name,value] of [["射程確認0",0],["射程確認15",15],["射程確認100",100],[weaponName,25],["武器射程継承",25]]) {
        assert.equal((await page.locator(`[data-v39-technique-name="${name}"] .technique-range`).textContent()).trim(),`射 ${value}`);
      }
    }
    await page.locator('[data-v39-technique-name="射程確認15"]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}: raw range 0/15/100, weapon 25 and inherited range preserved on surface/cave`);
    await page.close();
  }
} finally {await browser.close();}
