import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const count=Number(process.env.V39_BATCH_COUNT||1),formation=process.env.V39_BATCH_FORMATION||'split';
const browser=await chromium.launch(),out=`output/web-game/summon-material-gameplay-${count}-${formation}`;mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
 await page.evaluate(async count=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39RitualTest(count>1?2:1);},count);
 assert.match(await page.locator('#v39-summon-modal .summon-detail').innerText(),/宝石1（所持10）/);
 await page.locator('[data-summon-count]').selectOption(String(count));
 if(count>1)await page.locator('[data-summon-formation]').selectOption(formation);
 await page.screenshot({path:`${out}/before.png`});
 await page.locator('[data-summon-confirm]').click();
 await page.evaluate(({count,formation})=>{
  const keys=window.getV39FacilitySummonSelection().candidateTileKeys.slice(0,formation==='army'?1:count);
  for(const key of keys){const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));}
 },{count,formation});
 await page.locator('[data-facility-placement-confirm]').click();
 const before=await page.evaluate(()=>{
  const state=window.getV39GameState(),f=window.getV39ActiveFactionState(),unit=f.units.find(u=>u.summon?.kind==='facility');
  return {turn:state.timeline.turnNumber,id:unit.id,baseId:unit.settlementId,
   gems:f.settlements.find(b=>b.settlementId===unit.settlementId).materialStockByType.宝石,next:unit.summon.nextUpkeepTurn};
 });assert.equal(before.gems,10-count);assert.equal(before.next,before.turn+5);
 assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.filter(unit=>unit.summon?.kind==='facility').length),formation==='army'?1:count);
 for(let i=0;i<5;i++){
  assert.equal(await page.evaluate(()=>window.advanceV39Turn({skipUnactedFocus:true})),true);
 }
 const after=await page.evaluate(({id,baseId})=>{
  const state=window.getV39GameState(),f=window.getV39ActiveFactionState();
  return {turn:state.timeline.turnNumber,gems:f.settlements.find(b=>b.settlementId===baseId).materialStockByType.宝石,
   next:f.units.find(u=>u.id===id)?.summon.nextUpkeepTurn};
 },before);
 assert.equal(after.turn,before.turn+5);assert.equal(after.gems,10-count*2);assert.equal(after.next,before.turn+10);
 await page.screenshot({path:`${out}/after-five-turns.png`});assert.deepEqual(errors,[]);
 console.log(`production gameplay ${count}/${formation}: summon UI consumes gems 10 -> ${10-count}; five real turns consume maintenance -> ${10-count*2}; next deadline retained`);
}finally{await browser.close();}
