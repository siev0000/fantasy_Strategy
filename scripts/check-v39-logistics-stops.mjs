import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/logistics-routes',{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
  const report=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const rules=await import('/src/lib/v39-logistics-routes.js'),{getV39TransportCargo}=await import('/src/lib/v39-transport-rules.js');
    let s=structuredClone(window.getV39LogisticsState()),p=s.players.find(p=>p.id===s.activePlayerId),base=p.factionState.settlements[0];
    const u={...p.factionState.units.find(u=>u.id==='expedition-test-king'),x:4,y:4,squadId:'stop-test',ap:100,currentAp:100};
    p.factionState={...p.factionState,units:[u],squads:[{id:'stop-test',name:'停止試験部隊',unitIds:[u.id]}],logisticsRoutes:[],settlements:[{...base,materialStockByType:{木材:100}},
      {...base,id:'stop-destination',settlementId:'stop-destination',name:'搬送先',x:9,y:4,territoryResidentialCenterMap:{},materialStockByType:{木材:0}}]};
    const request={groupId:'squad:stop-test',sourceId:'settlement:expedition-test-base',destinationId:'settlement:stop-destination',resource:'木材',amount:10,repeat:true};
    const invalid=!rules.configureLogisticsRoute(s,s.activePlayerId,{...request,amount:.5}).ok;
    s=rules.configureLogisticsRoute(s,s.activePlayerId,request).state;const id=s.players.find(p=>p.id===s.activePlayerId).factionState.logisticsRoutes[0].id;
    s=rules.advanceLogisticsRoutes(s,s.activePlayerId,1);
    const dup=rules.advanceLogisticsRoutes(s,s.activePlayerId,1),duplicate=JSON.stringify(s)===JSON.stringify(dup);
    const map=s.explorationWorlds.surface.map;map.heightLevelMap=map.grid.map(row=>row.map(()=>10));map.heightLevelMap[4][4]=0;map.heightLevelMap[4][9]=0;
    const before=JSON.stringify(s),blocked=rules.advanceLogisticsRoutes(s,s.activePlayerId,2),f=blocked.players.find(p=>p.id===s.activePlayerId).factionState,r=f.logisticsRoutes[0];
    const immutable=before===JSON.stringify(s),cargo=getV39TransportCargo(f,u.id).resourcesByType.木材;
    const resumed=rules.controlLogisticsRoute(blocked,s.activePlayerId,id,'return');
    const returned=rules.advanceLogisticsRoutes(resumed.state,s.activePlayerId,3),home=returned.players.find(p=>p.id===s.activePlayerId).factionState;
    window.setV39GameState({players:blocked.players});window.activateV39FooterTab('logistics');
    return {invalid,duplicate,immutable,stopped:!r.enabled&&r.status==='停止',cargo,route:r,homeRoute:home.logisticsRoutes[0],stock:home.settlements[0].materialStockByType,returned:home.settlements[0].materialStockByType.木材===100&&home.logisticsRoutes[0].status==='完了',id};
  });
  for(const key of ['invalid','duplicate','immutable','stopped','returned'])assert(report[key],JSON.stringify(report));assert.equal(report.cargo,10);
  await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(n=>n.name==='v39-logistics-routes'&&n.list.some(c=>c.name==='v39-logistics-stop')));
  await page.evaluate(()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],layer=scene.children.list.find(n=>n.name==='v39-logistics-routes');layer.list.find(c=>c.name==='v39-logistics-stop').emit('pointerdown');});
  assert.match(await page.locator('#footLogistics output').innerText(),/経路/);
  await page.screenshot({path:'output/web-game/logistics-routes/stopped-390.png'});
  const hidden=await page.evaluate(async()=>{
    await window.setV39TestMode(false);window.isV39TileExplored=()=>false;window.activateV39FooterTab('logistics');
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],layer=scene.children.list.find(n=>n.name==='v39-logistics-routes');
    return layer.list.filter(n=>n.name==='v39-logistics-route-line').every(n=>n.getData('visibleSegments')===0);
  });assert(hidden);
  await page.locator('[data-logistics-new]').click();
  await page.evaluate(()=>{const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:s.timeline.turnNumber+1}});});
  assert.equal(await page.locator('#v39-logistics-dialog').count(),0);assert(!await page.evaluate(()=>window.isV39MapInputLocked()));
  assert.deepEqual(errors,[]);console.log('blocked route preserves cargo, manual resume, safe return, stop marker/reason, fog clipping, duplicate turn and modal cleanup passed');
}finally{await browser.close();}
