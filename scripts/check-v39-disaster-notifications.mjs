import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disaster-notifications';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39DisasterTest);
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({natural:true});await window.waitForV39MapRenderSettled();});
  const report=await page.evaluate(async()=>{
    const originalVision=window.isV39TileInCurrentVision;
    const logs=id=>window.getV39ActiveFactionState().activityLog.filter(row=>row.detail?.id===id&&row.detail?.disasterPhase);
    const tick=turn=>{
      const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:turn}});
      window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:turn}}));
    };
    const start=point=>{
      const result=window.forceV39Disaster('災害:干ばつ',point);
      if(!result.ok||!result.disasters.length)throw new Error('could not create fixture disaster');
      const event=result.disasters[0],s=window.getV39GameState();
      window.setV39GameState({worldEnvironment:{...s.worldEnvironment,activeDisasters:s.worldEnvironment.activeDisasters.map(row=>row.id===event.id?{...row,expiresAtTurn:s.timeline.turnNumber+1}:row)}});
      return event;
    };
    try{
      await window.setV39TestMode(false);await window.waitForV39MapRenderSettled();
      const key=[...window.getV39VisibilitySnapshot().currentVisionTileKeys][0];
      if(!key)throw new Error('normal mode has no vision');
      const [x,y]=key.split(',').map(Number),visible=start({x,y}),turn=window.getV39GameState().timeline.turnNumber;
      const phases=[logs(visible.id).map(row=>row.detail.disasterPhase)];
      const repeat=window.forceV39Disaster('災害:干ばつ',{x,y});
      tick(turn);phases.push(logs(visible.id).map(row=>row.detail.disasterPhase));
      tick(turn+1);phases.push(logs(visible.id).map(row=>row.detail.disasterPhase));
      window.importV39SaveJson(window.exportV39SaveJson());
      tick(turn+2);phases.push(logs(visible.id).map(row=>row.detail.disasterPhase));
      tick(turn+3);phases.push(logs(visible.id).map(row=>row.detail.disasterPhase));
      const visibleMessages=window.getV39SideRailMessages().filter(row=>row.environmentVisibility&&row.message.includes(`(${x},${y})`));
      const foreignLeak=window.getV39GameState().players.filter(p=>p.id!==window.getV39GameState().activePlayerId)
        .some(p=>(p.factionState.activityLog||[]).some(row=>row.detail?.id===visible.id));
      window.isV39TileInCurrentVision=()=>false;
      const hidden=start({x:20,y:20});tick(turn+5);const hiddenLogs=logs(hidden.id);
      await window.setV39TestMode(true);
      window.isV39TileInCurrentVision=()=>false;
      const global=start({x:20,y:20});tick(turn+7);const globalLogs=logs(global.id);
      const globalVisible=window.getV39SideRailMessages().filter(row=>row.environmentVisibility&&!row.environmentVisibility.observed&&row.message.includes('(20,20)')).length;
      await window.setV39TestMode(false);
      const hiddenAfterToggle=window.getV39SideRailMessages().filter(row=>row.environmentVisibility&&!row.environmentVisibility.observed).length;
      window.isV39TileInCurrentVision=(x,y)=>x===5&&y===4;
      const edge=start({x:4,y:4});tick(turn+9);const edgeLogs=logs(edge.id);
      window.__v39BackgroundWorldTurn=true;window.isV39TileInCurrentVision=()=>true;
      const background=start({x:8,y:8});tick(turn+11);const backgroundLogs=logs(background.id);
      window.__v39BackgroundWorldTurn=false;
      return {phases,repeat,visibleMessages:visibleMessages.map(row=>row.message),foreignLeak,hiddenLogs,globalLogs:globalLogs.map(row=>row.detail.disasterPhase),globalVisible,hiddenAfterToggle,edgeLogs:edgeLogs.map(row=>row.detail.disasterPhase),backgroundLogs};
    }finally{window.isV39TileInCurrentVision=originalVision;window.__v39BackgroundWorldTurn=false;}
  });
  assert.deepEqual(report.phases,[['started'],['started'],['started'],['started','ended'],['started','ended']]);
  assert.equal(report.repeat.reason,'already-active');assert.equal(report.visibleMessages.length,2);
  assert(report.visibleMessages[0].includes('発生中')&&report.visibleMessages[1].includes('終了'));
  assert.equal(report.foreignLeak,false);assert.deepEqual(report.hiddenLogs,[]);
  assert.deepEqual(report.globalLogs,['started','ended']);assert.equal(report.globalVisible,2);assert.equal(report.hiddenAfterToggle,0);
  assert.deepEqual(report.edgeLogs,['started','ended']);assert.deepEqual(report.backgroundLogs,[]);
  await page.evaluate(async()=>{await window.setV39TestMode(true);window.startV39DisasterTest({natural:true});window.forceV39Disaster('災害:干ばつ',{x:4,y:4});window.activateV39FooterTab('squad');await window.waitForV39MapRenderSettled();});
  if(await page.locator('#v39-side-log.collapsed').count())await page.locator('.v39-side-log-collapse').click();
  assert((await page.locator('#v39-side-log').innerText()).includes('干ばつ 発生中'));
  await page.screenshot({path:`${out}/started-390.png`});
  await page.evaluate(async()=>{
    const s=window.getV39GameState(),turn=s.timeline.turnNumber+1;
    window.setV39GameState({timeline:{...s.timeline,turnNumber:turn},worldEnvironment:{...s.worldEnvironment,
      activeDisasters:s.worldEnvironment.activeDisasters.map(row=>({...row,expiresAtTurn:turn-1}))}});
    window.dispatchEvent(new CustomEvent('v39:turn-stage-world',{detail:{turnNumber:turn}}));
    await window.waitForV39MapRenderSettled();
  });
  assert((await page.locator('#v39-side-log').innerText()).includes('干ばつが終了'));
  await page.screenshot({path:`${out}/ended-390.png`});
  assert.deepEqual(errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
