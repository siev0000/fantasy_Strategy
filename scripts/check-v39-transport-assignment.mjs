import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1000,height:800}});
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.renderV39SettlementPanel === "function");
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"transport-assignment");
    const state = window.getV39GameState();
    const player = state.players.find(row=>row.id===state.activePlayerId);
    const template = player.factionState.units[0];
    const army = (id,x,y) => ({...template,id,name:id,unitType:"軍隊",isNamed:false,isMob:true,
      x,y,hp:100,currentHp:100,state:"生存",ap:100,currentAp:100,squadId:"transport-test-squad"});
    const units = [army("輸送候補",5,5),army("町の付属マス",6,5),army("拠点外",8,8),
      {...army("死亡軍隊",5,5),hp:0,currentHp:0,state:"死亡"},
      {...army("ヒーロー",5,5),unitType:"ヒーロー",isNamed:true,isMob:false}];
    const settlement = {id:"transport-base",settlementId:"transport-base",placed:true,name:"輸送試験拠点",x:5,y:5,
      population:50,populationByRace:{只人:50},scaleKey:"town",scaleLevel:2,buildings:[],
      territoryResidentialCenterMap:{"5,5":"5,5","6,5":"5,5"},foodStockByType:{穀物:500},materialStockByType:{木材:100}};
    window.setV39GameState({players:state.players.map(row=>row.id!==player.id?row:({...row,
      factionState:{...row.factionState,units,settlements:[settlement],selectedSettlementId:settlement.id,
        selectedUnitId:"ヒーロー",squads:[{id:"transport-test-squad",unitIds:["ヒーロー","輸送候補","町の付属マス"],
          cargo:{resourcesByType:{木材:35},equipmentInventory:[]}}]}})),
      enemies:[],enemyNests:[],neutralVillages:[],territoryOwnerByTile:{"5,5":player.id,"6,5":player.id},
      territoryStateByTile:{"5,5":{settlementId:settlement.id,hp:100},"6,5":{settlementId:settlement.id,hp:100}}});
    window.activateV39FooterTab("settlement");
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator('[data-settlement-fold="transport"] summary').click();
  assert.equal(await page.locator('[data-unit-transport="輸送候補"]').count(),1);
  assert.equal(await page.locator('[data-unit-transport="町の付属マス"]').count(),1);
  for(const name of ["拠点外","死亡軍隊","ヒーロー"]){
    assert.equal(await page.locator(`[data-unit-transport="${name}"]`).count(),0);
  }
  await page.locator('[data-unit-transport="輸送候補"]').click();
  const assigned = await page.evaluate(()=>{
    const state=window.getV39GameState(), faction=state.players.find(row=>row.id===state.activePlayerId).factionState;
    const transport=faction.units.find(row=>row.id==="輸送候補");
    const normal=window.resolveV39SquadMovementGroup(faction,"ヒーロー");
    const individual=window.resolveV39SquadMovementGroup(faction,"輸送候補");
    const saved=JSON.parse(window.exportV39SaveJson());
    const result=window.applyV39SquadMovement(faction,normal,{x:5,y:6},10);
    const moved=result.faction.units.find(row=>row.id==="輸送候補");
    return {assignment:transport.transportAssignment,normal:normal.participantIds,individual:individual.participantIds,
      cargo:faction.squads[0].cargo,movedTransport:{x:moved.x,y:moved.y,ap:moved.ap},
      saved:saved.gameState.players.find(row=>row.id===state.activePlayerId).factionState.units.find(row=>row.id==="輸送候補").transportAssignment};
  });
  assert.equal(assigned.assignment.originSettlementId,"transport-base");
  assert.deepEqual(assigned.saved,assigned.assignment);
  assert.ok(!assigned.normal.includes("輸送候補"));
  assert.deepEqual(assigned.individual,["輸送候補"]);
  assert.equal(assigned.movedTransport.x,5);
  assert.equal(assigned.movedTransport.y,5);
  assert.equal(assigned.movedTransport.ap,100);
  assert.equal(assigned.cargo.resourcesByType.木材,35);
  await page.evaluate(()=>{
    const data=window.exportV39SaveJson(); window.importV39SaveJson(data);
    const state=window.getV39GameState();
    window.setV39GameState({players:state.players.map(player=>player.id!==state.activePlayerId?player:({...player,
      factionState:{...player.factionState,units:player.factionState.units.map(unit=>unit.id!=="輸送候補"?unit:{...unit,x:10,y:10})}}))});
    window.activateV39FooterTab("settlement");
  });
  assert.equal(await page.locator('[data-unit-transport="輸送候補"]').textContent(),"輸送解除");
  await page.locator('[data-settlement-fold="transport"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-transport-assignment.png"});
  await page.setViewportSize({width:440,height:900});
  await page.locator('[data-settlement-fold="transport"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-transport-assignment-mobile.png"});
  await page.locator('[data-unit-transport="輸送候補"]').click();
  const released=await page.evaluate(()=>{
    const state=window.getV39GameState(), faction=state.players.find(row=>row.id===state.activePlayerId).factionState;
    return {assignment:faction.units.find(row=>row.id==="輸送候補").transportAssignment||null,
      participants:window.resolveV39SquadMovementGroup(faction,"ヒーロー").participantIds,cargo:faction.squads[0].cargo};
  });
  assert.equal(released.assignment,null);
  assert.ok(released.participants.includes("輸送候補"));
  assert.equal(released.cargo.resourcesByType.木材,35);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({assigned,released,errors},null,2));
} finally {await browser.close();}
