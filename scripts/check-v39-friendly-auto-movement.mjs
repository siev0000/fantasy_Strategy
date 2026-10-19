import assert from "node:assert/strict";
import {mkdirSync} from "node:fs";
import {chromium} from "file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs";
mkdirSync('output/web-game/friendly-auto-movement',{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3022',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39ExpeditionTest==='function');
    const waiting=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      window.viewV39ExpeditionTestWorld('cave:expedition-test:1');
      if(!window.assignV39MineDuty('expedition-test-guard','guard').ok)throw new Error('guard assignment');
      window.viewV39ExpeditionTestWorld('surface');
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id==='expedition-test-medic'
        ? {...unit,x:8,y:5,position:[8,5],worldId:'surface'}:unit)});
      for(let n=0;n<4;n++)await window.advanceV39Turn({skipUnactedFocus:true});
      const guard=window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-guard');
      window.updateV39ActiveFactionState({selectedUnitId:guard.id});window.activateV39FooterTab('squad');
      document.querySelector('[data-squad-select="solo"]')?.click();document.querySelector('[data-squad-detail-tab="action"]')?.click();
      return guard;
    });
    assert.equal(waiting.caveDuty.status,'味方ユニットの移動待ち');
    assert.notDeepEqual([waiting.x,waiting.y],[4,3]);assert.notDeepEqual([waiting.x,waiting.y],[8,5]);
    await page.locator('[data-v39-unit-id="expedition-test-guard"]').click();
    await page.locator('#squadMemberList [data-v39-unit-id="expedition-test-guard"]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({path:`output/web-game/friendly-auto-movement/waiting-${width}.png`});
    const resumed=await page.evaluate(async()=>{
      const faction=window.getV39ActiveFactionState();
      window.updateV39ActiveFactionState({units:faction.units.map(unit=>unit.id==='expedition-test-medic'
        ? {...unit,x:3,y:2,position:[3,2],worldId:'cave:expedition-test:1'}:unit)});
      for(let n=0;n<2;n++)await window.advanceV39Turn({skipUnactedFocus:true});
      return window.getV39ActiveFactionState().units.find(unit=>unit.id==='expedition-test-guard');
    });
    assert.equal(resumed.caveDuty.status,'入口警備中');assert.deepEqual([resumed.x,resumed.y],[8,5]);
    assert.deepEqual(errors,[]);console.log(`${width}: native guard approaches occupied goal without overlap and resumes automatically`);
    await page.close();
  }
} finally {await browser.close();}
