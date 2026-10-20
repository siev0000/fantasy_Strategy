import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/river-snow';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:950}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>typeof window.startV39DisasterTest==='function');
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({atmosphere:false});
      await window.waitForV39MapRenderSettled();window.setV39WeatherOverlayEnabled(false);
    });
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].textures.exists('v39-terrain-pattern-source'));
    const result=await page.evaluate(async()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0],state=window.getV39GameState();
      window.setV39GameState({worldEnvironment:{...state.worldEnvironment,activeDisasters:[]}});
      const edges=['279,224|310,242','310,242|310,280','310,280|341,298','310,242|341,224'];
      const riverData={cornerEdgeSet:new Set(edges),cornerWaterLinkSet:new Set(['341,298|372,280']),cornerWaterfallEdgeSet:new Set(['341,298|372,280'])};
      const base={...runtime.mapData,grid:Array.from({length:24},(_,y)=>Array(24).fill(y<6?'森':'砂漠')),
        heightLevelMap:Array.from({length:24},()=>Array(24).fill(0)),specialMap:[],reliefMap:[],fogMap:[],snowCoverMap:[],snowfallMap:[],riverData};
      window.updateV39FieldData(base,{silent:true});await window.waitForV39MapRenderSettled();
      scene.cameras.main.setZoom(1.3).centerOn(310,280);scene.v39RequestedZoom=1.3;
      const hide=()=>{for(const child of scene.children.list)if(child.depth>=4)child.setVisible(false);};
      const pixel=async(x,y)=>{
        hide();await window.waitForV39MapRenderSettled();
        const c=scene.cameras.main,sx=Math.round((x-c.worldView.x)*c.zoom+c.x),sy=Math.round((y-c.worldView.y)*c.zoom+c.y);
        const promise=new Promise(resolve=>scene.game.renderer.snapshotPixel(sx,sy,p=>resolve([p.r,p.g,p.b])));
        scene.game.v39InvalidateRender?.();return promise;
      };
      const river=scene.v39RiverGraphics,meta=river.getData('river'),signature=river.getData('signature');
      const water=await pixel(310,252),junction=await pixel(310,242),bank=await pixel(317,252),beforeSnow=await pixel(248,286);
      window.setV39SnowCoverAt(3,5,true);await window.waitForV39MapRenderSettled();
      const afterSnow=await pixel(248,286),alphaFound=scene.v39SnowCoverGraphics.commandBuffer.includes(0.85);
      const retained=scene.v39RiverGraphics===river&&river.getData('signature')===signature;
      hide();scene.game.v39InvalidateRender?.();await window.waitForV39MapRenderSettled();
      return {meta,water,junction,bank,beforeSnow,afterSnow,alphaFound,retained,riverDataUnchanged:JSON.stringify([...riverData.cornerEdgeSet])===JSON.stringify(edges),
        layers:scene.children.list.filter(child=>child.name==='v39-river-layer').length};
    });
    assert.equal(result.meta.segments,5);assert(Math.abs(result.meta.width-62*.18)<.01);
    for(const pixel of [result.water,result.junction])assert(pixel[2]>180&&pixel[1]-pixel[0]>40,JSON.stringify(result));
    assert(result.bank[0]<80&&result.bank[2]<160,JSON.stringify(result));
    for(let c=0;c<3;c++)assert(Math.abs(result.afterSnow[c]-(result.beforeSnow[c]*.15+[244,247,251][c]*.85))<8,JSON.stringify(result));
    assert(result.alphaFound&&result.retained&&result.riverDataUnchanged);assert.equal(result.layers,1);
    await page.screenshot({path:`${out}/field-${width}.png`});
    const lifecycle=await page.evaluate(async()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0];
      const map=runtime.mapData,river=map.riverData;
      window.updateV39FieldData({...map,riverData:[]},{silent:true});await window.waitForV39MapRenderSettled();
      const removed=scene.v39RiverGraphics.getData('river').segments===0;
      window.updateV39FieldData({...runtime.mapData,riverData:river},{silent:true});
      const saved=window.exportV39SaveJson();window.importV39SaveJson(saved);await window.waitForV39MapRenderSettled();
      return {removed,restored:window.__v39FieldRuntime.mapData.riverData.cornerEdgeSet instanceof Set,
        count:window.__v39FieldRuntime.game.scene.getScenes(true)[0].v39RiverGraphics.getData('river').segments,
        snow:window.__v39FieldRuntime.mapData.snowCoverMap[5][3]};
    });
    assert(lifecycle.removed&&lifecycle.restored&&lifecycle.snow);assert.equal(lifecycle.count,5);
    await page.evaluate(()=>window.generateV39TestFieldWithSeed({w:48,h:48,patternId:'balanced',mapScope:'region'},'river-snow-readability'));
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39RiverGraphics);
    const generated=await page.evaluate(async()=>{
      const runtime=window.__v39FieldRuntime,scene=runtime.game.scene.getScenes(true)[0],river=runtime.mapData.riverData;
      const edges=new Set([...river.cornerEdgeSet,...river.cornerWaterLinkSet]),edge=[...edges][0];
      if(edge){const [a,b]=edge.split('|').map(p=>p.split(',').map(Number));scene.cameras.main.setZoom(1).centerOn((a[0]+b[0])/2,(a[1]+b[1])/2);}
      await window.waitForV39MapRenderSettled();
      return {expected:edges.size,actual:scene.v39RiverGraphics.getData('river').segments};
    });
    assert(generated.expected>0);assert.equal(generated.actual,generated.expected);
    await page.waitForTimeout(250);await page.screenshot({path:`${out}/generated-${width}.png`});
    assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({result,lifecycle,generated},null,2));
    console.log(`${width}: wide continuous water/banks/junctions, snow 85% opacity pixels, cache/update/removal, unchanged geometry and save/restore passed`);
    await page.close();
  }
}finally{await browser.close();}
