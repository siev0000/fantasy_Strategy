import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/recovery-wait';mkdirSync(out,{recursive:true});
const recovery=await import(`data:text/javascript;base64,${Buffer.from(readFileSync('frontend/src/lib/v39-recovery-wait.js','utf8')).toString('base64')}`);
assert.equal(recovery.normalizeV39RecoveryWaitPercent(undefined),100);
assert.equal(recovery.normalizeV39RecoveryWaitPercent(''),100);
assert.equal(recovery.normalizeV39RecoveryWaitPercent(200),100);
assert.equal(recovery.normalizeV39RecoveryWaitPercent(-10),1);
assert(recovery.isV39UnitRecoveryWaiting({hp:74,maxHp:147,recoveryWaitTargetPercent:51}));
assert(!recovery.isV39UnitRecoveryWaiting({hp:75,maxHp:147,recoveryWaitTargetPercent:51}));
assert.equal(recovery.finishV39RecoveryWait({hp:0,maxHp:100,recoveryWaitTargetPercent:100}).recoveryWaitTargetPercent,0);
const browser=await chromium.launch();
try {
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39ExpeditionTest();
    const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);
    const u=p.factionState.units.find(u=>u.id===p.factionState.selectedUnitId);
    window.setV39GameState({enemies:[],players:[{...p,factionState:{...p.factionState,squads:[],units:[{...u,squadId:'solo',squadMoveMode:'independent',hp:115,currentHp:115,lastMovedTurn:0,lastCombatTurn:0,starvationStage:0}]}}]});
    window.activateV39FooterTab('squad');await window.waitForV39MapRenderSettled();
  });
  await page.locator('[data-squad-detail-tab="basic"]').click();
  await page.locator('#mobileBattleRecoveryWait').click();
  await page.locator('#mobileBattleRecoveryWaitUse').click();
  await page.waitForFunction(()=>document.getElementById('mobileBattleRecoveryWaitUse').textContent==='解除');
  const initial=await page.evaluate(()=>window.getV39ActiveFactionState().units[0]);
  assert.equal(initial.recoveryWaitTargetPercent,100);assert.equal(initial.lastCombatTurn,0);
  assert.equal(await page.evaluate(()=>window.startV39SelectedUnitMove()),false,'recovery-waiting units cannot begin movement');
  await page.screenshot({path:`${out}/active-${width}.png`});
  const rows=await page.evaluate(async()=>{
    const rows=[];
    for(let i=0;i<3;i++){
      const ok=await window.advanceV39Turn({presentation:false});
      const u=window.getV39ActiveFactionState().units[0];
      rows.push({ok,hp:u.hp,currentHp:u.currentHp,target:u.recoveryWaitTargetPercent,ap:u.ap,turn:window.getV39TimelineState().turnNumber});
    }
    return rows;
  });
  assert.deepEqual(rows.map(r=>r.hp),[121,127,130]);assert(rows.every(r=>r.ok&&r.ap===100&&r.hp===r.currentHp));
  assert.equal(rows[1].target,100);assert.equal(rows[2].target,0);
  assert.equal(await page.evaluate(()=>window.advanceV39Turn({presentation:false})),false,'completed unit must require normal action again');
  // Configure the target through the real settings input, not a separate test setting.
  await page.locator('[data-foot="manage"]').click();
  await page.locator('#v39-manage-menu [data-open="settings"]').click();
  await page.locator('#v39-recovery-wait-percent').fill('50');
  await page.locator('#v39-recovery-wait-percent').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>window.getV39GameState({includeWorlds:false}).gameSettings.recoveryWaitHpPercent),50);
  await page.screenshot({path:`${out}/settings-${width}.png`});
  await page.locator('#settingsModal [data-close]').click();
  const extra=await page.evaluate(async()=>{
    const setUnit=patch=>{const s=window.getV39GameState({includeWorlds:false});window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,...patch}))}}))});};
    setUnit({hp:50,currentHp:50});
    const start=window.waitV39SelectedUnit({recovery:true});
    const save=window.exportV39SaveJson();window.importV39SaveJson(save);
    const restored={settings:window.getV39GameState({includeWorlds:false}).gameSettings,target:window.getV39ActiveFactionState().units[0].recoveryWaitTargetPercent};
    const hp=[];for(let i=0;i<3;i++){await window.advanceV39Turn({presentation:false});hp.push(window.getV39ActiveFactionState().units[0].hp);}
    const targetAfter=window.getV39ActiveFactionState().units[0].recoveryWaitTargetPercent;
    setUnit({hp:40,currentHp:40});window.waitV39SelectedUnit({recovery:true});
    const ap=window.getV39ActiveFactionState().units[0].ap;
    const cancel=window.waitV39SelectedUnit({cancelRecovery:true}),cancelled=window.getV39ActiveFactionState().units[0];
    setUnit({transportAssignment:{enabled:true}});const duty=window.waitV39SelectedUnit({recovery:true});setUnit({transportAssignment:null});
    window.waitV39SelectedUnit({recovery:true});
    window.dispatchEvent(new CustomEvent('v39:combat-log',{detail:{attackerId:cancelled.id,skillName:'検証攻撃',entries:[]}}));
    await window.advanceV39Turn({presentation:false});const combat=window.getV39ActiveFactionState().units[0];
    return {start,restored,hp,targetAfter,cancel,cancelled,ap,duty,combat};
  });
  assert(extra.start.ok);assert.equal(extra.restored.settings.recoveryWaitHpPercent,50);assert.equal(extra.restored.target,50);
  assert.deepEqual(extra.hp,[56,62,68]);assert.equal(extra.targetAfter,0);
  assert(extra.cancel.ok);assert.equal(extra.cancelled.recoveryWaitTargetPercent,0);assert.equal(extra.cancelled.waitTurnNumber,0);assert.equal(extra.cancelled.ap,extra.ap);
  assert.equal(extra.duty.reason,'automatic-duty');assert.equal(extra.combat.hp,40);assert.equal(extra.combat.recoveryWaitTargetPercent,50);
  await page.locator('[data-foot="manage"]').click();
  await page.locator('#v39-manage-menu [data-open="settings"]').click();
  await page.locator('#v39-recovery-wait-percent').fill('25');
  await page.locator('#v39-recovery-wait-percent').dispatchEvent('change');
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].recoveryWaitTargetPercent),0,'lowering the active target can finish waiting immediately');
  assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units[0].hp),40);
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}/report-${width}.json`,JSON.stringify({rows,extra},null,2));
  console.log(`${width}: automatic wait until 100%/50%, no repeated commands, normal focus restored, cancel, settings/save, duty exclusion and combat delay OK`);
  await page.close();
 }
}finally{await browser.close();}
