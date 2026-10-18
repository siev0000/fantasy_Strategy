import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/logistics-connections';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.waitForSelector('[data-logistics-view-player]');
    const report=await page.evaluate(async()=>{
      const {resolveV39LogisticsConnection:connection}=await import('/src/lib/v39-logistics-connections.js');
      const {getV39VisibleTradeLogistics}=await import('/src/lib/v39-logistics-visibility.js');
      const s=window.getV39LogisticsState(),before=JSON.stringify(s),f=s.players.find(p=>p.id===s.activePlayerId).factionState;
      const route=f.logisticsRoutes.find(r=>r.name==='森の木材便'),actor=f.units.find(u=>u.id===route.leaderId);
      const row={...route,kind:'route',unit:actor},normal=connection(s,row);
      const relocated=connection(s,{...row,phase:'fetch',returning:true,unit:{...actor,x:20,y:20,worldId:'elsewhere'}});
      const legacy=connection(s,{kind:'legacy',unit:{...actor,transportAssignment:{originSettlementId:'logistics-forest',destinationSettlementId:'logistics-town'}}});
      const trades=getV39VisibleTradeLogistics(s,s.activePlayerId).map(row=>connection(s,{...row,kind:'trade'}));
      const mine=f.logisticsRoutes.find(r=>r.name==='洞窟鉱床便'),courier=f.units.find(u=>u.id===mine.leaderId);
      const underground=connection(s,{...mine,kind:'route',unit:courier});
      const emerged=connection(s,{...mine,kind:'route',phase:'fetch',unit:{...courier,x:7,y:7,worldId:'surface'}});
      const waiting=window.getV39TradeRules().listV39Trades(s).find(c=>c.sides.some(side=>side.partyId===s.activePlayerId));
      const side=waiting.sides.find(side=>side.partyId===s.activePlayerId);
      const paused=connection(s,{kind:'trade',contract:waiting,side:{...side,stage:'waiting'}});
      return {id:route.id,normal,relocated,legacy,trades,underground,emerged,paused,immutable:before===JSON.stringify(s)};
    });
    assert.deepEqual(report.normal.origin,{...report.normal.source});
    assert.equal(report.normal.origin.x,3);assert.equal(report.normal.origin.y,13);
    assert.equal(report.normal.target.x,12);assert.equal(report.normal.target.y,12);
    assert.deepEqual(report.normal,report.relocated,'unit position, world, fetch/returning state never move the base connection');
    assert.deepEqual(report.normal.path,report.legacy.path);
    assert.deepEqual(report.underground,report.emerged,'cave surface link stays anchored at the entrance after emergence');
    assert.equal(report.underground.origin.x,8);assert.equal(report.underground.origin.y,5);
    assert.equal(report.underground.target.x,4);assert.equal(report.underground.target.y,4);
    assert.equal(report.trades.length,2);assert.equal(report.trades[0].origin.x,report.trades[1].target.x);
    assert.equal(report.trades[0].target.x,report.trades[1].origin.x);assert(report.trades.every(r=>r.laneOffset===8));
    assert(report.paused.path.length>0,'waiting couriers do not remove the fixed trade connection');assert(report.immutable);
    await page.locator(`[data-logistics-select="${report.id}"]`).click();
    const rendered=await page.evaluate(id=>{
      const layer=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-logistics-routes');
      const g=layer.list.find(n=>n.getData('routeId')===id);
      return {connection:g.getData('connection'),path:g.getData('path')};
    },report.id);
    assert.deepEqual(rendered.connection.origin,{x:3,y:13});assert.deepEqual(rendered.connection.target,{x:12,y:12});
    await page.screenshot({path:`${out}/domestic-${width}.png`});
    const tradeRow=await page.locator('[data-logistics-select]').evaluateAll(nodes=>nodes.find(n=>n.dataset.logisticsSelect.startsWith('trade:')).dataset.logisticsSelect);
    await page.locator(`[data-logistics-select="${tradeRow}"]`).click();
    await page.screenshot({path:`${out}/international-${width}.png`});
    assert.match(await page.locator('.logistics-detail').innerText(),/拠点間の物資の流れ/);
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({report,rendered},null,2));
    console.log(`${width}: fixed domestic/cave/trade anchors, movement-independent flow, opposite trade lanes, legacy, waiting and immutable state passed`);
    await page.close();
  }
} finally {await browser.close();}
