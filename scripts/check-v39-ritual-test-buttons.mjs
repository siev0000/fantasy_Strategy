import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const browser=await chromium.launch(),output='output/web-game/ritual-test-buttons';
mkdirSync(output,{recursive:true});
const names=['none','one','two','three'];
async function openTools(page){
  await page.evaluate(()=>window.openV39TestTools());
  await page.locator('[data-test-tab="scenarios"]').click();
  const fold=page.locator('[data-test-section="expedition"]');
  if(!await fold.evaluate(el=>el.open))await fold.locator('summary').click();
}
try {
  for(const width of [390,1100])for(const stage of [1,2,3]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    let allow=false,dialogs=0;page.on('dialog',async d=>{dialogs++;if(allow)await d.accept();else await d.dismiss();});
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);});
    await openTools(page);
    const before=await page.evaluate(()=>JSON.stringify(window.getV39GameState()));
    await page.locator(`[data-test-action="ritual-test-${names[stage]}"]`).click();
    assert.equal(await page.evaluate(()=>JSON.stringify(window.getV39GameState())),before,'cancel overwrote game');
    allow=true;
    await page.locator(`[data-test-action="ritual-test-${names[stage]}"]`).click();
    await page.locator('[data-summon-option="フレイムエレメンタル"]').waitFor();
    const result=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId);return {ready:window.isV39CallTestReady(),buildings:p.factionState.settlements.find(b=>b.placed).buildings,world:s.activeWorldId};});
    assert.equal(result.ready,true);assert.equal(result.world,'surface');
    assert(result.buildings.includes(`火の儀式場${['','I','II','III'][stage]}`));
    assert.match(await page.locator('[data-facility-slot] option:checked').textContent(),new RegExp(`火の儀式場${['','I','II','III'][stage]}`));
    await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
    assert.equal(await page.locator('[data-summon-confirm]').isEnabled(),true);
    assert.match(await page.locator('.summon-detail').innerText(),new RegExp(`施設上限Lv${[0,10,20,25][stage]}`));
    await page.screenshot({path:`${output}/stage-${stage}-${width}.png`});
    assert.equal(dialogs,2,'fresh test needs replacement confirmation');
    if(stage===1){
      await page.locator('[data-summon-confirm]').click();
      await page.evaluate(()=>{const [key]=window.getV39FacilitySummonSelection().candidateTileKeys;const [x,y]=key.split(',').map(Number);window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x,y}}));});
      await page.locator('[data-facility-placement-confirm]').click();
      const runtime=await page.evaluate(()=>{const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),u=p.factionState.units.find(u=>u.summon?.kind==='facility');u.hp=0;u.currentHp=0;window.setV39GameState(s,{reason:'ritual-button-death'});window.runV39DeathLifecycle();const now=window.getV39GameState();return now.players.find(p=>p.id===now.activePlayerId).factionState.facilitySummonsBySlot;});
      for(const next of [2,3]){
        await openTools(page);await page.locator(`[data-test-action="ritual-test-${names[next]}"]`).click();
        await page.locator('[data-summon-option="フレイムエレメンタル"]').click();
        assert.match(await page.locator('.summon-detail footer').innerText(),/残り25T/);
        const after=await page.evaluate(()=>{const s=window.getV39GameState();return s.players.find(p=>p.id===s.activePlayerId).factionState.facilitySummonsBySlot;});
        assert.deepEqual(after,runtime,'stage button reset summon cooldown');
        assert.equal(dialogs,2,'stage change unexpectedly restarted test');
        await page.keyboard.press('Escape');
      }
      await page.evaluate(()=>window.viewV39ExpeditionTestWorld('cave:expedition-test:1'));
      await openTools(page);await page.locator('[data-test-action="ritual-test-two"]').click();
      await page.locator('[data-summon-option="フレイムエレメンタル"]').waitFor();
      assert.equal(await page.evaluate(()=>window.getV39GameState().activeWorldId),'surface');
    }
    assert.deepEqual(errors,[]);console.log(`Ritual buttons: fresh stage ${stage}, ${width}px OK`);
    await page.close();
  }
} finally {await browser.close();}
