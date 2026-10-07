import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-layout",{recursive:true});
const browser=await chromium.launch(),errors=[];
try {
  const page=await browser.newPage({viewport:{width:1100,height:844}});
  page.on("pageerror",error=>errors.push(String(error)));
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  const report=await page.evaluate(async()=>{
    const cave=await import("/src/lib/v39-cave-generator.js"),hex=await import("/src/lib/hex-grid.js");
    const config=await import("/src/lib/phaser-map-panel-config.js"),detect=await import("/src/lib/v39-detection-rules.js");
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    let cases=0;
    for(const template of cave.V39_CAVE_TEMPLATES) {
      const shapes=new Set();
      for(let i=0;i<20;i++)for(const entranceCount of [2,3,4]) {
        const options={seed:`layout-${i}`,templateId:template.id,entranceCount};
        const map=cave.generateV39CaveMap(options),seen=new Set([map.entrances[0].key]),queue=[map.entrances[0]];
        for(let cursor=0;cursor<queue.length;cursor++)for(const next of hex.getHexNeighborCoords(map.w,map.h,queue[cursor].x,queue[cursor].y)) {
          if(seen.has(next.key)||map.grid[next.y][next.x]!=="洞窟")continue;
          seen.add(next.key);queue.push(next);
        }
        check(map.grid.flat().filter(value=>value==="洞窟").length===seen.size,`${template.id}/${i}: isolated floor`);
        check(map.entrances.every(entry=>seen.has(entry.key)),"all entrances connected");
        check(map.grid.every((line,y)=>line.every((terrain,x)=>x>0&&y>0&&x<map.w-1&&y<map.h-1||terrain==="岩壁")),"outer wall");
        const ratio=(map.w*config.HEX_TILE_CONFIG.width)/((map.h-1)*config.HEX_TILE_CONFIG.rowStep+config.HEX_TILE_CONFIG.height);
        check(ratio>0.9&&ratio<1.1,"square display bounds");
        check(JSON.stringify(map)===JSON.stringify(cave.generateV39CaveMap(options)),"same seed repeats");
        check(map.entrances[0].y>=3&&map.entrances[0].x<=map.w-3,"smith margin");
        shapes.add(JSON.stringify(map.grid));cases++;
      }
      check(shapes.size>=15,`${template.id}: insufficient variations`);
    }
    check(detect.resolveEffectiveScoutAtDistance(100,2)===50,"ground unchanged");
    check(detect.resolveEffectiveScoutAtDistance(100,3,{isUnderground:true})===100,"cave bonus protects scout");
    check(detect.resolveEffectiveScoutAtDistance(100,4,{isUnderground:true})===75,"cave decay resumes at half rate");
    check(detect.resolveEffectiveScoutAtDistance(100,5,{isUnderground:true})===50,"cave decay each tile");
    check(detect.resolveEffectiveScoutAtDistance(100,7,{isUnderground:true})===0,"cave decay stops at zero");
    check(detect.resolveV39UnitVisionRange({索敵:150})===3,"ground vision unchanged");
    check(detect.resolveV39UnitVisionRange({索敵:150},{isUnderground:true})===7,"cave vision gains two per step");
    check(detect.resolveV39UnitVisionRange({索敵:37.4},{isUnderground:true})===3,"below fractional threshold");
    check(detect.resolveV39UnitVisionRange({索敵:37.5},{isUnderground:true})===4,"fractional threshold adds one tile");
    check(!detect.isDetectedByScout({scout:100,stealth:1,distance:2,inRange:false,mapData:{isUnderground:true}}),"range still enforced");
    const ai=await import("/src/lib/v39-enemy-ai-planner.js"),intel=await import("/src/lib/v39-faction-intelligence-rules.js");
    const open={w:16,h:16,isUnderground:true,worldWrapEnabled:false,grid:Array.from({length:16},()=>Array(16).fill("洞窟"))};
    const observer={id:"observer",x:3,y:5,hp:100,maxHp:100,ap:100,aggressive:true,worldId:"cave",索敵:100,status:{移動:100}};
    const target={id:"target",x:8,y:5,hp:100,maxHp:100,worldId:"cave",隠密:40};
    const state={activeWorldId:"cave",enemies:[observer],players:[{id:"p",factionState:{units:[target],villages:[]}}]};
    check(ai.inspectEnemyAiState(state,observer.id,1,open).targetId===target.id,"AI uses cave decay");
    const vision=intel.collectV39FactionVision({...state,players:[{id:"p",factionState:{units:[observer],villages:[]}}]},"p",open);
    check(vision.detectionByTile.get("8,5")===50,"faction intelligence uses same cave decay");
    return {cases,square:true,variations:true,connected:true,detection:true};
  });
  await page.locator("[data-v39-cave-test]").click();
  await page.locator(".cave-test-dialog select").first().selectOption("branch");
  await page.getByRole("button",{name:"生成",exact:true}).click();
  await page.screenshot({path:"output/web-game/cave-layout/desktop.png"});
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.generationVersion),2);
  await page.screenshot({path:"output/web-game/cave-layout/gameplay.png"});
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  await page.screenshot({path:"output/web-game/cave-layout/mobile.png"});
  assert.deepEqual(errors,[]);console.log("PASS",report);
} finally {await browser.close();}
