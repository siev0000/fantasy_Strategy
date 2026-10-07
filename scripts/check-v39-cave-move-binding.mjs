import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const url=process.env.V39_TEST_URL||"http://127.0.0.1:3022";
const output="output/web-game/cave-move-binding";
mkdirSync(output,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto(url,{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(800);
    const ids=await page.evaluate(async()=>{
      const map=structuredClone(window.__v39FieldRuntime.mapData);delete map.caveEventNpc;
      map.grid=map.grid.map((row,y)=>row.map((_,x)=>y===10&&x>=4&&x<=16?"洞窟":"岩壁"));
      const faction=window.getV39ActiveFactionState(),ids=faction.units.map(unit=>unit.id);
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],neutralVillages:[]});
      window.updateV39ActiveFactionState({
        units:faction.units.map((unit,index)=>({...unit,x:10-index,y:10,ap:100,currentAp:100,actionPoint:100,movementHold:false})),
        squads:[{...faction.squads[0],unitIds:ids,movementLeaderId:ids[0],formationType:"column"}],selectedUnitId:ids[0]
      });
      await window.waitForV39MapRenderSettled();return ids;
    });
    await page.locator('[data-squad-detail-tab="action"]').click();
    for(const reordered of [false,true]){
      if(reordered){
        await page.locator(`#squadMemberList [data-v39-unit-id="${ids[2]}"]`).click({button:"right"});
        await page.getByRole("button",{name:"隊列を前へ",exact:true}).click();
        await page.waitForFunction(()=>!window.isV39MapInputLocked());
      }
      await page.locator("#mobileBattleMove").click();
      await page.waitForFunction(()=>window.getV39UnitMovePreview()?.reachable.length>1);
      const visible=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(child=>child.type==="Graphics"&&child.depth===9&&child.visible&&child.commandBuffer.length>0));
      assert.equal(visible,true,"movement range actually drawn");
      if(reordered){
        await page.screenshot({path:`${output}/${width}-${new URL(url).port}-range.png`});
        await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}})));
        await page.locator("#moveOk").click();
        await page.waitForFunction(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==="cave-party-0").x===11);
      }else{
        await page.locator("#mobileBattleMove").click();
        assert.equal(await page.evaluate(()=>window.getV39UnitMovePreview()),null,"second click cancels");
      }
    }
    assert.deepEqual(errors,[]);
    console.log("PASS",width,url,"real button before/after reorder, range, cancel, confirmed movement");
    await page.close();
  }
}finally{await browser.close();}
