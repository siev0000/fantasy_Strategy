import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/terrain-patterns';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();
      await window.waitForV39MapRenderSettled();window.setV39WeatherOverlayEnabled(false);
    });
    await page.waitForFunction(()=>window.__v39FieldRuntime?.game.scene.getScenes(true)[0]?.textures.exists('v39-terrain-pattern-source'));
    const result=await page.evaluate(async()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0];
      const terrains=['砂漠','荒野','沼地','湿地','丘陵','森','山岳','火山'];
      const map={...runtime.mapData,grid:Array.from({length:24},()=>Array.from({length:24},(_,x)=>terrains[Math.floor(x/3)])),
        heightLevelMap:Array.from({length:24},(_,y)=>Array(24).fill(y<8?0:y<16?3:6)),specialMap:Array.from({length:24},()=>Array(24).fill('')),
        reliefMap:[],snowCoverMap:[],riverData:null};
      map.specialMap[1][0]='洞窟';map.specialMap[1][1]='遺跡';
      window.updateV39FieldData(map,{silent:true});
      window.renderV39TerrainIcons();
      const icons=scene.children.list.find(child=>child.name==='v39-terrain-icon-overlay');
      const desertMarks=icons.list.filter(child=>child.getData('terrain')==='砂漠').length;
      const forestIcons=icons.list.filter(child=>child.getData('terrain')==='森').length;
      const mountainIcons=icons.list.filter(child=>child.getData('terrain')==='山岳'||child.getData('terrain')==='火山').length;
      const landmarks=icons.list.filter(child=>['洞窟','遺跡'].includes(child.getData('terrain'))).length;
      const savedCount=scene.v39TerrainPatterns.tileCount;
      const savedTerrainCounts=scene.v39TerrainPatterns.terrainCounts;
      scene.v39TerrainPatterns.tileCount=0;scene.v39TerrainPatterns.terrainCounts={};window.renderV39TerrainIcons();
      const fallbackMarks=scene.children.list.find(child=>child.name==='v39-terrain-icon-overlay').list.filter(child=>child.getData('terrain')==='砂漠').length;
      scene.v39TerrainPatterns.tileCount=savedCount;scene.v39TerrainPatterns.terrainCounts=savedTerrainCounts;window.renderV39TerrainIcons();
      const state=scene.v39TerrainPatterns,keys=state.chunks.map(c=>c.key);
      const corners=state.chunks[0].texture.context.getImageData(0,0,1,1).data[3];
      const source=scene.textures.get('v39-terrain-pattern-source').getSourceImage();
      window.updateV39FieldData({...runtime.mapData},{silent:true});
      const stable=scene.v39TerrainPatterns===state;
      const sample=(y)=>Array.from(scene.v39TerrainPatterns.chunks[0].texture.context.getImageData(15,y,1,1).data);
      const low=sample(18),middle=sample(242),high=sample(466);
      const savedDisplay=localStorage.getItem('v39-display-settings-v1');
      localStorage.setItem('v39-display-settings-v1',JSON.stringify({...JSON.parse(savedDisplay||'{}'),heightShading:false}));
      window.dispatchEvent(new CustomEvent('v39:display-settings-changed',{detail:{changedKeys:['heightShading']}}));
      const unshadedLow=sample(18),unshadedHigh=sample(466);
      if(savedDisplay===null)localStorage.removeItem('v39-display-settings-v1');else localStorage.setItem('v39-display-settings-v1',savedDisplay);
      window.dispatchEvent(new CustomEvent('v39:display-settings-changed',{detail:{changedKeys:['heightShading']}}));
      scene.cameras.main.setZoom(widthForZoom());scene.cameras.main.centerOn(744,672);
      function widthForZoom(){return window.innerWidth<600?.34:.65;}
      await window.waitForV39MapRenderSettled();
      return {tiles:state.tileCount,chunks:keys.length,stable,corners,desertMarks,forestIcons,mountainIcons,landmarks,fallbackMarks,low,middle,high,unshadedLow,unshadedHigh,source:[source.width,source.height]};
    });
    assert.equal(result.tiles,576);assert(result.chunks<=4);assert(result.stable);assert.equal(result.corners,0);
    assert.deepEqual(result.source,[512,384]);
    assert.equal(result.desertMarks,0);
    assert.equal(result.forestIcons,0);assert.equal(result.mountainIcons,0);assert(result.landmarks>=2);assert(result.fallbackMarks>0);
    assert(result.low[0]>result.high[0]);assert(result.low[3]>=250);assert.deepEqual(result.unshadedLow,result.unshadedHigh);
    const luminance=pixel=>(pixel[0]+pixel[1]+pixel[2])/3;
    assert(luminance(result.low)-luminance(result.middle)>25);
    assert(luminance(result.middle)-luminance(result.high)>25);
    await page.screenshot({path:`${out}/field-${width}.png`});
    const lifecycle=await page.evaluate(()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0];
      const old=scene.v39TerrainPatterns.chunks.map(c=>c.key);
      window.updateV39FieldData({...runtime.mapData,isUnderground:true},{silent:true});
      const cleared=old.every(key=>!scene.textures.exists(key))&&scene.v39TerrainPatterns.chunks.length===0;
      const big={...runtime.mapData,isUnderground:false,w:100,h:100,
        grid:Array.from({length:100},()=>Array(100).fill('砂漠')),
        heightLevelMap:Array.from({length:100},()=>Array(100).fill(0)),specialMap:[],reliefMap:[]};
      const start=performance.now();window.updateV39FieldData(big,{silent:true});
      return {cleared,tiles:scene.v39TerrainPatterns.tileCount,chunks:scene.v39TerrainPatterns.chunks.length,ms:performance.now()-start};
    });
    assert(lifecycle.cleared);assert.equal(lifecycle.tiles,10000);assert(lifecycle.chunks<=16);
    assert.deepEqual(errors,[]);console.log(`${width}: cropped 8 terrains, hex clipping, stable cache, cave cleanup and 100x100 ${lifecycle.chunks} chunks / ${Math.round(lifecycle.ms)}ms passed`);
    await page.close();
  }
}finally{await browser.close();}
