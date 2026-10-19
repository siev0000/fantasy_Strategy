import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/test-turn-button';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      window.startV39DisasterTest();await window.waitForV39MapRenderSettled();
      window.activateV39FooterTab('squad');
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.locator('#v39-turn-toggle').click();
    await page.locator('#v39-turn-test-next').waitFor({state:'visible'});
    const bounds=await page.locator('#v39-turn-menu').boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=width);
    await page.screenshot({path:`${out}/menu-${width}.png`});
    await page.locator('#v39-turn-next').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().timeline.turnNumber),1);
    await page.locator('#v39-turn-toggle').click();
    await page.locator('#v39-turn-test-next').click();
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===2&&!window.isV39MapInputLocked());
    await page.waitForFunction(()=>!document.querySelector('#v39-turn-test-next').disabled);
    const after=await page.evaluate(()=>({timeline:window.getV39GameState().timeline,units:window.getV39ActiveFactionState().units}));
    assert(after.timeline.lastStageSequence.includes('recovery'));
    assert(after.units.filter(u=>u.hp>0).every(u=>u.ap===u.maxAp));
    await page.evaluate(()=>window.setV39TestMode(false));
    await page.locator('#v39-turn-toggle').click();
    assert.equal(await page.locator('#v39-turn-test-next').isVisible(),false);
    await page.evaluate(()=>window.setV39TestMode(true));
    await page.locator('#v39-turn-test-next').waitFor({state:'visible'});
    // One press must finish all local player turns, not just switch player.
    await page.evaluate(()=>{
      const s=window.getV39GameState(),p=s.players[0];
      const other={...p,id:'test-turn-player-2',isPlayer:true,factionState:{...p.factionState,units:[],squads:[]}};
      window.setV39GameState({players:[p,other],timeline:{...s.timeline,playerTurnOrder:[p.id,other.id],activeTurnPlayerId:p.id,endedPlayerIds:[]}});
      const button=document.querySelector('#v39-turn-test-next');
      button.click();button.click();
    });
    await page.waitForFunction(()=>window.getV39GameState().timeline.turnNumber===3&&!document.querySelector('#v39-turn-test-next').disabled);
    assert.equal(await page.evaluate(()=>window.getV39GameState().timeline.turnNumber),3);
    assert.deepEqual(errors,[]);
    console.log(`${width}: normal unacted check, test 1T, recovery, toggle, multiplayer and double-click passed`);
    await page.close();
  }
} finally {await browser.close();}
