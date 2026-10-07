import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
mkdirSync("output/web-game/cave-events",{recursive:true});
const browser=await chromium.launch(),errors=[];
try{
  for(const width of [390,1280]){
    const page=await browser.newPage({viewport:{width,height:900}});
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(800);
    await page.evaluate(async()=>{
      const {getHexNeighborCoords}=await import("/src/lib/hex-grid.js");
      const map=window.__v39FieldRuntime.mapData,npc=map.caveEventNpc;
      if(!npc||npc.race!=="ドワーフ"||!npc.derivedCharacter.ok)throw new Error("dwarf unit creation failed");
      if(npc.x!==map.entrances[0].x+1||npc.y!==map.entrances[0].y-2)throw new Error("fixed NPC entrance offset failed");
      const {resolveUnitArtwork}=await import("/src/lib/map-entity-artwork.js");
      const art=resolveUnitArtwork(npc);
      if(art.sheetFrame?.slotNumber!==9)throw new Error("NPC sheet slot failed");
      const tile=getHexNeighborCoords(map.w,map.h,npc.x,npc.y).find(row=>map.grid[row.y][row.x]==="洞窟");
      const faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit();
      window.updateV39ActiveFactionState({units:faction.units.map(row=>row.id===actor.id?{...row,x:tile.x,y:tile.y}:row)});
      window.renderV39Visibility();
      window.dispatchEvent(new CustomEvent("v39:visibility-rendered"));
      await new Promise((resolve,reject)=>{
        const deadline=Date.now()+5000;
        const check=()=>{
          const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
          const image=scene.v39CaveNpc?.list.find(row=>row.type==="Image");
          if(image?.frame.name===art.sheetFrame.frameKey)return resolve();
          if(Date.now()>deadline)return reject(new Error("NPC cropped frame not rendered after discovery"));
          setTimeout(check,30);
        };check();
      });
    });
    await page.locator('[data-squad-detail-tab="action"]').click();await page.locator("#v39-cave-talk").click();
    const layout=await page.evaluate(()=>{
      const host=document.querySelector(".footer-body"),panel=document.getElementById("v39-conversation-panel");
      const a=host.getBoundingClientRect(),b=panel.getBoundingClientRect();
      return {fits:b.top>=a.top-1&&b.bottom<=a.bottom+1&&b.width>=a.width-2,host:a.toJSON(),panel:b.toJSON(),inert:document.getElementById("footSquad").inert,unit:window.getV39SelectedSquadUnit().id};
    });
    assert.ok(layout.fits&&layout.inert,`conversation covers full footer and disables underlying controls ${JSON.stringify(layout)}`);
    await page.waitForTimeout(500);
    await page.screenshot({path:`output/web-game/cave-events/conversation-${width}.png`});
    await page.getByRole("button",{name:"会話を閉じる",exact:true}).click();
    assert.equal(await page.locator("#v39-conversation-panel").count(),0);
    assert.equal(await page.evaluate(()=>document.getElementById("footSquad").inert),false);
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),layout.unit);
    await page.locator("#v39-cave-talk").click();
    await page.locator("#v39-cave-event-panel").getByRole("button",{name:"依頼",exact:true}).click();
    assert.match(await page.locator(".v39-conversation-speaker p").innerText(),/頼みたい仕事/);
    assert.equal(await page.locator('[data-quest-id]').count(),5);
    await page.screenshot({path:`output/web-game/cave-events/${width}.png`});
    await page.locator('[data-quest-id="ore"]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().caveEvents[window.__v39FieldRuntime.mapData.caveSeed].quests.find(row=>row.id==="ore").status),"available","viewing detail does not accept quest");
    assert.match(await page.locator(".v39-conversation-speaker p").innerText(),/鉱石を3個/);
    assert.equal(await page.locator('[data-quest-id]').count(),0,"quest detail replaces list");
    assert.equal(await page.getByRole("button",{name:"受注",exact:true}).count(),1);
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    assert.equal(await page.locator('[data-quest-id]').count(),5,"back restores quest list");
    assert.match(await page.locator(".v39-conversation-speaker p").innerText(),/頼みたい仕事/);
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    await page.locator("#v39-cave-event-panel").getByRole("button",{name:"武器を買う",exact:true}).click();
    assert.match(await page.locator(".v39-conversation-speaker p").innerText(),/武器を探して/);
    const weaponCount=await page.locator("#v39-cave-event-panel .v39-cave-event-row").count();
    await page.locator("#v39-cave-event-panel .v39-cave-event-row").first().click();
    assert.match(await page.locator(".v39-conversation-speaker p").innerText(),/金30で売ろう/);
    assert.equal(await page.locator("#v39-cave-event-panel .v39-cave-event-row").count(),0,"weapon detail replaces list");
    await page.screenshot({path:`output/web-game/cave-events/purchase-${width}.png`});
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    assert.equal(await page.locator("#v39-cave-event-panel .v39-cave-event-row").count(),weaponCount);
    await page.locator("#v39-cave-event-panel .v39-cave-event-row").first().click();
    await page.locator("#v39-cave-event-panel").getByRole("button",{name:"購入 金30",exact:true}).first().click();
    const report=await page.evaluate(async()=>{
      const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
      const c=()=>window.getV39ActiveFactionState().caveEvents[window.__v39FieldRuntime.mapData.caveSeed];
      const map=window.__v39FieldRuntime.mapData,actor=window.getV39SelectedSquadUnit();
      const {getV39EquipmentCatalog}=await import("/src/lib/v39-equipment-rules.js");
      const {addV39CargoToFactionUnit}=await import("/src/lib/v39-logistics-state.js");
      const name=getV39EquipmentCatalog().find(row=>row.slots.includes("武器1")&&row.row.武器分類!=="盾").name;
      check(c().gold===70,"native UI purchase cost");
      check(window.performV39CaveEventAction("equip","0").ok,"equip purchased");check(window.getV39SelectedSquadUnit().equipment.find(row=>row.slot==="武器1").name===name,"equipped stats path");
      check(!window.performV39CaveEventAction("craft",name).ok,"missing ore rejects craft");
      const added=addV39CargoToFactionUnit(window.getV39ActiveFactionState(),actor.id,{resourcesByType:{鉱石:5,宝石:1}});
      window.updateV39ActiveFactionState(added.faction);
      const crafted=window.performV39CaveEventAction("craft",name); check(crafted.ok,`craft ${JSON.stringify(crafted)} ${JSON.stringify(window.getV39ActiveFactionState().squads)}`);check(c().gold===60,"craft cost");
      const faction=window.getV39ActiveFactionState(),key=map.caveSeed;
      window.updateV39ActiveFactionState({caveEvents:{...faction.caveEvents,[key]:{...c(),visitedFloor:3}}});
      for(const id of ["ore","gem","kills","habitat","floor"])check(window.performV39CaveEventAction("accept",id).ok,`accept ${id}`);
      check(c().quests.find(row=>row.id==="floor").progress===0,"floor starts at acceptance");
      check(!window.performV39CaveEventAction("claim","floor").ok,"preacceptance highest floor cannot complete quest");
      check(window.performV39CaveEventAction("claim","ore").ok,"ore delivery");check(window.performV39CaveEventAction("claim","gem").ok,"gem delivery");
      const gold=c().gold;check(!window.performV39CaveEventAction("claim","gem").ok&&c().gold===gold,"reward once");
      const base=window.getV39GameState().enemies[0];window.__v39SuppressCombatEffects=true;
      for(let i=0;i<3;i++){
        if(i>0)window.updateV39TimelineState({turnNumber:window.getV39TimelineState().turnNumber+1});
        const enemy={...base,id:`event-kill-${i}`,race:map.caveHabitatRace,x:actor.x+1,y:actor.y,hp:1,currentHp:1,maxHp:1};
        map.grid[enemy.y][enemy.x]="洞窟";
        window.setV39GameState({enemies:[enemy]}); const faction=window.getV39ActiveFactionState(); window.updateV39ActiveFactionState({units:faction.units.map(row=>row.id===actor.id?{...row,ap:100,currentAp:100,status:{...row.status,命中:99999}}:row)});
        const random=Math.random;Math.random=()=>random()*.1;
        let ok;
        try{ok=window.executeV39FactionCombatAction({playerId:window.getV39GameState().activePlayerId,attackerId:actor.id,targetUnitId:enemy.id,skillRow:{名前:"依頼討伐試験",行動:"A",全威力:99999,判定:"攻撃",攻撃手段:"爪",射程:10,AP消費:0}});}finally{Math.random=random;}
        check(ok,"native quest combat");
        check(window.getV39GameState().enemies[0].hp<=0,"native kill required");
        window.dispatchEvent(new CustomEvent("v39:combat-log",{detail:{attackerId:actor.id,entries:[{targetId:enemy.id,beforeHp:1,afterHp:0}]}}));
      }
      check(c().quests.find(row=>row.id==="kills").progress===3,"kill progression and dedup");
      check(window.performV39CaveEventAction("claim","kills").ok,"kill reward");check(window.performV39CaveEventAction("claim","habitat").ok,"race reward");
      return {gold:c().gold,quests:c().quests};
    });
    assert.equal(report.quests.filter(row=>row.status==="claimed").length,4);
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    await page.getByRole("button",{name:"戻る",exact:true}).click();
    await page.getByRole("button",{name:"依頼",exact:true}).click();
    assert.match(await page.locator('[data-quest-id="floor"]').innerText(),/受注中/);
    assert.match(await page.locator('[data-quest-id="kills"]').innerText(),/受領済み/);
    await page.screenshot({path:`output/web-game/cave-events/quest-status-${width}.png`});
    await page.evaluate(()=>{
      const state=window.getV39GameState(),faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit(),map=window.__v39FieldRuntime.mapData;
      window.updateV39ActiveFactionState({units:faction.units.map(row=>row.id===actor.id?{...row,x:map.w-2,y:map.h-2}:row)});
      if(window.performV39CaveEventAction("buy","長剣").ok)throw new Error("remote trading allowed");
      window.importV39SaveJson(window.exportV39SaveJson(0));
    });
    await page.waitForTimeout(300);
    const saved=await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData,c=window.getV39ActiveFactionState().caveEvents[map.caveSeed];
      return {npc:map.caveEventNpc?.race,gold:c.gold,claimed:c.quests.filter(row=>row.status==="claimed").length};
    });
    assert.equal(saved.npc,"ドワーフ");assert.equal(saved.gold,report.gold);assert.equal(saved.claimed,4);
    await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit(),map=window.__v39FieldRuntime.mapData;
      const root=window.getV39GameState().activeWorldId;
      for(let floor=1;floor<3;floor++){
        const current=window.__v39FieldRuntime.mapData;
        const active=window.getV39ActiveFactionState();
        window.updateV39ActiveFactionState({units:active.units.map(row=>row.id===actor.id?{...row,x:current.stairsDown.x,y:current.stairsDown.y}:row)});
        window.descendV39Cave();
      }
      if(window.__v39FieldRuntime.mapData.caveEventNpc)throw new Error("NPC duplicated on later floor");
      const state=window.getV39GameState(),world=state.explorationWorlds[root];
      // 再訪は公開の入場APIを使い、購入/依頼の保存済み探索データを維持する。
      window.enterV39Cave({seed:map.caveSeed,templateId:map.templateId,floor:1,caveTest:true});
      const now=window.__v39FieldRuntime.mapData,npc=now.caveEventNpc;
      const active=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:active.units.map(row=>row.id===actor.id?{...row,x:npc.x,y:npc.y}:row)});
      if(!window.performV39CaveEventAction("claim","floor").ok)throw new Error("floor reward failed");
      if(window.performV39CaveEventAction("claim","floor").ok)throw new Error("duplicate floor reward");
    });
    await page.close();
  }
  assert.deepEqual(errors,[]);console.log("PASS dwarf NPC, native weapon purchase/craft/equip, 5 quests, delivery/actual kills/reward dedup, desktop/mobile");
}finally{await browser.close();}
