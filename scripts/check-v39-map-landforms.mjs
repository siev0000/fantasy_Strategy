import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/map-landforms';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:1100,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  const url=process.env.V39_TEST_URL||'http://127.0.0.1:3024';
  await page.goto(url,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>typeof window.generateV39TestFieldWithSeed==='function');
  await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({atmosphere:false});await window.waitForV39MapRenderSettled();});
  if(!process.env.V39_TEST_URL){
    const unit=await page.evaluate(async()=>{
      const {resolveV39RiverFlowDirections:flow}=await import('/src/lib/v39-river-flow.js');
      const {generateV39WastelandRegions:generate}=await import('/src/lib/v39-wasteland-generation.js');
      const {getHexNeighborCoords:neighbors}=await import('/src/lib/hex-grid.js');
      const edges=['0,0|10,0','10,0|20,0','10,0|10,10','90,0|100,0'];
      const data={cornerEdgeSet:new Set(edges),cornerWaterLinkSet:new Set(['20,0|30,0'])};
      const directed=flow(data).map(d=>`${d.from}>${d.to}`).sort();
      const reversed=flow({cornerEdgeSet:new Set(edges.map(e=>e.split('|').reverse().join('|')).reverse()),cornerWaterLinkSet:data.cornerWaterLinkSet}).map(d=>`${d.from}>${d.to}`).sort();
      const map={w:24,h:24,grid:Array.from({length:24},()=>Array(24).fill('平地'))};
      const result=generate(map,null,new Set(['12,12']));
      const hasCore=result.regions.every(region=>{
        const {x,y}=region.seed;return neighbors(24,24,x,y).filter(n=>map.grid[n.y][n.x]==='荒野').length>=4;
      });
      const thin={w:24,h:24,grid:Array.from({length:24},()=>Array(24).fill('海'))};
      for(let y=1;y<23;y++)thin.grid[y][10]='荒野';
      const narrow=generate(thin,null);
      return {directed,reversed,result,hasCore,protected:map.grid[12][12],narrow:narrow.placed};
    });
    assert.deepEqual(unit.directed,['0,0>10,0','10,0>20,0','10,10>10,0']);assert.deepEqual(unit.directed,unit.reversed);
    assert(unit.hasCore);assert(unit.result.placed>0);assert(unit.result.regions.every(r=>r.size>=7&&r.size<=28));assert.equal(unit.protected,'平地');assert.equal(unit.narrow,0);
  }
  const reports=[];
  for(const [pattern,size,seed] of [['balanced',48,'landforms-a'],['continent',48,'landforms-b'],['archipelago',72,'landforms-c'],['chain',48,'landforms-d'],['balanced',100,'landforms-e']]){
    await page.evaluate(({pattern,size,seed})=>window.generateV39TestFieldWithSeed({w:size,h:size,patternId:pattern,mapScope:'region',climateSettings:{zone:'temperate',baseTemperature:18,humidity:55}},seed),{pattern,size,seed});
    await page.waitForFunction(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39RiverGraphics);
    const report=await page.evaluate(async()=>{
      await window.waitForV39MapRenderSettled();
      const runtime=window.__v39FieldRuntime,map=runtime.mapData,scene=runtime.game.scene.getScenes(true)[0];
      const mountain=map.riverData.mountainSources||[],wasteland=map.wastelandGeneration;
      const adjacency=new Map(),reachable=new Set(),queue=[];
      for(const raw of [...map.riverData.edgeSet,...map.riverData.waterLinkSet]){
        const [a,b]=raw.split('|');for(const [from,to] of [[a,b],[b,a]]){
          if(!adjacency.has(from))adjacency.set(from,[]);adjacency.get(from).push(to);
          const [x,y]=from.split(',').map(Number);if(['海','湖'].includes(map.grid[y][x])&&!reachable.has(from)){reachable.add(from);queue.push(from);}
        }
      }
      for(let i=0;i<queue.length;i++)for(const next of adjacency.get(queue[i])||[])if(!reachable.has(next)){reachable.add(next);queue.push(next);}
      const visited=new Set(),masses=[];
      const near=(x,y)=>(y%2?[[-1,0],[1,0],[0,-1],[1,-1],[0,1],[1,1]]:[[-1,0],[1,0],[-1,-1],[0,-1],[-1,1],[0,1]])
        .map(([dx,dy])=>({x:x+dx,y:y+dy})).filter(p=>p.x>=0&&p.y>=0&&p.x<map.w&&p.y<map.h);
      for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
        const key=`${x},${y}`;if(visited.has(key)||!['山岳','火山'].includes(map.grid[y][x]))continue;
        const cells=[{x,y}],keys=[];visited.add(key);
        for(let i=0;i<cells.length;i++){
          const point=cells[i];keys.push(`${point.x},${point.y}`);
          for(const n of near(point.x,point.y)){const k=`${n.x},${n.y}`;if(!visited.has(k)&&['山岳','火山'].includes(map.grid[n.y][n.x])){visited.add(k);cells.push(n);}}
        }
        if(keys.length>=7)masses.push({size:keys.length,supplied:keys.some(k=>map.riverData.sourceSet.has(k)&&reachable.has(k))});
      }
      return {size:map.w,pattern:runtime.settings.patternId,mountain,masses,wasteland,river:scene.v39RiverGraphics.getData('river')};
    });
    assert(report.mountain.every(row=>row.size>=7&&row.connected&&row.sourceKey));
    assert(report.masses.every(row=>row.supplied),JSON.stringify(report.masses));
    assert(report.wasteland.regions.every(row=>row.size>=7&&row.size<=28));
    assert(report.river.arrows>0);reports.push(report);
    if(size===48&&pattern==='balanced'){
      await page.evaluate(async()=>{
        const runtime=window.__v39FieldRuntime,map=runtime.mapData,scene=runtime.game.scene.getScenes(true)[0];
        const edge=[...map.riverData.cornerEdgeSet][0];if(edge){const [a,b]=edge.split('|').map(p=>p.split(',').map(Number));scene.cameras.main.setZoom(1.3).centerOn((a[0]+b[0])/2,(a[1]+b[1])/2);}
        await window.waitForV39MapRenderSettled();
      });
      await page.screenshot({path:`${out}/rivers.png`});
      await page.evaluate(async()=>{
        const runtime=window.__v39FieldRuntime,region=runtime.mapData.wastelandGeneration.regions[0],scene=runtime.game.scene.getScenes(true)[0];
        if(region)scene.cameras.main.setZoom(1).centerOn(region.seed.x*62+(region.seed.y%2?31:0)+31,region.seed.y*56+37);
        await window.waitForV39MapRenderSettled();
      });
      await page.screenshot({path:`${out}/wasteland.png`});
    }
    console.log(`${pattern} ${size}: ${report.mountain.length} large mountain masses supplied, ${report.wasteland.placed} compact wasteland tiles, ${report.river.arrows} arrows`);
  }
  assert(reports.some(r=>r.mountain.length>0));assert(reports.some(r=>r.wasteland.placed>0));
  const saved=await page.evaluate(async()=>{
    const before=JSON.stringify({m:window.__v39FieldRuntime.mapData.riverData.mountainSources,w:window.__v39FieldRuntime.mapData.wastelandGeneration});
    window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
    return before===JSON.stringify({m:window.__v39FieldRuntime.mapData.riverData.mountainSources,w:window.__v39FieldRuntime.mapData.wastelandGeneration});
  });assert(saved);assert.deepEqual(errors,[]);writeFileSync(`${out}/report.json`,JSON.stringify(reports,null,2));
}finally{await browser.close();}
