import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/turn-loading-position";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    // 描画待ちの境界で止め、短いターンでも更新中表示を確実に検証する。
    await page.evaluate(()=>{
      window.__loadingRaf=window.requestAnimationFrame;
      window.__loadingFrames=[];
      window.requestAnimationFrame=callback=>{window.__loadingFrames.push(callback);return 0;};
      window.__loadingTurn=window.advanceV39Turn({skipUnactedFocus:true});
    });
    await page.locator("#v39-turn-loading").waitFor({state:"visible"});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:enemy-ai-progress",{
      detail:{processed:136,total:181,percent:75}
    })));
    assert.match(await page.locator("#v39-turn-loading span").innerText(),/136 \/ 181 \(75%\)/);
    const position=await page.evaluate(()=>{
      const box=document.querySelector("#v39-turn-loading span").getBoundingClientRect();
      const header=document.querySelector(".topbar").getBoundingClientRect();
      return {top:box.top,headerBottom:header.bottom,left:box.left,right:box.right,
        chatLeft:document.getElementById("v39-log-previews").getBoundingClientRect().left,
        busy:document.querySelector(".app").getAttribute("aria-busy"),
        blocksInput:document.elementFromPoint(innerWidth/2,innerHeight-10)?.id==='v39-turn-loading'};
    });
    assert.ok(Math.abs(position.top-position.headerBottom)<1);
    assert.ok(position.left>=0&&position.right<=width);
    assert.ok(position.right<position.chatLeft);
    assert.equal(position.busy,"true");
    assert.equal(position.blocksInput,true);
    await page.screenshot({path:`${out}/${width}.png`});
    await page.evaluate(async()=>{
      window.requestAnimationFrame=window.__loadingRaf;
      window.__loadingFrames.forEach(callback=>window.requestAnimationFrame(callback));
      await window.__loadingTurn;
    });
    assert.equal(await page.locator("#v39-turn-loading").isVisible(),false);
    assert.equal(await page.locator(".app").getAttribute("aria-busy"),"false");
    assert.deepEqual(errors,[]);
    console.log(`${width}: loading flush below header, progress, input lock and completion OK`);
    await page.close();
  }
} finally {await browser.close();}
