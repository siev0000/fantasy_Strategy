import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/compact-notifications";
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
    assert.ok(await page.locator("#v39-side-log").evaluate(el=>el.classList.contains("collapsed")&&el.getBoundingClientRect().height<50&&el.getBoundingClientRect().width<=17));
    await page.evaluate(()=>window.pushV39Notification("未読確認"));
    assert.match(await page.locator("[data-v39-side-channel-label]").textContent(),/\(\d+\)/);
    assert.equal(await page.locator("[data-v39-side-channel-label]").isVisible(),false);
    await page.locator(".v39-side-log-collapse").click();
    assert.ok(await page.locator("#v39-side-log").evaluate(el=>!el.classList.contains("collapsed")&&Math.abs(el.getBoundingClientRect().bottom-el.parentElement.getBoundingClientRect().bottom)<1));
    assert.match(await page.locator("#v39-side-log-list").innerText(),/未読確認/);
    assert.ok(await page.locator("#v39-side-log").evaluate(el=>Math.abs(el.getBoundingClientRect().width-Math.min(innerWidth*.35,220))<3));
    assert.ok(await page.locator(".v39-side-log-head").evaluate(el=>el.getBoundingClientRect().height<=28));
    assert.ok(await page.locator(".v39-side-log-entry").first().evaluate(el=>getComputedStyle(el).padding==='2px'));
    await page.evaluate(()=>{for(let i=0;i<60;i++)window.pushV39Notification(`スクロール確認${i}`);});
    assert.ok(await page.locator("#v39-side-log-list").evaluate(el=>el.scrollHeight>el.clientHeight&&el.scrollHeight-el.clientHeight-el.scrollTop<2));
    await page.locator(".v39-side-log-collapse").click();
    await page.evaluate(()=>{
      for(let i=0;i<5;i++)window.pushV39ChatMessage(`チャット${i}`);
      window.pushV39SideRailMessage({channel:"battle",message:"戦闘確認"});
    });
    assert.equal(await page.locator("#v39-log-previews button").count(),2);
    assert.ok(await page.locator("#v39-battle-preview button").evaluate(el=>getComputedStyle(el).padding==='2px'));
    assert.ok(await page.locator("#v39-battle-preview p").evaluate(el=>parseFloat(getComputedStyle(el).fontSize)<parseFloat(getComputedStyle(document.body).fontSize)));
    assert.ok(await page.locator("#v39-battle-preview button").evaluate(el=>getComputedStyle(el).backgroundColor.endsWith("0.6)")));
    await page.screenshot({path:`${out}/${width}-preview.png`});
    await page.locator("#v39-battle-preview button").click();
    assert.equal(await page.locator("#v39-side-log").getAttribute("data-channel"),"battle");
    assert.equal(await page.locator("#v39-battle-preview button").count(),0);
    await page.screenshot({path:`${out}/${width}-history.png`});
    await page.locator(".v39-side-log-collapse").click();
    const report=await page.evaluate(async()=>{
      await window.setV39TestMode(true);
      const map=window.__v39FieldRuntime.mapData;
      const unit=window.getV39ActiveFactionState().units[0];
      map.defenseStructures=[{id:"detail-field",kind:"結界",x:unit.x,y:unit.y,
        tiles:[{x:unit.x,y:unit.y}],hp:80,maxHp:150,expiresAtTurn:window.getV39GameState().timeline.turnNumber+3}];
      window.refreshV39MapEntities();
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:unit.x,y:unit.y}}));
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const walk=rows=>rows.flatMap(row=>[row,...(row.list?walk(row.list):[])]);
      return {detail:document.getElementById("v39-land-defense").textContent,
        mapText:walk(scene.children.list).filter(row=>row.type==="Text").map(row=>row.text)};
    });
    assert.match(report.detail,/結界 80\/150 ⌛3/);
    assert.ok(!report.mapText.some(text=>/^結界 \d|^盾\d|^障\d/.test(text)));
    await page.evaluate(()=>{
      window.showV39TurnBanner("先のターン通知");
      window.pushV39ChatMessage("間のチャット");
      window.showV39Feedback("最新の通知",{banner:true});
    });
    const popups=await page.locator("#v39-log-previews [data-preview-channel]").evaluateAll(rows=>rows.map(el=>({
      text:el.textContent,rect:{y:el.getBoundingClientRect().y,right:el.getBoundingClientRect().right,bottom:el.getBoundingClientRect().bottom}})));
    assert.equal(popups.length,2);
    const newest=popups.find(row=>row.text.includes("最新の通知")),older=popups.find(row=>row.text.includes("間のチャット"));
    assert.ok(newest.rect.bottom<=older.rect.y&&newest.rect.right<=width&&newest.rect.right>width-10);
    const fieldTop=await page.locator(".playfield").evaluate(el=>el.getBoundingClientRect().top);
    assert.ok(Math.abs(newest.rect.y-fieldTop-34)<1);
    assert.equal(await page.locator("#toast.show,#v39-turn-banner.show").count(),0);
    assert.equal(await page.locator("#v39-log-previews #modeBanner").count(),1);
    await page.screenshot({path:`${out}/${width}.png`});
    await page.waitForTimeout(4200);
    assert.equal(await page.locator("#v39-log-previews [data-preview-channel]").count(),0);
    const before=await page.evaluate(()=>window.getV39GameState().timeline.turnNumber);
    await page.evaluate(async()=>{
      await window.advanceV39Turn({skipUnactedFocus:true});
    });
    assert.ok(await page.evaluate(()=>window.getV39GameState().timeline.turnNumber)>before);
    assert.equal(await page.locator("#toast.show,#v39-turn-banner.show").count(),0);
    assert.deepEqual(errors,[]);
    console.log(`${width}: compact default, unread, history, bounded previews and selected field detail OK`);
    await page.close();
  }
} finally {await browser.close();}
