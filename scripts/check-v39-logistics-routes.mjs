import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/logistics-routes',{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
      const s=window.getV39GameState(),f=window.getV39ActiveFactionState(),base=f.settlements[0],template=f.units.find(u=>u.id==='expedition-test-guard');
      const units=[{...template,id:'logistics-a',name:'輸送先頭',x:4,y:4,squadId:'logistics-test',ap:100,currentAp:100,caveDuty:undefined},{...template,id:'logistics-b',name:'輸送後続',x:3,y:4,squadId:'logistics-test',ap:100,currentAp:100,caveDuty:undefined}];
      const destination={...base,id:'logistics-destination',settlementId:'logistics-destination',name:'搬送先',x:8,y:4,territoryTileKeys:['8,4'],territoryResidentialCenterMap:{'8,4':'8,4'},tileFacilityMap:{},materialStockByType:{木材:0},foodStockByType:{},buildings:[]};
      window.setV39GameState({players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,logisticsRoutes:[],units:[...f.units.map((u,i)=>({...u,x:14+i,y:10})),...units],
        squads:[...f.squads,{id:'logistics-test',name:'輸送試験部隊',unitIds:units.map(u=>u.id)}],settlements:[{...base,materialStockByType:{...base.materialStockByType,木材:100}},destination]}}:p)});
      window.activateV39FooterTab('logistics');
    });
    assert(await page.locator('[data-foot="logistics"]').first().isVisible());
    await page.locator('[data-logistics-new]').click();
    await page.selectOption('[name=groupId]','squad:logistics-test');
    await page.selectOption('[name=sourceId]','settlement:expedition-test-base');
    await page.selectOption('[name=destinationId]','settlement:logistics-destination');
    await page.selectOption('[name=resource]','木材');await page.selectOption('[name=repeat]','false');
    await page.locator('#v39-logistics-dialog [type=submit]').click();
    await page.waitForFunction(()=>!document.getElementById('v39-logistics-dialog'));
    const id=await page.evaluate(()=>window.getV39ActiveFactionState().logisticsRoutes[0].id);
    await page.locator(`[data-logistics-select="${id}"]`).click();
    const loaded=await page.evaluate(()=>{
      const s=window.getV39GameState();window.advanceV39LogisticsRoutes(s.activePlayerId,1);
      const f=window.getV39ActiveFactionState();return {route:f.logisticsRoutes[0],stock:f.settlements[0].materialStockByType.木材,cargo:f.squads.find(s=>s.id==='logistics-test').cargoByUnitId['logistics-a'].resourcesByType};
    });
    assert.equal(loaded.stock,90);assert.equal(loaded.cargo.木材,10);assert.equal(loaded.route.phase,'deliver');
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(n=>n.name==='v39-logistics-routes'&&n.list.some(c=>c.name==='v39-logistics-route-line'&&c.getData('path').length>0)));
    await page.locator(`[data-logistics-select="${id}"]`).click();
    await page.screenshot({path:`output/web-game/logistics-routes/route-${width}.png`});
    await page.locator('[data-logistics-control="pause"]').click();
    const pause=await page.evaluate(()=>{const s=window.getV39GameState(),before=JSON.stringify(window.getV39ActiveFactionState().units);window.advanceV39LogisticsRoutes(s.activePlayerId,2);return before===JSON.stringify(window.getV39ActiveFactionState().units);});assert(pause);
    await page.locator('[data-logistics-control="remove"]').click();assert.match(await page.locator('#footLogistics output').innerText(),/積荷/);
    await page.locator('[data-logistics-control="resume"]').click();
    const stateChecks=await page.evaluate(()=>{
      const before=window.getV39ActiveFactionState().logisticsRoutes;window.importV39SaveJson(window.exportV39SaveJson());
      const after=window.getV39ActiveFactionState().logisticsRoutes;
      const snap=window.getV39GameState();snap.players.find(p=>p.id===snap.activePlayerId).factionState.logisticsRoutes[0].memberIds.push('mutated');
      return {saved:JSON.stringify(before)===JSON.stringify(after),isolated:!window.getV39ActiveFactionState().logisticsRoutes[0].memberIds.includes('mutated')};
    });assert(stateChecks.saved&&stateChecks.isolated);
    const delivery=await page.evaluate(()=>{
      const starts=window.getV39ActiveFactionState().units.filter(u=>u.id.startsWith('logistics-')).map(u=>({id:u.id,x:u.x,y:u.y}));
      for(let turn=2;turn<10;turn++){
        const s=window.getV39GameState(),f=window.getV39ActiveFactionState();window.setV39GameState({timeline:{...s.timeline,turnNumber:turn},players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...f,units:f.units.map(u=>u.id.startsWith('logistics-')?{...u,ap:100,currentAp:100}:u)}}:p)});
        window.advanceV39LogisticsRoutes(s.activePlayerId,turn);
        if(!window.getV39ActiveFactionState().logisticsRoutes[0].enabled)break;
      }
      const f=window.getV39ActiveFactionState(),units=f.units.filter(u=>u.id.startsWith('logistics-'));
      return {route:f.logisticsRoutes[0],stock:f.settlements.find(s=>s.settlementId==='logistics-destination').materialStockByType.木材,
        moved:units.every(u=>starts.some(start=>start.id===u.id&&(start.x!==u.x||start.y!==u.y))),unique:new Set(units.map(u=>`${u.x},${u.y}`)).size===2,ghost:f.squads.some(s=>s.id==='logistics-group')};
    });assert.equal(delivery.stock,10,JSON.stringify(delivery));assert.equal(delivery.route.status,'完了');assert(delivery.moved&&delivery.unique&&!delivery.ghost,JSON.stringify(delivery));
    await page.locator('[data-foot="squad"]').first().click();
    assert(!await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(n=>n.name==='v39-logistics-routes')));
    const mine=await page.evaluate(async()=>{
      const {configureLogisticsRoute,advanceLogisticsRoutes,logisticsEndpoints}=await import('/src/lib/v39-logistics-routes.js');
      let s=structuredClone(window.getV39LogisticsState());
      for(const w of Object.values(s.explorationWorlds)){w.spatial.enemies=[];w.spatial.neutralVillages=[];}
      s.enemies=[];s.neutralVillages=[];
      const source=logisticsEndpoints(s,s.activePlayerId).find(e=>e.kind==='mine');
      const f=s.players.find(p=>p.id===s.activePlayerId).factionState,base=f.settlements.find(b=>b.settlementId==='expedition-test-base'),iron=Number(base.materialStockByType.鉄)||0;
      const configured=configureLogisticsRoute(s,s.activePlayerId,{groupId:'squad:logistics-test',sourceId:source.id,destinationId:'settlement:expedition-test-base',resource:'鉄',amount:10,repeat:false});
      if(!configured.ok)return configured;s=configured.state;
      const id=configured.route.id,seen=new Set();
      for(let turn=20;turn<70;turn++){
        s={...s,players:s.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>u.id.startsWith('logistics-')?{...u,ap:100,currentAp:100}:u)}}:p)};
        s=advanceLogisticsRoutes(s,s.activePlayerId,turn);
        const f=s.players.find(p=>p.id===s.activePlayerId).factionState,r=f.logisticsRoutes.find(r=>r.id===id);f.units.filter(u=>u.id.startsWith('logistics-')).forEach(u=>seen.add(u.worldId));
        if(!r.enabled)return {ok:r.status==='完了',route:r,iron:(f.settlements.find(b=>b.settlementId===base.settlementId).materialStockByType.鉄||0)-iron,worlds:[...seen],ore:s.explorationWorlds[source.worldId].map.caveMine.stockByResource.鉱石};
      }
      return {ok:false,route:s.players.find(p=>p.id===s.activePlayerId).factionState.logisticsRoutes.find(r=>r.id===id)};
    });assert(mine.ok&&mine.iron===10&&mine.ore===0&&mine.worlds.length>1,JSON.stringify(mine));
    const turnHook=await page.evaluate(async()=>{
      const {controlLogisticsRoute}=await import('/src/lib/v39-logistics-routes.js');
      const s=window.getV39GameState(),r=window.getV39ActiveFactionState().logisticsRoutes[0],nextTurn=(r.lastProcessedTurn||0)+1;
      const resumed=controlLogisticsRoute(s,s.activePlayerId,r.id,'resume');if(!resumed.ok)throw Error(resumed.reason);
      window.setV39GameState({timeline:{...s.timeline,turnNumber:nextTurn},players:resumed.state.players.map(p=>p.id===s.activePlayerId?{...p,factionState:{...p.factionState,units:p.factionState.units.map(u=>r.memberIds.includes(u.id)?{...u,ap:100,currentAp:100}:u)}}:p)});
      const ended=await window.advanceV39Turn({skipUnactedFocus:true}),after=window.getV39ActiveFactionState().logisticsRoutes.find(row=>row.id===r.id);
      return {ended,processed:after.lastProcessedTurn===nextTurn,turn:window.getV39GameState().timeline.turnNumber>nextTurn};
    });assert(turnHook.ended&&turnHook.processed&&turnHook.turn,JSON.stringify(turnHook));
    assert.deepEqual(errors,[]);console.log(`${width}: logistics form, 2-unit AP following, loading/delivery, pause, cargo guard, save, route overlay and cleanup passed`);
    await page.close();
  }
}finally{await browser.close();}
