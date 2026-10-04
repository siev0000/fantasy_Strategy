import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const browser=await chromium.launch(),errors=[];
try {
  mkdirSync("output/web-game/chat-popup-layout",{recursive:true});
  for(const width of [390,1280]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    await page.locator(".v39-side-log-collapse").click();
    await page.evaluate(()=>{
      for(let i=0;i<5;i++)window.pushV39ChatMessage(`チャット新着${i} / 長いメッセージも右側に縦並びで表示します`,{title:"参加者"});
      const unit=window.getV39ActiveFactionState().units[0];
      window.dispatchEvent(new CustomEvent("v39:combat-log",{detail:{summary:"探索者 / 戦闘新着 / 合計45",attackerName:"探索者",skillName:"斬撃",target:{x:unit.x,y:unit.y},entries:[
        {targetName:"ボア Lv5",total:45,hitResults:[{hit:true,damage:21},{hit:true,damage:24}]},
        {targetName:"ウルフ Lv7",total:0,hitResults:[{hit:false,damage:0}]}
      ]}}));
    });
    const report=await page.evaluate(()=>{
      const chat=document.getElementById("v39-chat-preview"),battle=document.getElementById("v39-battle-preview");
      const c=chat.getBoundingClientRect(),b=battle.getBoundingClientRect(),field=document.querySelector(".playfield").getBoundingClientRect();
      const host=document.getElementById("v39-log-previews").getBoundingClientRect();
      const boxes=[...chat.children].map(el=>el.getBoundingClientRect());
      return {count:chat.children.length,chatRight:Math.abs(field.right-c.right)<12,inField:host.top>=field.top&&host.bottom<=field.bottom,
        separate:b.top>=c.bottom,battleRight:Math.abs(field.right-b.right)<12,ordered:boxes.every((rect,i)=>i===0||rect.top>=boxes[i-1].bottom),escaped:!chat.querySelector("script")};
    });
    assert.deepEqual(report,{count:3,chatRight:true,inField:true,separate:true,battleRight:true,ordered:true,escaped:true});
    assert.equal(await page.locator('#v39-battle-preview p').innerText(),"探索者 / 斬撃\nボア Lv5 45ダメージ (21,24)\nウルフ Lv7 Miss");
    await page.screenshot({path:`output/web-game/chat-popup-layout/${width}.png`});
    await page.locator('#v39-chat-preview button').first().click();
    assert.equal(await page.locator('#v39-side-log').getAttribute('data-channel'),"chat");
    assert.equal(await page.locator('#v39-chat-preview').evaluate(el=>el.classList.contains("show")),false);
    assert.equal(await page.locator('#v39-battle-preview').evaluate(el=>el.classList.contains("show")),true);
    await page.evaluate(()=>window.pushV39ChatMessage("開いた欄へ表示"));
    assert.equal(await page.locator('#v39-chat-preview').evaluate(el=>el.classList.contains("show")),false);
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log("PASS right-side chat stack, battle separation, popup opens chat, mobile/desktop");
} finally {await browser.close();}
