import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

const browser=await chromium.launch();
mkdirSync("output/web-game/expedition-fixture",{recursive:true});
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on("pageerror",error=>errors.push(String(error)));
    page.on("dialog",dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||"http://127.0.0.1:3022",{waitUntil:"networkidle"});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.activateV39FooterTab("test");});
    await page.locator('[data-test-action="expedition-start"]').click();
    await page.waitForFunction(()=>window.__v39FieldRuntime.mapData.expeditionTestFixture===true);
    await page.waitForTimeout(300);
    const before=await page.evaluate(()=>{
      const state=window.getV39GameState(),faction=window.getV39ActiveFactionState();
      return {count:faction.units.length,mine:state.explorationWorlds['cave:expedition-test:1'].map.caveMine,
        duty:faction.units.find(unit=>unit.id==='expedition-test-carrier').caveDuty,
        base:faction.settlements[0],village:state.neutralVillages[0]};
    });
    assert.equal(before.count,6);assert.equal(before.duty.duty,'transport');assert.equal(before.mine.stockByResource.宝石,5);
    assert.equal(before.village.name,'依頼検証村');
    const support=await page.evaluate(()=>Object.fromEntries(window.getV39ActiveFactionState().units
      .filter(unit=>unit.squadId==='expedition-support').map(unit=>[unit.id,window.applyV39TerrainModifiers(unit).squadSupportModifiers])));
    assert.deepEqual(support['expedition-test-king'],{攻撃:5,防御:5,命中:5});
    assert.deepEqual(support['expedition-test-knight'],{攻撃:15,防御:15,精神:10,命中:5});
    await page.evaluate(()=>{
      window.activateV39FooterTab('tile');
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:10,y:5,terrain:'平地'}}));
    });
    assert.equal(await page.locator('[data-event-id="VILLAGE_SUPPORT_CONSTRUCTION"]').count(),1);
    await page.locator('[data-event-id="VILLAGE_SUPPORT_DEFENSE"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages[0].questsByPlayerId[window.getV39GameState().activePlayerId].type),'watch');
    await page.evaluate(()=>window.activateV39FooterTab('test'));
    await page.locator('[data-test-action="expedition-mine"]').click();
    await page.evaluate(()=>{window.activateV39FooterTab('squad');document.querySelector('[data-squad-detail-tab="action"]')?.click();window.refreshV39ExpeditionTools();});
    await page.locator('[data-expedition-tool="use-水薬"]').click();
    await page.locator('[data-expedition-tool="use-水薬"]').getByRole('button',{name:'実行',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-medic').toolStockByType.水薬),1);
    await page.screenshot({path:`output/web-game/expedition-fixture/tools-${width}.png`});
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children
      .getByName('v39-structure-layer').list.length),0,'surface buildings must not appear underground');
    const delivery=await page.evaluate(async()=>{
      let delivered=false;
      for(let n=0;n<8;n++){
        await window.advanceV39Turn({skipUnactedFocus:true});
        if(window.getV39ActiveFactionState().settlements[0].materialStockByType.鉄>100){delivered=true;break;}
      }
      const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);
      return {delivered,world:window.getV39GameState().activeWorldId,units:window.getV39ActiveFactionState().units.length};
    });
    assert.equal(delivery.delivered,true);assert.equal(delivery.units,6);
    await page.selectOption('#v39-mine-duty-unit','expedition-test-carrier');
    await page.locator('[data-mine-duty="none"]').click();
    await page.selectOption('#v39-mine-duty-unit','expedition-test-guard');
    await page.locator('[data-mine-duty="guard"]').click();
    const guard=await page.evaluate(async()=>{
      for(let n=0;n<8;n++)await window.advanceV39Turn({skipUnactedFocus:true});
      return window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-guard');
    });
    assert.equal(guard.worldId,'surface');assert.equal(guard.x,8);assert.equal(guard.y,5);
    await page.evaluate(()=>window.activateV39FooterTab('test'));
    await page.locator('[data-test-action="expedition-invasion"]').click();
    const invaded=await page.evaluate(async()=>{
      for(let n=0;n<9;n++)await window.advanceV39Turn({skipUnactedFocus:true});
      const state=window.getV39GameState(),cave=state.explorationWorlds['cave:expedition-test:1'];
      return {mine:!!cave.map.caveMine,bosses:cave.map.caveBossIds,nests:cave.spatial.enemyNests.length};
    });
    assert.equal(invaded.mine,false);assert.ok(invaded.bosses.length>0);assert.ok(invaded.nests>0);
    await page.screenshot({path:`output/web-game/expedition-fixture/surface-${width}.png`});
    await page.evaluate(async()=>{await window.setV39TestMode(false);});
    assert.equal(await page.evaluate(()=>window.startV39ExpeditionTest().ok),false);
    assert.deepEqual(errors,[]);
    console.log(`${width}: actual fixture buttons, tools, native transport, save/load, real invasion/re-nesting, mode isolation passed`);
    await page.close();
  }
}finally{await browser.close();}
