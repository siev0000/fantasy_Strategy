import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
mkdirSync('output/web-game/squad-edit-follow',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39ExpeditionTest);
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const faction=window.getV39ActiveFactionState(),source=faction.units[0];
      const units=Array.from({length:6},(_,i)=>({...source,id:`crew${i+1}`,name:`編制試験${i+1}`,x:8-i,y:10,position:[8-i,10],
        worldId:'surface',squadId:'solo',solo:false,isSolo:false,ap:1000,currentAp:1000,maxAp:1000,actionPoint:1000,
        isSovereign:false,isNamed:true,unitType:'個体',caveDuty:undefined,transportAssignment:undefined,movementHold:false,lastActionTurn:0,waitTurnNumber:0}));
      const map=structuredClone(window.__v39FieldRuntime.mapData);map.isUnderground=false;map.worldWrapEnabled=false;
      map.grid=map.grid.map((row,y)=>row.map(()=>y===10?'平地':'海'));map.heightLevelMap=map.grid.map(row=>row.map(()=>0));
      window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings,{layerChange:true});
      window.setV39GameState({enemies:[],neutralVillages:[]});
      window.updateV39ActiveFactionState({units,squads:[{id:'solo',label:'単独',unitIds:units.map(row=>row.id)}],selectedUnitId:'crew3',
        recruitInstructorByTile:{},recruitInstructorTransfers:{}});
      await window.waitForV39MapRenderSettled();window.activateV39FooterTab('squad');
    });
    assert.equal(await page.locator('#footSquad #v39-squad-edit').count(),0);
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator('[data-v39-character-tab="squad"]').click();
    await page.screenshot({path:`output/web-game/squad-edit-follow/character-entry-${width}.png`});
    await page.locator('#v39-squad-edit').click();
    assert.equal(await page.locator('#characterModal').evaluate(node=>node.classList.contains('open')),false);
    await page.locator('[data-squad-edit-close]').click();
    await page.waitForFunction(()=>document.getElementById('characterModal').classList.contains('open'));
    assert.equal(await page.locator('[data-v39-character-tab="squad"]').evaluate(node=>node.classList.contains('active')),true);
    await page.locator('#v39-squad-edit').click();
    await page.locator('#v39-squad-edit-name').fill('追従試験部隊');
    for(let i=1;i<=6;i++)await page.locator(`[data-squad-edit-unit="crew${i}"]`).check();
    assert.equal(await page.locator('[data-squad-edit-save]').isDisabled(),true);
    for(let i=4;i<=6;i++)await page.locator(`[data-squad-edit-unit="crew${i}"]`).uncheck();
    await page.locator('#v39-squad-edit-leader').selectOption('crew1');
    await page.locator('#v39-squad-edit-formation').selectOption('front-two');
    await page.screenshot({path:`output/web-game/squad-edit-follow/editor-${width}.png`});
    await page.locator('[data-squad-edit-save]').click();
    await page.waitForFunction(()=>document.getElementById('characterModal').classList.contains('open'));
    await page.locator('#characterModal [data-close]').click();
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    const created=await page.evaluate(()=>window.getV39ActiveFactionState());
    const squad=created.squads.find(row=>row.label==='追従試験部隊');
    assert.deepEqual(squad.unitIds,['crew1','crew2','crew3']);assert.equal(squad.movementLeaderId,'crew1');
    assert.deepEqual(created.units.slice(0,2).map(row=>[row.x,row.y,row.ap]),[[8,10,1000],[7,10,1000]],'already assembled units do not spend AP');
    assert.equal(new Set(created.units.slice(0,3).map(row=>`${row.x},${row.y}`)).size,3,'gather does not stack units');
    assert(created.units[2].ap<1000&&created.units[2].squadMoveMode==='follow','distant recruit spends AP to assemble before following');
    const moved=await page.evaluate(async()=>{
      window.updateV39ActiveFactionState({selectedUnitId:'crew3'});
      window.refreshV39SquadDerivedUI();
      if(!window.startV39SelectedUnitMove())throw new Error('surface follower selection move');
      if(!window.getV39UnitMovePreview().reachable.some(row=>row.key==='9,10'))throw new Error('surface leader range');
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:9,y:10}}));
      document.getElementById('moveOk').click();
      await window.waitForV39MapRenderSettled();
      for(let i=0;i<100&&window.isV39MapInputLocked();i++)await new Promise(resolve=>setTimeout(resolve,50));
      return window.getV39ActiveFactionState();
    });
    assert.equal(moved.units[0].x,9);
    assert.deepEqual(moved.units.slice(0,3).map(row=>[row.x,row.y]).sort((a,b)=>a[0]-b[0]),[[7,10],[8,10],[9,10]],'narrow formation may swap followers, without overlap');
    assert.equal(moved.selectedUnitId,'crew3');
    assert.ok(moved.units.slice(0,3).every(row=>row.ap<1000));
    assert.equal(moved.squads.find(row=>row.id===squad.id).formationType,'front-two');
    await page.locator('[data-v39-unit-id="crew3"]').click({button:'right'});
    await page.locator('#v39-cave-party-menu [data-movement-hold]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(row=>row.id==='crew3').movementHold),true);
    await page.locator('[data-v39-unit-id="crew3"]').click({button:'right'});
    await page.locator('#v39-cave-party-menu [data-movement-hold]').click();
    await page.locator('[data-v39-unit-id="crew2"]').click({button:'right'});
    await page.locator('#v39-cave-party-menu [data-movement-leader]').click();
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().squads.find(row=>row.label==='追従試験部隊').movementLeaderId),'crew2');
    await page.locator('[data-v39-unit-id="crew1"]').click({button:'right'});
    await page.locator('#v39-cave-party-menu [data-movement-leader]').click();
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().squads.find(row=>row.label==='追従試験部隊').movementLeaderId),'crew1');
    await page.evaluate(()=>window.openV39CharacterModal());
    await page.locator(`[data-v39-character-row="${squad.id}"]`).click();
    await page.locator(`[data-v39-character-squad-edit="${squad.id}"]`).click();
    await page.locator('[data-squad-edit-unit="crew2"]').uncheck();
    await page.locator('[data-squad-edit-save]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(row=>row.id==='crew2').squadId),'solo');
    await page.waitForFunction(()=>document.getElementById('characterModal').classList.contains('open'));
    await page.locator(`[data-v39-character-squad-edit="${squad.id}"]`).click();await page.locator('[data-squad-edit-disband]').click();
    await page.waitForFunction(()=>document.getElementById('characterModal').classList.contains('open'));
    assert.ok(await page.evaluate(()=>window.getV39ActiveFactionState().units.every(row=>row.squadId==='solo')));
    assert.deepEqual(errors,[]);
    console.log(`${width}: actual create/edit/disband, member cap, gather AP, surface following, narrow column, selection and save passed`);
    await page.close();
  }
}finally{await browser.close();}
