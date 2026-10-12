import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const directory="output/web-game/cave-conquest";mkdirSync(directory,{recursive:true});
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
      window.enterV39Cave({seed:"conquest-ui",floor:3,caveTest:true});
      // Simulate the test mode's enemy removal after a generated boss encounter.
      window.setV39GameState({enemies:[],groundLootByTile:{}});
      document.querySelector('[data-squad-detail-tab="action"]').click();
    });
    assert.equal(await page.locator("#v39-cave-conquest-choice").isVisible(),true);
    await page.screenshot({path:`${directory}/${width}-choice.png`});
    await page.locator("#v39-cave-conquest-defer").click();
    assert.equal(await page.locator("#v39-cave-conquest-choice").isVisible(),false);
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    await page.waitForTimeout(200);
    assert.equal(await page.locator("#v39-cave-conquest-choice").isVisible(),false);
    await page.locator('[data-squad-detail-tab="action"]').click();
    assert.equal(await page.locator("#v39-cave-mine-claim").isVisible(),true);
    assert.equal(await page.locator("#v39-cave-mine-claim").isEnabled(),true);
    const report=await page.evaluate(async()=>{
      const check=(condition,message)=>{if(!condition)throw new Error(message);};
      const worldId=window.getV39GameState().activeWorldId;
      const cleared=window.__v39FieldRuntime.mapData;
      const oldBossIds=[...cleared.caveBossIds],oldRace=cleared.caveConquest.previousRace;
      const moveAway=()=>{
        window.enterV39Cave({seed:"conquest-ui",floor:4,caveTest:true,parentWorldId:worldId});
        window.setV39GameState({enemies:[],groundLootByTile:{}});
      };
      const tick=async()=>{if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("turn rejected");};
      moveAway();
      for(let i=0;i<3;i++)await tick();
      let snapshot=window.getV39GameState().explorationWorlds[worldId];
      check(snapshot.map.caveConquest.progressTurns===3,"absent three turns did not progress to three");
      check(snapshot.spatial.enemies.length===0,"premature respawn");
      window.enterV39Cave({seed:"conquest-ui",floor:3,caveTest:true,worldId});
      await tick();await tick();
      check(window.__v39FieldRuntime.mapData.caveConquest.progressTurns===1,"two visits did not roll back to one");
      moveAway();
      for(let i=0;i<4;i++)await tick();
      snapshot=window.getV39GameState().explorationWorlds[worldId];
      const boss=snapshot.spatial.enemies.find(unit=>unit.isCaveBoss);
      check(boss&&boss.hp>0,"new boss did not spawn");
      check(boss.race!==oldRace,"did not prefer another species");
      check(!oldBossIds.includes(boss.id)&&snapshot.map.caveBossIds.includes(boss.id),"boss generation IDs not updated");
      check(snapshot.spatial.enemyNests.length===1,"one nest not created");
      check(snapshot.spatial.enemies.length===3,"expected two settlers plus boss");
      check(snapshot.spatial.enemies.every(unit=>unit.nestId===snapshot.spatial.enemyNests[0].id&&unit.worldId===worldId),"nest/world assignment mismatch");
      const afterRespawn={race:boss.race,nest:snapshot.spatial.enemyNests[0].name,bossId:boss.id,generation:snapshot.map.caveConquest.generation};
      window.importV39SaveJson(window.exportV39SaveJson());
      snapshot=window.getV39GameState().explorationWorlds[worldId];
      check(snapshot.spatial.enemies.length===3,"recolonized world not saved");
      window.enterV39Cave({seed:"conquest-ui",floor:3,caveTest:true,worldId});
      try{window.claimV39CaveMine();throw new Error("live boss allowed reclaim");}catch(error){check(error.message.includes("ボス"),error.message);}
      window.setV39GameState({enemies:[],groundLootByTile:{},enemyNests:[],enemySquads:[]});
      document.querySelector('[data-squad-detail-tab="action"]').click();
      check(!document.getElementById("v39-cave-conquest-choice").hidden,"new boss defeat did not ask again");
      return afterRespawn;
    });
    await page.locator("#v39-cave-conquest-accept").click();
    assert.equal(await page.locator("#v39-cave-conquest-choice").isVisible(),false);
    const afterMine=await page.evaluate(async()=>{
      const worldId=window.getV39GameState().activeWorldId;
      window.enterV39Cave({seed:"conquest-ui",floor:4,caveTest:true,parentWorldId:worldId});
      window.setV39GameState({enemies:[],groundLootByTile:{}});
      for(let i=0;i<6;i++)await window.advanceV39Turn({skipUnactedFocus:true});
      const snapshot=window.getV39GameState().explorationWorlds[worldId];
      if(!snapshot.map.caveMine||snapshot.spatial.enemies.length)throw new Error("mined cave recolonized");
      return {mine:snapshot.map.caveMine,conquest:snapshot.map.caveConquest};
    });
    assert.equal(afterMine.mine.stockByResource.鉱石,6);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,report,afterMine}));
    await page.close();
  }
}finally{await browser.close();}
