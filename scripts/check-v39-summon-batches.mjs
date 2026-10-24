import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),out='output/web-game/summon-batches';mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(2);
  const f=await import('/src/lib/v39-facility-summoning.js'),s=await import('/src/lib/v39-summon-rules.js');
  const b=await import('/src/lib/settlement-state.js'),batch=await import('/src/lib/v39-summon-batches.js');
  const ritual=await import('/src/lib/v39-ritual-facilities.js');
  const failures=[],ok=(v,m)=>{if(!v)failures.push(m);};
  const limits=batch.getV39SummonBatchOptions(25,1).map(row=>row.maximumLevel);
  ok(JSON.stringify(limits)==='[25,18,15,12]','floor thresholds 100/75/60/50');
  for(const [max,thresholds] of [[10,[10,7,6,5]],[20,[20,15,12,10]],[25,[25,18,15,12]]])for(let n=1;n<=4;n++){
   ok(batch.getV39SummonBatchOptions(max,thresholds[n-1]).some(row=>row.count===n),`boundary accepted ${max}/${n}`);
   ok(!batch.getV39SummonBatchOptions(max,thresholds[n-1]+1).some(row=>row.count===n),`over boundary rejected ${max}/${n}`);
  }
  ok(batch.getV39SummonBatchOptions(20,10,{maximumBatchCount:2,batchLevelRatios:{1:1,2:.5}}).length===2,'maximum/count ratios configurable');
  const original=window.getV39GameState(),id=original.activePlayerId,player=state=>state.players.find(p=>p.id===id);
  const map=structuredClone(window.__v39FieldRuntime.mapData);map.grid=map.grid.map(row=>row.map(()=> '平地'));map.defenseStructures=[];map.caveEventNpc=null;
  let initial=structuredClone(original);initial.enemies=[];initial.neutralVillages=[];player(initial).factionState.units=[];
  const slot=f.getV39FacilitySummonSlots(initial,id).find(row=>row.row.召喚系統==='火精霊'),baseId=slot.base.settlementId;
  const base=state=>b.getFactionSettlementById(player(state).factionState,baseId);
  base(initial).materialStockByType.金=10000;base(initial).materialStockByType.宝石=100;
  const name='フレイムエレメンタル',t=initial.timeline.turnNumber,inspect=(state,options)=>f.inspectV39FacilitySummon(state,id,slot.id,name,map,options);
  const one=inspect(initial,{});ok(one.preview.level===13,'completion II bonus included per individual');
  let splitFour;
  for(const count of [1,2,3,4])for(const formation of ['split','army']){
   const options={count,formation},check=inspect(initial,options),unitCount=formation==='army'?1:count;
   ok(check.available,`${count}/${formation}: ${check.reasons.join('/')}`);
   ok(check.goldCost===26*count&&check.initialPayment.宝石===count,'initial gold and materials multiply by count');
   const result=f.summonV39FacilityUnit(initial,id,slot.id,name,map,check.tiles.slice(0,unitCount),options);
   ok(result.ok,`spawn ${count}/${formation}: ${result.reason}`);if(!result.ok)continue;
   ok(result.created.length===unitCount&&result.created.every(unit=>unit.level===13),'number of pieces, no level aggregation');
   ok(new Set(result.created.map(unit=>`${unit.x},${unit.y}`)).size===unitCount,'split pieces have distinct tiles');
   if(count>1&&formation==='army')ok(result.unit.combatProfile.memberCount===count&&result.unit.combatProfile.attackCount===count&&result.unit.maxHp>one.preview.maxHp,'existing army HP/attack profile');
   ok(base(result.state).materialStockByType.金===10000-26*count&&base(result.state).materialStockByType.宝石===100-count,'exact debit');
   const paid=s.expireV39Summons(result.state,t+5).state;
   ok(base(paid).materialStockByType.金===10000-52*count&&base(paid).materialStockByType.宝石===100-count*2,'equal upkeep split and army');
   ok(!inspect(result.state,{count:1}).available,'active group blocks changing kind/count and topping up');
   if(count===4&&formation==='split')splitFour=result;
  }
  for(const options of [{count:5},{count:0},{count:2.5},{count:2,formation:'invalid'}])ok(!inspect(initial,options).available,'invalid count or mode rejected');
  const splitCheck=inspect(initial,{count:4});
  for(const targets of [splitCheck.tiles.slice(0,3),Array(4).fill(splitCheck.tiles[0]),[...splitCheck.tiles.slice(0,3),{x:-1,y:-1}]]){
   const failed=f.summonV39FacilityUnit(initial,id,slot.id,name,map,targets,{count:4});
   ok(!failed.ok&&base(failed.state).materialStockByType.金===10000,'bad placement has no partial charge');
  }
  const poor=structuredClone(initial);base(poor).materialStockByType.宝石=3;
  ok(!inspect(poor,{count:4}).available&&inspect(poor,{count:3}).available,'count changes affordability');
  const dead=structuredClone(splitFour.state);player(dead).factionState.units[0].hp=0;
  let remaining=s.expireV39Summons(dead,t+1).state,runtime=player(remaining).factionState.facilitySummonsBySlot[slot.id];
  ok(runtime.unitIds.length===3&&runtime.unitId===splitFour.created[1].id&&!runtime.readyAtTurn,'partial death preserves group, no cooldown yet');
  ok(!inspect(remaining,{count:1}).available,'partial death does not permit refill');
  for(const unit of player(remaining).factionState.units)unit.hp=0;
  remaining=s.expireV39Summons(remaining,t+2).state;runtime=player(remaining).factionState.facilitySummonsBySlot[slot.id];
  ok(!runtime.unitIds.length&&!runtime.unitId&&runtime.readyAtTurn===t+27,'last loss starts 25T cooldown');
  const again=ritual.recordV39FacilitySummonLosses(player(remaining).factionState,splitFour.created,t+10);
  ok(again[slot.id].readyAtTurn===t+27,'repeated loss must not restart cooldown');
  const cross=structuredClone(splitFour.state);player(cross).factionState.units[0].hp=0;player(cross).factionState.units[1].worldId='cave:batch';
  ok(player(s.expireV39Summons(cross,t+1).state).factionState.facilitySummonsBySlot[slot.id].unitIds.length===3,'other-world members preserve group');
  window.setV39GameState(splitFour.state);window.importV39SaveJson(window.exportV39SaveJson(0));
  ok(player(window.getV39GameState()).factionState.facilitySummonsBySlot[slot.id].unitIds.length===4,'save/load preserves group identities');
  window.startV39CallTest();window.setV39RitualTestStage(1);
  const low=window.getV39GameState(),lowSlot=f.getV39FacilitySummonSlots(low,low.activePlayerId).find(row=>row.row.召喚系統==='アンデッド');
  const lowCheck=f.inspectV39FacilitySummon(low,low.activePlayerId,lowSlot.id,'ゾンビ',map,{count:4});
  ok(lowCheck.radius===1&&lowCheck.unitCount===4,'stage I split placement expands to radius one');
  await window.startV39RitualTest(2);return {failures};
 });assert.deepEqual(report.failures,[]);
 for(const [width,height] of [[320,600],[390,900],[1100,900]]){
  await page.setViewportSize({width,height});
  await page.evaluate(async()=>{window.startV39CallTest();await window.startV39RitualTest(2);});
  const count=page.locator('[data-summon-count]');assert.equal(await count.locator('option').count(),4);
  await count.selectOption('4');assert.match(await page.locator('.summon-detail').innerText(),/召喚 104金/);
  await page.locator('[data-summon-formation]').selectOption('army');
  assert.match(await page.locator('.summon-detail').innerText(),/軍隊4人 \/ 1ユニット/);
  await page.screenshot({path:`${out}/army-${width}.png`});
  await page.locator('[data-summon-formation]').selectOption('split');await page.locator('[data-summon-confirm]').click();
  await page.evaluate(()=>{for(const key of window.getV39FacilitySummonSelection().candidateTileKeys.slice(0,3)){const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));}});
  assert.equal(await page.locator('[data-facility-placement-confirm]').isDisabled(),true);
  await page.evaluate(()=>{const key=window.getV39FacilitySummonSelection().candidateTileKeys[3],[x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
  assert.equal(await page.locator('[data-facility-placement-confirm]').isEnabled(),true);
  await page.screenshot({path:`${out}/split-placement-${width}.png`});
  await page.locator('[data-facility-placement-back]').click();assert.equal(await count.inputValue(),'4');
  await count.selectOption('2');assert.match(await page.locator('.summon-detail').innerText(),/召喚 52金/);
  await page.locator('[data-summon-close]').click();
 }
 assert.deepEqual(errors,[]);console.log('summon batches: 75/60/50% boundaries, count1-4, army/split, bonus levels, atomic payments, upkeep, loss/cooldown, cross-world, save/load and responsive selection passed');
}finally{await browser.close();}
