import assert from 'node:assert/strict';
import {chromium} from 'file:///C:/Users/skkt3/.codex/skills/develop-web-game/node_modules/playwright/index.mjs';
const browser=await chromium.launch();
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:3024',{waitUntil:'networkidle'});
 const report=await page.evaluate(async()=>{
  const {v39EnemyClimateWeight:weight,createV39EnemyClimateLookup:lookup}=await import('/src/lib/v39-enemy-climate.js');
  const {enemySpawnData}=await import('/src/lib/game-data-registry.js');
  const beetle=enemySpawnData.find(row=>row.種族==='ビートル');
  const frost=enemySpawnData.find(row=>row.サブクラス==='フロストアニマル');
  const cases=[weight(beetle,{climateTemperature:-10,weather:'雪'}),weight(beetle,{climateTemperature:5,weather:'晴れ'}),
   weight(beetle,{climateTemperature:45,weather:'晴れ'}),weight(beetle,{climateTemperature:46}),
   weight(beetle,{climateTemperature:20,weather:'雨'}),weight(frost,{climateTemperature:-10,weather:'雪'}),
   weight({}, {climateTemperature:-20}),weight(beetle,null),weight({'最低気温':0},{climateTemperature:-1})];
  window.closeV39PlayModeSelection();await window.setV39TestMode(true);window.startV39ExpeditionTest();await window.waitForV39MapRenderSettled();
  const map=window.__v39FieldRuntime.mapData;
  const {ensureV39ClimateProfile}=await import('/src/lib/v39-weather.js');
  map.grid=Array.from({length:map.h},()=>Array(map.w).fill('平地'));map.specialMap=[];map.reliefMap=[];
  map.heightLevelMap=Array.from({length:map.h},()=>Array(map.w).fill(0));map.strongMonsterMap=[];map.strongMonsterInfoMap=[];
  map.riverData=null;map.lavaMap=[];map.climateProfile=null;
  const profile=ensureV39ClimateProfile(map);for(const region of Object.values(profile.regions))region.temperature=-10;
  window.setV39GameState({enemies:[],enemyNests:[],enemySquads:[],victoryLandmarksByTile:{}});
  const cold=window.spawnV39Enemies();
  if(!cold.length)throw new Error('cold fixture must still spawn eligible wildlife');
  const coldAllowed=cold.every(unit=>{
   const row=enemySpawnData.find(row=>row.ID===unit.sourceDefinitionId);return !row||weight(row,{climateTemperature:-10})>0;
  });
  const underground=lookup({...map,isUnderground:true},null)(1,1);
  return {cases,coldAllowed,coldCount:cold.length,coldBeetles:cold.filter(u=>u.race==='ビートル').length,underground,
   emptyTemp:weight({'最低気温':''},{climateTemperature:-20})};
 });
 assert.deepEqual(report.cases,[0,1,1,0,2,2,1,1,0]);assert.equal(report.emptyTemp,1);
 assert(report.coldAllowed);assert.equal(report.coldBeetles,0);assert.equal(report.underground,null);assert.deepEqual(errors,[]);
 console.log(`Climate boundaries, 2x weather weighting, unconfigured/underground compatibility and ${report.coldCount} real cold-region spawns passed`);
}finally{await browser.close();}
