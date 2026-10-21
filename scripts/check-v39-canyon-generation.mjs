import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
mkdirSync('output/web-game/canyons',{recursive:true});
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const unit=await page.evaluate(async()=>{
  const {generateV39CanyonRegions:generate}=await import('/src/lib/v39-canyon-generation.js');
  const {runWithSeededRandom:seed}=await import('/src/lib/seeded-random.js');
  const {getHexNeighborCoords:near}=await import('/src/lib/hex-grid.js');
  const build=()=>({w:48,h:32,grid:Array.from({length:32},()=>Array(48).fill('丘陵')),
   specialMap:Array.from({length:32},()=>Array(48).fill(null)),heightLevelMap:Array.from({length:32},(_,y)=>Array(48).fill(y===15?1:3)),
   riverTouchSet:new Set(Array.from({length:48},(_,x)=>`${x},15`))});
  const all=[];let widened=false,bent=false;
  for(let i=0;i<40;i++){
   const map=build(),heights=JSON.stringify(map.heightLevelMap),protectedKeys=new Set(['20,14','20,15','20,16']);
   const result=seed(`canyon-unit-${i}`,()=>generate(map,{protectedKeys}));
   const copy=build(),repeat=seed(`canyon-unit-${i}`,()=>generate(copy,{protectedKeys}));
   if(JSON.stringify(result)!==JSON.stringify(repeat))throw new Error('non deterministic canyon');
   if(heights!==JSON.stringify(map.heightLevelMap))throw new Error('height was changed');
   for(const key of protectedKeys){const [x,y]=key.split(',').map(Number);if(map.specialMap[y][x])throw new Error('protected tile changed');}
   for(const region of result.regions){
    all.push({kind:region.kind,length:region.length,size:region.size});widened||=region.size>region.length;
    for(let p=1;p<region.path.length;p++){
     const [x,y]=region.path[p-1].split(',').map(Number);
     if(!near(map.w,map.h,x,y).some(n=>n.key===region.path[p]))throw new Error('disconnected path');
    }
    const points=region.path.map(key=>{const [x,y]=key.split(',').map(Number);return [x+(y%2)*.5,y*Math.sqrt(3)/2];});
    if(points.length>2){const a=points[0],b=points[1];bent||=points.some(c=>Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))>.1);}
   }
  }
  const noRiver=build();noRiver.riverTouchSet.clear();
  const narrow={w:30,h:5,grid:Array.from({length:5},(_,y)=>Array(30).fill(y===2?'丘陵':'海')),
   heightLevelMap:Array.from({length:5},(_,y)=>Array(30).fill(y===2?3:0)),specialMap:Array.from({length:5},()=>Array(30).fill(null)),
   riverTouchSet:new Set(Array.from({length:30},(_,x)=>`${x},2`))};
  const protectedEnds=new Set(['0,2','1,2','28,2','29,2']);
  return {all,widened,bent,noRiver:generate(noRiver).placed,narrow:seed('narrow',()=>generate(narrow,{protectedKeys:protectedEnds})).placed};
 });
 assert(unit.widened&&unit.bent);assert.equal(unit.noRiver,0);assert.equal(unit.narrow,0);
 for(const row of unit.all){const limits=row.kind==='large'?[10,15]:row.kind==='small'?[1,2]:[4,8];assert(row.length>=limits[0]&&row.length<=limits[1]);assert(row.size<=row.length*2);}
 assert(unit.all.some(row=>row.kind==='large'));assert(unit.all.filter(row=>row.kind==='normal').length>unit.all.filter(row=>row.kind==='small').length);
 await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();});
 const maps=[];
 for(const [pattern,size] of [['balanced',48],['continent',100],['archipelago',100]]){
  await page.evaluate(({pattern,size})=>window.generateV39TestFieldWithSeed({w:size,h:size,patternId:pattern,mapScope:'region',climateSettings:{zone:'temperate',baseTemperature:18,humidity:55}},`canyon-map-${pattern}`),{pattern,size});
  const report=await page.evaluate(async()=>{
   await window.waitForV39MapRenderSettled();const map=window.__v39FieldRuntime.mapData;
   const result=map.canyonGeneration;
   return {placed:result.placed,regions:result.regions,count:map.specialMap.flat().filter(value=>value==='峡谷').length,reported:map.specialCounts.峡谷};
  });
  assert.equal(report.placed,report.count);assert.equal(report.count,report.reported);maps.push({pattern,...report});
 }
 assert(maps.some(row=>row.regions.some(region=>region.length>=4)));
 await page.screenshot({path:'output/web-game/canyons/generated.png'});
 await page.evaluate(async()=>{
  const map=window.__v39FieldRuntime.mapData,region=[...map.canyonGeneration.regions].sort((a,b)=>b.length-a.length)[0];
  const [x,y]=region.path[Math.floor(region.path.length/2)].split(',').map(Number);
  const {HEX_TILE_CONFIG:hex}=await import('/src/lib/phaser-map-panel-config.js');
  const camera=window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main;
  camera.setZoom(.9);camera.centerOn(x*hex.width+(y%2)*hex.oddRowOffsetX,y*hex.rowStep);
  await window.waitForV39MapRenderSettled();
 });
 await page.screenshot({path:'output/web-game/canyons/closeup.png'});
 await page.evaluate(()=>window.importV39SaveJson(window.exportV39SaveJson()));
 assert(await page.evaluate(()=>!!window.__v39FieldRuntime.mapData.canyonGeneration));
 assert.deepEqual(errors,[]);console.log(JSON.stringify({unit:{regions:unit.all.length,large:unit.all.filter(r=>r.kind==='large').length},maps:maps.map(r=>({pattern:r.pattern,lengths:r.regions.map(g=>g.length),tiles:r.count}))}));
}finally{await browser.close();}
