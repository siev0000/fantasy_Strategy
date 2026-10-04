import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:440,height:956 } });
const errors=[];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", {waitUntil:"networkidle"});
  await page.waitForFunction(()=>typeof window.startV39LocalSession==="function");
  const report=await page.evaluate(async()=>{
    const survey=await import("/src/lib/v39-exploration-rules.js");
    const special=await import("/src/lib/v39-specialty-rules.js");
    const civic=await import("/src/lib/v39-civic-rules.js");
    const economy=await import("/src/lib/v39-economy-rules.js");
    const icons=await import("/src/lib/resource-icon-glyphs.js");
    const addedNames=["タコ","カニ","エビ","カキ・貝","リンゴ","オレンジ"];
    const definitions=special.v39SpecialtyDefinitions();
    const addedDefinitions=definitions.filter(row=>addedNames.includes(row.名前));
    const additionsValid=addedDefinitions.length===6&&!definitions.some(row=>row.名前==="塩")
      &&addedDefinitions.every(row=>row.分類==="食料"&&row.出現重み===1&&!row.採取周期);
    const addedGlyphs=addedNames.map(name=>icons.resolveV39ResourceIconGlyph(name));
    const generatedNames=new Set(["海","湖","森","平地"].flatMap(terrain=>{
      const field={w:40,h:40,grid:Array.from({length:40},()=>Array(40).fill(terrain))};
      return Object.values(special.generateV39Specialties(field,{seed:"food-types",definitions:definitions.filter(row=>row.分類!=="特殊資源")})).map(site=>site.name);
    }));
    const addedPlacementValid=addedNames.every(name=>generatedNames.has(name))&&!generatedNames.has("塩");
    const map={w:12,h:12,worldWrapEnabled:false,grid:Array.from({length:12},()=>Array(12).fill("森")),heightLevelMap:Array.from({length:12},()=>Array(12).fill(0))};
    const unit={id:"u",name:"調査者",x:5,y:5,hp:100,maxHp:100,ap:40,status:{索敵:75},level:7,race:"只人"};
    const keys=survey.getV39SurveyTileKeys(unit,map);
    const settlement=economy.normalizeV39Village({id:"base",settlementId:"base",placed:true,x:5,y:5,population:50,populationByRace:{只人:50},foodStockByType:{穀物:10000}},"只人");
    const state={activePlayerId:"p",timeline:{turnNumber:1,phase:"player"},players:[
      {id:"p",race:"只人",isPlayer:true,factionState:{settlements:[settlement],selectedSettlementId:"base",units:[unit],selectedUnitId:"u",exploration:{}}},
      {id:"q",race:"只人",isPlayer:true,factionState:{units:[],exploration:{}}}],enemies:[],
      specialtiesByTile:{"5,5":{key:"5,5",x:5,y:5,name:"蜂蜜"},"6,5":{key:"6,5",x:6,y:5,name:"蜂蜜"},"7,5":{key:"7,5",x:7,y:5,name:"鉄"},"5,7":{key:"5,7",x:5,y:7,name:"宝石"}},
      territoryOwnerByTile:{"5,5":"p","6,5":"p","7,5":"p"},territoryStateByTile:{"5,5":{settlementId:"base"},"6,5":{settlementId:"base"},"7,5":{settlementId:"base"}},dangerPercentByTile:{},explorationSitesByTile:{}};
    const first=survey.startV39SurveyTask(state,"p","u",unit,map);
    const usedAp=first.state.players[0].factionState.units[0].ap;
    const incomplete=survey.advanceV39ExplorationTurn(first.state,1);
    const progress=incomplete.state.players[0].factionState.units[0].surveyTask.progressAp;
    incomplete.state.timeline.turnNumber=2;incomplete.state.players[0].factionState.units[0].ap=60;
    const second=survey.startV39SurveyTask(incomplete.state,"p","u",unit,map);
    const finished=survey.advanceV39ExplorationTurn(second.state,2);
    const entries=special.getV39SpecialtyEntries(finished.state,"p",{ownedOnly:true,settlementId:"base"});
    const bonus=special.resolveV39SpecialtyHappiness(entries);
    const without=civic.resolveV39CivicTurn(settlement,2,[]);
    const withSpecial=civic.resolveV39CivicTurn(settlement,2,[],bonus);
    const generated=special.generateV39Specialties(map,{seed:"test"});
    const repeat=special.generateV39Specialties(map,{seed:"test"});
    const heightMap={w:100,h:20,grid:Array.from({length:20},()=>Array(100).fill("森")),heightLevelMap:Array.from({length:20},()=>Array.from({length:100},(_,x)=>x%3-1))};
    const heightSites=special.generateV39Specialties(heightMap,{seed:"height-check",definitions:[
      {名前:"低地",出現地形:["森"],最高高度:0,出現重み:1},
      {名前:"高地",出現地形:["森"],最低高度:1,最高高度:1,出現重み:1},
      {名前:"無効",出現地形:["森"],出現重み:0}
    ]});
    const heightValid=Object.values(heightSites).every(row=>row.name==="低地"?heightMap.heightLevelMap[row.y][row.x]<=0:row.name==="高地"&&heightMap.heightLevelMap[row.y][row.x]===1);
    const weighted=special.generateV39Specialties(heightMap,{seed:"weight-check",definitions:[
      {名前:"少",出現地形:["森"],出現重み:1},
      {名前:"多",出現地形:["森"],出現重み:9}
    ]});
    const weightCounts=Object.values(weighted).reduce((counts,row)=>({...counts,[row.name]:(counts[row.name]||0)+1}),{});
    const parsed=special.parseV39SpecialtyTerrainConditions("森, 丘_2, 山岳_3~5, 湖_-2~-1, 平地_0");
    const notationValid=parsed[0].min===-Infinity&&parsed[0].max===Infinity
      &&parsed[1].terrain==="丘陵"&&parsed[1].min===2&&parsed[1].max===2
      &&parsed[2].min===3&&parsed[2].max===5&&parsed[3].min===-2&&parsed[3].max===-1&&parsed[4].min===0;
    const notationMap={...heightMap,grid:heightMap.grid.map(row=>row.map(()=>"丘陵"))};
    const notationSites=special.generateV39Specialties(notationMap,{seed:"notation",definitions:[{名前:"丘の資源",出現地形:"丘_0, 森_3~5"}]});
    const notationGenerated=Object.keys(notationSites).length>0&&Object.values(notationSites).every(row=>heightMap.heightLevelMap[row.y][row.x]===0);
    const ensureMap={w:8,h:1,grid:[Array(8).fill("森")],heightLevelMap:[Array(8).fill(2)]};
    const ensured=special.generateV39Specialties(ensureMap,{seed:"minimum-sites",reservedTileKeys:["0,0"],definitions:[
      {名前:"保証A",分類:"特殊資源",出現地形:"森_2"},
      {名前:"保証B",分類:"特殊資源",出現地形:"森_2"}
    ]});
    const minimumValid=["保証A","保証B"].every(name=>Object.values(ensured).some(row=>row.name===name))&&!ensured["0,0"];
    const regionMap={w:15,h:4,grid:Array.from({length:4},()=>Array.from({length:15},(_,x)=>x<5||x>=10?"森":"海"))};
    const regional=special.generateV39Specialties(regionMap,{seed:"regional",playerCount:3,definitions:[
      {名前:"地域素材",分類:"特殊資源",出現地形:"森",出現重み:1},
      {名前:"通常特産品",分類:"食料",出現地形:"森",出現重み:10000},
      {名前:"無効素材",分類:"特殊資源",出現地形:"森",出現重み:0},
    ]});
    const regionalSites=Object.values(regional).filter(site=>site.name==="地域素材");
    const regionsValid=regionalSites.some(site=>site.x<5)&&regionalSites.some(site=>site.x>=10)
      &&regionalSites.length>=3&&regionalSites.every(site=>site.name==="地域素材")
      &&JSON.stringify(regional)===JSON.stringify(special.generateV39Specialties(regionMap,{seed:"regional",playerCount:3,definitions:[
        {名前:"地域素材",分類:"特殊資源",出現地形:"森",出現重み:1},
        {名前:"通常特産品",分類:"食料",出現地形:"森",出現重み:10000},
        {名前:"無効素材",分類:"特殊資源",出現地形:"森",出現重み:0},
      ]}));
    const wrapped=survey.getV39SurveyTileKeys({...unit,x:0,y:0},{...map,worldWrapEnabled:true});
    const bounded=survey.getV39SurveyTileKeys({...unit,x:0,y:0},map);
    const atTurn3=economy.advanceV39EconomyTurn({...finished.state,timeline:{turnNumber:3,phase:"player"}},map);
    window.__specialtyFixture={state:finished.state,map};
    return {range:keys.length,ap:usedAp,progress,
      surveyed:finished.state.players[0].factionState.exploration.surveyedTileKeys.length,
      found:Object.keys(finished.state.players[0].factionState.exploration.discoveredSpecialtiesByTile).length,
      isolated:special.getV39SpecialtyEntries(finished.state,"q").length,bonus,
      targetDiff:withSpecial.happinessTargetByRace.只人-without.happinessTargetByRace.只人,
      economyBonus:atTurn3.state.players[0].factionState.settlements[0].civicState.modifiers.specialties,
      generated:Object.keys(generated).length,repeat:JSON.stringify(generated)===JSON.stringify(repeat),
      bounded:bounded.length,wrapped:wrapped.length,
      additionsValid,addedGlyphs,addedPlacementValid,
      minimumValid,regionsValid,notationValid,notationGenerated,heightValid,heightCount:Object.keys(heightSites).length,weightCounts,
      herbs:special.v39SpecialtyDefinitions().some(row=>row.名前==="薬草"),
      owned:entries.length,empty:special.getV39SpecialtyEntries({...finished.state,territoryOwnerByTile:{}},"p",{ownedOnly:true}).length};
  });
  assert.equal(report.range,19);assert.equal(report.surveyed,19);assert.equal(report.ap,0);assert.equal(report.progress,40);
  assert.equal(report.found,4);assert.equal(report.isolated,0);assert.equal(report.owned,3);assert.equal(report.empty,0);
  assert.equal(report.bonus.bonus,4);assert.equal(report.targetDiff,4);assert.equal(report.economyBonus,4);
  assert.ok(report.generated>0&&report.repeat);assert.equal(report.wrapped,19);assert.ok(report.bounded<19);
  assert.ok(report.heightValid&&report.heightCount>0&&report.herbs);
  assert.ok(report.notationValid&&report.notationGenerated);
  assert.ok(report.minimumValid);
  assert.ok(report.additionsValid&&report.addedPlacementValid);
  assert.deepEqual(report.addedGlyphs,["🐙","🦀","🦐","🦪","🍎","🍊"]);
  assert.ok(report.regionsValid);
  assert.ok(report.weightCounts.多>report.weightCounts.少*4);
  await page.evaluate(()=>{
    window.startV39LocalSession(1,{playMode:"single-test"});window.setV39TestMode(true);
    window.generateV39TestFieldWithSeed({w:12,h:12,patternId:"realistic"},"specialty-ui");
    const current=window.getV39GameState(),fixture=window.__specialtyFixture;
    fixture.state.players[0]={...current.players[0],...fixture.state.players[0]};
    window.__v39FieldRuntime.mapData=fixture.map;
    window.setV39GameState({...current,...fixture.state});window.renderV39ResourceTop();window.refreshV39MapEntities();
  });
  await page.addStyleTag({content:"#v39-play-mode-select,.vue-modal-backdrop{display:none!important}"});
  await page.locator("#v39-specialty-header").click();
  assert.equal(await page.locator("#resourceSet > button").count(),4);
  assert.deepEqual(await page.locator("#resourceSet > button").evaluateAll(rows=>rows.map(row=>row.getAttribute("aria-label"))),["食料","資材","金","特殊資源"]);
  const groups=await page.evaluate(()=>Object.fromEntries(Object.entries(window.getV39ResourceSnapshot()).map(([key,group])=>[key,group.items.map(item=>item.name)])));
  assert.deepEqual(groups.food,["穀物","野菜","肉","魚"]);
  assert.deepEqual(groups.material,["木材","石材","鉄"]);
  assert.deepEqual(groups.money,["金"]);
  for(const name of ["黒木","特木","銀鉄","銀","宝石","死体","魂"]) assert.ok(groups.special.includes(name));
  const accounting=await page.evaluate(async()=>{
    const {buildV39ResourceSnapshot}=await import("/src/lib/v39-economy-rules.js");
    const stock={foodStockByType:{穀物:10,野菜:20,肉:30,魚:40,死体:50,魂:60},materialStockByType:{木材:1,石材:2,鉄:3,黒木:4,金:5,銀:6}};
    const copy=structuredClone(stock);
    const snapshot=buildV39ResourceSnapshot(stock);
    return {totals:Object.fromEntries(Object.entries(snapshot).map(([key,group])=>[key,group.items.reduce((sum,row)=>sum+row.value,0)])),unchanged:JSON.stringify(copy)===JSON.stringify(stock)};
  });
  assert.deepEqual(accounting.totals,{food:100,material:6,money:5,special:120});
  assert.ok(accounting.unchanged);
  await page.evaluate(()=>document.getElementById("resourceModeToggle").click());
  assert.equal(await page.locator("#resourceSet > button").count(),4);
  await page.locator('[data-group="food"]').click();
  assert.ok(await page.locator("#resourceDrawer").evaluate(node=>node.classList.contains("show")));
  await page.evaluate(()=>document.getElementById("resourceModeToggle").click());
  await page.locator("#v39-specialty-header").click();
  await page.locator('[data-specialty-tab="specialties"]').click();
  assert.equal(await page.locator(".v39-specialty-row").count(),2);
  assert.ok((await page.locator("#v39-specialty-panel").innerText()).includes("2マス"));
  assert.ok(!(await page.locator("#v39-specialty-panel").innerText()).includes("宝石"));
  const saved=await page.evaluate(()=>{
    const save=window.createV39SaveData();const restored=window.migrateV39SaveData(JSON.parse(JSON.stringify(save))).save.gameState;
    return {tiles:Object.keys(restored.specialtiesByTile).length,discovered:Object.keys(restored.players[0].factionState.exploration.discoveredSpecialtiesByTile).length,
      markers:window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(row=>row.name==="v39-unit-layer").list.filter(row=>row.name==="v39-specialty-marker").length};
  });
  assert.equal(saved.tiles,4);assert.equal(saved.discovered,4);assert.equal(saved.markers,4);
  const bounds=await page.locator("#v39-specialty-header").boundingBox();assert.ok(bounds.x+ bounds.width<=441);
  await page.screenshot({path:"output/web-game/v39-specialties-mobile.png"});
  await page.setViewportSize({width:390,height:844});
  const narrow=await page.locator("#v39-specialty-header").boundingBox();assert.ok(narrow.x+narrow.width<=391);
  const visibleEdge=await page.locator("#resourceSet").boundingBox();assert.ok(narrow.x+narrow.width<=visibleEdge.x+visibleEdge.width+1);
  await page.screenshot({path:"output/web-game/v39-specialties-mobile-390.png"});
  const display=await page.evaluate(()=>{
    const state=window.getV39GameState(), original=structuredClone(state.players[0].factionState.exploration);
    const updateExploration=value=>{
      const current=window.getV39GameState();
      window.setV39GameState({players:current.players.map(player=>player.id!=="p"?player:{...player,factionState:{...player.factionState,exploration:value}})});
      window.refreshV39MapEntities();
    };
    const markers=()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(row=>row.name==="v39-unit-layer").list.filter(row=>row.name==="v39-specialty-marker");
    updateExploration({...original,discoveredSpecialtiesByTile:{}});
    const preview=markers().map(row=>({key:row.getData("tileKey"),alpha:row.alpha,occupied:row.getData("occupied")}));
    const undiscoveredCount=Object.keys(window.getV39GameState().players[0].factionState.exploration.discoveredSpecialtiesByTile).length;
    window.setV39TestMode(false);window.refreshV39MapEntities();const hidden=markers().length;
    window.setV39TestMode(true);updateExploration(original);
    const unit=markers().find(row=>row.getData("tileKey")==="5,5");
    const empty=markers().find(row=>row.getData("tileKey")==="6,5");
    const occupied={occupied:unit.getData("occupied"),alpha:unit.alpha,x:unit.x,y:unit.y};
    const centered={occupied:empty.getData("occupied"),alpha:empty.alpha,x:empty.x,y:empty.y};
    const current=window.getV39GameState();
    window.setV39GameState({players:current.players.map(player=>player.id!=="p"?player:{...player,factionState:{...player.factionState,units:player.factionState.units.map(row=>({...row,x:6,y:5}))}})});
    window.refreshV39MapEntities();
    const moved=Object.fromEntries(markers().map(row=>[row.getData("tileKey"),row.getData("occupied")]));
    // カメラをマーカーへ寄せ、中央・ユニット右上の位置を目視確認する。
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    scene.cameras.main.setZoom(1.4);scene.cameras.main.centerOn(centered.x,centered.y);
    return {preview,undiscoveredCount,hidden,occupied,centered,moved};
  });
  assert.equal(display.preview.length,4);assert.ok(display.preview.every(row=>row.alpha===0.6));
  assert.equal(display.undiscoveredCount,0);assert.equal(display.hidden,0);
  assert.ok(display.occupied.occupied);assert.equal(display.centered.occupied,false);
  assert.equal(display.occupied.alpha,1);assert.equal(display.centered.alpha,1);
  assert.ok(display.occupied.y<display.centered.y);assert.equal(display.moved["5,5"],false);assert.equal(display.moved["6,5"],true);
  await page.locator("[data-specialty-close]").click();
  await page.waitForTimeout(150);
  await page.screenshot({path:"output/web-game/v39-specialty-marker-position.png"});
  await page.locator("#v39-specialty-header").click();
  await page.evaluate(()=>window.setV39GameState({activePlayerId:"q"}));
  await page.evaluate(()=>window.renderV39ResourceTop());
  assert.ok(await page.locator("#v39-specialty-panel").isHidden());
  assert.deepEqual(errors,[]);console.log(JSON.stringify({report,saved,display,errors},null,2));
} finally {await browser.close();}
