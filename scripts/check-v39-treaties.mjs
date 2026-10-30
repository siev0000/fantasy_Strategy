import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const url=process.env.V39_TEST_URL || 'http://127.0.0.1:5173';
const out='output/web-game/treaties';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
 for(const width of [390,1100]) {
  const page=await browser.newPage({viewport:{width,height:780}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(url,{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
   const state=window.getV39GameState(),base=state.players[0],unit=base.factionState.units[0];
   const players=['p1','p2'].map((id,i)=>({...base,id,label:`Test ${i+1}`,isPlayer:true,race:'只人',factionState:{...base.factionState,units:[{...unit,id:`u${i+1}`,x:4+i,y:4,hp:100,ap:100,worldId:'surface'}],selectedUnitId:`u${i+1}`}}));
   window.setV39GameState({players,activePlayerId:'p1',diplomacyRelations:{},enemies:[],territoryOwnerByTile:{'4,4':'p2','5,4':'p2','6,4':'p2'},timeline:{...state.timeline,turnNumber:1}});
  });
  if(process.env.V39_UI_ONLY!=='1') {
   const result=await page.evaluate(async()=>{
    const r=await import('/src/lib/v39-diplomacy-rules.js'),o=await import('/src/lib/v39-movement-occupancy-rules.js'),m=await import('/src/lib/v39-terrain-traversal.js');
    const s=window.getV39GameState(),key=r.createV39FactionPairKey('p1','p2'),checks={};
    checks.noUnilateral=r.proposeV39Treaty(s,'p1','p2','passage',1,6).state.diplomacyRelations[key].treaties.passage===undefined;
    checks.invalid=!r.proposeV39Treaty(s,'p1','p2','passage',1,0).ok&&!r.proposeV39Treaty(s,'p1','p1','passage',1,6).ok;
    let pending=r.proposeV39Treaty(s,'p1','p2','passage',1,6).state;
    checks.wrongResponder=!r.respondV39Treaty(pending,'p1','p2',true,1).ok;
    checks.reject=!r.respondV39Treaty(pending,'p2','p1',false,1).state.diplomacyRelations[key].proposal;
    checks.timeout=!r.respondV39Treaty(pending,'p2','p1',true,4).ok;
    let signed=r.respondV39Treaty(pending,'p2','p1',true,1).state;
    checks.duration=signed.diplomacyRelations[key].treaties.passage.expiresAtTurn===7;
    checks.passBoth=r.canV39EnterFactionTerritory(signed,'p1','p2')&&r.canV39EnterFactionTerritory(signed,'p2','p1');
    checks.noOwnership=signed.territoryOwnerByTile===s.territoryOwnerByTile;
    const occupied=o.collectV39MovementOccupancy(signed,['u1']);
    checks.passUnit=!occupied.blocked.has('5,4')&&occupied.stopBlocked.has('5,4');
    checks.borderBefore=o.collectV39MovementOccupancy(s,['u1']).blocked.has('6,4');
    const map={w:10,h:10,grid:Array.from({length:10},()=>Array(10).fill('草原'))},actor=s.players[0].factionState.units[0];
    checks.aiMovement=!Number.isFinite(m.resolveV39UnitMovementStepCost(map,4,4,5,4,actor,s))&&Number.isFinite(m.resolveV39UnitMovementStepCost(map,4,4,5,4,actor,signed));
    const courier=structuredClone(s);courier.players[0].factionState.units[0].tradeAssignment={contractId:'trade-test'};
    courier.players[0].factionState.tradeContracts=[{id:'trade-test',status:'active',sides:[{partyId:'p1',memberIds:['u1']},{partyId:'p2',memberIds:[]}]}];
    checks.courier=r.canV39EnterFactionTerritory(courier,'p1','p2',{unitId:'u1',fromKey:'4,4'})&&!r.canV39EnterFactionTerritory(courier,'p1','p2',{unitId:'outsider',fromKey:'4,4'});
    let renewed=r.respondV39Treaty(r.proposeV39Treaty(signed,'p1','p2','passage',2,4).state,'p2','p1',true,2).state;
    checks.renewal=renewed.diplomacyRelations[key].treaties.passage.expiresAtTurn===11&&renewed.diplomacyRelations[key].relationValue===signed.diplomacyRelations[key].relationValue;
    const early=r.advanceV39DiplomacyTurn(renewed,9);
    checks.notice=early.reports.some(x=>x.type==='treaty-expiring')&&!r.advanceV39DiplomacyTurn(early,9).reports.some(x=>x.type==='treaty-expiring');
    const expired=r.advanceV39DiplomacyTurn(early,11);
    checks.expiry=expired.reports.some(x=>x.type==='treaty-expired')&&!r.hasV39ActiveTreaty(expired,'p1','p2','passage',11);
    checks.grace=r.canV39EnterFactionTerritory(expired,'p1','p2',{unitId:'u1',fromKey:'4,4',turnNumber:11})&&!r.canV39EnterFactionTerritory(expired,'p1','p2',{unitId:'outsider',fromKey:'4,4',turnNumber:11})&&!r.canV39EnterFactionTerritory(expired,'p1','p2',{unitId:'u1',fromKey:'3,4',turnNumber:11})&&!r.canV39EnterFactionTerritory(expired,'p1','p2',{unitId:'u1',fromKey:'4,4',turnNumber:14});
    const cancelled=r.cancelV39Treaty(signed,'p1','p2','passage',2).state;
    checks.cancel=cancelled.diplomacyRelations[key].relationValue===signed.diplomacyRelations[key].relationValue-10&&cancelled.diplomacyRelations[key].trustByPlayer.p1===-10;
    const peace=r.signV39Treaty(s,'p1','p2','nonAggression',1,10).state;
    const demons={...peace,players:peace.players.map((p,i)=>({...p,race:i?'デヴィル':'エンジェル'}))};
    checks.demonAttackBlocked=!r.canV39FactionAttack(demons,'p1','p2')&&!r.canV39FactionAttack(demons,'p2','p1');
    checks.warBlocked=r.declareV39War(peace,'p1','p2',1).diplomacyRelations[key].status!=='war';
    const npc={...pending,players:pending.players.map(p=>p.id==='p2'?{...p,isPlayer:false}:p)};
    checks.npcAccept=r.hasV39ActiveTreaty(r.advanceV39DiplomacyTurn(npc,2),'p1','p2','passage',2);
    const war=r.declareV39War(s,'p1','p2',1);
    checks.warReject=!r.proposeV39Treaty(war,'p1','p2','passage',1,10).ok;
    return checks;
   });
   for(const [check,ok] of Object.entries(result))assert.equal(ok,true,`${width}: ${check}`);
  }
  await page.locator('[data-foot="manage"]').click();
  await page.locator('#v39-manage-nation').click();
  await page.locator('[data-v39-nation-tab="diplomacy"]').click();
  await page.locator('[data-v39-treaty-duration="p2"]').fill('6');
  await page.locator('[data-v39-treaty-duration="p2"]').press('Tab');
  await page.locator('[data-v39-treaty-type="passage"][data-v39-treaty-action="sign"]').click();
  assert.match(await page.locator('.v39-treaty-proposal').textContent(),/回答待ち/);
  await page.evaluate(()=>window.setV39ActivePlayer('p2'));
  await page.locator('[data-v39-treaty-action="accept"]').click();
  assert.equal(await page.evaluate(()=>window.getV39GameState().diplomacyRelations['p1|p2'].treaties.passage.expiresAtTurn),7);
  await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson(0)));
  assert.equal(await page.evaluate(()=>window.getV39GameState().diplomacyRelations['p1|p2'].treaties.passage.expiresAtTurn),7);
  await page.screenshot({path:`${out}/active-${width}.png`});
  const movement=await page.evaluate(()=>{
   window.setV39ActivePlayer('p1');window.activateV39FooterTab('squad');
   window.updateV39ActiveFactionState({selectedUnitId:'u1',selectedSquadId:'solo',squads:[{id:'solo',unitIds:['u1']}]});
   window.startV39SelectedUnitMove();
   const plan=window.getV39UnitMovePreview();
   return {destination:plan?.reachable.some(t=>t.key==='6,4'),occupied:plan?.reachable.some(t=>t.key==='5,4')};
  });
  assert.equal(movement.destination,true,'passage permits actual movement plan');assert.equal(movement.occupied,false,'occupied tile is not a legal stop');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:6,y:4}})));
  await page.locator('#moveOk').click();await page.waitForFunction(()=>!window.isV39MapInputLocked());
  assert.deepEqual(await page.evaluate(()=>{const u=window.getV39ActiveFactionState().units.find(u=>u.id==='u1');return [u.x,u.y];}),[6,4]);
  await page.locator('[data-foot="manage"]').click();
  await page.locator('[data-v39-treaty-type="passage"][data-v39-treaty-action="cancel"]').click();
  assert.equal(await page.evaluate(()=>window.getV39GameState().diplomacyRelations['p1|p2'].treaties.passage.active),false);
  await page.evaluate(async()=>{window.setV39ActivePlayer('p1');const s=window.getV39GameState();s.players=s.players.map(p=>p.id==='p2'?{...p,isPlayer:false}:p);window.setV39GameState({players:s.players,diplomacyRelations:{}});});
  await page.locator('[data-v39-treaty-type="nonAggression"][data-v39-treaty-action="sign"]').click();
  await page.evaluate(async()=>{await window.advanceV39TestTurns(1);});
  assert.equal(await page.evaluate(()=>window.getV39GameState().diplomacyRelations['p1|p2'].treaties.nonAggression?.active),true);
  assert.deepEqual(errors,[]);console.log(`${width}: treaties, consent, NPC response, duration, borders, occupancy, renewal, expiry/grace, cancellation, save/load passed`);
  await page.close();
 }
} finally {await browser.close();}
