import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out = "output/web-game/cave-bow-targeting";
mkdirSync(out, { recursive:true });
const browser = await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page = await browser.newPage({ viewport:{ width,height:844 } }), errors=[];
    page.on("pageerror", error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3000", { waitUntil:"networkidle" });
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button", { name:"探索ゲーム",exact:true }).click();
    await page.getByRole("button", { name:"探索開始",exact:true }).click();
    await page.waitForTimeout(600);
    const reports=[];
    for (const blocked of [false,true,"遮断"]) {
      const initial=await page.evaluate(blocked=>{
        const map=window.__v39FieldRuntime.mapData;
        const underground=map.isUnderground;
        map.grid=map.grid.map(row=>row.map(()=>"洞窟"));
        map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
        map.defenseStructures=[];
        const state=window.getV39GameState(),player=state.players[0],original=player.factionState.units[0];
        const unit={...original,race:"只人",className:"アーチャー",level:5,x:5,y:10,
          equipment:[{slot:"武器1",name:"弓"}],ap:100,currentAp:100,testSkillNames:[]};
        const friend={...unit,id:"bow-friend",name:"射線上の味方",x:7,
          ...(blocked==="遮断"?{rayBlockExpiresAtTurn:3}:{})};
        const enemy={id:"bow-victim",name:"射程試験敵",worldId:state.activeWorldId,x:9,y:10,
          hp:5000,currentHp:5000,maxHp:5000,level:1,status:{防御:0,精神:0,速度:1},resistances:{}};
        window.setV39GameState({players:[{...player,factionState:{...player.factionState,squads:[],
          selectedUnitId:unit.id,combatRuntime:{},units:blocked?[unit,friend]:[unit]}}],
          neutralVillages:[],enemies:[enemy],timeline:{...state.timeline,turnNumber:1,phase:"player"}});
        window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:unit.id}}));
        window.__bowLog=null;
        window.addEventListener("v39:combat-log",event=>{window.__bowLog=event.detail;},{once:true});
        return {underground,worldId:state.activeWorldId};
      },blocked);
      assert.equal(initial.underground,true);
      await page.locator('[data-foot="squad"]').click();
      await page.locator('[data-squad-detail-tab="action"]').click();
      assert.equal((await page.locator('[data-v39-technique-name="弓"] .technique-range').textContent()).trim(),"射 25");
      await page.locator('[data-v39-technique-name="弓"]').click();
      const result=await page.evaluate(()=>{
        const session=window.getV39AttackSession();
        window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}}));
        const outsideAp=window.getV39ActiveFactionState().units[0].ap;
        window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:9,y:10}}));
        return {session,outsideAp,log:window.__bowLog,ap:window.getV39ActiveFactionState().units[0].ap,
          hp:window.getV39GameState().enemies[0].hp};
      });
      assert.equal(result.session.range,5);
      assert.equal(result.outsideAp,100);
      assert.ok(!result.session.rangeTileKeys.includes("11,10"));
      assert.ok(result.session.rangeTileKeys.includes("9,10"));
      assert.ok(result.ap<100);
      if (blocked!=="遮断") {
        assert.ok(result.log.entries.length>0);
        assert.ok(result.log.entries[0].hitResults.length>0);
      } else {
        assert.equal(result.hp,5000);
        assert.equal(result.log.entries.length,0);
        assert.match(result.log.summary,/味方.*遮断で停止.*対象に未到達/u);
        assert.equal(result.log.obstruction.message,"射線遮断");
        assert.deepEqual({x:result.log.obstruction.x,y:result.log.obstruction.y},{x:7,y:10});
        assert.ok(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]
          .children.list.some(child=>child.text==="射線遮断")));
      }
      reports.push({blocked,initial,result});
      await page.screenshot({path:`${out}/${width}-${blocked==="遮断"?"blocked":blocked?"friendly":"clear"}.png`});
    }
    assert.deepEqual(errors,[]);
    writeFileSync(`${out}/${width}.json`,JSON.stringify(reports,null,2));
    console.log(`${width}: ${JSON.stringify(reports.map(({blocked,result})=>({blocked,hp:result.hp,ap:result.ap,summary:result.log.summary})))}`);
    await page.close();
  }
} finally { await browser.close(); }
