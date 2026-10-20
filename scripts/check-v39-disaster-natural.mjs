import assert from 'node:assert/strict';
import fixture from '../config/v39-disaster-test.json' with {type:'json'};
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disaster-natural';mkdirSync(out,{recursive:true});
const baseRates=Object.fromEntries(JSON.parse(readFileSync('data/source/export/json/災害.json','utf8')).map(row=>[row.ID,row.基本発生率]));
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.closeV39PlayModeSelection==='function'&&typeof window.startV39DisasterTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();});
    await page.locator('[data-test-action="disaster-natural-start"]').click();
    await page.waitForFunction(()=>window.__v39FieldRuntime.mapData.disasterNaturalTestFixture);
    const initial=await page.evaluate(()=>({events:window.getV39GameState().worldEnvironment.activeDisasters.length,rules:window.inspectV39NaturalEvents().rules}));
    assert.equal(initial.events,0);assert.equal(initial.rules.find(r=>r.id==='災害:山火事').chance,baseRates['災害:山火事']);
    await page.evaluate(async()=>{await window.advanceV39Turn({skipUnactedFocus:true});await window.waitForV39MapRenderSettled();});
    const report=await page.evaluate(()=>window.getV39GameState().worldEnvironment.disasterDiagnostics);
    assert.equal(report.turn,2);assert(report.attempts.some(r=>r.rolled!==undefined));
    assert(report.attempts.some(r=>r.status==='not-natural'));assert(report.attempts.some(r=>r.status==='condition'||r.status==='no-terrain'));
    assert(report.attempts.every(r=>r.baseChance===baseRates[r.id]));
    let plan;
    if(!process.env.V39_TEST_URL){
      plan=await page.evaluate(async()=>{
        const {inspectV39NaturalDisasterTrial:trial}=await import('/src/v39/world/v39-natural-events.js');
        const state=window.getV39GameState(),map=window.__v39FieldRuntime.mapData;
        let weather=state.worldEnvironment.weather;
        for(let turn=3;turn<=2000;turn++){
          const before=weather,result=trial({...state,worldEnvironment:{...state.worldEnvironment,weather}},map,turn);
          if(result.events.some(event=>result.attempts.find(row=>row.id===event.disasterId)?.condition))return {turn,weather:before,profileId:before.profileId,names:result.events.map(e=>e.name)};
          weather=result.weather;
        }
        return null;
      });
      assert(plan,'default probability must produce a natural event in the deterministic trial');
      writeFileSync(`${out}/plan-${width}.json`,JSON.stringify(plan));
    }else plan=JSON.parse(readFileSync(`${out}/plan-${width}.json`,'utf8'));
    const actual=await page.evaluate(async plan=>{
      const s=window.getV39GameState();
      if(s.worldEnvironment.weather.profileId!==plan.profileId)throw new Error('fixture climate changed');
      window.setV39GameState({timeline:{...s.timeline,turnNumber:plan.turn-1},worldEnvironment:{...s.worldEnvironment,
        weather:plan.weather,lastNaturalEventTurn:plan.turn-1,lastDisasterEvents:[],activeDisasters:[]}});
      const advanced=await window.advanceV39Turn({skipUnactedFocus:true});await window.waitForV39MapRenderSettled();
      const state=window.getV39GameState(),env=state.worldEnvironment;
      return {advanced,turn:state.timeline.turnNumber,events:env.lastDisasterEvents.filter(e=>e.disasterId),diagnostics:env.disasterDiagnostics,
        logs:window.getV39ActiveFactionState().activityLog.filter(row=>row.detail?.disasterPhase)};
    },plan);
    assert(actual.advanced);assert.equal(actual.turn,plan.turn);assert(actual.events.length>0);
    assert(actual.events.every(e=>e.forced===false));assert.deepEqual(actual.events.map(e=>e.name),plan.names);
    for(const event of actual.events)assert.equal(actual.logs.filter(row=>row.detail.id===event.id&&row.detail.disasterPhase==='started').length,1);
    assert(actual.diagnostics.attempts.some(r=>r.status==='spawned'&&r.rolled<r.chance));
    await page.locator('#v39-test-disaster-id').selectOption(actual.events[0].disasterId);
    assert((await page.locator('[data-disaster-trial-selected]').innerText()).includes('自然発生'));
    await page.locator('[data-natural-disaster-info]').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${out}/natural-${width}.png`});
    const saved=await page.evaluate(async()=>{
      const before=JSON.stringify(window.getV39GameState().worldEnvironment.disasterDiagnostics);
      window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
      return before===JSON.stringify(window.getV39GameState().worldEnvironment.disasterDiagnostics);
    });assert(saved);
    const beforeBulk=await page.evaluate(()=>window.getV39GameState().timeline.turnNumber);
    await page.locator('[data-test-action="disaster-natural-turns"]').click();
    await page.waitForFunction(turn=>window.getV39GameState().timeline.turnNumber===turn+10,beforeBulk);
    await page.waitForFunction(()=>!document.querySelector('[data-test-action="disaster-natural-turns"]').disabled);
    const endedLogs=await page.evaluate(()=>window.getV39ActiveFactionState().activityLog.filter(row=>row.detail?.disasterPhase==='ended'));
    for(const event of actual.events.filter(event=>event.expiresAtTurn<beforeBulk+10))assert.equal(endedLogs.filter(row=>row.detail.id===event.id).length,1);
    await page.locator('[data-test-action="disaster-fixed-start"]').click();
    await page.waitForFunction(()=>!window.__v39FieldRuntime.mapData.disasterNaturalTestFixture);
    assert.equal(await page.evaluate(()=>window.getV39GameState().worldEnvironment.activeDisasters.filter(e=>e.forced).length),fixture.events.length+1);
    assert.deepEqual(errors,[]);console.log(`${width}: no initial hazards, default probabilities, normal turn natural ${actual.events.map(e=>e.name)} at T${plan.turn}, diagnostics/save/fixed-mode passed`);
    await page.close();
  }
}finally{await browser.close();}
