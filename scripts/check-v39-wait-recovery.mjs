import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/wait-recovery';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();
    const s=window.getV39GameState(),player=s.players.find(p=>p.id===s.activePlayerId);
    const base=player.factionState.units.find(u=>u.id===player.factionState.selectedUnitId);
    const unit={...base,hp:50,currentHp:50,lastMovedTurn:0,lastCombatTurn:0,starvationStage:0,squadMoveMode:'solo'};
    window.setV39GameState({enemies:[],players:[{...player,factionState:{...player.factionState,units:[unit],squads:[]}}]});
    const read=()=>{const u=window.getV39ActiveFactionState().units[0];return {turn:window.getV39TimelineState().turnNumber,hp:u.hp,currentHp:u.currentHp,maxHp:u.maxHp,lastMovedTurn:u.lastMovedTurn,lastCombatTurn:u.lastCombatTurn};};
    const initial=read(),rows=[];
    for(let i=0;i<3;i++){
      const turn=window.getV39TimelineState().turnNumber;
      const wait=window.waitV39SelectedUnit();const afterWait=read();
      const advanced=await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});
      rows.push({turn,wait,afterWait,advanced,after:read()});
    }
    // A genuine combat log must still suppress recovery even if followed by waiting.
    const turn=window.getV39TimelineState().turnNumber;
    window.dispatchEvent(new CustomEvent('v39:combat-log',{detail:{skillName:'検証攻撃',attackerId:unit.id,entries:[]}}));
    window.waitV39SelectedUnit();const combatBefore=read();
    await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});
    const combatAfter=read();
    window.markV39UnitActivity(unit.id,'lastMovedTurn','recovery-test-movement');
    window.waitV39SelectedUnit();const movedBefore=read();
    await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});
    const movedAfter=read();
    window.activateV39FooterTab('squad');
    return {initial,rows,combat:{turn,before:combatBefore,after:combatAfter},moved:{before:movedBefore,after:movedAfter}};
  });
  writeFileSync(`${out}/report.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
  for(const row of result.rows){
    assert(row.wait.ok&&row.advanced);
    assert.equal(row.afterWait.lastCombatTurn,0,'wait must not mark combat activity');
    assert.equal(row.after.hp,Math.min(row.after.maxHp,row.afterWait.hp+Math.max(1,Math.floor(row.after.maxHp*.05))));
    assert.equal(row.after.currentHp,row.after.hp);
  }
  assert.equal(result.combat.before.lastCombatTurn,result.combat.turn);
  assert.equal(result.combat.before.hp,result.combat.after.hp,'actual combat must suppress recovery');
  assert.equal(result.moved.before.hp,result.moved.after.hp,'actual movement must suppress recovery');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`${out}/recovered-390.png`});
  console.log('PASS: three actual wait/end-turn cycles recover HP; combat and movement still prevent recovery');
}finally{await browser.close();}
