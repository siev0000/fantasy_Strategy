import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}});
const errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.deriveV39CharacterFromRaceClass==="function");
  const report=await page.evaluate(()=>{
    const classes=window.getGameDataRows("クラス"),skills=window.getGameDataRows("スキル一覧"),enemies=window.getGameDataRows("出現敵");
    const names=["ビートル","クワガタ","カマキリ","ハチ","アリ","クモ","ムカデ","サソリ"];
    const insects=names.map(name=>{
      const derived=window.deriveV39CharacterFromRaceClass({race:name,className:name,level:5});
      return {name,classPresent:classes.some(row=>row.名前===name),enemyPresent:enemies.some(row=>row.種族===name),ok:derived.ok,hp:derived.status?.HP};
    });
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"spreadsheet-refresh");
    return {classCount:classes.length,skillCount:skills.length,enemyCount:enemies.length,insects};
  });
  assert.equal(report.classCount,180);
  assert.equal(report.skillCount,578);
  assert.equal(report.enemyCount,110);
  assert.ok(report.insects.every(row=>row.classPresent&&row.enemyPresent&&row.ok&&row.hp>0));
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.waitForTimeout(400);
  await page.screenshot({path:"output/web-game/v39-spreadsheet-refresh.png"});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({...report,errors},null,2));
} finally {await browser.close();}
