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
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"auto-transport");
    const state=window.getV39GameState(), player=state.players.find(row=>row.id===state.activePlayerId);
    const unit={...player.factionState.units[0],id:"carrier",name:"輸送軍",unitType:"軍隊",isNamed:false,
      x:3,y:5,hp:100,currentHp:100,state:"生存",ap:100,currentAp:100,maxAp:100,squadId:"test-squad",
      status:{...player.factionState.units[0].status,移動:40,SIZ:170,飛行:0},skillLevels:{},abilities:[],acquiredSkillNames:[]};
    const base=(id,x,wood)=>({id,settlementId:id,name:id,placed:true,x,y:5,population:0,
      populationByRace:{},buildings:[],territoryResidentialCenterMap:{[`${x},5`]:`${x},5`},
      materialStockByType:{木材:wood},foodStockByType:{穀物:500}});
    window.setV39GameState({players:[{...player,factionState:{...player.factionState,units:[unit],
      settlements:[base("出発拠点",3,250),base("搬入拠点",11,0)],selectedSettlementId:"出発拠点",
      squads:[{id:"test-squad",unitIds:[unit.id],cargo:{resourcesByType:{石材:35},equipmentInventory:[]}}]}}],
      enemies:[],enemyNests:[],neutralVillages:[],territoryOwnerByTile:{},territoryStateByTile:{}});
    window.transportEvents=[];
    window.addEventListener("v39:game-state-changed",event=>{
      if(event.detail?.reason!=="automatic-transport")return;
      const state=window.getV39GameState(), unit=state.players[0].factionState.units[0];
      window.transportEvents.push({turn:state.timeline.turnNumber,x:unit.x,y:unit.y,ap:unit.ap});
    });
    const data=window.__v39FieldRuntime.mapData;
    for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++){
      data.grid[y][x]="平地";data.heightLevelMap[y][x]=1;
      if(data.specialMap?.[y])data.specialMap[y][x]="";
      if(data.lavaMap?.[y])data.lavaMap[y][x]=false;
    }
    data.worldWrapEnabled=false;
    window.activateV39FooterTab("settlement");
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator('[data-settlement-fold="transport"] summary').click();
  await page.locator('[data-unit-transport="carrier"]').click();
  await page.locator('[data-transport-destination]').selectOption("搬入拠点");
  await page.locator('[data-transport-resource]').selectOption({label:"木材"});
  await page.locator('[data-transport-route="carrier"]').click();
  const snapshot=()=>page.evaluate(()=>{
    const state=window.getV39GameState(), faction=state.players[0].factionState, unit=faction.units[0];
    return {turn:state.timeline.turnNumber,x:unit.x,y:unit.y,assignment:unit.transportAssignment,
      wood:faction.settlements.map(row=>row.materialStockByType.木材),cargo:faction.squads[0].cargoByUnitId?.carrier,
      shared:faction.squads[0].cargo,selected:faction.selectedSettlementId};
  });
  const step=()=>page.evaluate(()=>window.advanceV39Turn({skipUnactedFocus:true}));
  await step();
  const first=await snapshot();
  assert.deepEqual(first.wood,[150,0]);
  assert.equal(first.cargo.resourcesByType.木材,100);
  assert.equal(first.assignment.status,"delivering");
  assert.ok(first.x !== 3 || first.y !== 5);
  assert.equal(first.shared.resourcesByType.石材,35);
  assert.ok(await page.evaluate(()=>window.transportEvents[0].ap < 100 && window.transportEvents[0].ap >= 0));
  const saved=await page.evaluate(()=>window.exportV39SaveJson());
  await page.evaluate(data=>window.importV39SaveJson(data),saved);
  assert.deepEqual((await snapshot()).cargo,first.cargo);
  assert.deepEqual((await snapshot()).assignment,first.assignment);
  for(let i=0;i<10 && (await snapshot()).assignment.leg!=="return";i++)await step();
  const delivered=await snapshot();
  assert.deepEqual(delivered.wood,[150,100]);
  assert.equal(delivered.assignment.leg,"return");
  for(let i=0;i<10 && (await snapshot()).x!==3;i++)await step();
  assert.equal((await snapshot()).x,3);
  await step();
  assert.deepEqual((await snapshot()).wood,[50,100]);
  await page.locator('[data-transport-route="carrier"]').click();
  const paused=await snapshot();
  assert.equal(paused.assignment.enabled,false);
  await step();
  const stillPaused=await snapshot();
  assert.equal(stillPaused.x,paused.x);
  assert.deepEqual(stillPaused.cargo,paused.cargo);
  // Loading must not duplicate cargo or overwrite unrelated group cargo on resume.
  await page.locator('[data-transport-route="carrier"]').click();
  await step();
  for(let i=0;i<25 && (await snapshot()).assignment.status!=="waiting-stock";i++)await step();
  const complete=await snapshot();
  assert.deepEqual(complete.wood,[0,250]);
  assert.equal(complete.assignment.status,"waiting-stock");
  assert.equal(complete.shared.resourcesByType.石材,35);
  assert.equal(complete.selected,"出発拠点");
  await page.locator('[data-settlement-fold="transport"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-auto-transport.png"});
  await page.setViewportSize({width:440,height:900});
  await page.locator('[data-settlement-fold="transport"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-auto-transport-mobile.png"});
  // An impassable map holds its load in place; transport deaths retain individual cargo.
  await page.evaluate(()=>{
    const state=window.getV39GameState(), player=state.players[0], faction=player.factionState;
    window.setV39GameState({players:[{...player,factionState:{...faction,
      units:faction.units.map(unit=>({...unit,x:3,y:5,ap:100,currentAp:100})),
      settlements:faction.settlements.map(row=>row.settlementId!=="出発拠点"?row:{...row,materialStockByType:{木材:100}})}}]});
    const data=window.__v39FieldRuntime.mapData;
    for(let y=0;y<data.h;y++)for(let x=0;x<data.w;x++)data.grid[y][x]="海";
    data.grid[5][3]="平地";data.grid[5][11]="平地";
  });
  await step();
  const blocked=await snapshot();
  assert.equal(blocked.x,3);
  assert.equal(blocked.assignment.status,"blocked");
  assert.equal(blocked.cargo.resourcesByType.木材,100);
  await page.locator('[data-transport-route="carrier"]').click();
  const unloaded=await snapshot();
  assert.deepEqual(unloaded.wood,[100,250]);
  assert.ok(!unloaded.cargo?.resourcesByType?.木材);
  await page.locator('[data-transport-route="carrier"]').click();
  await step();
  assert.equal((await snapshot()).cargo.resourcesByType.木材,100);
  await page.evaluate(()=>{
    const state=window.getV39GameState();
    window.setV39GameState({players:state.players.map(player=>({...player,factionState:{...player.factionState,
      units:player.factionState.units.map(unit=>({...unit,hp:0,currentHp:0,state:"死亡"}))}}))});
    window.runV39DeathLifecycle();
  });
  const corpse=await page.evaluate(()=>window.getV39GameState().players[0].factionState.units[0].corpseCargo);
  assert.equal(corpse.resourcesByType.木材,100);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({first,delivered,complete,blocked,corpse,errors},null,2));
} finally {await browser.close();}
