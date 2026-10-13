import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/undead-fixture',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39UndeadTest);
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.activateV39FooterTab('test');});
    await page.locator('[data-test-action="undead-test-start"]').click();
    await page.waitForFunction(()=>window.__v39FieldRuntime.mapData.undeadTestFixture===true);
    const initial=await page.evaluate(()=>{
      const state=window.getV39GameState(),worlds=window.captureV39ExplorationWorlds();
      return {units:state.players[0].factionState.units.map(unit=>({id:unit.id,world:unit.worldId,hp:unit.hp})),
        worlds:Object.fromEntries(Object.entries(worlds).map(([id,world])=>[id,{corpses:world.spatial.groundLootByTile,enemies:world.spatial.enemies.length,purity:world.map.purificationByTile,mine:world.map.caveMine}]))};
    });
    assert.equal(initial.units.length,2);assert(initial.units.every(unit=>unit.hp>0));
    assert.deepEqual(initial.units.map(unit=>unit.world),['surface','cave:undead-test:1']);
    for(const world of Object.values(initial.worlds)){assert.equal(world.enemies,0);assert.deepEqual(world.purity,{});assert.equal(Object.keys(world.corpses).length,3);assert(!world.mine);}
    const advance=async(count)=>page.evaluate(async(count)=>{
      for(let i=0;i<count;i++)if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw Error('turn failed');
      await window.waitForV39MapRenderSettled();
    },count);
    await advance(4);
    const threshold=await page.evaluate(()=>Object.values(window.captureV39ExplorationWorlds()).map(world=>Object.values(world.map.purificationByTile)));
    assert(threshold.every(values=>values.length===3&&values.every(value=>value===-4)),'both worlds decay while one is inactive');
    let spawned=[];
    for(let turn=0;turn<50;turn++) {
      await advance(1);
      spawned=await page.evaluate(()=>Object.values(window.captureV39ExplorationWorlds()).map(world=>({enemies:world.spatial.enemies.length,remaining:Object.values(world.spatial.groundLootByTile).reduce((sum,loot)=>sum+(loot.cargo?.resourcesByType?.死体||0),0)})));
      if(spawned.every(world=>world.enemies>0&&world.remaining<700))break;
    }
    assert(spawned.every(world=>world.enemies>0&&world.remaining<700),'normal random events consume real corpses in both worlds');
    await page.locator('[data-test-action="undead-test-cave"]').click();
    await page.waitForFunction(()=>window.getV39GameState().activeWorldId==='cave:undead-test:1');
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),'undead-test-cave');
    assert.equal(await page.locator('[data-undead-test-world]').count(),2);
    await page.screenshot({path:`output/web-game/undead-fixture/cave-${width}.png`});
    await page.locator('[data-test-action="undead-test-surface"]').click();
    await page.waitForFunction(()=>window.getV39GameState().activeWorldId==='surface');
    assert.equal(await page.evaluate(()=>window.getV39SelectedSquadUnit().id),'undead-test-surface');
    await page.evaluate(()=>{const save=window.getV39GameState();window.setV39GameState(JSON.parse(JSON.stringify(save)),{silent:true});});
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.length),2);
    await page.screenshot({path:`output/web-game/undead-fixture/surface-${width}.png`});
    assert.deepEqual(errors,[]);await page.close();
    console.log(`${width}: two actors, corpses, inactive world decay, fog, conversion, world switch and save passed`);
  }
}finally{await browser.close();}

