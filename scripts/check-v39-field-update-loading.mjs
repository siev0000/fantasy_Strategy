import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
import { mkdirSync } from "node:fs";

const browser=await chromium.launch(), page=await browser.newPage({viewport:{width:390,height:844}}), errors=[];
page.on("pageerror", error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.waitForTimeout(700);
  const results=await page.evaluate(async()=>{
    const check=(value,message)=>{if(!value)throw new Error(message);};
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    const graphics=scene.v39TerrainGraphics, clear=graphics.clear;
    let terrainDraws=0, changes=0, painted=false;
    graphics.clear=function(...args){terrainDraws++;return clear.apply(this,args);};
    const onChange=event=>{
      if(!event.detail.changedKeys?.includes("testMode"))return;
      changes++;
      check(painted,"loader has a paint opportunity before synchronous update");
      check(!!document.getElementById("v39-field-update-loading"),"loader exists during heavy update");
      check(document.getElementById("v39-test-mode").disabled,"test toggle stays disabled through update");
    };
    window.addEventListener("v39:display-settings-changed",onChange);
    requestAnimationFrame(()=>{painted=true;});
    try {
      const target=!window.isV39TestMode();
      const first=window.setV39TestMode(target), duplicate=window.setV39TestMode(target);
      check(first===duplicate,"duplicate updates share completion and do not run twice");
      await first;
      check(changes===1,"single settings change event");
      check(terrainDraws===0,"test mode does not rebuild unchanged terrain");
      check(window.getV39VisibilityStatus().testMode===target,"Fog reflects test mode");
      check(!window.isV39FieldUpdating()&&!window.isV39MapInputLocked(),"locks released after update");
      check(!document.getElementById("v39-test-mode").disabled,"toggle re-enabled");
      await window.setV39TestMode(!target);
      check(window.getV39VisibilityStatus().testMode===!target,"reverse toggle updates Fog");
      return {changes,terrainDraws};
    } finally {window.removeEventListener("v39:display-settings-changed",onChange);graphics.clear=clear;}
  });
  await page.evaluate(()=>{
    const control=document.getElementById("v39-height-outline-only");
    control.checked=!control.checked;
    control.dispatchEvent(new Event("change",{bubbles:true}));
    if(!window.isV39FieldUpdating()||!control.disabled)throw new Error("terrain setting loading");
  });
  await page.waitForFunction(()=>!window.isV39FieldUpdating());
  await page.evaluate(()=>document.getElementById("v39-display-settings-reset").click());
  await page.waitForFunction(()=>!window.isV39FieldUpdating());
  assert.equal(await page.evaluate(()=>window.getV39DisplaySettings().heightOutlineOnly),true);
  // 共通APIの非同期処理でも、フィールドだけ覆い、完了まで保持する。
  await page.evaluate(async()=>{
    const {runV39FieldUpdate}=await import("/src/v39/ui/v39-field-update-loading.js");
    window.loadingTest=runV39FieldUpdate(()=>new Promise(resolve=>{window.finishLoadingTest=resolve;}));
  });
  await page.waitForFunction(()=>!!window.finishLoadingTest);
  const overlay=await page.locator("#v39-field-update-loading").boundingBox();
  const field=await page.locator(".playfield").boundingBox(), footer=await page.locator(".footer").boundingBox();
  assert.ok(Math.abs(overlay.height-field.height)<2 && overlay.y+overlay.height<=footer.y+2,"overlay only covers field");
  mkdirSync("output/web-game/field-update-loading",{recursive:true});
  await page.screenshot({path:"output/web-game/field-update-loading/mobile-loading.png"});
  await page.evaluate(async()=>{window.finishLoadingTest();await window.loadingTest;});
  assert.equal(await page.locator("#v39-field-update-loading").count(),0);
  await page.evaluate(async()=>{
    const {runV39FieldUpdate}=await import("/src/v39/ui/v39-field-update-loading.js");
    try {await runV39FieldUpdate(()=>{throw new Error("fixture");});throw new Error("missing rejection");}
    catch(error){if(error.message!=="fixture")throw error;}
    if(window.isV39FieldUpdating()||window.isV39MapInputLocked()||document.getElementById("v39-field-update-loading"))throw new Error("failure cleanup");
  });
  assert.deepEqual(errors,[]);
  console.log("PASS field update loader, duplicate prevention, Fog, terrain skip, failure cleanup",results);
} finally {await browser.close();}
