import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";

mkdirSync('output/web-game/coordinate-ruler',{recursive:true});
const browser=await chromium.launch();
try {
  for (const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();window.activateV39FooterTab('squad');});
    await page.waitForSelector('#v39-coordinate-ruler span');
    await page.locator('[data-squad-select="solo"]').click();
    const badge=page.locator('[data-v39-unit-id="expedition-test-carrier"] .squad-pos .v39-auto-operation-icon');
    assert.equal(await badge.textContent(),'🔁');
    await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      scene.v39Input.selectTile({x:6,y:5});
      scene.cameras.main.setZoom(scene.cameras.main.zoom*2).centerOn(434,317);
    });
    await page.waitForTimeout(150);
    const selected=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main;
      const origin=camera.getWorldPoint(0,0),label=document.querySelector('.v39-coordinate-x.selected');
      return {x:label?.dataset.coordinate,y:document.querySelector('.v39-coordinate-y.selected')?.dataset.coordinate,
        left:parseFloat(label?.style.left),expected:(6*62+31+31-origin.x)*camera.zoom};
    });
    assert.equal(selected.x,'6');assert.equal(selected.y,'5');assert.ok(Math.abs(selected.left-selected.expected)<1);
    await page.screenshot({path:`output/web-game/coordinate-ruler/field-${width}.png`});
    await page.evaluate(()=>{
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id==='expedition-test-carrier'
        ? {...unit,caveDuty:{...unit.caveDuty,status:'停止：通路が塞がれています'}}:unit)},{reason:'ruler-badge-test'});
    });
    await page.waitForFunction(()=>document.querySelector('[data-v39-unit-id="expedition-test-carrier"] .v39-auto-operation-icon')?.textContent==='⚠');
    for (const [assignment,icon] of [[{caveDuty:{duty:'guard',status:'入口警備中'}},'🛡'],
      [{caveDuty:null,transportAssignment:{enabled:true,status:'returning'}},'🔁'],
      [{caveDuty:null,transportAssignment:null},null]]) {
      await page.evaluate(patch=>{
        const faction=window.getV39ActiveFactionState();
        window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id==='expedition-test-carrier'?{...unit,...patch}:unit)});
      },assignment);
      await page.waitForFunction(expected=>(document.querySelector('[data-v39-unit-id="expedition-test-carrier"] .v39-auto-operation-icon')?.textContent||null)===expected,icon);
    }
    await page.evaluate(()=>{
      window.activateV39FooterTab('manage');document.getElementById('v39-manage-display-settings').click();
    });
    await page.locator('#v39-show-coordinate-ruler').uncheck();
    await page.waitForFunction(()=>document.getElementById('v39-coordinate-ruler').hidden);
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('v39-display-settings-v1')).showCoordinateRuler),false);
    await page.reload({waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    await page.evaluate(()=>{window.closeV39PlayModeSelection();window.startV39ExpeditionTest();});
    await page.waitForSelector('#v39-coordinate-ruler',{state:'attached'});
    assert.equal(await page.locator('#v39-coordinate-ruler').isVisible(),false);
    await page.evaluate(()=>{window.activateV39FooterTab('manage');document.getElementById('v39-manage-display-settings').click();});
    await page.locator('#v39-show-coordinate-ruler').check();
    await page.evaluate(()=>window.viewV39ExpeditionTestWorld('cave:expedition-test:1'));
    await page.waitForSelector('#v39-coordinate-ruler span');
    assert.equal(await page.locator('#v39-coordinate-ruler').count(),1);
    assert.deepEqual(errors,[]);
    console.log(`${width}: coordinate alignment, zoom, selected hex row, OFF persistence, layer cleanup and automatic-operation badge passed`);
    await page.close();
  }
} finally {await browser.close();}
