import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const url=process.env.V39_TEST_URL||"http://127.0.0.1:3022";
mkdirSync("output/web-game/cave-action-context",{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto(url,{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(800);
    await page.locator('[data-squad-detail-tab="action"]').click();
    const report=await page.evaluate(async()=>{
      const check=(ok,message)=>{if(!ok)throw new Error(message);};
      const map=structuredClone(window.__v39FieldRuntime.mapData);delete map.caveEventNpc;
      map.grid=map.grid.map((row,y)=>row.map((_,x)=>y===10&&x>=4&&x<=16?"洞窟":"岩壁"));
      const faction=window.getV39ActiveFactionState(),ids=faction.units.map(unit=>unit.id),world=window.getV39GameState().activeWorldId;
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],neutralVillages:[]});
      const reset=()=>window.updateV39ActiveFactionState({
        units:window.getV39ActiveFactionState().units.map((unit,index)=>({...unit,x:10-index,y:10,worldId:world,movementHold:false,waitTurnNumber:0,ap:100,currentAp:100,actionPoint:100})),
        squads:[{...faction.squads[0],unitIds:ids,movementLeaderId:ids[0],formationType:"column"}],selectedUnitId:ids[0]
      });reset();await window.waitForV39MapRenderSettled();
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.id===ids[2]?{...unit,movementHold:true,ap:0,currentAp:0,actionPoint:0}:unit)});
      window.refreshV39SquadDerivedUI();
      check(document.getElementById("mobileMoveRemain").textContent==="残AP 100","held unit excluded from displayed movement AP");
      check(window.startV39SelectedUnitMove(),"held zero-AP unit does not block movement");window.cancelV39SelectedUnitMove();reset();
      window.updateV39ActiveFactionState({selectedUnitId:ids[2]});
      check(window.waitV39SelectedUnit().ok,"normal wait succeeds");
      const waiting=JSON.stringify(window.getV39ActiveFactionState());
      check(!await window.reorderV39CaveParty(-1,ids[2]),"waited character cannot move by reordering");
      check(JSON.stringify(window.getV39ActiveFactionState())===waiting,"rejected reorder atomic");reset();
      check(window.startV39SelectedUnitMove(),"arm before turn");
      await window.advanceV39Turn({skipUnactedFocus:true});
      check(!window.getV39UnitMovePreview(),"enemy/next turn clears movement session");
      check(!window.getV39ActiveFactionState().moveCommandUnitId,"turn clears saved command");
      reset();check(window.startV39SelectedUnitAttack(),"arm attack before turn");
      await window.advanceV39Turn({skipUnactedFocus:true});
      check(!window.getV39AttackSession(),"turn clears stale attack target selection");
      reset();check(window.startV39SelectedUnitMove(),"first click next turn arms");
      window.importV39SaveJson(window.exportV39SaveJson(0));
      await new Promise(resolve=>setTimeout(resolve,600));
      check(!window.getV39UnitMovePreview(),"save load clears stale command");
      check(window.startV39SelectedUnitMove(),"first click after load arms");
      const original=window.getV39GameState({includeWorlds:false}),player=original.players[0];
      const other={...player,id:"context-player-2",label:"参加者2",factionState:{...player.factionState}};
      window.setV39GameState({players:[player,other],activePlayerId:other.id},{reason:"player-turn-switched"});
      check(!window.getV39UnitMovePreview(),"same-turn player switch clears movement");
      const previous=window.getV39GameState({includeWorlds:false}).players.find(row=>row.id===player.id);
      check(!previous.factionState.moveCommandUnitId,"previous player command cleared without touching new player");
      window.setV39GameState({players:[previous],activePlayerId:player.id});reset();
      const token=window.beginV39MapInputLock("context-test");
      const locked=JSON.stringify(window.getV39ActiveFactionState());
      check(!window.waitV39SelectedUnit().ok&&!window.startV39SelectedUnitAttack(),"locked wait/attack rejected");
      check(!window.startV39Survey({x:10,y:10}).ok&&!window.gatherV39SelectedUnit().ok,"locked survey/gather rejected");
      check(JSON.stringify(window.getV39ActiveFactionState())===locked,"input lock preserves state");
      window.endV39MapInputLock(token);reset();
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.id===ids[0]?{...unit,worldId:"surface"}:unit)});
      const before=JSON.stringify(window.getV39ActiveFactionState().units);
      check(!window.startV39SelectedUnitMove()&&!window.startV39SelectedUnitAttack()&&!window.waitV39SelectedUnit().ok,"off-world commands rejected");
      check(!window.inspectV39Survey({x:10,y:10}).available,"off-world survey rejected");
      check(!window.inspectV39CaveGather().hasTarget,"off-world deposits unavailable");
      check(JSON.stringify(window.getV39ActiveFactionState().units)===before,"off-world rejection preserves AP and coordinates");
      reset();return {heldAp:true,waitReorder:true,turn:true,saveLoad:true,playerSwitch:true,inputLock:true,worldIsolation:true};
    });
    await page.screenshot({path:`output/web-game/cave-action-context/${width}-${new URL(url).port}.png`});
    assert.deepEqual(errors,[]);console.log("PASS",width,url,report);await page.close();
  }
}finally{await browser.close();}
