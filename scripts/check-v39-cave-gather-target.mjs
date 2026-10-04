import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-gather-target",{recursive:true});
const browser=await chromium.launch(),errors=[];
try{
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    await page.locator('[data-squad-detail-tab="action"]').click();
    const point=await page.evaluate(async()=>{
      const {HEX_TILE_CONFIG:c}=await import("/src/lib/phaser-map-panel-config.js");
      const {getHexNeighborCoords}=await import("/src/lib/hex-grid.js");
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit();
      delete map.caveEventNpc;
      const empty=getHexNeighborCoords(map.w,map.h,actor.x,actor.y).find(tile=>!window.getV39ActiveFactionState().units.some(row=>row.x===tile.x&&row.y===tile.y));
      const site={id:"target-gem",key:empty.key,x:empty.x,y:empty.y,name:"宝石",icon:"💎",wall:true,discovered:false,remaining:2};
      map.caveSites=[site];map.grid[site.y][site.x]="岩壁";
      window.dispatchEvent(new CustomEvent("v39:cave-gather-target-changed"));
      if(!document.getElementById("mobileBattleGather").hidden)throw new Error("undiscovered gather must hide");
      window.dispatchEvent(new CustomEvent("v39:visibility-rendered"));
      if(!site.discovered||document.getElementById("mobileBattleGather").hidden)throw new Error("newly discovered gather must show without a tile click");
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main;
      const x=site.x*c.width+(site.y%2?c.oddRowOffsetX:0)+c.width/2,y=site.y*c.rowStep+c.height/2;
      const canvas=scene.game.canvas,rect=canvas.getBoundingClientRect();
      return {x:rect.left+((x-camera.worldView.x)*camera.zoom+camera.x)*rect.width/canvas.width,
        y:rect.top+((y-camera.worldView.y)*camera.zoom+camera.y)*rect.height/canvas.height};
    });
    await page.mouse.click(point.x,point.y);
    assert.equal(await page.evaluate(()=>window.inspectV39CaveGather().site?.id),"target-gem");
    assert.equal(await page.locator("#mobileBattleGather").getAttribute("aria-expanded"),"true","marker opens details");
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().ap),100);
    await page.screenshot({path:`output/web-game/cave-gather-target/${width}.png`});
    await page.locator("#mobileBattleGatherUse").click();
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().ap),70);
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.caveSites[0].remaining),1);
    const checks=await page.evaluate(()=>{
      const actor=window.getV39SelectedSquadUnit(),map=window.__v39FieldRuntime.mapData,site=map.caveSites[0];
      const choose=()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:site.x,y:site.y}}));
      const results=[];
      site.x=actor.x+2;choose();results.push(!window.inspectV39CaveGather().available);
      site.x=actor.x+1;site.discovered=false;choose();results.push(!window.inspectV39CaveGather().site);
      site.discovered=true;site.remaining=0;choose();results.push(!window.inspectV39CaveGather().available);
      site.remaining=1;
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unit:actor}}));
      results.push(!window.inspectV39CaveGather().site);
      results.push(window.getV39SelectedSquadUnit().ap===70);
      return results;
    });
    assert.ok(checks.every(Boolean));
    await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit(),faction=window.getV39ActiveFactionState();
      map.caveSites=[{id:"test-herb",key:`${actor.x},${actor.y}`,x:actor.x,y:actor.y,name:"薬草群生地",icon:"🌿",wall:false,discovered:true,remaining:1,lastUseTurn:0}];
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id===actor.id?{...unit,hp:1,currentHp:1,ap:100,currentAp:100}:unit)});
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:actor.x,y:actor.y}}));
    });
    assert.equal(await page.locator("#mobileBattleGather").isVisible(),false,"no mineral target hides gather");
    const rest=page.locator('[data-v39-cave-site="test-herb"]');
    assert.equal(await rest.getAttribute("aria-expanded"),"true");
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().hp),1,"rest preview does not heal");
    await page.screenshot({path:`output/web-game/cave-gather-target/rest-${width}.png`});
    await rest.locator("button").click();
    assert.ok(await page.evaluate(()=>window.getV39SelectedSquadUnit().hp>1));
    assert.equal(await rest.count(),0,"depleted rest disappears");
    await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit(),faction=window.getV39ActiveFactionState();
      map.caveSites=[{id:"low-ap",key:`${actor.x+1},${actor.y}`,x:actor.x+1,y:actor.y,name:"鉱石",icon:"⛏️",wall:true,discovered:true,remaining:1}];
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id===actor.id?{...unit,ap:0,currentAp:0}:unit)});
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:map.caveSites[0]}));
    });
    assert.equal(await page.locator("#mobileBattleGather").isVisible(),true,"AP shortage retains gather target");
    assert.equal(await page.locator("#mobileBattleGatherUse").isDisabled(),true);
    await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit();
      map.isUnderground=false;map.grid[actor.y][actor.x]="森";
      window.dispatchEvent(new CustomEvent("v39:cave-gather-target-changed"));
    });
    assert.equal(await page.locator("#mobileBattleGather").isVisible(),true);
    assert.ok(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39GatherHint));
    await page.close();
  }
  assert.deepEqual(errors,[]);
  console.log("PASS cave tile selection, selected deposit only, AP, distance/discovery/reserve and selection reset, desktop/mobile");
}finally{await browser.close();}
