import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/cave-logistics-visibility';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState()?.logisticsRoutes?.length===4);
    const owner=await page.evaluate(()=>window.getV39ActivePlayerId());
    const read=()=>page.evaluate(owner=>{
      const s=window.getV39GameState(),f=s.players.find(p=>p.id===owner).factionState,r=f.logisticsRoutes.find(r=>r.name==='洞窟鉱床便');
      return {world:s.activeWorldId,route:r,units:f.units.filter(u=>r.memberIds.includes(u.id)).map(u=>({id:u.id,world:u.worldId,x:u.x,y:u.y})),iron:f.settlements[0].materialStockByType.鉄,
        cargo:f.squads.find(s=>s.id==='logistics-test-cave').cargoByUnitId?.[r.leaderId]?.resourcesByType||{}};
    },owner);
    const initial=await read();assert.equal(initial.cargo.鉄,10);
    await page.locator(`[data-logistics-select="${initial.route.id}"]`).click();
    assert.match(await page.locator('.logistics-detail').innerText(),/洞窟入口と搬送先拠点/);
    const line=()=>page.evaluate(id=>{
      const layer=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-logistics-routes');
      const g=layer?.list.find(n=>n.name==='v39-logistics-route-line'&&n.getData('routeId')===id);
      return {projected:g?.getData('projected'),segments:g?.getData('visibleSegments'),path:g?.getData('path')?.length,label:layer?.list.some(n=>n.name==='v39-logistics-underground'),
        styles:layer?.list.filter(n=>n.name==='v39-logistics-route-line'&&n.getData('ownerPlayerId')===window.getV39ActivePlayerId()).map(n=>({...n.getData('routeStyle'),objectAlpha:n.alpha,parentAlpha:layer.alpha}))};
    },initial.route.id);
    const projected=await line();assert(projected.projected&&projected.segments>0&&projected.path>0&&projected.label);
    assert(projected.styles.every(s=>s.alpha===1&&s.objectAlpha===1&&s.parentAlpha===1),'routes have no object or parent transparency');
    assert(projected.styles.every(s=>s.width>=4&&s.arrowLength===18&&s.arrowHalfWidth===8),'larger route strokes and filled arrowheads');
    assert(projected.styles.every(s=>s.color===0x5ad4ff),'routes share their player color');
    assert(projected.styles.some(s=>s.outline===0xffffff&&s.width===5),'selection uses a white outline');
    assert(projected.styles.some(s=>s.outline===0x10232c&&s.width===4),'other routes use a dark outline');
    await page.screenshot({path:`${out}/surface-${width}.png`});
    const fog=await page.evaluate(()=>{
      const test=window.isV39TestMode,explored=window.isV39TileExplored;
      window.isV39TestMode=()=>false;window.isV39TileExplored=()=>false;window.activateV39FooterTab('logistics');
      const layer=window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(n=>n.name==='v39-logistics-routes');
      const hidden=layer.list.filter(n=>n.name==='v39-logistics-route-line').every(n=>n.getData('visibleSegments')===0)&&!layer.list.some(n=>n.name==='v39-logistics-underground');
      window.isV39TestMode=test;window.isV39TileExplored=explored;window.activateV39FooterTab('logistics');return hidden;
    });assert(fog,'projected routes must not reveal unexplored tiles');
    await page.locator('[data-logistics-world="unit"]').click();
    await page.waitForFunction(()=>window.getV39GameState().activeWorldId==='cave:expedition-test:1');
    await page.waitForSelector('#footLogistics [data-logistics-world="surface"]');
    const cave=await read();assert.deepEqual(cave.units,initial.units);assert.deepEqual(cave.cargo,initial.cargo);
    assert.equal((await line()).projected,false);
    await page.screenshot({path:`${out}/underground-${width}.png`});
    await page.locator('[data-logistics-world="surface"]').click();
    await page.waitForFunction(()=>window.getV39GameState().activeWorldId==='surface');
    await page.waitForSelector('#footLogistics [data-logistics-world="unit"]');
    assert((await line()).projected);assert.deepEqual((await read()).units,initial.units);
    let appeared=false,delivered=false;
    for(let i=0;i<24;i++) {
      const before=await read();await page.evaluate(()=>window.advanceV39Turn({skipUnactedFocus:true}));
      const next=await read();appeared ||=next.units.every(u=>u.world==='surface');
      if(next.route.status==='搬入完了') {assert(next.iron>=before.iron+10);assert(!next.cargo.鉄);delivered=true;break;}
    }
    assert(appeared&&delivered,'normal turn must physically bring the cave party to the surface and deliver iron');
    assert.equal(await page.evaluate(()=>window.viewV39OwnedUnitWorld('not-owned')),false);
    assert.deepEqual(errors,[]);console.log(`${width}: underground indicator, projected surface path, owned-world view/return without teleport, native cave exit/delivery passed`);
    await page.close();
  }
}finally{await browser.close();}
