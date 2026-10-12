import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/cave-regeneration";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    const before=await page.evaluate(()=>JSON.stringify(window.getV39GameState()));
    await page.locator("[data-v39-cave-test]").click();
    const dialog=page.getByRole("dialog",{name:"洞窟生成テスト"});
    await dialog.locator("svg").waitFor();
    const snapshot=()=>dialog.evaluate(root=>({
      seed:root.querySelector('[aria-label="洞窟シード"]').value,
      grid:[...root.querySelectorAll("[data-cave-tile]")].map(tile=>tile.dataset.terrain).join("|"),
      enemies:[...root.querySelectorAll("[data-cave-enemy]")].map(enemy=>({
        title:enemy.querySelector("title").textContent,
        x:enemy.querySelector("circle").getAttribute("cx"),y:enemy.querySelector("circle").getAttribute("cy")
      }))
    }));
    let previous=await snapshot();
    for (let i=0;i<3;i++) {
      await dialog.getByRole("button",{name:"ランダム生成",exact:true}).click();
      const current=await snapshot();
      assert.notEqual(current.seed,previous.seed);assert.notEqual(current.grid,previous.grid);
      assert.ok(current.enemies.length>0);previous=current;
    }
    await dialog.getByRole("button",{name:"同じシードで生成",exact:true}).click();
    assert.deepEqual(await snapshot(),previous);
    await dialog.getByLabel("形状").selectOption("branch");
    await dialog.getByLabel("洞窟シード").fill("cave-reproduction-test");
    await dialog.getByRole("button",{name:"同じシードで生成",exact:true}).click();
    const fixed=await snapshot();
    await dialog.getByRole("button",{name:"同じシードで生成",exact:true}).click();
    assert.deepEqual(await snapshot(),fixed);
    await dialog.getByLabel("洞窟シード").fill("");
    assert.ok(await dialog.getByRole("button",{name:"同じシードで生成",exact:true}).isDisabled());
    await dialog.getByRole("button",{name:"ランダム生成",exact:true}).click();
    assert.notEqual((await snapshot()).grid,fixed.grid);
    await page.screenshot({path:`${out}/${width}.png`});
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState())),before);
    await dialog.getByRole("button",{name:"開始画面に戻る"}).click();
    await page.locator("[data-v39-cave-test]").click();
    await dialog.locator("svg").waitFor();
    assert.notEqual((await snapshot()).seed,fixed.seed);
    assert.deepEqual(errors,[]);
    console.log(`${width}: fresh maps on random generation, fixed-seed map/enemies reproducible, fixed template rerolls, main game unchanged`);
    await page.close();
  }
} finally {await browser.close();}
