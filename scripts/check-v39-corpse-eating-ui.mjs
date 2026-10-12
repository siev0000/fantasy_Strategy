import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
const browser=await chromium.launch();
mkdirSync("output/web-game/corpse-eating",{recursive:true});
try {
  for(const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",error=>errors.push(error.stack));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    const results=await page.evaluate(async()=>{
      const initial=window.getV39GameState(),pid=initial.activePlayerId,player=initial.players.find(row=>row.id===pid);
      const unit={...player.factionState.units[0],worldId:"surface",x:1,y:1,hp:1000,currentHp:1000,ap:100};
      const wolf={...unit,id:"corpse-eater",name:"食事検証ウルフ",race:"ウルフ",className:"ウルフ",x:8,y:8,
        hp:1000,currentHp:1000,maxHp:1000,aggressive:false,nestId:null,fleeState:null,aggroTargetUnitId:"",lastCorpseMealTurn:0,
        status:{...unit.status,索敵:500},skillLevels:{...unit.skillLevels,索敵:500}};
      const map=window.__v39FieldRuntime.mapData;map.isUnderground=false;map.fogMap=[];map.defenseStructures=[];
      for(let y=0;y<=13;y++)for(let x=0;x<=13;x++) {map.grid[y][x]="平地";map.specialMap[y] ||= [];map.specialMap[y][x]=null;}
      const prepare=(enemy=wolf,hero=unit)=>window.setV39GameState({activeWorldId:"surface",victory:{},enemyNests:[],enemySquads:[],
        enemies:[enemy,{id:"revivable",race:"只人",className:"ファイター",worldId:"surface",x:9,y:8,hp:0,currentHp:0,state:"死亡",deadExpireTurn:10}],
        neutralVillages:[],settlements:[],territoryOwnerByTile:{},explorationWorlds:{},
        enemyCombatRuntime:{lastActionTurnByEnemyId:{},pendingActionsByEnemyId:{},cooldownsByEnemyId:{},decisionLogsByFactionId:{}},
        players:initial.players.map(row=>row.id!==pid?row:{...row,factionState:{...row.factionState,units:[hero],squads:[],selectedUnitId:hero.id}}),
        groundLootByTile:{"9,8":{cargo:{resourcesByType:{死体:200,銀:3},equipmentInventory:[{id:"sword"}]}}},
        timeline:{...initial.timeline,turnNumber:1,phase:"player",endedPlayerIds:[]}});
      prepare();
      const inspection=window.inspectV39EnemyAi(wolf.id);
      const acted=window.runV39EnemyAi(1),after=window.getV39GameState();
      const safe={acted,decision:inspection.decision,amount:after.groundLootByTile["9,8"].cargo.resourcesByType.死体,
        ap:after.enemies.find(row=>row.id===wolf.id).ap,dead:after.enemies.some(row=>row.id==="revivable"&&row.hp===0),
        silver:after.groundLootByTile["9,8"].cargo.resourcesByType.銀,items:after.groundLootByTile["9,8"].cargo.equipmentInventory.length};
      window.importV39SaveJson(window.exportV39SaveJson());
      safe.repeated=window.runV39EnemyAi(1);
      const blocked=[];
      for(const [name,enemy,hero] of [
        ["nearby enemy",wolf,{...unit,x:9,y:8,skillLevels:{隠密:0},status:{...unit.status,隠密:0}}],
        ["retaliating",{...wolf,aggroTargetUnitId:unit.id},{...unit,x:10,y:8}],
        ["fleeing",{...wolf,fleeState:{active:true,targetUnitId:unit.id}},unit],
        ["herbivore",{...wolf,race:"ホース",className:"ホース"},unit],
        ["AP shortage",{...wolf,ap:20,currentAp:20},unit]
      ]) {
        prepare(enemy,hero);const decision=window.inspectV39EnemyAi(wolf.id).decision;
        window.runV39EnemyAi(1);const state=window.getV39GameState();
        blocked.push({name,decision,meal:state.enemies.find(row=>row.id===wolf.id).lastCorpseMealTurn||0});
      }
      prepare();window.setV39GameState({groundLootByTile:{"10,8":{cargo:{resourcesByType:{死体:200}}}}});
      const first=window.runV39EnemyAi(1),moving=window.getV39GameState();
      const second=window.runV39EnemyAi(1),moved=window.getV39GameState();
      const movement={first,second,x:moving.enemies.find(row=>row.id===wolf.id).x,
        beforeAmount:moving.groundLootByTile["10,8"]?.cargo?.resourcesByType?.死体,
        afterAmount:moved.groundLootByTile["10,8"]?.cargo?.resourcesByType?.死体};
      prepare();
      const workerBefore=window.inspectV39EnemyAi(wolf.id);
      const workerResult=await window.runV39EnemyTurn(1);
      const worker=window.getV39GameState();
      return {safe,blocked,movement,workerAmount:worker.groundLootByTile["9,8"]?.cargo?.resourcesByType?.死体,
        workerMeal:worker.enemies.find(row=>row.id===wolf.id).lastCorpseMealTurn,workerBefore,workerResult,
        workerEnemy:worker.enemies.find(row=>row.id===wolf.id),logs:worker.enemyCombatRuntime};
    });
    assert.equal(results.safe.acted,true);assert.equal(results.safe.decision,"死体資源を食べる");
    assert.equal(results.safe.amount,100);assert.equal(results.safe.ap,70);assert.equal(results.safe.dead,true);
    assert.equal(results.safe.silver,3);assert.equal(results.safe.items,1);assert.equal(results.safe.repeated,false);
    for(const row of results.blocked)assert.equal(row.meal,0,JSON.stringify(row));
    assert.equal(results.movement.first,true);assert.equal(results.movement.second,true);
    assert.equal(results.movement.x,9);assert.equal(results.movement.beforeAmount,200);assert.equal(results.movement.afterAmount,100);
    assert.equal(results.workerAmount,100,JSON.stringify(results));assert.equal(results.workerMeal,1);
    assert.deepEqual(errors,[]);
    await page.screenshot({path:`output/web-game/corpse-eating/${width}.png`});
    console.log(`${width}: safe feeding, combat/flee/retaliation restrictions, save/load, Worker and corpse preservation passed`);
    await page.close();
  }
} finally {await browser.close();}
