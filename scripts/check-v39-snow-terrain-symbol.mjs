import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/snow-terrain-symbol';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.waitForFunction(()=>!!window.startV39DisasterTest);
    const result=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest({natural:true});
      await window.waitForV39MapRenderSettled();window.activateV39FooterTab('squad');
      const runtime=window.__v39FieldRuntime,s=window.getV39GameState();
      window.setV39GameState({worldEnvironment:{...s.worldEnvironment,activeDisasters:[]}});
      const map={...runtime.mapData,grid:Array.from({length:24},()=>Array(24).fill('雪原')),
        specialMap:[],reliefMap:[],riverData:null,fogMap:[],
        snowCoverMap:Array.from({length:24},()=>Array(24).fill(true)),
        snowfallMap:Array.from({length:24},(_,y)=>Array.from({length:24},(_,x)=>x===4&&y===4))};
      window.updateV39FieldData(map,{silent:true});await window.waitForV39MapRenderSettled();window.renderV39TerrainIcons();
      const scene=runtime.game.scene.getScenes(true)[0];scene.cameras.main.setZoom(1).centerOn(260,224);scene.v39RequestedZoom=1;
      const inspect=()=>{
        const active=window.__v39FieldRuntime,nodes=active.game.scene.getScenes(true)[0].children.list;
        return {snowSymbols:nodes.find(node=>node.name==='v39-terrain-icon-overlay')?.list.filter(node=>node.getData('terrain')==='雪原').length||0,
          snowfallMarkers:nodes.filter(node=>node.name==='v39-snowfall-item').length,
          snowfall:nodes.find(node=>node.name==='v39-rain-layer')?.getData('rain')?.snowTileCount||0,
          snowCover:!!nodes.find(node=>node.name==='v39-snow-cover-layer'),terrain:active.mapData.grid[4][4],covered:active.mapData.snowCoverMap[4][4]};
      };
      const before=inspect();window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();window.renderV39TerrainIcons();
      return {before,after:inspect(),definition:window.getV39TerrainIconDefinitions().base.雪原};
    });
    for(const check of [result.before,result.after]){
      assert.equal(check.snowSymbols,0);assert.equal(check.snowfallMarkers,0);assert.ok(check.snowfall>=1);assert(check.snowCover&&check.covered);assert.equal(check.terrain,'雪原');
    }
    assert.equal(result.definition,undefined);
    await page.screenshot({path:`${out}/snow-${width}.png`});
    assert.deepEqual(errors,[]);console.log(`${width}: no central snow symbol, terrain/cover/snowfall and save/load preserved`);
    await page.close();
  }
}finally{await browser.close();}
