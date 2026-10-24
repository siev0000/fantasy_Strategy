import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),out='output/web-game/facility-summon-costs';mkdirSync(out,{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e.stack)));
 await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(1);
  const f=await import('/src/lib/v39-facility-summoning.js'),s=await import('/src/lib/v39-summon-rules.js');
  const c=await import('/src/lib/v39-facility-summon-costs.js'),b=await import('/src/lib/settlement-state.js');
  const m=await import('/src/lib/v39-summon-materials.js'),registry=await import('/src/lib/game-data-registry.js');
  const failures=[],ok=(test,message)=>{if(!test)failures.push(message);};
  let state=window.getV39GameState();const id=state.activePlayerId,map=window.__v39FieldRuntime.mapData;
  const owner=state=>state.players.find(p=>p.id===id),slot=f.getV39FacilitySummonSlots(state,id).find(row=>row.row.召喚系統==='火精霊');
  const baseId=slot.base.settlementId,gold=state=>b.getFactionSettlementById(owner(state).factionState,baseId).materialStockByType.金;
  function funded(state,amount){
   const player=owner(state),base=b.getFactionSettlementById(player.factionState,baseId);
   return {...state,players:state.players.map(p=>p.id!==id?p:{...p,factionState:b.replaceFactionSettlement(player.factionState,
    {...base,materialStockByType:{...base.materialStockByType,金:amount}},{ownerPlayerId:id,select:false})})};
  }
  state=funded(state,10000);const before=structuredClone(state),name='フレイムエレメンタル',t=state.timeline.turnNumber;
  const inspect=state=>f.inspectV39FacilitySummon(state,id,slot.id,name,map),check=inspect(state);
  const gems=state=>b.getFactionSettlementById(owner(state).factionState,baseId).materialStockByType.宝石;
  ok(check.initialMaterials.宝石===1&&check.upkeepMaterials.宝石===1&&gems(state)===10,'explicit test-only gem setup');
  ok(!registry.getGameDataRows('召喚モンスターリスト').find(row=>row.名称===name).必要資材,'shared catalog must not contain test costs');
  const normalBase={...slot.base};delete normalBase.summonMaterialTestCosts;
  ok(Object.keys(m.resolveV39SummonMaterials(check.entry.catalog,normalBase).initialMaterials).length===0,'blank normal catalog has no extra costs');
  ok(check.preview.level===11&&check.goldCost===22&&check.upkeepIntervalTurns===5,'bonus-inclusive level cost / config');
  ok(c.resolveV39FacilitySummonCosts({level:10},{goldPerLevel:3,upkeepIntervalTurns:7}).goldCost===30,'coefficient configurable');
  ok(!inspect(funded(state,21)).available&&inspect(funded(state,21)).eligible,'insufficient money gray, not hidden');
  const bad=f.summonV39FacilityUnit(state,id,slot.id,name,map,{x:-1,y:-1});
  ok(!bad.ok&&gold(bad.state)===10000,'invalid destination charges no gold');
  const first=f.summonV39FacilityUnit(state,id,slot.id,name,map,check.tiles[0]);
  ok(first.ok,`summon ${first.reason}`);if(!first.ok)return {failures};state=first.state;
  ok(gold(state)===9978&&gold(before)===10000,'exact initial debit and immutable input');
  ok(gems(state)===9&&gems(before)===10,'one initial gem consumed');
  ok(first.unit.summon.nextUpkeepTurn===t+5,'first deadline is five turns after summon');
  ok(gold(s.expireV39Summons(state,t+4).state)===9978,'no early charge');
  state=s.expireV39Summons(state,t+5).state;ok(gold(state)===9956,'same cost at exact deadline');
  ok(gems(state)===8&&gems(s.expireV39Summons(state,t+5).state)===8,'maintenance gem once at five turns');
  ok(gold(s.expireV39Summons(state,t+5).state)===9956,'same-turn lifecycle idempotent');
  state=s.expireV39Summons(state,t+15).state;ok(gold(state)===9912,'skipped deadlines charged once each');
  window.setV39GameState({...state,timeline:{...state.timeline,turnNumber:t+15}});
  window.importV39SaveJson(window.exportV39SaveJson(0));state=window.getV39GameState();
  ok(owner(state).factionState.units.find(u=>u.id===first.unit.id).summon.nextUpkeepTurn===t+20,'save/load preserves deadline');
  window.runV39DeathLifecycle(t+20);state=window.getV39GameState();ok(gold(state)===9890,'real lifecycle persists debit');
  window.runV39DeathLifecycle(t+20);ok(gold(window.getV39GameState())===9890,'real lifecycle repeated without duplicate debit');
  const inactive={...state,activeWorldId:'cave:test'};
  ok(gold(s.expireV39Summons(inactive,t+25).state)===9890,'another world does not charge surface summon twice');
  const poor=funded(state,0),failed=s.expireV39Summons(poor,t+25);
  ok(failed.removed.some(u=>u.id===first.unit.id)&&gold(failed.state)===0,'unpaid summon dissipates without negative gold');
  ok(owner(failed.state).factionState.facilitySummonsBySlot[slot.id].readyAtTurn===t+50,'unpaid loss respects cooldown');
  ok(!owner(failed.state).factionState.squads.some(q=>q.unitIds.includes(first.unit.id)),'unpaid summon removed from squad');
  const legacy=structuredClone(state);delete owner(legacy).factionState.units.find(u=>u.id===first.unit.id).summon.nextUpkeepTurn;
  const migrated=s.expireV39Summons(legacy,t+100);
  ok(gold(migrated.state)===9890&&owner(migrated.state).factionState.units.find(u=>u.id===first.unit.id).summon.nextUpkeepTurn===t+105,'old save receives fresh interval without retroactive billing');
  const dead=structuredClone(state);owner(dead).factionState.units.find(u=>u.id===first.unit.id).hp=0;
  ok(gold(s.expireV39Summons(dead,t+25).state)===9890,'dead summon does not incur maintenance');
  const noGems=structuredClone(before);b.getFactionSettlementById(owner(noGems).factionState,baseId).materialStockByType.宝石=0;
  const blocked=f.summonV39FacilityUnit(noGems,id,slot.id,name,map,check.tiles[0]);
  ok(!blocked.ok&&gold(blocked.state)===10000&&inspect(noGems).eligible,'gem shortage blocks summon atomically and keeps candidate visible');
  const upkeepShort=structuredClone(state);b.getFactionSettlementById(owner(upkeepShort).factionState,baseId).materialStockByType.宝石=0;
  const dissolved=s.expireV39Summons(upkeepShort,t+25);
  ok(dissolved.removed.some(u=>u.id===first.unit.id)&&gold(dissolved.state)===gold(state),'material upkeep shortage must not partially debit gold');
  const special=structuredClone(before),specialBase=b.getFactionSettlementById(owner(special).factionState,baseId);
  specialBase.summonMaterialTestCosts[name]={必要資材:'宝石1 / 魂2',維持素材:'魂1'};
  specialBase.foodStockByType.魂=5;
  const specialSpawn=f.summonV39FacilityUnit(special,id,slot.id,name,map,check.tiles[0]);
  ok(specialSpawn.ok&&b.getFactionSettlementById(owner(specialSpawn.state).factionState,baseId).foodStockByType.魂===3,'special-resource stock is consumed from correct bag');
  const specialPaid=s.expireV39Summons(specialSpawn.state,t+5);
  ok(b.getFactionSettlementById(owner(specialPaid.state).factionState,baseId).foodStockByType.魂===2,'special-resource maintenance');
  ok(m.parseV39SummonMaterials('不明な素材1').errors.length===1&&m.parseV39SummonMaterials('宝石-1').errors.length===1,'invalid costs are not silently free');
  const caster=owner(before).factionState.units.find(u=>u.id==='expedition-test-king');
  const entry=s.getV39SummonEntries(caster).find(e=>e.spec.target===name),skillCheck=s.inspectV39Summon(before,id,caster.id,entry.row.名前,map);
  const skill=s.summonV39Units(before,id,caster.id,entry.row.名前,map);
  ok(skill.ok,`skill summon materials: ${skill.reason}`);
  if(skill.ok){
   ok(gems(skill.state)===10-entry.spec.count&&gold(skill.state)===gold(before),'skill summon pays materials per unit, no facility gold fee');
   const sustained=structuredClone(skill.state);
   for(const unit of owner(sustained).factionState.units.filter(u=>skill.created.some(row=>row.id===u.id)))unit.summon.expiresAtTurn=t+10;
   ok(gems(s.expireV39Summons(sustained,t+5).state)===10-entry.spec.count*2,'skill upkeep consumes only materials');
  }
  const skillBlocked=s.summonV39Units(noGems,id,caster.id,entry.row.名前,map);
  ok(!skillBlocked.ok&&owner(skillBlocked.state).factionState.units.find(u=>u.id===caster.id).ap===caster.ap,'material rejection does not consume skill AP');
  window.startV39ExpeditionTest();
  ok(!window.getV39ActiveFactionState().settlements.some(base=>base.summonMaterialTestCosts),'another test must not inherit summon cost overrides');
  window.startV39CallTest();window.setV39RitualTestStage(1);
  return {failures,slotId:slot.id};
 });
 assert.deepEqual(report.failures,[]);
 await page.evaluate(id=>window.openV39FacilitySummonModal(id),report.slotId);
 for(const width of [390,1100]){
  await page.setViewportSize({width,height:900});
  assert.match(await page.locator('#v39-summon-modal .summon-detail').innerText(),/召喚 \d+金.*所持/);
  assert.match(await page.locator('#v39-summon-modal .summon-detail').innerText(),/維持 \d+金・5Tごと/);
  assert.match(await page.locator('#v39-summon-modal .summon-detail').innerText(),/必要資材: 宝石1（所持10）/);
  assert.match(await page.locator('#v39-summon-modal .summon-detail').innerText(),/維持素材: 宝石1（所持10）/);
  await page.screenshot({path:`${out}/cost-${width}.png`});
 }
 assert.deepEqual(errors,[]);console.log('facility summon costs: initial/bonus level, exact 5T upkeep, repeated lifecycle, save/load, inactive world, insufficient funds, cooldown, legacy migration and UI passed');
}finally{await browser.close();}
