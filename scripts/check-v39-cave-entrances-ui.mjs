import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/cave-entrances";mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.evaluate(()=>{
      const state=window.getV39GameState(),map=structuredClone(window.__v39FieldRuntime.mapData);
      map.isUnderground=false;map.caveBossIds=[];map.caveMine=null;map.caveConquest=null;map.fogMap=[];map.defenseStructures=[];
      map.grid=Array.from({length:map.h},()=>Array(map.w).fill("平地"));
      map.specialMap=Array.from({length:map.h},()=>Array(map.w).fill(""));
      map.specialMap[8][8]="洞窟";map.grid[8][10]="洞窟";map.specialMap[20][20]="洞窟";
      const pid=state.activePlayerId,player=state.players.find(row=>row.id===pid),units=player.factionState.units.map((unit,index)=>({...unit,worldId:"surface",x:8+index,y:8,ap:100,currentAp:100}));
      const faction={...player.factionState,units,research:{progress:{completedByCategoryLevel:{地下探索Lv:{1:["地下探索Lv:1:地下探索Ⅰ"]}}}},exploration:{},visibility:{},villagePlacementMode:false};
      const other={...player,id:"entrance-other",factionState:{...faction,units:[],squads:[],selectedUnitId:""}};
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({activeWorldId:"surface",explorationWorlds:{},players:[{...player,factionState:faction},other],
        enemies:[],enemyNests:[],enemySquads:[],neutralVillages:[],settlements:[],groundLootByTile:{},explorationSitesByTile:{},specialtiesByTile:{},territoryOwnerByTile:{}});
      window.setV39TestMode(false);window.renderV39TerrainIcons();window.refreshV39SquadDerivedUI();
    });
    await page.waitForTimeout(300);
    const inspect=()=>page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const overlay=scene.children.list.find(child=>child.name==="v39-terrain-icon-overlay");
      return (overlay?.list||[]).filter(image=>image.getData?.("caveEntrance")).map(image=>({name:image.name,visible:image.visible,alpha:image.alpha}));
    });
    let icons=await inspect();assert.equal(icons.length,3);assert.equal(icons.some(icon=>icon.visible),false);
    assert.equal(await page.locator("#v39-cave-enter-action").isVisible(),false);
    await page.evaluate(()=>{
      try{window.enterV39Cave();throw new Error("unfound entry allowed");}catch(error){if(!error.message.includes("未発見"))throw error;}
      try{window.enterV39Cave({seed:"bypass"});throw new Error("seed bypass allowed");}catch(error){if(!error.message.includes("未発見"))throw error;}
      window.setV39TestMode(true);
    });
    await page.waitForTimeout(150);
    icons=await inspect();assert.equal(icons.every(icon=>icon.visible&&icon.alpha===0.6),true);
    await page.screenshot({path:`${out}/${width}-test.png`});
    await page.evaluate(()=>window.setV39TestMode(false));
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const surveyed=await page.evaluate(async()=>{
      const result=window.startV39Survey({x:8,y:8});
      if(!result.ok)throw new Error(result.reason);
      if(window.getV39SelectedSquadUnit().ap!==0)throw new Error("survey did not consume remaining AP");
      if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("turn failed");
      if(window.getV39GameState().timeline.turnNumber===1)await window.advanceV39Turn({skipUnactedFocus:true});
      const state=window.getV39GameState(),faction=window.getV39ActiveFactionState();
      if(!faction.exploration.discoveredCaveEntrancesByTile["8,8"])throw new Error(`surface cave not discovered ${JSON.stringify({task:result.task,units:faction.units.map(unit=>({id:unit.id,worldId:unit.worldId,task:unit.surveyTask})),exploration:faction.exploration,terrain:window.__v39FieldRuntime.mapData.specialMap[8][8],world:state.activeWorldId})}`);
      if(faction.exploration.discoveredCaveEntrancesByTile["20,20"])throw new Error("outside survey cave discovered");
      if(!faction.activityLog.some(log=>log.message?.includes("洞窟入口")))throw new Error("discovery missing from log");
      const pid=state.activePlayerId;
      window.setV39GameState({activePlayerId:"entrance-other"});
      return {pid,discovered:faction.exploration.discoveredCaveEntrancesByTile};
    });
    await page.waitForTimeout(150);icons=await inspect();assert.equal(icons.some(icon=>icon.visible),false);
    await page.evaluate(pid=>window.setV39GameState({activePlayerId:pid}),surveyed.pid);
    await page.waitForTimeout(150);icons=await inspect();assert.equal(icons.find(icon=>icon.name.endsWith(":8,8")).visible,true);
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    await page.waitForTimeout(200);
    await page.evaluate(()=>document.querySelector('[data-squad-detail-tab="basic"]').click());
    assert.equal(await page.locator("#v39-cave-enter-action").isVisible(),true);
    await page.locator("#v39-cave-enter-action").scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/${width}-discovered.png`});
    await page.locator("#v39-cave-enter-action").click();
    const entered=await page.evaluate(()=>window.getV39GameState().activeWorldId);
    assert.equal(entered,"cave:entrance-8-8:1");
    await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit(),entry=map.entrances.find(tile=>tile.surfaceEntrance?.x===8&&tile.surfaceEntrance?.y===8);
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.id===actor.id?{...unit,x:entry.x,y:entry.y}:unit)});
      window.leaveV39Cave();
      if(!window.getV39ActiveFactionState().exploration.discoveredCaveEntrancesByTile["8,8"])throw new Error("discovery lost on return");
    });
    assert.deepEqual(errors,[]);console.log(JSON.stringify({width,surveyed,entered}));
    await page.close();
  }
}finally{await browser.close();}
