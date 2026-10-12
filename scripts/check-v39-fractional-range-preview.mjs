import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/fractional-range-preview";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(600);
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    const reports=[];
    for (const [name,level,underground] of [["fractional",1,false],["integer",5,false],["cave",1,true]]) {
      await page.evaluate(({level,underground})=>{
        const state=window.getV39GameState(),player=state.players[0],original=player.factionState.units[0];
        const map=window.__v39FieldRuntime.mapData;
        map.grid=map.grid.map(row=>row.map(()=>"洞窟"));map.worldWrapEnabled=false;
        map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.defenseStructures=[];map.isUnderground=underground;
        window.setV39GameState({enemies:[],neutralVillages:[],players:[{...player,factionState:{...player.factionState,
          squads:[],selectedUnitId:original.id,combatRuntime:{},units:[{...original,race:"只人",className:"アーチャー",level,
            x:8,y:10,ap:100,currentAp:100,equipment:[{slot:"武器1",name:"弓"}],testSkillNames:[]}]}}]});
        window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:original.id}}));
        window.refreshV39MapEntities();
        const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
        scene.cameras.main.centerOn(8*62+31,10*56+37);
        window.__rangeDrawCalls=[];
        if (!scene.add.__rangeOriginalGraphics) {
          scene.add.__rangeOriginalGraphics=scene.add.graphics;
          scene.add.graphics=function(...args) {
            const graphics=this.__rangeOriginalGraphics(...args),fill=graphics.fillStyle,line=graphics.lineStyle;
            graphics.fillStyle=function(color,alpha,...rest) {
              if (color===0xf3d84a) window.__rangeDrawCalls.push({type:"fill",alpha});
              return fill.call(this,color,alpha,...rest);
            };
            graphics.lineStyle=function(size,color,alpha,...rest) {
              if (color===0xf3d84a) window.__rangeDrawCalls.push({type:"line",alpha});
              return line.call(this,size,color,alpha,...rest);
            };
            return graphics;
          };
        }
      },{level,underground});
      await page.locator('[data-v39-technique-name="貫通矢"]').click();
      const report=await page.evaluate(()=>({calls:window.__rangeDrawCalls,session:window.getV39AttackSession()}));
      assert.ok(report.session);assert.ok(report.calls.some(call=>call.type==="fill" && call.alpha===0.2));
      if (name==="fractional") {
        assert.ok(report.calls.some(call=>call.type==="fill" && call.alpha===0.1));
        assert.ok(report.calls.some(call=>call.type==="line" && call.alpha===0.475));
      } else assert.ok(report.calls.every(call=>call.alpha===(call.type==="fill"?0.2:0.95)));
      await page.waitForTimeout(150);await page.screenshot({path:`${out}/${width}-${name}.png`});
      reports.push({name,...report});
    }
    assert.deepEqual(errors,[]);writeFileSync(`${out}/${width}.json`,JSON.stringify(reports,null,2));
    console.log(`${width}: fractional range fill/outline half-opacity; integer and cave range normal`);
    await page.close();
  }
} finally {await browser.close();}
