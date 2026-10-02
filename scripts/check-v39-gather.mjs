import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1000,height:800}}), errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.gatherV39SelectedUnit==="function");
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});
    window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"gather-check");
    const state=window.getV39GameState(),player=state.players[0],template=player.factionState.units[0];
    const unit={...template,id:"採取軍",name:"採取軍",unitType:"軍隊",isNamed:false,state:"生存",hp:100,currentHp:100,
      x:5,y:5,ap:100,currentAp:100,squadId:"採取部隊",surveyTask:undefined,waitTurnNumber:undefined};
    const settlement={...player.factionState.settlements[0],id:"搬入村",settlementId:"搬入村",placed:true,x:2,y:2,
      materialStockByType:{木材:50},foodStockByType:{穀物:100},territoryResidentialCenterMap:{"2,2":"2,2"}};
    window.setV39GameState({players:[{...player,factionState:{...player.factionState,units:[unit],selectedUnitId:unit.id,
      settlements:[settlement],selectedSettlementId:settlement.id,
      squads:[{id:"採取部隊",unitIds:[unit.id],cargo:{resourcesByType:{},equipmentInventory:[]}}],
      exploration:{discoveredFeaturesByTile:{},surveyedTileKeys:[],history:[]}}}],
      territoryOwnerByTile:{"2,2":player.id},territoryStateByTile:{},enemies:[],enemyNests:[],neutralVillages:[]});
    const map=window.__v39FieldRuntime.mapData;
    map.grid[5][5]="森";map.specialMap[5][5]="";map.lavaMap[5][5]=false;
    window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
    window.activateV39FooterTab("squad");
    document.querySelector('[data-squad-detail-tab="action"]').click();
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator('#mobileBattleGather').click();
  const snapshot=()=>page.evaluate(()=>{
    const state=window.getV39GameState(),faction=state.players.find(row=>row.id===state.activePlayerId).factionState;
    return {unit:faction.units[0],cargo:faction.squads[0].cargo,individual:faction.squads[0].cargoByUnitId,
      stock:faction.settlements[0].materialStockByType,gathered:faction.exploration.gatheredAtTurnByTile};
  });
  const forest=await snapshot();
  assert.deepEqual(forest.cargo.resourcesByType,{木材:10,黒木:7,特木:3});
  assert.equal(forest.unit.ap,0);assert.equal(forest.stock.木材,50);assert.equal(forest.gathered['5,5'],1);
  await page.evaluate(()=>{
    const state=window.getV39GameState();
    window.setV39GameState({players:state.players.map(player=>({...player,factionState:{...player.factionState,
      units:player.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}}))});
    window.importV39SaveJson(window.exportV39SaveJson());
  });
  assert.match(await page.evaluate(()=>window.gatherV39SelectedUnit().reason),/今ターン採取済み/);
  assert.deepEqual((await snapshot()).cargo,forest.cargo);
  await page.evaluate(()=>{
    const state=window.getV39GameState();window.setV39GameState({timeline:{...state.timeline,turnNumber:2}});
    window.__v39FieldRuntime.mapData.grid[5][5]="洞窟";
    window.__v39FieldRuntime.mapData.specialMap[5][5]="";
  });
  const caveResult=await page.evaluate(()=>{
    const result=window.gatherV39SelectedUnit();return {ok:result.ok,accepted:result.accepted,capacity:result.capacity};
  });
  assert.equal(caveResult.ok,true);assert.equal(caveResult.accepted.resourcesByType.鉄,15);
  const cave=await snapshot();
  assert.ok(Object.values(cave.cargo.resourcesByType).reduce((sum,value)=>sum+value,0)<=caveResult.capacity);
  // Bringing gathered cargo to a base transfers it exactly once, without creating stock remotely.
  await page.evaluate(()=>{
    const state=window.getV39GameState();window.setV39GameState({players:state.players.map(player=>({...player,
      factionState:{...player.factionState,units:player.factionState.units.map(unit=>({...unit,x:2,y:2}))}}))});
    window.dispatchEvent(new CustomEvent("v39:unit-moved",{detail:{unitId:"採取軍"}}));
  });
  const deposited=await snapshot();
  assert.equal(deposited.stock.木材,60);assert.equal(deposited.stock.鉄,15);
  assert.deepEqual(deposited.cargo.resourcesByType,{});
  await page.evaluate(()=>window.depositV39PlayerCargo(window.getV39GameState().activePlayerId,"採取軍"));
  assert.deepEqual((await snapshot()).stock,deposited.stock);
  // A transporter keeps harvests individually; a full load must not consume AP.
  await page.evaluate(()=>{
    const state=window.getV39GameState();window.setV39GameState({timeline:{...state.timeline,turnNumber:3},
      players:state.players.map(player=>({...player,factionState:{...player.factionState,
        units:player.factionState.units.map(unit=>({...unit,x:5,y:5,ap:100,currentAp:100,
          transportAssignment:{originSettlementId:"搬入村",status:"awaiting-route"}}))}}))});
    window.__v39FieldRuntime.mapData.grid[5][5]="森";
  });
  assert.equal(await page.evaluate(()=>window.gatherV39SelectedUnit().ok),true);
  assert.deepEqual((await snapshot()).individual['採取軍'].resourcesByType,{木材:10,黒木:7,特木:3});
  await page.evaluate(()=>{
    const state=window.getV39GameState();window.setV39GameState({timeline:{...state.timeline,turnNumber:4},
      players:state.players.map(player=>({...player,factionState:{...player.factionState,
        squads:player.factionState.squads.map(squad=>({...squad,cargoByUnitId:{採取軍:{resourcesByType:{木材:9999},equipmentInventory:[]}}})),
        units:player.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}}))});
  });
  assert.match(await page.evaluate(()=>window.gatherV39SelectedUnit().reason),/運搬上限/);
  assert.equal((await snapshot()).unit.ap,100);
  const rejected=await page.evaluate(()=>{
    const setUnit=patch=>{
      const state=window.getV39GameState();window.setV39GameState({players:state.players.map(player=>({...player,
        factionState:{...player.factionState,squads:player.factionState.squads.map(squad=>({...squad,cargoByUnitId:{}})),
          units:player.factionState.units.map(unit=>({...unit,...patch}))}}))});
    };
    setUnit({hp:0,currentHp:0,state:"死亡"});const dead=window.gatherV39SelectedUnit().reason;
    setUnit({hp:100,currentHp:100,state:"生存",waitTurnNumber:4});const wait=window.gatherV39SelectedUnit().reason;
    setUnit({waitTurnNumber:undefined,ap:99,currentAp:99});const ap=window.gatherV39SelectedUnit().reason;
    setUnit({ap:100,currentAp:100});
    const state=window.getV39GameState();window.setV39GameState({territoryOwnerByTile:{"5,5":state.activePlayerId}});
    const owned=window.gatherV39SelectedUnit().reason;
    window.setV39GameState({territoryOwnerByTile:{}});
    window.__v39FieldRuntime.mapData.grid[5][5]="平地";const terrain=window.gatherV39SelectedUnit().reason;
    window.__v39FieldRuntime.mapData.grid[5][5]="森";
    window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:"採取軍"}}));
    return {dead,wait,ap,owned,terrain};
  });
  for(const [key,regex] of Object.entries({dead:/死亡/,wait:/待機/,ap:/AP/,owned:/領土外/,terrain:/森・洞窟/}))assert.match(rejected[key],regex);
  await page.locator('#mobileBattleGather').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-gather.png"});
  await page.setViewportSize({width:440,height:900});
  await page.locator('#mobileBattleGather').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-gather-mobile.png"});
  assert.equal(await page.evaluate(()=>window.gatherV39SelectedUnit().ok),true);
  const otherPlayer=await page.evaluate(()=>{
    const state=window.getV39GameState(),first=state.players[0],unit=first.factionState.units[0];
    const other={...first,id:"player-2",label:"参加者2",factionState:{...first.factionState,settlements:[],
      selectedSettlementId:"",selectedUnitId:"other-unit",exploration:{},
      units:[{...unit,id:"other-unit",ap:100,currentAp:100,transportAssignment:undefined,squadId:"other-squad"}],
      squads:[{id:"other-squad",unitIds:["other-unit"],cargo:{resourcesByType:{},equipmentInventory:[]}}]}};
    window.setV39GameState({players:[first,other],activePlayerId:other.id});
    const result=window.gatherV39SelectedUnit();
    return {ok:result.ok,reason:result.reason,ap:window.getV39GameState().players[1].factionState.units[0].ap};
  });
  assert.equal(otherPlayer.ok,false);assert.match(otherPlayer.reason,/今ターン採取済み/);assert.equal(otherPlayer.ap,100);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({forest,caveResult,deposited,rejected,otherPlayer,errors},null,2));
} finally {await browser.close();}
