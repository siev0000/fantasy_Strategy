import assert from "node:assert/strict";
import { mkdirSync,readFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/hidden-movement",{recursive:true});
const source=readFileSync("frontend/src/lib/v39-movement-occupancy-rules.js","utf8")
  .replace(/^import[^\n]+/,"const getV39DiplomacyRelation=()=>({status:'peace',treaties:{alliance:{active:true,expiresAtTurn:99}}});");
const {collectV39MovementOccupancy}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const occupancyState={activePlayerId:"p1",activeWorldId:"surface",timeline:{turnNumber:1},
  players:[{id:"p1",factionState:{units:[{id:"self",hp:10,x:1,y:1}]}},
    {id:"p2",factionState:{units:[{id:"ally",hp:10,x:2,y:1}]}}],
  enemies:[{id:"hidden",hp:10,x:3,y:1},{id:"visible",hp:10,x:4,y:1},{id:"dead",hp:0,x:5,y:1}]};
const planned=collectV39MovementOccupancy(occupancyState,["self"],null,{isVisible:unit=>unit.id==="visible"});
assert.deepEqual([...planned.blocked],["4,1"]);
assert.deepEqual([...planned.stopBlocked],["2,1","4,1"]);
assert.ok(collectV39MovementOccupancy(occupancyState,["self"]).blocked.has("3,1"));
const browser=await chromium.launch();
try{
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}});
    const errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    async function setup(enemyX){
      await page.evaluate(enemyX=>{
        const state=window.getV39GameState(),player=state.players[0],map=window.__v39FieldRuntime.mapData;
        map.grid=map.grid.map(row=>row.map(()=>"洞窟"));
        map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
        map.specialMap=[];map.reliefMap=[];map.lavaMap=[];map.caveEventNpc=null;
        const unit={...player.factionState.units[0],x:10,y:10,squadId:"solo",movementHold:false,
          hp:100,currentHp:100,ap:100,currentAp:100,actionPoint:100,
          status:{...player.factionState.units[0].status,移動:100,索敵:0},skillLevels:{索敵:0}};
        const enemy={id:"hidden-blocker",name:"隠れた敵",x:enemyX,y:10,worldId:state.activeWorldId,
          hp:100,currentHp:100,status:{隠密:10000},skillLevels:{隠密:10000},隠密:10000};
        window.setV39GameState({enemies:[enemy],neutralVillages:[],players:[{...player,factionState:{...player.factionState,
          units:[unit],squads:[],selectedUnitId:unit.id,villagePlacementMode:false,moveCommandUnitId:"",
          visibility:{...player.factionState.visibility,contactReveals:{}}}}]});
        window.renderV39Visibility();
      },enemyX);
      await page.waitForTimeout(400);
      assert.equal(await page.evaluate(()=>window.isV39EntityDetected("hidden-blocker")),false);
    }
    await setup(11);
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    let reachable=await page.evaluate(()=>window.getV39UnitMovePreview().reachable);
    assert.ok(reachable.some(row=>row.key==="11,10"));
    assert.ok(reachable.some(row=>row.key==="12,10"));
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}}));document.getElementById("moveOk").click();});
    await page.waitForTimeout(500);
    let result=await page.evaluate(()=>({unit:window.getV39ActiveFactionState().units[0],detected:window.isV39EntityDetected("hidden-blocker"),
      visibility:window.getV39ActiveFactionState().visibility,world:window.getV39GameState().activeWorldId,turn:window.getV39GameState().timeline.turnNumber,
      inVision:window.isV39TileInCurrentVision(11,10)}));
    assert.equal(result.unit.x,10);assert.equal(result.unit.ap,100);assert.equal(result.detected,true);
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    reachable=await page.evaluate(()=>window.getV39UnitMovePreview().reachable);
    assert.ok(!reachable.some(row=>row.key==="11,10"));
    await page.evaluate(()=>window.cancelV39SelectedUnitMove());
    await setup(12);
    await page.evaluate(()=>window.startV39SelectedUnitMove());
    reachable=await page.evaluate(()=>window.getV39UnitMovePreview().reachable);
    const stopCost=reachable.find(row=>row.key==="11,10").cost;
    assert.ok(reachable.some(row=>row.key==="12,10"));
    await page.evaluate(()=>{window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:12,y:10}}));document.getElementById("moveOk").click();});
    await page.waitForTimeout(1800);
    result=await page.evaluate(()=>({unit:window.getV39ActiveFactionState().units[0],detected:window.isV39EntityDetected("hidden-blocker"),locked:window.isV39MapInputLocked()}));
    assert.equal(result.unit.x,11);assert.equal(result.unit.y,10);assert.equal(result.unit.ap,100-stopCost);
    assert.equal(result.detected,true);assert.equal(result.locked,false);
    await page.screenshot({path:`output/web-game/hidden-movement/contact-${width}.png`});
    const saved=await page.evaluate(()=>JSON.parse(window.exportV39SaveJson()));
    assert.ok(saved.gameState?.players?.[0]?.factionState?.visibility?.contactReveals?.["hidden-blocker"]
      || JSON.stringify(saved).includes('"contactReveals":{"hidden-blocker"'));
    await page.evaluate(()=>{const state=window.getV39GameState();window.setV39GameState({timeline:{...state.timeline,turnNumber:2}});});
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>window.isV39EntityDetected("hidden-blocker")),false);
    assert.deepEqual(errors,[]);
    console.log(`${width}: hidden destinations/path, adjacent stop, actual-path AP, contact reveal, visible block OK`);
    await page.close();
  }
}finally{await browser.close();}
