import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';

const out='output/web-game/world-layer-cache';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try {
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e.stack)));
  page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
  await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const result=await page.evaluate(async()=>{
    window.closeV39PlayModeSelection();await window.setV39TestMode(true);
    const fixture=await window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
    const game=window.__v39FieldRuntime.game,canvas=game.canvas,id=fixture.worldId;
    const check=(ok,message)=>{if(!ok)throw Error(message);};
    const scene=()=>game.scene.getScenes(true)[0];
    const layer=key=>window.getV39WorldLayerCacheStatus().find(row=>row.worldId===key);
    const snap=()=>{const s=window.getV39GameState();return s.players.flatMap(p=>p.factionState.units).map(u=>[u.id,u.worldId,u.x,u.y,u.hp]);};
    const originalUnits=snap(),surfaceScene=scene(),surfaceTerrain=surfaceScene.v39TerrainGraphics;
    const timings=[];
    const view=async key=>{
      const t=performance.now();check(window.viewV39ExpeditionTestWorld(key),'view failed');
      await window.waitForV39MapRenderSettled();
      check(window.__v39FieldRuntime.game===game&&game.canvas===canvas,'engine/canvas replaced');
      check(game.scene.getScenes(true).length===1&&scene().v39WorldId===key,'only destination can be active');
      check(document.querySelectorAll('#v39-coordinate-ruler').length===1,'coordinate rulers duplicated');
      check(document.querySelectorAll('#v39-map-camera-controls').length===1,'camera controls duplicated');
      timings.push({worldId:key,ms:performance.now()-t});
    };
    await view(id);const caveScene=scene(),caveTerrain=caveScene.v39TerrainGraphics,caveKey=layer(id).sceneKey;
    check(layer('surface')&&!surfaceScene.sys.isActive(),'occupied surface should sleep');
    await view('surface');
    const camera=scene().cameras.main;
    camera.setZoom(scene().v39FitZoom*2);camera.centerOn(window.__v39FieldRuntime.mapData.w*20+10,window.__v39FieldRuntime.mapData.h*18+6);camera.preRender();
    const savedCamera={zoom:camera.zoom,x:camera.scrollX,y:camera.scrollY};
    await view(id);check(scene()===caveScene&&scene().v39TerrainGraphics===caveTerrain,'cave scene/terrain not reused');
    await view('surface');
    check(scene()===surfaceScene&&scene().v39TerrainGraphics===surfaceTerrain,'surface scene/terrain not reused');
    check(Math.abs(camera.zoom-savedCamera.zoom)<.001,'zoom not restored');
    check(Math.abs(camera.scrollX-savedCamera.x)<1&&Math.abs(camera.scrollY-savedCamera.y)<1,`camera position not restored: ${JSON.stringify(savedCamera)} => ${camera.scrollX},${camera.scrollY}`);
    for(let i=0;i<4;i++){await view(id);await view('surface');}
    check(layer(id).terrainBuilds===1&&layer('surface').terrainBuilds===1,'unchanged terrain should not be rebuilt');
    check(JSON.stringify(snap())===JSON.stringify(originalUnits),'viewing changed unit positions/HP');
    const childCounts=window.getV39WorldLayerCacheStatus();
    // Leaving an animated scene must release the effect and its continuous-render lock.
    const effectUnit=window.getV39ActiveFactionState().units.find(u=>(u.worldId||'surface')==='surface');
    const effect=window.playV39MapEffect({effectName:'火炎',x:effectUnit.x,y:effectUnit.y,allowInFog:true});
    await new Promise(resolve=>setTimeout(resolve,100));
    await view(id);
    check(await Promise.race([effect.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),2000))]),'leaving scene did not stop effect');
    await view('surface');
    // Change hidden cave data; a cached scene must not display the stale terrain.
    let s=window.getV39GameState();const worlds=structuredClone(s.explorationWorlds);
    const old=worlds[id].map.grid[5][5];worlds[id].map.grid[5][5]=old==='岩壁'?'洞窟':'岩壁';
    window.setV39GameState({explorationWorlds:worlds});
    await view(id);check(layer(id).terrainBuilds===2,'changed hidden terrain was not redrawn');
    check(window.__v39FieldRuntime.mapData.grid[5][5]!==old,'wrong cave data activated');
    await view('surface');
    const originalLoad=window.loadV39FieldSnapshot;let turnLoads=0;
    window.loadV39FieldSnapshot=(...args)=>{turnLoads++;return originalLoad(...args);};
    await window.advanceV39Turn({skipUnactedFocus:true,presentation:false});
    window.loadV39FieldSnapshot=originalLoad;
    check(turnLoads===0&&window.__v39FieldRuntime.game===game,'background turn changed renderer');
    // Unit removal only evicts sleeping layers, and never removes world/save data.
    await view(id);
    s=window.getV39GameState();
    const caveUnits=s.players.find(p=>p.id===s.activePlayerId).factionState.units.filter(u=>(u.worldId||'surface')===id);
    window.setV39GameState({players:s.players.map(p=>({...p,factionState:{...p.factionState,units:p.factionState.units.filter(u=>(u.worldId||'surface')!==id)}}))});
    await Promise.resolve();check(layer(id),'visible empty map must remain visible');
    await view('surface');await Promise.resolve();
    check(!layer(id),'unoccupied sleeping cave must be evicted');
    check(!game.scene.getScene(caveKey),'evicted scene was not destroyed');
    check(Object.keys(game.textures.list).every(key=>!key.includes(`-${caveKey}-`)),'evicted owned textures leaked');
    check(window.getV39GameState().explorationWorlds[id]?.map,'eviction deleted cave game data');
    await view(id);check(layer(id).sceneKey!==caveKey,'evicted cave should recreate layers on demand');
    s=window.getV39GameState();
    window.setV39GameState({players:s.players.map(p=>p.id!==s.activePlayerId?p:{...p,factionState:{...p.factionState,selectedUnitId:caveUnits[0]?.id||p.factionState.selectedUnitId,units:[...p.factionState.units,...caveUnits]}})});
    await window.waitForV39MapRenderSettled();
    window.activateV39FooterTab('squad');
    const save=window.exportV39SaveJson();window.importV39SaveJson(save);
    await new Promise(resolve=>setTimeout(resolve,400));
    check(window.getV39WorldLayerCacheStatus().length===1,'save reload must clear old visual caches');
    check(window.__v39FieldRuntime.game.scene.getScenes(true)[0]?.v39WorldId===id,'save reload must label the active cave correctly');
    return {timings,childCounts,turnLoads,cache:window.getV39WorldLayerCacheStatus()};
  });
  await page.screenshot({path:`${out}/cave-${width}.png`});
  const zoom=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.zoom);
  await page.locator('[data-map-zoom="in"]').click();
  const nextZoom=await page.evaluate(()=>window.__v39FieldRuntime.game.scene.getScenes(true)[0].cameras.main.zoom);
  assert(Math.abs(nextZoom/zoom-1.3)<.01,`zoom input must fire only once: ${zoom} => ${nextZoom}`);
  await page.evaluate(()=>window.viewV39ExpeditionTestWorld('surface'));
  await page.evaluate(()=>window.waitForV39MapRenderSettled());
  await page.screenshot({path:`${out}/surface-${width}.png`});
  await page.evaluate(async()=>{
    await window.setV39TestMode(false);
    const units=window.getV39ActiveFactionState().units;
    const cave=units.find(u=>(u.worldId||'surface')!=='surface'),surface=units.find(u=>(u.worldId||'surface')==='surface');
    for(const unit of [cave,surface,cave,surface]){
      if(!window.viewV39OwnedUnitWorld(unit.id))throw Error('normal-mode world view failed');
      await window.waitForV39MapRenderSettled();
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0];
      if(!scene.children.list.some(child=>child.name==='v39-unexplored-fog-layer'))throw Error('normal-mode fog missing after layer switch');
      if(!window.getV39VisibilitySnapshot().currentVisionTileKeys.has(`${unit.x},${unit.y}`))throw Error('visibility belongs to wrong world');
    }
  });
  assert.deepEqual(errors,[]);
  writeFileSync(`${out}/report-${width}.json`,JSON.stringify(result,null,2));
  console.log(`${width}: renderer/terrain reuse, sleeping layers, camera/input, hidden terrain updates, no turn reload, eviction/data retention/revisit passed`);
  await page.close();
 }
}finally{await browser.close();}
