import assert from "node:assert/strict";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch(),page=await browser.newPage(),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try{
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const report=await page.evaluate(async()=>{
    const check=(condition,message)=>{if(!condition)throw new Error(message);};
    const {currentV39TurnNumber}=await import("/src/lib/v39-turn-timing.js");
    const {withV39WorldContext}=await import("/src/v39/core/v39-world-context.js");
    window.startV39LocalSession(1,{playMode:"single-test"});
    const map={w:2,h:2,grid:[["平地","平地"],["平地","平地"]]};
    window.setV39GameState({explorationWorlds:{surface:{map},other:{map}},timeline:{turnNumber:9}});
    const full=window.getV39GameState();full.explorationWorlds.other.map.grid[0][0]="海";
    check(window.getV39GameState().explorationWorlds.other.map.grid[0][0]==="平地","full snapshot stays defensive");
    const partial=window.getV39GameState({includeWorlds:false});
    check(Object.keys(partial.explorationWorlds).length===0&&partial.players.length>0,"current-only snapshot excludes saved worlds");
    window.setV39GameState({timeline:{paused:true}});
    check(window.getV39GameState().explorationWorlds.other.map.grid[0][0]==="平地","timeline write preserves saved map");
    const originalGet=window.getV39GameState,originalCapture=window.captureV39ExplorationWorlds;
    let fullReads=0,captures=0;
    window.getV39GameState=(...args)=>{fullReads++;return originalGet(...args);};
    window.captureV39ExplorationWorlds=()=>{captures++;return originalCapture();};
    try{
      for(let i=0;i<1000;i++)check(currentV39TurnNumber()===9,"timeline-only read");
      check(fullReads===0,"turn lookup does not clone whole state");
      const events=Array.from({length:1000},()=>({type:"move",enemyId:"hidden",from:{x:0,y:0},to:{x:1,y:0}}));
      check(await window.playV39EnemyTurnPresentation(events)===0,"hidden/missing enemy has no animation");
      check(fullReads===0,"hidden animation filtering has no per-event snapshot");
      await withV39WorldContext("surface",()=>{check(window.getV39EnemyTurnState().activeWorldId==="surface","visible world active");});
      check(captures===0,"visible world stages do not capture map");
    }finally{window.getV39GameState=originalGet;window.captureV39ExplorationWorlds=originalCapture;}
    return {turnQueries:1000,hiddenEvents:1000,fullReads,captures};
  });
  assert.deepEqual(errors,[]);console.log("PASS performance contracts",report);
}finally{await browser.close();}
