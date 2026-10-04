import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.generateV39TestFieldWithSeed==="function");
  await page.evaluate(()=>window.startV39LocalSession(3,{playMode:"single-test"}));
  const cases=[];
  for(const size of [36,60,100])for(const patternId of ["realistic","archipelago"])for(let seed=0;seed<3;seed++){
    const result=await page.evaluate(({size,patternId,seed})=>{
      const map=window.generateV39TestFieldWithSeed({w:size,h:size,patternId},`resource-placement-${seed}`);
      // 実際の資源配置は初期拠点決定後。開始位置未指定の診断として同じイベントを通す。
      window.dispatchEvent(new CustomEvent("v39:initial-placement-complete",{detail:{mapData:map,settings:{patternId}}}));
      const names=["黒木","特木","銀鉄","青金鋼","赤黒鋼","銀"];
      const sites=Object.values(window.getV39GameState().specialtiesByTile||{});
      const counts=Object.fromEntries(names.map(name=>[name,sites.filter(site=>site.name===name).length]));
      const terrains=map.grid.flat();
      const playerCount=window.getV39GameState().players.filter(player=>player.isPlayer!==false).length;
      return {size,patternId,seed,playerCount,forest:terrains.filter(name=>name==="森").length,mountains:terrains.filter(name=>name==="山岳").length,counts,missing:names.filter(name=>counts[name]<playerCount)};
    },{size,patternId,seed});
    cases.push(result);
    await page.waitForTimeout(30);
  }
  const report={cases,missingMaps:cases.filter(row=>row.missing.length).length,errors};
  writeFileSync("artifacts/special-resource-placement.json",JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.missingMaps,0);
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
