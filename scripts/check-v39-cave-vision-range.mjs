import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const directory = "output/web-game/cave-vision-range";
mkdirSync(directory, { recursive:true });
const browser = await chromium.launch({ headless:true });
const page = await browser.newPage({ viewport:{ width:1100, height:850 } });
const errors = [];
page.on("pageerror", error => errors.push(String(error)));
try {
  await page.goto("http://127.0.0.1:3022", { waitUntil:"networkidle" });
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button", { name:"探索ゲーム", exact:true }).click();
  await page.getByRole("button", { name:"探索開始", exact:true }).click();
  await page.waitForTimeout(800);
  const report = await page.evaluate(async () => {
    const combat = await import("/src/lib/v39-combat-engine.js");
    const vision = await import("/src/lib/v39-detection-rules.js");
    const planner = await import("/src/lib/v39-enemy-ai-planner.js");
    const map = window.__v39FieldRuntime.mapData;
    const ground = { ...map, isUnderground:false };
    const actor = window.getV39ActiveFactionState().units[0];
    const skill = { 名前:"地下射程試験", 行動:"A", 射程:20, AP消費:100, 物理:10, 判定:"攻撃", 攻撃手段:"爪" };
    const ranges = [0,10,20,40].map(raw => ({ raw,
      ground:combat.resolveAttackRange({射程:raw}, actor, ground),
      cave:combat.resolveAttackRange({射程:raw}, actor, map) }));
    const baseVision = vision.resolveV39UnitVisionRange(actor,ground);
    const caveVision = vision.resolveV39UnitVisionRange(actor,map);
    const visible = window.getV39VisibilityStatus().scoutRanges.find(row=>row.id===actor.id).range;
    const missingRange = combat.resolveAttackRange({},actor,map);
    const weaponUnit = {equipment:[{slot:"武器1",range:20,power:10,source:{装備名:"試験弓",射程:20}}]};
    const weaponRange = combat.resolveAttackRange({攻撃手段:"武器"},weaponUnit,map);
    const registry=await import("/src/lib/game-data-registry.js");
    registry.getGameDataTable("テストスキル").push({...skill,テスト専用:true});
    window.setV39TestMode(true);
    const faction=window.getV39ActiveFactionState();
    window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id!==actor.id ? unit : {
      ...unit,testSkillNames:[skill.名前]
    })});
    await window.waitForV39MapRenderSettled();
    document.querySelector('[data-squad-detail-tab="action"]').click();
    await new Promise(resolve=>setTimeout(resolve,200));
    [...document.querySelectorAll('[data-v39-attack-name]')].find(button=>button.dataset.v39AttackName===skill.名前).click();
    const playerPreview=window.getV39AttackSession()?.range;
    window.cancelV39SelectedUnitAttack();
    const enemy = {id:"cave-range-enemy",name:"地下射程敵",level:5,x:10,y:10,hp:1000,maxHp:1000,ap:100,currentAp:100,
      aggressive:true,neverFlee:true,aggroTargetUnitId:actor.id,status:{索敵:750,攻撃:100,移動:50},techniques:[{source:skill}]};
    const state = window.getV39GameState();
    const player = state.players.find(row=>row.id===state.activePlayerId);
    const target = {...actor,x:13,y:10,hp:1000,currentHp:1000,techniques:[],equipment:[]};
    const fixture = {...state,enemies:[enemy],enemyNests:[],enemySquads:[],neutralVillages:[],settlements:[],
      enemyCombatRuntime:{pendingActionsByEnemyId:{},lastActionTurnByEnemyId:{},cooldownsByEnemyId:{}},
      players:[{...player,factionState:{...player.factionState,units:[target],selectedUnitId:target.id}}]};
    const groundAction = planner.planNextEnemyAction(fixture,ground,2).type;
    const caveAction = planner.planNextEnemyAction(fixture,map,2).type;
    const aiVision = planner.inspectEnemyAiState(fixture,enemy.id,2,map).visionRadius;
    window.setV39GameState(fixture);
    const presentation = window.playV39EnemyTurnPresentation;
    let attackEvents=0;
    window.playV39EnemyTurnPresentation = async events => { attackEvents=events.filter(row=>row.type==="attack").length;return 0; };
    const profile=await window.runV39EnemyTurn(2);
    window.playV39EnemyTurnPresentation=presentation;
    const finalAp=window.getV39GameState().enemies[0].ap;
    return { ranges,baseVision,caveVision,visible,missingRange,weaponRange,playerPreview,groundAction,caveAction,aiVision,
      expectedAiVision:vision.resolveV39UnitVisionRange(enemy,map),attackEvents,finalAp,profile };
  });
  assert.deepEqual(report.ranges.map(row=>row.ground),[1,1,2,4]);
  assert.deepEqual(report.ranges.map(row=>row.cave),[1,2,4,8]);
  assert.equal(report.caveVision,report.baseVision+2);
  assert.equal(report.visible,report.caveVision);
  assert.equal(report.missingRange,1);
  assert.equal(report.weaponRange,4);
  assert.equal(report.playerPreview,4);
  assert.equal(report.groundAction,"move");
  assert.equal(report.caveAction,"attack");
  assert.equal(report.aiVision,report.expectedAiVision);
  assert.equal(report.attackEvents,1);
  assert.equal(report.finalAp,0);
  assert.equal(report.profile.fallbackUsed,false);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${directory}/screen.png`});
  console.log(JSON.stringify({...report,errors},null,2));
} finally { await browser.close(); }
