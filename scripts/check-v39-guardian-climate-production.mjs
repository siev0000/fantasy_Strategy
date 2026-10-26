import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const config={landmarks:Object.fromEntries(JSON.parse(readFileSync('data/source/export/json/勝利対象土地.json','utf8')).map(row=>[row.ID,row.守護者候補]))};
mkdirSync('output/web-game/guardian-climate-production',{recursive:true});
const browser=await chromium.launch();
try{
 for(const width of [390,1100]){
  const page=await browser.newPage({viewport:{width,height:850}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:3000',{waitUntil:'networkidle'});
  const report=await page.evaluate(async config=>{
   window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
   const map=window.__v39FieldRuntime.mapData;
   map.grid=Array.from({length:map.h},()=>Array(map.w).fill('平地'));map.specialMap=[];map.reliefMap=[];
   map.heightLevelMap=Array.from({length:map.h},()=>Array(map.w).fill(0));map.strongMonsterMap=[];map.strongMonsterInfoMap=[];map.riverData=null;map.lavaMap=[];map.climateProfile=null;
   window.inspectV39WeatherAt(0,0);for(const region of Object.values(map.climateProfile.regions))region.temperature=-10;
   window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{}});
   const cold=window.spawnV39Enemies();
   const insectNames=['ビートル','カマキリ','ハチ','アリ','サソリ','ムカデ','クワガタ','クモ'];
   const coldBugs=cold.filter(u=>insectNames.includes(u.race)).length;
   const terrains=['山岳','森','火山','海'];
   const landmarks=Object.keys(config.landmarks).map((landmarkId,i)=>({id:`production-${i}`,landmarkId,name:landmarkId.split(':')[1],
    x:3+i*3,y:9,key:`${3+i*3},9`,terrain:terrains[i]}));
   window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:Object.fromEntries(landmarks.map(row=>[row.key,row]))});
   const result=window.spawnV39VictoryLandmarkGuards();
   const before=Object.values(result.state.explorationWorlds||{}).filter(world=>world.map.guardianInitialized).flatMap(world=>world.spatial.enemies).map(u=>[u.id,u.race,u.className,u.level,u.guardianSpeciesName||'']);
   window.importV39SaveJson(window.exportV39SaveJson());
   const after=Object.values(window.getV39GameState().explorationWorlds||{}).filter(world=>world.map.guardianInitialized).flatMap(world=>world.spatial.enemies).map(u=>[u.id,u.race,u.className,u.level,u.guardianSpeciesName||'']);
   await window.waitForV39MapRenderSettled();
   return {coldCount:cold.length,coldBugs,before,after,reports:result.reports.length,landmarks};
  },config);
  assert(report.coldCount>0);assert.equal(report.coldBugs,0);assert.equal(report.reports,4);assert.deepEqual(report.after,report.before);
  const bosses=report.before.filter(row=>row[4]),minions=report.before.filter(row=>!row[4]);
  assert.equal(bosses.length,4);assert.equal(minions.length,8);
  for(const row of minions){assert(row[3]>=15&&row[3]<=20);assert(Object.values(config.minionCandidates).flat().some(rule=>rule.race===row[1]&&rule.className===row[2]));}
  await page.screenshot({path:`output/web-game/guardian-climate-production/field-${width}.png`});
  assert.deepEqual(errors,[]);console.log(`${width}: production cold-region exclusion, themed 8 minions, four guardians, save/load and rendering passed`);
  await page.close();
 }
}finally{await browser.close();}
