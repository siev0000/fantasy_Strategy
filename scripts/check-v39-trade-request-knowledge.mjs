import {openV39TestSuite} from './lib/v39-test-suite.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/trade-request-knowledge';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{for(const width of [320,390,1100]){
  const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.locator('[data-v39-test-tools]').click();await openV39TestSuite(page,'logistics');await page.locator('[data-test-action=trade-test-start]').click();
  await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  const knowledge=await page.evaluate(()=>{
    const s=window.getV39GameState(),own=s.players.find(p=>p.id===s.activePlayerId),peer=s.players.find(p=>p.id!==s.activePlayerId),f=own.factionState;
    f.knownTradeResourceNames=[];f.exploration.discoveredSpecialtiesByTile={};f.tradeContracts=[];
    for(const bank of f.settlements){bank.foodStockByType={};bank.materialStockByType={金:10000};}
    f.squads.forEach(squad=>{squad.cargo={};squad.cargoByUnitId={};});f.units.forEach(unit=>{unit.cargo={};});
    const bank=peer.factionState.settlements[0];bank.foodStockByType={穀物:99999};bank.materialStockByType={黒木:99999,銀:99999};
    window.setV39GameState({players:s.players},{reason:'request-knowledge-fixture'});
    return [...window.getV39TradeRules().getV39KnownTradeResources(window.getV39GameState())];
  });
  assert(knowledge.includes('穀物'));assert(!knowledge.includes('銀'));assert(!knowledge.includes('黒木'));
  await page.locator('[data-trade-add-side="1"]').click();
  const item=name=>page.locator(`[data-trade-resource-add="${name}"]`);
  assert.equal(await item('銀').count(),0);assert.equal(await item('黒木').count(),0);
  await item('穀物').click();assert.equal(await item('穀物').locator('b').innerText(),'1');
  assert(!/保有|収入/.test(await item('穀物').getAttribute('title')));
  assert.equal(await page.locator('.v39-trade-picker-caption>span').last().innerText(),'要求数量');
  const before=await page.locator('.v39-trade-resource-grid').innerHTML(),max=await page.locator('.v39-trade-picker-editor input[type=range]').getAttribute('max');
  await page.evaluate(()=>{const s=window.getV39GameState();for(const p of s.players.filter(p=>p.id!==s.activePlayerId))for(const b of p.factionState.settlements){b.foodStockByType={};b.materialStockByType={};}window.setV39GameState({players:s.players},{reason:'request-hidden-peer-stock'});});
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.v39-trade-resource-grid').innerHTML(),before,'partner stock must not affect candidates or labels');
  assert.equal(await page.locator('.v39-trade-picker-editor input[type=range]').getAttribute('max'),max);
  await page.evaluate(()=>{const button=document.createElement('button');button.dataset.tradeResourceAdd='黒木';button.dataset.tradeItemSide='1';document.querySelector('.v39-trade-resource-grid').append(button);button.dispatchEvent(new MouseEvent('click',{bubbles:true}));});
  assert.equal(await page.locator('[data-trade-basket="1"] [data-trade-item="黒木"]').count(),0,'unknown-resource synthetic click rejected');
  await page.evaluate(()=>{const s=window.getV39GameState(),f=s.players.find(p=>p.id===s.activePlayerId).factionState;f.settlements[0].materialStockByType.銀=2;window.setV39GameState({players:s.players},{reason:'request-resource-learned'});});
  await page.waitForFunction(()=>!!document.querySelector('[data-trade-resource-add="銀"]'));
  await item('銀').click();assert.equal(await item('銀').locator('b').innerText(),'1');
  await page.evaluate(()=>{const s=window.getV39GameState(),f=s.players.find(p=>p.id===s.activePlayerId).factionState;f.settlements[0].materialStockByType.銀=0;window.setV39GameState({players:JSON.parse(JSON.stringify(s.players))},{reason:'request-resource-consumed-roundtrip'});});
  assert(await item('銀').isEnabled(),'knowledge survives consumption and state serialization');
  const histories=await page.evaluate(()=>{
    const s=window.getV39GameState(),rules=window.getV39TradeRules(),own=s.players.find(p=>p.id===s.activePlayerId),peer=s.players.find(p=>p.id!==s.activePlayerId);
    const history=[{goods:[{黒木:1},{銀鉄:1}]}];
    peer.factionState.tradeContracts=[{sides:[{kind:'player',partyId:peer.id},{kind:'village',partyId:'unrelated'}],history}];
    const unrelated=rules.getV39KnownTradeResources(s).has('黒木');
    peer.factionState.tradeContracts[0].sides[1]={kind:'player',partyId:own.id};
    const participating=rules.getV39KnownTradeResources(s).has('黒木');
    peer.factionState.tradeContracts[0].history=[];peer.factionState.tradeContracts[0].sides[1].goods={黒木:1};
    const pending=rules.getV39KnownTradeResources(s).has('黒木');
    return {unrelated,participating,pending};
  });
  assert.deepEqual(histories,{unrelated:false,participating:true,pending:false});
  const proposal=await page.evaluate(()=>{
    const s=window.getV39GameState(),rules=window.getV39TradeRules(),own=s.players.find(p=>p.id===s.activePlayerId),peer=s.players.find(p=>p.id!==s.activePlayerId);
    own.factionState.units.forEach(u=>{delete u.tradeAssignment;delete u.transportAssignment;delete u.caveDuty;u.movementHold=false;});
    const sides=[own,peer].map(p=>({kind:'player',partyId:p.id,settlementId:p.factionState.settlements[0].settlementId,unitId:p.factionState.units[0].id,center:{x:7,y:5},radius:1,goods:p===own?{金:3}:{銀:1}}));
    const request={sides,deliveryMode:'proposer',dueTurn:s.timeline.turnNumber+5,grace:3,period:0,cycles:1,specialtyTurns:10};
    const empty=rules.proposeV39Trade(s,own.id,request);
    peer.factionState.settlements[0].materialStockByType.銀=99999;
    const full=rules.proposeV39Trade(s,own.id,request);
    return {empty:{ok:empty.ok,reason:empty.reason},full:{ok:full.ok,reason:full.reason}};
  });
  assert(proposal.empty.ok,JSON.stringify(proposal));assert.deepEqual(proposal.empty,proposal.full,'proposal eligibility must not reveal peer stock');
  await page.screenshot({path:`${out}/request-${width}.png`});
  await page.locator('[data-trade-picker-close]').last().click();
  assert.equal(await page.locator('[data-trade-basket="1"] [data-trade-warning]:visible').count(),0);
  assert.deepEqual(errors,[]);console.log(`${width}: own knowledge, hidden stock independence, quantity-only demand, persistence and history scope passed`);await page.close();
}}finally{await browser.close();}
