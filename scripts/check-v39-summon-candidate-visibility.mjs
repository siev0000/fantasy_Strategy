import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),output='output/web-game/summon-candidate-visibility';mkdirSync(output,{recursive:true});
try {
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);});
  for(const stage of [1,2,3]){
   await page.evaluate(async stage=>{window.startV39CallTest();await window.startV39RitualTest(stage);},stage);
   assert.equal(await page.locator('[data-summon-option="フレイムエレメンタル"]').count(),1);
   assert.equal(await page.locator('[data-summon-option="アークフレイムソルジャー"]').count(),stage===3?1:0);
   assert.equal(await page.locator('[data-summon-option="グレーターフレイムエレメンタル"]').count(),0);
   await page.screenshot({path:`${output}/stage-${stage}-${width}.png`});
   await page.keyboard.press('Escape');
  }
  await page.evaluate(async()=>{window.startV39CallTest();await window.startV39RitualTest(1);});
  const count=await page.locator('[data-summon-option]').count();assert(count>0);
  const slotId=await page.locator('[data-facility-slot]').inputValue();
  await page.locator('[data-summon-confirm]').click();
  await page.evaluate(()=>{const [key]=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
  await page.locator('[data-facility-placement-confirm]').click();
  await page.evaluate(id=>window.openV39FacilitySummonModal(id),slotId);
  assert.equal(await page.locator('[data-summon-option]').count(),count);
  assert.equal(await page.locator('[data-summon-option].unavailable').count(),count);
  assert.equal(await page.locator('[data-summon-confirm]').isDisabled(),true);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.units=p.factionState.units.map(u=>u.summon?.kind==='facility'?{...u,hp:0,currentHp:0}:u);window.setV39GameState(s,{reason:'candidate-death'});window.runV39DeathLifecycle();});
  await page.evaluate(id=>window.openV39FacilitySummonModal(id),slotId);
  assert.equal(await page.locator('[data-summon-option].unavailable').count(),count);
  assert.match(await page.locator('.summon-detail footer').innerText(),/残り25T/);
  await page.screenshot({path:`${output}/cooldown-${width}.png`});
  await page.keyboard.press('Escape');
  await page.evaluate(async()=>{window.startV39CallTest();await window.startV39RitualTest(2);});
  const availableCount=await page.locator('[data-summon-option]').count();
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),b=p.factionState.settlements.find(b=>b.placed),[key]=Object.entries(b.tileFacilityMap).find(([,names])=>names.includes('火の儀式場II')),[x,y]=key.split(',').map(Number);s.enemies.push({id:'blocking-test',x,y,hp:100,worldId:'surface'});window.setV39GameState(s,{reason:'candidate-occupied'});});
  await page.waitForFunction(()=>document.querySelectorAll('[data-summon-option]:not(.unavailable)').length===0);
  assert.equal(await page.locator('[data-summon-option]').count(),availableCount);
  assert.match(await page.locator('.summon-detail footer').innerText(),/施設マスに敵/);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.startV39CallTest();window.setV39RitualTestStage(3);});
  await page.locator('[data-v39-summon-open="expedition-test-king"]').click();
  assert.equal(await page.locator('[data-summon-option="TEST_表召喚エレメンタル / アークフレイムソルジャー"]').count(),1);
  assert.equal(await page.locator('[data-summon-option="TEST_表召喚エレメンタル / グレーターフレイムエレメンタル"]').count(),0);
  assert.equal(await page.locator('[data-summon-option="TEST_表召喚天使 / プリンシパリティ"]').count(),0);
  const skillCount=await page.locator('[data-summon-option]').count();
  await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);p.factionState.units=p.factionState.units.map(u=>u.id==='expedition-test-king'?{...u,ap:0,currentAp:0}:u);window.setV39GameState(s,{reason:'candidate-ap-empty'});});
  await page.waitForFunction(()=>document.querySelectorAll('[data-summon-option]:not(.unavailable)').length===0);
  assert.equal(await page.locator('[data-summon-option]').count(),skillCount);
  assert.equal(await page.locator('[data-summon-confirm]').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log(`${width}px: unsupported hidden; active/cooldown/enemy/AP candidates retained gray`);await page.close();
 }
} finally {await browser.close();}
