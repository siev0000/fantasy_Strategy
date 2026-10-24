import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch(),errors=[],output='output/web-game/facility-summoning';
mkdirSync(output,{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.setV39RitualTestStage==='function');
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39CallTest();window.setV39RitualTestStage(1);
    const f=await import('/src/lib/v39-facility-summoning.js'),s=await import('/src/lib/v39-summon-rules.js');
    const e=await import('/src/lib/v39-economy-rules.js'),b=await import('/src/lib/settlement-state.js');
    const spawn=(state,playerId,slotId,name,map)=>f.summonV39FacilityUnit(state,playerId,slotId,name,map,f.inspectV39FacilitySummon(state,playerId,slotId,name,map).tiles[0]);
    const failures=[],ok=(test,message)=>{if(!test)failures.push(message);};
    let state=window.getV39GameState(),id=state.activePlayerId,map=window.__v39FieldRuntime.mapData;
    const player=s=>s.players.find(p=>p.id===id);
    let slots=f.getV39FacilitySummonSlots(state,id),fire=slots.find(slot=>slot.row.召喚系統==='火精霊');
    ok(slots.length===8,'eight distinct facility chains including generic');
    ok(fire.row.施設召喚再使用T===25,'cooldown not sourced from sheet');
    const name='フレイムエレメンタル',inspect=(s,name='フレイムエレメンタル')=>f.inspectV39FacilitySummon(s,id,fire.id,name,map);
    ok(inspect(state).preview?.level===11,'facility summon missing four-element I completion +1');
    const skill=s.inspectV39Summon(state,id,'expedition-test-king','TEST_表召喚エレメンタル / フレイムエレメンタル',map);
    ok(skill.preview?.level===11,'skill summon missing rank +1');
    const first=spawn(state,id,fire.id,name,map);
    ok(first.ok,`first summon: ${first.reason}`);
    if(!first.ok)return {failures};
    state=first.state;
    ok(first.unit.summon.expiresAtTurn===null&&first.unit.summon.kind==='facility','permanent summon metadata');
    ok(!inspect(state).available,'duplicate facility summon accepted');
    const funded=structuredClone(state),fundedOwner=player(funded),fundedBase=b.getFactionSettlementById(fundedOwner.factionState,fire.base.settlementId);
    fundedOwner.factionState=b.replaceFactionSettlement(fundedOwner.factionState,{...fundedBase,materialStockByType:{...fundedBase.materialStockByType,金:10000,宝石:10000}},{ownerPlayerId:id,select:false});
    ok(s.expireV39Summons(funded,state.timeline.turnNumber+100).removed.length===0,'funded facility summon expired with time');
    const other=f.getV39FacilitySummonSlots(state,id).find(slot=>slot.row.召喚系統==='アンデッド');
    ok(spawn(state,id,other.id,'ゾンビ',map).ok,'independent altar blocked');
    const owner=player(state),home=fire.base,base={...home,scaleKey:'metropolis',scaleLevel:4,cityLevels:{...home.cityLevels,魔法Lv:3},
      materialStockByType:Object.fromEntries(e.MATERIAL_RESOURCE_KEYS.map(key=>[key,10000]))};
    owner.factionState=b.replaceFactionSettlement(owner.factionState,base,{ownerPlayerId:id});
    const upgraded=e.startV39Construction(state,id,'火の儀式場II',{x:fire.x,y:fire.y},map);
    ok(upgraded.ok,`in-place upgrade: ${upgraded.reason}`);
    if(upgraded.ok){
      const queued=b.getSelectedSettlement(player(upgraded.state).factionState);
      ok(queued.constructionQueue[0].replacesFacilityName==='火の儀式場I','upgrade replacement not recorded');
      window.setV39GameState(upgraded.state,{reason:'facility-upgrade-test'});window.importV39SaveJson(window.exportV39SaveJson(0));
      state=window.getV39GameState();let built=b.getSelectedSettlement(player(state).factionState);
      ok(built.constructionQueue[0].replacesFacilityName==='火の儀式場I','save lost upgrade target');
      for(let i=0;i<upgraded.definition.buildTurns;i++)built=e.advanceConstruction(built).village;
      ok(built.buildings.includes('火の儀式場II')&&!built.buildings.includes('火の儀式場I'),'old tier not replaced');
      ok(!built.tileFacilityMap[fire.tileKey].includes('火の儀式場I'),'old tier remains on tile');
      player(state).factionState=b.replaceFactionSettlement(player(state).factionState,built,{ownerPlayerId:id});
      fire=f.getV39FacilitySummonSlots(state,id).find(slot=>slot.row.召喚系統==='火精霊');
      ok(fire.runtime.unitId===first.unit.id,'upgrade reset active slot');
      ok(fire.id===first.unit.summon.slotKey,'upgrade changed slot identity');
    }
    const t=state.timeline.turnNumber;
    player(state).factionState.units=player(state).factionState.units.map(u=>u.id===first.unit.id?{...u,hp:0,currentHp:0}:u);
    window.setV39GameState(state,{reason:'facility-death-test'});window.runV39DeathLifecycle(t);
    state=window.getV39GameState();
    const slot=player(state).factionState.facilitySummonsBySlot[fire.id];
    ok(!slot.unitId&&slot.readyAtTurn===t+25,'death did not start exact 25-turn cooldown');
    ok(!player(state).factionState.deadUnitReserve.some(u=>u.unit?.id===first.unit.id),'summon left recyclable corpse');
    window.importV39SaveJson(window.exportV39SaveJson(0));state=window.getV39GameState();
    ok(player(state).factionState.facilitySummonsBySlot[fire.id].readyAtTurn===t+25,'save lost cooldown');
    const nextUpgrade=e.startV39Construction(state,id,'火の儀式場III',{x:fire.x,y:fire.y},map);
    ok(nextUpgrade.ok,`cooldown upgrade rejected: ${nextUpgrade.reason}`);
    if(nextUpgrade.ok){
      state=nextUpgrade.state;let home=b.getSelectedSettlement(player(state).factionState);
      for(let i=0;i<nextUpgrade.definition.buildTurns;i++)home=e.advanceConstruction(home).village;
      player(state).factionState=b.replaceFactionSettlement(player(state).factionState,home,{ownerPlayerId:id});
      ok(player(state).factionState.facilitySummonsBySlot[fire.id].readyAtTurn===t+25,'upgrade reset cooldown');
      ok(f.getV39FacilitySummonSlots(state,id).filter(slot=>slot.chain===fire.chain).length===1,'tiers created extra slots');
    }
    window.setV39GameState(state,{reason:'facility-world-cooldown'});
    ok(window.viewV39ExpeditionTestWorld('cave:expedition-test:1'),'cave switch failed');
    ok(window.getV39GameState().players.find(p=>p.id===id).factionState.facilitySummonsBySlot[fire.id].readyAtTurn===t+25,'cave switch lost cooldown');
    window.viewV39ExpeditionTestWorld('surface');state=window.getV39GameState();
    ok(player(state).factionState.facilitySummonsBySlot[fire.id].readyAtTurn===t+25,'return to surface lost cooldown');
    const before=structuredClone(state);before.timeline.turnNumber=t+24;
    ok(!inspect(before).available&&inspect(before).slot.remainingTurns===1,'allowed before 25 turns');
    const again=s.expireV39Summons(before,t+24).state;
    ok(player(again).factionState.facilitySummonsBySlot[fire.id].readyAtTurn===t+25,'cooldown restarted on repeated lifecycle');
    const ready=structuredClone(state);ready.timeline.turnNumber=t+25;
    ok(inspect(ready).available,'still locked after 25 turns');
    const respawn=spawn(ready,id,fire.id,name,map);
    ok(respawn.ok&&respawn.unit.id!==first.unit.id,'respawn failed');
    const noFacility=structuredClone(ready);player(noFacility).factionState.settlements=[];
    ok(!spawn(noFacility,id,fire.id,name,map).ok,'summoned without owned facility');
    window.startV39CallTest();window.setV39RitualTestStage(1);
    return {failures,slotId:fire.id,deathTurn:t,readyTurn:t+25};
  });
  assert.deepEqual(report.failures,[]);
  for(const width of [390,1100]) {
    await page.setViewportSize({width,height:900});
    await page.evaluate(()=>{window.activateV39FooterTab('settlement');window.renderV39SettlementPanel();});
    const id=await page.evaluate(async()=>{const m=await import('/src/lib/v39-facility-summoning.js'),s=window.getV39GameState();return m.getV39FacilitySummonSlots(s,s.activePlayerId).find(slot=>slot.row.召喚系統==='火精霊').id;});
    await page.locator('#footSettlement [data-settlement-page-select="facility"]').click();
    await page.locator('#footSettlement [data-settlement-facility]').filter({hasText:'火の儀式場'}).click();
    await page.locator('#footSettlement [data-facility-summon-open]').click();
    await page.locator('[data-facility-slot]').selectOption(id);
    await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
    assert.equal(await page.locator('[data-summon-confirm]').isEnabled(),true);
    assert.match(await page.locator('.summon-detail').innerText(),/全員消滅後25T/);
    await page.screenshot({path:`${output}/ready-${width}.png`});
    await page.locator('[data-summon-confirm]').click();
    await page.evaluate(()=>{const [key]=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
    await page.locator('[data-facility-placement-confirm]').click();
    await page.evaluate(id=>window.openV39FacilitySummonModal(id),id);
    await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
    assert.equal(await page.locator('[data-summon-confirm]').isDisabled(),true);
    assert.match(await page.locator('.summon-detail footer').innerText(),/活動中/);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);
      p.factionState.units=p.factionState.units.map(u=>u.summon?.kind==='facility'?{...u,hp:0,currentHp:0}:u);
      window.setV39GameState(s,{reason:'facility-ui-death'});window.runV39DeathLifecycle();
    });
    await page.evaluate(id=>window.openV39FacilitySummonModal(id),id);
    await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
    assert.match(await page.locator('.summon-detail footer').innerText(),/残り25T/);
    await page.screenshot({path:`${output}/cooldown-${width}.png`});
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{window.startV39CallTest();window.setV39RitualTestStage(1);});
  }
  assert.deepEqual(errors,[]);console.log('Facility summoning OK',report);
} finally {await browser.close();}
