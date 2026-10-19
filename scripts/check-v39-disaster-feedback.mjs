import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/disaster-feedback';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    const start=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      for(const n of [...scene.children.list])if(['v39-damage-popup','v39-damage-hp-bar'].includes(n.name))n.destroy();
      scene.cameras.main.setZoom(1);scene.v39RequestedZoom=1;scene.cameras.main.centerOn(4*64+32,4*48+32);
      window.activateV39FooterTab('squad');
      window.__hazardEvents=[];
      window.addEventListener('v39:natural-events-resolved',e=>{
        const state=window.getV39GameState();
        window.__hazardEvents.push({phase:state.timeline.phase,turn:e.detail.turnNumber,entries:e.detail.damageEntries,
          popupCount:window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.filter(n=>n.name==='v39-damage-popup').length});
      });
      return {id:window.getV39ActiveFactionState().units[0].id};
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.locator('#v39-turn-toggle').click();await page.locator('#v39-turn-test-next').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!document.querySelector('#v39-turn-test-next').disabled);
    const result=await page.evaluate(id=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const event=window.__hazardEvents.find(e=>e.turn===2&&e.entries.some(row=>row.unitId===id));
      return {event,popups:scene.children.list.filter(n=>n.name==='v39-damage-popup').map(n=>({id:n.getData('targetId'),damage:n.getData('damage'),text:n.text})),
        bars:scene.children.list.filter(n=>n.name==='v39-damage-hp-bar').map(n=>({id:n.getData('targetId'),before:n.getData('beforeHp'),after:n.getData('afterHp')}))};
    },start.id);
    assert.equal(result.event.phase,'resolution');assert.equal(result.event.popupCount,0);
    const hit=result.event.entries.find(row=>row.unitId===start.id),popup=result.popups.find(row=>row.id===start.id),bar=result.bars.find(row=>row.id===start.id);
    assert(hit.damage>0);assert.equal(popup.damage,hit.damage);assert.equal(popup.text,String(hit.damage));assert.equal(bar.before,hit.beforeHp);assert.equal(bar.after,hit.afterHp);
    await page.waitForTimeout(100);await page.screenshot({path:`${out}/turn-end-${width}.png`});
    const hidden=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],count=()=>scene.children.list.filter(n=>n.name==='v39-damage-popup').length;
      const before=count(),entry={unitId:'hidden-probe',damage:20,hits:[20],x:4,y:4,visibleAtDamage:false};
      window.dispatchEvent(new CustomEvent('v39:natural-events-resolved',{detail:{worldId:'surface',damageEntries:[entry]}}));
      window.dispatchEvent(new CustomEvent('v39:natural-events-resolved',{detail:{worldId:'cave:other',damageEntries:[{...entry,visibleAtDamage:true}]}}));
      return before===count();
    });assert(hidden);
    await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      for(const n of [...scene.children.list])if(['v39-damage-popup','v39-damage-hp-bar'].includes(n.name))n.destroy();
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:f.units.map((u,i)=>i?u:{...u,hp:1,currentHp:1})});
      window.setV39GameState({worldEnvironment:{...s.worldEnvironment,activeDisasters:s.worldEnvironment.activeDisasters.map(e=>e.name==='山火事'?{...e,expiresAtTurn:3}:e)}});
    });
    await page.locator('#v39-turn-toggle').click();await page.locator('#v39-turn-test-next').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===3&&!document.querySelector('#v39-turn-test-next').disabled);
    const death=await page.evaluate(id=>{
      const event=window.__hazardEvents.find(e=>e.turn===3&&e.entries.some(r=>r.unitId===id));
      const popup=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-damage-popup'&&n.getData('targetId')===id);
      return {entry:event.entries.find(r=>r.unitId===id),popup:popup?.text,again:window.flushV39HazardFeedback()};
    },start.id);
    assert.equal(death.entry.afterHp,0);assert.equal(death.popup,'1');assert.equal(death.again,0);assert.deepEqual(errors,[]);
    console.log(`${width}: turn-end damage, post-batch attack-style number/HP bar, hidden/world filtering, lethal popup and one-shot flush passed`);
    await page.close();
  }
}finally{await browser.close();}
