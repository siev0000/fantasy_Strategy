import {openV39TestSuite} from './lib/v39-test-suite.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/trade-courier';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(String(error.stack)));page.on('dialog',dialog=>dialog.accept());
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.locator('[data-v39-test-tools]').click();await openV39TestSuite(page,'logistics');await page.locator('[data-test-action=trade-test-start]').click();
  await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
  assert.equal(await page.locator('[data-trade-field=deliveryMode]').inputValue(),'proposer');
  assert.equal(await page.locator('[data-side-field=unitId]').count(),1);
  assert.equal(await page.locator('[data-trade-pick]').count(),0);
  await page.screenshot({path:`${out}/default.png`});
  await page.locator('[data-trade-field=deliveryMode]').selectOption('partner');
  assert.equal(await page.locator('[data-side-field=unitId][data-trade-side="1"]').count(),1);
  await page.locator('[data-trade-field=deliveryMode]').selectOption('meeting');
  await page.locator('[data-trade-fold=delivery]>summary').click();
  assert.equal(await page.locator('[data-side-field=unitId]').count(),2);assert.equal(await page.locator('[data-trade-pick]').count(),1);
  assert.equal(await page.locator('[data-side-field=x][data-trade-side="1"]').count(),0);
  await page.screenshot({path:`${out}/meeting.png`});
  const results=await page.evaluate(()=>{
    const rules=window.getV39TradeRules(),map=window.__v39FieldRuntime.mapData,fixture=window.getV39GameState(),results=[];
    const check=(value,message)=>{if(!value)throw Error(message);};
    const bank=(s,side)=>side.kind==='player'?s.players.find(p=>p.id===side.partyId).factionState.settlements.find(b=>b.settlementId===side.settlementId):s.neutralVillages.find(v=>v.id===side.partyId);
    const tick=(s,t)=>{
      s={...s,timeline:{...s.timeline,turnNumber:t,phase:'player'},players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}})),neutralVillages:s.neutralVillages.map(v=>({...v,defenseUnits:v.defenseUnits.map(u=>({...u,ap:100,currentAp:100}))}))};
      for(const p of s.players)s=rules.advanceV39TradeLogistics(s,p.id,map,t).state;
      return rules.advanceV39TradeLogistics(s,'',map,t,true).state;
    };
    for(const npc of [false,true])for(const deliveryMode of ['proposer','partner'])for(const scenario of ['exchange','cancel','cancel-loaded','death','repeat','mail','relocated-after-exchange','specialty']){
      let s=structuredClone(fixture),own=s.players[0],peer=npc?s.neutralVillages[0]:s.players[1],courier=deliveryMode==='proposer'?0:1,receiver=1-courier;
      const sides=[{kind:'player',partyId:own.id,settlementId:own.factionState.settlements[0].settlementId,unitId:own.factionState.units[0].id,goods:{穀物:6}},
        {kind:npc?'village':'player',partyId:peer.id,settlementId:npc?peer.id:peer.factionState.settlements[0].settlementId,unitId:npc?peer.defenseUnits[0].id:peer.factionState.units[0].id,goods:{木材:9}}];
      sides.forEach(side=>{side.center={x:7,y:5};side.radius=1;});
      if(scenario==='mail')sides[1].goods={};
      const specialty=rules.getV39SpecialtyAccess(s,own.id)[0]?.name;
      if(scenario==='specialty'){check(specialty,'fixture specialty');sides[0].goods[specialty]=1;}
      const specialtyBefore=sides.map(side=>rules.getV39SpecialtyAccess(s,side.partyId).find(row=>row.name===specialty)?.count||0);
      // The receiving player does not need any unit; NPC negotiation still needs an envoy from the proposer.
      if(!npc){const passive=s.players.find(p=>p.id===sides[receiver].partyId);passive.factionState.units=[];passive.factionState.squads=[];}
      if(npc&&receiver===1)s.neutralVillages.find(v=>v.id===peer.id).defenseUnits=[];
      const baseline=sides.map(side=>({grain:bank(s,side).foodStockByType.穀物||0,wood:bank(s,side).materialStockByType.木材||0}));
      const proposed=rules.proposeV39Trade(s,own.id,{deliveryMode,sides,method:scenario==='mail'?'mail':'exchange',dueTurn:8,grace:20,period:scenario==='repeat'?24:0,cycles:scenario==='repeat'?2:1,negotiatorId:own.factionState.selectedUnitId});check(proposed.ok,proposed.reason);s=proposed.state;
      s.activePlayerId=npc?own.id:peer.id;let accepted=rules.acceptV39Trade(s,s.activePlayerId,proposed.contract.id,()=>0);check(accepted.ok,accepted.reason);s=accepted.state;
      const id=proposed.contract.id,contract=rules.listV39Trades(s).find(r=>r.id===id);
      check(contract.sides[receiver].memberIds.length===0,'receiver must not reserve a unit');
      const receiverPositions=value=>JSON.stringify(((npc&&receiver===1?value.neutralVillages.find(v=>v.id===peer.id).defenseUnits:value.players.find(p=>p.id===sides[receiver].partyId)?.factionState.units)||[]).map(u=>({id:u.id,x:u.x,y:u.y,assigned:!!u.tradeAssignment})));
      const passiveBefore=receiverPositions(s);
      for(let i=0;i<2;i++){
        if(!Object.keys(sides[i].goods).length)continue;
        s.activePlayerId=sides[i].kind==='village'?own.id:sides[i].partyId;
        const paid=rules.reserveV39TradeFromStock(s,s.activePlayerId,id,sides[i].kind==='village',()=>0);check(paid.ok,paid.reason);s=paid.state;
      }
      if(scenario==='cancel-loaded')s=tick(s,1);
      if(scenario.startsWith('cancel')){s.activePlayerId=own.id;const cancelled=rules.stopV39Trade(s,own.id,id,true);check(cancelled.ok,cancelled.reason);s=cancelled.state;}
      if(scenario==='death'){
        const moving=contract.sides[courier],units=moving.kind==='village'?s.neutralVillages.find(v=>v.id===moving.partyId).defenseUnits:s.players.find(p=>p.id===moving.partyId).factionState.units;
        units.find(u=>u.id===moving.unitId).hp=0;units.find(u=>u.id===moving.unitId).currentHp=0;
      }
      let relocated=false;
      for(let t=1;t<=72;t++){
        const active=rules.listV39Trades(s).find(r=>r.id===id);
        if(scenario==='relocated-after-exchange'&&active.history.length&&!relocated){
          const side=sides[receiver];if(side.kind==='player')s.players.find(p=>p.id===side.partyId).factionState.settlements.find(b=>b.settlementId===side.settlementId).x++;
          else s.neutralVillages.find(v=>v.id===side.partyId).x++;
          relocated=true;
        }
        if(scenario==='repeat'&&active.status==='active'&&active.completedCycles===1)for(const [i,side] of active.sides.entries())if(side.stage==='collecting'&&Object.entries(side.goods).some(([name,total])=>(side.reserved[name]||0)<total)){
          s.activePlayerId=side.kind==='village'?own.id:side.partyId;const paid=rules.reserveV39TradeFromStock(s,s.activePlayerId,id,side.kind==='village',()=>0);check(paid.ok,paid.reason);s=paid.state;
        }
        s=tick(s,t);const current=rules.listV39Trades(s).find(r=>r.id===id);if(['complete','cancelled','interrupted'].includes(current.status))break;if(t===3)s=JSON.parse(JSON.stringify(s));
      }
      const done=rules.listV39Trades(s).find(r=>r.id===id);
      check(receiverPositions(s)===passiveBefore,'receiving units must not move or be assigned');
      if(['exchange','repeat','mail','relocated-after-exchange','specialty'].includes(scenario)){
        const cycles=scenario==='repeat'?2:1,wood=scenario==='mail'?0:9*cycles;
        check(done.status==='complete',JSON.stringify(done));check(done.history.length===cycles,'exact number of exchanges');
        check(bank(s,sides[0]).foodStockByType.穀物===baseline[0].grain-6*cycles,'sender grain charged once per cycle');check(bank(s,sides[1]).foodStockByType.穀物===baseline[1].grain+6*cycles,'receiver receives once per cycle');
        check(bank(s,sides[1]).materialStockByType.木材===baseline[1].wood-wood,'counterparty wood charged once');check(bank(s,sides[0]).materialStockByType.木材===baseline[0].wood+wood,'courier returns goods once');
        if(scenario==='specialty'){
          check((rules.getV39SpecialtyAccess(s,own.id).find(row=>row.name===specialty)?.count||0)===specialtyBefore[0]-1,'specialty lent exactly once');
          check((rules.getV39SpecialtyAccess(s,peer.id).find(row=>row.name===specialty)?.count||0)===specialtyBefore[1]+1,'counterparty gains specialty rights');
        }
        s=tick(s,73);check(rules.listV39Trades(s).find(r=>r.id===id).history.length===cycles,'no duplicate exchange');
      }else if(scenario.startsWith('cancel')){
        check(done.status==='cancelled',JSON.stringify(done));check(!done.history.length,'cancel does not exchange');
        check(bank(s,sides[0]).foodStockByType.穀物===baseline[0].grain&&bank(s,sides[1]).materialStockByType.木材===baseline[1].wood,'both reservations refunded once');
      }else{check(done.status==='interrupted','courier death interrupts');check(!done.history.length,'dead courier does not exchange');}
      results.push({npc,deliveryMode,scenario,status:done.status});
    }
    return results;
  });
  assert.equal(results.length,32);console.log(results);assert.deepEqual(errors,[]);
}finally{await browser.close();}
