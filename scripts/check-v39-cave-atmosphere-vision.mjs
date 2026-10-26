import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/cave-atmosphere-vision';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    const f=await window.startV39ExpeditionTest();window.viewV39ExpeditionTestWorld(f.worldId);
    await window.waitForV39MapRenderSettled();
    const state=window.getV39GameState(),player=state.players.find(p=>p.id===state.activePlayerId);
    const actor=player.factionState.units.find(u=>u.worldId===f.worldId);
    const map=window.__v39FieldRuntime.mapData;
    map.grid=map.grid.map(row=>row.map(()=> '洞窟'));map.fogMap=[];map.hazardZones=[];
    window.updateV39FieldData(map);
    window.setV39GameState({enemies:[{...actor,id:'hidden-in-fog',x:8,y:6,aggressive:false}],
      players:[{...player,factionState:{...player.factionState,units:[{...actor,x:6,y:6}],selectedUnitId:actor.id,visibility:{exploredTileKeys:[]}}}]});
    await window.setV39TestMode(false);await window.waitForV39MapRenderSettled();
  });
  const results=[];
  for(const kind of ['normal','death','miasma']){
    const result=await page.evaluate(async kind=>{
      const map=window.__v39FieldRuntime.mapData;
      map.fogMap=map.grid.map(row=>row.map(()=>({kind:kind==='death'?'death':'normal',expiresAtTurn:99})));
      map.hazardZones=kind==='miasma'?[{id:'cave-miasma',name:'瘴気地帯',disasterId:'危険地帯:瘴気地帯',x:6,y:6,
        tileKeys:map.grid.flatMap((row,y)=>row.map((_,x)=>`${x},${y}`))}]:[];
      const s=window.getV39GameState();
      window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,visibility:{exploredTileKeys:[]}}}))});
      window.updateV39FieldData(map);await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      const layer=scene.children.list.find(c=>c.name==='v39-atmosphere-fog-layer');
      const info=layer.getData('atmosphere'),snapshot=window.getV39VisibilitySnapshot();
      return {kind,tiles:info.tileKeys,count:info.tileCount,combinations:info.combinations,depth:layer.depth,
        vision:[...snapshot.currentVisionTileKeys],explored:[...snapshot.exploredTileKeys],
        detected:window.isV39EntityDetected('hidden-in-fog'),marker:!!window.getV39MapEntityMarker('hidden-in-fog')};
    },kind);
    assert.equal(result.count,37,'normal 3-hex sight must show the weather, not only 7 adjacent tiles');
    assert.equal(result.vision.length,7,'fog sight penalty must remain intact');
    assert.equal(result.explored.length,7,'showing fog must not explore the covered terrain');
    assert(result.tiles.includes('8,6'));assert(!result.tiles.includes('11,6'));
    assert(!result.detected&&!result.marker,'seeing the fog must not reveal its hidden enemy');
    assert(result.depth>14&&result.depth<15,'weather must be visible above unexplored mask, below boundary/selection');
    assert(result.combinations.some(c=>c.includes(kind==='miasma'?'miasma-zone':kind==='normal'?'fog':'death')));
    results.push(result);
    await page.screenshot({path:`${out}/${kind}-${width}.png`});
  }
  const walls=await page.evaluate(async()=>{
    const map=window.__v39FieldRuntime.mapData;
    for(let y=0;y<map.h;y++){map.grid[y][7]='岩壁';map.fogMap[y][7]=null;}
    window.updateV39FieldData(map);await window.waitForV39MapRenderSettled();
    const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
    return scene.children.list.find(c=>c.name==='v39-atmosphere-fog-layer').getData('atmosphere').tileKeys;
  });
  assert(!walls.includes('8,6'),'fog images must not leak through cave walls');
  await page.screenshot({path:`${out}/wall-${width}.png`});
  const cleared=await page.evaluate(async()=>{
    const map=window.__v39FieldRuntime.mapData;map.hazardZones=[];map.fogMap=[];
    window.updateV39FieldData(map);await window.waitForV39MapRenderSettled();
    return window.__v39FieldRuntime.game.scene.getScenes(true)[0].children.list.find(c=>c.name==='v39-atmosphere-fog-layer').getData('atmosphere').tileCount;
  });
  assert.equal(cleared,0);assert.deepEqual(errors,[]);
  writeFileSync(`${out}/report-${width}.json`,JSON.stringify({results,walls,cleared,errors},null,2));
  console.log(`${width}: normal/death/miasma visible to 3 hexes; spotting/exploration remain 1; wall clipping and removal passed`);
  await page.close();
 }
}finally{await browser.close();}
