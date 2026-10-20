import assert from 'node:assert/strict';
import {mkdirSync,readFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/terrain-gallery';mkdirSync(out,{recursive:true});
const expected=JSON.parse(readFileSync('data/source/export/json/地形.json','utf8')).map(row=>row.地形).filter(Boolean);
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.openV39TestTools();});
    await page.locator('[data-test-action="terrain-test-start"]').click();
    await page.waitForFunction(()=>document.getElementById('v39-test-terrain-sample'));
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.children.list.find(c=>c.name==='v39-terrain-test-labels'));
    const initial=await page.evaluate(()=>{
      const r=window.__v39FieldRuntime,m=r.mapData,s=window.getV39GameState(),scene=r.game.scene.getScenes(true)[0];
      return {names:m.terrainTestSamples.map(p=>p.name),heights:m.terrainTestSamples.map(p=>m.heightLevelMap[p.y].slice(p.x,p.x+3)),
        labels:scene.children.list.find(c=>c.name==='v39-terrain-test-labels').list.length,enemies:s.enemies.length,
        transport:s.players[0].factionState.units.some(u=>u.transportAssignment||u.caveDuty),landmarks:Object.keys(s.victoryLandmarksByTile).length};
    });
    assert.deepEqual(initial.names,expected);assert(initial.heights.every(row=>row.join(',')==='0,3,6'));
    assert.equal(initial.labels,expected.length+4);assert.equal(initial.enemies,0);assert(!initial.transport);assert(initial.landmarks>=3);
    await page.locator('#v39-test-terrain-sample').selectOption(String(expected.indexOf('森')));
    await page.locator('[data-test-action="terrain-sample-focus"]').click();
    const selected=await page.evaluate(()=>{const r=window.__v39FieldRuntime;return r.game.scene.getScenes(true)[0].v39SelectedTile;});
    assert(selected.x>2);await page.waitForTimeout(700);
    await page.screenshot({path:`${out}/forest-${width}.png`});
    await page.locator('#v39-test-terrain-sample').selectOption(String(expected.indexOf('道路1')));
    assert(await page.getByText('専用描画未対応（下地を表示）',{exact:false}).count()>0);
    await page.locator('[data-test-action="terrain-overview"]').click();
    assert(await page.evaluate(()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];return scene.cameras.main.zoom===scene.v39FitZoom;}));
    await page.screenshot({path:`${out}/overview-${width}.png`});
    await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();});
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.children.list.find(c=>c.name==='v39-terrain-test-labels'));
    assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.terrainTestSamples.length),expected.length);
    await page.evaluate(()=>window.setV39TestMode(false));
    await page.waitForFunction(()=>!window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.some(c=>c.name==='v39-terrain-test-labels'));
    await page.evaluate(async()=>{await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();});
    assert.equal(await page.evaluate(()=>!!window.__v39FieldRuntime.mapData.terrainTestSamples),false);
    assert.deepEqual(errors,[]);console.log(`${width}: ${expected.length} terrain rows, real entry, heights/labels, focus, unsupported status, save and cleanup passed`);
    await page.close();
  }
}finally{await browser.close();}
