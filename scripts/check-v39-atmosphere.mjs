import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/atmosphere';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));page.on('dialog',d=>d.accept());
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39DisasterTest==='function');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({atmosphere:false});await window.waitForV39MapRenderSettled();window.setV39WeatherOverlayEnabled(false);});
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.children.getByName('v39-atmosphere-fog-layer')?.getData('atmosphere')?.ready);
    const initial=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],layer=scene.children.getByName('v39-atmosphere-fog-layer');
      const icons=scene.children.getByName('v39-disaster-icon-overlay').list.filter(item=>item.getData('disasterNames')?.some(name=>['瘴気','熱波','大寒波'].includes(name)));
      return {meta:layer.getData('atmosphere'),icons:icons.length,coldImages:scene.children.getByName('v39-disaster-field-artwork').list.filter(item=>item.getData('disasterImageSlot')===7).length,alpha:layer.list.map(item=>item.alpha)};
    });
    assert(initial.meta.combinations.includes('miasma'));assert(initial.meta.combinations.includes('heat'));assert(initial.meta.combinations.includes('cold'));assert.equal(initial.coldImages,0);
    assert.equal(initial.icons,2);assert(initial.alpha.every(a=>a===.75));
    await page.evaluate(()=>{window.forceV39Disaster('災害:熱波',{x:4,y:14});window.renderV39Visibility();});
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.getByName('v39-atmosphere-fog-layer').getData('atmosphere').combinations.includes('miasma|heat'));
    await page.locator('#v39-test-disaster-fixture').selectOption('災害:瘴気');
    await page.locator('[data-test-action="disaster-fixture-focus"]').click();
    await page.waitForTimeout(500);await page.screenshot({path:`${out}/two-${width}.png`});
    const mixed=await page.evaluate(async()=>{
      const map=window.__v39FieldRuntime.mapData;map.fogMap||=[];map.fogMap[14]||=[];
      for(const x of [4,8])map.fogMap[14][x]={source:'skill',expiresAtTurn:7};
      for(const x of [5,9])map.fogMap[14][x]={kind:'death',source:'skill',expiresAtTurn:8};
      window.forceV39Disaster('災害:大寒波',{x:4,y:14});window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],layer=scene.children.getByName('v39-atmosphere-fog-layer');
      const meta=layer.getData('atmosphere'),before=JSON.stringify(map.fogMap);
      const texture=scene.textures.get(scene.v39AtmosphereTextureKeys[0]);
      const pixel=(x,y)=>Array.from(texture.context.getImageData(x,y,1,1).data);
      const samples=[pixel(131,410),pixel(147,410)];
      window.__atmosphereCache=layer;
      const s=window.getV39GameState();window.setV39GameState({worldEnvironment:{...s.worldEnvironment,activeDisasters:[...s.worldEnvironment.activeDisasters].reverse()}});
      await window.waitForV39MapRenderSettled();
      return {meta,samples,stable:scene.children.getByName('v39-atmosphere-fog-layer')===window.__atmosphereCache,
        alpha:layer.list.map(item=>item.alpha),unchanged:before===JSON.stringify(map.fogMap)};
    });
    assert(mixed.meta.combinations.includes('fog|miasma|heat|cold'));assert(mixed.meta.combinations.includes('death|miasma|heat|cold'));
    assert(mixed.meta.combinations.includes('fog'));assert(mixed.meta.combinations.includes('death'));
    assert(mixed.stable&&mixed.unchanged);assert.deepEqual(mixed.alpha,initial.alpha);assert(mixed.samples.every(pixel=>pixel[3]>=140));
    assert.notDeepEqual(mixed.samples[0].slice(0,3),mixed.samples[1].slice(0,3));
    await page.waitForTimeout(300);await page.screenshot({path:`${out}/multi-${width}.png`});
    await page.evaluate(()=>window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:4,y:14}})));
    await page.locator('[data-foot="tile"]').click();
    const detail=await page.locator('#v39-land-environment-effects').innerText();
    for(const name of ['霧','瘴気','熱波','大寒波'])assert(detail.includes(name));assert(detail.includes('⌛'));
    const saved=await page.evaluate(async()=>{
      const before=JSON.stringify(window.__v39FieldRuntime.mapData.fogMap),events=window.getV39GameState().worldEnvironment.activeDisasters.length;
      window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
      return before===JSON.stringify(window.__v39FieldRuntime.mapData.fogMap)&&events===window.getV39GameState().worldEnvironment.activeDisasters.length;
    });assert(saved);
    const cleanup=await page.evaluate(async()=>{
      const s=window.getV39GameState();window.setV39GameState({timeline:{...s.timeline,turnNumber:3}});window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const remaining=scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere');
      await window.setV39TestMode(false);
      const state=window.getV39GameState();window.setV39GameState({territoryOwnerByTile:{},players:state.players.map(p=>({...p,factionState:{...p.factionState,units:[],settlements:[],village:null}}))});
      window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      const hidden=scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere').tileCount;
      window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:4,y:14}}));
      const detail=document.getElementById('v39-land-environment-effects').textContent;
      await window.setV39TestMode(true);
      window.setV39GameState({timeline:{...state.timeline,turnNumber:8}});window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      return {remaining:hidden===0?remaining:null,hidden,detail,end:scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere').tileCount,
        keys:scene.textures.getTextureKeys().filter(key=>key.startsWith('v39-atmosphere-chunk-')).length};
    });
    assert(cleanup.remaining?.combinations.every(key=>['fog','death'].includes(key)));assert.equal(cleanup.hidden,0);assert.equal(cleanup.detail,'未確認');assert.equal(cleanup.end,0);assert.equal(cleanup.keys,0);
    const lifecycle=await page.evaluate(async()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0];
      const base=runtime.mapData,s=window.getV39GameState(),turn=s.timeline.turnNumber;
      window.setV39GameState({worldEnvironment:{...s.worldEnvironment,activeDisasters:[{id:'atmosphere-isolation',disasterId:'災害:熱波',name:'熱波',x:4,y:14,anchorKey:'4,14',tileKeys:['4,14'],startsAtTurn:turn,expiresAtTurn:turn+5}]}});
      const fogMap=[];fogMap[14]=[];fogMap[14][4]={source:'skill',expiresAtTurn:turn+5};
      window.updateV39FieldData({...base,isUnderground:false,fogMap},{silent:true});
      window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      const surface=scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere');
      window.updateV39FieldData({...base,isUnderground:true,fogMap},{silent:true});
      window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      const cave=scene.children.getByName('v39-atmosphere-fog-layer').getData('atmosphere');
      const big={...base,isUnderground:false,w:100,h:100,
        grid:Array.from({length:100},()=>Array(100).fill('平地')),specialMap:[],reliefMap:[],
        heightLevelMap:Array.from({length:100},()=>Array(100).fill(0)),
        fogMap:Array.from({length:100},()=>Array.from({length:100},()=>({source:'skill',expiresAtTurn:turn+5})))};
      const start=performance.now();window.updateV39FieldData(big,{silent:true});window.renderV39Visibility();
      await window.waitForV39MapRenderSettled();
      const elapsed=performance.now()-start,layer=scene.children.getByName('v39-atmosphere-fog-layer');
      const result={surface,cave,tiles:layer.getData('atmosphere').tileCount,chunks:layer.list.length,ms:elapsed};
      window.renderV39Visibility();await window.waitForV39MapRenderSettled();
      result.stable=layer===scene.children.getByName('v39-atmosphere-fog-layer');return result;
    });
    assert.deepEqual(lifecycle.surface.combinations,['fog|heat']);
    assert.deepEqual(lifecycle.cave.combinations,['fog']);assert.equal(lifecycle.cave.tileCount,1);
    assert.equal(lifecycle.tiles,10000);assert(lifecycle.chunks<=16);assert(lifecycle.stable);
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({initial,mixed,detail,cleanup,lifecycle},null,2));
    console.log(`${width}: single/two/multi colours, fixed order/cache/alpha, centre icons, detail/save, visibility/expiry/texture cleanup passed`);
    console.log(`${width}: cave fog/ground hazard isolation, 100x100 ${lifecycle.chunks} chunks / ${Math.round(lifecycle.ms)}ms and cache reuse passed`);
    await page.close();
  }
}finally{await browser.close();}
