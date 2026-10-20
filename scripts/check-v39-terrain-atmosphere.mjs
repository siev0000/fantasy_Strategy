import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/terrain-atmosphere';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!!window.startV39TerrainTest);
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39TerrainTest();});
  await page.waitForSelector('#v39-test-atmosphere-kind');
  const fixtures=await page.evaluate(()=>{
    const map=window.__v39FieldRuntime.mapData;
    return {names:map.terrainAtmosphereSamples.map(row=>row.name),hazards:map.hazardZones.length,first:map.terrainAtmosphereSamples[0].index};
  });
  assert.deepEqual(fixtures.names,['霧','死の霧（霧画像）','瘴気','霧＋瘴気']);assert.equal(fixtures.hazards,6);
  await page.locator('#v39-test-terrain-sample').selectOption(String(fixtures.first));
  await page.locator('[data-test-action="terrain-sample-focus"]').click();
  await page.locator('#v39-test-atmosphere-opacity-number').fill('80');
  await page.waitForFunction(()=>window.getV39DisplaySettings().atmosphereOpacityByKind.fog===80);
  const unchanged=await page.locator('#v39-test-atmosphere-opacity').evaluate(el=>{el.__sameNode=true;return true;});assert(unchanged);
  await page.locator('#v39-test-atmosphere-opacity').evaluate(el=>{el.value='70';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.children.list.find(c=>c.name==='v39-atmosphere-fog-layer')?.getData('atmosphere').palette.find(k=>k.id==='fog').opacity===0.7);
  assert(await page.locator('#v39-test-atmosphere-opacity').evaluate(el=>el.__sameNode===true));
  assert.equal(await page.locator('#v39-test-atmosphere-opacity-number').inputValue(),'70');
  await page.screenshot({path:`${out}/fog-70-${width}.png`});
  const stateBefore=await page.evaluate(()=>JSON.stringify({map:window.__v39FieldRuntime.mapData.fogMap,settings:window.getV39GameState().worldEnvironment}));
  await page.locator('#v39-test-atmosphere-kind').selectOption('miasma');
  await page.locator('#v39-test-atmosphere-opacity-number').fill('15');
  assert.equal(await page.evaluate(()=>window.getV39DisplaySettings().atmosphereOpacityByKind.fog),70);
  assert.equal(await page.evaluate(()=>JSON.stringify({map:window.__v39FieldRuntime.mapData.fogMap,settings:window.getV39GameState().worldEnvironment})),stateBefore);
  await page.evaluate(async()=>{window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();});
  assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.mapData.terrainAtmosphereSamples.length),4);
  await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.getV39DisplaySettings);
  assert.equal(await page.evaluate(()=>window.getV39DisplaySettings().atmosphereOpacityByKind.fog),70);
  assert.equal(await page.evaluate(()=>window.getV39DisplaySettings().atmosphereOpacityByKind.miasma),15);
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);await window.startV39TerrainTest();});
  await page.locator('[data-test-action="terrain-atmosphere-reset"]').click();
  assert.deepEqual(await page.evaluate(()=>window.getV39DisplaySettings().atmosphereOpacityByKind),{});
  // Ordinary play stores swamp/wetland in specialMap, rather than replacing the base tile.
  const wetlands=await page.evaluate(async()=>{
    window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const map=window.__v39FieldRuntime.mapData;
    for(let y=4;y<7;y++)for(let x=4;x<10;x++){
      map.grid[y][x]='森';map.specialMap[y][x]=x<7?'沼地':'湿地';
    }
    window.updateV39FieldData({...map},{silent:true});
    await window.waitForV39MapRenderSettled();
    return new Promise(resolve=>{
      const check=()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],counts=scene?.v39TerrainPatterns?.terrainCounts;
        if(!counts?.湿地||!counts?.沼地){requestAnimationFrame(check);return;}
        window.renderV39TerrainIcons();
        const overlays=scene.children.list.find(c=>c.name==='v39-terrain-icon-overlay');
        const wetIcons=(overlays?.list||[]).filter(c=>{
          const [, ,x,y]=(c.name||'').split(':');
          return ['森','沼地','湿地'].includes(c.getData?.('terrain'))&&Number(x)>=4&&Number(x)<10&&Number(y)>=4&&Number(y)<7;
        }).length;
        resolve({counts,wetIcons});};check();
    });
  });
  assert.equal(wetlands.counts.沼地,9);assert.equal(wetlands.counts.湿地,9);assert.equal(wetlands.wetIcons,0);
  await page.evaluate(()=>window.setV39TestMode(false));
  assert.equal(await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39TerrainPatterns.terrainCounts.湿地),9);
  await page.evaluate(()=>window.setV39TestMode(true));
  await page.evaluate(()=>{const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];scene.cameras.main.setZoom(1).centerOn(7*40,6*36);scene.game.v39InvalidateRender?.();});
  await page.screenshot({path:`${out}/wetlands-${width}.png`});
  assert.deepEqual(errors,[]);console.log(`${width}: terrain fog samples, per-kind live opacity/storage/reset/save, stable drag controls and special-layer wetland artwork passed`);
  await page.close();
 }
}finally{await browser.close();}
