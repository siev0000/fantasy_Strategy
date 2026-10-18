import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/international-logistics';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>{errors.push(String(e.stack));console.error(e.stack);});page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.waitForSelector('[data-logistics-view-player]');
    const setup=await page.evaluate(()=>{
      const s=window.getV39GameState(),contracts=window.getV39TradeRules().listV39Trades(s);
      return {self:s.activePlayerId,players:s.players.map(p=>p.id),contracts};
    });
    assert.equal(setup.players.length,3);assert.equal(setup.contracts.length,2);
    assert(setup.contracts.every(c=>c.status==='active'));
    const publicTrade=setup.contracts.find(c=>c.sides.some(side=>side.partyId===setup.self));
    const hiddenTrade=setup.contracts.find(c=>c!==publicTrade);
    const lines=()=>page.evaluate(()=>{
      const layer=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-logistics-routes');
      return layer.list.filter(n=>n.name==='v39-logistics-route-line').map(n=>({id:n.getData('routeId'),owner:n.getData('ownerPlayerId'),style:n.getData('routeStyle'),connection:n.getData('connection'),segments:n.getData('visibleSegments')}));
    });
    const ownLines=await lines();
    assert.equal(await page.locator('[data-logistics-select]').count(),6);
    assert.equal(ownLines.filter(l=>l.id.startsWith(`trade:${publicTrade.id}`)).length,2);
    assert(!ownLines.some(l=>l.id.includes(hiddenTrade.id)),'private third-country trade never reaches the overlay, even in test mode');
    assert.equal(new Set(ownLines.filter(l=>l.id.startsWith('trade:')).map(l=>l.style.color)).size,2);
    const tradeLines=ownLines.filter(l=>l.id.startsWith('trade:'));
    assert.deepEqual(tradeLines[0].connection.origin,tradeLines[1].connection.target);
    assert.deepEqual(tradeLines[0].connection.target,tradeLines[1].connection.origin);
    assert(tradeLines.every(l=>l.connection.laneOffset===8),'trade flows connect the same two bases in separate directional lanes');
    const peerRow=`trade:${publicTrade.id}:logistics-north`;
    await page.locator(`[data-logistics-select="${peerRow}"]`).click();
    assert.equal(await page.locator('[data-logistics-world]').count(),0,'foreign route does not grant unit/world control');
    assert.equal(await page.locator('[data-logistics-control]').count(),0);
    await page.screenshot({path:`${out}/self-${width}.png`});
    const fog=await page.evaluate(()=>{
      const test=window.isV39TestMode,vision=window.isV39TileInCurrentVision,detected=window.isV39EntityDetected;
      window.isV39TestMode=()=>false;window.isV39TileInCurrentVision=()=>false;window.isV39EntityDetected=()=>false;
      window.activateV39FooterTab('logistics');
      const text=document.querySelector('.logistics-detail').innerText;
      const layer=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-logistics-routes');
      const hidden=layer.list.filter(n=>n.getData('ownerPlayerId')==='logistics-north').every(n=>n.getData('visibleSegments')===0);
      window.isV39TestMode=test;window.isV39TileInCurrentVision=vision;window.isV39EntityDetected=detected;
      window.activateV39FooterTab('logistics');return {hidden,text};
    });assert(fog.hidden);assert.match(fog.text,/索敵外/);
    await page.selectOption('[data-logistics-view-player]','logistics-north');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-logistics-select]').count(),4);
    assert((await lines()).some(l=>l.id.includes(hiddenTrade.id)),'participant sees its own otherwise-private trade');
    await page.screenshot({path:`${out}/north-${width}.png`});
    await page.selectOption('[data-logistics-view-player]','logistics-east');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-logistics-select]').count(),2);
    assert(!(await lines()).some(l=>l.id.includes(publicTrade.id)));
    await page.selectOption('[data-logistics-view-player]',setup.self);
    const simulation=await page.evaluate(()=>{
      const rules=window.getV39TradeRules(),map=window.__v39FieldRuntime.mapData;
      let s=structuredClone(window.getV39GameState());
      const before=JSON.stringify(s),positions=s.players.flatMap(p=>p.factionState.units).map(u=>[u.id,u.x,u.y]);
      const stock=state=>{
        const total={};const add=(name,amount)=>total[name]=(total[name]||0)+amount;
        for(const p of state.players){
          for(const bank of p.factionState.settlements)for(const bag of [bank.foodStockByType,bank.materialStockByType])for(const [k,v] of Object.entries(bag||{}))add(k,v);
          for(const squad of p.factionState.squads)for(const cargo of Object.values(squad.cargoByUnitId||{}))for(const [k,v] of Object.entries(cargo.resourcesByType||{}))add(k,v);
        }
        for(const c of rules.listV39Trades(state))for(const side of c.sides)for(const [k,v] of Object.entries(side.reserved||{}))add(k,v);
        return total;
      };
      const first=stock(s);
      for(let turn=2;turn<=40;turn++){
        s={...s,timeline:{...s.timeline,turnNumber:turn},players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}}))};
        for(const player of s.players)s=rules.advanceV39TradeLogistics({...s,activePlayerId:player.id},player.id,map,turn).state;
        if(rules.listV39Trades(s).every(c=>c.status==='complete'))break;
      }
      return {contracts:rules.listV39Trades(s),before:first,after:stock(s),unchanged:before===JSON.stringify(window.getV39GameState()),
        moved:JSON.stringify(positions)!==JSON.stringify(s.players.flatMap(p=>p.factionState.units).map(u=>[u.id,u.x,u.y]))};
    });
    assert(simulation.unchanged&&simulation.moved);assert(simulation.contracts.every(c=>c.status==='complete'&&c.history.length===1),JSON.stringify(simulation.contracts));
    assert.deepEqual(simulation.before,simulation.after,'physical exchanges conserve stock, reservation and cargo totals');
    await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();window.activateV39FooterTab('logistics');});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('[data-logistics-select]').count(),6);
    assert(!(await lines()).some(l=>l.id.includes(hiddenTrade.id)),'privacy survives save/load');
    const restarted=await page.evaluate(()=>{
      window.startV39InternationalLogisticsTest();const s=window.getV39GameState();
      return {players:s.players.length,contracts:window.getV39TradeRules().listV39Trades(s).length};
    });assert.deepEqual(restarted,{players:3,contracts:2},'restart replaces the test, not appends players or contracts');
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({setup,ownLines,simulation},null,2));
    console.log(`${width}: 3 players, both public trade legs/colors, hidden third-country trade, view switch, fog, read-only peer, physical exchanges and save passed`);
    await page.close();
  }
} finally {await browser.close();}
