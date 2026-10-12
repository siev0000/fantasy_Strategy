import assert from "node:assert/strict";
import {mkdirSync,readFileSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const skills=JSON.parse(readFileSync("data/source/export/json/テストスキル.json","utf8"));
const out="output/web-game/area-effects";
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
    await page.evaluate(()=>{
      const original=window.playV39MapEffect;
      window.playV39MapEffect=request=>{
        window.__areaRequest=request;
        window.__areaFrame=null;
        window.__areaPlayback=original({...request,totalDurationMs:700,onFrame:frame=>{window.__areaFrame=frame;}});
        return window.__areaPlayback;
      };
      const unit=window.getV39SelectedSquadUnit(),scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      scene.cameras.main.setZoom(1.5).centerOn(unit.x*62+(unit.y%2?31:0)+31,unit.y*56+37);
    });
    let previousDiameter=0;
    for(const count of [3,7,19]) {
      const ok=await page.evaluate(({skills,count})=>{
        const state=window.getV39GameState(),unit=window.getV39SelectedSquadUnit();
        return window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:unit.id,
          target:{x:unit.x,y:unit.y},skillRow:{...skills.find(row=>row.名前===`TEST_結界${count}`),AP消費:0}});
      },{skills,count});
      assert.equal(ok,true);
      await page.waitForFunction(()=>window.__areaFrame);
      const report=await page.evaluate(()=>{
        const tiles=window.__areaRequest.areaTiles;
        const x=tiles.reduce((sum,tile)=>sum+tile.x*62+(tile.y%2?31:0)+31,0)/tiles.length;
        const y=tiles.reduce((sum,tile)=>sum+tile.y*56+37,0)/tiles.length;
        const corners=[[0,-37],[31,-19],[31,19],[0,37],[-31,19],[-31,-19]];
        const radius=Math.max(...tiles.flatMap(tile=>corners.map(([dx,dy])=>Math.hypot(tile.x*62+(tile.y%2?31:0)+31+dx-x,tile.y*56+37+dy-y))));
        return {count:tiles.length,x,y,diameter:radius*2*1.25,frame:window.__areaFrame};
      });
      assert.equal(report.count,count);
      assert.ok(Math.abs(report.frame.x-report.x)<.01&&Math.abs(report.frame.y-report.y)<.01);
      assert.ok(Math.min(report.frame.width,report.frame.height)>=report.diameter-.01);
      assert.ok(report.diameter>previousDiameter);
      previousDiameter=report.diameter;
      if(count===3)await page.screenshot({path:`${out}/${width}-triangle.png`});
      await page.evaluate(()=>window.__areaPlayback);
    }
    assert.deepEqual(errors,[]);
    console.log(`${width}: actual 3/7/19-tile casts centered and sized to whole footprint OK`);
    await page.close();
  }
} finally {await browser.close();}
