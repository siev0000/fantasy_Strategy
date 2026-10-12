import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const skills = JSON.parse(readFileSync("data/source/export/json/テストスキル.json", "utf8"));
const out = "output/web-game/defenses";
mkdirSync(out,{recursive:true});
const browser = await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page = await browser.newPage({viewport:{width,height:844}}), errors=[];
    page.on("pageerror", error => errors.push(error.stack || String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    const report = await page.evaluate(async skills => {
      window.__v39SuppressCombatEffects = true;
      window.setV39TestMode(true);
      const map = window.__v39FieldRuntime.mapData;
      map.grid = map.grid.map(row=>row.map(()=>"洞窟"));
      map.heightLevelMap = map.grid.map(row=>row.map(()=>0));
      map.defenseStructures = [];
      let state=window.getV39GameState(), player=state.players[0];
      const units=player.factionState.units.slice(0,2).map((unit,index)=>({...unit,x:10+index,y:10,
        hp:5000,currentHp:5000,maxHp:5000,ap:100,currentAp:100,waitTurnNumber:0,
        testSkillNames:skills.map(row=>row.名前),shield:null,barrier:null,guard:0}));
      const enemy={id:"defense-enemy",name:"防御確認敵",worldId:state.activeWorldId,x:14,y:10,
        hp:5000,currentHp:5000,maxHp:5000,level:1,ap:100,currentAp:100,
        status:{精神:100,命中:10000,防御:0,回避:1}};
      window.setV39GameState({players:[{...player,factionState:{...player.factionState,units,squads:[],
        selectedUnitId:units[0].id,combatRuntime:{},villagePlacementMode:false}}],
        enemies:[enemy],neutralVillages:[],enemyCombatRuntime:{}});
      const row=name=>skills.find(skill=>skill.名前===name);
      const cast=(name,x,y)=>window.executeV39FactionCombatAction({playerId:player.id,
        attackerId:units[0].id,target:{x,y},skillRow:row(name)});
      const attack=(name="試験攻撃",power=100,count=2)=>window.executeV39EnemyCombatAction({enemyId:enemy.id,
        targetUnitId:units[1].id,skillRow:{名前:name,行動:"A",攻撃手段:"テスト",物理:power,
          攻撃回数:count,射程:100,AP消費:0},apPaid:true});
      const target=()=>window.getV39ActiveFactionState().units[1];
      const result={};
      result.shieldCast=cast("TEST_盾",11,10);
      const caster=window.getV39ActiveFactionState().units[0];
      result.shieldMaximum=target().shield?.maximum;
      result.expectedShield=Math.floor(40*(1+caster.status.精神/100));
      result.apAfterShield=caster.ap;
      result.repeatShield=cast("TEST_盾",11,10);
      const savedRandom=Math.random;
      try {
        Math.random=savedRandom;
        result.shieldAttack=attack();
        result.shieldConsumed=target().shield.maximum-target().shield.remaining;
        result.barrierCast=cast("TEST_障壁",11,10);
        result.barrierAttack=attack("障壁確認",20,2);
        result.barrierRemaining=target().barrier?.remaining;
        result.barrierSecond=attack("障壁破壊",100,1);
        result.barrierRemoved=target().barrier===null;
      } finally {Math.random=savedRandom;}
      for (const [name,count] of [["TEST_結界1",1],["TEST_結界3",3],["TEST_結界7",7],["TEST_結界19",19]]) {
        result[name]={cast:cast(name,11,10),count:map.defenseStructures.at(-1)?.tiles.length,expected:count};
      }
      const fields=map.defenseStructures.filter(item=>item.kind==="結界");
      const beforeFields=fields.reduce((sum,item)=>sum+item.hp,0);
      try {Math.random=savedRandom; result.fieldAttack=attack("結界確認",100,2);}
      finally {Math.random=savedRandom;}
      result.fieldConsumed=beforeFields-fields.reduce((sum,item)=>sum+item.hp,0);
      // 結界は射線を遮るため、壁の破壊試験とは分離する。
      map.defenseStructures=[];
      const factionForWall=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:factionForWall.units.map(unit=>unit.id===units[1].id ? {...unit,y:11}:unit)});
      result.wallCast=cast("TEST_障壁付き壁",12,10);
      result.wallBlocked=!Number.isFinite(window.resolveV39UnitMovementStepCost?.(map,11,10,12,10,caster));
      const wall=map.defenseStructures.at(-1);
      const oldHp=wall.hp;
      try {Math.random=savedRandom;result.wallAttack=window.executeV39FactionCombatAction({playerId:player.id,
        attackerId:units[0].id,target:{x:12,y:10},skillRow:row("TEST_防御確認攻撃")});}
      finally {Math.random=savedRandom;}
      result.wallDamage=oldHp-wall.hp;
      map.defenseStructures=[...fields,...map.defenseStructures];
      result.missBarrier = window.computeV39AttackDamage({attacker:enemy,
        target:{...target(),barrier:{remaining:60}},skillRow:{物理:100,攻撃回数:2},random:()=>1}).barrierRemaining;
      result.enemyShield=window.executeV39EnemyCombatAction({enemyId:enemy.id,targetUnitId:enemy.id,
        skillRow:row("TEST_盾"),apPaid:true});
      result.enemyShieldMaximum=window.getV39GameState().enemies.find(unit=>unit.id===enemy.id)?.shield?.maximum;
      result.save=JSON.parse(window.exportV39SaveJson());
      result.savedShield=result.save.gameState.players[0].factionState.units[1].shield;
      result.savedStructures=result.save.field.mapData.defenseStructures.length;
      result.targetId=units[1].id;
      result.casterId=units[0].id;
      delete result.save;
      window.refreshV39MapEntities();
      return result;
    },skills);
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const turnResult = await page.evaluate(async id=>{
      const advanced=await window.advanceV39Turn({skipUnactedFocus:true});
      const target=window.getV39ActiveFactionState().units.find(unit=>unit.id===id);
      return {turnAdvanced:advanced,restoredShield:target.shield?.remaining,
        shieldMaximumAfterTurn:target.shield?.maximum,turn:window.getV39GameState().timeline.turnNumber};
    },report.targetId);
    Object.assign(report,turnResult);
    writeFileSync(`${out}/${width}.json`,JSON.stringify(report,null,2));
    assert.equal(report.shieldCast,true);
    assert.equal(report.shieldMaximum,report.expectedShield);
    assert.equal(report.apAfterShield,95);
    assert.equal(report.repeatShield,false);
    assert.ok(report.shieldConsumed>0,JSON.stringify(report));
    assert.equal(report.barrierCast,true);
    assert.equal(report.barrierRemaining,20);
    assert.equal(report.barrierRemoved,true);
    for(const name of ["TEST_結界1","TEST_結界3","TEST_結界7","TEST_結界19"]) {
      assert.equal(report[name].cast,true,name);
      assert.equal(report[name].count,report[name].expected,name);
    }
    assert.ok(report.fieldConsumed>0);
    assert.equal(report.wallCast,true);
    assert.ok(report.wallDamage>0);
    assert.equal(report.restoredShield,report.shieldMaximumAfterTurn);
    assert.ok(report.savedStructures>=2);
    assert.equal(report.turnAdvanced,true);
    assert.equal(report.wallBlocked,true);
    assert.equal(report.missBarrier,60);
    assert.equal(report.enemyShield,true);
    assert.equal(report.enemyShieldMaximum,80);
    await page.evaluate(id=>{
      window.updateV39ActiveFactionState({selectedUnitId:id});
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:id}}));
      window.openV39TestTools();
      const section=document.querySelector('[data-test-section="test-skills"]');
      if(section)section.open=true;
    },report.casterId);
    await page.locator('#v39-test-skill-name').selectOption('TEST_辺の壁');
    await page.locator('[data-test-action="test-skill-add"]').click();
    await page.evaluate(()=>window.closeV39TestTools());
    await page.locator('[data-squad-detail-tab="action"]').click();
    const card=page.locator('[data-v39-technique-name="TEST_辺の壁"]');
    await card.click();
    const facingStyle=await page.locator('[data-v39-defense-facing]').evaluate(button=>{
      const style=getComputedStyle(button);
      return {color:style.color,background:style.backgroundColor,text:button.textContent,height:button.getBoundingClientRect().height};
    });
    assert.equal(facingStyle.color,"rgb(242, 251, 255)");
    assert.equal(facingStyle.background,"rgb(23, 70, 83)");
    assert.ok(facingStyle.height>=32);
    assert.equal(facingStyle.text,"回転：左上");
    await page.screenshot({path:`${out}/${width}-rotation-button.png`});
    await page.locator('[data-v39-defense-facing]').click();
    assert.equal(await page.locator('[data-v39-defense-facing]').textContent(),"回転：右上");
    const edge = await page.evaluate(()=>{
      const session=window.getV39AttackSession();
      const before=window.__v39FieldRuntime.mapData.defenseStructures.length;
      const apBefore=window.getV39ActiveFactionState().units.find(unit=>unit.id===session.unitId).ap;
      const first=window.executeV39AttackAt(12,10);
      const unchanged=window.__v39FieldRuntime.mapData.defenseStructures.length===before
        && window.getV39ActiveFactionState().units.find(unit=>unit.id===session.unitId).ap===apBefore;
      const placed=window.executeV39AttackAt(12,10);
      const wall=window.__v39FieldRuntime.mapData.defenseStructures.at(-1);
      return {session,first,unchanged,placed,edge:wall.edge};
    });
    assert.equal(edge.placed,true,JSON.stringify(edge));
    assert.equal(edge.first,false);
    assert.equal(edge.unchanged,true);
    assert.ok(edge.edge);
    await page.evaluate(({skills,id})=>{
      const state=window.getV39GameState(),unit=window.getV39ActiveFactionState().units.find(unit=>unit.id===id);
      window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:id,
        target:{x:11,y:10},skillRow:skills.find(row=>row.名前==='TEST_結界19')});
      window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:id,
        target:{x:13,y:10},skillRow:{...skills.find(row=>row.名前==='TEST_結界3'),名前:'TEST_三角画像確認',AP消費:0}});
      window.refreshV39MapEntities();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main;
      camera.setZoom(1.35);camera.centerOn(11*62+31,10*56+37);
    },{skills,id:report.casterId});
    const saveCheck=await page.evaluate(async()=>{
      const before=window.exportV39SaveJson();
      const saved=JSON.parse(before);
      await window.importV39SaveJson(before);
      return {before:saved.field.mapData.defenseStructures.length,
        after:window.__v39FieldRuntime.mapData.defenseStructures.length,
        shield:window.getV39ActiveFactionState().units.some(unit=>unit.shield?.maximum>0)};
    });
    assert.equal(saveCheck.before,saveCheck.after);
    assert.equal(saveCheck.shield,true);
    await page.waitForTimeout(400);
    await page.waitForFunction(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const walk=rows=>rows.some(row=>row.name==='v39-defense-field-image'||(row.list&&walk(row.list)));
      return walk(scene.children.list);
    });
    const fieldImages=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const walk=rows=>rows.flatMap(row=>[row,...(row.list?walk(row.list):[])]);
      const images=walk(scene.children.list).filter(row=>row.name==='v39-defense-field-image');
      const fields=window.__v39FieldRuntime.mapData.defenseStructures.filter(row=>row.kind==='結界'&&row.hp>0);
      return {fields:fields.length,images:images.map(image=>{
        const field=fields.find(row=>row.id===image.getData('defenseId'));
        const x=field.tiles.reduce((sum,tile)=>sum+tile.x*62+(tile.y%2?31:0)+31,0)/field.tiles.length;
        const y=field.tiles.reduce((sum,tile)=>sum+tile.y*56+37,0)/field.tiles.length;
        return {alpha:image.alpha,frame:image.frame.name,width:image.displayWidth,height:image.displayHeight,
          centered:Math.abs(image.x-x)<0.001&&Math.abs(image.y-y)<0.001,
          depth:image.parentContainer.depth};
      })};
    });
    assert.equal(fieldImages.images.length,fieldImages.fields);
    assert.ok(fieldImages.images.every(image=>image.alpha===0.24&&image.frame==='still-9'
      &&image.centered&&image.width>=62&&image.height>=74&&Math.abs(image.width-image.height)<0.001&&image.depth<12),JSON.stringify(fieldImages));
    await page.screenshot({path:`${out}/${width}.png`});
    await page.evaluate(()=>{
      const fields=window.__v39FieldRuntime.mapData.defenseStructures.filter(row=>row.kind==='結界');
      window.__testFieldHp=fields.map(row=>[row.id,row.hp]);
      for(const field of fields)field.hp=0;
      window.refreshV39MapEntities();
    });
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const walk=rows=>rows.flatMap(row=>[row,...(row.list?walk(row.list):[])]);
      return walk(scene.children.list).filter(row=>row.name==='v39-defense-field-image').length;
    }),0);
    await page.evaluate(()=>{
      for(const [id,hp] of window.__testFieldHp){
        const field=window.__v39FieldRuntime.mapData.defenseStructures.find(row=>row.id===id);
        if(field)field.hp=hp;
      }
      delete window.__testFieldHp;
      window.refreshV39MapEntities();
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    const expiry=await page.evaluate(async({skills,id})=>{
      window.setV39GameState({enemies:[],neutralVillages:[]});
      const state=window.getV39GameState();
      const persistent={...skills.find(row=>row.名前==='TEST_壁'),名前:'TEST_永続壁',効果時間:null};
      const placed=window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:id,
        target:{x:13,y:10},skillRow:persistent});
      for(let index=0;index<3;index++)await window.advanceV39Turn({skipUnactedFocus:true});
      const current=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
      return {placed,turn:current.timeline.turnNumber,shields:current.players.flatMap(player=>player.factionState.units)
        .filter(unit=>unit.shield).length,timed:map.defenseStructures.filter(row=>row.expiresAtTurn).length,
        persistent:map.defenseStructures.filter(row=>row.name==='TEST_永続壁'&&row.hp>0).length};
    },{skills,id:report.casterId});
    assert.equal(expiry.placed,true);
    assert.equal(expiry.turn,5);
    assert.equal(expiry.shields,0);
    assert.equal(expiry.timed,0);
    assert.equal(expiry.persistent,1);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const walk=rows=>rows.flatMap(row=>[row,...(row.list?walk(row.list):[])]);
      return walk(scene.children.list).filter(row=>row.name==='v39-defense-field-image').length;
    }),0);
    const facility=await page.evaluate(({skills,id})=>{
      const state=window.getV39GameState(),player=state.players[0],map=window.__v39FieldRuntime.mapData;
      const settlement={id:'defense-test-base',settlementId:'defense-test-base',name:'防壁確認村',
        placed:true,x:10,y:10,population:50,populationByRace:{只人:50},scaleKey:'village',
        foodStockByType:{食料:10000},materialStockByType:{木材:1000,石材:1000},
        buildings:[],tileFacilityMap:{},constructionQueue:[{id:'facility-test',facilityName:'防壁',
          tileKey:'12,10',remainingTurns:1,totalTurns:1,startedTurn:state.timeline.turnNumber-1}]};
      window.setV39GameState({players:[{...player,factionState:{...player.factionState,
        units:player.factionState.units.filter(unit=>unit.id===id),settlements:[settlement],selectedSettlementId:settlement.id}}],settlements:[settlement],
        territoryOwnerByTile:{'10,10':player.id,'12,10':player.id}});
      window.dispatchEvent(new CustomEvent('v39:turn-stage-economy'));
      const wall=map.defenseStructures.find(row=>row.facilityName==='防壁');
      const builtHp=wall?.hp;
      const attack=window.executeV39FactionCombatAction({playerId:player.id,attackerId:id,target:{x:12,y:10},
        skillRow:{...skills.find(row=>row.名前==='TEST_防御確認攻撃'),名前:'TEST_施設破壊',物理:10000}});
      const current=window.getV39GameState();
      return {builtHp,attack,hp:wall?.hp,global:current.facilitiesByTile['12,10']||[],
        facilities:current.players[0].factionState.settlements[0].tileFacilityMap['12,10']||[]};
    },{skills,id:report.casterId});
    assert.equal(facility.builtHp,200);
    assert.equal(facility.attack,true);
    assert.equal(facility.hp,0);
    assert.deepEqual(facility.global,[]);
    assert.deepEqual(facility.facilities,[]);
    assert.deepEqual(errors,[]);
    console.log(`${width}: shield/barrier, field footprints/shared durability, wall damage, save and full-turn refresh OK`);
    await page.close();
  }
} finally {await browser.close();}
