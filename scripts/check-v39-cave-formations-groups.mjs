import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/cave-formation",{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    const ids=await page.evaluate(()=>window.getV39ActiveFactionState().squads[0].unitIds);
    const card=id=>page.locator(`#squadMemberList [data-v39-unit-id="${id}"]`);
    await card(ids[2]).click();await card(ids[2]).click({button:"right"});
    await page.getByRole("button",{name:"前2人",exact:true}).click();
    await card(ids[2]).click({button:"right"});
    await page.getByRole("button",{name:"その場待機",exact:true}).click();
    const report=await page.evaluate(async({ids})=>{
      const check=(ok,msg)=>{if(!ok)throw new Error(msg);};
      const rules=await import("/src/lib/v39-squad-movement-rules.js");
      const hex=await import("/src/lib/hex-grid.js");
      const generator=await import("/src/lib/v39-cave-generator.js");
      const faction=window.getV39ActiveFactionState();
      check(faction.squads[0].formationType==="front-two","menu selects formation");
      check(faction.units.find(unit=>unit.id===ids[2]).movementHold,"menu holds unit");
      const map=structuredClone(window.__v39FieldRuntime.mapData);
      map.grid=map.grid.map(row=>row.map(()=>"洞窟"));map.heightLevelMap=map.grid.map(row=>row.map(()=>0));map.specialMap=[];map.lavaMap=[];
      const units=faction.units.map((unit,index)=>({...unit,x:index?9:10,y:index===1?11:10,ap:100,currentAp:100}));
      const fixture={...faction,units,selectedUnitId:ids[2]};
      const group=rules.resolveV39SquadMovementGroup(fixture,ids[2],{caveFormation:true});
      check(group.participants.length===2&&!group.participantIds.includes(ids[2]),"held unit excluded");
      const next=rules.advanceV39CaveFormation(map,group.positions,{x:11,y:10},group,new Set(["9,10"]));
      check(!!next&&next[1].x===10&&next[1].y===11,"parallel front two moves");
      const all=rules.resolveV39SquadMovementGroup({...fixture,units:units.map(unit=>({...unit,movementHold:false}))},ids[2],{caveFormation:true});
      const narrow=structuredClone(map);narrow.grid=narrow.grid.map(row=>row.map(()=>"岩壁"));
      for(let x=7;x<17;x++)narrow.grid[10][x]="洞窟";
      const column=ids.map((id,index)=>({id,x:11-index,y:10}));
      const compressed=rules.advanceV39CaveFormation(narrow,column,{x:12,y:10},all);
      check(!!compressed&&compressed.every(tile=>tile.y===10),"narrow passage compresses to column");
      const restored=rules.advanceV39CaveFormation(map,compressed,{x:13,y:10},all);
      check(restored?.some(tile=>tile.y!==10),"open room restores width");
      const frames=restored.transitionFrames||[restored];let before=compressed;
      for(const frame of frames){check(frame.every((tile,index)=>hex.getHexDistance(tile,before[index])<=1),"no warp");check(new Set(frame.map(tile=>`${tile.x},${tile.y}`)).size===frame.length,"no overlap");before=frame;}
      check(fixture.squads[0].formationType==="front-two","compression keeps configuration");
      const heldLeader=rules.resolveV39SquadMovementGroup({...fixture,units:units.map(unit=>unit.id===ids[0]?{...unit,movementHold:true}:unit)},ids[2],{caveFormation:true});
      check(!heldLeader.ok,"held leader blocks group");
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],neutralVillages:[]});window.updateV39ActiveFactionState(fixture);
      await window.waitForV39MapRenderSettled();
      window.startV39SelectedUnitMove();window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}}));
      document.getElementById("moveOk").click();await new Promise(resolve=>setTimeout(resolve,1100));
      const moved=window.getV39ActiveFactionState().units;
      check(moved.find(unit=>unit.id===ids[0]).x===11,"native leader moved");
      const held=moved.find(unit=>unit.id===ids[2]);
      check(held.x===9&&held.y===10&&held.ap===100,"held unit retains position/AP");
      check(window.getV39ActiveFactionState().selectedUnitId===ids[2],"selection retained");
      window.toggleV39CaveMovementHold(ids[0]);
      check(window.startV39SelectedUnitMove()===false,"native held leader blocks move");
      window.toggleV39CaveMovementHold(ids[0]);
      window.updateV39ActiveFactionState({...fixture,units:fixture.units.map((unit,index)=>({...unit,...compressed[index],movementHold:false}))});
      await window.waitForV39MapRenderSettled();
      window.startV39SelectedUnitMove();
      const expansionCost=window.getV39UnitMovePreview().reachable.find(tile=>tile.key==="13,10")?.cost;
      check(expansionCost>35&&expansionCost<=100,"expansion extra movement costs AP");
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:13,y:10}}));
      document.getElementById("moveOk").click();await new Promise(resolve=>setTimeout(resolve,1400));
      check(window.getV39ActiveFactionState().units.some(unit=>unit.y===11),"native expands width");
      check(window.getV39ActiveFactionState().units.every(unit=>unit.ap===100-expansionCost),"expansion AP matches preview");
      window.updateV39ActiveFactionState(fixture);
      window.__v39SuppressCombatEffects=true;
      const enemy={id:"hold-attack-target",name:"試験対象",x:10,y:10,hp:10000,maxHp:10000,currentHp:10000,status:{防御:0,精神:0}};
      window.setV39GameState({enemies:[enemy]});
      check(window.executeV39FactionCombatAction({playerId:window.getV39GameState().activePlayerId,attackerId:ids[2],targetUnitId:enemy.id,skillRow:{名前:"待機中攻撃試験",行動:"A",威力:1,判定:"攻撃",攻撃手段:"弓",射程:30,AP消費:1}}),"held unit can attack");
      check(window.getV39ActiveFactionState().units.find(unit=>unit.id===ids[2]).movementHold,"attack retains hold");
      window.updateV39TimelineState({turnNumber:window.getV39GameState().timeline.turnNumber+1});
      window.importV39SaveJson(window.exportV39SaveJson(0));await new Promise(resolve=>setTimeout(resolve,700));
      check(window.getV39ActiveFactionState().units.find(unit=>unit.id===ids[2]).movementHold,"hold survives turn/load");
      check(window.getV39ActiveFactionState().squads[0].formationSlots.length===3,"slots saved");
      const spawn=await import("/src/v39/ai/v39-enemy-spawn.js");
      const definitions=spawn.getV39EnemySpawnDefinitions("洞窟");
      const forms=["単独","小集団","群れ"];
      let groupChecks=0;
      for(const form of forms)for(let seed=0;seed<3;seed++){
        const generated=generator.generateV39CaveMap({seed:`form-${form}-${seed}`,templateId:generator.V39_CAVE_TEMPLATES[0].id,entranceCount:2});
        const row={...definitions[0].row,出現形態:form,集団数_Min:form==="群れ"?5:form==="小集団"?2:1,集団数_Max:form==="群れ"?8:form==="小集団"?3:1};
        const make=options=>({...options,...options.metadata,hp:100});
        const enemies=generator.populateV39CaveMonsters(generated,[{...definitions[0],row}],make);
        check(JSON.stringify(enemies)===JSON.stringify(generator.populateV39CaveMonsters(generated,[{...definitions[0],row}],make)),"seed reproduces groups");
        check(new Set(enemies.map(unit=>`${unit.x},${unit.y}`)).size===enemies.length,"unique spawn tiles");
        for(const unit of enemies){check(generated.grid[unit.y][unit.x]==="洞窟","not wall");check(generated.entrances.every(entry=>generator.findV39CavePath(generated,entry,unit).length-1>2),"safe entrance");}
        const grouped=Object.groupBy(enemies,unit=>unit.groupId);
        check(Object.values(grouped)[0]?.length>=row.集団数_Min,"first group meets configured minimum");
        for(const members of Object.values(grouped)){check(members.length<=row.集団数_Max,"group max");check(members.every(unit=>hex.getHexDistance(unit,members[0])<=2),"group clustered");groupChecks++;}
      }
      const adventure=await import("/src/lib/v39-cave-adventure.js");
      let actual=null;
      for(let i=0;i<20;i++){
        const floor=adventure.generateCaveFloor({seed:`actual-group-${i}`,floor:1,templateId:generator.V39_CAVE_TEMPLATES[0].id,caveTest:true});
        if(floor.map.caveHabitatRace==="ビートル"){actual=floor;break;}
      }
      check(!!actual&&actual.enemies.length>=5&&actual.enemies.every(unit=>unit.groupId&&unit.spawnForm==="群れ"),"actual factory reads sheet groups");
      window.setV39GameState({enemies:actual.enemies});
      window.importV39SaveJson(window.exportV39SaveJson(0));await new Promise(resolve=>setTimeout(resolve,700));
      check(window.getV39GameState().enemies.every(unit=>unit.groupId&&unit.spawnForm==="群れ"),"group data survives save/load");
      const root=window.getV39GameState().activeWorldId;
      const stairs=window.__v39FieldRuntime.mapData.stairsDown;
      window.updateV39ActiveFactionState({selectedUnitId:ids[0],units:window.getV39ActiveFactionState().units.map(unit=>unit.movementHold?unit:{...unit,x:stairs.x,y:stairs.y})});
      window.descendV39Cave();
      check(window.getV39ActiveFactionState().units.find(unit=>unit.id===ids[2]).worldId===root,"held unit stays in old world");
      check(window.getV39ActiveFactionState().squads[0].formationType==="front-two","formation survives descent");
      const entry=window.__v39FieldRuntime.mapData.entrances[0];
      window.updateV39ActiveFactionState({units:window.getV39ActiveFactionState().units.map(unit=>unit.movementHold?unit:{...unit,x:entry.x,y:entry.y})});
      window.leaveV39Cave();window.updateV39ActiveFactionState({selectedUnitId:ids[2]});
      return {parallel:true,compressed:true,restored:true,hold:true,holdAttack:true,saveLoad:true,groupChecks};
    },{ids});
    await card(ids[2]).click({button:"right"});
    await page.screenshot({path:`output/web-game/cave-formation/${width}.png`});
    await page.getByRole("button",{name:"その場待機を解除",exact:true}).click();
    assert.equal(await page.evaluate(id=>!!window.getV39ActiveFactionState().units.find(unit=>unit.id===id).movementHold,ids[2]),false);
    assert.deepEqual(errors,[]);console.log("PASS",width,report);await page.close();
  }
} finally {await browser.close();}
