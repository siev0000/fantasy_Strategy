import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/waited-visual';
mkdirSync(out,{recursive:true});
const recoveryUrl=`data:text/javascript;base64,${Buffer.from(readFileSync('frontend/src/lib/v39-recovery-wait.js','utf8')).toString('base64')}`;
const rules=await import(`data:text/javascript;base64,${Buffer.from(readFileSync('frontend/src/lib/v39-unit-action-rules.js','utf8').replace('./v39-recovery-wait.js',recoveryUrl)).toString('base64')}`);
assert(rules.isV39UnitWaitDimmed({hp:10,waitTurnNumber:3},3));
for(const [unit,turn] of [
  [{hp:10,ap:0,lastActionTurn:3},3],
  [{hp:0,waitTurnNumber:3},3],
  [{hp:10,state:'死亡',waitTurnNumber:3},3],
  [{hp:10,waitTurnNumber:2},3],
  [{hp:10,waitTurnNumber:0},0]
]) assert.equal(rules.isV39UnitWaitDimmed(unit,turn),false);
const browser=await chromium.launch();
const results=[];
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();
      await window.setV39TestMode(true);
      await window.startV39ExpeditionTest();
      window.activateV39FooterTab('squad');
      await window.waitForV39MapRenderSettled();
    });
    const card=page.locator('#squadMemberList .squad-card.selected');
    await card.waitFor();
    const id=await card.getAttribute('data-v39-unit-id');
    assert.equal(await card.evaluate(el=>el.classList.contains('v39-unit-waited')),false);
    const before=await page.evaluate(()=>window.getV39ActiveFactionState().units.find(u=>u.id===window.getV39ActiveFactionState().selectedUnitId));
    assert((await page.evaluate(()=>window.waitV39SelectedUnit())).ok);
    await page.waitForFunction(id=>document.querySelector(`#squadMemberList [data-v39-unit-id="${id}"]`)?.classList.contains('v39-unit-waited'),id);
    await page.evaluate(()=>window.waitForV39MapRenderSettled());
    await page.waitForTimeout(600);
    const appearance=await card.evaluate(el=>({
      image:getComputedStyle(el.querySelector('.v39-card-portrait-image,.squad-icon')).filter,
      bars:getComputedStyle(el.querySelector('.squad-bars')).filter,
      opacity:getComputedStyle(el).opacity,disabled:el.disabled
    }));
    assert.equal(appearance.image,'brightness(0.72)');
    assert.equal(appearance.bars,'none');assert.equal(appearance.opacity,'1');assert(!appearance.disabled);
    const tints=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      return scene.children.list.flatMap(c=>c.list||[]).filter(m=>m.name==='v39-player-unit-marker')
        .flatMap(m=>m.list.filter(c=>c.type==='Image'||c.type==='Text').map(c=>c.tintTopLeft));
    });
    assert(tints.includes(0xb8b8b8),'waited field artwork must be tinted');
    await page.screenshot({path:`${out}/waited-${width}.png`});
    const other=page.locator(`#squadMemberList .squad-card:not([data-v39-unit-id="${id}"])`).first();
    await other.click();
    const waited=page.locator(`#squadMemberList [data-v39-unit-id="${id}"]`);
    assert(await waited.evaluate(el=>el.classList.contains('v39-unit-waited')&&!el.classList.contains('selected')));
    await page.evaluate(()=>window.openV39CharacterModal());
    const modalCard=page.locator(`#characterModal [data-v39-character-row="${id}"]`);
    await modalCard.waitFor();
    assert(await modalCard.evaluate(el=>el.classList.contains('v39-unit-waited')));
    await page.locator('#characterModal [data-close]').click();
    const after=await page.evaluate(id=>window.getV39ActiveFactionState().units.find(u=>u.id===id),id);
    assert.equal(after.hp,before.hp);assert.equal(after.ap,before.ap);
    // Isolated fixture: advance only the turn counter to verify visual expiry without AI movement.
    await page.evaluate(()=>window.updateV39TimelineState({turnNumber:window.getV39TimelineState().turnNumber+1}));
    await page.waitForFunction(()=>!document.querySelector('#squadMemberList .v39-unit-waited'));
    await page.evaluate(()=>window.waitForV39MapRenderSettled());
    await page.waitForTimeout(300);
    assert.equal(await waited.evaluate(el=>getComputedStyle(el.querySelector('.v39-card-portrait-image,.squad-icon')).filter),'none');
    const restored=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
      .flatMap(c=>c.list||[]).filter(m=>m.name==='v39-player-unit-marker')
      .flatMap(m=>m.list.filter(c=>c.type==='Image'||c.type==='Text').map(c=>c.tintTopLeft)));
    assert(!restored.includes(0xb8b8b8),'next turn must also restore field artwork without moving');
    assert.deepEqual(errors,[]);
    results.push({width,appearance,tints,errors});
    await page.close();
  }
  writeFileSync(`${out}/report.json`,JSON.stringify(results,null,2));
  console.log('PASS: wait tint, shared modal/compact cards, selection, unchanged HP/AP, next-turn expiry (390/1100)');
} finally {await browser.close();}
