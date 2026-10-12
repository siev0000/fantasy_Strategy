import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/terrain-passives";mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    const report=await page.evaluate(()=>{
      const fighter=window.getGameDataRows("クラス").find(row=>row.名前==="ファイター");
      fighter.Skill1="森との同化";
      const faction=window.getV39ActiveFactionState();
      const unit=window.applyV39DerivedCharacterData({...faction.units[0],race:"只人",className:"ファイター",level:1});
      unit.hp=unit.maxHp;unit.currentHp=unit.maxHp;
      const map=window.__v39FieldRuntime.mapData;
      map.grid[unit.y][unit.x]="森";
      if(map.specialMap?.[unit.y]) map.specialMap[unit.y][unit.x]="";
      window.updateV39ActiveFactionState({units:[unit],squads:[],selectedUnitId:unit.id});
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
      return window.applyV39TerrainModifiers(window.getV39ActiveFactionState().units[0],map).skillLevels;
    });
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="status"]').click();
    for (const key of ["索敵","隠密"]) {
      const row=page.locator("#detailProficiencyList .proficiency-item").filter({has:page.locator("span",{hasText:key})});
      assert.equal(Number(await row.locator("b").textContent()),report[key]);
    }
    await page.screenshot({path:`${out}/${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(`${width}: forest passive skill values shown in ability UI; no browser errors`);
    await page.close();
  }
}finally{await browser.close();}
