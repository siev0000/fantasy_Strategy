import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/logistics-fixture';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();
    await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState()?.logisticsRoutes?.length===4);
    const initial=await page.evaluate(()=>{
      const f=window.getV39ActiveFactionState(),map=window.__v39FieldRuntime.mapData;
      return {settlements:f.settlements.map(s=>({id:s.settlementId,type:s.type,tiles:Object.keys(s.territoryResidentialCenterMap||{})})),
        routes:f.logisticsRoutes,forest:map.grid[13][3],unique:new Set(f.units.map(u=>`${u.worldId||'surface'}:${u.x},${u.y}`)).size===f.units.length};
    });
    assert.equal(initial.settlements.length,5);assert.equal(initial.settlements.filter(s=>s.type==='町').length,2);
    assert(initial.settlements.filter(s=>s.type==='町').every(s=>s.tiles.length===2));assert.equal(initial.forest,'森');assert(initial.unique);
    assert(initial.routes.every(r=>r.repeat&&r.memberIds.length===2));
    assert.equal(await page.locator('#footLogistics [data-logistics-select]').count(),6,'four domestic routes and both legs of the related international trade');
    assert.equal(await page.locator('[data-logistics-view-player] option').count(),3);
    const forest=initial.routes.find(r=>r.name==='森の木材便');
    await page.locator(`[data-logistics-select="${forest.id}"]`).click();
    await page.screenshot({path:`${out}/routes-${width}.png`});
    const result=await page.evaluate(async()=>{
      const {advanceLogisticsRoutes}=await import('/src/lib/v39-logistics-routes.js');
      let s=structuredClone(window.getV39LogisticsState());
      const delivered=new Set(),worlds=new Set(),stocks=state=>{
        const total={};const add=(name,n)=>total[name]=(total[name]||0)+(Number(n)||0);
        for(const p of state.players){for(const b of p.factionState.settlements){for(const bag of [b.foodStockByType,b.materialStockByType])for(const [k,n] of Object.entries(bag||{}))add(k,n);}
          for(const squad of p.factionState.squads)for(const bag of Object.values(squad.cargoByUnitId||{}))for(const [k,n] of Object.entries(bag.resourcesByType||{}))add(k,n);}
        for(const w of Object.values(state.explorationWorlds))for(const [k,n] of Object.entries(w.map?.caveMine?.stockByResource||{}))add(k==='鉱石'?'鉄':k,n);
        return total;
      };
      const before=stocks(s);
      for(let turn=1;turn<=70;turn++){
        const f=s.players.find(p=>p.id===s.activePlayerId).factionState,previous=f.logisticsRoutes;
        s={...s,timeline:{...s.timeline,turnNumber:turn},players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>({...u,ap:100,currentAp:100}))}}:p)};
        s=advanceLogisticsRoutes(s,s.activePlayerId,turn);
        const next=s.players.find(p=>p.id===s.activePlayerId).factionState;
        for(const route of next.logisticsRoutes){if(previous.find(r=>r.id===route.id)?.phase==='deliver'&&route.phase==='fetch'&&route.status==='搬入完了')delivered.add(route.name);}
        for(const u of next.units.filter(u=>u.id.startsWith('logistics-test-cave')))worlds.add(u.worldId||'surface');
        if(delivered.size===4)break;
      }
      return {delivered:[...delivered],worlds:[...worlds],routes:s.players.find(p=>p.id===s.activePlayerId).factionState.logisticsRoutes,before,after:stocks(s)};
    });
    assert.equal(result.delivered.length,4,JSON.stringify(result.routes));assert.equal(result.worlds.length,2);assert.deepEqual(result.before,result.after);
    const live=await page.evaluate(async()=>{
      const state=window.getV39GameState(),before=state.timeline.turnNumber,owner=state.activePlayerId;
      const ended=await window.advanceV39Turn({skipUnactedFocus:true});
      const f=window.getV39GameState().players.find(p=>p.id===owner).factionState,saved=JSON.stringify(f.logisticsRoutes);window.importV39SaveJson(window.exportV39SaveJson());
      return {ended,processed:f.logisticsRoutes.length===4&&f.logisticsRoutes.every(r=>r.lastProcessedTurn===before),saved:JSON.stringify(window.getV39GameState().players.find(p=>p.id===owner).factionState.logisticsRoutes)===saved};
    });assert(live.ended&&live.processed&&live.saved,JSON.stringify(live));
    await page.evaluate(()=>window.startV39LogisticsTest());
    assert.equal(await page.locator('#footLogistics [data-logistics-select]').count(),6,'restart replaces rather than appends routes and players');
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({initial,result,live},null,2));
    console.log(`${width}: native test button, five settlements/two towns, four two-member routes, all deliveries, cave crossing, stock conservation, real turn/save and restart passed`);
    await page.close();
  }
}finally{await browser.close();}
