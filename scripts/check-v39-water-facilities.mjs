import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1000, height:800 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto(process.env.V39_BASE_URL || "http://127.0.0.1:3021", { waitUntil:"networkidle" });
  const report = await page.evaluate(async () => {
    const rules = await import("http://127.0.0.1:3022/src/lib/v39-economy-rules.js");
    const map = { w:9,h:9,grid:Array.from({length:9}, () => Array(9).fill("平地")) };
    map.grid[4][5] = "海";
    map.grid[4][6] = "湖";
    const village = { id:"water-a",settlementId:"water-a",placed:true,x:4,y:4,
      scaleKey:"town",scaleLevel:2,population:10,populationByRace:{只人:10},
      foodStockByType:{穀物:1000,野菜:1000,肉:1000,魚:1000},materialStockByType:{},
      buildings:["船着き場"],tileFacilityMap:{"4,4":["船着き場"]},constructionQueue:[] };
    const player = { id:"water-player",race:"只人",factionState:{ settlements:[village],selectedSettlementId:village.id,units:[] } };
    const state = { players:[player],timeline:{turnNumber:2},territoryOwnerByTile:{"4,4":player.id},
      territoryStateByTile:{"4,4":{settlementId:village.id,hp:100}},enemies:[],enemyNests:[] };
    const income = () => rules.collectV39TerritoryIncome(state,player,map).food.魚;
    village.tileFacilityMap = {};
    const baseline = income();
    village.tileFacilityMap = {"4,4":["船着き場"]};
    const boat = income();
    const tileBoat = rules.collectV39TerritoryTileIncome(state,player.id,"4,4",map).food.魚;
    village.tileFacilityMap = {"4,4":["港"]}; village.buildings = ["港"];
    const port = income();
    village.facilityStateByTile = {"4,4":{港:{hp:0,maxHp:100}}};
    const destroyed = income(); delete village.facilityStateByTile;
    village.tileFacilityMap = {};
    village.constructionQueue = [{id:"unfinished",facilityName:"船着き場",tileKey:"4,4",remainingTurns:1,totalTurns:1}];
    const unfinished = income(); village.constructionQueue = [];
    village.tileFacilityMap = {"4,4":["船着き場"]}; village.buildings = ["船着き場"];
    state.territoryOwnerByTile["5,4"] = "foreign-player";
    const foreign = income(); delete state.territoryOwnerByTile["5,4"];
    state.territoryOwnerByTile["5,4"] = player.id;
    state.territoryStateByTile["5,4"] = {settlementId:village.id,hp:100};
    const ownedWater = income(); village.tileFacilityMap = {};
    const ownedWaterWithoutBoat = income(); village.tileFacilityMap = {"4,4":["船着き場"]};
    delete state.territoryOwnerByTile["5,4"]; delete state.territoryStateByTile["5,4"];
    map.grid[4][6] = "平地";
    const second = {...structuredClone(village),id:"water-b",settlementId:"water-b",x:5,y:3,tileFacilityMap:{"5,3":["船着き場"]}};
    player.factionState.settlements.push(second);
    state.territoryOwnerByTile["5,3"] = player.id;
    state.territoryStateByTile["5,3"] = {settlementId:second.id,hp:100};
    const firstFish = income(); player.factionState.selectedSettlementId = second.id;
    const secondFish = income(); player.factionState.selectedSettlementId = village.id;
    const simultaneousState = structuredClone(state);
    for (const settlement of simultaneousState.players[0].factionState.settlements) {
      const key = Object.keys(settlement.tileFacilityMap)[0];
      settlement.buildings=[]; settlement.tileFacilityMap={};
      settlement.constructionQueue=[{id:`build-${settlement.id}`,facilityName:"船着き場",tileKey:key,remainingTurns:1,totalTurns:1}];
    }
    const simultaneous = rules.advanceV39EconomyTurn(simultaneousState,map).reports.reduce((sum,row)=>sum+row.territoryIncome.food.魚,0);
    const effects = rules.facilityDefinitions().find(row=>row.name==="港").effects;
    player.factionState.settlements.pop(); delete state.territoryOwnerByTile["5,3"]; delete state.territoryStateByTile["5,3"];
    map.grid[4][6] = "湖";
    const next = rules.advanceV39EconomyTurn(state,map);
    const updated = next.state.players[0].factionState.settlements[0];
    return {baseline,boat,tileBoat,port,destroyed,unfinished,foreign,ownedWater,ownedWaterWithoutBoat,firstFish,secondFish,simultaneous,effects,
      turnFish:next.reports[0]?.territoryIncome?.food?.魚,stockFish:updated.foodStockByType.魚,delta:updated.lastEconomyDelta};
  });
  console.log(JSON.stringify(report,null,2));
  assert.equal(report.baseline,0);
  assert.ok(report.boat>0);
  assert.equal(report.tileBoat,report.boat);
  assert.ok(report.port>report.boat*2);
  assert.equal(report.destroyed,0);
  assert.equal(report.unfinished,0);
  assert.equal(report.foreign,0);
  assert.equal(report.ownedWater,report.ownedWaterWithoutBoat);
  assert.equal(Math.round((report.firstFish+report.secondFish)*10)/10,report.boat);
  assert.equal(report.simultaneous,report.boat);
  assert.equal(report.effects.採取範囲,undefined);
  assert.equal(report.turnFish,report.boat);
  assert.ok(report.stockFish>=1000);
  assert.deepEqual(errors,[]);
  await page.evaluate(() => {
    window.startV39LocalSession(1,{playMode:"single-test"});
    const map = window.generateV39TestFieldWithSeed({w:36,h:36,patternId:"realistic"},"water-facility-visual");
    const state = window.getV39GameState();
    const player = state.players.find(row=>row.id===state.activePlayerId);
    const village = player.factionState.settlements[0] || {id:"water-visual",settlementId:"water-visual",placed:true,
      x:4,y:4,population:50,populationByRace:{只人:50},buildings:[],tileFacilityMap:{},foodStockByType:{魚:100}};
    player.factionState.settlements=[village]; player.factionState.selectedSettlementId=village.id;
    const x = Math.min(map.w-2,village.x+1), y = village.y;
    const key = `${x},${y}`;
    map.grid[y][x]="平地"; map.grid[y][x+1]="海";
    if(map.specialMap?.[y]){map.specialMap[y][x]="";map.specialMap[y][x+1]="";}
    village.buildings=[...village.buildings,"船着き場"];
    village.tileFacilityMap={...village.tileFacilityMap,[key]:["船着き場"]};
    window.setV39GameState({players:state.players,territoryOwnerByTile:{...state.territoryOwnerByTile,[key]:player.id},
      territoryStateByTile:{...state.territoryStateByTile,[key]:{settlementId:village.id,hp:100}}});
    window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x,y}}));
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.screenshot({path:"output/web-game/v39-water-facilities.png"});
} finally { await browser.close(); }
