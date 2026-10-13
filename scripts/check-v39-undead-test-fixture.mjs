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
        worlds:Object.fromEntries(Object.entries(worlds).map(([id,world])=>[id,{corpses:world.spatial.groundLootByTile,enemies:world.spatial.enemies.filter(u=>u.hp>0).length,bodies:world.spatial.enemies.filter(u=>u.state==='死亡'),purity:world.map.purificationByTile,mine:world.map.caveMine}]))};
    });
    assert.equal(initial.units.length,2);assert(initial.units.every(unit=>unit.hp>0));
    assert.deepEqual(initial.units.map(unit=>unit.world),['surface','cave:undead-test:1']);
    for(const world of Object.values(initial.worlds)){assert.equal(world.enemies,0);assert.deepEqual(world.purity,{});assert.equal(Object.keys(world.corpses).length,3);assert.equal(world.bodies.length,3);assert(world.bodies.every(u=>u.hp===0&&u.derivedCharacter.ok));assert(!world.mine);}
    assert.equal(initial.worlds.surface.bodies.find(u=>u.id==='undead-corpse-ogre').derivedCharacter.classLevels,7);
    assert.equal(initial.worlds['cave:undead-test:1'].bodies.find(u=>u.id==='undead-corpse-bare-ogre').equipment.length,0);
    await page.waitForFunction(()=>window.getV39MapEntityMarker('undead-corpse-human')?.list.some(child=>child.type==='Text'&&child.text==='×'));
    await page.screenshot({path:`output/web-game/undead-fixture/initial-${width}.png`});
    const advance=async(count)=>page.evaluate(async(count)=>{
      for(let i=0;i<count;i++)if(!await window.advanceV39Turn({skipUnactedFocus:true}))throw Error('turn failed');
      await window.waitForV39MapRenderSettled();
    },count);
    await advance(4);
    const threshold=await page.evaluate(()=>Object.values(window.captureV39ExplorationWorlds()).map(world=>Object.values(world.map.purificationByTile)));
    assert(threshold.every(values=>values.length===6&&values.every(value=>value===-4)),'both worlds decay while one is inactive');
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
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.evaluate(async()=>{const result=window.startV39UndeadTest();if(!result.ok)throw Error(result.reason);await window.waitForV39MapRenderSettled();});
    for(const [world,id,x,y,race,level] of [['surface','undead-corpse-human',5,4,'只人',14],['cave','undead-corpse-goblin',4,4,'ゴブリン',13]]) {
      if(world==='cave'){
        await page.waitForFunction(()=>!window.isV39MapInputLocked());
        await page.evaluate(()=>window.activateV39FooterTab('test'));
        await page.locator('[data-test-action="undead-test-cave"]').click();
        await page.waitForFunction(()=>window.getV39GameState().activeWorldId==='cave:undead-test:1');
      }
      await page.evaluate(async()=>{window.activateV39FooterTab('squad');document.querySelector('[data-squad-detail-tab="action"]')?.click();await window.waitForV39MapRenderSettled();});
      await page.locator('#detailTechniqueList [data-v39-attack-name="TEST_死者の呼び声"]').click();
      await page.evaluate(async([x,y])=>{window.executeV39AttackAt(x,y);window.executeV39AttackAt(x,y);await window.advanceV39Turn({skipUnactedFocus:true});await window.waitForV39MapRenderSettled();},[x,y]);
      const raised=await page.evaluate(id=>window.getV39ActiveFactionState().units.find(u=>u.undeadOrigin?.unitId===id),id);
      if(!raised)console.log(await page.evaluate(()=>({session:window.getV39AttackSession(),timeline:window.getV39GameState().timeline,runtime:window.getV39ActiveFactionState().combatRuntime,body:window.getV39GameState().enemies.map(u=>({id:u.id,hp:u.hp,x:u.x,y:u.y})),banner:document.getElementById('modeBanner')?.textContent})));
      assert(raised,`fixture corpse selectable by death-call: ${world}`);assert.equal(raised.race,race);assert.equal(raised.level,level);assert.equal(raised.equipment[0].name,'剣');
      assert.equal(await page.evaluate(id=>window.getV39GameState().enemies.some(u=>u.id===id),id),false);
      await page.screenshot({path:`output/web-game/undead-fixture/raised-${world}-${width}.png`});
    }
    assert.deepEqual(errors,[]);await page.close();
    console.log(`${width}: two actors, corpses, inactive world decay, fog, conversion, world switch and save passed`);
  }
}finally{await browser.close();}

