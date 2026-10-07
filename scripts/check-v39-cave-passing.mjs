import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-passing",{recursive:true});
const browser=await chromium.launch(),errors=[];
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();await page.waitForTimeout(800);
    const report=await page.evaluate(async()=>{
      const rules=await import("/src/lib/v39-squad-movement-rules.js"),hex=await import("/src/lib/hex-grid.js");
      const occupancy=await import("/src/lib/v39-movement-occupancy-rules.js");
      const check=(ok,message)=>{if(!ok)throw new Error(message);};
      const map=structuredClone(window.__v39FieldRuntime.mapData);delete map.caveEventNpc;
      map.grid=map.grid.map(row=>row.map(()=>"岩壁"));
      for(let x=2;x<=15;x++)map.grid[10][x]="洞窟";
      const initial=window.getV39ActiveFactionState(),ids=initial.units.map(unit=>unit.id);
      const units=initial.units.map((unit,index)=>({...unit,x:8-index,y:10,ap:1000,currentAp:1000,maxAp:1000,movementHold:false}));
      const orders=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
      let cases=0;
      for(const order of orders)for(const direction of [-1,1])for(const formationType of ["column","front-two"]) {
        const squad={...initial.squads[0],unitIds:order.map(index=>ids[index]),movementLeaderId:ids[order[0]],formationType};
        const faction={...initial,units,squads:[squad]},group=rules.resolveV39SquadMovementGroup(faction,ids[0],{caveFormation:true});
        let positions=group.positions;
        for(let step=0;step<3;step++) {
          const next=rules.advanceV39CaveFormation(map,positions,{x:positions[0].x+direction,y:10},group);
          check(!!next,`reordered corridor ${order}/${direction}/${formationType}/${step}`);
          check(new Set(next.map(tile=>`${tile.x},${tile.y}`)).size===3,"no final overlap");
          check(next.every((tile,index)=>tile.y===10&&hex.getHexDistance(tile,positions[index])<=1),"column, no warp");
          positions=next;
        }
        cases++;
      }
      const swapped={...initial,units,squads:[{...initial.squads[0],unitIds:[ids[2],ids[0],ids[1]],movementLeaderId:ids[2],formationType:"front-two"}],selectedUnitId:ids[0]};
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],neutralVillages:[]});window.updateV39ActiveFactionState(swapped);
      await window.waitForV39MapRenderSettled();
      check(window.startV39SelectedUnitMove(),"native reordered movement available");
      check(window.getV39UnitMovePreview().reachable.some(row=>row.key==="9,10"),"native reordered route");
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:9,y:10}}));document.getElementById("moveOk").click();
      await new Promise(resolve=>setTimeout(resolve,1800));
      check(window.getV39ActiveFactionState().units.find(unit=>unit.id===ids[2]).x===9,"native reordered leader arrived");
      const actor={...units[0],x:6},friend={...units[1],x:8,movementHold:true};
      const fixture={...initial,units:[actor,friend],squads:[{...initial.squads[0],unitIds:[actor.id],movementLeaderId:actor.id,formationType:"column"}],selectedUnitId:actor.id};
      window.updateV39ActiveFactionState(fixture);await window.waitForV39MapRenderSettled();
      check(window.startV39SelectedUnitMove(),"own friendly passage available");
      let preview=window.getV39UnitMovePreview();
      check(preview.reachable.some(row=>row.key==="10,10")&&!preview.reachable.some(row=>row.key==="8,10"),"pass but not stop on friend");
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:10,y:10}}));document.getElementById("moveOk").click();
      await new Promise(resolve=>setTimeout(resolve,1800));
      const moved=window.getV39ActiveFactionState();
      check(moved.units[0].x===10&&moved.units[0].ap<1000,"native crossed friend and paid AP");
      check(moved.units[1].x===8&&moved.units[1].ap===1000&&moved.units[1].movementHold,"stationary friend unchanged");
      const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),allyId="passing-ally";
      const ally={...player,id:allyId,factionState:{...fixture,units:[{...friend,id:"allied-unit"}],squads:[]}};
      const pair=[player.id,allyId].sort().join("|"),expiry=state.timeline.turnNumber+5;
      window.setV39GameState({players:[{...player,factionState:{...fixture,units:[actor]}},ally],diplomacyRelations:{[pair]:{treaties:{alliance:{active:true,expiresAtTurn:expiry}}}}});
      await window.waitForV39MapRenderSettled();window.startV39SelectedUnitMove();
      preview=window.getV39UnitMovePreview();
      check(preview.reachable.some(row=>row.key==="10,10")&&!preview.reachable.some(row=>row.key==="8,10"),"native allied passage");
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:10,y:10}}));document.getElementById("moveOk").click();
      await new Promise(resolve=>setTimeout(resolve,1800));
      check(window.getV39ActiveFactionState().units[0].x===10,"native crossed ally");
      check(window.getV39GameState().players.find(row=>row.id===allyId).factionState.units[0].x===8,"ally position unchanged");
      window.updateV39ActiveFactionState({...fixture,units:[actor]});
      const now=window.getV39GameState();
      check(!occupancy.collectV39MovementOccupancy(now,[actor.id],map).blocked.has("8,10"),"active alliance passes");
      check(occupancy.collectV39MovementOccupancy({...now,timeline:{turnNumber:expiry}},[actor.id],map).blocked.has("8,10"),"expired alliance blocks");
      window.setV39GameState({enemies:[{id:"blocking-enemy",x:8,y:10,hp:100}],players:[{...player,factionState:{...fixture,units:[actor]}}]});
      window.startV39SelectedUnitMove();
      check(!window.getV39UnitMovePreview().reachable.some(row=>row.key==="10,10"),"native enemy blocks cave without worldId");
      window.cancelV39SelectedUnitMove();
      return {cases,reordered:true,ownPassing:true,alliedPassing:true,noOverlap:true,enemyBlocked:true};
    });
    await page.screenshot({path:`output/web-game/cave-passing/${width}.png`});
    assert.deepEqual(errors,[]);console.log("PASS",width,report);await page.close();
  }
} finally {await browser.close();}
