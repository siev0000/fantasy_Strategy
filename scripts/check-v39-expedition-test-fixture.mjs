import {openV39TestSuite} from './lib/v39-test-suite.mjs';
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
    // Preserve the full shared builder regression; user-facing fixtures are split by profile.
    await page.evaluate(()=>window.startV39ExpeditionTest());
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
    if(process.env.V39_PRODUCTION_CHECK!=='1') {
      const inspection=await page.evaluate(async()=>{
        const tools=await import('/src/lib/v39-expedition-tools.js');
        const state=window.getV39GameState({includeWorlds:false}),player=state.players.find(row=>row.id===state.activePlayerId);
        const base=player.factionState.settlements[0],unit=player.factionState.units.find(row=>row.id==='expedition-test-medic');
        Object.assign(unit,{x:base.x,y:base.y,worldId:'surface',ap:100,currentAp:100,waitTurnNumber:-1,
          equipment:[{slot:'体',name:'判定試験用',source:{道具枠:3}}],defaultToolLoadout:[{name:'水薬',count:3}],
          toolStockByType:{水薬:0},expeditionCargoByType:{水薬:1}});
        player.factionState.squads=[];base.toolStockByType={};state.timeline.phase='player';state.activeWorldId='surface';
        const map={caveSites:[{id:'inspection-herb',x:unit.x,y:unit.y,discovered:true,kind:'herb',toolHarvestRemaining:1}]};
        const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
        freeze(state);freeze(map);
        const before=JSON.stringify([state,map]),checks=[
          tools.inspectV39ExpeditionReplenishment(state,player.id,unit.id,map,'水薬'),
          tools.inspectV39ExpeditionGather(state,player.id,unit.id,map,'inspection-herb'),
          tools.inspectV39ExpeditionDeposit(state,player.id,unit.id)
        ];
        const demand=(ok,message)=>{if(!ok)throw Error(message);};
        demand(checks.every(row=>row.ok&&!('state' in row)&&!('map' in row)),'inspection must not construct updated state');
        for(let i=0;i<20;i++){
          tools.inspectV39ExpeditionReplenishment(state,player.id,unit.id,map,'水薬');
          tools.inspectV39ExpeditionGather(state,player.id,unit.id,map,'inspection-herb');
          tools.inspectV39ExpeditionDeposit(state,player.id,unit.id);
        }
        const refill=tools.replenishV39ExpeditionTools(state,player.id,unit.id,map,'水薬');
        demand(refill.ok&&refill.state.players.find(row=>row.id===player.id).factionState.units.find(row=>row.id===unit.id).toolStockByType.水薬===1,'execution must still replenish once');
        const gather=tools.gatherV39ExpeditionHerbs(state,player.id,unit.id,map,'inspection-herb');
        demand(gather.ok&&gather.map.caveSites[0].toolHarvestRemaining===0,'execution must still consume harvest stock');
        demand(!tools.inspectV39ExpeditionGather(gather.state,player.id,unit.id,gather.map,'inspection-herb').ok,'depleted harvest is unavailable');
        const deposit=tools.depositV39ExpeditionCargo(state,player.id,unit.id);
        demand(deposit.ok&&deposit.state.players.find(row=>row.id===player.id).factionState.settlements[0].toolStockByType.水薬===1,'execution must deposit cargo once');
        const rejected=structuredClone(state);rejected.players.find(row=>row.id===player.id).factionState.units.find(row=>row.id===unit.id).ap=0;
        const check=tools.inspectV39ExpeditionGather(rejected,player.id,unit.id,map,'inspection-herb'),attempt=tools.gatherV39ExpeditionHerbs(rejected,player.id,unit.id,map,'inspection-herb');
        demand(!check.ok&&!attempt.ok&&check.reason===attempt.reason&&attempt.state===rejected,'inspection and execution must share rejection rules');
        demand(JSON.stringify([state,map])===before,'inspection and execution must not mutate input');
        return 'read-only refill/gather/deposit, frozen inputs, execution parity and depletion passed';
      });
      console.log(`${width}: ${inspection}`);
    }
    const support=await page.evaluate(()=>Object.fromEntries(window.getV39ActiveFactionState().units
      .filter(unit=>unit.squadId==='expedition-support').map(unit=>[unit.id,window.applyV39TerrainModifiers(unit).squadSupportModifiers])));
    assert.deepEqual(support['expedition-test-king'],{攻撃:5,防御:5,命中:5});
    assert.deepEqual(support['expedition-test-knight'],{攻撃:15,防御:15,精神:10,命中:5});
    await page.evaluate(()=>{
      window.activateV39FooterTab('interaction');
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:10,y:5,terrain:'平地'}}));
      window.openV39VillageMenu(window.getV39GameState().neutralVillages[0].id);
    });
    assert.equal(await page.locator('[data-event-id="VILLAGE_SUPPORT_CONSTRUCTION"]').count(),1);
    await page.locator('[data-event-id="VILLAGE_SUPPORT_DEFENSE"]').click();
    assert.equal(await page.evaluate(()=>window.getV39GameState().neutralVillages[0].questsByPlayerId[window.getV39GameState().activePlayerId].type),'watch');
    await page.locator('[data-close-village-menu]').click();
    await page.evaluate(()=>window.activateV39FooterTab('test'));
    await page.locator('[data-test-suite=logistics]>summary').click();
    await page.locator('[data-test-action="expedition-mine"]').click();
    await page.evaluate(()=>{window.activateV39FooterTab('squad');document.querySelector('[data-squad-detail-tab="basic"]')?.click();window.refreshV39ExpeditionTools();});
    const recovery=await page.evaluate(()=>{
      const card=document.querySelector('[data-v39-cave-site="expedition-test-herb"]');
      if(!card)throw new Error('native recovery card is missing');
      card.classList.add('is-expanded');card.setAttribute('aria-expanded','true');
      const button=card.querySelector('[data-v39-system-use]');button.focus();
      for(let index=0;index<4;index++)window.dispatchEvent(new CustomEvent('v39:squad-detail-rendered'));
      return {same:card===document.querySelector('[data-v39-cave-site="expedition-test-herb"]'),focus:document.activeElement===button,
        expanded:card.getAttribute('aria-expanded')};
    });
    assert(recovery.same&&recovery.focus&&recovery.expanded==='true','unchanged cave recovery card keeps focus and expanded state');
    await page.locator('[data-expedition-tool="use-水薬"]').click();
    const preserved=await page.evaluate(async()=>{
      const card=document.querySelector('[data-expedition-tool="use-水薬"]'),button=card.querySelector('button');
      button.focus();window.refreshV39ExpeditionTools();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {same:card===document.querySelector('[data-expedition-tool="use-水薬"]'),focus:document.activeElement===button,expanded:card.getAttribute('aria-expanded')};
    });
    assert(preserved.same&&preserved.focus,'unchanged tool refresh preserves card and focus');assert.equal(preserved.expanded,'true');
    await page.locator('[data-expedition-tool="use-水薬"]').getByRole('button',{name:'実行',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-medic').toolStockByType.水薬),1);
    await page.screenshot({path:`output/web-game/expedition-fixture/tools-${width}.png`});
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children
      .getByName('v39-structure-layer').list.length),0,'surface buildings must not appear underground');
    await page.evaluate(()=>window.activateV39FooterTab('tile'));
    await page.selectOption('#v39-mine-duty-unit','expedition-test-guard');
    const mineControls=await page.evaluate(async()=>{
      const unit=document.getElementById('v39-mine-duty-unit'),settlement=document.getElementById('v39-mine-duty-settlement'),option=unit.selectedOptions[0];unit.focus();
      for(let i=0;i<5;i++)window.dispatchEvent(new CustomEvent('v39:squad-detail-rendered'));
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return {unit:unit===document.getElementById('v39-mine-duty-unit'),settlement:settlement===document.getElementById('v39-mine-duty-settlement'),
        option:option===unit.selectedOptions[0],value:unit.value,focus:document.activeElement===unit};
    });
    assert(mineControls.unit&&mineControls.settlement&&mineControls.option&&mineControls.focus,'mine controls retain DOM selection and focus');
    assert.equal(mineControls.value,'expedition-test-guard');
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
    await page.evaluate(()=>window.activateV39FooterTab('tile'));
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
    await openV39TestSuite(page,'logistics');await page.locator('[data-test-action="expedition-invasion"]').click();
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
