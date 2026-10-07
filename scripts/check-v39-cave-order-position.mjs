import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-order-position",{recursive:true});
const browser=await chromium.launch(),errors=[];
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();await page.waitForTimeout(800);
    for(const narrow of [false,true]) {
      const ids=await page.evaluate(async narrow=>{
        const map=structuredClone(window.__v39FieldRuntime.mapData);delete map.caveEventNpc;
        map.grid=map.grid.map((row,y)=>row.map((value,x)=>narrow?(y===10&&x>=4&&x<=16?"洞窟":"岩壁"):(y>=7&&y<=13&&x>=4&&x<=16?"洞窟":"岩壁")));
        const faction=window.getV39ActiveFactionState(),ids=faction.units.map(unit=>unit.id);
        const units=faction.units.map((unit,index)=>({...unit,x:10-index,y:10,movementHold:false,ap:100,currentAp:100}));
        window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
        window.setV39GameState({enemies:[],neutralVillages:[]});
        window.updateV39ActiveFactionState({units,squads:[{...faction.squads[0],unitIds:ids,movementLeaderId:ids[0],formationType:"front-two"}],selectedUnitId:ids[0]});
        await window.waitForV39MapRenderSettled();return ids;
      },narrow);
      await page.locator(`#squadMemberList [data-v39-unit-id="${ids[2]}"]`).click({button:"right"});
      await page.getByRole("button",{name:"隊列を前へ",exact:true}).click();
      await page.waitForFunction(()=>!window.isV39MapInputLocked());
      await page.evaluate(async({ids,narrow})=>{
        const check=(ok,message)=>{if(!ok)throw new Error(message);};
        let faction=window.getV39ActiveFactionState();
        check(JSON.stringify(faction.squads[0].unitIds)===JSON.stringify([ids[0],ids[2],ids[1]]),"third moved to second in list");
        check(faction.units.find(unit=>unit.id===ids[2]).x===9&&faction.units.find(unit=>unit.id===ids[1]).x===8,"physical positions exchanged before move");
        check(faction.units.find(unit=>unit.id===ids[0]).ap===100&&faction.units.filter(unit=>unit.id!==ids[0]).every(unit=>unit.ap<100&&unit.ap>0),"only repositioned units pay AP");
        const {resolveV39UnitMovementStepCost}=await import('/src/lib/v39-terrain-traversal.js');
        for(const [index,from,to] of [[1,9,8],[2,8,9]]){
          const unit=faction.units.find(unit=>unit.id===ids[index]);
          check(unit.ap===100-resolveV39UnitMovementStepCost(window.__v39FieldRuntime.mapData,from,10,to,10,unit),"swap charges normal movement cost");
          check(unit.ap===unit.currentAp&&unit.ap===unit.actionPoint,"AP fields synchronized");
        }
        check(faction.selectedUnitId===ids[0]&&!document.getElementById("app")?.inert,"selection and interactive UI restored");
      },{ids,narrow});
      await page.locator('[data-squad-detail-tab="action"]').click();
      await page.locator('#mobileBattleMove').click();
      await page.waitForTimeout(100);
      await page.evaluate(async({ids,narrow})=>{
        const check=(ok,message)=>{if(!ok)throw new Error(message);};
        let faction=window.getV39ActiveFactionState();
        check(!!faction.moveCommandUnitId,"real move button arms command after swap");
        window.cancelV39SelectedUnitMove();
        window.importV39SaveJson(window.exportV39SaveJson(0));await new Promise(resolve=>setTimeout(resolve,700));
        faction=window.getV39ActiveFactionState();check(faction.units.find(unit=>unit.id===ids[2]).x===9,"new positions saved");
        check(window.startV39SelectedUnitMove(),"can move after swap");
        window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}}));document.getElementById("moveOk").click();
        await new Promise(resolve=>setTimeout(resolve,1200));
        faction=window.getV39ActiveFactionState();check(faction.units.find(unit=>unit.id===ids[0]).x===11,"leader moves forward");
        if(narrow)check(faction.units.every(unit=>unit.y===10),"front-two becomes single column");
        check(new Set(faction.units.map(unit=>`${unit.x},${unit.y}`)).size===3,"no stopping overlap");
      },{ids,narrow});
      await page.screenshot({path:`output/web-game/cave-order-position/${width}-${narrow?"narrow":"room"}.png`});
    }
    await page.evaluate(async()=>{
      const faction=window.getV39ActiveFactionState(),order=faction.squads[0].unitIds,heldId=order[2];
      window.toggleV39CaveMovementHold(heldId);
      const before=JSON.stringify(window.getV39ActiveFactionState());
      if(await window.reorderV39CaveParty(-1,heldId))throw new Error("held unit reordered");
      if(JSON.stringify(window.getV39ActiveFactionState())!==before)throw new Error("failed reorder changed state");
      window.toggleV39CaveMovementHold(heldId);
      const map=window.__v39FieldRuntime.mapData;
      window.updateV39ActiveFactionState({units:faction.units.map((unit,index)=>({...unit,x:10-index,y:10,movementHold:false}))});
      map.grid[10][9]="岩壁";
      const blockedBefore=JSON.stringify(window.getV39ActiveFactionState());
      if(await window.reorderV39CaveParty(-1,heldId))throw new Error("wall blocked reorder accepted");
      if(JSON.stringify(window.getV39ActiveFactionState())!==blockedBefore)throw new Error("blocked order changed state");
      if(window.isV39MapInputLocked())throw new Error("failed reorder left input locked");
      map.grid[10][9]="洞窟";
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>({...unit,ap:0,currentAp:0,actionPoint:0}))});
      const lowApBefore=JSON.stringify(window.getV39ActiveFactionState());
      if(await window.reorderV39CaveParty(-1,heldId))throw new Error("AP insufficient reorder accepted");
      if(JSON.stringify(window.getV39ActiveFactionState())!==lowApBefore)throw new Error("insufficient AP changed state");
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>({...unit,ap:100,currentAp:100,actionPoint:100}))});
      window.toggleV39CaveMovementHold(order[0]);
      const held=window.getV39ActiveFactionState().units.find(unit=>unit.id===order[0]);
      if(!await window.setV39CaveMovementLeader(heldId))throw new Error("could not change held leader");
      const afterHeld=window.getV39ActiveFactionState().units.find(unit=>unit.id===order[0]);
      if(afterHeld.x!==held.x||afterHeld.y!==held.y||!afterHeld.movementHold)throw new Error("explicit leader change moved held unit");
    });
    assert.deepEqual(errors,[]);console.log("PASS",width,"physical swap AP, real move button, open/narrow movement, save, AP/hold/wall reject");await page.close();
  }
} finally {await browser.close();}
