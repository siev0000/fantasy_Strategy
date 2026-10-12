import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const out="output/web-game/fog-quests";mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack||String(error)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    const playerId=await page.evaluate(()=>{
      const state=window.getV39GameState(),pid=state.activePlayerId;
      const player=state.players.find(row=>row.id===pid),unit={...player.factionState.units[0],x:10,y:10,worldId:"surface"};
      const settlement={id:"quest-base",settlementId:"quest-base",ownerPlayerId:pid,placed:true,x:10,y:10,
        population:50,foodStockByType:{穀物:500},materialStockByType:{木材:500}};
      const map=window.__v39FieldRuntime.mapData;map.isUnderground=false;
      for(let y=8;y<=12;y++) for(let x=8;x<=16;x++) map.grid[y][x]="平地";
      const key="13,10",landmark={id:"quest-landmark",key,x:13,y:10,name:"太陽の山",kind:"victory-landmark",occupiedTileKeys:[key,"14,10"]};
      window.setV39GameState({activeWorldId:"surface",victory:{},victoryLandmarksByTile:{[key]:landmark},territoryOwnerByTile:{},
        enemies:[{id:"guardian",name:"守護者",x:13,y:10,hp:500,maxHp:500,worldId:"surface",victoryGuard:true,victoryLandmarkKey:key},
          {id:"animal",name:"ウルフ",race:"ウルフ",x:12,y:10,hp:100,worldId:"surface",aggressive:true}],
        neutralVillages:[{id:"village",name:"隣村",x:11,y:10,level:1,population:20,race:"只人",territoryTileKeys:["11,10"],
          relationsByPlayerId:{[pid]:10},defenseUnits:[]}],
        players:state.players.map(row=>row.id!==pid?row:{...row,factionState:{...row.factionState,units:[unit],squads:[],selectedUnitId:unit.id,
          settlements:[settlement],selectedSettlementId:settlement.id,village:settlement,
          exploration:{...row.factionState.exploration,discoveredFeaturesByTile:{[key]:landmark}}}})
      },{reason:"fog-quests-fixture"});
      window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:11,y:10}}));return pid;
    });
    await page.locator('[data-foot="tile"]').click();
    const fog=await page.evaluate(()=>{
      const state=window.getV39GameState(),player=state.players.find(row=>row.id===state.activePlayerId),unit=player.factionState.units[0];
      const skill=window.getGameDataRows("スキル一覧").find(row=>row.名前==="氷霧");
      const ok=window.executeV39FactionCombatAction({playerId:player.id,attackerId:unit.id,target:{x:11,y:10},skillRow:skill});
      const save=window.createV39SaveData();
      return {ok,cells:save.field.mapData.fogMap?.flat().filter(Boolean).length||0,
        ap:window.getV39ActiveFactionState().units[0].ap};
    });
    assert.equal(fog.ok,true);assert.ok(fog.cells>1);assert.ok(fog.ap>=0&&fog.ap<100);
    await page.evaluate(()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0];
      runtime.mapData.specialMap ||= [];runtime.mapData.specialMap[10] ||= [];
      runtime.mapData.specialMap[10][11]=null;
      runtime.mapData.fogMap[10][11].kind="death";
      window.renderV39Visibility();scene.cameras.main.setZoom(1.2);scene.cameras.main.centerOn(682,597);
    });
    await page.waitForFunction(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const layer=scene.children.getByName("v39-atmosphere-fog-layer");
      return scene.textures.exists("v39-normal-fog")&&scene.textures.exists("v39-death-fog")&&layer.list.filter(row=>row.type==="TileSprite").length===2;
    });
    const deathTint=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      return scene.children.getByName("v39-atmosphere-fog-layer").list.filter(row=>row.type==="TileSprite")[1].tintTopLeft;
    });
    assert.equal(deathTint,0x9c27b0);
    await page.screenshot({path:`${out}/${width}-fog.png`});
    const cleared=await page.evaluate(()=>{
      const state=window.getV39GameState(),pid=state.activePlayerId;
      window.setV39GameState({players:state.players.map(player=>player.id!==pid?player:{...player,factionState:{...player.factionState,
        units:player.factionState.units.map(unit=>({...unit,ap:100,currentAp:100}))}})});
      const unit=window.getV39ActiveFactionState().units[0];
      const ok=window.executeV39FactionCombatAction({playerId:pid,attackerId:unit.id,target:{x:11,y:10},
        skillRow:{名前:"風で霧を払う試験",行動:"A",攻撃手段:"魔法",判定:"魔力",系統:"風",射程:20,炸裂:0.5,AP消費:0}});
      const map=window.__v39FieldRuntime.mapData;
      return {ok,special:map.specialMap[10][11],fog:map.fogMap[10][11]};
    });
    assert.equal(cleared.ok,true);assert.equal(cleared.special,null);assert.equal(cleared.fog,null);
    await page.screenshot({path:`${out}/${width}-fog-cleared.png`});
    await page.locator('[data-event-id="VILLAGE_SUPPORT_FOOD"]').click();
    const foodBefore=await page.evaluate(()=>window.getV39GameState().neutralVillages[0].relationsByPlayerId[window.getV39GameState().activePlayerId]);
    await page.locator('[data-world-action="quest-complete"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages[0].relationsByPlayerId[window.getV39GameState().activePlayerId]),foodBefore+8);
    assert.equal(await page.locator('[data-event-id="VILLAGE_SUPPORT_FOOD"]').count(),0);
    await page.locator('[data-event-id="VILLAGE_FIELD_EXTERMINATE_ANIMAL"]').click();
    await page.locator('[data-world-action="quest-complete"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages[0].questsByPlayerId[window.getV39GameState().activePlayerId].completed),false);
    await page.evaluate(()=>{const state=window.getV39GameState();window.setV39GameState({enemies:state.enemies.map(enemy=>enemy.id==="animal"?{...enemy,hp:0,state:"死亡"}:enemy)});});
    await page.locator('[data-world-action="quest-complete"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages[0].questsByPlayerId[window.getV39GameState().activePlayerId].completed),true);
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent("v39:tile-selected",{detail:{x:13,y:10}})));
    await page.locator('[data-event-id="GUARDIAN_SUPPLY"]').click();
    const ai=await page.evaluate(()=>window.inspectV39EnemyAi("guardian"));
    assert.ok(!ai?.targetId,"guardian must not attack a negotiating player");
    await page.locator('[data-world-action="guardian-complete"]').click();
    await page.locator('[data-event-id="GUARDIAN_WATCH"]').click();
    await page.locator('[data-world-action="guardian-complete"]').click();
    assert.equal(await page.locator('[data-world-action="guardian-transfer"]').isEnabled(),false);
    await page.evaluate(()=>{for(let turn=2;turn<=4;turn++){const state=window.getV39GameState();window.setV39GameState({timeline:{...state.timeline,turnNumber:turn}});window.resolveV39Victory({detail:{turnNumber:turn}});}});
    await page.locator('[data-world-action="guardian-complete"]').click();
    await page.evaluate(()=>{
      const state=window.getV39GameState();
      window.setV39GameState({enemies:[...state.enemies,{id:"guardian-hunt-target",name:"討伐対象",x:12,y:11,hp:50,worldId:"surface",aggressive:true}]});
    });
    await page.locator('[data-event-id="GUARDIAN_HUNT"]').click();
    await page.locator('[data-world-action="guardian-complete"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().victoryLandmarksByTile["13,10"].guardianByPlayerId[window.getV39GameState().activePlayerId].quest.completed),false);
    await page.evaluate(()=>{
      const state=window.getV39GameState();
      window.setV39GameState({enemies:state.enemies.map(enemy=>enemy.id==="guardian-hunt-target"?{...enemy,hp:0,state:"死亡"}:enemy)});
    });
    await page.locator('[data-world-action="guardian-complete"]').click();
    await page.screenshot({path:`${out}/${width}.png`});
    await page.locator('[data-world-action="guardian-transfer"]').click();
    const result=await page.evaluate(()=>{const state=window.getV39GameState(),save=window.createV39SaveData();return {victory:state.victory,
      guardPresent:state.enemies.some(enemy=>enemy.id==="guardian"),owner:state.territoryOwnerByTile["14,10"],
      saved:save.gameState.victoryLandmarksByTile["13,10"].guardianByPlayerId[state.activePlayerId]};});
    assert.equal(result.victory.winnerPlayerId,playerId);assert.equal(result.guardPresent,false);assert.equal(result.owner,playerId);
    assert.equal(result.saved.relation,100);assert.equal(result.saved.completedEventIds.length,3);
    const restored=await page.evaluate(()=>{
      const json=window.exportV39SaveJson();window.importV39SaveJson(json);
      const state=window.getV39GameState();return {relation:state.victoryLandmarksByTile["13,10"].guardianByPlayerId[state.activePlayerId].relation,
        winner:state.victory.winnerPlayerId,villageQuest:state.neutralVillages[0].questsByPlayerId[state.activePlayerId].completed};
    });
    assert.equal(restored.relation,100);assert.equal(restored.winner,playerId);assert.equal(restored.villageQuest,true);
    const weather=await page.evaluate(async()=>{
      const state=window.getV39GameState();
      window.setV39GameState({victory:{},territoryOwnerByTile:{},enemies:[],enemyNests:[],neutralVillages:[],explorationWorlds:{},
        timeline:{...state.timeline,phase:"player",turnNumber:4,endedPlayerIds:[]}});
      const map=window.__v39FieldRuntime.mapData;map.fogMap=[];map.fogWeather={};map.grid[10][10]="森林";
        const ok=await window.advanceV39Turn({skipUnactedFocus:true});
        return {ok,turn:window.getV39GameState().timeline.turnNumber,last:map.fogWeather.lastCheckedTurn,
          count:map.fogMap.flat().filter(cell=>cell?.source==="natural").length};
    });
    assert.equal(weather.ok,true);assert.equal(weather.turn,5);assert.equal(weather.last,5);
    const corpseSpawn=await page.evaluate(()=>{
      const map=window.__v39FieldRuntime.mapData;map.fogMap=[];map.fogWeather={lastCorpseCheckedTurn:100000};
      map.grid[12][12]="平地";map.specialMap[12] ||= [];map.specialMap[12][12]=null;
      const hash=value=>{let n=2166136261;for(const char of value){n^=char.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};
      let turn=1;while(hash(`undead:12,12:T${turn}`)/4294967296>=0.01)turn++;
      window.setV39GameState({enemies:[],groundLootByTile:{"12,12":{cargo:{resourcesByType:{死体:100}}}},
        worldEnvironment:{activeDisasters:[],lastDisasterEvents:[]}});
      window.dispatchEvent(new CustomEvent("v39:turn-stage-world",{detail:{turnNumber:turn}}));
      return {spawned:window.getV39GameState().worldEnvironment.lastDisasterEvents.filter(event=>event.type==="undead-spawn"&&event.source==="死体").length,
        remaining:window.getV39GameState().groundLootByTile["12,12"]?.cargo?.resourcesByType?.死体||0};
    });
    assert.equal(corpseSpawn.spawned,1);assert.equal(corpseSpawn.remaining,0);
    const conversion=await page.evaluate(async()=>{
      const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
      for(const x of [14,16]) {
        map.grid[12][x]="平地";map.specialMap[12][x]=null;
        map.fogMap[12] ||= [];map.fogMap[12][x]={kind:"death",sourceKey:`${x},12`,expiresAtTurn:10};
      }
      const corpse={id:"conversion-body",name:"死亡個体",race:"只人",className:"ファイター",level:7,x:14,y:12,
        worldId:"surface",hp:0,currentHp:0,maxHp:100,state:"死亡",diedAtTurn:5,deadExpireTurn:10};
      window.setV39GameState({enemies:[corpse],enemySquads:[],worldEnvironment:{activeDisasters:[],lastDisasterEvents:[]},
        groundLootByTile:{"16,12":{cargo:{resourcesByType:{死体:100}}}},
        timeline:{...state.timeline,turnNumber:5,phase:"player",endedPlayerIds:[]}});
      const ok=await window.advanceV39Turn({skipUnactedFocus:true});
      const result=window.getV39GameState(),save=window.createV39SaveData();
      const spawned=result.enemies.filter(unit=>unit.spawnType==="死体アンデッド化");
      window.importV39SaveJson(window.exportV39SaveJson());
      const repeated=window.resolveV39CorpseUndead(6);
      return {ok,levels:spawned.map(unit=>({x:unit.x,level:unit.level,race:unit.race})),
        corpseRemaining:result.enemies.some(unit=>unit.id===corpse.id),
        resourceRemaining:result.groundLootByTile["16,12"]?.cargo?.resourcesByType?.死体||0,
        last:result.worldEnvironment.lastCorpseConversionTurn,repeated,
        savedSource:save.field.mapData.fogMap[12][14].sourceKey};
    });
    assert.equal(conversion.ok,true);assert.equal(conversion.levels.length,2);
    assert.equal(conversion.levels.find(unit=>unit.x===14).level,10);
    assert.ok(conversion.levels.every(unit=>["ゾンビ","スケルトン"].includes(unit.race)));
    assert.equal(conversion.corpseRemaining,false);assert.equal(conversion.resourceRemaining,0);
    assert.equal(conversion.last,6);assert.equal(conversion.repeated,null);assert.equal(conversion.savedSource,"14,12");
    await page.screenshot({path:`${out}/corpse-conversion-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: village delivery/hunt, cooldown, guardian supply/watch/transfer, victory and save passed`);
    await page.close();
  }
}finally{await browser.close();}
