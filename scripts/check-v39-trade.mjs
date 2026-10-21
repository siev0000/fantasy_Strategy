import {openV39TestSuite} from './lib/v39-test-suite.mjs';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/trade',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));page.on('console',entry=>{if(entry.type()==='error')errors.push(entry.text());});page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await openV39TestSuite(page,'logistics');await page.locator('[data-test-action="trade-test-start"]').click();
    await page.waitForSelector('#v39-trade-modal:not([hidden])');
    await page.screenshot({path:`output/web-game/trade/proposal-${width}.png`});
    await page.locator('[data-trade-action="propose"]').click();
    const read=()=>page.evaluate(()=>{const s=window.getV39GameState(),books=s.players.flatMap(p=>p.factionState.tradeContracts||[]);return {s,books};});
    let data=await read();assert.equal(data.books.length,1);assert.equal(data.books[0].status,'proposed');
    const id=data.books[0].id,owner=data.books[0].ownerId,peer=data.books[0].sides[1].partyId;
    await page.evaluate(peer=>{const s=window.getV39GameState();window.setV39GameState({activePlayerId:peer,timeline:{...s.timeline,activeTurnPlayerId:peer}});window.openV39TradeModal('','contracts');},peer);
    await page.locator(`[data-trade-action="accept"][data-trade-id="${id}"]`).click();data=await read();assert.equal(data.books[0].status,'active');assert.equal(data.books[0].sides[0].reserved.穀物,10);assert.equal(data.books[0].sides[1].reserved.木材,10);
    const before=data.s.players[0].factionState.settlements[0].foodStockByType.穀物;
    assert.equal(before,990,'initial third separated from available stock');
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));data=await read();assert.equal(data.books[0].status,'active');assert.equal(data.books[0].sides[0].reserved.穀物,10);
    await page.locator('[data-trade-action="close"]').click();
    const advance=()=>page.evaluate(async()=>{if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw Error('turn failed');await window.waitForV39MapRenderSettled?.();});
    for(let i=0;i<32;i++){await advance();data=await read();if(data.books[0].status==='complete')break;}
    await page.evaluate(()=>window.openV39TradeModal('','contracts'));
    await page.screenshot({path:`output/web-game/trade/completed-${width}.png`});
    assert.equal(data.books[0].status,'complete',JSON.stringify(data.books[0]));assert.equal(data.books[0].history.length,1);assert(data.books[0].history[0].turn>=data.books[0].dueTurn);
    assert(data.s.players.every(p=>p.factionState.units.every(u=>!u.tradeAssignment)),'assignments released after return');
    const finished=data.books[0];await advance();data=await read();assert.equal(data.books[0].history.length,1,'no duplicate exchange');
    // Edge cases execute the same pure rules used by the native UI/turns.
    await page.evaluate(async()=>{
      const rules=window.getV39TradeRules(),check=(ok,label)=>{if(!ok)throw Error(label);};
      const unit={hp:1,status:{SIZ:170,攻撃:500}};check(rules.tradeSpeed([unit],150)===1,'150 full speed');check(rules.tradeSpeed([unit],200)===.5,'200 half speed');check(rules.tradeSpeed([unit],250)===0,'250 stops');
      check(rules.tradeCapacity([{...unit,cargoCapacityBonus:100}])===200,'wagon bonus');
      window.startV39TradeTest();let s=window.getV39GameState(),draft={sides:[{kind:'player',partyId:s.players[0].id,settlementId:s.players[0].factionState.settlements[0].settlementId,unitId:s.players[0].factionState.units[0].id,center:{x:7,y:5},radius:1,goods:{穀物:30}},
        {kind:'player',partyId:s.players[1].id,settlementId:s.players[1].factionState.settlements[0].settlementId,unitId:s.players[1].factionState.units[0].id,center:{x:7,y:5},radius:1,goods:{木材:30}}],dueTurn:9,grace:3,period:0,cycles:1};
      const fixture=structuredClone(s);
      const shortage=structuredClone(s);shortage.players[0].factionState.settlements[0].foodStockByType.穀物=9;
      check(!rules.proposeV39Trade(shortage,s.activePlayerId,draft).ok,'initial third mandatory');
      const disjoint=structuredClone(draft);disjoint.sides[1].center.x=20;check(!rules.proposeV39Trade(s,s.activePlayerId,disjoint).ok,'meeting overlap');
      const singleTile=structuredClone(draft);singleTile.sides.forEach(side=>side.radius=0);check(!rules.proposeV39Trade(s,s.activePlayerId,singleTile).ok,'meeting needs two distinct adjacent stops');
      let proposal=rules.proposeV39Trade(s,s.activePlayerId,draft);s={...proposal.state,activePlayerId:draft.sides[1].partyId};
      let accepted=rules.acceptV39Trade(s,s.activePlayerId,proposal.contract.id);check(accepted.ok,'accept');s=accepted.state;
      const income=rules.divertV39TradeIncome(s,'player',draft.sides[0].partyId,draft.sides[0].settlementId,{穀物:1},2);
      check(income.reserved.穀物===1&&income.income.穀物===0,'reserve only actual income');
      const again=rules.divertV39TradeIncome(income.state,'player',draft.sides[0].partyId,draft.sides[0].settlementId,{穀物:1},2);
      check(Object.keys(again.reserved).length===0,'no duplicate income');
      const priority=structuredClone(s),original=rules.listV39Trades(priority)[0],later={...structuredClone(original),id:'later-trade',sequence:2,acceptedOrder:2};
      priority.players.find(p=>p.id===original.ownerId).factionState.tradeContracts=[later,original];
      const allocated=rules.divertV39TradeIncome(priority,'player',draft.sides[0].partyId,draft.sides[0].settlementId,{穀物:2},9);
      check(rules.listV39Trades(allocated.state)[0].sides[0].reserved.穀物===12&&rules.listV39Trades(allocated.state)[1].sides[0].reserved.穀物===10,'income allocated by acceptance order, not display order');
      const cancelled=rules.stopV39Trade(s,s.activePlayerId,proposal.contract.id,true);check(cancelled.ok,'cancel');
      check(cancelled.state.players[0].factionState.settlements[0].foodStockByType.穀物===1000,'unloaded reservation refunded once');
      const start=(npc=false,period=0)=>{
        const initial=structuredClone(fixture),d=structuredClone(draft);
        d.sides[0].partyId=initial.players[0].id;d.sides[1].partyId=initial.players[1].id;d.dueTurn=8;d.period=period;d.cycles=period?2:1;
        if(npc){const v=initial.neutralVillages[0];d.sides[1]={kind:'village',partyId:v.id,settlementId:v.id,unitId:v.defenseUnits[0].id,center:{x:7,y:5},radius:1,goods:{魂:3}};}
        const offer=rules.proposeV39Trade(initial,initial.activePlayerId,d);check(offer.ok,offer.reason);
        const acceptState={...offer.state,activePlayerId:npc?initial.players[0].id:initial.players[1].id};const result=rules.acceptV39Trade(acceptState,acceptState.activePlayerId,offer.contract.id,()=>0);check(result.ok,result.reason);
        return {s:result.state,id:offer.contract.id};
      };
      const tick=(value,t)=>{
        let next={...value,timeline:{...value.timeline,turnNumber:t}};
        next.players=next.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}}));
        next.neutralVillages=next.neutralVillages.map(v=>({...v,defenseUnits:v.defenseUnits.map(u=>({...u,ap:100,currentAp:100}))}));
        for(const p of next.players)next=rules.advanceV39TradeLogistics(next,p.id,window.__v39FieldRuntime.mapData,t).state;
        next=rules.advanceV39TradeLogistics(next,'',window.__v39FieldRuntime.mapData,t,true).state;
        for(const p of next.players)for(const bank of p.factionState.settlements)next=rules.divertV39TradeIncome(next,'player',p.id,bank.settlementId,{穀物:30,木材:30},t).state;
        return next;
      };
      let recurring=start(false,12);
      for(let t=1;t<36;t++){recurring.s=tick(recurring.s,t);if(rules.listV39Trades(recurring.s)[0].status==='complete')break;}
      check(rules.listV39Trades(recurring.s)[0].completedCycles===2,'two real periodic exchanges');
      let village=start(true);village.s.activePlayerId=village.s.players[0].id;
      const manual=rules.reserveV39TradeFromStock(village.s,village.s.activePlayerId,village.id,true,()=>0);check(manual.ok,manual.reason);village.s=manual.state;
      for(let t=1;t<24;t++){village.s=tick(village.s,t);if(rules.listV39Trades(village.s)[0].status==='complete')break;}
      check(rules.listV39Trades(village.s)[0].status==='complete','NPC delivery/return');
      check(village.s.players[0].factionState.settlements[0].foodStockByType.魂===1003,'real village souls transferred');
      let returning=start();for(const p of returning.s.players){returning.s.activePlayerId=p.id;returning.s=rules.reserveV39TradeFromStock(returning.s,p.id,returning.id).state;}
      returning.s=rules.advanceV39TradeLogistics(returning.s,returning.s.players[0].id,window.__v39FieldRuntime.mapData,1).state;
      returning.s.activePlayerId=returning.s.players[0].id;const stopped=rules.stopV39Trade(returning.s,returning.s.activePlayerId,returning.id,true);check(stopped.ok,'cancel cargo in transit');returning.s=stopped.state;
      for(let t=2;t<15;t++){returning.s=tick(returning.s,t);if(rules.listV39Trades(returning.s)[0].status==='cancelled')break;}
      check(rules.listV39Trades(returning.s)[0].status==='cancelled','physical cancellation return');
      check(returning.s.players[0].factionState.settlements[0].foodStockByType.穀物===1000,'no in-transit refund duplication');
      let killed=start();killed.s.players[0].factionState.units[0].hp=0;killed.s=rules.advanceV39TradeLogistics(killed.s,killed.s.players[0].id,window.__v39FieldRuntime.mapData,2).state;
      check(rules.listV39Trades(killed.s)[0].status==='interrupted'&&!rules.listV39Trades(killed.s)[0].history.length,'carrier death stops exchange');
      let paused=start(),p0=paused.s.players[0].id,p1=paused.s.players[1].id;
      paused.s.activePlayerId=p0;paused.s=rules.stopV39Trade(paused.s,p0,paused.id).state;
      check(paused.s.players.every(p=>p.factionState.units.filter(u=>u.tradeAssignment).every(u=>!u.tradeAssignment.automatic)),'pause both parties');
      paused.s=rules.resumeV39Trade(paused.s,p0,paused.id,12,3).state;
      check(rules.listV39Trades(paused.s)[0].status==='interrupted','resume needs counterpart approval');
      paused.s.activePlayerId=p1;paused.s=rules.resumeV39Trade(paused.s,p1,paused.id,12,3).state;
      check(rules.listV39Trades(paused.s)[0].status==='active','bilateral resume');
      let deadline=start();deadline.s=rules.advanceV39TradeLogistics(deadline.s,deadline.s.players[0].id,window.__v39FieldRuntime.mapData,12).state;
      check(rules.listV39Trades(deadline.s)[0].status==='interrupted','after inclusive grace deadline interrupts');
      let npcDeath=start(true);npcDeath.s.neutralVillages[0].defenseUnits[0]={...npcDeath.s.neutralVillages[0].defenseUnits[0],hp:0,currentHp:0,state:'死亡',tradeCargo:{resourcesByType:{魂:3},equipmentInventory:[]}};
      window.setV39GameState(npcDeath.s);window.runV39DeathLifecycle();let fallen=window.getV39GameState(),guard=fallen.neutralVillages[0].defenseUnits[0];
      check(fallen.groundLootByTile[`${guard.x},${guard.y}`].cargo.resourcesByType.魂===3,'NPC cargo dropped');
      window.runV39DeathLifecycle();fallen=window.getV39GameState();check(fallen.groundLootByTile[`${guard.x},${guard.y}`].cargo.resourcesByType.魂===3,'death drop once');
      let mailState=structuredClone(fixture),mailDraft=structuredClone(draft);mailDraft.method='mail';mailDraft.sides[1].goods={};mailDraft.dueTurn=8;
      const mailOffer=rules.proposeV39Trade(mailState,mailState.activePlayerId,mailDraft);check(mailOffer.ok,mailOffer.reason);
      mailState={...mailOffer.state,activePlayerId:mailDraft.sides[1].partyId};mailState=rules.acceptV39Trade(mailState,mailState.activePlayerId,mailOffer.contract.id).state;
      const recipientFood=mailState.players[1].factionState.settlements[0].foodStockByType.穀物;
      for(let t=1;t<24;t++){mailState=tick(mailState,t);if(rules.listV39Trades(mailState)[0].status==='complete')break;}
      check(rules.listV39Trades(mailState)[0].status==='complete','one-way mail return');
      check(mailState.players[1].factionState.settlements[0].foodStockByType.穀物===recipientFood+30,'mail one actual delivery');
    });
    if(width===390){
      await page.evaluate(()=>{
        window.startV39TradeTest();let s=window.getV39GameState();const rules=window.getV39TradeRules(),owner=s.players[0],v=s.neutralVillages[0];
        const sides=[{kind:'player',partyId:owner.id,settlementId:owner.factionState.settlements[0].settlementId,unitId:owner.factionState.units[0].id,center:{x:7,y:5},radius:1,goods:{穀物:30}},
          {kind:'village',partyId:v.id,settlementId:v.id,unitId:v.defenseUnits[0].id,center:{x:7,y:5},radius:1,goods:{魂:3}}];
        const offer=rules.proposeV39Trade(s,owner.id,{sides,dueTurn:11,grace:3,period:0,cycles:1});if(!offer.ok)throw Error(offer.reason);
        const accept=rules.acceptV39Trade(offer.state,owner.id,offer.contract.id,()=>0);if(!accept.ok)throw Error(accept.reason);
        const reserve=rules.reserveV39TradeFromStock(accept.state,owner.id,offer.contract.id,true,()=>0);if(!reserve.ok)throw Error(reserve.reason);
        window.setV39GameState(reserve.state);document.querySelector('#v39-trade-modal').hidden=true;
      });
      for(let i=0;i<40;i++){await advance();data=await read();if(data.books[0].status==='complete')break;}
      assert.equal(data.books[0].status,'complete',`native NPC world stages: ${JSON.stringify(data.books[0])}`);
      assert.equal(data.books[0].history.length,1);
      console.log('native NPC world income/AP/movement/exchange/return passed');
    }
    assert.deepEqual(errors,[]);console.log(`${width}: proposal, peer acceptance, reservation, native movement/economy, simultaneous exchange, return, save and edge cases passed`);await page.close();
  }
}finally{await browser.close();}
