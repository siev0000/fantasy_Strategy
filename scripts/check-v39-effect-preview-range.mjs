import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch(),out='output/web-game/effect-preview-range';mkdirSync(out,{recursive:true});
try{
 for(const [width,height] of [[320,600],[390,844],[1100,900]]){
  const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(String(e.stack)));
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:5173',{waitUntil:'networkidle'});
  await page.locator('#v39-title-effect-settings-open').click();
  await page.locator('#v39-effect-setting-base').selectOption('火炎');
  const stage=page.locator('#v39-effect-preview-stage'),distance=page.locator('#v39-effect-preview-distance'),shape=page.locator('#v39-effect-preview-shape'),radius=page.locator('#v39-effect-preview-radius');
  await page.waitForFunction(()=>document.querySelector('#v39-effect-preview-stage').classList.contains('is-ready'));
  assert.equal(await page.locator('[data-preview-cell]').count(),19);
  const set=async(locator,value)=>{await locator.fill(value);await locator.dispatchEvent('change');};
  await set(distance,'4');assert.equal(await stage.getAttribute('data-preview-distance'),'4');
  assert.equal(await page.locator('[data-preview-cell="4,0"]').getAttribute('aria-pressed'),'true');
  await shape.selectOption('circle');await set(radius,'2');
  const measure=()=>page.evaluate(async()=>{
   const m=await import('/src/v39/ui/v39-effect-preview-combatants.js');
   const g=m.effectPreviewGeometry(document.getElementById('v39-effect-preview-stage'));
   return {zoom:g.zoom,diameter:g.fitDiameterPx};
  });
  const before=await measure();await set(radius,'3');const expanded=await measure();
  assert.equal(before.zoom,expanded.zoom,'area changes must not auto-shrink camera');
  assert(expanded.diameter>before.diameter,'larger area visibly enlarges effect');
  await set(page.locator('#v39-effect-preview-zoom'),'100');const doubled=await measure();
  assert(Math.abs(doubled.diameter-expanded.diameter*2)<.01,'manual zoom scales effect');
  await set(page.locator('#v39-effect-preview-zoom'),'50');await set(radius,'2');
  assert.equal(await stage.getAttribute('data-preview-area-count'),'19');assert.equal(await page.locator('.is-attack-area').count(),19);
  const geometry=await page.evaluate(async()=>{
   const m=await import('/src/v39/ui/v39-effect-preview-combatants.js'),a=await import('/src/lib/v39-effect-area-geometry.js');
   const s=document.getElementById('v39-effect-preview-stage'),g=m.effectPreviewGeometry(s),shifted=m.effectPreviewGeometry(s,{offsetX:50,offsetY:-30,scaleMultiplierPercent:50});
   const area=a.resolveV39EffectAreaGeometry(g.areaTiles,1.25);
   return {diameter:g.fitDiameterPx,expected:area.diameter*g.zoom,x:g.x,y:g.y,shiftedX:shifted.x,shiftedY:shifted.y,
    map:m.getV39EffectPreviewMapRequest({w:100,h:100}),stageWidth:s.clientWidth,stageHeight:s.clientHeight};
  });
  assert(Math.abs(geometry.diameter-geometry.expected)<.01,'shared area diameter');
  assert.equal(geometry.x,geometry.shiftedX);assert.equal(geometry.y,geometry.shiftedY);
  assert.equal(geometry.map.areaTiles.length,19);assert.equal(geometry.map.tileX-geometry.map.attackerTile.x,4);
  assert(geometry.stageWidth>100&&geometry.stageHeight>45,'preview remains usable at small viewport');
  await page.screenshot({path:`${out}/circle-${width}.png`});
  await shape.selectOption('line');await set(distance,'6');
  assert.equal(await stage.getAttribute('data-preview-area-count'),'6');
  assert.equal(await radius.isDisabled(),true);
  await page.locator('#v39-effect-preview-fit').click();
  const fitted=await measure();assert(fitted.zoom>0&&fitted.zoom<=2);
  await page.locator('[data-preview-cell="3,-2"]').click();
  const centers=await page.locator('[data-preview-cell="3,-2"]').evaluate(tile=>{
   const a=tile.getBoundingClientRect(),b=document.querySelector('[data-preview-target]').getBoundingClientRect();
   return {x:a.x+a.width/2,y:a.y+a.height/2,targetX:b.x+b.width/2,targetY:b.y+b.height/2};
  });assert(Math.abs(centers.x-centers.targetX)<1&&Math.abs(centers.y-centers.targetY)<1,'free distant cell uses exact clicked position');
  await page.locator('#v39-effect-preview-direction').selectOption('self');
  assert.equal(await distance.isDisabled(),true);assert.equal(await page.locator('[data-preview-target]').isVisible(),false);
  await page.locator('#v39-effect-preview-direction').selectOption('180');await set(distance,'99');
  assert.equal(await distance.inputValue(),'8');assert.equal(await stage.getAttribute('data-preview-distance'),'8');
  await shape.selectOption('circle');await set(radius,'99');assert.equal(await radius.inputValue(),'4');
  assert.equal(await stage.getAttribute('data-preview-area-count'),'61');
  await page.locator('#v39-effect-playback-mode').selectOption('frame');
  await page.waitForTimeout(500);await page.locator('#v39-effect-frame-next').click();
  await page.locator('#v39-effect-playback-mode').selectOption('once');await page.locator('#v39-effect-setting-preview-local').click();
  await page.waitForTimeout(300);await page.screenshot({path:`${out}/playing-${width}.png`});
  await page.evaluate(()=>{
   window.__previewRangeOriginal={runtime:window.__v39FieldRuntime,play:window.playV39MapEffect};
   window.__v39FieldRuntime={mapData:{w:100,h:100}};
   window.playV39MapEffect=request=>{window.__previewRangeMapRequest=request;return Promise.resolve(true);};
  });
  await page.locator('[data-v39-effect-tab="data"]').click();await page.locator('#v39-effect-setting-preview').click();
  const mapRequest=await page.evaluate(()=>window.__previewRangeMapRequest);
  assert.equal(mapRequest.areaTiles.length,61);assert.equal(mapRequest.attackerTile.x-mapRequest.tileX,8);
  await page.evaluate(()=>{window.__v39FieldRuntime=window.__previewRangeOriginal.runtime;window.playV39MapEffect=window.__previewRangeOriginal.play;});
  await page.locator('#v39-effect-settings-back').click();assert.equal(await page.locator('#v39-effect-settings-panel').isVisible(),false);
  assert.deepEqual(errors,[]);console.log(`${width}x${height}: distant cells, distance clamp, circle19/61, shared sizing, line, self, frame/play and responsive layout passed`);
  await page.close();
 }
}finally{await browser.close();}
