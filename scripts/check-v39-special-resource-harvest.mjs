import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:390,height:844}});
const errors = [];
page.on("pageerror",error=>errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.startV39LocalSession==="function");
  const report = await page.evaluate(async()=>{
    const special = await import("/src/lib/v39-specialty-rules.js");
    const economy = await import("/src/lib/v39-economy-rules.js");
    const {researchTreeData} = await import("/src/lib/research-tree-config.js");
    const map={w:12,h:12,grid:Array.from({length:12},()=>Array(12).fill("森")),heightLevelMap:Array.from({length:12},()=>Array(12).fill(0))};
    const base=id=>economy.normalizeV39Village({id,settlementId:id,placed:true,x:5,y:5,population:50,populationByRace:{只人:50},foodStockByType:{穀物:100000}});
    const sites={"5,5":{key:"5,5",x:5,y:5,name:"黒木"},"6,5":{key:"6,5",x:6,y:5,name:"黒木"},"7,5":{key:"7,5",x:7,y:5,name:"銀鉄"},"8,5":{key:"8,5",x:8,y:5,name:"特木"},"9,5":{key:"9,5",x:9,y:5,name:"銀"},"5,6":{key:"5,6",x:5,y:6,name:"蜂蜜"}};
    const initial={activePlayerId:"p",timeline:{turnNumber:1},players:[{id:"p",race:"只人",factionState:{units:[],settlements:[base("a"),base("b")],selectedSettlementId:"a",research:{},exploration:{discoveredSpecialtiesByTile:Object.fromEntries(Object.entries(sites).filter(([key])=>key!=="8,5"))}}},{id:"q",race:"只人",factionState:{units:[],settlements:[base("c")],selectedSettlementId:"c",exploration:{discoveredSpecialtiesByTile:{"9,5":sites["9,5"]}}}}],territoryOwnerByTile:{"5,5":"p","6,5":"p","7,5":"p","8,5":"p","9,5":"q","5,6":"p"},territoryStateByTile:Object.fromEntries(Object.keys(sites).map(key=>[key,{settlementId:key==="7,5"?"b":key==="9,5"?"c":"a",hp:100}])),specialtiesByTile:sites,enemies:[],enemyNests:[],settlements:[]};
    let state=structuredClone(initial);
    const history=[];
    for(let turn=1;turn<=5;turn++){
      state.timeline.turnNumber=turn;
      state=economy.advanceV39EconomyTurn(state,map).state;
      history.push(state.players[0].factionState.settlements[0].materialStockByType.黒木);
      if(turn===3){ state=JSON.parse(JSON.stringify(state));window.__harvestMid=structuredClone(state); }
    }
    const bases=state.players[0].factionState.settlements;
    const repeated=economy.advanceV39EconomyTurn(state,map).state;
    const counts=special.summarizeV39Specialties(special.getV39SpecialtyEntries(state,"p",{ownedOnly:true}));
    let village=base("a");
    const player=initial.players[0];
    const first=special.advanceV39SpecialResourceHarvest(initial,player,village,1,map);
    village.specialResourceHarvestByTile=first.progressByTile;
    const attacked={...initial,territoryStateByTile:{...initial.territoryStateByTile,"5,5":{settlementId:"a",status:"襲撃中",hp:100}}};
    const paused=special.advanceV39SpecialResourceHarvest(attacked,player,village,2,map);
    const lost=special.advanceV39SpecialResourceHarvest({...initial,territoryOwnerByTile:{...initial.territoryOwnerByTile,"5,5":"q"}},player,village,2,map);
    const levels=researchTreeData.categories.経済Lv.levels;
    const research={progress:{completedByCategoryLevel:{経済Lv:Object.fromEntries(levels.slice(0,2).map(row=>[row.level,row.items.map(item=>item.id)]))}}};
    const researchRule=special.resolveV39SpecialResourceHarvestRule(sites["5,5"],research);
    let boosted=base("a"),gained=0;
    for(let turn=1;turn<=4;turn++){
      const result=special.advanceV39SpecialResourceHarvest(initial,{...player,factionState:{...player.factionState,research}},boosted,turn,map);
      boosted.specialResourceHarvestByTile=result.progressByTile;gained+=result.income.黒木||0;
    }
    const generated=special.generateV39Specialties(map,{seed:"harvest"});
    window.__harvestFixture={state,map};
    return {history,second:bases[1].materialStockByType.銀鉄,other:state.players[1].factionState.settlements[0].materialStockByType.銀,undiscovered:bases[0].materialStockByType.特木,repeated:repeated.players[0].factionState.settlements[0].materialStockByType.黒木,counts:counts.map(row=>[row.name,row.count]),paused:paused.progressByTile["5,5"].progress,lost:!!lost.progressByTile["5,5"],researchRule,gained,generated:Object.values(generated).filter(special.isV39HarvestResource).length};
  });
  assert.deepEqual(report.history,[0,0,0,0,2]);
  assert.equal(report.second,1);assert.equal(report.other,1);assert.equal(report.undiscovered,0);assert.equal(report.repeated,2);
  assert.deepEqual(report.counts,[["蜂蜜",1]]);assert.equal(report.paused,1);assert.equal(report.lost,false);
  assert.equal(report.researchRule.level,2);assert.equal(report.researchRule.speed,1.4);assert.equal(report.gained,2);assert.ok(report.generated>0);
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:12,h:12,patternId:"realistic"},"harvest-ui");
    const current=window.getV39GameState(),fixture=window.__harvestFixture;
    fixture.state.players[0]={...current.players[0],...fixture.state.players[0]};
    window.__v39FieldRuntime.mapData=fixture.map;
    window.setV39GameState({...current,...fixture.state});window.renderV39ResourceTop();
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator("#v39-specialty-header").click();
  assert.ok((await page.locator("#v39-specialty-panel").innerText()).includes("×2 ⌛5"));
  assert.equal(await page.locator(".v39-specialty-row").filter({hasText:"銀鉄"}).locator(".v39-harvest-note").count(),0);
  await page.screenshot({path:"output/web-game/v39-special-resource-harvest.png"});
  await page.locator('[data-specialty-tab="specialties"]').click();
  assert.equal(await page.locator(".v39-specialty-row").count(),1);
  assert.ok((await page.locator("#v39-specialty-panel").innerText()).includes("1マス"));
  const saved=await page.evaluate(()=>{
    const save=window.createV39SaveData();
    return window.migrateV39SaveData(JSON.parse(JSON.stringify(save))).save.gameState.players[0].factionState.settlements[0].specialResourceHarvestByTile;
  });
  assert.equal(saved["5,5"].lastTurn,5);
  const midSaved=await page.evaluate(()=>{
    const original=window.getV39GameState().players;
    window.setV39GameState({players:window.__harvestMid.players});
    window.renderV39ResourceTop();
    document.querySelector('[data-specialty-tab="stock"]')?.click();
    const countdown=document.querySelector(".v39-harvest-note")?.textContent;
    const save=window.createV39SaveData();
    const result=window.migrateV39SaveData(JSON.parse(JSON.stringify(save))).save.gameState.players[0].factionState.settlements[0].specialResourceHarvestByTile;
    window.setV39GameState({players:original});return { ...result, countdown };
  });
  assert.equal(midSaved["5,5"].progress,3);assert.equal(midSaved["5,5"].lastTurn,3);
  assert.equal(midSaved.countdown,"×2 ⌛2");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({report,saved,midSaved,errors},null,2));
} finally {await browser.close();}
