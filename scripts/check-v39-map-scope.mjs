import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/map-scope';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto(process.env.V39_TEST_URL||'http://127.0.0.1:3024',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{
      window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();
      window.addEventListener('v39:lobby-game-settings-saved',e=>window.__scopeSetup=e.detail.gameSetup);
      window.openFieldSettingsModal({lobbyGameSettingsMode:true,lobbyGameSetup:{mapScope:'region',patternId:'archipelago',mapSize:'48x48',climateSettings:{zone:'temperate',baseTemperature:18,humidity:55}}});
    });
    await page.locator('#v39-field-scope').selectOption('world');
    assert(await page.locator('#v39-field-climate-temperature').isDisabled());
    await page.locator('#v39-field-scope').selectOption('region');
    await page.locator('#v39-field-climate-zone').selectOption('arid');
    assert.equal(await page.locator('#v39-field-climate-temperature').inputValue(),'30');
    assert.equal(await page.locator('#v39-field-climate-humidity').inputValue(),'20');
    await page.locator('#v39-field-scope').selectOption('island');
    assert.equal(await page.locator('#v39-field-pattern').inputValue(),'realistic');
    assert.equal(await page.locator('#v39-field-pattern option:disabled').count(),4);
    assert(await page.locator('#v39-field-wrap').isDisabled());
    await page.locator('#v39-field-climate-zone').selectOption('temperate');
    await page.locator('#v39-field-climate-temperature').fill('22');
    await page.locator('#v39-field-climate-humidity').fill('65');
    await page.screenshot({path:`${out}/settings-${width}.png`});
    await page.locator('#v39-field-generate').click();
    const setup=await page.evaluate(()=>window.__scopeSetup);
    assert.equal(setup.mapScope,'island');assert.deepEqual(setup.climateSettings,{zone:'temperate',baseTemperature:22,humidity:65});
    const runtime=await page.evaluate(async setup=>{
      const map=window.generateV39TestFieldWithSeed({...setup,w:48,h:48},'scope-native');await window.waitForV39MapRenderSettled();
      const before={scope:map.mapScope,climate:map.climateSettings,id:map.climateProfile.id,settings:window.__v39FieldRuntime.settings};
      window.importV39SaveJson(window.exportV39SaveJson());await window.waitForV39MapRenderSettled();
      const after=window.__v39FieldRuntime.mapData;
      window.openFieldSettingsModal({playMode:'single-test'});
      return {before,after:{scope:after.mapScope,climate:after.climateSettings,id:after.climateProfile.id},ui:document.getElementById('v39-field-scope').value};
    },setup);
    assert.equal(runtime.before.scope,'island');assert.deepEqual(runtime.after.climate,setup.climateSettings);
    assert.equal(runtime.after.id,runtime.before.id);assert.equal(runtime.ui,'island');
    assert.equal(runtime.before.settings.islandCustomSettings.worldWrapEnabled,false);
    if(!process.env.V39_TEST_URL){
      const pure=await page.evaluate(async()=>{
        const {createTerrainMapData:generate}=await import('/src/lib/map-generator.js');
        const {createV39ClimateProfile:climate,ensureV39ClimateProfile:ensure}=await import('/src/lib/v39-weather.js');
        const {runWithSeededRandom:seed}=await import('/src/lib/seeded-random.js');
        const {getHexOffsetNeighbors:neighbors}=await import('/src/lib/hex-grid.js');
        const count=map=>{const seen=new Set();let n=0;for(let y=0;y<map.h;y++)for(let x=0;x<map.w;x++){
          if(map.grid[y][x]==='海'||seen.has(`${x},${y}`))continue;n++;const queue=[{x,y}];seen.add(`${x},${y}`);
          for(let i=0;i<queue.length;i++)for(const p of neighbors(queue[i].x,queue[i].y)){
            const key=`${p.x},${p.y}`;if(!map.grid[p.y]?.[p.x]||map.grid[p.y][p.x]==='海'||seen.has(key))continue;seen.add(key);queue.push(p);
          }
        }return n;};
        const rows=[];
        for(const zone of ['temperate','arid','polar']){
          const map=seed(`scope-${zone}`,()=>generate({w:48,h:48,patternId:'twins',mapScope:'island',climateSettings:{zone}}));
          const regions=Object.values(map.climateProfile.regions),id=map.climateProfile.id;
          rows.push({zone,islands:count(map),snow:map.grid.flat().filter(t=>t==='雪原').length,desert:map.grid.flat().filter(t=>t==='砂漠').length,
            temperatures:regions.map(r=>r.temperature),stable:ensure(map).id===id});
        }
        const flat={w:60,h:60,grid:Array.from({length:60},()=>Array(60).fill('平地')),heightLevelMap:Array.from({length:60},()=>Array(60).fill(0))};
        const spread=scope=>{
          const p=climate({...flat,mapScope:scope,climateSettings:{zone:'temperate',baseTemperature:18,humidity:55}}),r=Object.values(p.regions);
          const north=r.filter(t=>t.y===0).map(t=>t.temperature),middle=r.filter(t=>t.y===24).map(t=>t.temperature);
          return {north:north.reduce((a,b)=>a+b,0)/north.length,middle:middle.reduce((a,b)=>a+b,0)/middle.length};
        };
        return {rows,world:spread('world'),region:spread('region')};
      });
      assert(pure.rows.every(r=>r.islands===1&&r.stable));
      assert(pure.rows.find(r=>r.zone==='polar').snow>0);assert(pure.rows.find(r=>r.zone==='arid').desert>0);
      assert.equal(pure.rows.find(r=>r.zone==='temperate').snow,0);
      assert(pure.world.middle-pure.world.north>20);assert(Math.abs(pure.region.middle-pure.region.north)<8);
      writeFileSync(`${out}/report-${width}.json`,JSON.stringify(pure,null,2));
    }
    assert.deepEqual(errors,[]);
    console.log(`${width}: scope/zone UI, custom climate, lobby setup, native generation/save, island constraints and latitude rules passed`);
    await page.close();
  }
}finally{await browser.close();}
