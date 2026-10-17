import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/squad-membership';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [320,390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.setDefaultTimeout(10000);
    page.on('pageerror',error=>{errors.push(String(error));console.error(String(error));});
    await page.goto(process.env.V39_TEST_URL || 'http://127.0.0.1:3000',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();
      const base=window.getV39ActiveFactionState().units[0];
      const units=['a','b','free','busy'].map((id,index)=>({...base,id,name:{a:'剣士',b:'弓兵',free:'単独兵',busy:'警備担当'}[id],squadId:id==='free'?'solo':id==='a'?'alpha':'beta',hp:100,currentHp:100,ap:100,currentAp:100,x:3+index,y:3,worldId:'surface',tradeAssignment:undefined,transportAssignment:undefined,caveDuty:id==='busy'?{role:'guard'}:undefined}));
      window.updateV39ActiveFactionState({units,squads:[{id:'alpha',label:'第一部隊',unitIds:['a']},{id:'beta',label:'第二部隊',unitIds:['b','busy']},{id:'solo',label:'単独',unitIds:['free']}],recruitInstructorByTile:{},recruitInstructorTransfers:{}});
    });
    await page.waitForFunction(()=>!window.isV39MapInputLocked?.());
    await page.evaluate(()=>window.openV39SquadEditor({squadId:'alpha'}));
    const row=id=>page.locator(`[data-squad-edit-unit="${id}"]`);
    assert(await row('a').isVisible());assert(await row('free').isVisible());assert(await row('b').isHidden());
    await page.locator('[data-squad-member-filter="all"]').click();
    assert(await row('b').isVisible());assert(await row('busy').isDisabled());
    const busy=await row('busy').locator('..').innerText();assert.match(busy,/所属：第二部隊/);assert.match(busy,/自動任務中/);
    await row('b').check();
    await page.locator('#v39-squad-edit-name').fill('第一部隊改');
    assert.match(await page.locator('#v39-squad-edit-changes').innerText(),/第二部隊 → 第一部隊改/);
    await page.locator('[data-squad-member-filter="available"]').click();
    assert(await row('b').isVisible(),'selected transfers stay visible');assert(await row('b').isChecked());
    assert.equal(await page.locator('#v39-squad-edit-name').inputValue(),'第一部隊改');
    await page.screenshot({path:`${out}/transfer-${width}.png`});
    await page.locator('[data-squad-edit-close]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='b').squadId),'beta','cancel leaves membership unchanged');
    await page.evaluate(()=>window.openV39SquadEditor({squadId:'alpha'}));
    await page.locator('[data-squad-member-filter="all"]').click();await row('b').check();
    await page.locator('[data-squad-edit-save]').click();
    const result=await page.evaluate(()=>window.getV39ActiveFactionState());
    assert.deepEqual(result.squads.find(squad=>squad.id==='alpha').unitIds,['a','b']);
    assert.deepEqual(result.squads.find(squad=>squad.id==='beta').unitIds,['busy']);
    assert.equal(result.units.find(unit=>unit.id==='b').ap,100);assert.equal(result.units.find(unit=>unit.id==='b').x,4);
    await page.evaluate(()=>window.openV39SquadEditor({squadId:''}));
    assert(await row('free').isVisible());assert(await row('a').isHidden());
    await page.screenshot({path:`${out}/new-${width}.png`});
    await page.locator('#v39-squad-edit-target').selectOption('alpha');
    await row('a').uncheck();
    assert.match(await page.locator('#v39-squad-edit-changes').innerText(),/単独/);
    await page.locator('[data-squad-edit-save]').click();
    assert.equal(await page.evaluate(()=>window.getV39ActiveFactionState().units.find(unit=>unit.id==='a').squadId),'solo');
    assert.deepEqual(errors,[]);console.log(`${width}: default candidates, affiliation, restrictions, transfer preview, cancel/save and removal passed`);
    await page.close();
  }
} finally {await browser.close();}
