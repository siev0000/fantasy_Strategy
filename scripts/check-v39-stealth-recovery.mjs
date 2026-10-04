import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync("output/web-game/stealth-recovery",{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];
page.on("pageerror",error=>errors.push(String(error)));
try{
  await page.goto("http://127.0.0.1:3022",{waitUntil:"networkidle"});
  await page.locator("[data-v39-cave-test]").click();
  await page.getByRole("button",{name:"探索ゲーム",exact:true}).click();
  await page.getByRole("button",{name:"探索開始",exact:true}).click();
  await page.waitForTimeout(700);
  const report=await page.evaluate(async()=>{
    const d=await import("/src/lib/v39-detection-rules.js");
    const check=(ok,message)=>{if(!ok)throw new Error(message);};
    const unit={status:{隠密:90},lastStealthAttackTurn:5,lastStealthBreakTurn:5,lastStealthBreakReason:"attack"};
    const sequence=[5,6,7,8].map(turnNumber=>d.resolveDetectionStealthValue(unit,{turnNumber}));
    check(JSON.stringify(sequence)==="[0,30,60,90]","0/third/two-thirds/full");
    const targeted={...unit,lastStealthBreakTurn:6,lastStealthBreakReason:"direct-target"};
    check(d.resolveDetectionStealthValue(targeted,{turnNumber:6})===0,"direct target exposes this turn");
    check(d.resolveDetectionStealthValue(targeted,{turnNumber:7})===60,"direct targeting must not erase attack recovery");
    const old={status:{隠密:90},lastStealthBreakTurn:5,lastStealthBreakReason:"attack"};
    check(d.resolveDetectionStealthValue(old,{turnNumber:6})===30,"old save compatibility");
    const victim={status:{隠密:90},lastStealthBreakTurn:5,lastStealthBreakReason:"direct-target"};
    check(d.resolveDetectionStealthValue(victim,{turnNumber:6})===90,"nonattacking victim retains existing one-turn exposure");
    const repeated={...unit,lastStealthAttackTurn:7,lastStealthBreakTurn:7};
    check(d.resolveDetectionStealthValue(repeated,{turnNumber:7})===0,"reattack resets");
    check(d.resolveDetectionStealthValue(repeated,{turnNumber:8})===30,"reattack recovery");
    const state=window.getV39GameState(),faction=window.getV39ActiveFactionState(),actor=window.getV39SelectedSquadUnit();
    const enemy={...state.enemies[0],x:actor.x+1,y:actor.y,hp:9999,currentHp:9999,maxHp:9999,ap:100,currentAp:100,status:{...state.enemies[0].status,隠密:90}};
    window.__v39SuppressCombatEffects=true;
    window.setV39GameState({enemies:[enemy],players:state.players.map(player=>player.id!==state.activePlayerId?player:{...player,factionState:{...faction,
      units:faction.units.map(unit=>unit.id!==actor.id?unit:{...unit,ap:100,currentAp:100,status:{...unit.status,隠密:90}})}})});
    const skillRow={名前:"露見試験",行動:"A",全威力:0,判定:"攻撃",攻撃手段:"爪",射程:10,AP消費:1};
    check(window.executeV39FactionCombatAction({playerId:state.activePlayerId,attackerId:actor.id,targetUnitId:enemy.id,skillRow}),"player attack succeeds");
    check(window.getV39SelectedSquadUnit().lastStealthAttackTurn===state.timeline.turnNumber,"player attack stamps recovery");
    check(window.executeV39EnemyCombatAction({enemyId:enemy.id,targetUnitId:actor.id,skillRow}),"enemy attack succeeds");
    const updated=window.getV39GameState().enemies[0];
    check(updated.lastStealthAttackTurn===state.timeline.turnNumber,"enemy attack stamps recovery");
    const values=[0,1,2,3].map(delta=>d.resolveDetectionStealthValue(updated,{turnNumber:state.timeline.turnNumber+delta}));
    const base=values[3];
    check(values[0]===0&&values[1]===Math.round(base/3*10)/10&&values[2]===Math.round(base*2/3*10)/10,"enemy and player same formula");
    check(unit.status.隠密===90,"base stats unchanged");
    return {sequence,values,playerAttack:true,enemyAttack:true};
  });
  assert.deepEqual(errors,[]);
  await page.screenshot({path:"output/web-game/stealth-recovery/combat.png"});
  console.log("PASS stealth recovery, repeated/direct attacks, legacy saves, actual player/enemy combat",report);
}finally{await browser.close();}
