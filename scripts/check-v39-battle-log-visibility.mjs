import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.waitForTimeout(700);
  const report=await page.evaluate(async()=>{
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const originalVision=window.isV39TileInCurrentVision;
    window.isV39TileInCurrentVision=(x,y)=>x===1&&y===1;
    const emit=(summary,extra={})=>window.dispatchEvent(new CustomEvent("v39:combat-log",{detail:{summary,...extra}}));
    const rows=()=>window.getV39SideRailMessages().filter(row=>row.channel==="battle").map(row=>row.message);
    try {
      await window.setV39TestMode(false);
      emit("visible-target",{target:{x:1,y:1}});
      emit("hidden-target",{target:{x:9,y:9}});
      emit("visible-splash",{target:{x:9,y:9},entries:[{x:1,y:1}]});
      const unit=window.getV39ActiveFactionState().units[0];
      window.isV39TileInCurrentVision=(x,y)=>(x===1&&y===1)||(x===unit.x&&y===unit.y);
      emit("visible-attacker",{attackerId:unit.id,target:{x:9,y:9}});
      window.__v39BackgroundWorldTurn=true;
      try{emit("background-battle",{target:{x:1,y:1}});}finally{window.__v39BackgroundWorldTurn=false;}
      check(rows().length===3&&!rows().includes("hidden-target"),"normal mode only records observed combat for display");
      check(!document.getElementById("v39-battle-preview").textContent.includes("hidden-target"),"unseen combat has no popup");
      await window.setV39TestMode(true);
      check(rows().length===5,"test mode sees all worlds and hidden combat");
      emit("test-only-popup",{target:{x:9,y:9}});
      check(document.getElementById("v39-battle-preview").textContent.includes("test-only-popup"),"test mode previews hidden battle");
      await window.setV39TestMode(false);
      check(rows().length===3,"test mode history hidden when returning to normal");
      check(!document.getElementById("v39-battle-preview").textContent.includes("test-only-popup"),"debug popup removed on OFF");
      const originalState=window.getV39EnemyTurnState;
      try {
        window.getV39EnemyTurnState=()=>({...originalState(),activePlayerId:"other-player"});
        check(rows().length===0,"other player cannot view observed history");
        window.getV39EnemyTurnState=()=>({...originalState(),activeWorldId:"other-world"});
        check(rows().length===0,"other map has separate normal battle display");
      } finally {window.getV39EnemyTurnState=originalState;}
      return {normal:rows(),testCount:6};
    } finally {window.isV39TileInCurrentVision=originalVision;}
  });
  await page.locator('[data-v39-side-channel-switch]').click();
  assert.ok(await page.locator('#v39-side-log-list').innerText().then(text=>text.includes("visible-target")&&!text.includes("hidden-target")));
  mkdirSync("output/web-game/battle-log-visibility",{recursive:true});
  await page.screenshot({path:"output/web-game/battle-log-visibility/normal.png"});
  assert.deepEqual(errors,[]);
  console.log("PASS battle log / popup vision, test mode, player and world scope",report);
} finally {await browser.close();}
