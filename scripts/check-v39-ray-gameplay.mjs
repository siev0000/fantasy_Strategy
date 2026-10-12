import assert from "node:assert/strict";
import { mkdirSync,writeFileSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const out="output/web-game/combat-ray";
mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [1100,390]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:3000",{waitUntil:"networkidle"});
    await page.locator("[data-v39-cave-test]").click();
    await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
    await page.getByRole("button",{name:"探索開始",exact:true}).click();
    await page.waitForTimeout(700);
    const result=await page.evaluate(async()=>{
      await window.setV39TestMode(true);
      window.__v39SuppressCombatEffects=true;
      const map=window.__v39FieldRuntime.mapData;
      map.grid=map.grid.map(row=>row.map(()=>"洞窟"));map.worldWrapEnabled=false;
      map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
      const initial=window.getV39GameState(),player=initial.players[0],worldId=initial.activeWorldId;
      const actor={...player.factionState.units[0],id:"ray-actor",name:"射線試験官",x:5,y:10,worldId,
        hp:5000,currentHp:5000,maxHp:5000,ap:100,currentAp:100,waitTurnNumber:0,guard:0,shield:null,barrier:null,
        equipment:[],techniques:[],status:{攻撃:100,魔力:100,命中:100000,精神:0,防御:0,速度:100,SIZ:10}};
      const enemy=(id,x,extra={})=>({id,name:id,x,y:10,worldId,hp:5000,currentHp:5000,maxHp:5000,
        level:1,ap:100,currentAp:100,nestId:id,status:{防御:0,精神:0,速度:0,回避:1,命中:100000,攻撃:100},...extra});
      const row=(extra={})=>({名前:"射線確認",行動:"A",攻撃手段:"テスト",物理:200,AP消費:0,
        射程:30,攻撃回数:5,判定:"攻撃",...extra});
      const reset=({units=[actor],enemies=[enemy("front",7),enemy("rear",9),enemy("far",11),enemy("outside",13)],structures=[]}={})=>{
        map.defenseStructures=structuredClone(structures);
        window.setV39GameState({players:[{...player,factionState:{...player.factionState,units:structuredClone(units),
          squads:[],selectedUnitId:actor.id,combatRuntime:{},villagePlacementMode:false}}],
          enemies:structuredClone(enemies),neutralVillages:[],enemyCombatRuntime:{},timeline:{...initial.timeline,turnNumber:1,phase:"player"}});
      };
      const shoot=skillRow=>window.executeV39FactionCombatAction({playerId:player.id,attackerId:actor.id,target:{x:9,y:10},skillRow});
      const losses=()=>Object.fromEntries(window.getV39GameState().enemies.map(e=>[e.id,5000-e.hp]));
      const results={};
      results.guaranteed=window.computeV39AttackDamage({attacker:actor,target:enemy("accuracy",9),
        skillRow:row({効果:"必中"}),random:()=>1}).hitResults.every(hit=>hit.hit);
      reset();results.single={cast:shoot(row()),loss:losses()};
      reset();results.splash={cast:shoot(row({炸裂:1})),loss:losses()};
      reset();results.pierce={cast:shoot(row({効果:"貫通"})),loss:losses()};
      reset();results.damageTypeOnly={cast:shoot(row({貫通:100})),loss:losses()};
      // 味方は通常射線を通し、範囲内でもHP・防御残量を消費しない。
      for (const [name,extra,x] of [["friendlySingle",{},7],["friendlySplash",{炸裂:1},8],["friendlyPierce",{効果:"貫通"},7]]) {
        const ally={...actor,id:"friendly",x,guard:80,
          shield:{maximum:60,remaining:60,expiresAtTurn:10,refreshedAtTurn:1},
          barrier:{maximum:90,remaining:90,expiresAtTurn:10}};
        reset({units:[actor,ally],enemies:[enemy("rear",9)]});
        const cast=shoot(row(extra)),after=window.getV39ActiveFactionState().units.find(u=>u.id===ally.id);
        results[name]={cast,loss:losses(),hp:after.hp,guard:after.guard,shield:after.shield.remaining,barrier:after.barrier.remaining};
      }
      reset({enemies:[enemy("front",7,{hp:0,currentHp:0,state:"死亡"}),enemy("rear",9)]});
      results.corpse={cast:shoot(row()),loss:losses()};
      reset({enemies:[enemy("front",7,{rayBlockExpiresAtTurn:3}),enemy("rear",9)]});
      results.blockPierce={cast:shoot(row({効果:"貫通"})),loss:losses()};
      reset({enemies:[enemy("front",7,{rayBlockExpiresAtTurn:3}),enemy("rear",9)]});
      results.blockSplash={cast:shoot(row({炸裂:1})),loss:losses()};
      reset({enemies:[enemy("front",7,{worldId:"another-world"}),enemy("rear",9)]});
      results.otherWorld={cast:shoot(row()),loss:losses()};
      const wall={id:"wall",kind:"壁",name:"試験壁",x:7,y:10,hp:10,maxHp:10,tiles:[{x:7,y:10}]};
      reset({structures:[wall]});results.wall={cast:shoot(row({効果:"貫通",炸裂:1})),loss:losses(),hp:map.defenseStructures[0].hp};
      reset({structures:[{...wall,id:"edge",edge:{from:{x:6,y:10},to:{x:7,y:10}},tiles:[{x:6,y:10}]}]});
      results.edge={cast:shoot(row({効果:"貫通"})),loss:losses(),hp:map.defenseStructures[0].hp};
      reset({structures:[{...wall,id:"field",kind:"結界",ownerId:player.id,tiles:[{x:7,y:10},{x:8,y:10},{x:9,y:10}]}]});
      results.field={cast:shoot(row({効果:"貫通"})),loss:losses(),hp:map.defenseStructures[0].hp};
      reset({structures:[{...wall,id:"field-exit",kind:"結界",ownerId:player.id,tiles:[{x:5,y:10},{x:6,y:10}]}]});
      results.fieldExit={cast:shoot(row({効果:"貫通"})),loss:losses(),hp:map.defenseStructures[0].hp};
      reset({units:[actor,{...actor,id:"ally",name:"遮断役",x:7}]});
      results.blockCast=window.executeV39FactionCombatAction({playerId:player.id,attackerId:actor.id,target:{x:7,y:10},
        skillRow:row({名前:"遮断確認",物理:0,効果:"遮断",効果時間:2,ガード:25})});
      results.blockDeadline=window.getV39ActiveFactionState().units.find(u=>u.id==="ally").rayBlockExpiresAtTurn;
      const save=JSON.parse(window.exportV39SaveJson());
      results.savedDeadline=save.gameState.players[0].factionState.units.find(u=>u.id==="ally").rayBlockExpiresAtTurn;
      results.allyBlock={cast:shoot(row({効果:"貫通"})),loss:losses()};
      const expired=window.getV39GameState();
      window.setV39GameState({timeline:{...expired.timeline,turnNumber:3},players:expired.players.map(p=>({...p,
        factionState:{...p.factionState,combatRuntime:{}}}))});
      results.expired={cast:shoot(row({効果:"貫通"})),loss:losses()};
      reset({units:[actor,{...actor,id:"dead-ally",x:6,hp:0,currentHp:0,state:"死亡"}],enemies:[]});
      results.plainRevival=window.executeV39FactionCombatAction({playerId:player.id,attackerId:actor.id,target:{x:6,y:10},
        skillRow:row({名前:"簡易蘇生",物理:0,効果:"蘇生",回復:55})});
      results.revivedHp=window.getV39ActiveFactionState().units.find(u=>u.id==="dead-ally").hp;
      reset({units:[actor,{...actor,id:"middle",x:7},{...actor,id:"target",x:9}],enemies:[enemy("shooter",3)]});
      // 敵自身も同じ射線を使用。射手と対象の間の操作キャラで止まる。
      results.enemyCast=window.executeV39EnemyCombatAction({enemyId:"shooter",targetUnitId:"target",skillRow:row(),apPaid:true});
      results.enemyLoss=Object.fromEntries(window.getV39ActiveFactionState().units.map(u=>[u.id,5000-u.hp]));
      reset({units:[actor,{...actor,id:"middle",x:7},{...actor,id:"target",x:9}],enemies:[enemy("shooter",3)]});
      results.enemyPierce=window.executeV39EnemyCombatAction({enemyId:"shooter",targetUnitId:"target",skillRow:row({名前:"敵貫通確認",効果:"貫通"}),apPaid:true});
      results.enemyPierceLoss=Object.fromEntries(window.getV39ActiveFactionState().units.map(u=>[u.id,5000-u.hp]));
      for (const [name,extra,x] of [["enemyFriendlySingle",{},7],["enemyFriendlySplash",{炸裂:1},8]]) {
        reset({units:[{...actor,id:"target",x:9}],enemies:[enemy("shooter",3,{nestId:"same-nest"}),enemy("nest-ally",x,{nestId:"same-nest"})]});
        const cast=window.executeV39EnemyCombatAction({enemyId:"shooter",targetUnitId:"target",
          skillRow:row({名前:name,...extra}),apPaid:true});
        results[name]={cast,loss:losses(),targetLoss:5000-window.getV39ActiveFactionState().units[0].hp};
      }
      reset({units:[]});
      window.setV39GameState({neutralVillages:[{id:"ray-village",defenseUnits:[{...actor,id:"ray-guard"}]}]});
      results.guardCast=window.executeV39NeutralVillageGuardCombatAction({villageId:"ray-village",guardId:"ray-guard",
        targetEnemyId:"rear",skillRow:row()});
      results.guardLoss=losses();
      reset({units:[{...actor,testSkillNames:["TEST_貫通"]}]});
      const area=window.buildV39AttackAreaScaleMap(actor,{x:9,y:10},row());
      results.preview=[...area.keys()];
      window.refreshV39MapEntities();
      window.dispatchEvent(new CustomEvent("v39:unit-selected",{detail:{unitId:actor.id}}));
      window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.centerOn(7*62+31,10*56+37);
      return results;
    });
    for (const name of ["single","damageTypeOnly"]) {
      assert.ok(result[name].cast);assert.ok(result[name].loss.front>0);assert.equal(result[name].loss.rear,0);
    }
    assert.ok(result.splash.loss.rear>0);assert.equal(result.splash.loss.front,0);
    for (const id of ["front","rear","far"]) assert.ok(result.pierce.loss[id]>0,JSON.stringify(result.pierce));
    assert.equal(result.pierce.loss.outside,0);
    for (const name of ["friendlySingle","friendlySplash","friendlyPierce"]) {
      const r=result[name];assert.ok(r.cast);assert.equal(r.hp,5000);assert.equal(r.guard,80);
      assert.equal(r.shield,60);assert.equal(r.barrier,90);
      assert.ok(r.loss.rear>0);
    }
    assert.ok(result.corpse.loss.rear>0);
    for (const name of ["blockPierce","blockSplash"]) {assert.ok(result[name].loss.front>0);assert.equal(result[name].loss.rear,0);}
    assert.ok(result.otherWorld.loss.rear>0);assert.equal(result.otherWorld.loss.front,0);
    for (const name of ["wall","edge","field","fieldExit"]) {assert.ok(result[name].cast);assert.equal(result[name].hp,0);
      assert.equal(result[name].loss.front,0);assert.equal(result[name].loss.rear,0);}
    assert.ok(result.blockCast);assert.equal(result.blockDeadline,3);assert.equal(result.savedDeadline,3);
    assert.ok(result.guaranteed);assert.ok(result.plainRevival);assert.equal(result.revivedHp,55);
    assert.equal(result.allyBlock.loss.rear,0);assert.ok(result.expired.loss.rear>0);
    assert.ok(result.enemyCast);assert.ok(result.enemyLoss["ray-actor"]>0);assert.equal(result.enemyLoss.target,0);
    assert.ok(result.enemyPierce);for (const id of ["ray-actor","middle","target"]) assert.ok(result.enemyPierceLoss[id]>0);
    for (const name of ["enemyFriendlySingle","enemyFriendlySplash"]) {
      assert.ok(result[name].cast);assert.equal(result[name].loss["nest-ally"],0);
    }
    assert.ok(result.enemyFriendlySingle.targetLoss>0);assert.ok(result.enemyFriendlySplash.targetLoss>0);
    assert.ok(result.guardCast);assert.ok(result.guardLoss.front>0);assert.equal(result.guardLoss.rear,0);
    assert.deepEqual(result.preview,["7,10"]);
    await page.locator('[data-foot="squad"]').click();
    await page.locator('[data-squad-detail-tab="action"]').click();
    await page.locator('[data-v39-technique-name="TEST_貫通"]').click();
    await page.evaluate(()=>window.executeV39AttackAt(9,10));
    assert.deepEqual(await page.evaluate(()=>window.getV39AttackSession().confirmedTarget),{x:9,y:10});
    await page.waitForTimeout(400);await page.screenshot({path:`${out}/${width}.png`});
    assert.deepEqual(errors,[]);writeFileSync(`${out}/${width}.json`,JSON.stringify(result,null,2));
    console.log(JSON.stringify({width,result}));await page.close();
  }
} finally {await browser.close();}
