import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/weather-temperature';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    const initial=await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);
      window.startV39DisasterTest();await window.waitForV39MapRenderSettled();
      const warm=window.inspectV39WeatherAt(16,16);
      let map=window.generateV39TestFieldWithSeed({w:100,h:100,patternId:'realistic'},'weather-snow-temperature');
      await window.waitForV39MapRenderSettled();
      // Some island seeds have only sea in the north snow band. Add a saved-map snow probe.
      if(!map.grid.some(row=>row.includes('雪原'))){
        map.grid[2][6]='雪原';map.climateProfile=null;
        window.loadV39FieldSnapshot(map,window.__v39FieldRuntime.settings);
        await window.waitForV39MapRenderSettled();map=window.__v39FieldRuntime.mapData;
      }
      const snow=[];
      for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++)if(map.grid[y][x]==='雪原')snow.push(window.inspectV39WeatherAt(x,y));
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],c=scene.cameras.main;
      const zoom=Math.min((c.width-50)/(map.w*62+62),c.height/(map.h*56+74));
      c.setZoom(zoom);scene.v39RequestedZoom=zoom;c.centerOn(map.w*31-25/zoom,map.h*28);
      window.updateV39ActiveFactionState({villagePlacementMode:false});
      window.activateV39FooterTab('squad');
      return {warm,snow:snow.map(r=>({temperature:r.temperature,base:r.climateTemperature})),version:map.climateProfile.version};
    });
    assert(initial.warm.temperature<=0,'forced blizzard must not retain warm temperature');
    assert.equal(initial.version,3);assert(initial.snow.length>0);
    assert(initial.snow.every(r=>r.temperature<=0&&r.base<=-3),'generated snow region must stay cold');
    await page.waitForFunction(()=>window.getV39WeatherOverlayStatus?.().regionCount===81);
    await page.waitForTimeout(2400);
    const labels=await page.evaluate(()=>{
      const scene=window.__v39FieldRuntime.game.scene.getScenes(true)[0],camera=scene.cameras.main,zoom=camera.zoom;
      const left=camera.scrollX+camera.width/2*(1-1/zoom);
      return scene.children.list.find(n=>n.name==='v39-weather-overlay-labels').list.filter(n=>n.visible).map(n=>{
        const bounds=n.getBounds();return {text:n.text,pixels:32*n.scaleX*zoom,left:(bounds.left-left)*zoom,right:(bounds.right-left)*zoom};
      });
    });
    assert.equal(labels.length,81,`missing temperatures: ${labels.length}`);
    assert(labels.every(n=>/^-?\d+℃$/.test(n.text)&&n.pixels>=11));
    assert(labels.every(n=>n.left>=1&&n.right<=width-1),'temperature label clipped by viewport');
    await page.screenshot({path:`${out}/overview-${width}.png`});
    const migrated=await page.evaluate(async()=>{
      const save=JSON.parse(window.exportV39SaveJson());
      save.field.mapData.climateProfile.version=1;save.field.mapData.climateProfile.id='legacy-warm-snow';
      save.gameState.worldEnvironment.weather.profileId='legacy-warm-snow';
      for(const row of Object.values(save.gameState.worldEnvironment.weather.regions))row.temperature=23;
      window.importV39SaveJson(JSON.stringify(save));await window.waitForV39MapRenderSettled();
      const map=window.__v39FieldRuntime.mapData,weather=window.getV39GameState().worldEnvironment.weather;
      const cold=Object.values(map.climateProfile.regions).filter(r=>r.snowRegion);
      return {version:map.climateProfile.version,same:map.climateProfile.id===weather.profileId,
        temperatures:cold.map(r=>weather.regions[r.id].temperature)};
    });
    assert.equal(migrated.version,3);assert(migrated.same&&migrated.temperatures.every(t=>t<=0));
    assert.deepEqual(errors,[]);
    console.log(`${width}: generated snow climate, forced blizzard, legacy save migration and 100x100 readable sticky temperature map passed (${labels.length} labels)`);
    await page.close();
  }
}finally{await browser.close();}
