import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.waitForTimeout(700);
  const saved=await page.evaluate(()=>({json:window.exportV39SaveJson(),world:window.getV39GameState().activeWorldId,units:window.getV39ActiveFactionState().units.map(unit=>({id:unit.id,hp:unit.hp}))}));
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  assert.equal(await page.locator("#v39-start-load-section").count(),0);
  const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.locator("[data-v39-start-load]").click()]);
  await chooser.setFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from("bad json")});
  await page.waitForFunction(()=>document.getElementById("v39-start-save-status").textContent.includes("JSONを読み取れませんでした"));
  assert.equal(await page.locator("#v39-play-mode-select").evaluate(el=>el.classList.contains("open")),true);
  await page.locator("#v39-start-save-file").setInputFiles({name:"saved.json",mimeType:"application/json",buffer:Buffer.from(saved.json)});
  await page.waitForFunction(()=>!document.getElementById("v39-play-mode-select").classList.contains("open"));
  const loaded=await page.evaluate(()=>({world:window.getV39GameState().activeWorldId,units:window.getV39ActiveFactionState().units.map(unit=>({id:unit.id,hp:unit.hp}))}));
  assert.deepEqual(loaded,{world:saved.world,units:saved.units});
  assert.equal(await page.locator("#v39-field-settings-modal.open").count(),0);
  assert.deepEqual(errors,[]);
  console.log("PASS start-screen file chooser, invalid retry, saved world/units restored without map setup");
} finally {await browser.close();}
