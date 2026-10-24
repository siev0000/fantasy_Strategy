import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),errors=[];
async function place(page){
 await page.locator('[data-summon-confirm]').click();
 await page.evaluate(()=>{const [key]=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
 await page.locator('[data-facility-placement-confirm]').click();
}
try {
 const page=await browser.newPage({viewport:{width:390,height:900}});
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.waitForFunction(()=>typeof window.startV39CallTest==='function');
 assert.match(await page.locator('#uiBuildLabel').textContent(),/2026.10.23-74/);
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(1);window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
 await page.locator('#footSettlement [data-settlement-page-select="production"]').click();
 const fold=page.locator('#footSettlement [data-settlement-fold="facility"]');
 if(!await fold.evaluate(el=>el.open))await fold.locator('summary').click();
 await page.locator('#footSettlement [data-facility-summon-open]').click();
 const id=await page.locator('[data-facility-slot] option').evaluateAll(options=>options.find(o=>o.textContent.includes('火の儀式場I')).value);
 await page.locator('[data-facility-slot]').selectOption(id);
 await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
 assert.equal(await page.locator('[data-summon-confirm]').isEnabled(),true);
 await page.screenshot({path:'output/web-game/facility-summoning/built-ready-390.png'});
 await place(page);
 const first=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),u=p.factionState.units.find(u=>u.summon?.kind==='facility');return {id:u.id,level:u.level,expires:u.summon.expiresAtTurn};});
 assert.equal(first.level,11);assert.equal(first.expires,null);
 await page.evaluate(id=>window.openV39FacilitySummonModal(id),id);
 await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
 assert.equal(await page.locator('[data-summon-confirm]').isDisabled(),true);
 await page.keyboard.press('Escape');
 const turn=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.units=p.factionState.units.map(u=>u.summon?.kind==='facility'?{...u,hp:0,currentHp:0}:u);window.setV39GameState(s,{reason:'built-facility-death'});window.runV39DeathLifecycle();window.importV39SaveJson(window.exportV39SaveJson(0));return s.timeline.turnNumber;});
 await page.evaluate(id=>window.openV39FacilitySummonModal(id),id);
 await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
 assert.match(await page.locator('.summon-detail footer').innerText(),/残り25T/);
 await page.screenshot({path:'output/web-game/facility-summoning/built-cooldown-390.png'});
 await page.keyboard.press('Escape');
 for(const delta of [24,25]) {
  await page.evaluate(({turn,delta,id})=>{const s=window.getV39GameState();s.timeline.turnNumber=turn+delta;window.setV39GameState(s,{reason:'built-cooldown-boundary'});window.openV39FacilitySummonModal(id);},{turn,delta,id});
  await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
  assert.equal(await page.locator('[data-summon-confirm]').isEnabled(),delta===25);
  if(delta===25)await place(page);else await page.keyboard.press('Escape');
 }
 const second=await page.evaluate(()=>{const s=window.getV39GameState();return s.players.find(p=>p.id===s.activePlayerId).factionState.units.find(u=>u.summon?.kind==='facility').id;});
 assert.notEqual(second,first.id);
 await page.evaluate(id=>{window.startV39CallTest();window.setV39RitualTestStage(2);window.openV39FacilitySummonModal(id);},id);
 await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
 assert.match(await page.locator('.summon-detail').innerText(),/Lv13/);
 await page.screenshot({path:'output/web-game/facility-summoning/built-completion-II-390.png'});
 assert.deepEqual(errors,[]);
 console.log('Built UI74: facility summon, duplicate guard, death, save/load and exact 25T boundary passed');
} finally {await browser.close();}
