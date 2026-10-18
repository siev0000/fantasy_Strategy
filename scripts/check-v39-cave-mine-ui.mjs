import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const directory="output/web-game/cave-mine";
mkdirSync(directory,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [1100,390]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack));
    await page.goto(process.env.V39_TEST_URL||"http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(500);
    await page.evaluate(()=>window.enterV39Cave({seed:"mine-ui",floor:3,caveTest:true}));
    await page.waitForTimeout(300);
    const bossInfo=await page.evaluate(()=>{
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
      const actor=window.getV39SelectedSquadUnit(),boss=state.enemies.find(unit=>unit.isCaveBoss);
      if(!boss||!map.caveBossIds.includes(boss.id))throw new Error("generated boss not persisted");
      if(!document.getElementById("v39-cave-mine-claim").disabled)throw new Error("living boss allowed claim");
      const position=map.grid.flatMap((row,y)=>row.flatMap((tile,x)=>tile==="洞窟"&&Math.abs(x-boss.x)<=1&&Math.abs(y-boss.y)<=1&&!(x===boss.x&&y===boss.y)?[{x,y}]:[]))[0];
      window.setV39GameState({enemies:state.enemies.map(unit=>unit.id===boss.id?{...unit,hp:1,currentHp:1}:({...unit,hp:0,currentHp:0})),
        players:state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...player.factionState,
          units:player.factionState.units.map(unit=>unit.id===actor.id?{...unit,...position,ap:100,currentAp:100,status:{...unit.status,命中:99999}}:unit)}})});
      const random=Math.random;Math.random=()=>random()*.5;
      try{
        if(!window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:actor.id,targetUnitId:boss.id,
          skillRow:{名前:"鉱床攻略テスト",行動:"A",全威力:100000,判定:"攻撃",攻撃手段:"素手",射程:100,AP消費:10}}))throw new Error("boss attack rejected");
      }finally{Math.random=random;}
      return {bossId:boss.id,worldId:state.activeWorldId};
    });
    await page.waitForTimeout(1800);
    await page.evaluate(()=>{
      const state=window.getV39GameState();
      if(state.enemies.some(unit=>unit.hp>0))throw new Error("boss survived native combat");
      window.activateV39FooterTab?.("squad");
      window.refreshV39SquadDerivedUI?.();
      document.querySelector('[data-squad-detail-tab="basic"]')?.click();
    });
    // Use the actual operation button, not just the pure rule function.
    await page.locator("#v39-cave-mine-claim").scrollIntoViewIfNeeded();
    await page.locator("#v39-cave-mine-claim").click();
    const claimed=await page.evaluate(()=>{
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
      if(!map.caveMine)throw new Error("claim button did not create mine");
      return {owner:map.caveMine.ownerPlayerId,player:state.activePlayerId,ap:window.getV39SelectedSquadUnit().ap,
        stock:map.caveMine.stockByResource,saved:window.createV39SaveData().field.mapData.caveMine};
    });
    assert.equal(claimed.owner,claimed.player);assert.deepEqual(claimed.stock,{});assert.equal(claimed.ap,60);
    assert.equal(claimed.saved.ownerPlayerId,claimed.player);
    assert.equal(await page.locator("#v39-cave-mine-claim").isVisible(),false);
    assert.equal(await page.locator("#v39-cave-mine-collect").isVisible(),true);
    const income=await page.evaluate(async()=>{
      if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw new Error("turn failed");
      return window.__v39FieldRuntime.mapData.caveMine;
    });
    assert.deepEqual(income.stockByResource,{鉱石:1,宝石:1});
    const checks=await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,json=window.exportV39SaveJson();
      window.importV39SaveJson(json);
      const restored=window.__v39FieldRuntime.mapData;
      window.advanceV39CaveMine(window.getV39GameState().timeline.turnNumber);
      if(JSON.stringify(restored.caveMine)!==JSON.stringify(map.caveMine))throw new Error("load/repeated turn changes mine");
      try{window.collectV39CaveMine();throw new Error("accepted away from entrance");}catch(error){if(!error.message.includes("入口"))throw error;}
      const state=window.getV39GameState(),actor=window.getV39SelectedSquadUnit(),entry=restored.entrances[0];
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.id===actor.id?{...unit,x:entry.x,y:entry.y}:unit)});
      const faction=window.getV39ActiveFactionState();
      const cargoFor=squad=>Object.fromEntries(["鉱石","宝石"].map(name=>[name,(squad.cargoByUnitId?.[actor.id]?.resourcesByType?.[name]||0)+(squad.cargo?.resourcesByType?.[name]||0)]));
      const before=cargoFor(faction.squads.find(squad=>squad.unitIds.includes(actor.id)));
      if(!window.collectV39CaveMine().ok)throw new Error("entrance collection failed");
      const after=cargoFor(window.getV39ActiveFactionState().squads.find(squad=>squad.unitIds.includes(actor.id)));
      if(after.鉱石!==(before.鉱石||0)+1||after.宝石!==(before.宝石||0)+1)throw new Error(`cargo did not increase ${JSON.stringify({before,after,stock:restored.caveMine.stockByResource,squads:window.getV39ActiveFactionState().squads})}`);
      if(Object.keys(restored.caveMine.stockByResource).length)throw new Error("stock not consumed");
      try{window.collectV39CaveMine();throw new Error("double collect accepted");}catch(error){if(!error.message.includes("在庫"))throw error;}
      // Another active player cannot take the owner's inventory.
      restored.caveMine.stockByResource={鉱石:2};
      const second={...state.players[0],id:"mine-other",factionState:{...faction,units:faction.units.map(unit=>({...unit,id:`other-${unit.id}`}))}};
      second.factionState.selectedUnitId=second.factionState.units[0].id;
      window.setV39GameState({players:[...window.getV39GameState().players,second],activePlayerId:second.id});
      try{window.collectV39CaveMine();throw new Error("foreign collection accepted");}catch(error){if(!error.message.includes("自軍"))throw error;}
      window.setV39GameState({activePlayerId:state.activePlayerId,players:window.getV39GameState().players.filter(player=>player.id!==second.id)});
      return {stock:restored.caveMine.stockByResource,cargo:after};
    });
    assert.equal(checks.stock.鉱石,2);
    // An inactive mined world still receives production through the real turn loop.
    const background=await page.evaluate(async()=>{
      const state=window.getV39GameState(),mineWorld=state.activeWorldId;
      window.enterV39Cave({seed:"mine-ui",floor:4,caveTest:true,parentWorldId:mineWorld});
      const next=window.getV39GameState();
      window.setV39GameState({enemies:next.enemies.map(unit=>({...unit,hp:0,currentHp:0}))});
      await window.advanceV39Turn({skipUnactedFocus:true});
      return window.getV39GameState().explorationWorlds[mineWorld].map.caveMine;
    });
    assert.equal(background.stockByResource.鉱石,3);assert.equal(background.stockByResource.宝石,1);
    await page.evaluate(worldId=>{
      window.enterV39Cave({seed:"mine-ui",floor:3,caveTest:true,worldId});
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit();
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.id===actor.id?{...unit,x:map.entrances[0].x,y:map.entrances[0].y}:unit)});
      document.querySelector('[data-squad-detail-tab="basic"]')?.click();
      window.refreshV39SquadDerivedUI?.();
    },bossInfo.worldId);
    await page.waitForTimeout(400);
    await page.locator("#v39-cave-mine-collect").scrollIntoViewIfNeeded();
    await page.screenshot({path:`${directory}/${width}.png`});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({width,bossInfo,claimed,income,checks,background}));
    await page.close();
  }
}finally{await browser.close();}
