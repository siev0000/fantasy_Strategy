import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out = "output/web-game/research-discovery";
mkdirSync(out, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page = await browser.newPage({ viewport:{width,height:844} }), errors = [];
    page.on("pageerror", error => errors.push(error.stack));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", {name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button", {name:"探索開始",exact:true}).click();
    await page.evaluate(() => {
      const state=window.getV39GameState(), map=structuredClone(window.__v39FieldRuntime.mapData);
      map.isUnderground=false; map.caveBossIds=[]; map.caveMine=null; map.caveConquest=null;
      map.fogMap=[]; map.defenseStructures=[];
      map.grid=Array.from({length:map.h},()=>Array(map.w).fill("平地"));
      map.specialMap=Array.from({length:map.h},()=>Array(map.w).fill(""));
      map.specialMap[8][8]="洞窟";
      const player=state.players.find(row=>row.id===state.activePlayerId);
      const units=player.factionState.units.map((unit,i)=>({...unit,worldId:"surface",x:8+i,y:8,
        level:30,ap:i===0?40:100,currentAp:i===0?40:100,actionPoint:i===0?40:100,skillLevels:{...unit.skillLevels,技術:0}}));
      const faction={...player.factionState,units,research:{},exploration:{},visibility:{},villagePlacementMode:false};
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({activeWorldId:"surface",explorationWorlds:{},players:[{...player,factionState:faction}],
        enemies:[],enemyNests:[],enemySquads:[],neutralVillages:[],settlements:[],groundLootByTile:{},territoryOwnerByTile:{},
        explorationSitesByTile:{"8,9":{key:"8,9",x:8,y:9,featureId:"地形:金山",featureName:"金山"}},
        specialtiesByTile:{"8,8":{key:"8,8",x:8,y:8,name:"鉄"},"9,8":{key:"9,8",x:9,y:8,name:"ベリー"},
          "8,9":{key:"8,9",x:8,y:9,name:"銀鉄"},"20,20":{key:"20,20",x:20,y:20,name:"鉄"}}});
      window.setV39TestMode(false); window.renderV39TerrainIcons(); window.refreshV39SquadDerivedUI();
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const progress = await page.evaluate(async () => {
      const first=window.startV39Survey({x:8,y:8});
      if(!first.ok||first.apCost!==40||first.task.progressAp!==40)throw new Error("partial survey failed");
      if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("first turn failed");
      if(window.getV39SelectedSquadUnit().surveyTask?.progressAp!==40)throw new Error("progress lost");
      window.importV39SaveJson(window.exportV39SaveJson());
      const actor=window.getV39SelectedSquadUnit();
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(u=>u.id===actor.id?{...u,ap:100,currentAp:100,actionPoint:100}:u)});
      const next=window.startV39Survey({x:8,y:8});
      if(!next.ok||next.apCost!==60||next.task.progressAp!==100||window.getV39SelectedSquadUnit().ap!==40)throw new Error("remaining AP not preserved");
      if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("second turn failed");
      const faction=window.getV39ActiveFactionState(),e=faction.exploration;
      if(!e.surveyedTileKeys.includes("8,8")||e.discoveredCaveEntrancesByTile["8,8"]||e.discoveredSpecialtiesByTile["8,8"]||e.discoveredFeaturesByTile["8,9"])throw new Error("locked research discovered");
      if(!e.discoveredSpecialtiesByTile["9,8"])throw new Error("ordinary food not discovered");
      if(window.inspectV39Survey({x:8,y:8}).available)throw new Error("locked sites allow repeated survey");
      return {first:first.apCost,second:next.apCost,remaining:40};
    });
    assert.equal(await page.locator("#v39-cave-enter-action").isVisible(),false);
    await page.locator('[data-v39-research-category="地質調査Lv"]').click();
    assert.equal(await page.locator("[data-research-category]").count(),8);
    const firstTargets = await page.locator("[data-research-discovery-targets] p").innerText();
    for (const name of ["鉄","銀","金山","銀鉱脈"]) assert.equal(firstTargets.split("・").includes(name),true);
    assert.equal(firstTargets.includes("銀鉄"),false);
    assert.match(await page.locator("[data-research-discovery-targets]").innerText(),/未調査マスは調査が必要/);
    await page.locator("[data-select-research]").click();
    await page.evaluate(()=>window.addV39ResearchExperience("地質調査Lv",99));
    assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredSpecialtiesByTile["8,8"]),false);
    await page.screenshot({path:`${out}/${width}-research.png`});
    await page.evaluate(async()=>{
      if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("research completion turn failed");
    });
    const geology=await page.evaluate(()=>{
      const e=window.getV39ActiveFactionState().exploration;
      if(!e.discoveredSpecialtiesByTile["8,8"]||!e.discoveredFeaturesByTile["8,9"])throw new Error("research completion not revealed");
      if(e.discoveredSpecialtiesByTile["8,9"]||e.discoveredSpecialtiesByTile["20,20"])throw new Error("higher level/unsurveyed revealed");
      const s=window.getV39GameState(),p=s.players[0];
      window.setV39GameState({players:[p,{...p,id:"research-other",factionState:{...p.factionState,research:{},exploration:{surveyedTileKeys:["8,8"]},units:[],squads:[]}}],
        explorationWorlds:{"cave:stored:1":{map:{isUnderground:true,grid:[["洞窟"]]},spatial:{specialtiesByTile:{"0,0":{name:"鉄",x:0,y:0}}},exploration:{[p.id]:{surveyedTileKeys:["0,0"]}}}}});
      // An actual next research completion must also update the stored world.
      const selected=window.selectV39Research("地質調査Lv","地質調査Lv:2:地質調査Ⅱ");
      if(!selected.changed)throw new Error("Lv2 research selection failed");
      window.addV39ResearchExperience("地質調査Lv",200);
      const next=window.getV39GameState(),e2=window.getV39ActiveFactionState().exploration;
      if(!e2.discoveredSpecialtiesByTile["8,9"])throw new Error("Lv2 resource not revealed");
      if(!next.explorationWorlds["cave:stored:1"].exploration[p.id].discoveredSpecialtiesByTile["0,0"])throw new Error("inactive world not revealed");
      if(next.players[1].factionState.exploration.discoveredSpecialtiesByTile["8,8"])throw new Error("research shared with another player");
      return Object.keys(e2.discoveredSpecialtiesByTile);
    });
    await page.locator('[data-research-category="地下探索Lv"]').click();
    assert.equal(await page.locator("[data-research-discovery-targets] p").innerText(),"洞窟");
    await page.locator("[data-select-research]").click();
    await page.evaluate(()=>window.addV39ResearchExperience("地下探索Lv",100));
    await page.evaluate(()=>{
      const before=window.getV39SelectedSquadUnit().ap;
      window.importV39SaveJson(window.exportV39SaveJson());
      if(!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile["8,8"])throw new Error("cave discovery lost in save");
      if(window.getV39SelectedSquadUnit().ap!==before)throw new Error("auto discovery consumed AP");
      document.getElementById("researchModal").classList.remove("open");
      document.querySelector('[data-squad-detail-tab="action"]').click();
    });
    await page.locator("#v39-cave-enter-action").scrollIntoViewIfNeeded();
    assert.equal(await page.locator("#v39-cave-enter-action").isVisible(),true);
    await page.screenshot({path:`${out}/${width}-discovered.png`});
    await page.locator("#v39-cave-enter-action").click();
    assert.match(await page.evaluate(()=>window.getV39GameState().activeWorldId),/^cave:entrance-/);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,progress,geology,entry:true,save:true,inactiveWorld:true}));
    await page.close();
  }
} finally { await browser.close(); }
