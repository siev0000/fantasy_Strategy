import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const out='output/web-game/weather';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();
try{
  for(const width of [320,390,1100]){
    const page=await browser.newPage({viewport:{width,height:844}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e.stack)));
    await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
    const pure=await page.evaluate(async()=>{
      const m=await import('/src/lib/v39-weather.js'),{resolveV39DisasterRule:rule}=await import('/src/lib/v39-disaster-rules.js');
      const map={w:24,h:24,grid:Array.from({length:24},(_,y)=>Array.from({length:24},(_,x)=>y<12?(x<12?'森':'砂漠'):(x<12?'雪原':'湖'))),heightLevelMap:Array.from({length:24},(_,y)=>Array(24).fill(y<12?0:4))};
      const profile=m.createV39ClimateProfile(map),first=m.advanceV39Weather(profile,null,1);
      let stepped=first;for(let t=2;t<=30;t++)stepped=m.advanceV39Weather(profile,stepped,t);
      const batch=m.advanceV39Weather(profile,first,30);
      const overridden=m.setV39WeatherAt(map,first,1,3,3,'雷雨');
      const id='0,0',base=first.regions[id],dry={...first,regions:{...first.regions,[id]:{...base,weather:'晴れ',weatherStartedTurn:1,weatherUntilTurn:100,humidity:20,dryness:80,dryTurns:1,wetTurns:0}}};
      const dry2=m.advanceV39Weather(profile,dry,2),point={x:3,y:3};map.climateProfile=profile;
      const gate=(name,weather)=>m.resolveV39DisasterWeather(rule(`災害:${name}`),map,weather,point).allowed;
      const thunder={...dry2,regions:{...dry2.regions,[id]:{...dry2.regions[id],weather:'雷雨',weatherStartedTurn:1,weatherUntilTurn:100,wetTurns:2,humidity:90}}};
      const big={w:100,h:100,grid:Array.from({length:100},()=>Array(100).fill('平地'))};
      const start=performance.now(),large=m.createV39ClimateProfile(big),ms=performance.now()-start;
      const ocean=m.createV39ClimateProfile({w:12,h:12,grid:Array.from({length:12},()=>Array(12).fill('海')),heightLevelMap:Array.from({length:12},()=>Array(12).fill(-7))});
      return {profile,oceanTemperature:ocean.regions['0,0'].temperature,isolated:JSON.stringify(overridden.regions['1,0'])===JSON.stringify(first.regions['1,0']),
        changed:overridden.regions['0,0'].weather==='雷雨',invalid:m.setV39WeatherAt(map,first,1,-1,3,'雷雨'),
        stable:JSON.stringify(profile)===JSON.stringify(m.createV39ClimateProfile(map)),same:JSON.stringify(stepped)===JSON.stringify(batch),
        repeat:m.advanceV39Weather(profile,batch,30)===batch,initialUnchanged:first.lastTurn===1,
        cave:m.createV39ClimateProfile({...map,isUnderground:true}),
        dryBefore:gate('山火事',dry),dryAfter:gate('山火事',dry2),thunderBefore:gate('落雷嵐',dry2),thunderAfter:gate('落雷嵐',thunder),
        flood:gate('洪水',thunder),social:gate('反乱',thunder),earthquake:gate('地震',dry2),unknown:m.resolveV39DisasterWeather({occurrenceCondition:'unknown'},map,thunder,point).allowed,
        largeRegions:Object.keys(large.regions).length,ms};
    });
    assert.equal(Object.keys(pure.profile.regions).length,4);assert(pure.profile.regions['0,0'].humidity>pure.profile.regions['1,0'].humidity);
    assert(pure.profile.regions['0,1'].temperature<pure.profile.regions['0,0'].temperature);
    for(const key of ['isolated','changed','stable','same','repeat','initialUnchanged','dryAfter','thunderAfter','flood','earthquake'])assert(pure[key],key);
    assert.equal(pure.invalid,null);
    for(const key of ['dryBefore','thunderBefore','social','unknown'])assert.equal(pure[key],false,key);
    assert.equal(pure.cave,null);assert.equal(pure.largeRegions,81);
    assert(pure.oceanTemperature<=31,'sea depth must not heat the air');
    await page.evaluate(async()=>{window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39DisasterTest();await window.waitForV39MapRenderSettled();});
    await page.waitForFunction(()=>!window.isV39MapInputLocked());
    await page.evaluate(()=>{window.activateV39FooterTab('test');window.dispatchEvent(new CustomEvent('v39:tile-selected',{detail:{x:4,y:4}}));});
    await page.locator('[data-test-tab="environment"]').click();
    await page.locator('[data-test-section="field"]').evaluate(n=>n.open=true);
    await page.locator('#v39-test-weather-type').selectOption('雷雨');
    await page.locator('[data-test-action="weather-change"]').click();
    assert((await page.locator('[data-weather-test-info]').innerText()).includes('雷雨'));
    await page.screenshot({path:`${out}/controls-${width}.png`});
    const runtime=await page.evaluate(async()=>{
      const saved=window.exportV39SaveJson(),before=window.getV39GameState().worldEnvironment.weather;
      window.importV39SaveJson(saved);
      const same=JSON.stringify(before)===JSON.stringify(window.getV39GameState().worldEnvironment.weather);
      const {disasterData}=await import('/src/lib/game-data-registry.js'),{runV39NaturalEvents:tick}=await import('/src/v39/world/v39-natural-events.js');
      const backup=disasterData.map(row=>({...row})),results=[];
      try{
        for(const row of disasterData)row.基本発生率=0;
        for(const [turn,name,weather,expected] of [[2,'山火事','晴れ',true],[3,'山火事','雨',false],[4,'落雷嵐','雷雨',true],[5,'反乱','雷雨',false]]){
          const row=disasterData.find(row=>row.カテゴリ名===name);row.基本発生率=1;
          const s=window.getV39GameState(),w=s.worldEnvironment.weather;
          const regions=Object.fromEntries(Object.entries(w.regions).map(([id,r])=>[id,{...r,weather,weatherStartedTurn:1,weatherUntilTurn:100,humidity:weather==='晴れ'?20:90,dryness:weather==='晴れ'?80:20,dryTurns:weather==='晴れ'?4:0,wetTurns:weather==='晴れ'?0:3}]));
          window.setV39GameState({timeline:{...s.timeline,turnNumber:turn},worldEnvironment:{...s.worldEnvironment,weather:{...w,lastTurn:turn-1,regions},activeDisasters:[],lastDisasterEvents:[],lastNaturalEventTurn:turn-1}});
          const result=tick({turnNumber:turn});results.push({name,weather,expected,created:result.disasters.map(e=>e.name),weather:window.getV39GameState().worldEnvironment.weather.lastTurn});
          row.基本発生率=0;
        }
        const forced=window.forceV39Disaster('災害:落雷嵐',{x:4,y:4});
        const weatherNow=window.getV39GameState().worldEnvironment.weather;
        const repeated=tick({turnNumber:5,force:true,skipNaturalDisasters:true});
        return {same,results,forced:forced.ok,repeatedWeather:JSON.stringify(weatherNow)===JSON.stringify(window.getV39GameState().worldEnvironment.weather),
          profile:!!window.__v39FieldRuntime.mapData.climateProfile};
      }finally{for(let i=0;i<disasterData.length;i++)Object.assign(disasterData[i],backup[i]);}
    });
    assert(runtime.same&&runtime.profile&&runtime.forced&&runtime.repeatedWeather);
    for(const result of runtime.results)assert.equal(result.created.includes(result.name),result.expected,JSON.stringify(result));
    if(width===1100){
      const worlds=await page.evaluate(async()=>{
        const before=window.getV39GameState().worldEnvironment.weather.lastTurn;
        const switched=window.viewV39ExpeditionTestWorld('cave:expedition-test:1');
        await window.waitForV39MapRenderSettled();
        const cave=window.inspectV39WeatherAt(4,4),advanced=await window.advanceV39Turn({skipUnactedFocus:true});
        const underground=window.getV39GameState().worldEnvironment.weather;
        window.viewV39ExpeditionTestWorld('surface');await window.waitForV39MapRenderSettled();
        return {before,switched,cave,advanced,underground,after:window.getV39GameState().worldEnvironment.weather.lastTurn};
      });
      assert(worlds.switched&&worlds.advanced);assert.equal(worlds.cave,null);assert.equal(worlds.underground,null);assert.equal(worlds.after,worlds.before+1);
    }
    const blocked=await page.evaluate(async()=>{
      await window.setV39TestMode(false);
      const before=JSON.stringify(window.getV39GameState().worldEnvironment.weather);
      const changed=window.setV39TestWeatherAt(4,4,'雷雨');
      return !changed&&before===JSON.stringify(window.getV39GameState().worldEnvironment.weather);
    });
    assert(blocked);assert.deepEqual(errors,[]);writeFileSync(`${out}/report-${width}.json`,JSON.stringify({pure,runtime},null,2));
    console.log(`${width}: climate, deterministic weather/streaks, weather-gated hazards, social exclusion, UI override/save and 100x100 ${pure.ms.toFixed(1)}ms passed`);
    await page.close();
  }
}finally{await browser.close();}
