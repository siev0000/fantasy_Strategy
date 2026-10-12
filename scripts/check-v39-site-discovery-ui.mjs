import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/site-discovery";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:1100,height:844}}), errors=[];
  page.on("pageerror",error=>errors.push(error.stack));
  await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.evaluate(()=>{
    const state=window.getV39GameState(),map=structuredClone(window.__v39FieldRuntime.mapData);
    map.isUnderground=false;map.grid=Array.from({length:map.h},()=>Array(map.w).fill("平地"));
    map.specialMap=Array.from({length:map.h},()=>Array(map.w).fill(""));map.specialMap[8][8]="洞窟";
    map.defenseStructures=[];map.fogMap=[];
    window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
    const player=state.players.find(row=>row.id===state.activePlayerId);
    window.setV39GameState({activeWorldId:"surface",worldEnvironment:{},explorationSitesByTile:{"9,8":{featureId:"地形:薬草の群生地",featureName:"薬草の群生地",x:9,y:8}},specialtiesByTile:{},
      players:[{...player,factionState:{...player.factionState,research:{},exploration:{researchDiscoveryVersion:1},units:player.factionState.units.map(unit=>({...unit,race:"fixture",className:"fixture",worldId:"surface",x:8,y:8,skillLevels:{索敵:0},status:{...unit.status,索敵:0},索敵:0,scoutRange:0}))}}]});
  });
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile?.["8,8"]),false);
  const setScout=value=>page.evaluate(value=>{
    const faction=window.getV39ActiveFactionState();
    window.updateV39ActiveFactionState({units:faction.units.map(unit=>({...unit,skillLevels:{索敵:value},status:{...unit.status,索敵:value},索敵:value,scoutRange:value}))},{reason:"scout-fixture"});
  },value);
  await setScout(49);
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile?.["8,8"]),false);
  await setScout(50);
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile?.["8,8"]),true);
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredFeaturesByTile?.["9,8"]),true);
  await page.evaluate(()=>{
    const map=structuredClone(window.__v39FieldRuntime.mapData);map.specialMap[8][7]="洞窟";
    // Hide before introducing the entrance to avoid remembering a previously found place.
    if(!window.addV39SiteConcealment({tileKeys:["7,8","8,9"],stealthBonus:100,turns:2}))throw new Error("concealment rejected");
    const current=window.getV39GameState(), faction=window.getV39ActiveFactionState();
    window.setV39GameState({explorationSitesByTile:{...current.explorationSitesByTile,"8,9":{featureId:"地形:金山",featureName:"金山",x:8,y:9,隠密:50}}});
    window.updateV39ActiveFactionState({research:{...faction.research,progress:{completedByCategoryLevel:{地質調査Lv:{1:["地質調査Lv:1:地質調査Ⅰ"]}}}}});
    window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
    window.dispatchEvent(new CustomEvent("v39:field-layer-changed"));
  });
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile?.["7,8"]),false);
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredFeaturesByTile?.["8,9"]),false);
  await page.evaluate(()=>{
    const state=window.getV39GameState();window.importV39SaveJson(window.exportV39SaveJson());
    if(window.getV39GameState().worldEnvironment.siteConcealmentEffects[0].stealthBonus!==100)throw new Error("concealment lost on save");
    window.setV39GameState({timeline:{...state.timeline,turnNumber:state.timeline.turnNumber+2}});
  });
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile?.["7,8"]),true);
  assert.equal(await page.evaluate(()=>!!window.getV39ActiveFactionState().exploration.discoveredFeaturesByTile?.["8,9"]),true);
  await page.screenshot({path:`${out}/proximity.png`});
  assert.deepEqual(errors,[]);
  console.log("site discovery: research-free cave/herbs, 49/50 threshold, concealment, expiry and save passed");
} finally {await browser.close();}
