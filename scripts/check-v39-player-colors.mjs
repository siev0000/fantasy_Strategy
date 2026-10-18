import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/player-colors';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
  for(const width of [390,1100]) {
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>{errors.push(String(e.stack));console.error(e.stack);});
    page.on('console',msg=>{if(msg.type()==='error')console.error(msg.text());});
    page.on('dialog',dialog=>dialog.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.locator('[data-v39-test-tools]').click();await page.locator('[data-test-action="logistics-test-start"]').click();
    await page.waitForFunction(()=>window.getV39ActiveFactionState()?.logisticsRoutes?.length===4);
    const ids=await page.evaluate(async()=>{
      const s=window.getV39GameState(),p=s.players.find(p=>p.id===s.activePlayerId),other=structuredClone(p);
      other.id='color-other';other.label='色テスト相手';
      other.factionState={...other.factionState,settlements:[],logisticsRoutes:[],units:[{...other.factionState.units[0],id:'color-other-unit',x:5,y:5,position:[5,5]}],squads:[]};
      window.setV39GameState({players:[...s.players.filter(p=>p.id!==other.id),other]});
      await window.waitForV39MapRenderSettled();
      return {own:p.id,other:other.id};
    });
    const before=await page.evaluate(ids=>Object.fromEntries(Object.entries(ids).map(([k,id])=>[k,window.getV39PlayerColor(id)])),ids);
    assert.notEqual(before.own,before.other);
    await page.evaluate(()=>window.activateV39FooterTab('manage'));
    await page.locator('#v39-manage-display-settings').click();
    const ownPicker=page.locator(`[data-player-color="${ids.own}"]`);
    await ownPicker.fill('#28e060');await ownPicker.dispatchEvent('change');
    const otherPicker=page.locator(`[data-player-color="${ids.other}"]`);
    await otherPicker.fill('#ec7040');await otherPicker.dispatchEvent('change');
    await page.waitForTimeout(350);
    await page.screenshot({path:`${out}/settings-${width}.png`});
    const colors=await page.evaluate(ids=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const territory=scene.children.list.find(n=>n.name==='v39-own-territory-boundary-layer');
      const own=window.getV39MapEntityMarker(window.getV39ActiveFactionState().units[0].id);
      const foreign=window.getV39MapEntityMarker('color-other-unit');
      return {own:window.getV39PlayerColor(ids.own),other:window.getV39PlayerColor(ids.other),
        marker:own?.getData('ownerColor'),foreign:foreign?.getData('ownerColor'),territory:territory?.getData('ownerColor')};
    },ids);
    assert.equal(colors.own,0x28e060);assert.equal(colors.other,0xec7040);
    assert.equal(colors.marker,colors.own);assert.equal(colors.foreign,colors.other);assert.equal(colors.territory,colors.own);
    await page.evaluate(()=>window.activateV39FooterTab('logistics'));
    await page.locator('[data-logistics-select]').first().click();
    await page.waitForTimeout(100);
    const routes=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list
      .find(n=>n.name==='v39-logistics-routes').list.filter(n=>n.name==='v39-logistics-route-line'&&n.getData('ownerPlayerId')===window.getV39ActivePlayerId()).map(n=>n.getData('routeStyle')));
    assert(routes.length>1&&routes.every(r=>r.color===colors.own&&r.alpha===1));
    assert(routes.some(r=>r.outline===0xffffff));
    await page.screenshot({path:`${out}/routes-${width}.png`});
    const switched=await page.evaluate(ids=>{
      window.setV39ActivePlayer(ids.other);
      const other=window.getV39PlayerColor(ids.other),own=window.getV39PlayerColor(ids.own);
      window.setV39ActivePlayer(ids.own);return {other,own};
    },ids);
    assert.equal(switched.own,colors.own);assert.equal(switched.other,colors.other);
    const saved=await page.evaluate(()=>{const data=window.exportV39SaveJson();window.importV39SaveJson(data);return data;});
    await page.reload({waitUntil:'networkidle'});
    await page.evaluate(data=>{window.closeV39PlayModeSelection();window.importV39SaveJson(data);},saved);
    assert.equal(await page.evaluate(id=>window.getV39PlayerColor(id),ids.own),colors.own);
    assert.equal(await page.evaluate(id=>window.getV39PlayerColor(id),ids.other),colors.other);
    await page.evaluate(()=>window.activateV39FooterTab('manage'));
    await page.locator('#v39-manage-display-settings').click();
    await page.locator('#v39-display-settings-reset').click();
    await page.waitForFunction(({id,color})=>window.getV39PlayerColor(id)===color,{id:ids.own,color:before.own});
    assert.equal(await page.evaluate(id=>window.getV39PlayerColor(id),ids.own),before.own);
    assert.deepEqual(errors,[]);
    console.log(`${width}: player palette, settings, territory/unit/route colors, reload/save and reset passed`);
    await page.close();
  }
} finally {await browser.close();}
