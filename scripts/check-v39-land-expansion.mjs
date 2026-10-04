import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:850 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.waitForFunction(() => typeof window.startV39LocalSession === "function");
  const report = await page.evaluate(async () => {
    const rules = await import("/src/lib/v39-land-expansion-rules.js");
    const economy = await import("/src/lib/v39-economy-rules.js");
    const survey = await import("/src/lib/v39-exploration-rules.js");
    const { getHexNeighborCoords } = await import("/src/lib/hex-grid.js");
    const map = { w:12, h:12, worldWrapEnabled:false,
      grid:Array.from({ length:12 }, () => Array(12).fill("平地")),
      heightLevelMap:Array.from({ length:12 }, () => Array(12).fill(0)) };
    const keys = ["5,5", ...getHexNeighborCoords(12,12,5,5).map(row => row.key)];
    const settlement = economy.normalizeV39Village({ id:"base", settlementId:"base", name:"開拓テスト", placed:true,
      x:5,y:5, population:50,populationByRace:{ 只人:50 }, foodStockByType:{ 穀物:10000 },
      territoryTileModeMap:Object.fromEntries(keys.map(key => [key,"resource"])) }, "只人");
    const player = { id:"p",race:"只人",isPlayer:true,factionState:{ selectedSettlementId:"base",settlements:[settlement],units:[],
      visibility:{ exploredTileKeys:Array.from({length:144},(_,i)=>`${i%12},${Math.floor(i/12)}`) } } };
    const state = { players:[player],activePlayerId:"p",timeline:{turnNumber:1,phase:"player"},enemies:[],neutralVillages:[],
      territoryOwnerByTile:Object.fromEntries(keys.map(key => [key,"p"])),
      territoryStateByTile:Object.fromEntries(keys.map(key => [key,{status:"領土",settlementId:"base",hp:100,maxHp:100}])) };
    const target = {x:7,y:5};
    const started = rules.startV39LandExpansion(state,"p","base",target,map);
    const baseIncome = economy.collectV39TerritoryIncome(state,player,map);
    const activeIncome = economy.collectV39TerritoryIncome(started.state,started.state.players[0],map);
    const sum = bag => Object.values(bag).reduce((a,b)=>a+b,0);
    const workerCount = rules.reservedV39LandExpansionWorkers(started.state,started.state.players[0],started.state.players[0].factionState.settlements[0],map);
    const first = economy.advanceV39EconomyTurn(started.state,map);
    const remaining = first.state.players[0].factionState.settlements[0].landExpansionProjects[0].remainingTurns;
    const again = economy.advanceV39EconomyTurn(first.state,map);
    const blockedState = { ...first.state, timeline:{...first.state.timeline,turnNumber:2},enemies:[{id:"block",x:7,y:5,hp:10}] };
    const pausedWorkers = rules.reservedV39LandExpansionWorkers(blockedState,blockedState.players[0],blockedState.players[0].factionState.settlements[0],map);
    const paused = economy.advanceV39EconomyTurn(blockedState,map);
    const resumed = economy.advanceV39EconomyTurn({...paused.state,enemies:[],timeline:{...paused.state.timeline,turnNumber:3}},map);
    const cancelled = rules.cancelV39LandExpansion(started.state,"p","base","7,5");
    const idleState=structuredClone(state);idleState.players[0].factionState.settlements[0].population=100;
    idleState.players[0].factionState.settlements[0].populationByRace={只人:100};
    const idleStart=rules.startV39LandExpansion(idleState,"p","base",target,map);
    const idleRate=economy.resolveV39SettlementLabor(idleStart.state,idleStart.state.players[0],idleStart.state.players[0].factionState.settlements[0],map).employmentRate;
    const portState = structuredClone(state);
    const portMap = structuredClone(map);portMap.grid[5][7]="海";portMap.grid[5][8]="海";
    const waterNone = rules.inspectV39LandExpansion(portState,"p","base",target,portMap).ok;
    portState.players[0].factionState.settlements[0].tileFacilityMap={"6,5":["船着き場"]};
    const dockNear = rules.inspectV39LandExpansion(portState,"p","base",target,portMap).ok;
    const dockFar = rules.inspectV39LandExpansion(portState,"p","base",{x:8,y:5},portMap).ok;
    portState.players[0].factionState.settlements[0].tileFacilityMap={"6,5":["港"]};
    const portFar = rules.inspectV39LandExpansion(portState,"p","base",{x:8,y:5},portMap).ok;
    const occupied = rules.inspectV39LandExpansion({...state,enemies:[{x:7,y:5,hp:10}]},"p","base",target,map).ok;
    const corpse = rules.inspectV39LandExpansion({...state,enemies:[{x:7,y:5,hp:0,state:"死亡"}]},"p","base",target,map).ok;
    const landmark = rules.inspectV39LandExpansion({...state,victoryLandmarksByTile:{"7,5":{x:7,y:5}}},"p","base",target,map).ok;
    const village = rules.inspectV39LandExpansion({...state,neutralVillages:[{x:7,y:5}]},"p","base",target,map).ok;
    const foreign = rules.inspectV39LandExpansion({...state,territoryOwnerByTile:{...state.territoryOwnerByTile,"7,5":"other"}},"p","base",target,map).ok;
    const surveyedState = structuredClone(state);
    surveyedState.players[0].factionState.units=[{id:"surveyor",name:"調査者",x:7,y:5,hp:100,level:50,race:"只人",
      surveyTask:{key:"7,5",x:7,y:5,startedTurn:1,progressAp:100}}];
    const surveyed = survey.advanceV39ExplorationTurn(surveyedState,map,2);
    window.__expansionFixture={state,map};
    return { started:started.ok, baseYield:sum(baseIncome.food), activeYield:sum(activeIncome.food),workerCount,remaining,
      repeatRemaining:again.state.players[0].factionState.settlements[0].landExpansionProjects[0].remainingTurns,
      pausedWorkers,paused:paused.state.players[0].factionState.settlements[0].landExpansionProjects[0],
      claimed:resumed.state.territoryOwnerByTile["7,5"],claimedSettlement:resumed.state.territoryStateByTile["7,5"]?.settlementId,
      completed:resumed.landExpansionCompleted.length,oldStateUntouched:!state.territoryOwnerByTile["7,5"],
      cancelled:cancelled.state.players[0].factionState.settlements[0].landExpansionProjects.length,
      waterNone,dockNear,dockFar,portFar,occupied,corpse,landmark,village,foreign,
      idleRate,surveyClaimed:Boolean(surveyed.state.territoryOwnerByTile["7,5"]) };
  });
  assert.ok(report.started && report.oldStateUntouched);
  assert.ok(report.activeYield < report.baseYield);
  assert.equal(report.workerCount,10);
  assert.equal(report.remaining,1);
  assert.equal(report.repeatRemaining,1);
  assert.equal(report.pausedWorkers,0);
  assert.ok(report.paused.paused);
  assert.equal(report.paused.remainingTurns,1);
  assert.equal(report.claimed,"p");assert.equal(report.claimedSettlement,"base");assert.equal(report.completed,1);
  assert.equal(report.cancelled,0);
  assert.equal(report.idleRate,1);
  assert.deepEqual([report.waterNone,report.dockNear,report.dockFar,report.portFar],[false,true,false,true]);
  assert.deepEqual([report.occupied,report.corpse,report.landmark,report.village,report.foreign,report.surveyClaimed],[false,true,false,false,false,false]);
  await page.evaluate(() => {
    window.startV39LocalSession(1,{playMode:"single-test"});window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:12,h:12,patternId:"realistic"},"expansion-ui");
    const state=window.getV39GameState(), fixture=window.__expansionFixture;
    fixture.state.players[0]={...state.players[0],...fixture.state.players[0]};
    window.__v39FieldRuntime.mapData=fixture.map;
    window.setV39GameState({...state,...fixture.state,enemies:[],neutralVillages:[],victoryLandmarksByTile:{}});
    window.activateV39FooterTab("settlement");window.renderV39SettlementPanel();
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator('[data-settlement-fold="expansion"] summary').click();
  await page.locator('[data-expansion-action="choose"]').click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:7,y:5}})));
  assert.equal(await page.locator('[data-expansion-action="start"]').count(),1);
  await page.locator('[data-expansion-action="start"]').click();
  assert.ok((await page.locator('[data-settlement-fold="expansion"]').innerText()).includes("残り2T"));
  const saved=await page.evaluate(()=>window.createV39SaveData().gameState.players[0].factionState.settlements[0].landExpansionProjects);
  assert.equal(saved[0].remainingTurns,2);
  const roundTrip=await page.evaluate(()=>{
    const save=window.createV39SaveData();
    return window.migrateV39SaveData(JSON.parse(JSON.stringify(save))).save.gameState.players[0].factionState.settlements[0].landExpansionProjects[0].remainingTurns;
  });
  assert.equal(roundTrip,2);
  await page.locator('[data-settlement-fold="expansion"]').scrollIntoViewIfNeeded();
  await page.screenshot({path:"output/web-game/v39-land-expansion.png"});
  await page.locator('[data-expansion-action="cancel"]').click();
  assert.equal(await page.locator('[data-expansion-action="cancel"]').count(),0);
  const integrated=await page.evaluate(async()=>{
    const rules=await import("/src/lib/v39-land-expansion-rules.js");
    const state=window.getV39GameState();
    const started=rules.startV39LandExpansion(state,state.activePlayerId,"base",{x:7,y:5},window.__v39FieldRuntime.mapData);
    window.setV39GameState({players:started.state.players});
    await window.advanceV39Turn({skipUnactedFocus:true});
    const remaining=window.getV39GameState().players[0].factionState.settlements[0].landExpansionProjects[0].remainingTurns;
    await window.advanceV39Turn({skipUnactedFocus:true});
    return {remaining,owner:window.getV39GameState().territoryOwnerByTile["7,5"]};
  });
  assert.equal(integrated.remaining,1);assert.equal(integrated.owner,"p");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({...report,ui:true,save:true,errors},null,2));
} finally {await browser.close();}
